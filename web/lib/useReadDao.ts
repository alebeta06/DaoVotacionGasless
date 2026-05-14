"use client";

import { useMemo } from "react";
import { Contract, JsonRpcProvider } from "ethers";

import DAOVotingAbi from "./abis/DAOVoting.json";
import { env } from "./env";

let cachedProvider: JsonRpcProvider | null = null;

function getReadProvider(): JsonRpcProvider | null {
    if (!env.rpcUrl) return null;
    if (!cachedProvider) cachedProvider = new JsonRpcProvider(env.rpcUrl);
    return cachedProvider;
}

export function useReadDao(): Contract | null {
    return useMemo(() => {
        const provider = getReadProvider();
        if (!provider || !env.daoAddress) return null;
        return new Contract(env.daoAddress, DAOVotingAbi, provider);
    }, []);
}
