const { JsonRpcProvider } = require('ethers');

function getNetworkConfig(env) {
  const network = (env.NETWORK || 'sepolia').toLowerCase();
  const config = {
    mainnet: {
      name: 'Base Mainnet',
      rpc: env.BASE_MAINNET_RPC,
      chainId: Number(env.BASE_MAINNET_CHAIN_ID || 8453),
      contract: env.BASE_MAINNET_CONTRACT
    },
    sepolia: {
      name: 'Base Sepolia',
      rpc: env.BASE_SEPOLIA_RPC,
      chainId: Number(env.BASE_SEPOLIA_CHAIN_ID || 84532),
      contract: env.BASE_SEPOLIA_CONTRACT
    }
  };

  return config[network] || config.sepolia; // Default to Sepolia if network is invalid
}

exports.handler = async function(event, context) {
  const cfg = getNetworkConfig(process.env);

  // --- Enhanced Validation ---
  if (!cfg.rpc || !cfg.contract) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        ok: false, 
        message: `Configuration error: RPC URL or Contract Address is missing for network '${cfg.name}'.`
      })
    };
  }

  try {
    const provider = new JsonRpcProvider(cfg.rpc);
    const blockNumber = await provider.getBlockNumber(); // Simple check to see if RPC is responsive

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        network: cfg.name, 
        chainId: cfg.chainId,
        contract: cfg.contract,
        latestBlock: blockNumber
      })
    };

  } catch (error) {
      console.error('Status check failed:', error);
      return {
          statusCode: 500,
          body: JSON.stringify({ 
              ok: false, 
              message: `Failed to connect to RPC for network '${cfg.name}'.`,
              error: error.message
          })
      };
  }
};
