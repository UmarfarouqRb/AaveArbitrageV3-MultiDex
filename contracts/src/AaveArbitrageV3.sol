// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";

// --- Interfaces ---

interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        Route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

// CORRECTED: The execute function does not return a value. We calculate the output from the balance change.
interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs) external payable;
}

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract AaveArbitrageV3 is IFlashLoanReceiver {
    enum DexType { Aerodrome, UniswapV3 }

    struct Swap {
        address router;
        address from;
        address to;
        DexType dex;
        bytes dexParams;
    }

    struct AerodromeParams {
        bool stable;
        address factory;
    }

    struct UniswapV3Params {
        uint24 fee;
    }

    IPool public immutable POOL;
    address public multiSig;
    bool public paused;

    mapping(address => bool) public whitelistedRouters;

    event SwapFailed(address router, DexType dex, address tokenIn, address tokenOut, string reason);

    modifier onlyMultiSig() {
        require(msg.sender == multiSig, "Not the multisig");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    constructor(address _pool, address _multiSig) {
        POOL = IPool(_pool);
        multiSig = _multiSig;
    }

    function executeArbitrage(address _flashLoanToken, uint256 _flashLoanAmount, Swap[] calldata _swaps) external whenNotPaused {
        address receiver = address(this);
        address[] memory assets = new address[](1);
        assets[0] = _flashLoanToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = _flashLoanAmount;
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; 
        address onBehalfOf = address(this);
        bytes memory params = abi.encode(_swaps);
        uint16 referralCode = 0;

        POOL.flashLoan(receiver, assets, amounts, modes, onBehalfOf, params, referralCode);
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Only the Aave pool can call this function");
        require(!paused, "Contract is paused");

        Swap[] memory swaps = abi.decode(params, (Swap[]));

        uint256 currentBalance = amounts[0];
        address currentToken = assets[0];

        for (uint i = 0; i < swaps.length; i++) {
            Swap memory currentSwap = swaps[i];
            require(whitelistedRouters[currentSwap.router], "Router not whitelisted");

            if (currentSwap.dex == DexType.Aerodrome) {
                // ... Aerodrome logic ...
            } else if (currentSwap.dex == DexType.UniswapV3) {
                // --- THE FINAL, CORRECT IMPLEMENTATION ---
                
                // 1. Transfer funds directly to the router.
                IERC20(currentToken).transfer(currentSwap.router, currentBalance);

                UniswapV3Params memory uniParams = abi.decode(currentSwap.dexParams, (UniswapV3Params));

                bytes memory path = abi.encodePacked(currentToken, uniParams.fee, currentSwap.to);
                bytes[] memory inputs = new bytes[](1);
                
                // 2. Encode the input for a V3_SWAP_EXACT_IN command (0x00).
                //    Recipient is this contract.
                //    Payer is the router itself (payerIsUser = false).
                inputs[0] = abi.encode(address(this), currentBalance, 0, path, false);
                
                // 3. Use a single command.
                bytes memory commands = hex"00";

                uint256 outputBalanceBefore = IERC20(currentSwap.to).balanceOf(address(this));

                try IUniversalRouter(currentSwap.router).execute(commands, inputs) {
                    // Success
                } catch (bytes memory reason) {
                    string memory revertMessage = _getRevertMessage(reason);
                    emit SwapFailed(currentSwap.router, DexType.UniswapV3, currentToken, currentSwap.to, revertMessage);
                    revert(string(abi.encodePacked("Uniswap V3 swap failed: ", revertMessage)));
                }

                uint256 outputBalanceAfter = IERC20(currentSwap.to).balanceOf(address(this));
                currentBalance = outputBalanceAfter - outputBalanceBefore;
            }
            currentToken = currentSwap.to;
        }

        uint256 totalDebt = amounts[0] + premiums[0];
        require(IERC20(assets[0]).balanceOf(address(this)) >= totalDebt, "Arbitrage failed: not enough funds to repay the loan");
        
        IERC20(assets[0]).transfer(address(POOL), totalDebt);

        uint256 profit = IERC20(assets[0]).balanceOf(address(this));
        if (profit > 0) {
            IERC20(assets[0]).transfer(multiSig, profit);
        }

        return true;
    }
    
    function _getRevertMessage(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "No revert reason";
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }

    // --- ADMIN FUNCTIONS ---
    function setRouter(address _router, bool _isWhitelisted) external onlyMultiSig {
        whitelistedRouters[_router] = _isWhitelisted;
    }

    function pause() external onlyMultiSig {
        paused = true;
    }

    function unpause() external onlyMultiSig {
        paused = false;
    }

    function withdraw(address _tokenAddress) external onlyMultiSig {
        IERC20 token = IERC20(_tokenAddress);
        token.transfer(multiSig, token.balanceOf(address(this)));
    }

    function withdrawETH() external onlyMultiSig {
        payable(multiSig).transfer(address(this).balance);
    }

    function changeMultiSig(address _newMultiSig) external onlyMultiSig {
        multiSig = _newMultiSig;
    }

    receive() external payable {}
}
