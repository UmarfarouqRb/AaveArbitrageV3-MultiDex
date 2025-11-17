// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {AaveArbitrageV3} from "../src/AaveArbitrageV3.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IAerodromeFactory} from "../src/interfaces/IAerodromeFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint) external;
}

contract TestArbitrage is Script {
    string public constant BASE_MAINNET_RPC_URL = "https://mainnet.base.org";
    uint256 public constant BASE_MAINNET_FORK_BLOCK = 16200000;

    // --- Base Mainnet Contract Addresses ---
    address public constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address public constant AERODROME_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant AERO = 0x940181a94A35A4569E4529A3CDfB74e38FD98631;
    address public constant AERODROME_FACTORY = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;
    address public constant MULTISIG_WALLET = 0x1234567890123456789012345678901234567890;

    uint256 public constant TEMP_WALLET_PRIVATE_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address public tempWalletAddress = vm.addr(TEMP_WALLET_PRIVATE_KEY);

    function run() external {
        uint256 forkId = vm.createFork(BASE_MAINNET_RPC_URL, BASE_MAINNET_FORK_BLOCK);
        vm.selectFork(forkId);

        // Deploy the contract
        vm.startBroadcast();
        AaveArbitrageV3 arbitrageContract = new AaveArbitrageV3(AAVE_POOL, MULTISIG_WALLET);
        vm.stopBroadcast();

        console.log("AaveArbitrageV3 contract deployed at:", address(arbitrageContract));

        // Fund and configure the contract from the multisig
        vm.deal(MULTISIG_WALLET, 1 ether);
        vm.startBroadcast(MULTISIG_WALLET);
        arbitrageContract.setRouter(AERODROME_ROUTER, true);
        vm.stopBroadcast();

        // --- Engineer a Profitable Arbitrage Opportunity ---
        console.log("Manufacturing a guaranteed profitable arbitrage opportunity...");

        // 1. Unbalance the USDC/WETH pool to make WETH cheap
        address poolToUnbalanceWETH = IAerodromeFactory(AERODROME_FACTORY).getPool(USDC, WETH, false);
        vm.deal(tempWalletAddress, 10000 ether); // Deal ETH for gas and deposit
        vm.startBroadcast(TEMP_WALLET_PRIVATE_KEY);
        IWETH(WETH).deposit{value: 10000 ether}();
        IERC20(WETH).transfer(poolToUnbalanceWETH, 10000 ether);
        vm.stopBroadcast();
        console.log("- Dumped 10,000 WETH into USDC/WETH pool");

        // 2. Unbalance the AERO/USDC pool to make USDC expensive
        address poolToUnbalanceUSDC = IAerodromeFactory(AERODROME_FACTORY).getPool(AERO, USDC, false);
        
        // Fund temp wallet with USDC from a whale (aUSDC token contract, holds underlying)
        address usdcWhale = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;
        uint256 usdcToDump = 200000 * 10**6;
        vm.prank(usdcWhale);
        IERC20(USDC).transfer(tempWalletAddress, usdcToDump);

        // Now, from the temp wallet, dump the USDC into the pool
        vm.startBroadcast(TEMP_WALLET_PRIVATE_KEY);
        IERC20(USDC).transfer(poolToUnbalanceUSDC, usdcToDump);
        vm.stopBroadcast();
        console.log("- Dumped 200,000 USDC into AERO/USDC pool");


        // --- Execute the Arbitrage ---
        address flashLoanToken = USDC;
        uint256 flashLoanAmount = 100000 * 10**6; // 100,000 USDC

        AaveArbitrageV3.Swap[] memory swaps = new AaveArbitrageV3.Swap[](3);
        swaps[0] = AaveArbitrageV3.Swap({router: AERODROME_ROUTER, from: USDC, to: WETH, stable: false, factory: AERODROME_FACTORY});
        swaps[1] = AaveArbitrageV3.Swap({router: AERODROME_ROUTER, from: WETH, to: AERO, stable: false, factory: AERODROME_FACTORY});
        swaps[2] = AaveArbitrageV3.Swap({router: AERODROME_ROUTER, from: AERO, to: USDC, stable: false, factory: AERODROME_FACTORY});

        console.log("Executing guaranteed profitable arbitrage...");
        vm.broadcast();
        arbitrageContract.executeArbitrage(flashLoanToken, flashLoanAmount, swaps);

        // --- Verify Profit and Withdraw ---
        uint256 profit = IERC20(USDC).balanceOf(address(arbitrageContract));
        console.log("SUCCESS! Profit extracted (USDC):", profit);

        vm.startBroadcast(MULTISIG_WALLET);
        arbitrageContract.withdraw(USDC);
        vm.stopBroadcast();

        uint256 walletBalance = IERC20(USDC).balanceOf(MULTISIG_WALLET);
        console.log("Multisig wallet balance after withdrawal (USDC):", walletBalance);
    }
}
