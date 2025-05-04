// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IMegaLuckyLottery {

    /*///////////////////////////////////////////////////////////////
                              STRUCTS
    //////////////////////////////////////////////////////////////*/

    struct Ticket {
        address owner;
        uint8[6] numbers;
        bool isCustom; // Whether user picked numbers or got random
    }

    enum LotteryState { CLOSED, OPEN, CALCULATING_WINNER }


    /*///////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/
    
    event LotteryOpened(uint256 indexed lotteryId, uint256 drawTime);
    event TicketPurchased(address indexed buyer, uint256 indexed lotteryId, uint256 ticketIndex, uint8[6] numbers);
    event WinningNumbersDrawn(uint256 indexed lotteryId, uint8[6] winningNumbers);
    event PrizeClaimed(address indexed winner, uint256 indexed lotteryId, uint8 matchCount, uint256 prize);
    

    /*///////////////////////////////////////////////////////////////
                              VIEWS
    //////////////////////////////////////////////////////////////*/
    function getWinningNumbers() external view returns (uint256[] memory);
    function getPrizeDistribution() external view returns (uint256[6] memory);
    function getUserTickets(address user) external view returns (uint256[] memory);
    function getPrizePool() external view returns (uint256);
    

    /*///////////////////////////////////////////////////////////////
                              LOGIC
    //////////////////////////////////////////////////////////////*/
    function startLottery() external;
    function buyRandomTickets(uint256 _ticketCount) external;
    function buyCustomTicket(uint8[6] calldata _numbers) external;
    function closeLottery() external;
    
}