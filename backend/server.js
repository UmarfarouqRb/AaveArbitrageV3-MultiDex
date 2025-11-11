
const express = require('express');
const cors = require('cors');
const { simulateTrade } = require('./simulate-manual-trade');
const { executeTrade } = require('./execute-manual-trade');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Basic status endpoint
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Endpoint to simulate a manual trade
app.post('/api/simulate-trade', async (req, res) => {
    try {
        const tradeParams = req.body;
        console.log("Simulating trade with params:", tradeParams);
        const result = await simulateTrade(tradeParams);
        res.json(result);
    } catch (error) {
        console.error('Simulation Error:', error);
        res.status(500).json({ message: error.message || 'An unexpected error occurred during simulation.' });
    }
});

// Endpoint to execute a manual trade
app.post('/api/execute-trade', async (req, res) => {
    try {
        const tradeParams = req.body;
        console.log("Executing trade with params:", tradeParams);
        const result = await executeTrade(tradeParams);
        res.json(result);
    } catch (error) {
        console.error('Execution Error:', error);
        res.status(500).json({ message: error.message || 'An unexpected error occurred during execution.' });
    }
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});
