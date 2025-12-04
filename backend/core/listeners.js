const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', ws => {
    ws.send(JSON.stringify({ type: 'status', data: { isOnline: true } }));
});

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

module.exports = { broadcast };
