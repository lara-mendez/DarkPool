// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {RewardCoin} from "./RewardCoin.sol";

contract DarkPoolStaking is ZamaEthereumConfig {
    struct StakePosition {
        euint64 amount;
        uint64 unlockTimestamp;
        bool active;
        bool withdrawRequested;
    }

    uint256 public constant REWARD_PER_ETH = 1000 * 1e6;

    RewardCoin public immutable rewardCoin;

    mapping(address => StakePosition) private _stakes;
    mapping(euint64 => address) private _withdrawRequests;

    event Staked(address indexed staker, uint64 amount, uint64 unlockTimestamp);
    event WithdrawRequested(address indexed staker, euint64 amount);
    event WithdrawFinalized(address indexed staker, uint64 amount, uint64 rewardAmount);

    error InvalidAmount();
    error InvalidDuration();
    error InvalidAddress();
    error ActiveStakeExists();
    error NoActiveStake();
    error WithdrawNotReady();
    error WithdrawAlreadyRequested();
    error InvalidWithdrawRequest();
    error RewardOverflow();
    error TransferFailed();

    constructor(address rewardCoinAddress) {
        if (rewardCoinAddress == address(0)) {
            revert InvalidAddress();
        }
        rewardCoin = RewardCoin(rewardCoinAddress);
    }

    function stake(uint64 lockDurationSeconds) external payable {
        if (msg.value == 0 || msg.value > type(uint64).max) {
            revert InvalidAmount();
        }
        if (lockDurationSeconds == 0) {
            revert InvalidDuration();
        }

        StakePosition storage position = _stakes[msg.sender];
        if (position.active) {
            revert ActiveStakeExists();
        }

        uint64 unlockTimestamp = uint64(block.timestamp) + lockDurationSeconds;
        euint64 encryptedAmount = FHE.asEuint64(uint64(msg.value));

        position.amount = encryptedAmount;
        position.unlockTimestamp = unlockTimestamp;
        position.active = true;
        position.withdrawRequested = false;

        FHE.allowThis(encryptedAmount);
        FHE.allow(encryptedAmount, msg.sender);

        emit Staked(msg.sender, uint64(msg.value), unlockTimestamp);
    }

    function requestWithdraw() external {
        StakePosition storage position = _stakes[msg.sender];
        if (!position.active) {
            revert NoActiveStake();
        }
        if (position.withdrawRequested) {
            revert WithdrawAlreadyRequested();
        }
        if (block.timestamp < position.unlockTimestamp) {
            revert WithdrawNotReady();
        }

        position.withdrawRequested = true;

        FHE.makePubliclyDecryptable(position.amount);
        if (_withdrawRequests[position.amount] != address(0)) {
            revert InvalidWithdrawRequest();
        }
        _withdrawRequests[position.amount] = msg.sender;

        emit WithdrawRequested(msg.sender, position.amount);
    }

    function finalizeWithdraw(
        euint64 amount,
        uint64 clearAmount,
        bytes calldata decryptionProof
    ) external {
        address staker = _withdrawRequests[amount];
        if (staker == address(0)) {
            revert InvalidWithdrawRequest();
        }

        StakePosition storage position = _stakes[staker];
        if (!position.active || !position.withdrawRequested) {
            revert InvalidWithdrawRequest();
        }

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = euint64.unwrap(amount);
        bytes memory cleartexts = abi.encode(clearAmount);
        FHE.checkSignatures(handles, cleartexts, decryptionProof);

        uint256 rewardAmount = (uint256(clearAmount) * REWARD_PER_ETH) / 1e18;
        if (rewardAmount > type(uint64).max) {
            revert RewardOverflow();
        }

        delete _withdrawRequests[amount];
        delete _stakes[staker];

        (bool success, ) = payable(staker).call{value: clearAmount}("");
        if (!success) {
            revert TransferFailed();
        }

        rewardCoin.mint(staker, uint64(rewardAmount));

        emit WithdrawFinalized(staker, clearAmount, uint64(rewardAmount));
    }

    function getStake(address staker)
        external
        view
        returns (euint64 amount, uint64 unlockTimestamp, bool active, bool withdrawRequested)
    {
        StakePosition storage position = _stakes[staker];
        return (position.amount, position.unlockTimestamp, position.active, position.withdrawRequested);
    }

    function canWithdraw(address staker) external view returns (bool) {
        StakePosition storage position = _stakes[staker];
        return position.active && block.timestamp >= position.unlockTimestamp && !position.withdrawRequested;
    }

    receive() external payable {
        revert InvalidAmount();
    }
}
