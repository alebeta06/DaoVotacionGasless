"use client";

import { useCallback, useEffect, useState } from "react";

import { env } from "@/lib/env";
import { getInjectedProvider, requestAccounts, switchChain } from "@/lib/wallet";

type Status = "idle" | "connecting" | "connected" | "wrong-chain" | "error";

export function ConnectWallet() {
    const [status, setStatus] = useState<Status>("idle");
    const [address, setAddress] = useState<string | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refreshChain = useCallback(async () => {
        const provider = getInjectedProvider();
        if (!provider) return;
        const hex = (await provider.request({ method: "eth_chainId" })) as string;
        setChainId(Number.parseInt(hex, 16));
    }, []);

    const connect = useCallback(async () => {
        setError(null);
        setStatus("connecting");
        try {
            const accounts = await requestAccounts();
            if (accounts.length === 0) throw new Error("No accounts returned");
            setAddress(accounts[0]);
            await refreshChain();
            setStatus("connected");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to connect");
            setStatus("error");
        }
    }, [refreshChain]);

    const requestSwitch = useCallback(async () => {
        try {
            await switchChain(env.chainId);
            await refreshChain();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to switch chain");
        }
    }, [refreshChain]);

    useEffect(() => {
        const provider = getInjectedProvider();
        if (!provider) return;

        const onAccountsChanged = (...args: unknown[]) => {
            const accounts = args[0] as string[];
            setAddress(accounts[0] ?? null);
            if (!accounts[0]) setStatus("idle");
        };

        const onChainChanged = (...args: unknown[]) => {
            setChainId(Number.parseInt(args[0] as string, 16));
        };

        provider.on?.("accountsChanged", onAccountsChanged);
        provider.on?.("chainChanged", onChainChanged);

        return () => {
            provider.removeListener?.("accountsChanged", onAccountsChanged);
            provider.removeListener?.("chainChanged", onChainChanged);
        };
    }, []);

    useEffect(() => {
        if (status === "connected" && chainId !== null && chainId !== env.chainId) {
            setStatus("wrong-chain");
        } else if (status === "wrong-chain" && chainId === env.chainId) {
            setStatus("connected");
        }
    }, [chainId, status]);

    if (status === "idle" || status === "connecting" || status === "error") {
        return (
            <div className="flex flex-col gap-3 items-start">
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
        <div className="flex flex-col gap-2 rounded-2xl border border-black/10 dark:border-white/15 p-4 text-sm">
            <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-mono">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                chainId: <span className="font-mono">{chainId}</span>
                {" · esperado: "}
                <span className="font-mono">{env.chainId}</span>
            </div>
            {status === "wrong-chain" && (
                <button
                    type="button"
                    onClick={requestSwitch}
                    className="self-start mt-1 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-medium text-black hover:opacity-90"
                >
                    Cambiar a la red correcta
                </button>
            )}
        </div>
    );
}
