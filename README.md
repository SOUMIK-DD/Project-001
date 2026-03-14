# 🔴 CEREBRO-LINK // HAWKINS NATIONAL LABORATORY // 1984

> **Encrypted peer-to-peer file transfer over WebRTC, AES-256-GCM encrypted, with a Stranger Things aesthetic.**  
> *"The gate is open. Transmit before the Mind Flayer finds you."*

![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)
![Node: >=18](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-blue)
![AES-256-GCM](https://img.shields.io/badge/Crypto-AES--256--GCM-purple)

---

## 🧠 What Is This?

**CEREBRO-LINK** is a browser-based, **serverless file transfer tool** — files travel directly peer-to-peer via WebRTC DataChannels and are encrypted end-to-end with AES-256-GCM before ever leaving your device. The Node.js server only handles the initial WebRTC handshake (signaling); it **never sees your files or their contents**.

### Key Features
- 🔐 **AES-256-GCM encryption** with PBKDF2-SHA256 (310,000 iterations) key derivation
- ⚡ **WebRTC DataChannel** — direct P2P, no file relay through server
- 📁 **Drag-and-drop file queue** with multi-file support
- 📱 **Progressive Web App (PWA)** — installable, works offline once loaded
- 🎄 **Retro Stranger Things UI** — CRT effects, nixie tubes, christmas lights
- 🔇 **Web Audio API** sound effects — teletype, alarms, chimes
- ☠️ **Kill switch** — instant session wipe (Ctrl+Shift+K)
- 📷 **QR Code** for easy mobile connection

---

## 🗂️ Project Structure

```
cerebro-link/
├── server.js          ← Node.js WebSocket signaling server
├── package.json       ← Dependencies (only: ws)
├── .gitignore
├── README.md
└── public/
    └── index.html     ← Full frontend (single file, zero build step)
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or newer
- Two devices on the **same LAN** (or use port forwarding / ngrok for internet)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/cerebro-link.git
cd cerebro-link
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start the signaling server
```bash
npm start
```

You'll see output like:
```
  HAWKINS NATIONAL LABORATORY — SIGNAL NODE ACTIVE
  ─────────────────────────────────────────────────
  Local:   ws://localhost:3000
  Network: ws://192.168.1.42:3000
  Static:  http://192.168.1.42:3000
```

### 4. Open the app
Open `http://192.168.1.42:3000` (the **Network** URL) in browsers on **both devices**.

> ⚠️ Both devices must use the same Network IP — `localhost` only works on the same machine.

---

## 📡 How To Transfer Files

Follow the **4-step flow** shown in the UI:

| Step | Action |
|------|--------|
| **1** | Enter the server's `ws://IP:3000` in the **Signal Node URL** box and click **CONNECT** |
| **2** | One peer clicks **HOST** (gets a room code), the other clicks **JOIN** and enters the code |
| **3** | Both peers enter the **same passphrase** and click **DERIVE KEY** |
| **4** | Drag files into the drop zone and click **TRANSMIT** |

Files appear in the **Received Files** panel on the other device and can be downloaded.

---

## 🔒 Security Model

```
Passphrase
    │
    ▼
PBKDF2-SHA256 (310,000 iterations, static app salt)
    │
    ▼
AES-256-GCM key (never leaves the browser)
    │
    ▼
File chunks encrypted with random 96-bit IV per file
    │
    ▼
Encrypted binary → WebRTC DataChannel → Peer → Decrypt
```

- The **signaling server** only routes `offer/answer/ICE` messages — it never touches file data.
- The **passphrase** is never transmitted; only the derived key is used locally.
- **Kill switch** (Ctrl+Shift+K) wipes all in-memory state instantly.

---

## 🛠️ Development

### Run with auto-restart (Node 18+)
```bash
npm run dev
```

### Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | HTTP + WS port |

### Expose to the internet (for remote demos)
```bash
# Using ngrok
npx ngrok http 3000
# Use the wss://xxxx.ngrok.io URL in the Signal Node field
```

---

## 🏆 Hackathon Notes

- **No build step** — pure vanilla JS + CSS + HTML, single file frontend
- **One dependency** (`ws`) on the server side
- **Works on LAN without internet** after initial load
- **PWA installable** for mobile demos
- Judge-friendly: open two tabs on the same machine for a quick local demo

---

## 📜 License

MIT — do whatever you want, just don't let the Mind Flayer get the files.
