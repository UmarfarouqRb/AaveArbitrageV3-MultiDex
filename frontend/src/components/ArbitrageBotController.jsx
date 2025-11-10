
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { JsonRpcProvider, Contract, Wallet } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { uniswapV2RouterABI, arbitrageBalancerABI } from '../utils/abi';
import './ArbitrageBotController.css';

const ArbitrageBotController = () => {
  const {
    isUnlocked,
    botWalletAddress,
    lockWallet,
    privateKey, // Destructure the raw private key from the context
    setAndEncryptPrivateKey
  } = useWallet();

  // --- STATE ---
  const [infuraApiKey, setInfuraApiKey] = useState('');
  const [tokenA, setTokenA] = useState('0x4200000000000000000000000000000000000006'); // WETH on Base
  const [tokenB, setTokenB] = useState('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'); // USDC on Base
  const [dex1, setDex1] = useState('0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24'); // Uniswap V2 on Base
  const [dex2, setDex2] = useState('0x8cde23bfcc333490347344f2A14a60C803275f4D'); // SushiSwap on Base
  const [arbitrageBotAddress, setArbitrageBotAddress] = useState('');
  const [oracleAddress, setOracleAddress] = useState('');
  const [profitThreshold, setProfitThreshold] = useState('1');
  const [useDynamicLoan, setUseDynamicLoan] = useState(true);
  const [manualLoanAmount, setManualLoanAmount] = useState('1');
  const [gasStrategy, setGasStrategy] = useState('medium');
  const [checkInterval, setCheckInterval] = useState(30);

  const [isBotRunning, setIsBotRunning] = useState(false);
  const [log, setLog] = useState('Bot is idle. Configure your settings and start the bot.\n');
  const [error, setError] = useState('');

  const intervalRef = useRef(null);
  const logRef = useRef(null);
  
  // --- AUTH STATE ---
  const [pkInput, setPkInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // --- EFFECTS ---
  useEffect(() => {
    const storedApiKey = sessionStorage.getItem('botInfuraApiKey');
    if (storedApiKey) setInfuraApiKey(storedApiKey);

    const storedBotAddress = localStorage.getItem('arbitrageBotAddress');
    if (storedBotAddress) setArbitrageBotAddress(storedBotAddress);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // --- LOGGING UTILITY ---
  const appendLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLog(prevLog => `${prevLog}${timestamp}: ${message}\n`);
  };

  // --- CORE BOT LOGIC ---
  const runArbitrageCheck = useCallback(async () => {
    if (!privateKey) {
        appendLog("ERROR: Private key is not available. Stopping bot.");
        setIsBotRunning(false);
        return;
    }
    
    appendLog('Checking for arbitrage opportunity...');

    try {
      const response = await fetch('/.netlify/functions/arbitrage-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey, // Send the raw private key
          infuraProjectId: infuraApiKey,
          tokenA,
          tokenB,
          dex1,
          dex2,
          arbitrageBotAddress,
          oracleAddress,
          profitThreshold,
          useDynamicLoan,
          manualLoanAmount,
          gasStrategy
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Server responded with status ${response.status}`);
      }

      if (data.tradeExecuted) {
        appendLog(`SUCCESS! Trade executed. TxHash: ${data.txHash}`);
        appendLog(`Gross Profit (before gas): ${data.grossProfit} ${tokenA === '0x4200000000000000000000000000000000000006' ? 'WETH' : 'TokenA'}`);
      } else {
        appendLog(`No profitable opportunity found. Reason: ${data.message}`);
      }
    } catch (err) {
      console.error("Arbitrage check failed:", err);
      appendLog(`ERROR: ${err.message}`);
      setIsBotRunning(false); // Stop the bot on critical errors
    }
  }, [
    privateKey, infuraApiKey, tokenA, tokenB, dex1, dex2,
    arbitrageBotAddress, oracleAddress, profitThreshold,
    useDynamicLoan, manualLoanAmount, gasStrategy
  ]);

  // --- HANDLERS ---
  const handleStartBot = () => {
    if (!infuraApiKey) {
      setError('Please save your Infura API Key before starting the bot.');
      return;
    }
    if (!arbitrageBotAddress) {
      setError('Please provide the Arbitrage Balancer contract address.');
      return;
    }
    setError('');
    setIsBotRunning(true);
    appendLog(`Bot started. Checking every ${checkInterval} seconds.`);
    runArbitrageCheck(); // Run immediately on start
    intervalRef.current = setInterval(runArbitrageCheck, checkInterval * 1000);
  };

  const handleStopBot = () => {
    setIsBotRunning(false);
    appendLog('Bot stopped by user.');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  const handleLockWallet = () => {
      if (isBotRunning) handleStopBot();
      lockWallet();
      appendLog("Wallet locked. Bot stopped.");
  }

  const handleInfuraKeySave = () => {
    sessionStorage.setItem('botInfuraApiKey', infuraApiKey);
    appendLog('Infura API Key saved for this session.');
  };

  const handleBotAddressSave = () => {
    localStorage.setItem('arbitrageBotAddress', arbitrageBotAddress);
    appendLog('Arbitrage Balancer contract address saved.');
  };

  const handleKeyImport = async () => {
      if (!pkInput || !passwordInput) {
          setError("Please provide both a private key and a password.");
          return;
      }
      try {
        await setAndEncryptPrivateKey(pkInput, passwordInput);
        // No need to call unlockWallet, as setAndEncryptPrivateKey now sets the key in state
      } catch (e) {
          console.error(e);
          setError("Failed to import key. Check console for details.");
      }
  }

  // --- RENDER LOGIC ---
  if (!isUnlocked) {
    return (
        <div className="auth-form form-section">
          <h4>Unlock or Import Wallet</h4>
          <p>Import a new private key or unlock your existing one.</p>
          <input
            type="password"
            value={pkInput}
            onChange={(e) => setPkInput(e.target.value)}
            placeholder="Enter Private Key"
            className="input-field"
          />
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter a Strong Password"
            className="input-field"
          />
          <button onClick={handleKeyImport} className="button-primary">Import & Encrypt</button>
          {error && <p className="error-message">{error}</p>}
        </div>
      );
  }

  return (
    <div className="arbitrage-bot-controller">
      <div className="controller-header">
        <h3>Bot Control Panel</h3>
        <p className="wallet-address">Wallet: {botWalletAddress}</p>
        <button onClick={handleLockWallet} className="button-secondary">Lock Wallet & Stop Bot</button>
      </div>

      <div className="main-content">
        <div className="settings-column">
          <h4>Configuration</h4>

          <div className="form-section">
              <label>Infura API Key</label>
              <div className="input-group">
                <input type="password" value={infuraApiKey} onChange={(e) => setInfuraApiKey(e.target.value)} placeholder="Your Infura API Key" />
                <button onClick={handleInfuraKeySave}>Save</button>
              </div>
          </div>
          
          <div className="form-section">
              <label>Arbitrage Contract Address</label>
              <div className="input-group">
                  <input value={arbitrageBotAddress} onChange={(e) => setArbitrageBotAddress(e.target.value)} placeholder="0x..." />
                  <button onClick={handleBotAddressSave}>Save</button>
              </div>
          </div>

          <div className="form-section">
            <label>Token A</label>
            <input value={tokenA} onChange={(e) => setTokenA(e.target.value)} />
            <label>Token B</label>
            <input value={tokenB} onChange={(e) => setTokenB(e.target.value)} />
          </div>

          <div className="form-section">
            <label>DEX 1 Router</label>
            <input value={dex1} onChange={(e) => setDex1(e.target.value)} />
            <label>DEX 2 Router</label>
            <input value={dex2} onChange={(e) => setDex2(e.target.value)} />
          </div>

          <div className="form-section">
            <label>Profit Threshold (in Token A)</label>
            <input type="number" step="0.01" value={profitThreshold} onChange={(e) => setProfitThreshold(e.target.value)} />
          </div>
          
          <div className="form-section">
             <label>Loan Amount</label>
             <div>
                <input type="radio" id="dynamicLoan" name="loanType" checked={useDynamicLoan} onChange={() => setUseDynamicLoan(true)} />
                <label htmlFor="dynamicLoan">Dynamic</label>
             </div>
             <div>
                 <input type="radio" id="manualLoan" name="loanType" checked={!useDynamicLoan} onChange={() => setUseDynamicLoan(false)} />
                 <label htmlFor="manualLoan">Manual</label>
                 {!useDynamicLoan && <input type="number" value={manualLoanAmount} onChange={(e) => setManualLoanAmount(e.target.value)} />}
            </div>
          </div>

          <div className="form-section">
            <label>Gas Price Strategy</label>
            <select value={gasStrategy} onChange={(e) => setGasStrategy(e.target.value)}>
              <option value="medium">Medium</option>
              <option value="fast">Fast</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="form-section">
              <label>Check Interval (seconds)</label>
              <input type="number" value={checkInterval} onChange={(e) => setCheckInterval(Number(e.target.value))} />
          </div>

        </div>

        <div className="control-column">
          <h4>Bot Status & Logs</h4>
          <div className="controls">
            <button onClick={handleStartBot} disabled={isBotRunning} className="button-primary">Start Bot</button>
            <button onClick={handleStopBot} disabled={!isBotRunning} className="button-secondary">Stop Bot</button>
          </div>
          <div className="log-box" ref={logRef}>
            <pre>{log}</pre>
          </div>
           {error && <p className="error-message">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default ArbitrageBotController;
