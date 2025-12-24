import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="brand">
            <span className="brand-title">DarkPool</span>
            <span className="brand-subtitle">Confidential ETH staking</span>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
