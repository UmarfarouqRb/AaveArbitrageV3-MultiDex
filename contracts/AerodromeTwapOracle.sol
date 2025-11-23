// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV3Pool} from "lib/v3-libraries/IUniswapV3Pool.sol";
import {TickMath} from "lib/v3-libraries/TickMath.sol";
import {FullMath} from "lib/v3-libraries/FullMath.sol";
import {FixedPoint96} from "lib/v3-libraries/FixedPoint96.sol";
import {PoolAddress} from "lib/v3-libraries/PoolAddress.sol";
import {Position} from "lib/v3-libraries/Position.sol";

contract AerodromeTwapOracle {
    struct Observation {
        uint32 blockTimestamp;
        int56 tickCumulative;
        uint160 secondsPerLiquidityCumulativeX128;
        bool initialized;
    }

    IUniswapV3Pool internal immutable pool;
    address internal immutable token0;
    address internal immutable token1;

    uint256 internal constant RESOLUTION = 128;

    constructor(address _pool) {
        pool = IUniswapV3Pool(_pool);
        token0 = pool.token0();
        token1 = pool.token1();
    }

    function consult(uint32 secondsAgo) public view returns (int24 arithmeticMeanTick) {
        if (secondsAgo == 0) {
            (int24 tick, , , , , , ) = pool.slot0();
            return tick;
        }

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = pool.observe(secondsAgos);

        return int24((tickCumulatives[1] - tickCumulatives[0]) / int56(uint56(secondsAgo)));
    }
}
