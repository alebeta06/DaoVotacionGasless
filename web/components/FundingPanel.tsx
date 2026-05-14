"use client";

import { useState } from "react";
import { parseEther } from "ethers";

import { useDao } from "@/lib/useDao";
import { useWallet } from "@/lib/WalletContext";

type TxStatus = "idle" | "signing" | "pending" | "success" | "error";

export function FundingPanel() {
    const dao = useDao();
    const { bumpRefresh } = useWallet();
    const [amount, setAmount] = useState("1");
    const [status, setStatus] = useState<TxStatus>("idle");
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function deposit() {
        if (!dao) return;
        setError(null);
        setTxHash(null);

        let valueWei: bigint;
        try {
            valueWei = parseEther(amount);
        } catch {
            setError("Cantidad inválida");
            setStatus("error");
            return;
        }
        if (valueWei === 0n) {
            setError("La cantidad debe ser > 0");
            setStatus("error");
            return;
        }

        try {
            setStatus("signing");
            const tx = await dao.fundDAO({ value: valueWei });
            setTxHash(tx.hash);
            setStatus("pending");
            await tx.wait();
            setStatus("success");
            bumpRefresh();
        } catch (err) {
            setError(prettifyError(err));
            setStatus("error");
        }
    }

    const busy = status === "signing" || status === "pending";

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-black/10 dark:border-white/15 p-4">
            <header className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold">Depositar ETH al DAO</h2>
                <p className="text-xs text-zinc-500">Tu balance aumenta y desbloquea poder de voto y propuesta.</p>
            </header>
            <div className="flex gap-2">
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                    className="flex-1 rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 font-mono text-sm disabled:opacity-50"
                />
                <button
                    type="button"
                    onClick={deposit}
                    disabled={busy || !dao}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                    {status === "signing" && "Firmando…"}
                    {status === "pending" && "Confirmando…"}
                    {status === "success" && "✓ Depositado"}
                    {(status === "idle" || status === "error") && "Depositar"}
                </button>
            </div>
            {txHash && <p className="text-xs font-mono text-zinc-500">tx: {txHash.slice(0, 14)}…</p>}
            {error && <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>}
        </div>
    );
}

function prettifyError(err: unknown): string {
    if (err instanceof Error) {
        if (err.message.includes("user rejected")) return "Firma cancelada en la wallet";
        return err.message.length > 200 ? `${err.message.slice(0, 200)}…` : err.message;
    }
    return "Error desconocido";
}
