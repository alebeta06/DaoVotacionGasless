"use client";

import { useEffect, useState } from "react";

import { useReadDao } from "@/lib/useReadDao";
import { useWallet } from "@/lib/WalletContext";

import { ProposalCard, type Proposal } from "./ProposalCard";

export function ProposalList() {
    const dao = useReadDao();
    const { refreshVersion } = useWallet();
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

    useEffect(() => {
        if (!dao) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const nextId = (await dao.nextProposalId()) as bigint;
                const fetched: Proposal[] = [];
                for (let i = 1n; i < nextId; i = i + 1n) {
                    const raw = await dao.getProposal(i);
                    fetched.push({
                        id: raw.id as bigint,
                        proposer: raw.proposer as string,
                        recipient: raw.recipient as string,
                        amount: raw.amount as bigint,
                        deadline: raw.deadline as bigint,
                        description: raw.description as string,
                        forVotes: raw.forVotes as bigint,
                        againstVotes: raw.againstVotes as bigint,
                        abstainVotes: raw.abstainVotes as bigint,
                        executed: raw.executed as boolean,
                    });
                }
                if (!cancelled) {
                    setProposals(fetched);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to load proposals");
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dao, refreshVersion]);

    useEffect(() => {
        const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Propuestas</h2>
            {loading && <p className="text-sm text-zinc-500">Cargando propuestas…</p>}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {!loading && !error && proposals.length === 0 && (
                <p className="text-sm text-zinc-500">Aún no hay propuestas. Crea la primera desde el panel de arriba.</p>
            )}
            {proposals.map((p) => (
                <ProposalCard key={p.id.toString()} proposal={p} now={now} />
            ))}
        </section>
    );
}
