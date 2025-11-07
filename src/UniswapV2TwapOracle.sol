// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";

// library for computing TWAP from a Uniswap V2 pair
library UniswapV2Library {
    function consult(address factory, address tokenIn, uint amountIn, address tokenOut) internal view returns (uint amountOut) {
        address pair = IUniswapV2Factory(factory).getPair(tokenIn, tokenOut);
        require(pair != address(0), "Oracle: PAIR_NOT_FOUND");
        (uint reserveIn, uint reserveOut, ) = getReserves(factory, tokenIn, tokenOut);
        amountOut = (amountIn * reserveOut) / reserveIn;
    }

    function getReserves(address factory, address tokenA, address tokenB) internal view returns (uint reserveA, uint reserveB, uint32 blockTimestampLast) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        (uint reserve0, uint reserve1, uint32 _blockTimestampLast) = IUniswapV2Pair(IUniswapV2Factory(factory).getPair(tokenA, tokenB)).getReserves();
        (reserveA, reserveB, blockTimestampLast) = tokenA == token0 ? (reserve0, reserve1, _blockTimestampLast) : (reserve1, reserve0, _blockTimestampLast);
    }

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }
}

// stateful oracle that provides a TWAP
contract UniswapV2TwapOracle {
    // observation for a pair, includes the timestamp and the cumulative prices
    struct Observation {
        uint32 blockTimestamp;
        uint price0Cumulative;
        uint price1Cumulative;
    }

    address public immutable factory;
    // mapping from pair address to its last observation
    mapping(address => Observation) public pairObservations;

    constructor(address _factory) {
        factory = _factory;
    }

    // update the cumulative price for the observation at the current timestamp
    function update(address tokenA, address tokenB) external {
        address pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Oracle: PAIR_NOT_FOUND");

        // get the cumulative prices from the pair
        (uint price0Cumulative, uint price1Cumulative, ) = IUniswapV2Pair(pair).getReserves();

        // if the timestamp is the same as the last observation, we don't need to update
        if (pairObservations[pair].blockTimestamp == uint32(block.timestamp)) {
            return;
        }

        // update the observation
        pairObservations[pair] = Observation({
            blockTimestamp: uint32(block.timestamp),
            price0Cumulative: price0Cumulative,
            price1Cumulative: price1Cumulative
        });
    }

    // consult the oracle for the TWAP of a pair
    function consult(address tokenIn, uint amountIn, address tokenOut) external view returns (uint amountOut) {
        address pair = IUniswapV2Factory(factory).getPair(tokenIn, tokenOut);
        require(pair != address(0), "Oracle: PAIR_NOT_FOUND");
        Observation memory lastObservation = pairObservations[pair];
        require(lastObservation.blockTimestamp != 0, "Oracle: NO_OBSERVATION");

        // get the current cumulative prices
        (uint price0Cumulative, uint price1Cumulative, ) = IUniswapV2Pair(pair).getReserves();
        
        // get the last cumulative prices
        uint lastPrice0Cumulative = lastObservation.price0Cumulative;
        uint lastPrice1Cumulative = lastObservation.price1Cumulative;

        // calculate the TWAP
        (address token0, ) = UniswapV2Library.sortTokens(tokenIn, tokenOut);
        if (tokenIn == token0) {
            amountOut = uint((uint(price1Cumulative - lastPrice1Cumulative) * amountIn) / (price0Cumulative - lastPrice0Cumulative));
        } else {
            amountOut = uint((uint(price0Cumulative - lastPrice0Cumulative) * amountIn) / (price1Cumulative - lastPrice1Cumulative));
        }
    }
}
