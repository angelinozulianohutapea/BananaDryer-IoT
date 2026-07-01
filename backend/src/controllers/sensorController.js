'use strict';

const pool = require('../config/database');
const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// GET /api/sensor/latest
async function getLatest(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM sensor_logs
       WHERE machine_id = ?
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [MACHINE_ID]
    );
    res.json({ success: true, data: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/sensor/history?limit=100&from=&to=
async function getHistory(req, res) {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 100, 1000);
    const from   = req.query.from || null;
    const to     = req.query.to   || null;

    let sql    = `SELECT * FROM sensor_logs WHERE machine_id = ?`;
    const args = [MACHINE_ID];

    if (from) { sql += ' AND recorded_at >= ?'; args.push(from); }
    if (to)   { sql += ' AND recorded_at <= ?'; args.push(to);   }

    sql += ` ORDER BY recorded_at DESC LIMIT ?`;
    args.push(limit);

    const [rows] = await pool.query(sql, args);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GET /api/sensor/summary — rata-rata per jam (24 jam terakhir)
async function getSummary(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(recorded_at, '%Y-%m-%d %H:00:00') AS hour,
         ROUND(AVG(temperature), 2) AS avg_temp,
         ROUND(AVG(humidity), 2)    AS avg_hum,
         COUNT(*)                   AS count
       FROM sensor_logs
       WHERE machine_id = ?
         AND recorded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY hour
       ORDER BY hour ASC`,
      [MACHINE_ID]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getLatest, getHistory, getSummary };
