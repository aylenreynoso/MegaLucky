// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IMegaLuckyVault {

    /*///////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/
    event DepositRecorded(uint256 amount);
    event PrizesDistributed(address winner, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);
    event FundsDeposited(address indexed from, uint256 amount);
    event LotteryAddressUpdated(address indexed oldLottery, address indexed newLottery);
    event FeesDistributed(address treasury, address donation, address team, uint256 total);
    
    /*///////////////////////////////////////////////////////////////
                              VIEWS
    //////////////////////////////////////////////////////////////*/
    function getVaultBalance() external view returns (uint256);
    function getCurrentLotteryPool() external view returns (uint256);

    /*///////////////////////////////////////////////////////////////
                              LOGIC
    //////////////////////////////////////////////////////////////*/
    function recordDeposit(uint256 amount) external;
    function distributePrizes(uint256[7] calldata amountsPerTier) external;
    function distributeFees(address treasuryWallet, address donationWallet, address teamWallet)
        external;
    function updateLotteryAddress(address _newLottery) external;
    //function withdrawFunds(address to, uint256 amount) external;
    
}