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

    // Current lottery deposit
    uint256 public currentLotteryPool = 0;

    // Surplus distribution percentages (in basis points, 100 = 1%)
    uint256 public treasurySurplusPercentage = 5000;   // 50%
    uint256 public donationSurplusPercentage = 3000;   // 30%
    uint256 public teamSurplusPercentage = 2000;       // 20%

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

    /**
     * @dev Records a deposit without transferring tokens (lottery handles transfer)
     */
    function recordDeposit(uint256 amount) external onlyRole(LOTTERY_ROLE) {
        currentLotteryPool += amount;
        emit DepositRecorded(amount);
    }

    /**
     * @dev Distribute prizes to multiple winners
     */
    function distributePrizes(uint256[7] calldata amountsPerTier)
        external
        nonReentrant
        onlyRole(LOTTERY_ROLE)
    {
        require(lottery.getTotalPrizes() <= currentLotteryPool, "Insufficient funds in pool");

        address[] memory winners = lottery.getWinnersAddresses();

        for (uint256 i = 0; i < winners.length; i++){
            _sendPrize(winners[i], amountsPerTier);
        }
    }

    function _sendPrize(address winner, uint256[7] calldata amountsPerTier) internal {
        uint256 totalPrize = 0;
        
        for (uint8 i = 1; i < amountsPerTier.length; i++) {
            // Check if the winner has won in this tier
            uint256 amountTicketsPerTier = lottery.getWinnerCount(winner, i);
            if (amountTicketsPerTier > 0){
                totalPrize += amountsPerTier[i] * amountTicketsPerTier;
            }
        }
        
        // Only process if there's a prize to send
        if (totalPrize > 0) {
            // Add this line to actually transfer the tokens to the winner
            require(paymentToken.transfer(winner, totalPrize), "Prize transfer failed");
            
            // Update the pool balance
            currentLotteryPool -= totalPrize;

            emit PrizesDistributed(winner, totalPrize);
        }
    }

    /**
     * @dev Distribute fees to treasury, donation and team wallets
     */
    function distributeFees(
        address treasuryWallet,
        address donationWallet,
        address teamWallet
    )
        external
        nonReentrant
        onlyRole(LOTTERY_ROLE)
    {
        require(treasuryWallet != address(0), "Invalid treasury wallet");
        require(donationWallet != address(0), "Invalid donation wallet");
        require(teamWallet != address(0), "Invalid team wallet");
        
        uint256 treasuryAmount = (currentLotteryPool * treasurySurplusPercentage) / 10000;
        uint256 donationAmount = (currentLotteryPool * donationSurplusPercentage) / 10000;
        uint256 teamAmount = (currentLotteryPool * teamSurplusPercentage) / 10000;
        
        require(paymentToken.transfer(treasuryWallet, treasuryAmount), "Treasury transfer failed");
        require(paymentToken.transfer(donationWallet, donationAmount), "Donation transfer failed");
        require(paymentToken.transfer(teamWallet, teamAmount), "Team transfer failed");
        
        uint256 totalDistributed = treasuryAmount + donationAmount + teamAmount;
        currentLotteryPool -= totalDistributed;
        
        emit FeesDistributed(treasuryWallet, donationWallet, teamWallet, totalDistributed);
    }
    
    function getVaultBalance() external view returns (uint256) {
        return paymentToken.balanceOf(address(this));
    }

    function getCurrentLotteryPool() external view returns (uint256) {
        return currentLotteryPool;
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