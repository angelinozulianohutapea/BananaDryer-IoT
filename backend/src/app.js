'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const sensorRoutes  = require('./routes/sensorRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const machineRoutes = require('./routes/machineRoutes');
const alertRoutes   = require('./routes/alertRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/sensor',  sensorRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/machine', machineRoutes);
app.use('/api/alerts',  alertRoutes);
app.use('/api/settings', settingsRoutes);

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date() });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Express] Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;
