const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ── Diagnostics store — en son cihaz durumu (socketId → payload) ──────────
const _diagnostics = new Map();

io.on('connection', (socket) => {
  console.log('🔗 Bağlandı:', socket.id);

  // Rol kaydı: 'dashboard' veya 'device'
  socket.on('register', (role) => {
    socket.join(role);
    console.log(`📋 ${socket.id} → rol: ${role}`);
    // Dashboard bağlandığında cihazlara bildir
    if (role === 'dashboard') {
      socket.broadcast.emit('dashboard-connected', { id: socket.id });
    }
  });

  socket.on('diagnostics', (data) => {
    _diagnostics.set(socket.id, { ...data, last_seen: Date.now(), socket_id: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('❌ Ayrıldı:', socket.id);
    _diagnostics.delete(socket.id);
  });

  // WebRTC Sinyalleşme — offer/answer/ice peer ID'ye yönlendirilir
  socket.on('offer', payload => {
    io.to(payload.target).emit('offer', payload);
  });

  socket.on('answer', payload => {
    io.to(payload.target).emit('answer', payload);
  });

  socket.on('ice-candidate', incoming => {
    io.to(incoming.target).emit('ice-candidate', incoming);
  });

  // Komut iletimi (kamera/ekran/ses başlat)
  socket.on('command', data => {
    console.log('📡 Komut:', data.type, '→ from:', data.from);
    socket.broadcast.emit('command', data);
  });

  // Fotoğraf snapshot — cihazdan dashboard'a ilet
  socket.on('snapshot', payload => {
    io.to(payload.target).emit('snapshot', payload);
  });

  // Uzaktan müdahale alarmı — tam ekran uyarı / kilit
  socket.on('alert', data => {
    console.log(`🚨 Alert [${data.type}]: "${data.message || ''}"`);
    socket.broadcast.emit('alert', data);
  });
});

// Advanced Modules
const gps     = require('./advanced-modules/gps');
const mdm     = require('./advanced-modules/mdm');
const icloud  = require('./advanced-modules/icloud');
const network = require('./advanced-modules/network');

gps.init(app, io);
mdm.init(app, io);
icloud.init(app, io);
network.init(app, io);

// Diagnostics REST — tüm bağlı cihazların son durumu
app.get('/api/diagnostics', (_req, res) => {
  res.json([..._diagnostics.values()]);
});

// Panic REST endpoint — otomasyon / Python backend tarafından çağrılabilir
app.post('/api/panic', (req, res) => {
  const { type = 'alert_message', message = 'Dikkat!' } = req.body;
  io.emit('alert', { type, message });
  console.log(`🚨 Panic API: [${type}] "${message}"`);
  res.json({ sent: true, type, message });
});

const PORT = process.env.WEBRTC_PORT || 8001;
server.listen(PORT, () => console.log(`🚀 Sinyal Sunucusu (WebRTC) ${PORT} portunda başarıyla çalışıyor.`));
