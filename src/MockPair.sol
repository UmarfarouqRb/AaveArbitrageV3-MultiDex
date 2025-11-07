// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IUniswapV2Pair.sol";

contract MockPair is IUniswapV2Pair {
    uint public price0CumulativeLast;
    uint public price1CumulativeLast;
    address private _token0;
    address private _token1;

    constructor(address tokenA, address tokenB) {
        _token0 = tokenA;
        _token1 = tokenB;
    }

    function token0() external view returns (address) {
        return _token0;
    }

    function token1() external view returns (address) {
        return _token1;
    }

    function setCumulativePrices(uint _price0, uint _price1) public {
        price0CumulativeLast = _price0;
        price1CumulativeLast = _price1;
    }

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        return (1000e18, 1000e18, uint32(block.timestamp));
    }

    // Add dummy implementations for the rest of the IUniswapV2Pair interface
    function name() external pure returns (string memory) { return "Mock Pair"; }
    function symbol() external pure returns (string memory) { return "MP"; }
    function decimals() external pure returns (uint8) { return 18; }
    function totalSupply() external view returns (uint) { return 0; }
    function balanceOf(address owner) external view returns (uint) { return 0; }
    function allowance(address owner, address spender) external view returns (uint) { return 0; }
    function approve(address spender, uint value) external returns (bool) { return true; }
    function transfer(address to, uint value) external returns (bool) { return true; }
    function transferFrom(address from, address to, uint value) external returns (bool) { return true; }
    function DOMAIN_SEPARATOR() external view returns (bytes32) { return bytes32(0); }
    function PERMIT_TYPEHASH() external pure returns (bytes32) { return bytes32(0); }
    function nonces(address owner) external view returns (uint) { return 0; }
    function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external {}
    function MINIMUM_LIQUIDITY() external pure returns (uint) { return 0; }
    function factory() external view returns (address) { return msg.sender; }
    function kLast() external view returns (uint) { return 0; }
    function mint(address to) external returns (uint liquidity) { liquidity = 0; }
    function burn(address to) external returns (uint amount0, uint amount1) { amount0 = 0; amount1 = 0; }
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external {}
    function skim(address to) external {}
    function sync() external {}
}
