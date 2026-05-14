"use client";

import { useState } from "react";
import { isAddress, parseEther } from "ethers";

import { useDao } from "@/lib/useDao";
import { useWallet } from "@/lib/WalletContext";

type TxStatus = "idle" | "signing" | "pending" | "success" | "error";

export function CreateProposal() {
    const dao = useDao();
    const { bumpRefresh } = useWallet();
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("");
    const [deadline, setDeadline] = useState(defaultDeadline());
    const [status, setStatus] = useState<TxStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [createdId, setCreatedId] = useState<bigint | null>(null);

    async function submit() {
        if (!dao) return;
        setError(null);
        setCreatedId(null);

        if (!isAddress(recipient)) {
            setError("Dirección de beneficiario inválida");
            setStatus("error");
            return;
        }

        let amountWei: bigint;
        try {
            amountWei = parseEther(amount);
        } catch {
            setError("Cantidad inválida");
            setStatus("error");
            return;
        }
        if (amountWei === 0n) {
            setError("La cantidad debe ser > 0");
            setStatus("error");
            return;
        }

        const deadlineSec = Math.floor(new Date(deadline).getTime() / 1000);
        if (!Number.isFinite(deadlineSec) || deadlineSec <= Math.floor(Date.now() / 1000)) {
            setError("La deadline debe estar en el futuro");
            setStatus("error");
            return;
        }

        try {
            setStatus("signing");
            const tx = await dao.createProposal(recipient, amountWei, deadlineSec);
            setStatus("pending");
            const receipt = await tx.wait();
            for (const log of receipt?.logs ?? []) {
                try {
                    const parsed = dao.interface.parseLog(log);
                    if (parsed?.name === "ProposalCreated") {
                        setCreatedId(parsed.args[0] as bigint);
                        break;
                    }
                } catch {
                    // log no es de este contrato; ignorar
                }
            }
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
                <h2 className="text-sm font-semibold">Crear propuesta</h2>
                <p className="text-xs text-zinc-500">Requiere ≥ 10% del balance del DAO.</p>
            </header>

            <label className="flex flex-col gap-1 text-xs">
                Beneficiario
                <input
                    type="text"
                    placeholder="0x…"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 font-mono text-sm disabled:opacity-50"
                />
            </label>

            <label className="flex flex-col gap-1 text-xs">
                Cantidad (ETH)
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.5"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 font-mono text-sm disabled:opacity-50"
                />
            </label>

            <label className="flex flex-col gap-1 text-xs">
                Deadline
                <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    disabled={busy}
                    className="rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm disabled:opacity-50"
                />
            </label>

            <button
                type="button"
                onClick={submit}
                disabled={busy || !dao}
                className="self-start rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
                {status === "signing" && "Firmando…"}
                {status === "pending" && "Confirmando…"}
                {status === "success" && (createdId !== null ? `✓ Propuesta #${createdId}` : "✓ Creada")}
                {(status === "idle" || status === "error") && "Crear propuesta"}
            </button>

            {error && <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>}
        </div>
    );
}

function defaultDeadline(): string {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function prettifyError(err: unknown): string {
    if (err instanceof Error) {
        if (err.message.includes("user rejected")) return "Firma cancelada en la wallet";
        if (err.message.includes("InsufficientQuorumToPropose")) return "No tienes el 10% requerido para crear una propuesta";
        return err.message.length > 200 ? `${err.message.slice(0, 200)}…` : err.message;
    }
    return "Error desconocido";
}
