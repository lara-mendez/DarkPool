// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract RewardCoin is ERC7984, ZamaEthereumConfig {
    address public owner;
    address public minter;

    event MinterUpdated(address indexed newMinter);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidAddress();

    constructor() ERC7984("RewardCoin", "RWC", "") {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) {
            revert Unauthorized();
        }
        _;
    }

    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == address(0)) {
            revert InvalidAddress();
        }
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidAddress();
        }
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function mint(address to, uint64 amount) external onlyMinter {
        if (to == address(0)) {
            revert InvalidAddress();
        }
        euint64 encryptedAmount = FHE.asEuint64(amount);
        _mint(to, encryptedAmount);
    }
}
