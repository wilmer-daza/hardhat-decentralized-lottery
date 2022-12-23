const { ethers, network } = require("hardhat")

async function mockKeepers() {
	const lottery = await ethers.getContract("Lottery")

	const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")

	// VM Exception while processing transaction: reverted with custom error 'InvalidConsumer()' #3103
	//if (network.config.chainId == 31337) {
	const subscriptionId = lottery.getSubscriptionId()
	await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)
	//}

	const checkData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(""))
	const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(checkData)
	if (upkeepNeeded) {
		const tx = await lottery.performUpkeep(checkData)
		const txReceipt = await tx.wait(1)
		const requestId = txReceipt.events[1].args.requestId
		console.log(`Performed upkeep with RequestId: ${requestId}`)
		//if (network.config.chainId == 31337) {
		await mockVrf(requestId, lottery, vrfCoordinatorV2Mock)
		//}
	} else {
		console.log("No upkeep needed!")
	}
}

async function mockVrf(requestId, lottery, vrfCoordinatorV2Mock) {
	console.log("We on a local network? Ok let's pretend...")

	//const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
	// VM Exception while processing transaction: reverted with custom error 'InvalidConsumer()' #3103
	//const subscriptionId = lottery.getSubscriptionId()
	//await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)

	await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, lottery.address)

	console.log("Responded!")
	const recentWinner = await lottery.getRecentWinner()
	console.log(`The winner is: ${recentWinner}`)
}

mockKeepers()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
