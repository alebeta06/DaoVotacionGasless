import { type Contract, type JsonRpcSigner, type TypedDataField } from "ethers";

import { env } from "./env";

export type ForwardRequest = {
    from: string;
    to: string;
    value: bigint;
    gas: bigint;
    nonce: bigint;
    data: string;
};

const FORWARD_REQUEST_TYPES: Record<string, TypedDataField[]> = {
    ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "data", type: "bytes" },
    ],
};

export function getEip712Domain() {
    return {
        name: "MinimalForwarder",
        version: "1",
        chainId: env.chainId,
        verifyingContract: env.forwarderAddress,
    };
}

export async function buildForwardRequest(
    forwarder: Contract,
    from: string,
    to: string,
    data: string,
    gas: bigint = 300_000n,
): Promise<ForwardRequest> {
    const nonce = (await forwarder.getNonce(from)) as bigint;
    return { from, to, value: 0n, gas, nonce, data };
}

export async function signForwardRequest(signer: JsonRpcSigner, request: ForwardRequest): Promise<string> {
    return signer.signTypedData(getEip712Domain(), FORWARD_REQUEST_TYPES, request as unknown as Record<string, unknown>);
}

export async function postToRelayer(request: ForwardRequest, signature: string): Promise<{ txHash: string }> {
    const body = {
        request: {
            from: request.from,
            to: request.to,
            value: request.value.toString(),
            gas: request.gas.toString(),
            nonce: request.nonce.toString(),
            data: request.data,
        },
        signature,
    };
    const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Relay failed" }))) as { error?: string };
        throw new Error(err.error ?? "Relay failed");
    }
    return res.json();
}
