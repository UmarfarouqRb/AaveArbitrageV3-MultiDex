// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AaveArbitrageV3, Swap} from "src/AaveArbitrageV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// --- Interfaces ---
interface IUniswapV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint deadline;
        uint amountIn;
        uint amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

contract ArbitrageBotTest is Test {
    // --- Fork & Wallet Configuration ---
    string internal constant BASE_MAINNET_RPC_URL = "https://base-mainnet.g.alchemy.com/v2/_rq09Uz--vhSNI9x6BGOb";
    uint256 internal constant FORK_BLOCK_NUMBER = 15_000_000;
    address internal deployer;
    address internal multiSig;

    // --- Deployed Contracts & Tokens ---
    AaveArbitrageV3 public arbitrageContract;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    // --- DEX Addresses ---
    address internal constant PANCAKE_V3_ROUTER = 0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86;
    address internal constant PANCAKE_V3_FACTORY = 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865;
    address internal constant AERODROME_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5B1Beb874E43;
    address internal constant AERODROME_FACTORY = 0x420Dd3817F20a1A8485277520e5bEb4834241e95;

    function setUp() public {
        vm.createSelectFork(BASE_MAINNET_RPC_URL, FORK_BLOCK_NUMBER);
        deployer = makeAddr("deployer");
        multiSig = makeAddr("multisig");

        vm.startPrank(deployer);
        arbitrageContract = new AaveArbitrageV3(multiSig);

        uint24[] memory pancakeFees = new uint24[](4);
        pancakeFees[0] = 100;
        pancakeFees[1] = 500;
        pancakeFees[2] = 2500;
        pancakeFees[3] = 10000;

        arbitrageContract.setDex(AaveArbitrageV3.DexName.PancakeV3, PANCAKE_V3_ROUTER, PANCAKE_V3_FACTORY, pancakeFees);

        uint24[] memory aerodromeFees = new uint24[](3);
        aerodromeFees[0] = 500;
        aerodromeFees[1] = 3000;
        aerodromeFees[2] = 10000;
        
        arbitrageContract.setDex(AaveArbitrageV3.DexName.Aerodrome, AERODROME_ROUTER, AERODROME_FACTORY, aerodromeFees);

        arbitrageContract.transferOwnership(multiSig);
        vm.stopPrank();

        vm.startPrank(multiSig);
        arbitrageContract.acceptOwnership();
        vm.stopPrank();

        deal(WETH, deployer, 200 ether);
    }

    function testExecuteArbitrageWithPriceManipulation() public {
        _manipulatePancakeMarket(150 ether);

        address flashLoanToken = WETH;
        uint256 flashLoanAmount = 50 ether;
        uint256 aavePremium = (flashLoanAmount * 9) / 10000; 
        uint256 totalDebt = flashLoanAmount + aavePremium;

        Swap[] memory swaps = new Swap[](2);
        swaps[0] = _getAeroSwap(WETH, USDC);
        swaps[1] = _getPancakeSwap(USDC, WETH, totalDebt);

        vm.prank(multiSig);
        arbitrageContract.executeArbitrage(flashLoanToken, flashLoanAmount, swaps);

        uint256 multiSigBalance = IERC20(flashLoanToken).balanceOf(multiSig);
        assertTrue(multiSigBalance > 0, "Multisig did not receive profit.");
    }

    function _manipulatePancakeMarket(uint256 amount) internal {
        vm.startPrank(deployer);
        IERC20(WETH).approve(PANCAKE_V3_ROUTER, amount);

        bytes memory path = abi.encodePacked(WETH, uint24(3000), USDC);

        IUniswapV3Router.ExactInputParams memory params = IUniswapV3Router.ExactInputParams({
            path: path,
            recipient: deployer,
            deadline: block.timestamp,
            amountIn: amount,
            amountOutMinimum: 0
        });
        IUniswapV3Router(PANCAKE_V3_ROUTER).exactInput(params);
        vm.stopPrank();
    }

    function _getAeroSwap(address from, address to) internal pure returns (Swap memory) {
        return Swap({
            dex: AaveArbitrageV3.DexName.Aerodrome,
            from: from,
            to: to,
            amountOutMin: 0
        });
    }

    function _getPancakeSwap(address from, address to, uint amountOutMin) internal pure returns (Swap memory) {
        return Swap({
            dex: AaveArbitrageV3.DexName.PancakeV3,
            from: from,
            to: to,
            amountOutMin: amountOutMin
        });
    }
}
