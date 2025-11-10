import { useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { NetworkContext } from '../contexts/NetworkContext';
import { networks } from '../utils/networks';
import SideNav from './SideNav';

export default function Layout({ children, isOwner }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { selectedNetwork, setSelectedNetwork } = useContext(NetworkContext);

  const handleNetworkChange = useCallback((e) => {
    setSelectedNetwork(e.target.value);
  }, [setSelectedNetwork]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title"><Link to="/">Forge Arbitrage Bot</Link></h1>
        <div className="header-controls">
          <select value={selectedNetwork} onChange={handleNetworkChange} className="select">
            {Object.keys(networks).map(networkKey => (
              <option key={networkKey} value={networkKey}>
                {networks[networkKey].name}
              </option>
            ))}
          </select>
          {ready && (authenticated ? (
            <button onClick={logout} className="button-secondary">Logout</button>
          ) : (
            <button onClick={login} className="button-primary">Login</button>
          ))}
        </div>
      </header>
      <div className="app-body">
        <SideNav isOwner={isOwner} />
        <main className="main-content">
          {children}
        </main>
      </div>
      <footer className="app-footer">
        <p>powered by forge inc</p>
      </footer>
    </div>
  );
}
