// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AaveArbitrageV3.sol";
import {Constants} from "../test/Constants.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract DeployAaveArbitrageV3 is Script, Constants {
    function run() external {
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        address[] memory initialWhitelistedRouters = new address[](5);
        initialWhitelistedRouters[0] = UNISWAP_V3_ROUTER;
        initialWhitelistedRouters[1] = UNISWAP_V2_ROUTER;
        initialWhitelistedRouters[2] = SUSHISWAP_V2_ROUTER;
        initialWhitelistedRouters[3] = AERODROME_ROUTER;
        initialWhitelistedRouters[4] = PANCAKESWAP_V3_ROUTER;

        AaveArbitrageV3 arbitrageContract = new AaveArbitrageV3(
            IPool(AAVE_V3_POOL),
            multisig,
            initialWhitelistedRouters
        );

        vm.stopBroadcast();
    }
}
