import { NextResponse } from "next/server";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

import MinimalForwarderAbi from "@/lib/abis/MinimalForwarder.json";

type IncomingRequest = {
    request: {
        from: string;
        to: string;
        value: string;
        gas: string;
        nonce: string;
        data: string;
    };
    signature: string;
};

export async function POST(req: Request) {
    const rpcUrl = process.env.RPC_URL;
    const pk = process.env.RELAYER_PRIVATE_KEY;
    const forwarderAddress = process.env.NEXT_PUBLIC_FORWARDER_ADDRESS;

    if (!rpcUrl || !pk || !forwarderAddress) {
        return NextResponse.json(
            { error: "Relayer is not configured. Check RPC_URL, RELAYER_PRIVATE_KEY and NEXT_PUBLIC_FORWARDER_ADDRESS." },
            { status: 500 },
        );
    }

    let body: IncomingRequest;
    try {
        body = (await req.json()) as IncomingRequest;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const fwReq = {
        from: body.request.from,
        to: body.request.to,
        value: BigInt(body.request.value),
        gas: BigInt(body.request.gas),
        nonce: BigInt(body.request.nonce),
        data: body.request.data,
    };

    const provider = new JsonRpcProvider(rpcUrl);
    const relayer = new Wallet(pk, provider);
    const forwarder = new Contract(forwarderAddress, MinimalForwarderAbi, relayer);

    try {
        const valid = (await forwarder.verify(fwReq, body.signature)) as boolean;
        if (!valid) {
            return NextResponse.json({ error: "Invalid signature or stale nonce" }, { status: 400 });
        }

        const tx = await forwarder.execute(fwReq, body.signature, { gasLimit: fwReq.gas + 100_000n });
        const receipt = await tx.wait();

        return NextResponse.json({
            txHash: tx.hash,
            blockNumber: receipt?.blockNumber ?? null,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Relay failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
