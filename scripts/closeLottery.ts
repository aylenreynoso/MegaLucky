import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { megaethTestnet } from "viem/chains";

// Import ABI directly from the compiled artifacts
import { abi as MegaLuckyLotteryAbi } from "../artifacts/contracts/MegaLuckyLottery.sol/MegaLuckyLottery.json";
import { bigint } from "hardhat/internal/core/params/argumentTypes";

// Load environment variables
config();

async function main() {
  console.log("Closing the current lottery round...");

  // Contract address - replace with your deployed contract address
  const LOTTERY_ADDRESS =
    process.env.LOTTERY_ADDRESS || "0x71970ab42cc4f1552de20ac2eb2267e3ca1dca2a";

  const deployerPrivateKey = process.env.PRIVATE_KEY || "";

  try {
    //client initialization
    const publicClient = createPublicClient({
      chain: megaethTestnet,
      transport: http("https://carrot.megaeth.com/rpc"),
    });
    const blockNumber = await publicClient.getBlockNumber();
    console.log("Last block number:", blockNumber);

    //wallet client initialization
    const account = privateKeyToAccount(`0x${deployerPrivateKey}`);
    const deployer = createWalletClient({
      account,
      chain: megaethTestnet,
      transport: http("https://carrot.megaeth.com/rpc"),
    });
    console.log("Deployer address:", deployer.account.address);

    // Create contract instance
    const lottery = getContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: MegaLuckyLotteryAbi,
      client: deployer,
    });

    // Check lottery state
    const currentState = await lottery.read.currentState();
    console.log("Current lottery state (raw):", currentState);
    console.log("Current lottery state type:", typeof currentState);

    // Handle the comparison more flexibly
    if (Number(currentState) !== 1) {
      // Convert to Number for comparison - 1 is OPEN state
      console.log(
        "Lottery is not in OPEN state. Current state:",
        Number(currentState)
      );
      console.log(
        "Cannot close the lottery. Please start it first if it's in CLOSED state."
      );
      return;
    } else {
      console.log("Lottery is in OPEN state, proceeding to close lottery");
    }

    // Get current draw time and check if we can close
    const currentDrawTime = (await lottery.read.currentDrawTime()) as bigint;
    const currentTime = BigInt(Math.floor(Date.now() / 1000));

    console.log(
      "Current time:",
      new Date(Number(currentTime) * 1000).toLocaleString()
    );
    console.log(
      "Draw time:",
      new Date(Number(currentDrawTime) * 1000).toLocaleString()
    );

    if (currentTime < currentDrawTime) {
      console.log("Draw time not reached yet. Cannot close lottery.");
      return;
    }

    // Close the lottery
    const hash = await lottery.write.closeLottery();
    console.log(`Transaction submitted: ${hash}`);

    // Wait for transaction to be confirmed
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Get winning numbers
    const winningNumbers = (await lottery.read.getWinningNumbers()) as number[];

    console.log("---------------");
    console.log("Lottery closed successfully!");
    console.log("Winning numbers:", winningNumbers.join(", "));
    console.log("---------------");
  } catch (error) {
    console.error("Error closing lottery:", error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
