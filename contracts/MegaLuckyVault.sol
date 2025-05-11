// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IMegaLuckyLottery} from "../interfaces/IMegaLuckyLottery.sol";
import {IMegaLuckyVault} from "../interfaces/IMegaLuckyVault.sol";

/**
 * @title MegaLuckyVault
 * @dev Vault contract for managing lottery funds
 */
contract MegaLuckyVault is IMegaLuckyVault, Ownable, AccessControl, ReentrancyGuard {
    IERC20 public paymentToken;
    IMegaLuckyLottery public lottery;

    // Role definitions
    bytes32 public constant LOTTERY_ROLE = keccak256("LOTTERY_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    constructor(address _paymentToken, address _lottery) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
        lottery = IMegaLuckyLottery(_lottery);

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(LOTTERY_ROLE, _lottery);
    }
    
    function withdrawToLottery(uint256 _amount) external onlyOwner {
        paymentToken.transfer(address(lottery), _amount);
    }
    
    function getVaultBalance() external view returns (uint256) {
        return paymentToken.balanceOf(address(this));
    }

    /**
     * @dev Updates the lottery contract address
     * @param _newLottery Address of the new lottery contract
     */
    function updateLotteryAddress(address _newLottery) external onlyRole(ADMIN_ROLE) {
        require(_newLottery != address(0), "Invalid address");
        address oldLottery = address(lottery);
        
        // Revoke and grant roles
        _revokeRole(LOTTERY_ROLE, oldLottery);
        _grantRole(LOTTERY_ROLE, _newLottery);
        
        lottery = IMegaLuckyLottery(_newLottery);
        emit LotteryAddressUpdated(oldLottery, _newLottery);
    }

}