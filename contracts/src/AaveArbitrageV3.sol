// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {MultiV3Executor, Swap} from "src/MultiV3Executor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AaveArbitrageV3 is IFlashLoanSimpleReceiver, MultiV3Executor {
    IPool public LENDING_POOL;
    uint16 public keeperFeeBps = 1000;

    constructor(address _owner, address _poolAddress) MultiV3Executor(_owner) {
        LENDING_POOL = IPool(_poolAddress);
    }

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
        bytes memory params = abi.encode(msg.sender, _swaps);

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

        (address keeper, Swap[] memory swaps) = abi.decode(params, (address, Swap[]));

        _executeSwaps(swaps, amount);

        uint256 amountToReturn = amount + premium;
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        require(currentBalance > amountToReturn, "No profit made");
        uint256 profit = currentBalance - amountToReturn;

        _distributeProfit(profit, asset, keeper);

        approveToken(asset, address(LENDING_POOL), amountToReturn);

        return true;
    }

    function setKeeperFee(uint16 _fee) external onlyOwner {
        keeperFeeBps = _fee;
    }

    function setPool(address _newPool) external onlyOwner {
        LENDING_POOL = IPool(_newPool);
    }

    function _distributeProfit(uint256 _profit, address _asset, address _keeper) internal {
        uint256 keeperAmount = (_profit * keeperFeeBps) / 10000;
        IERC20(_asset).transfer(_keeper, keeperAmount);
        IERC20(_asset).transfer(owner(), _profit - keeperAmount);
    }

    function withdraw(address _token, address _to) external onlyOwner {
        IERC20(_token).transfer(_to, IERC20(_token).balanceOf(address(this)));
    }
}
