import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

/**
 * Examples (localhost):
 *  - npx hardhat --network localhost deploy
 *  - npx hardhat --network localhost task:address
 *  - npx hardhat --network localhost task:stake --duration 3600 --amount 0.5
 *  - npx hardhat --network localhost task:decrypt-stake --user 0x...
 *  - npx hardhat --network localhost task:request-withdraw
 *  - npx hardhat --network localhost task:finalize-withdraw
 */

task("task:address", "Prints the DarkPoolStaking and RewardCoin addresses").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const rewardCoin = await deployments.get("RewardCoin");
    const staking = await deployments.get("DarkPoolStaking");

    console.log("RewardCoin address is " + rewardCoin.address);
    console.log("DarkPoolStaking address is " + staking.address);
  },
);

task("task:stake", "Stake ETH with an encrypted balance")
  .addParam("duration", "Lock duration in seconds")
  .addOptionalParam("amount", "ETH amount to stake (default: 0.1)", "0.1")
  .addOptionalParam("address", "Optionally specify the DarkPoolStaking contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const duration = Number(taskArguments.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Argument --duration must be a positive number");
    }

    const stakingDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkPoolStaking");
    console.log(`DarkPoolStaking: ${stakingDeployment.address}`);

    const [signer] = await ethers.getSigners();
    const stakingContract = await ethers.getContractAt("DarkPoolStaking", stakingDeployment.address);

    const value = ethers.parseEther(taskArguments.amount);
    const tx = await stakingContract.connect(signer).stake(duration, { value });
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:decrypt-stake", "Decrypt the encrypted stake amount for a user")
  .addParam("user", "User address whose stake amount is decrypted")
  .addOptionalParam("address", "Optionally specify the DarkPoolStaking contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const stakingDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkPoolStaking");
    console.log(`DarkPoolStaking: ${stakingDeployment.address}`);

    const stakingContract = await ethers.getContractAt("DarkPoolStaking", stakingDeployment.address);
    const [amountHandle] = await stakingContract.getStake(taskArguments.user);

    if (amountHandle === ethers.ZeroHash) {
      console.log("No stake found.");
      return;
    }

    const [signer] = await ethers.getSigners();
    const clearAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      amountHandle,
      stakingDeployment.address,
      signer,
    );

    console.log(`Encrypted stake handle: ${amountHandle}`);
    console.log(`Clear stake amount    : ${clearAmount}`);
  });

task("task:request-withdraw", "Request a withdrawal after the lock expires")
  .addOptionalParam("address", "Optionally specify the DarkPoolStaking contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const stakingDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkPoolStaking");
    console.log(`DarkPoolStaking: ${stakingDeployment.address}`);

    const [signer] = await ethers.getSigners();
    const stakingContract = await ethers.getContractAt("DarkPoolStaking", stakingDeployment.address);

    const tx = await stakingContract.connect(signer).requestWithdraw();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:finalize-withdraw", "Finalize a withdrawal using public decryption proof")
  .addOptionalParam("address", "Optionally specify the DarkPoolStaking contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const stakingDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("DarkPoolStaking");
    console.log(`DarkPoolStaking: ${stakingDeployment.address}`);

    const [signer] = await ethers.getSigners();
    const stakingContract = await ethers.getContractAt("DarkPoolStaking", stakingDeployment.address);
    const [amountHandle] = await stakingContract.getStake(await signer.getAddress());

    if (amountHandle === ethers.ZeroHash) {
      console.log("No stake found.");
      return;
    }

    const decrypted = await fhevm.publicDecrypt([amountHandle]);
    const clearAmount = decrypted.clearValues[amountHandle as string];
    if (clearAmount === undefined) {
      throw new Error("Missing decrypted amount from public decrypt response.");
    }

    const clearAmountValue = typeof clearAmount === "bigint" ? clearAmount : BigInt(clearAmount);

    const tx = await stakingContract
      .connect(signer)
      .finalizeWithdraw(amountHandle, clearAmountValue, decrypted.decryptionProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });
