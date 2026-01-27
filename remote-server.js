// Remote control WebSocket server for the game
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = 8765;

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
    } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <h1>Game Remote Control Server</h1>
            <p>WebSocket endpoint: ws://localhost:${PORT}</p>
            <p>Connected clients: ${wss?.clients?.size || 0}</p>
            <h2>Commands:</h2>
            <ul>
                <li><code>{"action": "press", "key": "w"}</code> - Hold key</li>
                <li><code>{"action": "release", "key": "w"}</code> - Release key</li>
                <li><code>{"action": "tap", "key": "space", "duration": 100}</code> - Tap key</li>
                <li><code>{"action": "move", "direction": "forward", "duration": 1000}</code> - Move for duration ms</li>
            </ul>
            <p>Valid keys: w, a, s, d, shift, space</p>
        `);
    }
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Track game clients
let gameClients = new Set();
let controlClients = new Set();

wss.on('connection', (ws, req) => {
    const clientType = req.url?.includes('game') ? 'game' : 'control';
    
    if (clientType === 'game') {
        gameClients.add(ws);
        console.log(`🎮 Game client connected (${gameClients.size} games)`);
    } else {
        controlClients.add(ws);
        console.log(`🕹️ Control client connected (${controlClients.size} controllers)`);
    }
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            
            if (clientType === 'control') {
                // Forward control commands to all game clients
                console.log('📤 Forwarding command:', msg);
                gameClients.forEach(game => {
                    if (game.readyState === WebSocket.OPEN) {
                        game.send(JSON.stringify(msg));
                    }
                });
            } else if (clientType === 'game') {
                // Game status updates
                console.log('🎮 Game status:', msg);
                controlClients.forEach(ctrl => {
                    if (ctrl.readyState === WebSocket.OPEN) {
                        ctrl.send(JSON.stringify({ type: 'game-status', ...msg }));
                    }
                });
            }
        } catch (e) {
            console.error('Parse error:', e);
        }
    });
    
    ws.on('close', () => {
        gameClients.delete(ws);
        controlClients.delete(ws);
        console.log(`👋 Client disconnected (${gameClients.size} games, ${controlClients.size} controllers)`);
    });
    
    ws.on('error', console.error);
});

server.listen(PORT, () => {
    console.log(`🚀 Remote control server running on port ${PORT}`);
    console.log(`   Game clients connect to: ws://localhost:${PORT}/game`);
    console.log(`   Control clients connect to: ws://localhost:${PORT}/control`);
});

// Helper function to send commands programmatically
export function sendCommand(command) {
    gameClients.forEach(game => {
        if (game.readyState === WebSocket.OPEN) {
            game.send(JSON.stringify(command));
        }
    });
}

// CLI interface for testing
process.stdin.setEncoding('utf8');
console.log('\n📝 Type commands (e.g., "w" to move forward, "jump" to jump):');

process.stdin.on('data', (input) => {
    const cmd = input.trim().toLowerCase();
    
    const shortcuts = {
        'w': { action: 'tap', key: 'w', duration: 500 },
        's': { action: 'tap', key: 's', duration: 500 },
        'a': { action: 'tap', key: 'a', duration: 500 },
        'd': { action: 'tap', key: 'd', duration: 500 },
        'forward': { action: 'move', direction: 'forward', duration: 2000 },
        'back': { action: 'move', direction: 'back', duration: 2000 },
        'left': { action: 'move', direction: 'left', duration: 1000 },
        'right': { action: 'move', direction: 'right', duration: 1000 },
        'run': { action: 'move', direction: 'forward', duration: 2000, sprint: true },
        'jump': { action: 'tap', key: 'space', duration: 100 },
        'stop': { action: 'stop' },
    };
    
    if (shortcuts[cmd]) {
        sendCommand(shortcuts[cmd]);
        console.log('✅ Sent:', shortcuts[cmd]);
    } else {
        try {
            const parsed = JSON.parse(cmd);
            sendCommand(parsed);
            console.log('✅ Sent:', parsed);
        } catch {
            console.log('❌ Unknown command. Try: w, s, a, d, forward, back, left, right, run, jump, stop');
        }
    }
});
