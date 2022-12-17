const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Lottery Unit Tests", function () {
			let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval
			const chainId = network.config.chainId

			beforeEach(async function () {
				deployer = (await getNamedAccounts()).deployer
				await deployments.fixture(["all"])
				lottery = await ethers.getContract("Lottery", deployer)
				vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)

				// VM Exception while processing transaction: reverted with custom error 'InvalidConsumer()' #3103
				const subscriptionId = lottery.getSubscriptionId()
				await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address)

				lotteryEntranceFee = await lottery.getEntranceFee()
				interval = await lottery.getInterval()
			})

			describe("constructor", function () {
				it("initializes the lottery correctly", async function () {
					const lotteryState = await lottery.getLotteryState()
					assert.equal(lotteryState.toString(), "0")
					assert.equal(interval.toString(), networkConfig[chainId]["interval"])
				})
			})

			describe("enterLottery", function () {
				it("reverts when you don't pay enough", async function () {
					await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__NotEnoughETHEntered")
				})
				it("records players when they enter", async function () {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					const playerFromContract = await lottery.getPlayer(0)
					assert.equal(playerFromContract, deployer)
				})
				it("emits event on enter", async function () {
					await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.emit(lottery, "LotteryEntered")
				})
				it("doesn't allow entrance when lottery is calculating", async function () {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.send("evm_mine", [])
					// We pretend to be a Chainlink node Keeper
					await lottery.performUpkeep([])
					await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.revertedWith(
						"Lottery__NotOpen"
					)
				})
			})

			describe("checkUpkeep", function () {
				it("returns false if there is no player entered", async function () {
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.send("evm_mine", [])
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
					assert(!upkeepNeeded)
				})
				it("returns false if lottery is not open", async function () {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.send("evm_mine", [])
					// [] = "0x"
					await lottery.performUpkeep("0x")
					const lotteryState = await lottery.getLotteryState()
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
					assert.equal(lotteryState.toString(), "1")
					assert.equal(upkeepNeeded, false)
				})
				it("returns false if enough time hasn't passed", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
					await network.provider.request({ method: "evm_mine", params: [] })
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
					assert(!upkeepNeeded)
				})
				it("returns true if enough time has passed, has players, eth, and is open", async () => {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.request({ method: "evm_mine", params: [] })
					const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
					assert(upkeepNeeded)
				})
			})

			describe("performUpkeep", function () {
				it("it can only run if checkUpkeep is true", async function () {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.request({ method: "evm_mine", params: [] })
					const tx = await lottery.performUpkeep("0x")
					assert(tx)
				})
				it("reverts when checkUpkeep is false", async function () {
					await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpKeepNotNeeded")
				})
				it("updates the lottery state, emits an event, and call the vrf coordinator", async function () {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.request({ method: "evm_mine", params: [] })
					const txResponse = await lottery.performUpkeep("0x")
					const txReceipt = await txResponse.wait(1)
					const requestId = txReceipt.events[1].args.requestId
					const lotteryState = await lottery.getLotteryState()
					assert(requestId.toNumber() > 0)
					assert(lotteryState == 1)
				})
			})

			describe("fulfillRandomWords", function () {
				beforeEach(async function () {
					await lottery.enterLottery({ value: lotteryEntranceFee })
					await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
					await network.provider.request({ method: "evm_mine", params: [] })
				})
				it("can only be called after performUpKeep", async function () {
					await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith(
						"nonexistent request"
					)
					await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)).to.be.revertedWith(
						"nonexistent request"
					)
				})
				it("picks a winner, resets the lottery, ans sends money", async function () {
					const otherParticipants = 3
					const fromIndex = 1 // deployer being the 0 index
					const accounts = await ethers.getSigners()

					for (let i = fromIndex; i < fromIndex + otherParticipants; i++) {
						const newParcitipant = lottery.connect(accounts[i])
						await newParcitipant.enterLottery({ value: lotteryEntranceFee })
					}

					const startingTimeStamp = await lottery.getLastestTimeStamp()

					await new Promise(async (resolve, reject) => {
						lottery.once("WinnerPicked", async () => {
							try {
								//const winner = await lottery.getRecentWinner()
								const lotteryState = await lottery.getLotteryState()
								const endingTimeStamp = await lottery.getLastestTimeStamp()
								const numPlayers = await lottery.getNumPlayers()
								const winnerEndingBalance = await accounts[1].getBalance()

								assert.equal(numPlayers, 0)
								assert.equal(lotteryState, 0)
								assert(endingTimeStamp > startingTimeStamp)

								assert.equal(
									winnerEndingBalance.toString(),
									winnerStartingBalance.add(
										lotteryEntranceFee.mul(otherParticipants).add(lotteryEntranceFee).toString()
									)
								)
								resolve()
							} catch (error) {
								reject(error)
							}
						})

						const tx = await lottery.performUpkeep([])
						const txReceipt = await tx.wait(1)

						const winnerStartingBalance = await accounts[1].getBalance()

						await vrfCoordinatorV2Mock.fulfillRandomWords(
							txReceipt.events[1].args.requestId,
							lottery.address
						)
					})
				})
			})
	  })
