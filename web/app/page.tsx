import { ConnectWallet } from "@/components/ConnectWallet";

export default function Home() {
    return (
        <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
            <header className="flex flex-col items-center gap-3 text-center max-w-2xl">
                <p className="text-xs uppercase tracking-widest text-zinc-500">CodeCrypto Academy · Capstone</p>
                <h1 className="text-4xl font-semibold tracking-tight">DAO Votación Gasless</h1>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Una DAO donde los votos son <strong>gratis</strong>. Tú firmas off-chain,
                    un <em>relayer</em> paga el gas y registra tu voto en cadena (EIP-2771).
                </p>
            </header>

            <ConnectWallet />

            <section className="grid gap-6 text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
                <p>
                    Esto es la Fase 5 del proyecto: <strong>bootstrap del frontend</strong>. En las próximas
                    fases añadiremos depósitos, propuestas, votación gasless y el daemon de ejecución.
                </p>
            </section>
        </main>
    );
}
