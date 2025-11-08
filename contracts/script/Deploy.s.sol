// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ArbitrageBalancer} from "../src/ArbitrageBalancer.sol";
import {MockVault} from "../src/MockVault.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy mock tokens
        MockERC20 tokenA = new MockERC20("Token A", "TKA", 10_000_000e18);
        MockERC20 tokenB = new MockERC20("Token B", "TKB", 10_000_000_000e18);

        // Deploy mock vault
        MockVault mockVault = new MockVault();

        // Deploy the ArbitrageBalancer, passing the vault and a null address for the oracle
        ArbitrageBalancer arbitrageBalancer = new ArbitrageBalancer(address(mockVault), address(0));

        vm.stopBroadcast();

        console2.log("ArbitrageBalancer deployed to:", address(arbitrageBalancer));
        console2.log("MockVault deployed to:", address(mockVault));
        console2.log("TokenA deployed to:", address(tokenA));
        console2.log("TokenB deployed to:", address(tokenB));
    }
}
