// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AaveArbitrageV3} from "src/AaveArbitrageV3.sol";
import {MultiV3Executor, SwapV3, SwapV2, DexV3Type, DexV2Type} from "src/MultiV3Executor.sol";
import {Constants} from "./Constants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IPoolAddressesProvider} from "aave-v3-core/contracts/interfaces/IPool.sol";

contract AaveArbitrageV3Test is Test, Constants {
    AaveArbitrageV3 public arbitrageContract;
    MultiV3Executor public executor;
    address public owner = 0x7c8999dC9a822c1f0Df42023113EDB4FDd543266;
    address public keeper = 0xC3f2c61C4836Afeb9Ae601c91F6FE661df3D634E;
    uint24 public constant CBETH_WETH_FEE = 100; // 0.01%

    function setUp() public {
        vm.createSelectFork("mainnet");
        executor = new MultiV3Executor(owner);
        arbitrageContract = new AaveArbitrageV3(
            IPoolAddressesProvider(AAVE_V3_POOL_ADDRESSES_PROVIDER),
            payable(address(executor)),
            owner,
            keeper
        );
    }

    function test_FullArbitrage_ProfitDistribution() public {
        uint256 loanAmount = 100e18;
        deal(CBETH, address(arbitrageContract), loanAmount);

        address expectedPool = IUniswapV3Factory(UNISWAP_V3_FACTORY).getPool(
            CBETH,
            WETH,
            CBETH_WETH_FEE
        );

        SwapV3[] memory swapsV3 = new SwapV3[](1);
        swapsV3[0] = SwapV3({
            router: UNISWAP_V3_ROUTER,
            pool: expectedPool,
            tokenIn: CBETH,
            tokenOut: WETH,
            amountIn: loanAmount,
            amountOutMin: 0,
            dexType: DexV3Type.UniswapV3
        });

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = CBETH;

        SwapV2[] memory swapsV2 = new SwapV2[](1);
        swapsV2[0] = SwapV2({
            router: UNISWAP_V2_ROUTER,
            path: path,
            amountIn: 0,
            amountOutMin: 0,
            dexType: DexV2Type.UniswapV2,
            data: bytes("")
        });

        bytes memory params = abi.encode(swapsV3, swapsV2, keeper);

        uint256 keeperBalanceBefore = IERC20(CBETH).balanceOf(keeper);
        uint256 ownerBalanceBefore = IERC20(CBETH).balanceOf(owner);

        arbitrageContract.executeOperation(CBETH, loanAmount, 0, address(arbitrageContract), params);

        uint256 keeperBalanceAfter = IERC20(CBETH).balanceOf(keeper);
        uint256 ownerBalanceAfter = IERC20(CBETH).balanceOf(owner);

        assertGt(keeperBalanceAfter, keeperBalanceBefore, "Keeper should have received a fee");
        assertGt(ownerBalanceAfter, ownerBalanceBefore, "Owner should have received profit");
    }

    function test_SetKeeperFee() public {
        uint256 newFee = 1000; // 10%
        vm.prank(owner);
        arbitrageContract.setKeeperFee(newFee);
        assertEq(arbitrageContract.keeperFee(), newFee, "Keeper fee should be updated");
    }

    function test_SetKeeperFee_NotOwner() public {
        uint256 newFee = 1000; // 10%
        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        arbitrageContract.setKeeperFee(newFee);
    }

    function test_SetPool() public {
        address newKeeper = 0x000000000000000000000000000000000000dEaD;
        vm.prank(owner);
        arbitrageContract.setKeeper(newKeeper);
        assertEq(arbitrageContract.keeper(), newKeeper, "Keeper should be updated");
    }
}
