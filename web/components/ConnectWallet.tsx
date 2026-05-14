"use client";

import { env } from "@/lib/env";
import { useWallet } from "@/lib/WalletContext";

export function ConnectWallet() {
    const { status, address, chainId, error, connect, switchChain } = useWallet();

    if (status === "idle" || status === "connecting" || status === "error") {
        return (
            <div className="flex flex-col gap-3 items-center">
                <button
                    type="button"
                    onClick={connect}
                    disabled={status === "connecting"}
                    className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
                >
                    {status === "connecting" ? "Conectando…" : "Conectar wallet"}
                </button>
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-3 self-end rounded-2xl border border-black/10 dark:border-white/15 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-mono">
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                chainId <span className="font-mono">{chainId}</span>
            </div>
            {status === "wrong-chain" && (
                <button
                    type="button"
                    onClick={switchChain}
                    className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:opacity-90"
                >
                    Cambiar a {env.chainId}
                </button>
            )}
        </div>
    );
}
