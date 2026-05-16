"use client";

import { useState } from "react";
import { Contract } from "ethers";

import MinimalForwarderAbi from "@/lib/abis/MinimalForwarder.json";
import { env } from "@/lib/env";
import { buildForwardRequest, postToRelayer, signForwardRequest } from "@/lib/metaTx";
import { useDao } from "@/lib/useDao";
import { useReadDao } from "@/lib/useReadDao";
import { useWallet } from "@/lib/WalletContext";

type Status = "idle" | "signing" | "relaying" | "success" | "error";

type VoteType = 0 | 1 | 2;

const OPTIONS: { type: VoteType; label: string; className: string }[] = [
    { type: 1, label: "A favor", className: "bg-emerald-600 text-white hover:bg-emerald-700" },
    { type: 0, label: "En contra", className: "bg-red-600 text-white hover:bg-red-700" },
    { type: 2, label: "Abstención", className: "bg-zinc-600 text-white hover:bg-zinc-700" },
];

export function VoteButtons({ proposalId }: { proposalId: bigint }) {
    const dao = useDao();
    const readDao = useReadDao();
    const { signer, address, bumpRefresh } = useWallet();
    const [status, setStatus] = useState<Status>("idle");
    const [active, setActive] = useState<VoteType | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function vote(voteType: VoteType) {
        if (!dao || !readDao || !signer || !address) return;
        setError(null);
        setActive(voteType);
        try {
            const balance = (await readDao.balanceOf(address)) as bigint;
            if (balance === 0n) {
                setError("Necesitas haber depositado ETH para votar");
                setStatus("error");
                return;
            }
            setStatus("signing");
            const forwarder = new Contract(env.forwarderAddress, MinimalForwarderAbi, signer);
            const data = dao.interface.encodeFunctionData("vote", [proposalId, voteType]);
            const request = await buildForwardRequest(forwarder, address, env.daoAddress, data);
            const signature = await signForwardRequest(signer, request);
            setStatus("relaying");
            await postToRelayer(request, signature);
            setStatus("success");
            bumpRefresh();
            setTimeout(() => {
                setStatus((c) => (c === "success" ? "idle" : c));
                setActive(null);
            }, 2500);
        } catch (err) {
            setError(prettifyError(err));
            setStatus("error");
        }
    }

    const busy = status === "signing" || status === "relaying";

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2 flex-wrap justify-center">
                {OPTIONS.map(({ type, label, className }) => {
                    const isActive = active === type;
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => vote(type)}
                            disabled={busy}
                            className={`min-w-24 shrink-0 rounded-lg ${className} px-3 py-1.5 text-xs font-medium disabled:opacity-50`}
                        >
                            {isActive && status === "signing" && "Firmando…"}
                            {isActive && status === "relaying" && "Enviando…"}
                            {isActive && status === "success" && "✓"}
                            {(!isActive || status === "idle" || status === "error") && label}
                        </button>
                    );
                })}
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>}
        </div>
    );
}

function prettifyError(err: unknown): string {
    if (err instanceof Error) {
        if (err.message.includes("user rejected")) return "Firma cancelada en la wallet";
        if (err.message.includes("VotingClosed")) return "La votación de esta propuesta ya cerró";
        if (err.message.includes("NoVotingPower")) return "Necesitas haber depositado ETH para votar";
        return err.message.length > 200 ? `${err.message.slice(0, 200)}…` : err.message;
    }
    return "Error desconocido";
}
