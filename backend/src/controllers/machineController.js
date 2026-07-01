'use strict';

const pool       = require('../config/database');
const mqttCfg    = require('../config/mqtt');
const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// GET /api/machine/status
async function getStatus(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM machines WHERE machine_id = ?`,
      [MACHINE_ID]
    );
    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/machine/start
async function start(req, res) {
  try {
    mqttCfg.publishCommand('START');
    res.json({ success: true, message: 'Command START dikirim ke ESP32' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/machine/stop
async function stop(req, res) {
  try {
    mqttCfg.publishCommand('STOP');
    res.json({ success: true, message: 'Command STOP dikirim ke ESP32' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/machine/reset
async function reset(req, res) {
  try {
    mqttCfg.publishCommand('RESET');
    res.json({ success: true, message: 'Command RESET dikirim ke ESP32' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// POST /api/machine/cycles  — body: { cycles: 5 }
async function setCycles(req, res) {
  try {
    const cycles = parseInt(req.body.cycles);
    if (!cycles || cycles < 1 || cycles > 99) {
      return res.status(400).json({ success: false, message: 'cycles harus antara 1–99' });
    }
    mqttCfg.publishCommand('CYCLES', cycles);
    res.json({ success: true, message: `Command CYCLES:${cycles} dikirim ke ESP32` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getStatus, start, stop, reset, setCycles };
