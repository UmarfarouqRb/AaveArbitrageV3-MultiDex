
require('@nomicfoundation/hardhat-toolbox')
require('dotenv').config()

module.exports = {
  solidity: '0.8.20',
  networks: {
    hardhat: {
      forking: process.env.FORK_URL ? { url: process.env.FORK_URL } : undefined
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY || ''
  }
}
