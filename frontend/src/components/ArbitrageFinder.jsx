import { useState, useContext } from 'react';
import { Contract, parseUnits, AbiCoder } from 'ethers';
import { usePrivy } from '@privy-io/react-auth';
import { NetworkContext } from '../contexts/NetworkContext';
import { arbitrageBalancerABI } from '../utils/abi';
import '../index.css'; // Import the new CSS file

const ArbitrageFinder = () => {
  const { ready, authenticated, user, login } = usePrivy();
  const { networkConfig } = useContext(NetworkContext);
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [amount, setAmount] = useState('');
  const [router1, setRouter1] = useState('');
  const [router2, setRouter2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tradeStatus, setTradeStatus] = useState(null);
  const [txHash, setTxHash] = useState('');

  const dexOptions = [
    { label: 'Uniswap V2', value: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
    { label: 'Sushiswap', value: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F' },
    { label: 'Pancakeswap', value: '0x10ED43C718714eb63d5aA57B78B54704E256024E' },
    { label: 'Quickswap', value: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' },
    { label: 'Trader Joe', value: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4' },
  ];

  const handleExecuteTrade = async () => {
    if (!ready || !authenticated) {
      login();
      return;
    }
    
    if (!tokenA || !tokenB || !amount || !router1 || !router2) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError(null);
    setTradeStatus(null);
    setTxHash('');

    try {
      const provider = await user.wallet.getEthersProvider();
      const signer = provider.getSigner();

      const contract = new Contract(networkConfig.arbitrageBalancerAddress, arbitrageBalancerABI, signer);
      
      const parsedAmount = parseUnits(amount, 18);

      const path = [tokenA, tokenB];
      const routers = [router1, router2];
      const userData = AbiCoder.default.encode(
        ['address[]', 'address[]'],
        [path, routers]
      );

      setTradeStatus('Sending transaction...');
      
      const tx = await contract.arbitrage(tokenA, parsedAmount, userData);
      
      setTradeStatus('Transaction sent. Waiting for confirmation...');
      setTxHash(tx.hash);

      await tx.wait();

      setTradeStatus('Trade executed successfully!');

    } catch (err) {
      console.error('Error executing trade:', err);
      setError(err.reason || err.message || "An unknown error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="finder-container">
      <h2 style={{ color: '#00aaff', textAlign: 'center', marginBottom: '1rem' }}>Execute Arbitrage Trade</h2>
      <p style={{ color: '#ccc', textAlign: 'center', marginBottom: '2rem', fontSize: '0.9em' }}>
        This interface allows you to execute a flash loan arbitrage trade. You specify the token pair, the two DEX routers to trade on, and the amount to borrow.
      </p>

      {error && (
        <div style={{ padding: '1rem', borderRadius: '8px', margin: '1.5rem 0', color: '#ff4d4d', backgroundColor: '#2e2e2e' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {tradeStatus && (
        <div style={{ padding: '1rem', borderRadius: '8px', margin: '1.5rem 0', color: '#33cc33', backgroundColor: '#2e2e2e' }}>
          <strong>Status:</strong> {tradeStatus}
          {txHash && (
            <p style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>Tx Hash: {txHash}</p>
          )}
        </div>
      )}

      <div className="input-group">
        <input
          type="text"
          placeholder="Token A Address (to borrow)"
          value={tokenA}
          onChange={(e) => setTokenA(e.target.value)}
          disabled={loading}
          className="input"
        />
        <input
          type="text"
          placeholder="Token B Address"
          value={tokenB}
          onChange={(e) => setTokenB(e.target.value)}
          disabled={loading}
          className="input"
        />
      </div>
      <div className="input-group">
        <select
          value={router1}
          onChange={(e) => setRouter1(e.target.value)}
          disabled={loading}
          className="input"
        >
          <option value="">Select Router 1</option>
          {dexOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={router2}
          onChange={(e) => setRouter2(e.target.value)}
          disabled={loading}
          className="input"
        >
          <option value="">Select Router 2</option>
          {dexOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <input
        type="text"
        placeholder="Amount of Token A to borrow"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        disabled={loading}
        className="input full-width"
      />
      
      <button onClick={handleExecuteTrade} disabled={loading} className="button-primary">
        {loading ? 'Executing...' : 'Execute Flash Loan Trade'}
      </button>
    </div>
  );
};

export default ArbitrageFinder;
