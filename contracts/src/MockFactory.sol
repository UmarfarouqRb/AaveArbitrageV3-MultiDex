// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockPair.sol";
import "./interfaces/IUniswapV2Factory.sol";

contract MockFactory is IUniswapV2Factory {
    mapping(address => mapping(address => address)) public override getPair;
    address[] public allPairs;

    function allPairsLength() external view override returns (uint) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "UniswapV2: PAIR_EXISTS");
        pair = address(new MockPair(token0, token1));
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
    }

    function feeTo() external view override returns (address) { return address(0); }
    function feeToSetter() external view override returns (address) { return address(0); }
    function setFeeTo(address) external virtual {}
    function setFeeToSetter(address) external virtual {}
}
