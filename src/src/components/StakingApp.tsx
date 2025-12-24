import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract, formatUnits, parseEther } from 'ethers';
import { sepolia } from 'viem/chains';

import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { publicClient } from '../config/publicClient';
import { STAKING_ADDRESS, STAKING_ABI, REWARD_ADDRESS, REWARD_ABI } from '../config/contracts';
import { Header } from './Header';
import '../styles/StakingApp.css';

type StakeInfo = {
  handle: `0x${string}`;
  unlockTimestamp: number;
  active: boolean;
  withdrawRequested: boolean;
};

type DecryptResult = {
  clearValue: bigint;
  formatted: string;
};

// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function StakingApp() {
  const { address, isConnected, chainId } = useAccount();
  const signerPromise = useEthersSigner({ chainId: sepolia.id });
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [lockDays, setLockDays] = useState('7');
  const [stakeInfo, setStakeInfo] = useState<StakeInfo | null>(null);
  const [stakeDecrypted, setStakeDecrypted] = useState<DecryptResult | null>(null);
  const [rewardDecrypted, setRewardDecrypted] = useState<DecryptResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const isSepolia = chainId === sepolia.id;
  const isConfigured = true;

  const rewardEstimate = useMemo(() => {
    const amount = Number(stakeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return '0';
    }
    return (amount * 1000).toLocaleString('en-US', { maximumFractionDigits: 4 });
  }, [stakeAmount]);

  const unlockDate = useMemo(() => {
    if (!stakeInfo?.unlockTimestamp) {
      return null;
    }
    return new Date(stakeInfo.unlockTimestamp * 1000);
  }, [stakeInfo]);

  const refreshStake = useCallback(async () => {
    if (!address || !isConfigured) {
      setStakeInfo(null);
      setStakeDecrypted(null);
      return;
    }

    const result = await publicClient.readContract({
      address: STAKING_ADDRESS,
      abi: STAKING_ABI,
      functionName: 'getStake',
      args: [address],
    });

    const [handle, unlockTimestamp, active, withdrawRequested] = result as readonly [
      `0x${string}`,
      bigint,
      boolean,
      boolean,
    ];

    setStakeInfo({
      handle,
      unlockTimestamp: Number(unlockTimestamp),
      active,
      withdrawRequested,
    });
    setStakeDecrypted(null);
  }, [address, isConfigured]);

  const refreshReward = useCallback(async () => {
    if (!address || !isConfigured) {
      setRewardDecrypted(null);
      return;
    }

    const balanceHandle = await publicClient.readContract({
      address: REWARD_ADDRESS,
      abi: REWARD_ABI,
      functionName: 'confidentialBalanceOf',
      args: [address],
    });

    if (!balanceHandle) {
      setRewardDecrypted(null);
    }
  }, [address, isConfigured]);

  useEffect(() => {
    if (!address || !isConfigured) {
      setStakeInfo(null);
      setStakeDecrypted(null);
      setRewardDecrypted(null);
      return;
    }

    refreshStake();
    refreshReward();
  }, [address, isConfigured, refreshStake, refreshReward]);

  useEffect(() => {
    if (!isConfigured) {
      setStatusMessage('Update contract addresses to continue.');
    }
  }, [isConfigured]);

  const decryptHandle = useCallback(
    async (
      handle: `0x${string}`,
      contractAddress: `0x${string}`,
      decimals: number,
    ): Promise<DecryptResult> => {
      if (!instance || !address || !signerPromise) {
        throw new Error('Missing encryption context.');
      }

      const signer = await signerPromise;
      const keypair = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '1';
      const contractAddresses = [contractAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays);

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature,
        contractAddresses,
        address,
        startTimestamp,
        durationDays,
      );

      const clearValueRaw = result[handle];
      const clearValue = typeof clearValueRaw === 'bigint' ? clearValueRaw : BigInt(clearValueRaw);
      return {
        clearValue,
        formatted: formatUnits(clearValue, decimals),
      };
    },
    [address, instance, signerPromise],
  );

  const handleStake = async () => {
    if (!isConfigured) {
      setStatusMessage('Update contract addresses to continue.');
      return;
    }
    if (!address || !signerPromise) {
      setStatusMessage('Connect your wallet to stake.');
      return;
    }
    if (!isSepolia) {
      setStatusMessage('Switch to Sepolia to continue.');
      return;
    }

    const duration = Math.floor(Number(lockDays) * 86400);
    if (!Number.isFinite(duration) || duration <= 0) {
      setStatusMessage('Enter a valid lock duration.');
      return;
    }

    try {
      setIsBusy(true);
      setStatusMessage('Confirm the stake in your wallet.');
      const signer = await signerPromise;
      const stakingContract = new Contract(STAKING_ADDRESS, STAKING_ABI, signer);
      const tx = await stakingContract.stake(duration, { value: parseEther(stakeAmount) });
      setStatusMessage('Waiting for confirmation...');
      await tx.wait();
      setStatusMessage('Stake confirmed.');
      await refreshStake();
    } catch (error) {
      console.error('Stake failed:', error);
      setStatusMessage('Stake failed. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDecryptStake = async () => {
    if (!isConfigured) {
      setStatusMessage('Update contract addresses to continue.');
      return;
    }
    if (!stakeInfo?.active) {
      setStatusMessage('No active stake to decrypt.');
      return;
    }
    if (!isConfigured) {
      setStatusMessage('Update contract addresses to continue.');
      return;
    }
    try {
      setIsBusy(true);
      setStatusMessage('Decrypting your stake...');
      const result = await decryptHandle(stakeInfo.handle, STAKING_ADDRESS, 18);
      setStakeDecrypted(result);
      setStatusMessage('Stake decrypted.');
    } catch (error) {
      console.error('Decrypt stake failed:', error);
      setStatusMessage('Stake decryption failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDecryptRewards = async () => {
    try {
      setIsBusy(true);
      setStatusMessage('Decrypting reward balance...');
      const result = await decryptHandle(await getRewardHandle(), REWARD_ADDRESS, 6);
      setRewardDecrypted(result);
      setStatusMessage('Reward balance decrypted.');
    } catch (error) {
      console.error('Decrypt reward failed:', error);
      setStatusMessage('Reward decryption failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const getRewardHandle = useCallback(async () => {
    if (!address || !isConfigured) {
      throw new Error('Missing address.');
    }
    const balanceHandle = await publicClient.readContract({
      address: REWARD_ADDRESS,
      abi: REWARD_ABI,
      functionName: 'confidentialBalanceOf',
      args: [address],
    });

    return balanceHandle as `0x${string}`;
  }, [address, isConfigured]);

  const handleWithdraw = async () => {
    if (!isConfigured) {
      setStatusMessage('Update contract addresses to continue.');
      return;
    }
    if (!stakeInfo?.active) {
      setStatusMessage('No active stake to withdraw.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setStatusMessage('Connect your wallet to withdraw.');
      return;
    }
    if (!isSepolia) {
      setStatusMessage('Switch to Sepolia to continue.');
      return;
    }
    if (stakeInfo.withdrawRequested) {
      setStatusMessage('Withdraw already requested. Finalizing...');
    }

    try {
      setIsBusy(true);
      const signer = await signerPromise;
      const stakingContract = new Contract(STAKING_ADDRESS, STAKING_ABI, signer);

      if (!stakeInfo.withdrawRequested) {
        setStatusMessage('Requesting unlock decryption...');
        const requestTx = await stakingContract.requestWithdraw();
        await requestTx.wait();
      }

      setStatusMessage('Fetching public decryption proof...');
      const decrypted = await instance.publicDecrypt([stakeInfo.handle]);
      const clearAmountRaw = decrypted.clearValues[stakeInfo.handle];
      if (clearAmountRaw === undefined) {
        throw new Error('Missing clear amount from decryption response.');
      }
      const clearAmount = typeof clearAmountRaw === 'bigint' ? clearAmountRaw : BigInt(clearAmountRaw);

      setStatusMessage('Finalizing withdrawal...');
      const finalizeTx = await stakingContract.finalizeWithdraw(
        stakeInfo.handle,
        clearAmount,
        decrypted.decryptionProof,
      );
      await finalizeTx.wait();

      setStatusMessage('Withdrawal complete.');
      await refreshStake();
      await refreshReward();
    } catch (error) {
      console.error('Withdraw failed:', error);
      setStatusMessage('Withdraw failed. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="staking-app">
      <Header />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Encrypted ETH Staking</p>
          <h1>Lock ETH. Reveal only when it pays.</h1>
          <p className="subtitle">
            Your stake amount is encrypted with Zama FHE. Set a lock time, unlock with on-chain public decryption,
            and earn RewardCoin at 1 ETH = 1000 RWC.
          </p>
          <div className="hero-meta">
            <div>
              <span className="meta-label">Network</span>
              <span className="meta-value">{isSepolia ? 'Sepolia' : 'Unsupported'}</span>
            </div>
            <div>
              <span className="meta-label">Relayer</span>
              <span className="meta-value">{zamaLoading ? 'Connecting' : 'Ready'}</span>
            </div>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-row">
            <span>Reward rate</span>
            <strong>1000 RWC / ETH</strong>
          </div>
          <div className="panel-row">
            <span>Encryption</span>
            <strong>FHE-protected</strong>
          </div>
          <div className="panel-row">
            <span>Unlock</span>
            <strong>Public proof</strong>
          </div>
          <div className="panel-foot">
            {zamaError ? <span className="status-error">{zamaError}</span> : <span>Relayer ready for decrypt.</span>}
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Stake ETH</h2>
          <p className="card-subtitle">Encrypt your stake amount on-chain and choose the lock window.</p>

          <div className="form-grid">
            <label>
              <span>Amount (ETH)</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={stakeAmount}
                onChange={(event) => setStakeAmount(event.target.value)}
                placeholder="0.5"
              />
            </label>
            <label>
              <span>Lock (days)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={lockDays}
                onChange={(event) => setLockDays(event.target.value)}
                placeholder="7"
              />
            </label>
          </div>

          <div className="card-metrics">
            <div>
              <span className="metric-label">Estimated Reward</span>
              <span className="metric-value">{rewardEstimate} RWC</span>
            </div>
            <div>
              <span className="metric-label">Unlock Date</span>
              <span className="metric-value">
                {lockDays ? `${lockDays} day(s) from stake` : 'Set lock duration'}
              </span>
            </div>
          </div>

          <button className="primary" onClick={handleStake} disabled={isBusy || !isConnected}>
            {isBusy ? 'Working...' : 'Stake ETH'}
          </button>
          {!isConnected && <p className="hint">Connect a wallet to start staking.</p>}
        </div>

        <div className="card">
          <h2>Stake Status</h2>
          <p className="card-subtitle">Track your encrypted handle and unlock readiness.</p>

          <div className="status-list">
            <div>
              <span className="metric-label">Active Stake</span>
              <span className="metric-value">{stakeInfo?.active ? 'Yes' : 'No'}</span>
            </div>
            <div>
              <span className="metric-label">Unlock Time</span>
              <span className="metric-value">
                {unlockDate ? unlockDate.toLocaleString() : 'No lock set'}
              </span>
            </div>
            <div>
              <span className="metric-label">Withdraw Requested</span>
              <span className="metric-value">{stakeInfo?.withdrawRequested ? 'Yes' : 'No'}</span>
            </div>
            <div>
              <span className="metric-label">Encrypted Handle</span>
              <span className="metric-value mono">{stakeInfo?.handle ?? '—'}</span>
            </div>
          </div>

          <div className="button-row">
            <button className="secondary" onClick={handleDecryptStake} disabled={isBusy || !stakeInfo?.active}>
              Decrypt Stake
            </button>
            <button className="primary" onClick={handleWithdraw} disabled={isBusy || !stakeInfo?.active}>
              Withdraw + Mint
            </button>
          </div>

          {stakeDecrypted && (
            <div className="highlight">
              <span>Decrypted Stake</span>
              <strong>{stakeDecrypted.formatted} ETH</strong>
            </div>
          )}
        </div>

        <div className="card">
          <h2>RewardCoin</h2>
          <p className="card-subtitle">Confidential balance minted on withdrawal.</p>

          <div className="status-list">
            <div>
              <span className="metric-label">Reward Handle</span>
              <span className="metric-value mono">
                {rewardDecrypted ? 'Decrypted' : 'Encrypted on-chain'}
              </span>
            </div>
          </div>

          <button className="secondary" onClick={handleDecryptRewards} disabled={isBusy || !isConnected}>
            Decrypt Rewards
          </button>

          {rewardDecrypted && (
            <div className="highlight">
              <span>Reward Balance</span>
              <strong>{rewardDecrypted.formatted} RWC</strong>
            </div>
          )}
        </div>
      </section>

      {statusMessage && <div className="status-banner">{statusMessage}</div>}
    </div>
  );
}
