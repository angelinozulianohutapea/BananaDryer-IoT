'use strict';

const pool = require('../config/database');
const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// GET /api/session — semua sesi (terbaru dulu)
async function getAll(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const [rows] = await pool.query(
      `SELECT * FROM session_logs
       WHERE machine_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [MACHINE_ID, limit]
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/session/:id — detail satu sesi
async function getById(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM session_logs WHERE id = ? AND machine_id = ?`,
      [req.params.id, MACHINE_ID]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/session/:id/sensor — sensor log dalam satu sesi
async function getSessionSensor(req, res) {
  try {
    const [session] = await pool.query(
      `SELECT started_at, finished_at FROM session_logs WHERE id = ? AND machine_id = ?`,
      [req.params.id, MACHINE_ID]
    );
    if (!session.length) return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });

    const { started_at, finished_at } = session[0];
    const endTime = finished_at || new Date();

    const [rows] = await pool.query(
      `SELECT * FROM sensor_logs
       WHERE machine_id = ?
         AND recorded_at BETWEEN ? AND ?
       ORDER BY recorded_at ASC`,
      [MACHINE_ID, started_at, endTime]
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, getById, getSessionSensor };
