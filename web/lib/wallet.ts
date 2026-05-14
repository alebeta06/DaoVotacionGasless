"use client";

import { BrowserProvider, JsonRpcSigner } from "ethers";

type EthereumProvider = {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    isMetaMask?: boolean;
};

declare global {
    interface Window {
        ethereum?: EthereumProvider;
    }
}

export function getInjectedProvider(): EthereumProvider | null {
    if (typeof window === "undefined") return null;
    return window.ethereum ?? null;
}

export function getBrowserProvider(): BrowserProvider {
    const injected = getInjectedProvider();
    if (!injected) {
        throw new Error("No injected wallet found. Install MetaMask or a compatible wallet.");
    }
    return new BrowserProvider(injected);
}

export async function requestAccounts(): Promise<string[]> {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No injected wallet found.");
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    return accounts;
}

export async function getSigner(): Promise<JsonRpcSigner> {
    const provider = getBrowserProvider();
    return provider.getSigner();
}

export async function switchChain(chainId: number): Promise<void> {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No injected wallet found.");
    const hex = "0x" + chainId.toString(16);
    try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (err) {
        const e = err as { code?: number };
        if (e.code === 4902) {
            await provider.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                        chainId: hex,
                        chainName: chainId === 31337 ? "Anvil local" : `Chain ${chainId}`,
                        rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"],
                        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                    },
                ],
            });
        } else {
            throw err;
        }
    }
}
