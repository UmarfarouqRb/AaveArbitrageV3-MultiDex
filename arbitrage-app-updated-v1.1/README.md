
Arbitrage App — COMPLETE (Includes forked tests, Flashbots helper, and hardened contract)

What's new:
- Contract hardened with pause switch and placeholder TWAP min parameter to allow oracle checks.
- Hardhat forked integration test (calls receiveFlashLoan directly to simulate execution flow).
- Backend includes Flashbots helper to send bundles through Flashbots RPC.
- DEPLOY.md with exact environment variables and step-by-step commands.

Important reminders:
- The test simulates the contract logic by invoking receiveFlashLoan directly. In production, Balancer Vault calls must match the function signature and behavior.
- Flashbots integration helps mitigate front-running but requires careful bundle construction and thoroughly tested signing logic.

See DEPLOY.md for exact envs and commands.
