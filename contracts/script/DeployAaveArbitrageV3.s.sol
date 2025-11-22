// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AaveArbitrageV3.sol";

contract DeployAaveArbitrageV3 is Script {
    function run() external {
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        AaveArbitrageV3 arbitrageContract = new AaveArbitrageV3(vm.addr(deployerPrivateKey));
        arbitrageContract.transferOwnership(multisig);

        vm.stopBroadcast();
    }
}
