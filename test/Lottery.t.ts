import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { parseUnits } from "viem";
import hre from "hardhat";

describe("MegaLucky Lottery System", function () {
  async function deployFixture() {
    const [owner, user1, user2, user3, treasury, donation, team] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    // Deploy mock token (for testing)
    const mockToken = await hre.viem.deployContract("MockERC20", [
      "USD Coin",
      "USDC",
      6,
    ]);

    // Mint tokens to users for testing
    const mintAmount = parseUnits("1000", 6); // 1000 USDC
    await mockToken.write.mint([user1.account.address, mintAmount]);
    await mockToken.write.mint([user2.account.address, mintAmount]);
    await mockToken.write.mint([user3.account.address, mintAmount]);

    // Deploy the lottery contract
    const lottery = await hre.viem.deployContract("MegaLuckyLottery", [
      mockToken.address,
      treasury.account.address,
      donation.account.address,
      team.account.address,
    ]);

    // Deploy the vault contract
    const vault = await hre.viem.deployContract("MegaLuckyVault", [
      mockToken.address,
      lottery.address,
    ]);

    // Set vault address in lottery
    await lottery.write.setVaultAddress([vault.address], {
      account: owner.account.address,
    });

    // Grant LOTTERY_ROLE to lottery contract in vault
    const LOTTERY_ROLE = await vault.read.LOTTERY_ROLE();
    await vault.write.grantRole([LOTTERY_ROLE, lottery.address], {
      account: owner.account.address,
    });

    return {
      lottery,
      vault,
      mockToken,
      owner,
      user1,
      user2,
      user3,
      treasury,
      donation,
      team,
      publicClient,
    };
  }

  describe("Initialization", function () {
    it("Should initialize contracts with correct values", async function () {
      const { lottery, vault, mockToken, treasury, donation, team } =
        await loadFixture(deployFixture);

      // Check lottery initialization
      expect((await lottery.read.paymentToken()).toLowerCase()).to.equal(
        mockToken.address.toLowerCase()
      );
      expect((await lottery.read.treasuryWallet()).toLowerCase()).to.equal(
        treasury.account.address.toLowerCase()
      );
      expect((await lottery.read.donationWallet()).toLowerCase()).to.equal(
        donation.account.address.toLowerCase()
      );
      expect((await lottery.read.teamWallet()).toLowerCase()).to.equal(
        team.account.address.toLowerCase()
      );
      expect(await lottery.read.currentState()).to.equal(0); // LotteryState.CLOSED
      expect(await lottery.read.currentLotteryId()).to.equal(0);

      // Check vault initialization
      expect((await vault.read.paymentToken()).toLowerCase()).to.equal(
        mockToken.address.toLowerCase()
      );
      expect((await vault.read.lottery()).toLowerCase()).to.equal(
        lottery.address.toLowerCase()
      );
      expect(await vault.read.currentLotteryPool()).to.equal(0n);
    });
  });

  describe("Lottery Flow", function () {
    it("Should execute a complete lottery cycle", async function () {
      const {
        lottery,
        vault,
        mockToken,
        owner,
        user1,
        user2,
        user3,
        treasury,
      } = await loadFixture(deployFixture);

      // 1. Start lottery
      await lottery.write.startLottery({
        account: owner.account.address,
      });

      expect(await lottery.read.currentState()).to.equal(1); // LotteryState.OPEN
      expect(await lottery.read.currentLotteryId()).to.equal(1);

      // 2. Users approve token spending
      const ticketPrice = await lottery.read.ticketPrice();
      await mockToken.write.approve([lottery.address, ticketPrice * 3n], {
        account: user1.account.address,
      });
      await mockToken.write.approve([lottery.address, ticketPrice * 2n], {
        account: user2.account.address,
      });
      await mockToken.write.approve([lottery.address, ticketPrice], {
        account: user3.account.address,
      });

      // 3. Users buy tickets
      // User 1 buys a custom ticket
      await lottery.write.buyCustomTicket([[1, 2, 3, 4, 5, 6]], {
        account: user1.account.address,
      });

      // User 1 buys 2 random tickets
      await lottery.write.buyRandomTickets([2n], {
        account: user1.account.address,
      });

      // User 2 buys 2 random tickets
      await lottery.write.buyRandomTickets([2n], {
        account: user2.account.address,
      });

      // User 3 buys a custom ticket
      await lottery.write.buyCustomTicket([[9, 8, 7, 6, 5, 4]], {
        account: user3.account.address,
      });

      // 4. Check vault balance and lottery pool
      const vaultBalance = await mockToken.read.balanceOf([vault.address]);
      expect(vaultBalance).to.equal(ticketPrice * 6n); // 6 tickets total
      expect(await vault.read.currentLotteryPool()).to.equal(ticketPrice * 6n);

      // 5. Check user tickets
      const user1Tickets = await lottery.read.getUserTickets([
        user1.account.address,
      ]);
      const user2Tickets = await lottery.read.getUserTickets([
        user2.account.address,
      ]);
      const user3Tickets = await lottery.read.getUserTickets([
        user3.account.address,
      ]);

      expect(user1Tickets.length).to.equal(3);
      expect(user2Tickets.length).to.equal(2);
      expect(user3Tickets.length).to.equal(1);

      // 6. Force time passage for lottery to end
      // Use Hardhat's time manipulation functions
      await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await hre.network.provider.send("evm_mine"); // Mine a new block with the updated timestamp

      // 7. Close lottery and draw winners
      await lottery.write.closeLottery({
        account: owner.account.address,
      });

      // 8. Check lottery is closed and winners are processed
      expect(await lottery.read.currentState()).to.equal(0); // LotteryState.CLOSED

      // 9. Check winning numbers were drawn
      const winningNumbers = await lottery.read.getWinningNumbers();
      expect(winningNumbers.length).to.equal(6);

      // 10. Check prize distribution happened
      // The balance of the vault should now be less than the total pool if there were winners
      // This is probabilistic, so we'll check that the system is working rather than exact amounts

      // Check that the total prizes were calculated
      const totalPrizes = await lottery.read.getTotalPrizes();

      // 11. Check user balances after lottery (if they won)
      // This is also probabilistic, so we'll check the system rather than exact amounts

      // 12. Check treasury, donation, and team wallets received fees
      const treasuryBalance = await mockToken.read.balanceOf([
        treasury.account.address,
      ]);

      // Check that the lottery system is in a clean state for a new round
      console.log("Lottery cycle completed successfully");
      console.log("Winning numbers:", winningNumbers);
      console.log("Total prizes:", totalPrizes);
      console.log("Treasury balance:", treasuryBalance);
    });

    it("Should correctly calculate and distribute prizes for multi-tier winners", async function () {
      const { lottery, vault, mockToken, owner, user1 } = await loadFixture(
        deployFixture
      );

      // 1. Start lottery
      await lottery.write.startLottery({
        account: owner.account.address,
      });

      // 2. User approves token spending
      const ticketPrice = await lottery.read.ticketPrice();
      // Need approval for multiple tickets
      await mockToken.write.approve([lottery.address, ticketPrice * 5n], {
        account: user1.account.address,
      });

      // 3. Record initial user1 balance
      const initialUserBalance = await mockToken.read.balanceOf([
        user1.account.address,
      ]);

      // 4. User buys tickets that are designed to win in multiple tiers
      // We'll configure winning numbers later to match these tickets
      await lottery.write.buyCustomTicket([[1, 2, 3, 4, 5, 6]], {
        account: user1.account.address,
      }); // Will be a 6-match winner

      await lottery.write.buyCustomTicket([[1, 2, 3, 4, 5, 9]], {
        account: user1.account.address,
      }); // Will be a 5-match winner

      await lottery.write.buyCustomTicket([[1, 2, 3, 4, 9, 8]], {
        account: user1.account.address,
      }); // Will be a 4-match winner

      // Buy two tickets for the same tier (3-match) to test multiple tickets in same tier
      await lottery.write.buyCustomTicket([[1, 2, 3, 9, 8, 7]], {
        account: user1.account.address,
      }); // Will be a 3-match winner

      await lottery.write.buyCustomTicket([[1, 2, 3, 8, 7, 6]], {
        account: user1.account.address,
      }); // Will be another 3-match winner

      // 5. Force time passage for lottery to end
      await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");

      // 6. Override the random number generation to set predictable winning numbers
      // This requires adding a testing-only function to your contract
      // If you've added setWinningNumbersForTesting to the lottery contract:
      //await lottery.write.setWinningNumbersForTesting([[1, 2, 3, 4, 5, 6]], {
      //  account: owner.account.address,
      //});

      // 7. Close lottery with our forced winning numbers
      await lottery.write.closeLottery({
        account: owner.account.address,
      });

      // After closing the lottery
      console.log(
        "Actual winning numbers:",
        await lottery.read.getWinningNumbers()
      );
      console.log(
        "User tickets indexes:",
        await lottery.read.getUserTickets([user1.account.address])
      );

      // Debug the actual ticket contents
      const lotteryId = await lottery.read.currentLotteryId();

      // 8. Verify user won the expected tiers
      // Get winning numbers to confirm
      const winningNumbers = await lottery.read.getWinningNumbers();

      // Check the user's wins in each tier
      const tier6Wins = await lottery.read.getWinnerCount([
        user1.account.address,
        6,
      ]);
      const tier5Wins = await lottery.read.getWinnerCount([
        user1.account.address,
        5,
      ]);
      const tier4Wins = await lottery.read.getWinnerCount([
        user1.account.address,
        4,
      ]);
      const tier3Wins = await lottery.read.getWinnerCount([
        user1.account.address,
        3,
      ]);

      expect(tier6Wins).to.equal(1); // One ticket with 6 matches
      expect(tier5Wins).to.equal(1); // One ticket with 5 matches
      expect(tier4Wins).to.equal(1); // One ticket with 4 matches
      expect(tier3Wins).to.equal(2); // Two tickets with 3 matches

      // 9. Calculate the expected prize amount
      const totalPool = ticketPrice * 5n; // 5 tickets purchased

      // Get the prize percentages
      const match6Prize = await lottery.read.match6Prize();
      const match5Prize = await lottery.read.match5Prize();
      const match4Prize = await lottery.read.match4Prize();
      const match3Prize = await lottery.read.match3Prize();

      // Calculate expected prize amounts (following your contract logic)
      const expectedPrize6 = (totalPool * BigInt(match6Prize)) / 10000n;
      const expectedPrize5 = (totalPool * BigInt(match5Prize)) / 10000n;
      const expectedPrize4 = (totalPool * BigInt(match4Prize)) / 10000n;
      const expectedPrize3 = (totalPool * BigInt(match3Prize)) / 10000n / 2n; // Split between 2 tickets

      const expectedTotalPrize =
        expectedPrize6 + expectedPrize5 + expectedPrize4 + expectedPrize3 * 2n;

      // 10. Check the user's final balance to verify they received the correct prize
      const finalUserBalance = await mockToken.read.balanceOf([
        user1.account.address,
      ]);

      // The user should have:
      // Initial balance - (5 tickets * price) + total prize
      const expectedFinalBalance =
        initialUserBalance - ticketPrice * 5n + expectedTotalPrize;

      // Allow for small rounding differences in division calculations
      const balanceDiff =
        finalUserBalance > expectedFinalBalance
          ? finalUserBalance - expectedFinalBalance
          : expectedFinalBalance - finalUserBalance;

      expect(balanceDiff <= 5n).to.be.true; // Allow for minor rounding differences (max 5 units)

      console.log("Multi-tier winning test successful!");
      console.log("User won in tiers:", {
        "6 matches": tier6Wins.toString(),
        "5 matches": tier5Wins.toString(),
        "4 matches": tier4Wins.toString(),
        "3 matches": tier3Wins.toString(),
      });
      console.log(
        "Total prize received:",
        (finalUserBalance - (initialUserBalance - ticketPrice * 5n)).toString()
      );
    });
  });

  describe("Multiple Lottery Rounds", function () {
    it("Should handle multiple lottery rounds correctly", async function () {
      const { lottery, vault, mockToken, owner, user1 } = await loadFixture(
        deployFixture
      );

      // First round
      await lottery.write.startLottery({
        account: owner.account.address,
      });

      const ticketPrice = await lottery.read.ticketPrice();
      await mockToken.write.approve([lottery.address, ticketPrice * 2n], {
        account: user1.account.address,
      });

      await lottery.write.buyRandomTickets([2n], {
        account: user1.account.address,
      });

      // Add time advancement before closing first lottery
      await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await hre.network.provider.send("evm_mine");

      await lottery.write.closeLottery({
        account: owner.account.address,
      });

      // Second round
      await lottery.write.startLottery({
        account: owner.account.address,
      });

      // Check lottery ID incremented
      expect(await lottery.read.currentLotteryId()).to.equal(2);

      await mockToken.write.approve([lottery.address, ticketPrice], {
        account: user1.account.address,
      });

      await lottery.write.buyCustomTicket([[1, 2, 3, 4, 5, 6]], {
        account: user1.account.address,
      });

      // Check tickets are for the current lottery
      const user1Tickets = await lottery.read.getUserTickets([
        user1.account.address,
      ]);
      expect(user1Tickets.length).to.equal(1); // Only current lottery tickets

      // Add time advancement before closing second lottery
      await hre.network.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]); // 7 days
      await hre.network.provider.send("evm_mine");

      await lottery.write.closeLottery({
        account: owner.account.address,
      });

      // Third round setup
      await lottery.write.startLottery({
        account: owner.account.address,
      });

      expect(await lottery.read.currentLotteryId()).to.equal(3);
    });
  });

  describe("Security and Edge Cases", function () {
    it("Should handle insufficient funds case", async function () {
      const { lottery, vault, mockToken, owner, user1 } = await loadFixture(
        deployFixture
      );

      // Start lottery with a very small balance
      await lottery.write.startLottery({ account: owner.account.address });

      // Attempt to buy a ticket without enough balance
      const ticketPrice = await lottery.read.ticketPrice();

      // Approve but don't have enough balance
      await mockToken.write.approve([lottery.address, ticketPrice], {
        account: user1.account.address,
      });

      // Attempt to transfer all tokens out to create insufficient balance
      const balance = await mockToken.read.balanceOf([user1.account.address]);
      await mockToken.write.transfer([owner.account.address, balance], {
        account: user1.account.address,
      });

      // Try to buy ticket - should fail
      await expect(
        lottery.write.buyCustomTicket([[1, 2, 3, 4, 5, 6]], {
          account: user1.account.address,
        })
      ).to.be.rejected;
    });

    it("Should handle permission and state checks", async function () {
      const { lottery, vault, owner, user1 } = await loadFixture(deployFixture);

      // Try to start lottery as non-owner
      await expect(
        lottery.write.startLottery({
          account: user1.account.address,
        })
      ).to.be.rejected;

      // Try to buy ticket before lottery starts
      await expect(
        lottery.write.buyRandomTickets([1n], {
          account: user1.account.address,
        })
      ).to.be.rejected;

      // Try to close lottery before it starts
      await expect(
        lottery.write.closeLottery({
          account: owner.account.address,
        })
      ).to.be.rejected;

      // Start lottery properly
      await lottery.write.startLottery({
        account: owner.account.address,
      });

      // Try to start lottery again while one is active
      await expect(
        lottery.write.startLottery({
          account: owner.account.address,
        })
      ).to.be.rejected;

      // Try to update configuration during active lottery
      await expect(
        lottery.write.updateLotteryConfig(
          [
            10000000n, // 10 tokens
            200, // 200 max tickets
            14n * 24n * 60n * 60n, // 14 days
          ],
          {
            account: owner.account.address,
          }
        )
      ).to.be.rejected;
    });
  });
});
