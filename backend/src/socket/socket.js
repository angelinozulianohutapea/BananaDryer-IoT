'use strict';

let io = null;

/**
 * Inisialisasi Socket.IO — dipanggil dari server.js
 * @param {http.Server} httpServer
 */
function init(httpServer) {
  const { Server } = require('socket.io');

  io = new Server(httpServer, {
    cors: {
      origin: '*',  // Ganti dengan domain frontend saat production
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket.IO] Initialized');
  return io;
}

/**
 * Getter — ambil instance io
 */
function getIO() {
  if (!io) throw new Error('Socket.IO belum diinisialisasi. Panggil init() dulu.');
  return io;
}

/**
 * Emit event ke semua client yang terhubung
 * @param {string} event    — nama event
 * @param {object} payload  — data yang dikirim
 */
function emit(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

module.exports = { init, getIO, emit };
