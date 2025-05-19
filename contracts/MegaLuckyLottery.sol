// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMegaLuckyLottery} from "../interfaces/IMegaLuckyLottery.sol";
import {IMegaLuckyVault} from "../interfaces/IMegaLuckyVault.sol";

contract MegaLuckyLottery is IMegaLuckyLottery, Ownable, ReentrancyGuard {
    IMegaLuckyVault public vault;
    
    //Stable coin used for ticket purchases cUSD
    IERC20 public paymentToken;

    uint256 public totalPrizes;

    LotteryState public currentState;

    uint8[6] public winningNumbers;

    // Ticket price (5 cUSD with 18 decimals)
    uint256 public ticketPrice = 5 * 10**18; // 5 cUSD

    uint16 public maxTicketsPerPurchase = 100;

    // For lottery ID, uint32 can handle decades of lotteries
    uint32 public currentLotteryId;

    uint256 public currentDrawTime;
    uint256 public drawPeriod = 7 days; // Weekly draw by default

    uint16 public match1Prize = 500;    // 5%
    uint16 public match2Prize = 500;    // 5%
    uint16 public match3Prize = 500;    // 5%
    uint16 public match4Prize = 1000;   // 10%
    uint16 public match5Prize = 2000;   // 20%
    uint16 public match6Prize = 4000;   // 40%
    uint16 public protocolFee = 1500;   // 15% 
    
    // Treasury, donation and team wallets
    address public treasuryWallet;
    address public donationWallet;
    address public teamWallet;

    // Change mappings to use smaller types where possible
    mapping(uint32 => Ticket[]) public allTickets; // uint32 for lottery ID
    mapping(address => mapping(uint32 => uint256[])) public userTicketIndices;
    mapping(uint32 => address[]) public winnersAddresses;

    // Map lottery ID -> Winner address -> tier -> winner count
    mapping(uint32 => mapping(address => mapping(uint8 => uint16))) public winners;

    // Map lottery ID -> processed status
    mapping(uint32 => mapping(address => bool)) private processedWinners;

    constructor(
        address _paymentToken,
        address _treasuryWallet,
        address _donationWallet,
        address _teamWallet
    ) Ownable(msg.sender){
        paymentToken = IERC20(_paymentToken);
        treasuryWallet = _treasuryWallet;
        donationWallet = _donationWallet;
        teamWallet = _teamWallet;

        // Set initial lottery state to CLOSED
        currentState = LotteryState.CLOSED;
    }

    /**
     * @dev Set or update the vault address
     * @param _vaultAddress Address of the vault contract
     */
    function setVaultAddress(address _vaultAddress) external onlyOwner {
        require(_vaultAddress != address(0), "Invalid vault address");
        vault = IMegaLuckyVault(_vaultAddress);
        emit VaultAddressUpdated(address(vault), _vaultAddress);
    }
    
    /**
     * @dev Update lottery configuration (restricted to owner)
     */
    function updateLotteryConfig(
        uint64 _ticketPrice,
        uint16 _maxTicketsPerPurchase,
        uint64 _drawPeriod
    ) external onlyOwner {
        require(currentState == LotteryState.CLOSED, "Cannot update during active lottery");
        
        ticketPrice = _ticketPrice;
        maxTicketsPerPurchase = _maxTicketsPerPurchase;
        drawPeriod = _drawPeriod;
    }

    /**
     * @dev Start a new lottery round
     */
    function startLottery() external onlyOwner {
        require(currentState == LotteryState.CLOSED, "Lottery is already open");
        
        currentLotteryId++;
        currentDrawTime = block.timestamp + drawPeriod;
        currentState = LotteryState.OPEN;

        emit LotteryOpened(currentLotteryId, currentDrawTime);
    }

    /**
     * @dev Purchase ticket with custom numbers
     * @param _numbers 6 numbers from 0-9 chosen by user
     */
    function buyCustomTicket(uint8[6] calldata _numbers) external nonReentrant {
        require(currentState == LotteryState.OPEN, "Lottery is not open");
        require(_numbers.length == 6, "Invalid numbers length");
        require(paymentToken.balanceOf(msg.sender) >= ticketPrice, "Insufficient balance");
        
        // Validate numbers (0-9)
        for (uint8 i = 0; i < 6; i++) {
            require(_numbers[i] <= 9, "Numbers must be between 0-9");
        }

        bool success = paymentToken.transferFrom(msg.sender, address(vault), ticketPrice);
        require(success, "Payment transfer failed");
        
        // Notify the vault about the received funds
        vault.recordDeposit(ticketPrice);

        // Issue the ticket
        _issueTicket(msg.sender, _numbers, true);
    }

    /**
     * @dev Purchase random tickets
     * @param _ticketCount Number of tickets to purchase
     */
    function buyRandomTickets(uint256 _ticketCount) external nonReentrant {
        require(currentState == LotteryState.OPEN, "Lottery is not open");
        require(_ticketCount <= maxTicketsPerPurchase, "Exceeds max tickets per purchase");
        require(paymentToken.balanceOf(msg.sender) >= ticketPrice * _ticketCount, "Insufficient balance");

        // Transfer payment token DIRECTLY to vault (not to this contract)
        bool success = paymentToken.transferFrom(msg.sender, address(vault), ticketPrice * _ticketCount);
        require(success, "Payment transfer failed");
        
        // Notify the vault about the received funds
        vault.recordDeposit(ticketPrice * _ticketCount);

        // Generate random numbers for EACH ticket
        for (uint256 i = 0; i < _ticketCount; i++) {
            uint8[6] memory numbers = _generateRandomTicketNumbers(
                uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, i))) //seed
            );

            _issueTicket(msg.sender, numbers, false);
        }
    }

    /**
     * @dev Internal function to issue a ticket
     */
    function _issueTicket(address _buyer ,uint8[6] memory _numbers, bool _isCustom) internal{

        // Create a new ticket
        Ticket memory newTicket = Ticket({
            owner: _buyer,
            numbers: _numbers,
            isCustom: _isCustom
        });

        // Store the ticket in the lottery
        allTickets[currentLotteryId].push(newTicket);
        uint256 ticketIndex = allTickets[currentLotteryId].length - 1;
        userTicketIndices[_buyer][currentLotteryId].push(ticketIndex);

        emit TicketPurchased(_buyer, currentLotteryId, ticketIndex, _numbers);
    }

    /**
     * @dev Generate random ticket numbers
     */
    function _generateRandomTicketNumbers(uint256 _seed) internal pure returns (uint8[6] memory) {
        uint8[6] memory numbers;
        
        for (uint8 i = 0; i < 6; i++) {
            numbers[i] = uint8(uint256(keccak256(abi.encodePacked(_seed, i))) % 10);
        }
        
        return numbers;
    }

    /**
     * @dev Close lottery and draw winning numbers
     */
    function closeLottery() external onlyOwner {
        require(currentState == LotteryState.OPEN, "Lottery is not open");
        require(block.timestamp >= currentDrawTime, "Draw time not reached");

        // Draw winning numbers
        //for (uint8 i = 0; i < 6; i++) {
        //    winningNumbers[i] = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, i))) % 10);
        //}

        for (uint8 i = 0; i < 6; i++) {
            winningNumbers[i] = i + 1;
        }

        uint16[7] memory amountWinnersPerTier = _processWinners();
        uint256[7] memory prizesPerTier = _calculatePrizePerTier();
        uint256[7] memory amountsPerTier = _calculatePrizePerWinner(amountWinnersPerTier, prizesPerTier);
        
        _calculateTotalPrizes(amountsPerTier, amountWinnersPerTier);

        require(totalPrizes <= vault.getCurrentLotteryPool(), "Insufficient funds in pool");

        vault.distributePrizes(amountsPerTier);
        vault.distributeFees(treasuryWallet, donationWallet, teamWallet);

        currentState = LotteryState.CLOSED;

        emit WinningNumbersDrawn(currentLotteryId, winningNumbers);
    }

    /**
     * @dev Process all tickets to find winners for each tier
     */
    function _processWinners() internal returns (uint16[7] memory) { 
        Ticket[] storage tickets = allTickets[currentLotteryId];
        
        // Clear previous winners array
        delete winnersAddresses[currentLotteryId];
        
        // Count winners for each tier
        uint16[7] memory winnerCounts;  
        
        for (uint256 i = 0; i < tickets.length; i++) {
            Ticket storage ticket = tickets[i];
            uint8 matchCount = _countMatches(ticket.numbers);
            
            if (matchCount > 0) {
                // Increment winner count for this tier
                winnerCounts[matchCount]++;
                
                // Record winner's ticket count for this tier
                winners[currentLotteryId][ticket.owner][matchCount]++;
                
                // Only add to winnersAddresses once per address
                if (!processedWinners[currentLotteryId][ticket.owner]) {
                    winnersAddresses[currentLotteryId].push(ticket.owner);
                    processedWinners[currentLotteryId][ticket.owner] = true;
                }
            }
        }
        
        return winnerCounts;
    }

    function _calculatePrizePerTier() internal view returns (uint256[7] memory) {
        uint256 totalPool = vault.getCurrentLotteryPool();
        uint256[7] memory prizes;

        prizes[1] = (totalPool * match1Prize) / 10000;
        prizes[2] = (totalPool * match2Prize) / 10000;
        prizes[3] = (totalPool * match3Prize) / 10000;
        prizes[4] = (totalPool * match4Prize) / 10000;
        prizes[5] = (totalPool * match5Prize) / 10000;
        prizes[6] = (totalPool * match6Prize) / 10000;

        return prizes;
    }

    function _calculatePrizePerWinner(uint16[7] memory winnersPerTier, uint256[7] memory prizesPerTier) internal pure returns (uint256[7] memory) {
        
        uint256[7] memory amounts;

        for (uint8 tier = 1; tier <= 6; tier++) {
            amounts[tier] = winnersPerTier[tier] > 0 ? prizesPerTier[tier] / winnersPerTier[tier] : 0;
        }
        
        return amounts;
    }

    /**
     * @dev Count how many numbers match from left to right
     */
    function _countMatches(uint8[6] memory _numbers) internal view returns (uint8) {
        uint8 matchCount = 0;
        
        for (uint8 i = 0; i < 6; i++) {
            if (_numbers[i] == winningNumbers[i]) {
                matchCount++;
            } else {
                break; // Stop counting if a mismatch is found
            }
        }
        
        return matchCount;
    }


    function getWinnersAddresses() external view returns (address[] memory){
        return winnersAddresses[currentLotteryId];
    }
    
    /**
     * @dev Get the number of winning tickets for a specific owner and tier
     * @param owner The address of the ticket owner
     * @param tier The winning tier (1-6 matches)
     * @return Number of winning tickets for this owner in this tier
     */
    function getWinnerCount(address owner, uint8 tier) external view returns (uint16) {
        return winners[currentLotteryId][owner][tier];
    }

    /**
     * @dev Get winning numbers for the current lottery
     * @return Array of winning numbers
     */
    function getWinningNumbers() external view returns (uint256[] memory) {
        uint256[] memory numbers = new uint256[](6);
        for (uint8 i = 0; i < 6; i++) {
            numbers[i] = winningNumbers[i];
        }
        return numbers;
    }

    /**
     * @dev Get user's tickets with their numbers for the current lottery
     * @param user Address of the user
     * @return An array of structs containing the ticket numbers
     */
    function getUserTickets(address user) external view returns (uint8[6][] memory) {
        uint256[] memory indices = userTicketIndices[user][currentLotteryId];
        uint8[6][] memory ticketNumbers = new uint8[6][](indices.length);
        
        for (uint256 i = 0; i < indices.length; i++) {
            ticketNumbers[i] = allTickets[currentLotteryId][indices[i]].numbers;
        }
        
        return ticketNumbers;
    }

    /**
     * @dev Calculate total potential prizes for the current lottery
     * @param amountsPerTier Prize amount per winner for each tier
     * @param amountWinnersPerTier Number of winners for each tier
     */
    function _calculateTotalPrizes(uint256[7] memory amountsPerTier, uint16[7] memory amountWinnersPerTier) internal {
        totalPrizes = 0;
        // Calculate prize for this winner across all tiers
        for (uint8 tier = 1; tier <= 6; tier++) {
            totalPrizes += amountsPerTier[tier] * amountWinnersPerTier[tier];
        }
    }

    /**
     * @dev Get the total prize amount for the current lottery
     * @return Total prize amount to be distributed
     */
    function getTotalPrizes() external view returns (uint256) {
        return totalPrizes;
    }

}