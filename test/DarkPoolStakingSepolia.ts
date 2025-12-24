import { expect } from "chai";
import { ethers, fhevm, deployments } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("DarkPoolStakingSepolia", function () {
  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }
  });

  it("stakes and decrypts on Sepolia", async function () {
    this.timeout(4 * 60000);

    let stakingAddress: string;
    try {
      const deployment = await deployments.get("DarkPoolStaking");
      stakingAddress = deployment.address;
    } catch (error) {
      (error as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw error;
    }

    const [signer] = await ethers.getSigners();
    const staking = await ethers.getContractAt("DarkPoolStaking", stakingAddress);

    let [handle, , active] = await staking.getStake(await signer.getAddress());
    if (!active) {
      const tx = await staking.connect(signer).stake(3600, { value: ethers.parseEther("0.001") });
      await tx.wait();
      [handle, , active] = await staking.getStake(await signer.getAddress());
    }

    expect(active).to.eq(true);

    const clearAmount = await fhevm.userDecryptEuint(FhevmType.euint64, handle, stakingAddress, signer);
    expect(clearAmount).to.be.gt(0);
  });
});
