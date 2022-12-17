const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("5")

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
	const { deploy, log } = deployments
	const { deployer } = await getNamedAccounts()
	const chainId = await getChainId()

	let vrfCoordinatorV2Address, vrfCoordinatorV2Mock, subscriptionId

	if (developmentChains.includes(network.name)) {
		vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
		vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address

		const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
		const transactionReceipt = await transactionResponse.wait(1)

		subscriptionId = transactionReceipt.events[0].args.subId
		await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
	} else {
		vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinator"]
		subscriptionId = networkConfig[chainId]["subscriptionId"]
	}

	const entranceFee = networkConfig[chainId]["entranceFee"]
	const gasLane = networkConfig[chainId]["gasLane"]
	const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
	const interval = networkConfig[chainId]["interval"]

	const args = [vrfCoordinatorV2Address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval]

	const lottery = await deploy("Lottery", {
		from: deployer,
		args: args,
		log: true,
		waitConfirmations: network.config.blockConfirmations || 1,
	})

	// VM Exception while processing transaction: reverted with custom error 'InvalidConsumer()' #3103
	/* 	if (developmentChains.includes(network.name)) {
		await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)
	} */

	if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
		await verify(lottery.address, args)
	}

	log("----------------------------------------------------------------")
}

module.exports.tags = ["all", "lottery"]
