// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IMegaLuckyLottery} from "../interfaces/IMegaLuckyLottery.sol";

/**
 * @title MegaLuckyVault
 * @dev Vault contract for managing lottery funds
 */
contract MegaLuckyVault is Ownable, ReentrancyGuard {
    IERC20 public paymentToken;
    IMegaLuckyLottery public lottery;
    
    constructor(address _paymentToken, address _lottery) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        lottery = IMegaLuckyLottery(_lottery);
    }
    
    function withdrawToLottery(uint256 _amount) external onlyOwner {
        paymentToken.transfer(address(lottery), _amount);
    }
    
    function getVaultBalance() external view returns (uint256) {
        return paymentToken.balanceOf(address(this));
    }
}