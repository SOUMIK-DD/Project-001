/**
 * CEREBRO-LINK // HAWKINS NATIONAL LABORATORY
 * WebSocket Signaling Server — Node.js
 *
 * Handles WebRTC room-based signaling:
 *   - Room creation & joining
 *   - SDP offer/answer relay
 *   - ICE candidate exchange
 *   - Peer disconnect cleanup
 */

'use strict';

const { WebSocketServer } = require('ws');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

// ─── Config ────────────────────────────────────────────────
const PORT     = process.env.PORT || 3000;
const MAX_ROOM = 2;          // exactly 2 peers per room
const ROOMS    = new Map();  // roomCode → Set<ws>

// ─── Static file server ────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

const httpServer = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public',
    req.url === '/' ? 'index.html' : req.url);

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 — Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ─── WebSocket server ──────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

// Helper: send JSON safely
const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN)
    ws.send(JSON.stringify(obj));
};

// Helper: get the other peer in the room
const other = (room, ws) => {
  for (const peer of room) {
    if (peer !== ws) return peer;
  }
  return null;
};

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[CONNECT] ${ip}`);

  ws._room = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    const { type, room: roomCode, payload } = msg;

    // ── JOIN ────────────────────────────────────────────────
    if (type === 'join') {
      if (!roomCode) return send(ws, { type: 'error', payload: 'No room code' });

      if (!ROOMS.has(roomCode)) ROOMS.set(roomCode, new Set());
      const room = ROOMS.get(roomCode);

      if (room.size >= MAX_ROOM) {
        return send(ws, { type: 'error', payload: 'Room full' });
      }

      room.add(ws);
      ws._room = roomCode;

      const isFirst = room.size === 1;
      send(ws, {
        type:  'joined',
        payload: { role: isFirst ? 'offer' : 'answer', peers: room.size }
      });

      console.log(`[JOIN] room=${roomCode} peers=${room.size} ip=${ip}`);

      // Notify the other peer that someone joined
      if (!isFirst) {
        const peer = other(room, ws);
        if (peer) send(peer, { type: 'peer-joined' });
      }
      return;
    }

    // ── Relay messages (offer / answer / ice) ───────────────
    if (['offer', 'answer', 'ice'].includes(type)) {
      if (!ws._room) return;
      const room = ROOMS.get(ws._room);
      if (!room)    return;
      const peer = other(room, ws);
      if (!peer)    return send(ws, { type: 'error', payload: 'Peer not connected yet' });

      send(peer, { type, payload });
      return;
    }

    // ── PING ────────────────────────────────────────────────
    if (type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }

    console.log(`[UNKNOWN] type=${type}`);
  });

  // ── Disconnect ───────────────────────────────────────────
  ws.on('close', () => {
    console.log(`[DISCONNECT] ${ip}`);
    if (!ws._room) return;
    const room = ROOMS.get(ws._room);
    if (!room) return;

    room.delete(ws);
    const peer = other(room, ws);
    if (peer) send(peer, { type: 'peer-left' });

    if (room.size === 0) {
      ROOMS.delete(ws._room);
      console.log(`[ROOM CLOSED] ${ws._room}`);
    }
  });

  ws.on('error', (e) => console.error(`[WS ERROR] ${e.message}`));
});

// ─── Boot ──────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  const ifaces = require('os').networkInterfaces();
  let lan = 'localhost';
  Object.values(ifaces).flat().forEach(i => {
    if (i.family === 'IPv4' && !i.internal) lan = i.address;
  });

  console.log('');
  console.log('  ██████╗███████╗██████╗ ███████╗██████╗ ██████╗  ██████╗ ');
  console.log(' ██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔═══██╗');
  console.log(' ██║     █████╗  ██████╔╝█████╗  ██████╔╝██████╔╝██║   ██║');
  console.log(' ██║     ██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██╗██║   ██║');
  console.log(' ╚██████╗███████╗██║  ██║███████╗██████╔╝██║  ██║╚██████╔╝');
  console.log('  ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ');
  console.log('');
  console.log(`  HAWKINS NATIONAL LABORATORY — SIGNAL NODE ACTIVE`);
  console.log(`  ─────────────────────────────────────────────────`);
  console.log(`  Local:   ws://localhost:${PORT}`);
  console.log(`  Network: ws://${lan}:${PORT}`);
  console.log(`  Static:  http://${lan}:${PORT}`);
  console.log(`  ─────────────────────────────────────────────────`);
  console.log(`  Use Network URL in the browser's "Signal Node" field`);
  console.log('');
});
