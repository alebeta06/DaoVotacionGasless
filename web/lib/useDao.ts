"use client";

import { useMemo } from "react";
import { Contract } from "ethers";

import DAOVotingAbi from "./abis/DAOVoting.json";
import { env } from "./env";
import { useWallet } from "./WalletContext";

export function useDao(): Contract | null {
    const { signer } = useWallet();
    return useMemo(() => {
        if (!signer || !env.daoAddress) return null;
        return new Contract(env.daoAddress, DAOVotingAbi, signer);
    }, [signer]);
}
