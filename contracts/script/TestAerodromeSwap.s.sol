// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAerodromeRouter} from "../src/AaveArbitrageV3.sol";

// Minimal interface for the USDC contract to include the mint function
interface IUSDC is IERC20 {
    function mint(address _to, uint256 _amount) external;
}

contract TestAerodromeSwap is Script {
    // --- Base Mainnet Contract Addresses ---
    address public constant AERODROME_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;
    address public constant USDC_ADDRESS = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    
    // The official minter for the bridged USDC contract on Base
    address public constant USDC_MINTER = 0x08154265436125a0a154833237191199a5eC2433;

    // --- Test Wallet ---
    uint256 private deployerPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address private deployer;

    IAerodromeRouter router = IAerodromeRouter(AERODROME_ROUTER);
    IUSDC USDC = IUSDC(USDC_ADDRESS);

    function run() external {
        deployer = vm.addr(deployerPk);
        uint256 amountIn = 1 * 10**6; // 1 USDC

        // Impersonate the USDC minter and mint tokens directly to the deployer
        vm.startPrank(USDC_MINTER);
        USDC.mint(deployer, amountIn);
        vm.stopPrank();

        uint256 initialBalance = USDC.balanceOf(deployer);
        console.log("Initial USDC balance of deployer:", initialBalance);
        require(initialBalance == amountIn, "Failed to mint USDC");

        // Start prank as the deployer to perform the swap
        vm.startPrank(deployer);

        // Approve the router to spend our USDC
        USDC.approve(address(router), amountIn);

        // Define the swap route
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: USDC_ADDRESS,
            to: WETH,
            stable: false,
            factory: 0x420DD38174206DE7f4D4D3850A3631be52B8807b // Aerodrome V2 Factory
        });

        console.log("Attempting to swap 1 USDC for WETH on Aerodrome...");
        
        // Execute the swap
        try router.swapExactTokensForTokens(
            amountIn,
            0, // amountOutMinimum
            routes,
            deployer, // Recipient is the deployer
            block.timestamp
        ) returns (uint[] memory amounts) {
            console.log("Swap successful!");
            console.log("Amount of WETH received:", amounts[1]);
        } catch (bytes memory reason) {
            console.log("Swap failed. Reason:");
            console.logBytes(reason);
        }
        
        uint256 finalWETHBalance = IERC20(WETH).balanceOf(deployer);
        console.log("Final WETH balance of deployer:", finalWETHBalance);
        vm.stopPrank();
    }
}
