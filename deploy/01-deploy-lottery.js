const { network } = require("hardhat");
//const { networkConfig } = require("../helper-hardhat-config");
//const { developmentChains } = require("../helper-hardhat-config");
//const { verify } = require("../utils/verify");
require("dotenv").config();

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
	const { deploy, log } = deployments;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();

	const lottery = await deploy("lottery", {
		from: deployer,
		args: [],
		log: true,
		waitConfirmations: network.config.blockConfirmations || 1,
	});
};

module.exports.tags = ["all", "lottery"];
