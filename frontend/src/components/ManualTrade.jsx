import React, { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';
import { DEX_CHOICES, EXPLORER_URL } from '../constants';
import { useNetwork } from '../contexts/NetworkContext';
import { EXECUTE_TRADE_URL, SIMULATE_TRADE_URL } from '../config';

const ManualTrade = () => {
  const { network } = useNetwork();
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [dex1, setDex1] = useState('BaseSwap');
  const [dex2, setDex2] = useState('SushiSwap');
  const [loanAmount, setLoanAmount] = useState('1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationError, setSimulationError] = useState(null);

  const handleExecuteTrade = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(EXECUTE_TRADE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network, tokenA, tokenB, dex1, dex2, loanAmount })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (e) {
      console.error("Failed to execute trade:", e);
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const debouncedSimulate = useCallback(
    debounce(async (tradeParams) => {
      if (!tradeParams.tokenA || !tradeParams.tokenB || !tradeParams.dex1 || !tradeParams.dex2 || !tradeParams.loanAmount) {
        setSimulationResult(null);
        return;
      }
      setSimulating(true);
      setSimulationError(null);
      try {
        const response = await fetch(SIMULATE_TRADE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeParams),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Simulation failed');
        }
        const data = await response.json();
        setSimulationResult(data);
      } catch (err) {
        setSimulationError(err.message);
        setSimulationResult(null);
      } finally {
        setSimulating(false);
      }
    }, 500),
    []
  );

  useEffect(() => {
    const tradeParams = { network, tokenA, tokenB, dex1, dex2, loanAmount };
    debouncedSimulate(tradeParams);
  }, [network, tokenA, tokenB, dex1, dex2, loanAmount, debouncedSimulate]);

  const isTradeProfitable = simulationResult && simulationResult.isProfitable;
  const explorerBaseUrl = EXPLORER_URL[network] || 'https://basescan.org';

  return (
    <div className="manual-trade-container">
      <div className="controller-header">
          <h3>Manual Trade Executor</h3>
          <p className="text-color-muted">Manually execute a flash loan arbitrage trade.</p>
      </div>
      <form onSubmit={handleExecuteTrade} className="trade-form">
        <input type="text" value={tokenA} onChange={(e) => setTokenA(e.target.value)} placeholder="Token to Borrow (Address)" className="input-field" required />
        <input type="text" value={tokenB} onChange={(e) => setTokenB(e.target.value)} placeholder="Token to Swap For (Address)" className="input-field" required />
        <select value={dex1} onChange={(e) => setDex1(e.target.value)} className="select-field" required>
          <option value="" disabled>Source DEX</option>
          {Object.keys(DEX_CHOICES).map(key => (<option key={key} value={key}>{DEX_CHOICES[key]}</option>))}
        </select>
        <select value={dex2} onChange={(e) => setDex2(e.target.value)} className="select-field" required>
          <option value="" disabled>Destination DEX</option>
           {Object.keys(DEX_CHOICES).map(key => (<option key={key} value={key}>{DEX_CHOICES[key]}</option>))}
        </select>
        <input type="number" step="any" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="Loan Amount" className="input-field" required />
        
        <div className="simulation-box">
          <h4>Pre-Trade Simulation</h4>
          {simulating && <p>Simulating...</p>}
          {simulationError && <p className="error-message">Error: {simulationError}</p>}
          {simulationResult && (
            <div className={simulationResult.isProfitable ? 'text-success' : 'text-danger'}>
              <p>Estimated Profit: {simulationResult.estimatedProfit} </p>
              <p>{simulationResult.isProfitable ? "✅ Trade appears profitable." : "❌ Trade does not appear profitable."}</p>
            </div>
          )}
        </div>

        <button type="submit" disabled={loading || simulating || !isTradeProfitable} className="button button-primary">
          {loading ? 'Executing...' : 'Execute Trade'}
        </button>
      </form>
      
      {error && <div className="error-message">Execution Failed: {error}</div>}

      {result && (
        <div className="success-message">
          <h3>Trade Executed!</h3>
          {result.isProfitable ? (
            <p>✅ Actual Profit: {result.profit}</p>
          ) : (
            <p>⚠️ Trade was executed but was not profitable.</p>
          )}
          <p>Transaction Hash: 
            <a href={`${explorerBaseUrl}/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer">
              {result.txHash}
            </a>
          </p>
        </div>
      )}
    </div>
  );
};

export default ManualTrade;
