
ArbitrageBalancer Hardhat project

Important:
- The contract implements a generic two-swap flow inside receiveFlashLoan. It assumes the Vault will call this function with the borrowed tokens.
- For real mainnet usage:
  - Verify the exact Balancer Vault flashLoan callback signature (it may differ). Adjust function names/types accordingly.
  - Add on-chain price checks, slippage limits, and front-running protections.
  - Replace naive amountOutMin (1) with proper slippage checks and consider using off-chain oracles or TWAPs for sanity checks.
  - Conduct a professional security audit.

Deployment:
 - Set environment variables in .env:
    FORK_URL=your_rpc_for_hardhat_fork
    VAULT_ADDRESS=Balancer Vault address on target network
 - Run: npx hardhat run scripts/deploy.js --network <network>
