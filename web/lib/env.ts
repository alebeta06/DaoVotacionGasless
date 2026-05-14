export const env = {
    daoAddress: process.env.NEXT_PUBLIC_DAO_ADDRESS ?? "",
    forwarderAddress: process.env.NEXT_PUBLIC_FORWARDER_ADDRESS ?? "",
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
};

export function assertContractsConfigured(): void {
    if (!env.daoAddress || !env.forwarderAddress) {
        throw new Error(
            "Contract addresses are missing. Run sc/script/Deploy.s.sol and fill web/.env.local (see .env.local.example).",
        );
    }
}
