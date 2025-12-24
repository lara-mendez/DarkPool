import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("DarkPoolStaking", function () {
  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
  });

  it("stakes, decrypts, and withdraws with RewardCoin mint", async function () {
    const [deployer, alice] = await ethers.getSigners();

    const rewardFactory = await ethers.getContractFactory("RewardCoin");
    const rewardCoin = await rewardFactory.connect(deployer).deploy();
    await rewardCoin.waitForDeployment();

    const stakingFactory = await ethers.getContractFactory("DarkPoolStaking");
    const staking = await stakingFactory.connect(deployer).deploy(await rewardCoin.getAddress());
    await staking.waitForDeployment();

    await rewardCoin.connect(deployer).setMinter(await staking.getAddress());

    const stakeValue = ethers.parseEther("1");
    await staking.connect(alice).stake(1, { value: stakeValue });

    const [handle, unlockTimestamp, active, withdrawRequested] = await staking.getStake(alice.address);
    expect(active).to.eq(true);
    expect(withdrawRequested).to.eq(false);
    expect(unlockTimestamp).to.be.gt(0);

    const clearAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      handle,
      await staking.getAddress(),
      alice,
    );
    expect(clearAmount).to.eq(stakeValue);

    await time.increase(2);

    await staking.connect(alice).requestWithdraw();

    const decrypted = await fhevm.publicDecrypt([handle]);
    const clearAmountRaw = decrypted.clearValues[handle as string];
    const clearAmountValue = typeof clearAmountRaw === "bigint" ? clearAmountRaw : BigInt(clearAmountRaw);

    await staking.connect(alice).finalizeWithdraw(handle, clearAmountValue, decrypted.decryptionProof);

    const [afterHandle, , afterActive] = await staking.getStake(alice.address);
    expect(afterActive).to.eq(false);
    expect(afterHandle).to.not.eq(handle);

    const rewardHandle = await rewardCoin.confidentialBalanceOf(alice.address);
    const rewardClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      rewardHandle,
      await rewardCoin.getAddress(),
      alice,
    );

    const expectedReward = (stakeValue * 1000n * 1_000_000n) / 1_000_000_000_000_000_000n;
    expect(rewardClear).to.eq(expectedReward);
  });
});
