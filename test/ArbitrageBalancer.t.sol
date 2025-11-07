// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {ArbitrageBalancer, FlashLoanData} from "../src/ArbitrageBalancer.sol";
import {MockVault} from "../src/MockVault.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockRouter} from "../src/MockRouter.sol";

contract ArbitrageBalancerTest is Test {
    ArbitrageBalancer public arbitrageBalancer;
    MockVault public mockVault;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockRouter public routerA;
    MockRouter public routerB;

    uint256 private constant PRICE_TOKEN_A_IN_B_ROUTER_A = 1000e18; // Low price
    uint256 private constant PRICE_TOKEN_A_IN_B_ROUTER_B = 1010e18; // High price

    function setUp() public {
        tokenA = new MockERC20("Token A", "TKA", 1_000_000e18);
        tokenB = new MockERC20("Token B", "TKB", 1_000_000_000e18);

        routerA = new MockRouter();
        routerB = new MockRouter();

        tokenA.mint(address(routerA), 1_000_000e18);
        tokenB.mint(address(routerA), 1_000_000e18 * 1000);
        tokenA.mint(address(routerB), 1_000_000e18);
        tokenB.mint(address(routerB), 1_000_000e18 * 1010);

        mockVault = new MockVault();

        // The TWAP oracle is removed for this simplified test
        arbitrageBalancer = new ArbitrageBalancer(address(mockVault), address(0)); // Pass address(0) for the oracle
    }

    function testArbitrageOpportunity() public {
        uint256 loanAmount = 10e18;

        address[] memory pathSellHigh = new address[](2);
        pathSellHigh[0] = address(tokenA);
        pathSellHigh[1] = address(tokenB);

        address[] memory pathBuyLow = new address[](2);
        pathBuyLow[0] = address(tokenB);
        pathBuyLow[1] = address(tokenA);

        uint256 amountBFromSale = (loanAmount * PRICE_TOKEN_A_IN_B_ROUTER_B) / 1e18;
        routerB.setAmountOut(pathSellHigh, loanAmount, amountBFromSale);

        uint256 finalAmountA = (amountBFromSale * 1e18) / PRICE_TOKEN_A_IN_B_ROUTER_A;
        routerA.setAmountOut(pathBuyLow, amountBFromSale, finalAmountA);

        address[] memory routers = new address[](2);
        routers[0] = address(routerB); // Sell high first
        routers[1] = address(routerA); // Buy low second

        address[][] memory paths = new address[][](2);
        paths[0] = pathSellHigh;
        paths[1] = pathBuyLow;

        FlashLoanData memory flashLoanData = FlashLoanData({
            inputToken: address(tokenA),
            middleToken: address(tokenB),
            routers: routers,
            paths: paths,
            minProfit: 1,
            minAmountOutFromFirstSwap: amountBFromSale,
            twapMaxDeviationBps: 0 // TWAP check is disabled
        });

        bytes memory userData = abi.encode(flashLoanData);

        tokenA.mint(address(mockVault), loanAmount);

        arbitrageBalancer.startFlashloan(address(tokenA), loanAmount, userData);

        assertGt(tokenA.balanceOf(arbitrageBalancer.owner()), 0, "Profit should be > 0");
    }
}
