# Aave Arbitrage Flashbot

This project is a web application designed to identify and execute arbitrage opportunities on the Aave V3 protocol using Flashbots. It consists of a React frontend, a Node.js backend, and a Foundry-based smart contract.

## Architecture

The application is structured as a monorepo with three main components:

- **`/frontend`**: A modern React application built with Vite. It provides a user-friendly interface for monitoring market conditions, viewing historical data, and initiating arbitrage trades.
- **`/backend`**: A Node.js server using Express. It serves as the bridge between the frontend and the blockchain, handling API requests, fetching on-chain data, and submitting arbitrage transactions to Flashbots.
- **`/contracts`**: A Foundry project containing the `AaveArbitrageV3.sol` smart contract. This contract is responsible for executing the flash loan and arbitrage logic on the blockchain.

## Local Development Setup

To run the application locally, follow these steps:

1.  **Install Root Dependencies:**
    ```bash
    npm install
    ```

2.  **Install Frontend Dependencies:**
    ```bash
    cd frontend
    npm install
    ```

3.  **Install Backend Dependencies:**
    ```bash
    cd ../backend
    npm install
    ```

4.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and populate it with the necessary API keys and network URLs.

5.  **Run the Backend and Frontend:**
    - Start the backend server from the `/backend` directory.
    - Start the frontend development server from the `/frontend` directory.

## Deployment on Render

This project is pre-configured for a seamless deployment on Render. The `render.yaml` file in the root directory defines the necessary services and build configurations.

1.  **Frontend Service:** A static web service that serves the built React application from the `frontend/dist` directory.
2.  **Backend Service:** A Node.js web service that runs the Express server from the `backend` directory.

**Before deploying, you must replace the placeholder values in the `render.yaml` file with your actual smart contract address and RPC provider URL.**
