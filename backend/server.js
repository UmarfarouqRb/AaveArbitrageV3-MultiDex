require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const app = express();
const port = process.env.PORT || 3001;
const host = '0.0.0.0';

// --- CORS Configuration ---
const allowedOrigins = ['http://localhost:5173'];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

app.use(cors(corsOptions));
app.use(express.json());

const TRADE_HISTORY_FILE = path.join(__dirname, 'trade_history.json');
const BOT_LOG_FILE = path.join(__dirname, 'bot.log');

const logStream = fs.createWriteStream(BOT_LOG_FILE, { flags: 'a' });

// --- Bot Process Management (Restart Disabled) ---
console.log('Starting arbitrage bot...');
const botProcess = fork(path.join(__dirname, 'bot.js'), [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: process.env
});

botProcess.stdout.pipe(process.stdout);
botProcess.stderr.pipe(process.stderr);
botProcess.stdout.pipe(logStream);
botProcess.stderr.pipe(logStream);

botProcess.on('exit', (code) => {
    console.error(`--- Bot process exited with code ${code}. Automatic restart is disabled. ---`);
    console.error('Investigate the bot logs for the root cause of the failure.');
});


// --- API Endpoints ---

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

app.get('/api/logs', async (req, res) => {
    try {
        const data = await fs.promises.readFile(BOT_LOG_FILE, 'utf8');
        const lines = data.trim().split('\n');
        res.json(lines.slice(-100));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.json(['Log file not created yet.']);
        }
        console.error('Error reading log file:', error);
        res.status(500).json({ message: 'Failed to read log file.' });
    }
});

app.get('/api/trade-history', async (req, res) => {
    try {
        const data = await fs.promises.readFile(TRADE_HISTORY_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.json([]);
        }
        console.error('Error reading trade history:', error);
        res.status(500).json({ message: 'Failed to read trade history.' });
    }
});

app.listen(port, host, () => {
    console.log(`Backend server listening on ${host}:${port}`);
});
