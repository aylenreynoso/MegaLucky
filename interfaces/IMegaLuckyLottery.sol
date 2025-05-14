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
    event VaultAddressUpdated(address indexed oldVault, address indexed newVault);
    
    /*///////////////////////////////////////////////////////////////
                              VIEWS
    //////////////////////////////////////////////////////////////*/
    function getWinningNumbers() external view returns (uint256[] memory);
    function getUserTickets(address user) external view returns (uint256[] memory);
    function getTotalPrizes() external view returns (uint256);
    function getWinnerCount(address owner, uint8 tier) external view returns (uint16);
    function getWinnersAddresses() external view returns (address[] memory);

    /*///////////////////////////////////////////////////////////////
                              LOGIC
    //////////////////////////////////////////////////////////////*/
    function startLottery() external;
    function buyRandomTickets(uint256 _ticketCount) external;
    function buyCustomTicket(uint8[6] calldata _numbers) external;
    function closeLottery() external;
    
}