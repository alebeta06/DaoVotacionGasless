// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { MinimalForwarder } from "../src/MinimalForwarder.sol";
import { DAOVoting } from "../src/DAOVoting.sol";

contract Deploy is Script {
    function run() external returns (MinimalForwarder forwarder, DAOVoting dao) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));

        if (pk == 0) {
            vm.startBroadcast();
        } else {
            vm.startBroadcast(pk);
        }

        forwarder = new MinimalForwarder();
        dao = new DAOVoting(address(forwarder));

        vm.stopBroadcast();

        console2.log("Chain id        :", block.chainid);
        console2.log("Deployer        :", tx.origin);
        console2.log("MinimalForwarder:", address(forwarder));
        console2.log("DAOVoting       :", address(dao));
    }
}
