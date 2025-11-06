import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { ConnectButton, useActiveAccount } from 'thirdweb/react';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load the components
const Dashboard = lazy(() => import('./components/Dashboard'));
const ArbitrageFinder = lazy(() => import('./components/ArbitrageFinder'));
const ArbitrageOpportunities = lazy(() => import('./components/ArbitrageOpportunities'));
const TradeHistory = lazy(() => import('./components/TradeHistory'));

export default function App() {
  const account = useActiveAccount();
  const address = account?.address;
  const activeChain = account?.chain;

  const [tokenAddress, setTokenAddress] = useState('');
  const [inputDex, setInputDex] = useState('');
  const [outputDex, setOutputDex] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const navLinkStyle = ({ isActive }) => ({
    display: 'block',
    padding: '12px 20px',
    margin: '8px 0',
    borderRadius: '6px',
    textDecoration: 'none',
    color: isActive ? '#fff' : '#333',
    backgroundColor: isActive ? '#007bff' : 'transparent',
    fontWeight: isActive ? 'bold' : 'normal',
    transition: 'background-color 0.2s, color 0.2s',
  });

  const handleCheckTrade = async () => {
    setLoading(true);
    try {
      setError(null);
      if (!tokenAddress || !inputDex || !outputDex) {
        throw new Error("Please fill in all fields before checking a trade.");
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      alert(`Checking trade for ${tokenSymbol || tokenAddress} between ${inputDex} and ${outputDex}`);
    } catch (err) {
      console.error('Error checking trade:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Router>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f4f7fa' }}>
        {/* Side Navigation */}
        <div style={{ width: '220px', backgroundColor: '#fff', padding: '20px', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column' }}>
          <img src="/logo.png" alt="Forge Inc. Logo" style={{ height: '50px', marginBottom: '30px', alignSelf: 'center' }} />
          <nav style={{ flex: 1 }}>
            <NavLink to="/dashboard" style={navLinkStyle}>Dashboard</NavLink>
            <NavLink to="/finder" style={navLinkStyle}>Arbitrage Finder</NavLink>
            <NavLink to="/opportunities" style={navLinkStyle}>Opportunities</NavLink>
            <NavLink to="/history" style={navLinkStyle}>Trade History</NavLink>
          </nav>
        </div>

        {/* Main Content */}
        <main style={{ flex: 1, padding: '20px 40px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '20px', borderBottom: '1px solid #e0e0e0', marginBottom: '30px' }}>
            <div>
              {address && <p style={{margin: 0, color: '#555'}}>Connected as: <strong>{address}</strong></p>}
              {activeChain && <p style={{margin: 0, color: '#555'}}>Network: <strong>{activeChain.name}</strong></p>}
            </div>
            <ConnectButton />
          </header>

          {loading && <div style={{ textAlign: 'center', padding: '20px' }}><strong>Loading...</strong></div>}
          {error && (
            <div style={{ color: 'red', backgroundColor: '#ffeded', padding: '12px', borderRadius: '8px', margin: '20px 0' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}><h2>Loading Page...</h2></div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                <ErrorBoundary>
                  <Dashboard />
                </ErrorBoundary>
              } />
              <Route path="/finder" element={
                <ErrorBoundary>
                  <ArbitrageFinder 
                    tokenAddress={tokenAddress}
                    setTokenAddress={setTokenAddress}
                    inputDex={inputDex}
                    setInputDex={setInputDex}
                    outputDex={outputDex}
                    setOutputDex={setOutputDex}
                    onCheckTrade={handleCheckTrade}
                    tokenSymbol={tokenSymbol}
                    disabled={loading}
                  />
                </ErrorBoundary>
              } />
              <Route path="/opportunities" element={
                <ErrorBoundary>
                  <ArbitrageOpportunities tokenAddress={tokenAddress} />
                </ErrorBoundary>
              } />
              <Route path="/history" element={
                <ErrorBoundary>
                  <TradeHistory />
                </ErrorBoundary>
              } />
            </Routes>
          </Suspense>
        </main>
      </div>
    </Router>
  );
}
