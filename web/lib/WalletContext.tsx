"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { BrowserProvider, type JsonRpcSigner } from "ethers";

import { env } from "./env";
import { getInjectedProvider, requestAccounts, switchChain as switchChainRpc } from "./wallet";

type Status = "idle" | "connecting" | "connected" | "wrong-chain" | "error";

type WalletState = {
    status: Status;
    address: string | null;
    chainId: number | null;
    signer: JsonRpcSigner | null;
    error: string | null;
    refreshVersion: number;
};

type WalletActions = {
    connect: () => Promise<void>;
    switchChain: () => Promise<void>;
    bumpRefresh: () => void;
};

const initialState: WalletState = {
    status: "idle",
    address: null,
    chainId: null,
    signer: null,
    error: null,
    refreshVersion: 0,
};

const WalletCtx = createContext<(WalletState & WalletActions) | null>(null);

async function loadSignerAndChain(): Promise<{ signer: JsonRpcSigner; chainId: number } | null> {
    const injected = getInjectedProvider();
    if (!injected) return null;
    const provider = new BrowserProvider(injected);
    const network = await provider.getNetwork();
    const signer = await provider.getSigner();
    return { signer, chainId: Number(network.chainId) };
}

export function WalletProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<WalletState>(initialState);

    const connect = useCallback(async () => {
        setState((s) => ({ ...s, status: "connecting", error: null }));
        try {
            const accounts = await requestAccounts();
            if (accounts.length === 0) throw new Error("No accounts returned");
            const data = await loadSignerAndChain();
            if (!data) throw new Error("No injected wallet");
            setState((s) => ({
                ...s,
                status: data.chainId === env.chainId ? "connected" : "wrong-chain",
                address: accounts[0],
                chainId: data.chainId,
                signer: data.signer,
            }));
        } catch (err) {
            setState((s) => ({
                ...s,
                status: "error",
                error: err instanceof Error ? err.message : "Failed to connect",
            }));
        }
    }, []);

    const switchChain = useCallback(async () => {
        try {
            await switchChainRpc(env.chainId);
        } catch (err) {
            setState((s) => ({ ...s, error: err instanceof Error ? err.message : "Failed to switch chain" }));
        }
    }, []);

    const bumpRefresh = useCallback(() => {
        setState((s) => ({ ...s, refreshVersion: s.refreshVersion + 1 }));
    }, []);

    useEffect(() => {
        const provider = getInjectedProvider();
        if (!provider) return;

        const onAccountsChanged = async (...args: unknown[]) => {
            const accounts = args[0] as string[];
            if (!accounts[0]) {
                setState(initialState);
                return;
            }
            const data = await loadSignerAndChain();
            if (!data) return;
            setState((s) => ({
                ...s,
                status: data.chainId === env.chainId ? "connected" : "wrong-chain",
                address: accounts[0],
                chainId: data.chainId,
                signer: data.signer,
            }));
        };

        const onChainChanged = async (...args: unknown[]) => {
            const chainId = Number.parseInt(args[0] as string, 16);
            const data = await loadSignerAndChain();
            setState((s) => ({
                ...s,
                chainId,
                signer: data?.signer ?? s.signer,
                status: s.address ? (chainId === env.chainId ? "connected" : "wrong-chain") : s.status,
            }));
        };

        provider.on?.("accountsChanged", onAccountsChanged);
        provider.on?.("chainChanged", onChainChanged);

        return () => {
            provider.removeListener?.("accountsChanged", onAccountsChanged);
            provider.removeListener?.("chainChanged", onChainChanged);
        };
    }, []);

    const value = useMemo(
        () => ({ ...state, connect, switchChain, bumpRefresh }),
        [state, connect, switchChain, bumpRefresh],
    );

    return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
    const ctx = useContext(WalletCtx);
    if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
    return ctx;
}
