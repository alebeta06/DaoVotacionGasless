"use client";

import { formatEther } from "ethers";

import { VoteButtons } from "./VoteButtons";

export type Proposal = {
    id: bigint;
    proposer: string;
    recipient: string;
    amount: bigint;
    deadline: bigint;
    forVotes: bigint;
    againstVotes: bigint;
    abstainVotes: bigint;
    executed: boolean;
};

export function ProposalCard({ proposal, now }: { proposal: Proposal; now: number }) {
    const deadlineSec = Number(proposal.deadline);
    const closed = deadlineSec <= now;
    const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
    const pct = (n: bigint) => (totalVotes === 0n ? 0 : Number((n * 10_000n) / totalVotes) / 100);

    return (
        <article className="flex flex-col gap-3 rounded-2xl border border-black/10 dark:border-white/15 p-4">
            <header className="flex items-baseline justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">Propuesta #{proposal.id.toString()}</h3>
                <StatusBadge executed={proposal.executed} closed={closed} />
            </header>

            <dl className="grid grid-cols-2 gap-2 text-xs">
                <Field label="Beneficiario" mono>
                    {short(proposal.recipient)}
                </Field>
                <Field label="Cantidad" mono>
                    {formatEther(proposal.amount)} ETH
                </Field>
                <Field label="Propone" mono>
                    {short(proposal.proposer)}
                </Field>
                <Field label={closed ? "Cerró" : "Cierra"} mono>
                    {formatTimestamp(deadlineSec)}
                </Field>
            </dl>

            <div className="grid grid-cols-3 gap-2 text-xs">
                <VoteTally label="A favor" weight={proposal.forVotes} pct={pct(proposal.forVotes)} tone="emerald" />
                <VoteTally label="En contra" weight={proposal.againstVotes} pct={pct(proposal.againstVotes)} tone="red" />
                <VoteTally label="Abstención" weight={proposal.abstainVotes} pct={pct(proposal.abstainVotes)} tone="zinc" />
            </div>

            {!closed && !proposal.executed && <VoteButtons proposalId={proposal.id} />}
        </article>
    );
}

function StatusBadge({ executed, closed }: { executed: boolean; closed: boolean }) {
    if (executed) {
        return <Badge tone="emerald">ejecutada</Badge>;
    }
    if (closed) {
        return <Badge tone="zinc">votación cerrada</Badge>;
    }
    return <Badge tone="blue">activa</Badge>;
}

function Badge({ tone, children }: { tone: "emerald" | "zinc" | "blue"; children: React.ReactNode }) {
    const styles = {
        emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        zinc: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400",
        blue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    };
    return <span className={`rounded-full text-xs px-2 py-0.5 ${styles[tone]}`}>{children}</span>;
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-zinc-500">{label}</dt>
            <dd className={mono ? "font-mono" : undefined}>{children}</dd>
        </div>
    );
}

function VoteTally({
    label,
    weight,
    pct,
    tone,
}: {
    label: string;
    weight: bigint;
    pct: number;
    tone: "emerald" | "red" | "zinc";
}) {
    const colors = {
        emerald: "text-emerald-600 dark:text-emerald-400",
        red: "text-red-600 dark:text-red-400",
        zinc: "text-zinc-600 dark:text-zinc-400",
    };
    return (
        <div className="flex flex-col">
            <span className="text-zinc-500">{label}</span>
            <span className={`font-mono ${colors[tone]}`}>{formatEther(weight)} ETH</span>
            <span className="font-mono text-zinc-400">{pct.toFixed(1)}%</span>
        </div>
    );
}

function short(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTimestamp(sec: number): string {
    if (!Number.isFinite(sec) || sec === 0) return "—";
    return new Date(sec * 1000).toLocaleString();
}
