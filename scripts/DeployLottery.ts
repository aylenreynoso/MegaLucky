import {
  createPublicClient,
  http,
  createWalletClient,
  formatEther,
} from "viem";
import { megaethTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  abi as lotteryAbi,
  bytecode as lotteryBytecode,
} from "../artifacts/contracts/MegaLuckyLottery.sol/MegaLuckyLottery.json";
import {
  abi as vaultAbi,
  bytecode as vaultBytecode,
} from "../artifacts/contracts/MegaLuckyVault.sol/MegaLuckyVault.json";
import * as dotenv from "dotenv";

dotenv.config();

const deployerPrivateKey = process.env.PRIVATE_KEY || "";
const paymentToken = process.env.CUSD || "";
const teamWallet = process.env.PUBLIC_KEY || "";
const donationWallet = process.env.PUBLIC_KEY || "";
const treasuryWallet = process.env.PUBLIC_KEY || "";

async function main() {
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
  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log(
    "Deployer balance:",
    formatEther(balance),
    deployer.chain.nativeCurrency.symbol
  );

  // STEP 1: Deploy lottery contract with required parameters
  console.log("Deploying lottery contract...");
  const lotteryHash = await deployer.deployContract({
    abi: lotteryAbi,
    bytecode: lotteryBytecode as `0x${string}`,
    args: [
      paymentToken, // _paymentToken
      treasuryWallet, // _treasuryWallet
      donationWallet, // _donationWallet
      teamWallet, // _teamWallet
    ],
  });
  console.log("Lottery transaction hash:", lotteryHash);
  console.log("Waiting confirmation...");
  const lotteryReceipt = await publicClient.waitForTransactionReceipt({
    hash: lotteryHash,
  });
  const lotteryAddress = lotteryReceipt.contractAddress;
  console.log("Lottery contract deployed at:", lotteryAddress);

  // STEP 2: Deploy vault contract with lottery address
  console.log("Deploying vault contract...");
  const vaultHash = await deployer.deployContract({
    abi: vaultAbi,
    bytecode: vaultBytecode as `0x${string}`,
    args: [paymentToken, lotteryAddress], // Pass payment token and lottery address
  });
  console.log("Vault transaction hash:", vaultHash);
  console.log("Waiting confirmation...");
  const vaultReceipt = await publicClient.waitForTransactionReceipt({
    hash: vaultHash,
  });
  const vaultAddress = vaultReceipt.contractAddress;
  console.log("Vault contract deployed at:", vaultAddress);

  // STEP 3: Connect lottery to the vault
  console.log("Connecting lottery to vault...");
  const setVaultHash = await deployer.writeContract({
    address: lotteryAddress as `0x${string}`,
    abi: lotteryAbi,
    functionName: "setVaultAddress",
    args: [vaultAddress],
  });
  console.log("Set vault transaction hash:", setVaultHash);
  await publicClient.waitForTransactionReceipt({ hash: setVaultHash });
  console.log("Lottery connected to vault successfully");

  // Print summary
  console.log("\nDeployment Summary:");
  console.log("-------------------");
  console.log("Payment Token:", paymentToken);
  console.log("Lottery Contract:", lotteryAddress);
  console.log("Vault Contract:", vaultAddress);
  console.log("Treasury Wallet:", treasuryWallet);
  console.log("Donation Wallet:", donationWallet);
  console.log("Team Wallet:", teamWallet);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
