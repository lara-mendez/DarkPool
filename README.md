# DarkPool

DarkPool is a privacy-first ETH staking application built on Zama FHEVM. Staked amounts are encrypted on-chain, locked
by time, and only decrypted at withdrawal to return ETH and mint RewardCoin at a fixed rate of 1000 RWC per 1 ETH.

## Overview

DarkPool focuses on confidentiality, time-locked staking, and transparent reward logic without exposing user balances
on-chain during the staking period.

## Problem Statement

Most staking contracts publicly reveal deposit amounts and balances. This makes it easy to infer user positions,
strategies, and timing. DarkPool addresses this by encrypting stake amounts on-chain and only revealing the clear amount
at the moment of withdrawal, while still enforcing lock times and deterministic reward issuance.

## Solution Summary

- Encrypt stake amounts with FHE (Fully Homomorphic Encryption) using Zama FHEVM.
- Enforce a user-defined lock duration on-chain.
- Decrypt only at withdrawal time using a verifiable decryption proof.
- Mint confidential RewardCoin based on the clear ETH amount (1000 RWC per 1 ETH).

## Key Features

- Encrypted on-chain balances using `euint64`.
- Time-locked staking with a single active position per address.
- Two-step withdrawal flow: request (make decryptable) and finalize (verify proof).
- Confidential reward token issuance using ERC7984.
- Frontend reads with viem and writes with ethers for clarity and separation of concerns.

## Advantages

- Privacy by default: stake amounts are not visible during the lock period.
- Trust-minimized decryption: withdrawal uses verifiable Zama proofs.
- Clear reward economics: fixed, deterministic reward rate.
- Simple user model: one active stake per address reduces edge cases.
- No off-chain database required; state is fully on-chain.

## How It Works

### Stake Flow

1. User chooses a lock duration in seconds.
2. User sends ETH to `DarkPoolStaking.stake`.
3. The contract encrypts the ETH amount into `euint64` and stores it.
4. The encrypted amount is allowlisted for the contract and the user.

### Withdraw Flow

1. After the unlock time, user calls `requestWithdraw`.
2. The contract marks the amount as publicly decryptable and stores a request mapping.
3. A relayer obtains the decryption proof from Zama and calls `finalizeWithdraw`.
4. The contract verifies the proof, returns ETH, and mints RewardCoin.

### Reward Logic

- Reward rate is constant: `REWARD_PER_ETH = 1000 * 1e6`.
- Reward minting happens only at successful withdrawal finalization.
- RewardCoin uses confidential balances (`ERC7984`) to avoid revealing holdings.

## Smart Contracts

### DarkPoolStaking

Core staking contract that:

- Accepts ETH and encrypts it to `euint64`.
- Stores lock timestamps and withdrawal state.
- Enforces unlock time before withdrawal.
- Verifies Zama decryption proofs on finalize.
- Transfers ETH back to the staker and mints RewardCoin.

### RewardCoin

Confidential ERC7984 token that:

- Is minted by the staking contract only.
- Encrypts balances using FHE.
- Supports ownership and minter configuration.

### FHECounter

Legacy example contract from the original template. It is not used by DarkPool and is kept for reference only.

## Technical Stack

- Smart contracts: Solidity, Hardhat, hardhat-deploy, TypeChain
- Confidential computing: Zama FHEVM (`@fhevm/solidity`), ERC7984
- Frontend: React + Vite
- Web3: viem (read), ethers (write), RainbowKit wallet UI
- Relayer: `@zama-fhe/relayer-sdk`

## Architecture Overview

- On-chain state stores only encrypted stake amounts.
- Time lock is stored as a clear timestamp.
- Withdrawal finalization relies on Zama decryption proofs.
- Reward token balances are confidential.

## Project Structure

```
contracts/                Solidity contracts
deploy/                   Hardhat deploy scripts
deployments/              Deployment artifacts (ABI + addresses)
docs/                     Zama docs used by this project
tasks/                    Hardhat tasks
test/                     Hardhat tests
src/                      Frontend (React + Vite)
```

## Prerequisites

- Node.js 20+
- npm

## Local Development (Contracts)

1. Install dependencies (root project):

   ```bash
   npm install
   ```

2. Compile and test:

   ```bash
   npm run compile
   npm run test
   ```

3. Run a local node and deploy (for contract testing only):

   ```bash
   npm run chain
   npm run deploy:localhost
   ```

## Deploy to Sepolia

Deployment uses a private key and Infura API key. Do not use a mnemonic.

1. Create a `.env` file in the project root:

   ```bash
   INFURA_API_KEY=your_infura_key
   PRIVATE_KEY=your_private_key
   ```

2. Run the full test suite, then deploy:

   ```bash
   npm run test
   npm run deploy:sepolia
   ```

3. (Optional) verify:

   ```bash
   npm run verify:sepolia -- <CONTRACT_ADDRESS>
   ```

## Frontend Setup

The frontend is located in `src/` and is a separate Vite project.

1. Install dependencies:

   ```bash
   cd src
   npm install
   ```

2. Update contract addresses and ABIs:

   - Copy the ABI from `deployments/sepolia` into `src/src/config/contracts.ts`.
   - Set `STAKING_ADDRESS` and `REWARD_ADDRESS` in `src/src/config/contracts.ts`.

3. Run the app:

   ```bash
   npm run dev
   ```

Frontend constraints:

- No localhost RPC networks; the UI targets Sepolia only.
- No environment variables or localStorage usage in the frontend.
- No `.json` files inside the frontend; ABIs are embedded in TypeScript.

## Scripts (Root)

Common contract scripts:

- `npm run compile`
- `npm run test`
- `npm run deploy:localhost`
- `npm run deploy:sepolia`
- `npm run verify:sepolia`

## Operational Notes

- Only one active stake is allowed per address.
- Stake amounts are limited to `uint64` (FHE type constraints).
- The contract rejects direct ETH transfers via `receive`.
- Withdrawal finalization depends on the availability of the Zama relayer.

## Documentation References

- `docs/zama_llm.md` for contract integration guidance
- `docs/zama_doc_relayer.md` for relayer usage in the frontend

## Future Roadmap

- Support multiple concurrent stakes per address.
- Partial withdrawals with proportional rewards.
- Configurable reward rate governance with timelocks.
- Better relayer resilience and fallback strategies.
- Security audit and formal verification of withdrawal flow.
- Cross-chain deployment and unified UI for multiple networks.
- UX improvements for decryption status and proof progress.

## License

BSD-3-Clause-Clear. See `LICENSE`.
