// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

error Lottery__NotEnoughETHEntered();
error Lottery__TransfertFailed();
error Lottery__NotOpen();
error Lottery__UpKeepNotNeeded(uint256 currentBalance, uint256 numPlayer, uint256 lotterState);

/** @title A sample of Lottery Contract
 * @author Wilmer Daza
 * @notice This contract creates a decentralized lottery
 * @dev Implementing VRF v2 and Chainlink Keepers
 */
contract Lottery is VRFConsumerBaseV2, AutomationCompatibleInterface {
	// Types
	enum LotteryState {
		OPEN,
		CALCULATING
	}

	// State Variables
	uint256 private immutable i_entranceFee;
	address payable[] private s_players;
	bytes32 private immutable i_gasLane;
	uint64 private immutable i_subscriptionId;
	uint32 private immutable i_callbackGasLimit;

	uint16 private constant REQUEST_CONFIRMATIONS = 3;
	uint32 private constant NUM_WORDS = 1;

	VRFCoordinatorV2Interface private immutable i_vrfCoordinator;

	// Lottery Variable
	address private s_recentWinner;
	LotteryState private s_LotteryState;
	uint256 private s_lastTimeStamp;
	uint256 private immutable i_interval;

	// Events
	event LotteryEntered(address indexed player);
	event RequestedLotteryWinner(uint256 indexed requestId);
	event WinnerPicked(address indexed winner);

	constructor(
		address vrfCoordinatorV2,
		uint256 entranceFee,
		bytes32 gasLane,
		uint64 subscriptionId,
		uint32 callbackGasLimit,
		uint256 interval
	) VRFConsumerBaseV2(vrfCoordinatorV2) {
		i_entranceFee = entranceFee;
		i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
		i_gasLane = gasLane;
		i_subscriptionId = subscriptionId;
		i_callbackGasLimit = callbackGasLimit;
		i_interval = interval;
		s_lastTimeStamp = block.timestamp;
		s_LotteryState = LotteryState.OPEN;
	}

	function enterLottery() public payable {
		if (s_LotteryState != LotteryState.OPEN) {
			revert Lottery__NotOpen();
		}
		if (msg.value < i_entranceFee) {
			revert Lottery__NotEnoughETHEntered();
		}

		s_players.push(payable(msg.sender));
		emit LotteryEntered(msg.sender);
	}

	/**
	 * @dev This is the function that the Chainlink Keeper nodes call
	 * they look for the `upKeepNeeded` to return true.
	 * The following should be true in order to return true
	 * 1. Our time intercal should have paassed
	 * 2. The lottery should have at least 1 player, and have some ETH
	 * 3. Our subscription is funded with LINK
	 * 4. The lottery should be in an "open" state
	 */
	function checkUpkeep(
		bytes memory /* checkData */
	) public override returns (bool upkeepNeeded, bytes memory /* performData */) {
		bool isOpen = s_LotteryState == LotteryState.OPEN;
		bool timePassed = (block.timestamp - s_lastTimeStamp) > i_interval;
		bool hasPlayers = s_players.length > 0;
		bool hasBalance = address(this).balance > 0;

		upkeepNeeded = isOpen && timePassed && hasPlayers && hasBalance;
	}

	function performUpkeep(bytes calldata /* performData */) external override {
		(bool upkeepNeeded, ) = checkUpkeep("");

		if (!upkeepNeeded) {
			revert Lottery__UpKeepNotNeeded(address(this).balance, s_players.length, uint256(s_LotteryState));
		}

		s_LotteryState = LotteryState.CALCULATING;

		uint256 requestId = i_vrfCoordinator.requestRandomWords(
			i_gasLane,
			i_subscriptionId,
			REQUEST_CONFIRMATIONS,
			i_callbackGasLimit,
			NUM_WORDS
		);

		// Redundant: since the VRFCoordinatorV2Mock already emits the requestId on RandomWordsRequested event
		// when requestRandomWords is called
		emit RequestedLotteryWinner(requestId);
	}

	function fulfillRandomWords(uint256 /* requestId */, uint256[] memory randomWords) internal override {
		uint256 indexOfWinner = randomWords[0] % s_players.length;
		address payable recentWinner = s_players[indexOfWinner];

		(bool ok, ) = recentWinner.call{value: address(this).balance}("");
		if (!ok) {
			revert Lottery__TransfertFailed();
		}

		s_recentWinner = recentWinner;
		s_players = new address payable[](0);
		s_lastTimeStamp = block.timestamp;
		s_LotteryState = LotteryState.OPEN;

		emit WinnerPicked(recentWinner);
	}

	function getEntranceFee() public view returns (uint256) {
		return i_entranceFee;
	}

	function getPlayer(uint256 index) public view returns (address) {
		return s_players[index];
	}

	function getRecentWinner() public view returns (address) {
		return s_recentWinner;
	}

	function getLotteryState() public view returns (LotteryState) {
		return s_LotteryState;
	}

	function getNumWords() public pure returns (uint256) {
		return NUM_WORDS;
	}

	function getNumPlayers() public view returns (uint256) {
		return s_players.length;
	}

	function getLastestTimeStamp() public view returns (uint256) {
		return s_lastTimeStamp;
	}

	function getRequestConfirmations() public pure returns (uint256) {
		return REQUEST_CONFIRMATIONS;
	}

	function getInterval() public view returns (uint256) {
		return i_interval;
	}

	function getSubscriptionId() public view returns (uint64) {
		return i_subscriptionId;
	}
}
