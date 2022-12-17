const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
	? describe.skip
	: describe("Lottery Staging Tests", function () {
			let lottery, lotteryEntranceFee, deployer
			const chainId = network.config.chainId

			beforeEach(async function () {
				deployer = (await getNamedAccounts()).deployer
				lottery = await ethers.getContract("Lottery", deployer)
				lotteryEntranceFee = await lottery.getEntranceFee()
			})

			describe("fulfillRandomWords", function () {
				it("works with live Chainlink Oracles Keepers and VRF, and gets a lottery winner", async function () {
					console.log("Test init...")
					const startingTimeStamp = await lottery.getLastestTimeStamp()
					const accounts = await ethers.getSigners()

					console.log("Setting up the listener...")
					await new Promise(async (resolve, reject) => {
						lottery.once("WinnerPicked", async () => {
							console.log("WinnerPicked event triggered!")
							try {
								const winner = await lottery.getRecentWinner()
								const lotteryState = await lottery.getLotteryState()
								const winnerEndingBalance = await accounts[0].getBalance()
								const endingTimeStamp = await lottery.getLastestTimeStamp()

								await expect(lottery.getPlayer(0)).to.be.reverted
								assert.equal(winner.toString(), accounts[0].address)
								assert.equal(lotteryState, 0)
								assert.equal(
									winnerEndingBalance.toString(),
									winnerStartingBalance.add(lotteryEntranceFee).toString()
								)
								assert(endingTimeStamp > startingTimeStamp)
								resolve()
							} catch (error) {
								reject(error)
							}
						})

						console.log("Entering the lottery...")
						const tx = await lottery.enterLottery({ value: lotteryEntranceFee })
						await tx.wait(1)

						console.log("Waiting...")
						const winnerStartingBalance = await accounts[0].getBalance()
					})
				})
			})
	  })
