
Updates for Oracle tests and Flashbots usage:

Running integration tests (mocks)
-------------------------------
cd contracts
npm install
# start a local hardhat node in background (optional)
npx hardhat node &

# run tests (these deploy mock tokens and mock routers and simulate profitable arbitrage)
npx hardhat test test/integration-arb.test.js

Flashbots bundle submission (backend)
------------------------------------
Set backend/.env:
RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=0xYOUR_SIGNING_KEY
AUTH_SIGNER_PRIVATE_KEY=0xYOUR_AUTH_KEY

# Install backend deps
cd backend
npm install

# Start backend
node index.js

# Submit a flashbots bundle via POST /flashbotsBundle with JSON:
# {
#   "to":"0xArbContractAddress",
#   "data":"0x...", // calldata for startFlashloan or other tx
#   "value":"0"
# }
# The backend will sign the tx with PRIVATE_KEY and send a bundle authenticated by AUTH_SIGNER_PRIVATE_KEY.
