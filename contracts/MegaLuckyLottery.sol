// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMegaLuckyLottery} from "../interfaces/IMegaLuckyLottery.sol";
import {IMegaLuckyVault} from "../interfaces/IMegaLuckyVault.sol";

abstract contract MegaLuckyLottery is IMegaLuckyLottery, Ownable, ReentrancyGuard {
    IMegaLuckyVault public vault;
    
    //Stable coin used for ticket purchases cUSD
    IERC20 public paymentToken;

    // Lottery configuration
    uint256 public ticketPrice = 5 * 10**6; // $5 in USDC (6 decimals)
    uint256 public maxTicketsPerPurchase = 100;

    // Lottery state
    LotteryState public currentState;

    uint256 public currentLotteryId;
    uint256 public currentDrawTime;
    uint256 public drawPeriod = 7 days; // Weekly draw by default

    // Winning number (6 digits from 0-9)
    uint8[6] public winningNumbers;

    // Map lottery ID -> all tickets
    mapping(uint256 => Ticket[]) public allTickets;
    // Map user address -> lottery ID -> user tickets
    mapping(address => mapping(uint256 => uint256[])) public userTicketIndices;

    // Prize distribution percentages (in basis points, 100 = 1%)
    uint256 public match1Prize = 500;    // 5%
    uint256 public match2Prize = 500;    // 5%
    uint256 public match3Prize = 500;    // 5%
    uint256 public match4Prize = 1000;   // 10%
    uint256 public match5Prize = 2000;   // 20%
    uint256 public match6Prize = 4000;   // 40%
    uint256 public protocolFee = 1500;   // 15%
    
    // Surplus distribution percentages (in basis points, 100 = 1%)
    uint256 public treasurySurplus = 5000;   // 50%
    uint256 public donationSurplus = 3000;   // 30%
    uint256 public teamSurplus = 2000;       // 20%
    
    // Treasury, donation and team wallets
    address public treasuryWallet;
    address public donationWallet;
    address public teamWallet;

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

        // Grant the contract owner the DEFAULT_ADMIN_ROLE
        //_setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Update lottery configuration (restricted to owner)
     */
    function updateLotteryConfig(
        uint256 _ticketPrice,
        uint256 _maxTicketsPerPurchase,
        uint256 _drawPeriod
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
    function buyCustomTicket(uint8[6] calldata _numbers) external nonReentrant{
        require(currentState == LotteryState.OPEN, "Lottery is not open");
        require(_numbers.length == 6, "Invalid numbers length");
        require(paymentToken.balanceOf(msg.sender) >= ticketPrice, "Insufficient balance");
        
        // Validate numbers (0-9)
        for (uint8 i = 0; i < 6; i++) {
            require(_numbers[i] <= 9, "Numbers must be between 0-9");
        }

        // Transfer payment token from user to contract
        paymentToken.approve(address(this), ticketPrice);
        paymentToken.transferFrom(msg.sender, address(this), ticketPrice);

        _issueTicket(msg.sender, _numbers, false);
    }

    /**
     * @dev Purchase random tickets
     * @param _ticketCount Number of tickets to purchase
     */
    function buyRandomTickets(uint256 _ticketCount) external nonReentrant{
        require(currentState == LotteryState.OPEN, "Lottery is not open");
        require(_ticketCount <= maxTicketsPerPurchase, "Exceeds max tickets per purchase");
        require(paymentToken.balanceOf(msg.sender) >= ticketPrice * _ticketCount, "Insufficient balance");

        // Transfer payment token from user to contract
        paymentToken.approve(address(this), ticketPrice * _ticketCount);
        paymentToken.transferFrom(msg.sender, address(this), ticketPrice * _ticketCount);

        // Generate random numbers for the ticket
        for (uint256 i = 0; i < 6; i++) {
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
     * @dev Close lottery and request random number for drawing
     */
    function closeLottery() external onlyOwner {
        require(currentState == LotteryState.OPEN, "Lottery is not open");
        require(block.timestamp >= currentDrawTime, "Draw time not reached");

        // Draw winning numbers
        for (uint256 i = 0; i < 6; i++) {
            winningNumbers[i] = uint8(uint256(keccak256(abi.encodePacked(block.timestamp, i))) % 10);
        }

        currentState = LotteryState.CALCULATING_WINNER;

        emit WinningNumbersDrawn(currentLotteryId, winningNumbers);
    }

    /**
    * @dev Process all tickets to find winners for each tier
    */
    function _processWinners() internal {}

    
 
}