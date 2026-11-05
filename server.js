// node server.js  (npm i ws)
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;

const srv = http.createServer((q, r) => {
  if (q.url.split('?')[0] === '/') {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(fs.readFileSync(path.join(__dirname, fs.readdirSync(__dirname).find(n => n.toLowerCase().endsWith('.html')))));
  } else { r.writeHead(404); r.end(); }
});
const wss = new WebSocketServer({ server: srv });
const groups = new Map();

const ipOf = q => {
  const x = (q.headers['x-forwarded-for'] || '').split(',')[0].trim() || q.socket.remoteAddress || '';
  return x.replace(/^::ffff:/, '');
};
const isPrivate = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|::1$|fe80|fc|fd)/i.test(ip);
const send = (w, o) => w.readyState === 1 && w.send(JSON.stringify(o));

wss.on('connection', (ws, q) => {
  const room = new URL(q.url, 'http://x').searchParams.get('oda');
  const ip = ipOf(q);
  // same public ip = same network. private ips (host running on the LAN) all share one group.
  const key = room ? 'r:' + room.slice(0, 40) : isPrivate(ip) ? 'lan' : 'ip:' + ip;
  ws.id = Math.random().toString(36).slice(2, 10);
  ws.name = 'cihaz';
  let g = groups.get(key);
  if (!g) groups.set(key, g = new Map());
  g.set(ws.id, ws);

  send(ws, { t: 'init', id: ws.id, peers: [...g.values()].filter(p => p !== ws).map(p => ({ id: p.id, name: p.name })) });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'hello') {
      ws.name = String(m.name || 'cihaz').slice(0, 24);
      for (const p of g.values()) if (p !== ws) send(p, { t: 'peer', id: ws.id, name: ws.name });
    } else if (m.to) {
      const p = g.get(m.to);
      if (p) { m.from = ws.id; delete m.to; send(p, m); }
    }
  });
  ws.on('close', () => {
    g.delete(ws.id);
    for (const p of g.values()) send(p, { t: 'gone', id: ws.id });
    if (!g.size) groups.delete(key);
  });
});
setInterval(() => wss.clients.forEach(c => c.readyState === 1 && c.ping()), 25000);
srv.listen(PORT, '0.0.0.0', () => console.log('http://localhost:' + PORT));
