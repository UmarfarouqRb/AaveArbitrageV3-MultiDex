import React, { useState } from 'react';

const ArbitrageFinder = () => {
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [dex1, setDex1] = useState('');
  const [dex2, setDex2] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false); // Add loading state
  const [error, setError] = useState(null); // Add error state

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/.netlify/functions/find-arbitrage', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ tokenA, tokenB, dex1, dex2 })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setResult(data);
    } catch (e) {
      console.error("Failed to find arbitrage:", e);
      setError(e.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="arbitrage-finder-container">
      <h2>Manual Arbitrage Finder</h2>
      <form onSubmit={handleSearch} className="finder-form">
        {/* Inputs for tokenA, tokenB, dex1, dex2 */}
        <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Find Opportunity'}</button>
      </form>
      
      {error && <div className="text-center text-danger"><p>{error}</p></div>}

      {result && (
        <div className="results-container">
          <h3>Search Result</h3>
          {result.isProfitable ? (
            <div className="text-success">
              <h4>Profitable Opportunity Found!</h4>
              <p>Profit: {result.profit} {result.profitToken}</p>
              <p>Path: {result.path.join(' -> ')}</p>
            </div>
          ) : (
            <p>No profitable arbitrage found for the selected path.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ArbitrageFinder;
