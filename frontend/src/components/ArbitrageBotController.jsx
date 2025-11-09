import { useState, useEffect, useRef, useCallback } from 'react';
import { Wallet } from 'ethers';

const ArbitrageBotController = () => {
  const [privateKey, setPrivateKey] = useState('');
  const [infuraApiKey, setInfuraApiKey] = useState('');
  const [botWalletAddress, setBotWalletAddress] = useState('');
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [log, setLog] = useState('Bot is idle. Enter a private key and Infura API key, then start the bot to check for opportunities.');

  const intervalRef = useRef(null);
  const logRef = useRef(null);

  const handlePrivateKeyChange = useCallback((pk) => {
    setPrivateKey(pk);
    try {
      if (pk.startsWith('0x') && pk.length === 66) {
        const wallet = new Wallet(pk);
        setBotWalletAddress(wallet.address);
        sessionStorage.setItem('botPrivateKey', pk);
      } else {
        setBotWalletAddress('');
      }
    } catch (error) {
      setBotWalletAddress('Invalid Private Key');
    }
  }, []);

  const handleInfuraApiKeyChange = useCallback((key) => {
    setInfuraApiKey(key);
    sessionStorage.setItem('botInfuraApiKey', key);
  }, []);

  useEffect(() => {
    const storedPrivateKey = sessionStorage.getItem('botPrivateKey');
    if (storedPrivateKey) {
      handlePrivateKeyChange(storedPrivateKey);
    }
    const storedApiKey = sessionStorage.getItem('botInfuraApiKey');
    if (storedApiKey) {
      handleInfuraApiKeyChange(storedApiKey);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [handlePrivateKeyChange, handleInfuraApiKeyChange]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const handleResetPrivateKey = () => {
    if (isBotRunning) {
      setLog(prev => `${prev}\n[${new Date().toLocaleTimeString()}] Error: Please stop the bot before resetting the private key.`);
      return;
    }
    setPrivateKey('');
    setBotWalletAddress('');
    sessionStorage.removeItem('botPrivateKey');
    setLog('Private key has been reset. The bot is now idle.');
  };

  const handleResetInfuraApiKey = () => {
    if (isBotRunning) {
      setLog(prev => `${prev}\n[${new Date().toLocaleTimeString()}] Error: Please stop the bot before resetting the API key.`);
      return;
    }
    setInfuraApiKey('');
    sessionStorage.removeItem('botInfuraApiKey');
    setLog('Infura API key has been reset.');
  };

  const runArbitrageCheck = useCallback(async () => {
    setLog(prev => `${prev}\n[${new Date().toLocaleTimeString()}] Checking for opportunities...`);
    try {
      const response = await fetch('/api/arbitrage-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey, infuraProjectId: infuraApiKey }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || `HTTP error! status: ${response.status}`);
      setLog(prev => `${prev}\n[${new Date().toLocaleTimeString()}] ${result.message}`);
    } catch (error) {
      console.error('Error during arbitrage check:', error);
      setLog(prev => `${prev}\n[${new Date().toLocaleTimeString()}] Error: ${error.message}`);
    }
  }, [privateKey, infuraApiKey]);

  const handleToggleBot = () => {
    if (isBotRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsBotRunning(false);
      setLog(prev => `${prev}\n[${new Date().toLocaleTimeString()}] Bot has been stopped.`);
    } else {
      if (!privateKey || !botWalletAddress || botWalletAddress === 'Invalid Private Key') {
        setLog('Error: Please enter a valid private key before starting the bot.');
        return;
      }
      if (!infuraApiKey) {
        setLog('Error: Please enter your Infura API key before starting the bot.');
        return;
      }
      setIsBotRunning(true);
      setLog(`[${new Date().toLocaleTimeString()}] Bot started! It will check for opportunities every 15 seconds.`);
      runArbitrageCheck();
      intervalRef.current = setInterval(runArbitrageCheck, 15000);
    }
  };

  return (
    <div>
      <h2>Arbitrage Bot Controller</h2>
      
      <div>
        <label htmlFor="privateKey">Bot Private Key (persists in session)</label>
        <div>
          <input
            type="password"
            id="privateKey"
            value={privateKey}
            onChange={(e) => handlePrivateKeyChange(e.target.value)}
            placeholder="Enter EOA private key (0x...)"
            disabled={isBotRunning}
          />
          <button
            onClick={handleResetPrivateKey}
            disabled={isBotRunning}
            title="Reset Private Key"
          >
            Reset
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="infuraApiKey">Infura API Key (persists in session)</label>
        <div>
          <input
            type="password"
            id="infuraApiKey"
            value={infuraApiKey}
            onChange={(e) => handleInfuraApiKeyChange(e.target.value)}
            placeholder="Enter your Infura API Key"
            disabled={isBotRunning}
          />
          <button
            onClick={handleResetInfuraApiKey}
            disabled={isBotRunning}
            title="Reset Infura API Key"
          >
            Reset
          </button>
        </div>
      </div>

      {botWalletAddress && (
        <div>
          <p>Bot Wallet Address:</p>
          <p>{botWalletAddress}</p>
        </div>
      )}

      <button
        onClick={handleToggleBot}
        disabled={!botWalletAddress || botWalletAddress === 'Invalid Private Key' || !infuraApiKey}
      >
        {isBotRunning ? 'Stop Bot' : 'Start Bot'}
      </button>

      <div>
          <h3>Bot Logs:</h3>
          <pre ref={logRef}>{log}</pre>
      </div>
    </div>
  );
};

export default ArbitrageBotController;
