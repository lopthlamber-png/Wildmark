// Wildmark online relay: forwards game packets between a host and its friends by room code.
// The game itself still runs on the host's device; this server only passes messages along.
//
//   npm install ws
//   node relay_server.js            (listens on $PORT, default 8080)
//
// Put it behind HTTPS/WSS (Render, Railway, Fly.io, a VPS with Caddy...) and enter the wss:// address in the game.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_ROOMS = 500;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Wildmark relay OK - rooms: ' + rooms.size + '\n');
});
const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 * 1024, perMessageDeflate: false });
const rooms = new Map(); // code -> { host, clients: Map(id -> ws), max, nextId }

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}
function sendJson(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function frame(src, payload) {
  const h = Buffer.alloc(4);
  h.writeInt32LE(src, 0);
  return Buffer.concat([h, payload]);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    // 1) the first message must be a text hello
    if (!ws.role) {
      if (isBinary) return ws.close();
      let m;
      try { m = JSON.parse(data.toString()); } catch (e) { return ws.close(); }
      if (m.t === 'host') {
        if (rooms.size >= MAX_ROOMS) { sendJson(ws, { t: 'err', msg: 'The server is full, try again later' }); return ws.close(); }
        const code = newCode();
        const room = { host: ws, clients: new Map(), max: Math.max(2, Math.min(8, m.max | 0 || 8)), nextId: 2 };
        rooms.set(code, room);
        ws.role = 'host'; ws.room = room; ws.code = code;
        sendJson(ws, { t: 'hosted', code });
      } else if (m.t === 'join') {
        const code = String(m.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) { sendJson(ws, { t: 'err', msg: 'No game with that room code' }); return ws.close(); }
        if (room.clients.size + 1 >= room.max) { sendJson(ws, { t: 'err', msg: 'The game is full' }); return ws.close(); }
        const id = room.nextId++;
        ws.role = 'client'; ws.room = room; ws.id = id;
        room.clients.set(id, ws);
        sendJson(ws, { t: 'joined', id });
        sendJson(room.host, { t: 'peer_join', id });
      } else {
        ws.close();
      }
      return;
    }
    const room = ws.room;
    // 2) control messages (only the host may kick)
    if (!isBinary) {
      let m;
      try { m = JSON.parse(data.toString()); } catch (e) { return; }
      if (ws.role === 'host' && m.t === 'kick') {
        const c = room.clients.get(m.id | 0);
        if (c) c.close();
      }
      return;
    }
    // 3) game packets: [int32 target][payload]. clients only talk to the host, the host can address anyone
    if (data.length < 4) return;
    if (ws.role === 'client') {
      if (room.host.readyState === 1) room.host.send(frame(ws.id, data.subarray(4)), { binary: true });
    } else {
      const target = data.readInt32LE(0);
      const out = frame(1, data.subarray(4));
      if (target > 0) {
        const c = room.clients.get(target);
        if (c && c.readyState === 1) c.send(out, { binary: true });
      } else {
        for (const [id, c] of room.clients) {
          if (target < 0 && id === -target) continue;
          if (c.readyState === 1) c.send(out, { binary: true });
        }
      }
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.role === 'client') {
      room.clients.delete(ws.id);
      sendJson(room.host, { t: 'peer_leave', id: ws.id });
    } else if (ws.role === 'host') {
      for (const c of room.clients.values()) c.close();
      rooms.delete(ws.code);
    }
  });
  ws.on('error', () => {});
});

// drop dead connections (phones that lost signal) so rooms do not stay open forever
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log('Wildmark relay listening on ' + PORT));
