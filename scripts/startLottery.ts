import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
  walletActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, megaethTestnet } from "viem/chains";

// Import ABI directly from the compiled artifacts
// This assumes you're using Hardhat which generates these files
import { abi as MegaLuckyLotteryAbi } from "../artifacts/contracts/MegaLuckyLottery.sol/MegaLuckyLottery.json";

// Load environment variables
config();

async function main() {
  console.log("Starting a new lottery round...");

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

    // Check if lottery is in closed state
    const currentState = await lottery.read.currentState();
    console.log("Current lottery state (raw):", currentState);
    console.log("Current lottery state type:", typeof currentState);

    // Handle the comparison more flexibly
    if (Number(currentState) !== 0) {
      // Convert to Number for comparison
      // Not in CLOSED state
      console.log(
        "Lottery is not in CLOSED state. Current state:",
        Number(currentState)
      );
      console.log(
        "Cannot start a new lottery. Please close the current one first."
      );
      return;
    } else {
      console.log(
        "Lottery is in CLOSED state, proceeding to start new lottery"
      );
    }

    // Start the lottery
    const hash = await lottery.write.startLottery();
    console.log(`Transaction submitted: ${hash}`);

    // Wait for transaction to be confirmed
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    // Get new lottery information
    const lotteryId = (await lottery.read.currentLotteryId()) as bigint;
    const drawTime = await lottery.read.currentDrawTime();
    const formattedDrawTime = new Date(
      Number(drawTime) * 1000
    ).toLocaleString();

    console.log("---------------");
    console.log("Lottery started successfully!");
    console.log("Lottery ID:", lotteryId.toString());
    console.log("Draw time:", formattedDrawTime);
    console.log("---------------");
  } catch (error) {
    console.error("Error starting lottery:", error);
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
