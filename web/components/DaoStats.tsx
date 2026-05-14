"use client";

import { useEffect, useState } from "react";
import { formatEther } from "ethers";

import { useReadDao } from "@/lib/useReadDao";
import { useWallet } from "@/lib/WalletContext";

export function DaoStats() {
    const dao = useReadDao();
    const { address, refreshVersion } = useWallet();
    const [total, setTotal] = useState<bigint | null>(null);
    const [mine, setMine] = useState<bigint | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!dao || !address) return;
        let cancelled = false;
        setError(null);
        (async () => {
            try {
                const [t, m] = await Promise.all([dao.totalDeposits(), dao.balanceOf(address)]);
                if (!cancelled) {
                    setTotal(t as bigint);
                    setMine(m as bigint);
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to read DAO state");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dao, address, refreshVersion]);

    if (error) {
        return <p className="text-sm text-red-600 dark:text-red-400">DAO error: {error}</p>;
    }

    if (total === null || mine === null) {
        return <div className="text-sm text-zinc-500">Cargando stats del DAO…</div>;
    }

    const percent = total === 0n ? 0 : Number((mine * 10_000n) / total) / 100;
    const canPropose = percent >= 10;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border border-black/10 dark:border-white/15 p-4 text-sm">
            <Stat label="Total DAO" value={`${formatEther(total)} ETH`} />
            <Stat label="Tu balance" value={`${formatEther(mine)} ETH`} />
            <Stat
                label="Tu % del DAO"
                value={`${percent.toFixed(2)}%`}
                hint={canPropose ? "✓ Puedes proponer" : "Necesitas ≥ 10% para proponer"}
                tone={canPropose ? "good" : "muted"}
            />
        </div>
    );
}

function Stat({
    label,
    value,
    hint,
    tone,
}: {
    label: string;
    value: string;
    hint?: string;
    tone?: "good" | "muted";
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-zinc-500">{label}</span>
            <span className="font-mono">{value}</span>
            {hint && (
                <span className={`text-xs ${tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}>
                    {hint}
                </span>
            )}
        </div>
    );
}
