import { Contract, type ContractRunner } from "ethers";

import { env } from "./env";
import DAOVotingAbi from "./abis/DAOVoting.json";
import MinimalForwarderAbi from "./abis/MinimalForwarder.json";

export function getDao(runner: ContractRunner): Contract {
    return new Contract(env.daoAddress, DAOVotingAbi, runner);
}

export function getForwarder(runner: ContractRunner): Contract {
    return new Contract(env.forwarderAddress, MinimalForwarderAbi, runner);
}
