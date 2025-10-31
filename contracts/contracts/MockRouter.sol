// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "./MockERC20.sol";

/*
MockRouter: simplistic router that when swapExactTokensForTokens is called,
it transfers back a deterministic amount to recipient based on a multiplier.
Used only for tests to simulate profitable (or unprofitable) swaps.
*/
contract MockRouter {
    uint256 public multiplierNumerator;
    uint256 public multiplierDenominator;
    address public owner;

    constructor(uint256 num, uint256 den) {
        multiplierNumerator = num;
        multiplierDenominator = den;
        owner = msg.sender;
    }

    function swapExactTokensForTokens(uint amountIn, uint /*amountOutMin*/, address[] calldata path, address to, uint /*deadline*/) external returns (uint[] memory amounts) {
        // path[0] is input token, path[last] is output
        address outToken = path[path.length - 1];
        MockERC20(outToken).mint(to, (amountIn * multiplierNumerator) / multiplierDenominator);
        amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = (amountIn * multiplierNumerator) / multiplierDenominator;
    }
}
