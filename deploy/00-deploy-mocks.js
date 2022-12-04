const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // 0.25 is the premium. It costs 0.25 LINK per request
const GAS_PRICE_LINK = 1e9;

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
	const { deploy, log } = deployments;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();
	const args = [BASE_FEE, GAS_PRICE_LINK];

	if (developmentChains.includes(network.name)) {
		log("Local network detected ! Deploying mocks ...");

		await deploy("VRFCoordinatorV2Mock", {
			from: deployer,
			log: true,
			args: args,
		});

		log("Mocs Deployed!");
		log("----------------------------------------------------------------");
	}
};

module.exports.tags = ["all", "mocks"];
