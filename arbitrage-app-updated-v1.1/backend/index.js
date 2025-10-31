
require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const { sendBundle } = require('./flashbots');
const app = express();
app.use(express.json());

const RPC = process.env.RPC_URL;
const PK = process.env.PRIVATE_KEY;
const AUTH_PK = process.env.AUTH_SIGNER_PRIVATE_KEY;
if(!RPC || !PK || !AUTH_PK){
  console.log('Set RPC_URL, PRIVATE_KEY, AUTH_SIGNER_PRIVATE_KEY in .env');
}

app.post('/sendStrategy', async (req,res)=>{
  try{
    const { contractAddress, calldata } = req.body;
    if(!contractAddress || !calldata) return res.status(400).send({error:'missing'});
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);
    const tx = await wallet.sendTransaction({ to: contractAddress, data: calldata, gasLimit: 1200000 });
    const receipt = await tx.wait();
    res.send({ok:true, txHash: receipt.transactionHash});
  }catch(e){
    console.error(e);
    res.status(500).send({error: e.message});
  }
});

app.post('/flashbotsBundle', async (req,res)=>{
  try{
    const { to, data, value } = req.body;
    if(!to || !data) return res.status(400).send({error:'missing'});
    const provider = new ethers.JsonRpcProvider(RPC);
    const signer = new ethers.Wallet(PK, provider);
    const authSigner = new ethers.Wallet(process.env.AUTH_SIGNER_PRIVATE_KEY, provider);
    // build tx
    const tx = {
      to,
      data,
      value: value ? ethers.BigInt(value) : 0n,
      gasLimit: 1200000
    };
    const signedTx = await signer.signTransaction(tx);
    // send bundle for next block
    const block = await provider.getBlockNumber();
    const bundleResponse = await sendBundle(provider, authSigner, [signedTx], block + 1);
    res.send({ok:true, bundle: bundleResponse ? 'sent' : 'none'});
  }catch(e){
    console.error(e);
    res.status(500).send({error: e.message});
  }
});

app.listen(3001, ()=>console.log('Backend listening on 3001'));
