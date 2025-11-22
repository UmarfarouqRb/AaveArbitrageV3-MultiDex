// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Math library for computing sqrt prices from ticks and vice versa
/// @notice Computes sqrt price for ticks of size 1.0001, i.e. sqrt(1.0001^tick) as fixed point Q64.96 numbers.
/// This library is adapted from the Uniswap V3 TickMath library.
library TickMath {
    /// @dev The minimum tick that may be used on any pool.
    int24 internal constant MIN_TICK = -887272;
    /// @dev The maximum tick that may be used on any pool.
    int24 internal constant MAX_TICK = -MIN_TICK;

    /// @notice Calculates sqrt(1.0001^tick) * 2^96
    /// @dev Throws if |tick| > max tick
    /// @param tick The input tick for the calculation
    /// @return sqrtPriceX96 A Q64.96 number representing the sqrt of the price of the given tick
    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
        require(absTick <= uint256(MAX_TICK), 'T');

        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad3866e351d3d25433c : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e6ca3b49e4e4231c52) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db5e04abc4e10c) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7645855363f85e4933939acde) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf98372b7d33237976b7433967bc94443) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf31952d9dec212267f82729a8a7bfd38) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe6852f22b3ed0c3b310a0a4c2b97058a) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd71e4f454f7574715f539ef51a7b45c3) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xbef135a4d3c33299a9b6c08a4740e7b2) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0xa0d927c336183a63f0feb6a74b299e82) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x70570b5853216b5861962b1a8ca6a20b) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x31be1451a3195610d49931b2d71b384e) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x9aa892e217f25a3d0859a2fbb0862078) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x3e15776e82f7e028b3a1682708809203) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x806cc68244e8675df6008b89e3768b5a) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;

        // this divides by 1<<32 rounding up to go from a Q128.128 to a Q128.96.
        // we then downcast to a uint160 to grab the Q64.96 upper bits of the quotient.
        // uint160 is safe because we know ratio is in the range [1/2^96, 2^96]
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    /// @notice Gets the tick corresponding to a given sqrt ratio, s.t. sqrt(1.0001)^tick <= sqrtRatioX96
    /// @dev Throws if sqrtRatioX96 < MIN_SQRT_RATIO or sqrtRatioX96 > MAX_SQRT_RATIO
    /// @param sqrtRatioX96 The sqrt price ratio as a Q64.96
    /// @return tick The corresponding tick
    function getTickAtSqrtRatio(uint160 sqrtRatioX96) internal pure returns (int24 tick) {
        // second inequality must be < because the price can never reach the price at the max tick
        require(sqrtRatioX96 >= 4295128739 && sqrtRatioX96 < 1461446703485210103287273052203988822378723970342, 'R');
        uint256 ratio = uint256(sqrtRatioX96) << 32;

        uint256 r = ratio;
        uint256 msb = 0;

        assembly {
            let f := shl(7, gt(r, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
            r := shr(f, r)
            msb := f

            f := shl(6, gt(r, 0xFFFFFFFFFFFFFFFF))
            r := shr(f, r)
            msb := add(msb, f)

            f := shl(5, gt(r, 0xFFFFFFFF))
            r := shr(f, r)
            msb := add(msb, f)

            f := shl(4, gt(r, 0xFFFF))
            r := shr(f, r)
            msb := add(msb, f)

            f := shl(3, gt(r, 0xFF))
            r := shr(f, r)
            msb := add(msb, f)

            f := shl(2, gt(r, 0xF))
            r := shr(f, r)
            msb := add(msb, f)

            f := shl(1, gt(r, 0x3))
            r := shr(f, r)
            msb := add(msb, f)

            f := gt(r, 0x1)
            msb := add(msb, f)
        }

        if (msb >= 128) {
            ratio = ratio >> (msb - 127);
        } else {
            ratio = ratio << (127 - msb);
        }

        int256 log_2 = (int256(msb) - 128) << 64;

        assembly {
            r := ratio
            let f := shl(7, gt(r, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x800000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := shl(6, gt(r, 0xFFFFFFFFFFFFFFFF))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x400000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := shl(5, gt(r, 0xFFFFFFFF))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x200000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := shl(4, gt(r, 0xFFFF))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x100000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := shl(3, gt(r, 0xFF))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x80000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := shl(2, gt(r, 0xF))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x40000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := shl(1, gt(r, 0x3))
            r := shr(f, r)
            log_2 := add(log_2, shl(f, 0x20000000000000000000000000000000000000000000000000000000000000))

            r := mul(r, r)
            f := gt(r, 0x1)
            log_2 := add(log_2, shl(f, 0x10000000000000000000000000000000000000000000000000000000000000))
        }

        int256 log_sqrt10001 = log_2 * 255738858958803233800634643538189389383321503926522851996; // 1 / log(sqrt(1.0001))

        int24 tickLow = int24((log_sqrt10001 - 306993033534571936990499690326880344012023548324248495034) >> 128);
        int24 tickHi = int24((log_sqrt10001 + 291339195971578304995924720935399539668406567980948927828) >> 128);

        tick = tickLow == tickHi ? tickLow : getSqrtRatioAtTick(tickHi) <= sqrtRatioX96 ? tickHi : tickLow;
    }
}
