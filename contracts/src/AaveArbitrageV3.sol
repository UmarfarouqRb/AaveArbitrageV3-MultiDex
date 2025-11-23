// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {MultiV3Executor, Swap} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AaveArbitrageV3 is IFlashLoanSimpleReceiver, MultiV3Executor {
    IPool public constant LENDING_POOL = IPool(0x794a61358D6845594F94dc1DB02A252b5b4814aD);
    uint16 public keeperFeeBps = 1000;

    constructor(address _owner) MultiV3Executor(_owner) {}

    function ADDRESSES_PROVIDER() public view override returns (IPoolAddressesProvider) {
        return LENDING_POOL.ADDRESSES_PROVIDER();
    }

    function POOL() public view override returns (IPool) {
        return LENDING_POOL;
    }

    function executeArbitrage(
        address asset,
        uint256 amount,
        Swap[] memory _swaps
    ) external {
        require(_swaps.length > 0, "No swaps");
        bytes memory params = abi.encode(_swaps);

        LENDING_POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0 // referralCode
        );
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(LENDING_POOL), "Non-lending pool");

        Swap[] memory swaps = abi.decode(params, (Swap[]));

        _executeSwaps(swaps, amount);

        uint256 profit = IERC20(asset).balanceOf(address(this)) - amount;

        _distributeProfit(profit, asset);

        uint256 amountToReturn = amount + premium;
        approveToken(asset, address(LENDING_POOL), amountToReturn);

        return true;
    }

    function setKeeperFee(uint16 _fee) external onlyOwner {
        keeperFeeBps = _fee;
    }

    function _distributeProfit(uint256 _profit, address _asset) internal {
        uint256 keeperAmount = (_profit * keeperFeeBps) / 10000;
        IERC20(_asset).transfer(msg.sender, keeperAmount);
        IERC20(_asset).transfer(owner(), _profit - keeperAmount);
    }

    function withdraw(address _token, address _to) external onlyOwner {
        IERC20(_token).transfer(_to, IERC20(_token).balanceOf(address(this)));
    }
}
