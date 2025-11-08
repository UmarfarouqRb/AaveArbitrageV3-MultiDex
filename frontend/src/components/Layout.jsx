import { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { NetworkContext } from '../contexts/NetworkContext';
import { networks } from '../utils/networks';
import '../index.css'; // Import the new CSS file

export default function Layout({ children }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { selectedNetwork, setSelectedNetwork } = useContext(NetworkContext);
  const address = user?.wallet?.address;

  const handleNetworkChange = (e) => {
    setSelectedNetwork(e.target.value);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Arbitrage Finder</h1>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <select value={selectedNetwork} onChange={handleNetworkChange} className="input">
            {Object.keys(networks).map(networkKey => (
              <option key={networkKey} value={networkKey}>
                {networks[networkKey].name}
              </option>
            ))}
          </select>
          {ready && (authenticated ? (
            <button onClick={logout} className="button-secondary" style={{ marginLeft: '1rem' }}>Logout</button>
          ) : (
            <button onClick={login} className="button-primary" style={{ marginLeft: '1rem' }}>Login</button>
          ))}
        </div>
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
