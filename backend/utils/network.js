export function getNetworkConfig(env) {
  const network = (env.NETWORK || 'sepolia').toLowerCase();
  if (network === 'mainnet') {
    return {
      name: 'Base Mainnet',
      rpc: env.BASE_MAINNET_RPC,
      chainId: Number(env.BASE_MAINNET_CHAIN_ID || 8453),
      contract: env.BASE_MAINNET_CONTRACT
    };
  }
  return {
    name: 'Base Sepolia',
    rpc: env.BASE_SEPOLIA_RPC,
    chainId: Number(env.BASE_SEPOLIA_CHAIN_ID || 84532),
    contract: env.BASE_SEPOLIA_CONTRACT
  };
}
