import { useState, useContext, useEffect } from 'react';
import { NetworkContext } from '../contexts/NetworkContext';
import { networks } from '../utils/networks';

const TradeExecutor = ({ onFindOpportunities }) => {
  const { networkConfig } = useContext(NetworkContext);
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [dex1, setDex1] = useState('');
  const [dex2, setDex2] = useState('');
  const [dexOptions, setDexOptions] = useState([]);

  useEffect(() => {
    if (networkConfig) {
      setDexOptions(networks[networkConfig.slug].dexRouters);
    }
  }, [networkConfig]);

  const handleFind = () => {
    if (!tokenA || !tokenB || !dex1 || !dex2) {
      alert('Please fill in all fields.');
      return;
    }
    onFindOpportunities({ tokenA, tokenB, dex1, dex2 });
  };

  return (
    <div className="arbitrage-finder-container">
      <h2>Find Arbitrage Opportunities</h2>
      <p>
        Select a token pair and two DEXs to compare prices and find arbitrage opportunities.
      </p>

      <div className="input-group">
        <input
          type="text"
          placeholder="Token A Address"
          value={tokenA}
          onChange={(e) => setTokenA(e.target.value)}
          className="input"
        />
        <input
          type="text"
          placeholder="Token B Address"
          value={tokenB}
          onChange={(e) => setTokenB(e.target.value)}
          className="input"
        />
      </div>
      <div className="input-group">
        <select
          value={dex1}
          onChange={(e) => setDex1(e.target.value)}
          className="select"
        >
          <option value="">Select DEX 1</option>
          {dexOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          value={dex2}
          onChange={(e) => setDex2(e.target.value)}
          className="select"
        >
          <option value="">Select DEX 2</option>
          {dexOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      
      <button onClick={handleFind} className="button-primary">
        Find Opportunities
      </button>
    </div>
  );
};

export default TradeExecutor;
