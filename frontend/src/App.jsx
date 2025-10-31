import React, { useEffect, useState } from 'react';
import NetworkToggle from './components/NetworkToggle';
import { ethers } from 'ethers';

const getRpc = (net) => {
  if (net === 'mainnet') return import.meta.env.VITE_BASE_MAINNET_RPC;
  return import.meta.env.VITE_BASE_SEPOLIA_RPC;
};

const getContractAddr = (net) => {
  if (net === 'mainnet') return import.meta.env.VITE_BASE_MAINNET_CONTRACT;
  return import.meta.env.VITE_BASE_SEPOLIA_CONTRACT;
};

export default function App(){
  const [network, setNetwork] = useState(localStorage.getItem('network') || import.meta.env.VITE_DEFAULT_NETWORK || 'sepolia');
  const [provider, setProvider] = useState(null);
  const [contractAddr, setContractAddr] = useState(getContractAddr(network));

  useEffect(()=>{
    const rpc = getRpc(network);
    setProvider(new ethers.JsonRpcProvider(rpc));
    setContractAddr(getContractAddr(network));
    localStorage.setItem('network', network);
  }, [network]);

  const handleToggle = ()=> setNetwork(prev => prev === 'sepolia' ? 'mainnet' : 'sepolia');

  return (
    <div style={{padding:20,fontFamily:'Arial, sans-serif'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h1>Arbitrage App</h1>
        <NetworkToggle network={network} onToggle={handleToggle} />
      </header>
      <p>Connected network: <strong>{network}</strong></p>
      <p>RPC: {getRpc(network)}</p>
      <p>Contract: {contractAddr}</p>
      <div style={{marginTop:20}}>
        <button onClick={async ()=>{
          try{
            const block = await provider.getBlockNumber();
            alert('RPC OK - block: '+block);
          }catch(e){
            alert('RPC error: '+e.message);
          }
        }}>Test RPC</button>
      </div>
    </div>
  );
}
