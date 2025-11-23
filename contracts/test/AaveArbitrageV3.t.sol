// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AaveArbitrageV3} from "src/AaveArbitrageV3.sol";
import {MultiV3Executor, Swap, DexType} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AaveArbitrageV3Test is Test {
    AaveArbitrageV3 public arbitrage;
    address public owner = makeAddr("owner");
    address public keeper = makeAddr("keeper");
    address public deployer = makeAddr("deployer");

    // Base Mainnet
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Uniswap V3 on Base
    address public constant UNISWAP_V3_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    function setUp() public {
        vm.prank(deployer);
        arbitrage = new AaveArbitrageV3(owner);
        vm.label(owner, "Owner (Multisig)");
        vm.label(keeper, "Keeper");
        vm.label(address(arbitrage), "Arbitrage Contract");
    }

    function test_FullArbitrage_ProfitDistribution() public {
        address flashLoanToken = USDC;
        uint256 flashLoanAmount = 10_000 * 1e6;
        uint256 fakeProfit = 2_000 * 1e6;
        deal(USDC, address(arbitrage), fakeProfit);

        Swap[] memory swaps = new Swap[](2);
        swaps[0] = Swap({
            router: UNISWAP_V3_ROUTER,
            tokenIn: USDC,
            tokenOut: WETH,
            dexType: DexType.UniswapV3,
            amountIn: flashLoanAmount,
            amountOut: 0,
            fee: 500
        });
        swaps[1] = Swap({
            router: UNISWAP_V3_ROUTER,
            tokenIn: WETH,
            tokenOut: USDC,
            dexType: DexType.UniswapV3,
            amountIn: 0,
            amountOut: 0,
            fee: 500
        });

        vm.prank(keeper);
        arbitrage.executeArbitrage(flashLoanToken, flashLoanAmount, swaps);

        assertTrue(IERC20(USDC).balanceOf(keeper) > 0);
        assertTrue(IERC20(USDC).balanceOf(owner) > 0);
    }

    function test_SetKeeperFee() public {
        vm.prank(owner);
        arbitrage.setKeeperFee(2500); // 25%
        assertEq(arbitrage.keeperFeeBps(), 2500);
    }

    function test_SetKeeperFee_NotOwner() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        arbitrage.setKeeperFee(2500);
    }
}
