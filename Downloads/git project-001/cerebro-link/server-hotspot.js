/**
 * ╔══════════════════════════════════════════════════════════╗
 *  CEREBRO-LINK // HAWKINS NATIONAL LAB
 *  WebSocket Signaling Server — server.js
 *  HOTSPOT / OFFLINE LAN MODE — NO INTERNET REQUIRED
 *
 *  Run this on ONE laptop. Both laptops connect to it via
 *  the hotspot/Wi-Fi LAN IP. Internet can be completely off.
 * ╚══════════════════════════════════════════════════════════╝
 *
 *  QUICK START:
 *    npm install
 *    node server.js
 *
 *  The server will print your LAN IP automatically.
 *  Use that IP in the HTML client:  ws://192.168.x.x:3742
 */

'use strict';

const http = require('http');
const { WebSocketServer, WebSocket } = (() => {
  // Try built-in (Node 22+) first, fall back to 'ws' npm package
  try {
    return require('ws');
  } catch {
    console.error('\n  ❌  The "ws" package is not installed.');
    console.error('  Run:  npm install ws\n');
    process.exit(1);
  }
})();

const PORT    = 3742;
const MAX_ROOM = 2; // max peers per room (caller + answerer)

// rooms: Map<roomCode, Map<socketId, ws>>
const rooms   = new Map();
let   nextId  = 1;

// ─── HTTP server (health check + serves basic info page) ───
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status : 'ONLINE',
      rooms  : rooms.size,
      uptime : Math.floor(process.uptime()),
    }));
    return;
  }
  // Simple info page so you can confirm the server is up in a browser
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html><html><head>
    <style>body{background:#0a0a0a;color:#ff4d4d;font-family:monospace;padding:40px}
    h1{letter-spacing:6px}pre{color:#66ff66;margin-top:20px;font-size:14px}</style>
  </head><body>
    <h1>CEREBRO-LINK // SIGNAL NODE</h1>
    <pre>STATUS : ONLINE
PORT   : ${PORT}
ROOMS  : ${rooms.size} active
UPTIME : ${Math.floor(process.uptime())}s

Point your clients at:
  ws://&lt;THIS-IP&gt;:${PORT}</pre>
  </body></html>`);
});

// ─── WebSocket server ───────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  ws._id     = nextId++;
  ws._room   = null;
  ws._role   = null;

  const ip = req.socket.remoteAddress;
  log(`[+] Client ${ws._id} connected  (${ip})`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleMsg(ws, msg);
  });

  ws.on('close', () => {
    log(`[-] Client ${ws._id} disconnected`);
    removeFromRoom(ws);
  });

  ws.on('error', (err) => {
    log(`[!] Client ${ws._id} error: ${err.message}`);
  });
});

// ─── Message handler ────────────────────────────────────────
function handleMsg(ws, msg) {
  switch (msg.type) {

    // ── JOIN ──────────────────────────────────────────────
    case 'join': {
      const code = String(msg.code || '').toUpperCase().slice(0, 16);
      if (!code) { send(ws, { type:'error', msg:'No room code' }); return; }

      // Leave previous room if any
      removeFromRoom(ws);

      if (!rooms.has(code)) rooms.set(code, new Map());
      const room = rooms.get(code);

      if (room.size >= MAX_ROOM) {
        send(ws, { type:'error', msg:'Room full (max 2 peers)' });
        return;
      }

      // Assign role: first joiner = initiator, second = responder
      ws._role = room.size === 0 ? 'initiator' : 'responder';
      ws._room = code;
      room.set(ws._id, ws);

      log(`  [room:${code}] Client ${ws._id} joined as ${ws._role} (${room.size}/${MAX_ROOM})`);

      // Tell the joiner their role + current peer count
      send(ws, { type:'joined', role: ws._role, peers: room.size });

      // Tell the OTHER peer that someone joined
      if (room.size === 2) {
        broadcastOthers(ws, { type:'peer-joined', peers: room.size });
      }
      break;
    }

    // ── LEAVE ─────────────────────────────────────────────
    case 'leave': {
      removeFromRoom(ws);
      break;
    }

    // ── OFFER / ANSWER / ICE — relay to the other peer ────
    case 'offer':
    case 'answer':
    case 'ice': {
      if (!ws._room) { send(ws, { type:'error', msg:'Not in a room' }); return; }
      broadcastOthers(ws, msg);   // forward as-is to the other client
      break;
    }

    default:
      send(ws, { type:'error', msg:`Unknown message type: ${msg.type}` });
  }
}

// ─── Helpers ─────────────────────────────────────────────────
function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcastOthers(sender, obj) {
  const room = rooms.get(sender._room);
  if (!room) return;
  for (const [id, peer] of room) {
    if (id !== sender._id) send(peer, obj);
  }
}

function removeFromRoom(ws) {
  if (!ws._room) return;
  const room = rooms.get(ws._room);
  if (room) {
    room.delete(ws._id);
    log(`  [room:${ws._room}] Client ${ws._id} left (${room.size} remaining)`);
    // Tell the remaining peer their partner left
    broadcastOthers(ws, { type:'peer-left' });
    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(ws._room);
      log(`  [room:${ws._room}] Room deleted (empty)`);
    }
  }
  ws._room = null;
  ws._role = null;
}

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

// ─── Startup ─────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  // Find all LAN IPs to show the user
  const os = require('os');
  const nets = os.networkInterfaces();
  const ips = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('  CEREBRO-LINK // SIGNAL NODE // HOTSPOT MODE');
  console.log('  NO INTERNET REQUIRED — LAN / HOTSPOT ONLY');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`  Listening on port ${PORT}\n`);
  if (ips.length) {
    console.log('  ── Paste one of these into BOTH clients: ──');
    ips.forEach(ip => console.log(`  ws://${ip}:${PORT}   ← use this one`));
  } else {
    console.log(`  ws://localhost:${PORT}  (no LAN IP detected — check your hotspot)`);
  }
  console.log('\n  ── Health check (open in browser) ──');
  console.log(`  http://${ips[0] || 'localhost'}:${PORT}/health\n`);
  console.log('  IMPORTANT: Internet can be OFF. Both laptops just');
  console.log('  need to be on the same Wi-Fi hotspot.\n');
  console.log('  Waiting for clients...\n');
});

// ─── Graceful shutdown ───────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n\n  Shutting down CEREBRO-LINK signal node...');
  wss.close();
  httpServer.close();
  process.exit(0);
});
