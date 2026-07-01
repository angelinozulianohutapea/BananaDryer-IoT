'use strict';

const pool       = require('../config/database');
const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// GET /api/settings — ambil setpoint aktif
async function getSettings(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM dryer_settings WHERE machine_id = ?`,
      [MACHINE_ID]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Setting belum ada, jalankan migrasi dulu' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// PUT /api/settings — update setpoint custom
// body: { target_temp_min, target_temp_max, target_humidity_max, estimated_duration_min, stable_minutes }
async function updateSettings(req, res) {
  try {
    const {
      target_temp_min,
      target_temp_max,
      target_humidity_max,
      estimated_duration_min,
      stable_minutes,
    } = req.body;

    const errors = [];

    if (target_temp_min !== undefined && (isNaN(target_temp_min) || target_temp_min < 0 || target_temp_min > 100)) {
      errors.push('target_temp_min harus angka 0–100');
    }
    if (target_temp_max !== undefined && (isNaN(target_temp_max) || target_temp_max < 0 || target_temp_max > 100)) {
      errors.push('target_temp_max harus angka 0–100');
    }
    if (
      target_temp_min !== undefined && target_temp_max !== undefined &&
      Number(target_temp_min) >= Number(target_temp_max)
    ) {
      errors.push('target_temp_min harus lebih kecil dari target_temp_max');
    }
    if (target_humidity_max !== undefined && (isNaN(target_humidity_max) || target_humidity_max < 0 || target_humidity_max > 100)) {
      errors.push('target_humidity_max harus angka 0–100');
    }
    if (estimated_duration_min !== undefined && (isNaN(estimated_duration_min) || estimated_duration_min < 1)) {
      errors.push('estimated_duration_min harus angka lebih dari 0');
    }
    if (stable_minutes !== undefined && (isNaN(stable_minutes) || stable_minutes < 1)) {
      errors.push('stable_minutes harus angka lebih dari 0');
    }

    if (errors.length) {
      return res.status(400).json({ success: false, message: errors.join(', ') });
    }

    if ((target_temp_min !== undefined) !== (target_temp_max !== undefined)) {
      const [rows] = await pool.query(
        `SELECT target_temp_min, target_temp_max FROM dryer_settings WHERE machine_id = ?`,
        [MACHINE_ID]
      );
      const current = rows[0];
      if (current) {
        const min = target_temp_min !== undefined ? Number(target_temp_min) : Number(current.target_temp_min);
        const max = target_temp_max !== undefined ? Number(target_temp_max) : Number(current.target_temp_max);
        if (min >= max) {
          return res.status(400).json({ success: false, message: 'target_temp_min harus lebih kecil dari target_temp_max' });
        }
      }
    }

    const [result] = await pool.query(
      `UPDATE dryer_settings SET
         target_temp_min        = COALESCE(?, target_temp_min),
         target_temp_max        = COALESCE(?, target_temp_max),
         target_humidity_max    = COALESCE(?, target_humidity_max),
         estimated_duration_min = COALESCE(?, estimated_duration_min),
         stable_minutes         = COALESCE(?, stable_minutes)
       WHERE machine_id = ?`,
      [
        target_temp_min ?? null,
        target_temp_max ?? null,
        target_humidity_max ?? null,
        estimated_duration_min ?? null,
        stable_minutes ?? null,
        MACHINE_ID,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Setting belum ada, jalankan migrasi dulu' });
    }

    const [rows] = await pool.query(`SELECT * FROM dryer_settings WHERE machine_id = ?`, [MACHINE_ID]);
    res.json({ success: true, message: 'Setpoint diupdate', data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getSettings, updateSettings };