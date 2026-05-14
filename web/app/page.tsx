import { Dashboard } from "@/components/Dashboard";

export default function Home() {
    return (
        <main className="flex flex-1 flex-col items-center justify-start gap-10 px-6 py-12">
            <header className="flex flex-col items-center gap-2 text-center max-w-2xl">
                <p className="text-xs uppercase tracking-widest text-zinc-500">CodeCrypto Academy · Capstone</p>
                <h1 className="text-4xl font-semibold tracking-tight">DAO Votación Gasless</h1>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-sm max-w-md">
                    Deposita ETH, crea propuestas y (próximamente) vota sin pagar gas vía EIP-2771.
                </p>
            </header>
            <Dashboard />
        </main>
    );
}
