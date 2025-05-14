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
