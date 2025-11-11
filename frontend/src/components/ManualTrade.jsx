
import React, { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';
import { DEX_CHOICES, EXPLORER_URL } from '../constants'; // Assuming EXPLORER_URL is defined for the network
import { useNetwork } from '../contexts/NetworkContext';

const ManualTrade = () => {
  const { network } = useNetwork();
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [dex1, setDex1] = useState('BaseSwap'); // Default to a valid DEX
  const [dex2, setDex2] = useState('SushiSwap'); // Default to a valid DEX
  const [loanAmount, setLoanAmount] = useState('1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationError, setSimulationError] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const handleExecuteTrade = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/execute-trade`, { // CORRECTED ENDPOINT
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ network, tokenA, tokenB, dex1, dex2, loanAmount })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`); // CORRECTED ERROR HANDLING
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
        const response = await fetch(`${API_URL}/api/simulate-trade`, { // CORRECTED ENDPOINT
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tradeParams),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Simulation failed'); // CORRECTED ERROR HANDLING
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
    [API_URL] 
  );

  useEffect(() => {
    const tradeParams = { network, tokenA, tokenB, dex1, dex2, loanAmount };
    debouncedSimulate(tradeParams);
  }, [network, tokenA, tokenB, dex1, dex2, loanAmount, debouncedSimulate]);

  const isTradeProfitable = simulationResult && simulationResult.isProfitable;
  const explorerBaseUrl = EXPLORER_URL[network] || 'https://basescan.org';

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-white">Manual Trade Executor</h2>
      <form onSubmit={handleExecuteTrade} className="space-y-4">
        <input type="text" value={tokenA} onChange={(e) => setTokenA(e.target.value)} placeholder="Token to Borrow (Address)" className="w-full p-2 rounded bg-gray-700 text-white" required />
        <input type="text" value={tokenB} onChange={(e) => setTokenB(e.target.value)} placeholder="Token to Swap For (Address)" className="w-full p-2 rounded bg-gray-700 text-white" required />
        <select value={dex1} onChange={(e) => setDex1(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white" required>
          <option value="" disabled>Source DEX</option>
          {Object.keys(DEX_CHOICES).map(key => (<option key={key} value={key}>{DEX_CHOICES[key]}</option>))}
        </select>
        <select value={dex2} onChange={(e) => setDex2(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white" required>
          <option value="" disabled>Destination DEX</option>
           {Object.keys(DEX_CHOICES).map(key => (<option key={key} value={key}>{DEX_CHOICES[key]}</option>))}
        </select>
        <input type="number" step="any" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="Loan Amount" className="w-full p-2 rounded bg-gray-700 text-white" required />
        
        <div className="bg-gray-700 p-4 rounded-lg">
          <h4 className="font-semibold text-white">Pre-Trade Simulation</h4>
          {simulating && <p className="text-blue-400">Simulating...</p>}
          {simulationError && <p className="text-red-500">Error: {simulationError}</p>}
          {simulationResult && (
            <div className={simulationResult.isProfitable ? 'text-green-400' : 'text-red-400'}>
              <p>Estimated Profit: {simulationResult.estimatedProfit} </p>
              <p>{simulationResult.isProfitable ? "✅ Trade appears profitable." : "❌ Trade does not appear profitable."}</p>
            </div>
          )}
        </div>

        <button type="submit" disabled={loading || simulating || !isTradeProfitable} className="w-full py-2 px-4 rounded font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed">
          {loading ? 'Executing...' : 'Execute Trade'}
        </button>
      </form>
      
      {error && <div className="mt-4 p-4 rounded-lg bg-red-900 text-red-300"><p>Execution Failed: {error}</p></div>}

      {result && (
        <div className="mt-4 p-4 rounded-lg bg-green-900 text-green-300">
          <h3 className="font-bold">Trade Executed!</h3>
          {result.isProfitable ? (
            <p>✅ Actual Profit: {result.profit}</p>
          ) : (
            <p>⚠️ Trade was executed but was not profitable.</p>
          )}
          <p className="mt-2">Transaction Hash: 
            <a href={`${explorerBaseUrl}/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              {result.txHash}
            </a>
          </p>
        </div>
      )}
    </div>
  );
};

export default ManualTrade;
