import { task, HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    megaEthTestnet: {
      url: "https://carrot.megaeth.com/rpc",
      accounts: [process.env.PRIVATE_KEY ?? ""],
      chainId: 6342,
    },
  },
};

//npx hardhat accounts
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.viem.getWalletClients();

  for (const account of accounts) {
    console.log(account.account.address);
  }
});

export default config;
