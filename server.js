/**
 * CEREBRO-LINK // HAWKINS LAB SIGNALING SERVER
 * ─────────────────────────────────────────────
 * Tiny WebSocket relay for WebRTC SDP + ICE exchange on LAN.
 * No files, no data pass through here — only signaling messages.
 *
 * Install:  npm install ws
 * Run:      node server.js
 * Default:  ws://YOUR_LAN_IP:3742
 */

'use strict';

const { WebSocketServer } = require('ws');
const os   = require('os');
const PORT = process.env.PORT || 3742;

const wss = new WebSocketServer({ port: PORT });

// rooms: Map<roomCode, Set<WebSocket>>
const rooms = new Map();

// ── helpers ────────────────────────────────────────────────
const getLanIP = () => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
};

const send = (ws, obj) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
};

const broadcast = (room, obj, except = null) => {
  const members = rooms.get(room) || new Set();
  for (const ws of members) {
    if (ws !== except) send(ws, obj);
  }
};

const log = (msg) => console.log(`[${new Date().toTimeString().slice(0,8)}] ${msg}`);

// ── connection handler ─────────────────────────────────────
wss.on('connection', (ws) => {
  ws._room = null;
  log('Client connected');

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // Client joins a room (the 6-char code both devices type in)
      case 'join': {
        const code = String(msg.code || '').toUpperCase().trim();
        if (!code || code.length < 4) return;

        // Leave old room if already in one
        if (ws._room) {
          rooms.get(ws._room)?.delete(ws);
        }

        if (!rooms.has(code)) rooms.set(code, new Set());
        const room = rooms.get(code);

        if (room.size >= 2) {
          send(ws, { type: 'error', msg: 'ROOM FULL — MAX 2 DEVICES' });
          return;
        }

        room.add(ws);
        ws._room = code;
        ws._role = room.size === 1 ? 'initiator' : 'responder';

        send(ws, { type: 'joined', role: ws._role, peers: room.size });
        log(`${ws._role} joined room [${code}]  (${room.size}/2)`);

        // Tell the initiator that a peer arrived
        if (room.size === 2) {
          broadcast(code, { type: 'peer-joined' }, ws);
          log(`Room [${code}] is now full — handshake can begin`);
        }
        break;
      }

      // Relay offer / answer / ice-candidate — just forward to the other peer
      case 'offer':
      case 'answer':
      case 'ice': {
        if (!ws._room) return;
        broadcast(ws._room, msg, ws);
        break;
      }

      // Graceful leave
      case 'leave': {
        if (ws._room) {
          rooms.get(ws._room)?.delete(ws);
          broadcast(ws._room, { type: 'peer-left' });
          log(`Peer left room [${ws._room}]`);
          ws._room = null;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws._room) {
      rooms.get(ws._room)?.delete(ws);
      broadcast(ws._room, { type: 'peer-left' });
      // Clean up empty rooms
      if (rooms.get(ws._room)?.size === 0) rooms.delete(ws._room);
      log(`Client disconnected from room [${ws._room}]`);
    } else {
      log('Client disconnected (no room)');
    }
  });

  ws.on('error', (e) => log(`WS error: ${e.message}`));
});

// ── startup banner ─────────────────────────────────────────
const ip = getLanIP();
console.log(`
╔══════════════════════════════════════════════════╗
║   CEREBRO-LINK // HAWKINS LAB SIGNALING NODE     ║
╠══════════════════════════════════════════════════╣
║  Status  : ONLINE                                ║
║  LAN IP  : ${ip.padEnd(38)}║
║  Port    : ${String(PORT).padEnd(38)}║
║  URL     : ws://${ip}:${PORT}${' '.repeat(Math.max(0,30-ip.length-String(PORT).length))}║
╠══════════════════════════════════════════════════╣
║  Open cerebro-link-st.html on BOTH laptops.      ║
║  Enter the same 6-char room code on each.        ║
║  No data passes through this server.             ║
╚══════════════════════════════════════════════════╝
`);
