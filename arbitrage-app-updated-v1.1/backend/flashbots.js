
/*
Flashbots helper: signs and sends a bundle via Flashbots RPC using @flashbots/ethers-provider-bundle.
This file exposes a sendBundle function that takes a signer (ethers Wallet), txs array, and target block number.
*/
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
const { ethers } = require('ethers');

async function sendBundle(provider, authSigner, signedTransactions, targetBlockNumber) {
  // provider: ethers provider (e.g., new ethers.providers.JsonRpcProvider(RPC))
  // authSigner: a wallet used to auth with flashbots (not the same as the tx signer)
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, 'https://relay.flashbots.net');
  const bundleResponse = await flashbotsProvider.sendRawBundle(signedTransactions, targetBlockNumber);
  return bundleResponse;
}

module.exports = { sendBundle };
