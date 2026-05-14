"use client";

import { useState } from "react";

import { useWallet } from "@/lib/WalletContext";

type Status = "idle" | "running" | "success" | "error";

type Result =
    | { id: string; status: "executed"; txHash: string }
    | { id: string; status: "skipped"; reason: string }
    | { id: string; status: "error"; reason: string };

type Response = {
    scanned: number;
    executed: number;
    results: Result[];
};

export function ExecutionPanel() {
    const { bumpRefresh } = useWallet();
    const [status, setStatus] = useState<Status>("idle");
    const [response, setResponse] = useState<Response | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function run() {
        setError(null);
        setStatus("running");
        try {
            const res = await fetch("/api/cron/execute");
            const json = await res.json();
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Daemon failed");
            setResponse(json as Response);
            setStatus("success");
            bumpRefresh();
            setTimeout(() => setStatus((c) => (c === "success" ? "idle" : c)), 2500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Daemon failed");
            setStatus("error");
        }
    }

    const busy = status === "running";

    return (
        <section className="flex flex-col gap-3 rounded-2xl border border-black/10 dark:border-white/15 p-4">
            <header className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold">Daemon de ejecución</h2>
                <p className="text-xs text-zinc-500">
                    Escanea cada propuesta y ejecuta las que cumplen: deadline + delay vencidos, mayoría a favor y no
                    ejecutada todavía. Paga el relayer.
                </p>
            </header>

            <button
                type="button"
                onClick={run}
                disabled={busy}
                className="self-start min-w-30 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
                {status === "running" && "Escaneando…"}
                {status === "success" && (response ? `✓ ${response.executed} ejecutada(s)` : "✓ Listo")}
                {(status === "idle" || status === "error") && "Ejecutar propuestas elegibles"}
            </button>

            {error && <p className="text-xs text-red-600 dark:text-red-400 break-words">{error}</p>}

            {response && (
                <div className="flex flex-col gap-1 text-xs">
                    <p className="text-zinc-500">
                        Escaneadas: <span className="font-mono">{response.scanned}</span> · Ejecutadas:{" "}
                        <span className="font-mono">{response.executed}</span>
                    </p>
                    {response.results.length > 0 && (
                        <ul className="flex flex-col gap-1">
                            {response.results.map((r, i) => (
                                <li key={i} className="flex items-baseline gap-2 font-mono">
                                    <span className="text-zinc-400">#{r.id}</span>
                                    <ResultLine result={r} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}

function ResultLine({ result }: { result: Result }) {
    if (result.status === "executed") {
        return (
            <span className="text-emerald-600 dark:text-emerald-400">
                ejecutada · {result.txHash.slice(0, 14)}…
            </span>
        );
    }
    if (result.status === "skipped") {
        return <span className="text-zinc-500">saltada · {result.reason}</span>;
    }
    return <span className="text-red-600 dark:text-red-400">error · {result.reason}</span>;
}
