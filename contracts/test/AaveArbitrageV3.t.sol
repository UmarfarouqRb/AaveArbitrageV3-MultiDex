// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3, SwapStep, SwapStepType, SwapV3, SwapV2, DexV3Type, DexV2Type} from "../src/AaveArbitrageV3.sol";
import {Constants} from "./Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IPool} from "aave-v3-core/contracts/interfaces/IPool.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AaveArbitrageV3Test is Test, Constants {
    AaveArbitrageV3 public arbitrageContract;
    address public initiator = 0xC3f2c61C4836Afeb9Ae601c91F6FE661df3D634E;
    address public multisig = 0x1111111111111111111111111111111111111111;
    uint24 public constant USDC_WETH_FEE = 500;

    function setUp() public {
        vm.createSelectFork("base");

        address[] memory initialWhitelistedRouters = new address[](4);
        initialWhitelistedRouters[0] = UNISWAP_V3_ROUTER;
        initialWhitelistedRouters[1] = UNISWAP_V2_ROUTER;
        initialWhitelistedRouters[2] = SUSHISWAP_V2_ROUTER;
        initialWhitelistedRouters[3] = AERODROME_ROUTER;

        arbitrageContract = new AaveArbitrageV3(
            IPool(AAVE_V3_POOL),
            multisig,
            initialWhitelistedRouters
        );
    }

    function test_FullArbitrage_ProfitDistribution() public {
        uint256 loanAmount = 10000e6; // 10,000 USDC
        uint256 simulatedProfit = 100e6; // 100 USDC

        address expectedPool = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(
            USDC,
            WETH,
            USDC_WETH_FEE
        );

        SwapV3[] memory swapsV3 = new SwapV3[](1);
        swapsV3[0] = SwapV3({
            router: UNISWAP_V3_ROUTER,
            pool: expectedPool,
            tokenIn: USDC,
            tokenOut: WETH,
            amountOutMin: 0,
            dexType: DexV3Type.UniswapV3
        });

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        SwapV2[] memory swapsV2 = new SwapV2[](1);
        swapsV2[0] = SwapV2({
            router: UNISWAP_V2_ROUTER,
            path: path,
            amountOutMin: 0,
            dexType: DexV2Type.UniswapV2,
            data: bytes("")
        });
        
        SwapStep[] memory swapPath = new SwapStep[](2);
        swapPath[0] = SwapStep({ stepType: SwapStepType.V3, index: 0 });
        swapPath[1] = SwapStep({ stepType: SwapStepType.V2, index: 0 });

        // Simulate a profitable arbitrage by placing profit in the contract beforehand
        deal(USDC, address(arbitrageContract), loanAmount + simulatedProfit);

        uint256 initiatorBalanceBefore = IERC20(USDC).balanceOf(initiator);
        uint256 multisigBalanceBefore = IERC20(USDC).balanceOf(multisig);

        vm.prank(initiator);
        arbitrageContract.executeArbitrage(USDC, loanAmount, swapPath, swapsV3, swapsV2);

        uint256 initiatorBalanceAfter = IERC20(USDC).balanceOf(initiator);
        uint256 multisigBalanceAfter = IERC20(USDC).balanceOf(multisig);

        console.log("AaveArbitrageV3Test: Loan Amount (USDC):", loanAmount);
        console.log("AaveArbitrageV3Test: Simulated Profit (USDC):", simulatedProfit);
        console.log("AaveArbitrageV3Test: Initiator Balance Before (USDC):", initiatorBalanceBefore);
        console.log("AaveArbitrageV3Test: Multisig Balance Before (USDC):", multisigBalanceBefore);
        console.log("AaveArbitrageV3Test: Initiator Balance After (USDC):", initiatorBalanceAfter);
        console.log("AaveArbitrageV3Test: Multisig Balance After (USDC):", multisigBalanceAfter);
        console.log("AaveArbitrageV3Test: Initiator Profit (USDC):", initiatorBalanceAfter - initiatorBalanceBefore);
        console.log("AaveArbitrageV3Test: Multisig Profit (USDC):", multisigBalanceAfter - multisigBalanceBefore);

        assertGt(initiatorBalanceAfter, initiatorBalanceBefore, "Initiator should have received a fee");
        assertGt(multisigBalanceAfter, multisigBalanceBefore, "Multisig should have received profit");
    }

    function test_SetInitiatorFee() public {
        uint256 newFee = 1000; // 10%
        vm.prank(arbitrageContract.owner());
        arbitrageContract.setInitiatorFee(newFee);
        assertEq(arbitrageContract.initiatorFee(), newFee, "Initiator fee should be updated");
    }

    function test_SetInitiatorFee_NotOwner() public {
        uint256 newFee = 1000; // 10%
        address notOwner = address(0xDEAD);
        vm.prank(notOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notOwner));
        arbitrageContract.setInitiatorFee(newFee);
    }

    function test_Withdraw() public {
        deal(USDC, address(arbitrageContract), 1000e6);
        
        uint256 multisigBalanceBefore = IERC20(USDC).balanceOf(arbitrageContract.owner());
        
        vm.prank(arbitrageContract.owner());
        arbitrageContract.withdraw(USDC);
        
        uint256 multisigBalanceAfter = IERC20(USDC).balanceOf(arbitrageContract.owner());
        
        assertGt(multisigBalanceAfter, multisigBalanceBefore, "MULTISIG should have withdrawn the tokens");
        assertEq(IERC20(USDC).balanceOf(address(arbitrageContract)), 0, "Contract balance should be zero after withdrawal");
    }

}
