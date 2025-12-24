import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;

  const rewardCoinDeployment = await deploy("RewardCoin", {
    from: deployer,
    log: true,
  });

  const stakingDeployment = await deploy("DarkPoolStaking", {
    from: deployer,
    log: true,
    args: [rewardCoinDeployment.address],
  });

  await execute(
    "RewardCoin",
    { from: deployer, log: true },
    "setMinter",
    stakingDeployment.address,
  );

  console.log(`RewardCoin contract: `, rewardCoinDeployment.address);
  console.log(`DarkPoolStaking contract: `, stakingDeployment.address);
};
export default func;
func.id = "deploy_darkpool_staking";
func.tags = ["RewardCoin", "DarkPoolStaking"];
