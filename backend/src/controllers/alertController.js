'use strict';

const pool       = require('../config/database');
const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// GET /api/alerts?unread=true
async function getAll(req, res) {
  try {
    const unreadOnly = req.query.unread === 'true';
    let sql  = `SELECT * FROM alerts WHERE machine_id = ?`;
    const args = [MACHINE_ID];

    if (unreadOnly) { sql += ' AND acknowledged = 0'; }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const [rows] = await pool.query(sql, args);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// PATCH /api/alerts/:id/ack — acknowledge satu alert
async function acknowledge(req, res) {
  try {
    const [result] = await pool.query(
      `UPDATE alerts SET acknowledged = 1, ack_at = NOW()
       WHERE id = ? AND machine_id = ?`,
      [req.params.id, MACHINE_ID]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Alert tidak ditemukan' });
    }
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// PATCH /api/alerts/ack-all — acknowledge semua alert
async function acknowledgeAll(req, res) {
  try {
    await pool.query(
      `UPDATE alerts SET acknowledged = 1, ack_at = NOW()
       WHERE machine_id = ? AND acknowledged = 0`,
      [MACHINE_ID]
    );
    res.json({ success: true, message: 'Semua alert acknowledged' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getAll, acknowledge, acknowledgeAll };
