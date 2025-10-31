
import React, {useState} from 'react';
import { ethers } from 'ethers';
import tokenList from './tokenlist.json';
import { FACTORIES } from './dexes';

export default function App(){
  const [rpc, setRpc] = useState('https://mainnet.infura.io/v3/YOUR_INFURA_KEY');
  const [tokenIn, setTokenIn] = useState(tokenList.tokens[0].address);
  const [tokenOut, setTokenOut] = useState(tokenList.tokens[1].address);
  const [amount, setAmount] = useState('1');
  const [selectedRouters, setSelectedRouters] = useState([FACTORIES[0].router, FACTORIES[1].router]);
  const [status, setStatus] = useState('');

  const provider = ()=> new ethers.JsonRpcProvider(rpc);

  const submitStrategy = async ()=>{
    setStatus('Preparing strategy...')
    try{
      // Build userData according to contract expectation
      const routers = selectedRouters;
      const paths = [[tokenIn, tokenOut],[tokenOut, tokenIn]];
      // minOut set to 1 for demo; in production compute via on-chain quote and slippage
      const minOut = 1;
      const iface = new ethers.Interface(['function startFlashloan(address[],uint256[],bytes)']);
      const calldata = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address','address','address','address[]','address[][]','uint256'],
        [tokenIn, tokenOut, tokenIn, routers, paths, minOut]
      );
      // call backend to send signed tx to contract or display prepared calldata
      setStatus('Strategy encoded. Provide to backend or deployer to initiate flashloan.');
      console.log('userdata', calldata);
    }catch(e){
      setStatus('Error: '+e.message)
    }
  }

  return (<div style={{maxWidth:1000,margin:'auto'}}>
    <h2>Arbitrage App — Final</h2>
    <div className="card">
      <div style={{marginBottom:8}}>RPC: <input style={{width:500}} value={rpc} onChange={e=>setRpc(e.target.value)} /></div>
      <div style={{display:'flex',gap:8}}>
        <div style={{flex:1}}>
          <label>Token In</label><br/>
          <input value={tokenIn} onChange={e=>setTokenIn(e.target.value)} />
        </div>
        <div style={{flex:1}}>
          <label>Token Out</label><br/>
          <input value={tokenOut} onChange={e=>setTokenOut(e.target.value)} />
        </div>
        <div>
          <label>Amount</label><br/>
          <input value={amount} onChange={e=>setAmount(e.target.value)} />
        </div>
      </div>

      <div style={{marginTop:8}}>
        <label>Choose 2 routers (swap A then swap B):</label><br/>
        <select onChange={e=>setSelectedRouters([e.target.value, selectedRouters[1]])}>
          {FACTORIES.map(f=> <option value={f.router} key={f.router}>{f.name} - {f.chain}</option>)}
        </select>
        <select onChange={e=>setSelectedRouters([selectedRouters[0], e.target.value])} style={{marginLeft:8}}>
          {FACTORIES.map(f=> <option value={f.router} key={f.router+2}>{f.name} - {f.chain}</option>)}
        </select>
      </div>

      <div style={{marginTop:10}}>
        <button onClick={submitStrategy}>Encode & Preview Strategy</button>
        <div style={{marginTop:8}}>Status: {status}</div>
      </div>
    </div>
  </div>)
}
