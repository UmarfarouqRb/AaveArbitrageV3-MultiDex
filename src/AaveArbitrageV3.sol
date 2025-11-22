// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// --- DEX Interfaces ---
interface IUniswapV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint deadline;
        uint amountIn;
        uint amountOutMinimum;
    }
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

// --- Main Contract ---
contract AaveArbitrageV3 is Ownable {
    using SafeERC20 for IERC20;

    // --- Structs & Enums ---
    enum DexName { UniswapV3, PancakeV3, Aerodrome }

    struct V3Dex {
        address router;
        address factory;
        uint24[] fees;
    }

    struct Swap {
        DexName dex;
        address from;
        address to;
        uint256 amountOutMin;
    }

    // --- State Variables ---
    IPool public constant POOL = IPool(0x4891269533a231F3385542718820465551949A47);
    address public immutable multiSig;
    mapping(DexName => V3Dex) public dexes;

    // --- Events ---
    event PreSwap(address indexed router, address indexed tokenIn, uint256 amountIn);
    event PostSwap(address indexed router, address indexed tokenOut, uint256 amountOut);
    event RepaymentCheck(address indexed loanToken, uint256 balance, uint256 totalDebt);


    // --- Errors ---
    error ArbitrageFailed(string reason);

    // --- Constructor ---
    constructor(address _multiSig) Ownable(msg.sender) {
        multiSig = _multiSig;
    }

    // --- External Functions ---
    function setDex(DexName _dex, address _router, address _factory, uint24[] calldata _fees) external onlyOwner {
        dexes[_dex] = V3Dex(_router, _factory, _fees);
    }

    function executeArbitrage(address _flashLoanToken, uint256 _flashLoanAmount, Swap[] calldata _swaps) external onlyOwner {
        address[] memory assets = new address[](1);
        assets[0] = _flashLoanToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _flashLoanAmount;
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // No interest
        bytes memory params = abi.encode(_swaps);
        POOL.flashLoan(address(this), assets, amounts, modes, address(this), params, 0);
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address, // initiator
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(POOL), "Not from Aave Pool");

        Swap[] memory swaps = abi.decode(params, (Swap[]));
        address lastToken = address(0);

        for (uint i = 0; i < swaps.length; i++) {
            _executeV3Swap(swaps[i]);
            lastToken = swaps[i].to;
        }

        address loanToken = assets[0];
        require(lastToken == loanToken, "Final token is not the loan token");

        uint256 finalBalance = IERC20(loanToken).balanceOf(address(this));
        uint256 totalDebt = amounts[0] + premiums[0];

        emit RepaymentCheck(loanToken, finalBalance, totalDebt);

        if (finalBalance < totalDebt) {
            revert ArbitrageFailed("Not enough funds to repay the loan");
        }

        IERC20(loanToken).approve(address(POOL), totalDebt);

        uint256 profit = finalBalance - totalDebt;
        if (profit > 0) {
            IERC20(loanToken).safeTransfer(multiSig, profit);
        }

        return true;
    }

    // --- Internal Functions ---
    function _executeV3Swap(Swap memory _swap) internal {
        V3Dex storage dex = dexes[_swap.dex];
        uint256 amountIn = IERC20(_swap.from).balanceOf(address(this));

        emit PreSwap(dex.router, _swap.from, amountIn);

        (address pool, uint24 feeTier) = findPool(dex.factory, _swap.from, _swap.to, dex.fees);
        require(pool != address(0), "No V3 pool found");

        bytes memory path = abi.encodePacked(_swap.from, feeTier, _swap.to);

        IERC20(_swap.from).approve(dex.router, amountIn);

        IUniswapV3Router.ExactInputParams memory params = IUniswapV3Router.ExactInputParams({
            path: path,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: _swap.amountOutMin
        });

        uint256 amountOut = IUniswapV3Router(dex.router).exactInput(params);

        emit PostSwap(dex.router, _swap.to, amountOut);
    }

    function findPool(address factory, address tokenA, address tokenB, uint24[] storage fees)
        internal view returns (address pool, uint24 feeTier)
    {
        for (uint i = 0; i < fees.length; i++) {
            pool = IUniswapV3Factory(factory).getPool(tokenA, tokenB, fees[i]);
            if (pool != address(0)) {
                feeTier = fees[i];
                return (pool, feeTier);
            }
        }
    }

    function withdraw(address _token) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), IERC20(_token).balanceOf(address(this)));
    }

    receive() external payable {}
}
