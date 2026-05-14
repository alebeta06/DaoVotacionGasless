import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

import DAOVotingAbi from "@/lib/abis/DAOVoting.json";

type ProposalResult =
    | { id: string; status: "executed"; txHash: string }
    | { id: string; status: "skipped"; reason: string }
    | { id: string; status: "error"; reason: string };

export async function GET() {
    const rpcUrl = process.env.RPC_URL;
    const pk = process.env.RELAYER_PRIVATE_KEY;
    const daoAddress = process.env.NEXT_PUBLIC_DAO_ADDRESS;

    if (!rpcUrl || !pk || !daoAddress) {
        return NextResponse.json(
            { error: "Daemon is not configured. Check RPC_URL, RELAYER_PRIVATE_KEY and NEXT_PUBLIC_DAO_ADDRESS." },
            { status: 500 },
        );
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const executor = new Wallet(pk, provider);
    const dao = new Contract(daoAddress, DAOVotingAbi, executor);

    try {
        const [nextIdRaw, securityDelayRaw, latestBlock] = await Promise.all([
            dao.nextProposalId() as Promise<bigint>,
            dao.SECURITY_DELAY() as Promise<bigint>,
            provider.getBlock("latest"),
        ]);

        if (!latestBlock) {
            return NextResponse.json({ error: "Could not read latest block" }, { status: 500 });
        }

        const now = BigInt(latestBlock.timestamp);
        const results: ProposalResult[] = [];

        for (let id = 1n; id < nextIdRaw; id = id + 1n) {
            const p = await dao.getProposal(id);
            const deadline = p.deadline as bigint;
            const forVotes = p.forVotes as bigint;
            const againstVotes = p.againstVotes as bigint;
            const executed = p.executed as boolean;

            if (executed) {
                results.push({ id: id.toString(), status: "skipped", reason: "ya ejecutada" });
                continue;
            }
            if (now < deadline + securityDelayRaw) {
                const remaining = Number(deadline + securityDelayRaw - now);
                results.push({ id: id.toString(), status: "skipped", reason: `falta delay (${remaining}s)` });
                continue;
            }
            if (forVotes <= againstVotes) {
                results.push({ id: id.toString(), status: "skipped", reason: "no aprobada (forVotes <= againstVotes)" });
                continue;
            }

            try {
                const tx = await dao.executeProposal(id);
                await tx.wait();
                results.push({ id: id.toString(), status: "executed", txHash: tx.hash });
            } catch (err) {
                results.push({
                    id: id.toString(),
                    status: "error",
                    reason: err instanceof Error ? err.message : "execution failed",
                });
            }
        }

        const executedCount = results.filter((r) => r.status === "executed").length;
        return NextResponse.json({
            scanned: results.length,
            executed: executedCount,
            results,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Daemon failed" },
            { status: 500 },
        );
    }
}
