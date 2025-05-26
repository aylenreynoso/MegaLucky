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
// This assumes you're using Hardhat which generates these files
import { abi as MegaLuckyLotteryAbi } from "../artifacts/contracts/MegaLuckyLottery.sol/MegaLuckyLottery.json";

// Load environment variables
config();

async function main() {
  console.log("Checking State..");

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

    const currentDrawTime = (await lottery.read.currentDrawTime()) as bigint;
    console.log("Current draw time:", currentDrawTime.toString());

    // Convert Unix timestamp to human-readable date
    const timestamp = 1748221888n; // or your bigint value
    const date = new Date(Number(timestamp) * 1000);
    console.log("Draw time:", date.toLocaleString());
    // For UTC specifically: date.toUTCString()
  } catch (error) {
    console.error("Error in main function:", error);
    throw error;
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
