const { ethers, network } = require("hardhat")
const fs = require("fs")

const FRONTEND_ADDRESSES_FILE = "../nextjs-decentralized-lottery/constants/contractAddresses.json"
const FRONTEND_ABI_FILE = "../nextjs-decentralized-lottery/constants/abi.json"

module.exports = async function () {
	if (process.env.UPDATE_FRONTEND) {
		console.log("Updating frontend ...")
		updateContractAddresses()
		updateAbi()
	}
}

async function updateAbi() {
	const lottery = await ethers.getContract("Lottery")
	fs.writeFileSync(FRONTEND_ABI_FILE, lottery.interface.format(ethers.utils.FormatTypes.json))
}

async function updateContractAddresses() {
	const lottery = await ethers.getContract("Lottery")
	const chainId = network.config.chainId.toString()
	const currentAddresses = JSON.parse(fs.readFileSync(FRONTEND_ADDRESSES_FILE, "utf-8"))

	if (chainId in currentAddresses) {
		if (!currentAddresses[chainId].includes(lottery.address)) {
			currentAddresses[chainId].push(lottery.address)
		}
	} else {
		currentAddresses[chainId] = [lottery.address]
	}

	fs.writeFileSync(FRONTEND_ADDRESSES_FILE, JSON.stringify(currentAddresses))
}

module.exports.tags = ["all", "frontend"]
