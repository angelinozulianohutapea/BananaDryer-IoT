'use strict';

require('dotenv').config();

const http       = require('http');
const app        = require('./app');
const socketMgr  = require('./socket/socket');
const mqttCfg    = require('./config/mqtt');
const mqttService= require('./services/mqttService');

const PORT = parseInt(process.env.PORT) || 3000;

// ── 1. Buat HTTP server ──────────────────────────────────────
const httpServer = http.createServer(app);

// ── 2. Inisialisasi Socket.IO ────────────────────────────────
socketMgr.init(httpServer);

// ── 3. Inisialisasi MQTT client ──────────────────────────────
mqttCfg.init();

// ── 4. Jalankan MQTT subscriber ──────────────────────────────
mqttService.start();

// ── 5. Jalankan server ───────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log('══════════════════════════════════════════');
  console.log(`  BananaDryer Backend v1.0`);
  console.log(`  HTTP  : http://localhost:${PORT}`);
  console.log(`  MQTT  : ${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`);
  console.log(`  DB    : ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  console.log('══════════════════════════════════════════');
});

// ── Graceful shutdown ────────────────────────────────────────
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

function shutdown(signal) {
  console.log(`\n[Server] ${signal} diterima, shutdown...`);
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
}
