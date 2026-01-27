// Quick command sender
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8765/control');

ws.on('open', () => {
    console.log('Connected to control server');
    
    // Get command from args
    const cmd = process.argv[2] || 'forward';
    const duration = parseInt(process.argv[3]) || 2000;
    
    const commands = {
        'forward': { action: 'move', direction: 'forward', duration },
        'back': { action: 'move', direction: 'back', duration },
        'left': { action: 'move', direction: 'left', duration },
        'right': { action: 'move', direction: 'right', duration },
        'run': { action: 'move', direction: 'forward', duration, sprint: true },
        'jump': { action: 'tap', key: 'space', duration: 100 },
        'stop': { action: 'stop' },
        'status': { action: 'status' },
    };
    
    const toSend = commands[cmd] || JSON.parse(cmd);
    console.log('Sending:', toSend);
    ws.send(JSON.stringify(toSend));
    
    setTimeout(() => {
        ws.close();
        process.exit(0);
    }, 500);
});

ws.on('message', (data) => {
    console.log('Response:', JSON.parse(data.toString()));
});

ws.on('error', (e) => {
    console.error('Connection error:', e.message);
    process.exit(1);
});
