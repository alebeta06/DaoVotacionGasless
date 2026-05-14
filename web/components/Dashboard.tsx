"use client";

import { useWallet } from "@/lib/WalletContext";
import { env } from "@/lib/env";

import { ConnectWallet } from "./ConnectWallet";
import { CreateProposal } from "./CreateProposal";
import { DaoStats } from "./DaoStats";
import { ExecutionPanel } from "./ExecutionPanel";
import { FundingPanel } from "./FundingPanel";
import { ProposalList } from "./ProposalList";

export function Dashboard() {
    const { status } = useWallet();
    const contractsConfigured = env.daoAddress && env.forwarderAddress;

    if (!contractsConfigured) {
        return (
            <div className="max-w-xl rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
                <p className="font-semibold mb-1">Configuración pendiente</p>
                <p className="text-zinc-600 dark:text-zinc-400">
                    Despliega los contratos con <code className="font-mono">sc/script/Deploy.s.sol</code> y rellena
                    <code className="font-mono"> web/.env.local</code>.
                </p>
            </div>
        );
    }

    if (status !== "connected" && status !== "wrong-chain") {
        return <ConnectWallet />;
    }

    return (
        <div className="flex flex-col gap-5 w-full max-w-2xl">
            <ConnectWallet />
            {status === "connected" && (
                <>
                    <DaoStats />
                    <div className="grid sm:grid-cols-2 gap-4">
                        <FundingPanel />
                        <CreateProposal />
                    </div>
                    <ProposalList />
                    <ExecutionPanel />
                </>
            )}
        </div>
    );
}
