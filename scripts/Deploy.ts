import {
  createPublicClient,
  http,
  createWalletClient,
  formatEther,
} from "viem";
import { megaethTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  abi,
  bytecode,
} from "../artifacts/contracts/HelloWorld.sol/HelloWorld.json";
import * as dotenv from "dotenv";

dotenv.config();

const deployerPrivateKey = process.env.PRIVATE_KEY || "";

async function main() {
  //client inicialization
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

  //contract deployment
  console.log("Deploying contract...");
  const hash = await deployer.deployContract({
    abi,
    bytecode: bytecode as `0x${string}`,
  });
  console.log("Transaction hash:", hash);
  console.log("Waiting confirmation...");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Contract deployed at:", receipt.contractAddress);

  //read contract
  if (!receipt.contractAddress) throw new Error("Contract address is null");
  const greeting = (await publicClient.readContract({
    address: receipt.contractAddress,
    abi,
    functionName: "getGreeting",
  })) as string;
  console.log("Greeting:", greeting as string);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
