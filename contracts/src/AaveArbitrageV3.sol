// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {IRouter} from "aerodrome/interfaces/IRouter.sol";
import {ISwapRouter as IV3SwapRouter} from "v3-periphery/interfaces/ISwapRouter.sol";
import {Ownable} from "openzeppelin-contracts/access/Ownable.sol";

enum DexType {
    UniswapV3,
    PancakeV3,
    Aerodrome
}

struct V3Params {
    uint24 fee;
    uint256 amountOutMinimum;
}

struct AerodromeParams {
    IRouter.Route[] routes;
}

struct Swap {
    address router;
    address from;
    address to;
    DexType dex;
    bytes dexParams;
}


contract AaveArbitrageV3 is Ownable {
    using SafeERC20 for IERC20;
    IPoolAddressesProvider public constant AAVE_ADDRESSES_PROVIDER = IPoolAddressesProvider(0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb);
    IPool public constant AAVE_POOL = IPool(0x794a61358D6845594F94dc1DB02A252b5b4814aD);
    address private constant WETH = 0x4200000000000000000000000000000000000006;
    mapping(address => bool) public approvedRouters;

    event ArbitrageExecuted(
        address indexed token,
        uint256 indexed flashLoanAmount,
        uint256 profit
    );

    event Profit(
        address indexed token,
        uint256 amount
    );

    constructor() Ownable(msg.sender) {
        AAVE_POOL.borrow(WETH, 1, 1, 1, address(this));
    }

    receive() external payable {}

    function setRouter(address router, bool approved) external onlyOwner {
        approvedRouters[router] = approved;
    }

    function executeArbitrage(address flashLoanToken, uint256 flashLoanAmount, Swap[] calldata swaps) external {
        bytes memory params = abi.encode(swaps);
        AAVE_POOL.flashLoan(address(this),_getTokens(flashLoanToken),_getAmounts(flashLoanAmount),_getModes(),address(this),params,0);
    }

    function executeFlashLoan(address[] calldata assets, uint256[] calldata amounts, uint256[] calldata premiums, address initiator, bytes calldata params) external returns (bool) {
        Swap[] memory swaps = abi.decode(params, (Swap[]));
        uint256 totalDebt = amounts[0] + premiums[0];
        IERC20(assets[0]).approve(swaps[0].router, amounts[0]);
        _executeSwaps(swaps, totalDebt);
        uint256 profit = IERC20(assets[0]).balanceOf(address(this)) - totalDebt;

        uint256 keeperFee = (profit * 5) / 100;
        IERC20(assets[0]).safeTransfer(initiator, keeperFee);
        IERC20(assets[0]).safeTransfer(owner(), profit - keeperFee);
        emit ArbitrageExecuted(assets[0], amounts[0], profit);

        IERC20(assets[0]).safeTransfer(address(AAVE_POOL), totalDebt);

        return true;
    }

    function _getTokens(address token) internal pure returns(address[] memory) {
        address[] memory tokens = new address[](1);
        tokens[0] = token;
        return tokens;
    }

    function _getAmounts(uint256 amount) internal pure returns(uint256[] memory) {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        return amounts;
    }

    function _getModes() internal pure returns(uint256[] memory) {
        return new uint256[](0);
    }

    function _executeSwaps(Swap[] memory swaps, uint256 totalDebt) internal {
        for (uint i = 0; i < swaps.length; i++) {
            Swap memory swap = swaps[i];
            require(approvedRouters[swap.router], "Router not approved");

            if (swap.dex == DexType.UniswapV3) {
                _uniswapV3Swap(swap, totalDebt, i, swaps.length);
            } else if (swap.dex == DexType.PancakeV3) {
                _pancakeV3Swap(swap, totalDebt, i, swaps.length);
            } else if (swap.dex == DexType.Aerodrome) {
                _aerodromeSwap(swap, totalDebt, i, swaps.length);
            }
        }
    }

    function _uniswapV3Swap(Swap memory swap, uint256 totalDebt, uint256 i, uint256 length) internal {
        V3Params memory params = abi.decode(swap.dexParams, (V3Params));
        IV3SwapRouter.ExactInputSingleParams memory swapParams = IV3SwapRouter.ExactInputSingleParams({
            tokenIn: swap.from,
            tokenOut: swap.to,
            fee: params.fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: IERC20(swap.from).balanceOf(address(this)),
            amountOutMinimum: i == (length -1) ? totalDebt : params.amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        IV3SwapRouter(swap.router).exactInputSingle(swapParams);
    }

    function _pancakeV3Swap(Swap memory swap, uint256 totalDebt, uint256 i, uint256 length) internal {
        V3Params memory params = abi.decode(swap.dexParams, (V3Params));
        IV3SwapRouter.ExactInputSingleParams memory swapParams = IV3SwapRouter.ExactInputSingleParams({
            tokenIn: swap.from,
            tokenOut: swap.to,
            fee: params.fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: IERC20(swap.from).balanceOf(address(this)),
            amountOutMinimum: i == (length -1) ? totalDebt : params.amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        IV3SwapRouter(swap.router).exactInputSingle(swapParams);
    }

    function _aerodromeSwap(Swap memory swap, uint256 totalDebt, uint256 i, uint256 length) internal {
        AerodromeParams memory params = abi.decode(swap.dexParams, (AerodromeParams));
        uint amountOutMin = i == (length -1) ? totalDebt : 0;
        IRouter(swap.router).swapExactTokensForTokens(
            IERC20(swap.from).balanceOf(address(this)),
            amountOutMin,
            params.routes,
            address(this),
            block.timestamp
        );
    }

    function withdraw(address token) external onlyOwner {
        IERC20(token).transfer(owner(), IERC20(token).balanceOf(address(this)));
    }
}