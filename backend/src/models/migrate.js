'use strict';

require('dotenv').config();
const pool = require('../config/database');

// ── Helper: tambah kolom hanya jika belum ada (aman dijalankan berulang) ──
async function addColumnIfNotExists(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows[0].cnt === 0) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[Migrate] ✅ Kolom baru: ${table}.${column}`);
  }
}

async function migrate() {
  const conn = await pool.getConnection();

  try {
    console.log('[Migrate] Mulai migrasi database...');

    // 1. machines — daftar mesin
    await conn.query(`
      CREATE TABLE IF NOT EXISTS machines (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        machine_id    VARCHAR(50)  NOT NULL UNIQUE,
        name          VARCHAR(100) NOT NULL,
        location      VARCHAR(100),
        status        ENUM('ONLINE','OFFLINE','ERROR') DEFAULT 'OFFLINE',
        last_seen     DATETIME,
        firmware_esp  VARCHAR(20),
        firmware_nano VARCHAR(20),
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[Migrate] ✅ Table: machines');

    // 2. sensor_logs — data temperature, humidity, progress
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sensor_logs (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        machine_id   VARCHAR(50)    NOT NULL,
        temperature  DECIMAL(5,2),
        humidity     DECIMAL(5,2),
        progress     TINYINT UNSIGNED,
        cycle_current INT UNSIGNED,
        cycle_total   INT UNSIGNED,
        recorded_at  DATETIME       NOT NULL,
        created_at   DATETIME       DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_machine_time (machine_id, recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[Migrate] ✅ Table: sensor_logs');

    // 3. session_logs — satu record per sesi pengeringan
    await conn.query(`
      CREATE TABLE IF NOT EXISTS session_logs (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        machine_id      VARCHAR(50) NOT NULL,
        state           VARCHAR(30),
        cycles_total    INT UNSIGNED,
        cycles_done     INT UNSIGNED DEFAULT 0,
        temp_avg        DECIMAL(5,2),
        temp_max        DECIMAL(5,2),
        temp_min        DECIMAL(5,2),
        started_at      DATETIME,
        finished_at     DATETIME,
        duration_sec    INT UNSIGNED,
        result          ENUM('FINISHED','ERROR','STOPPED') DEFAULT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_machine (machine_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[Migrate] ✅ Table: session_logs');

    // 3b. session_logs — kolom tambahan: snapshot setpoint & flag early-stop
    await addColumnIfNotExists(conn, 'session_logs', 'target_temp_min', 'DECIMAL(5,2) AFTER cycles_done');
    await addColumnIfNotExists(conn, 'session_logs', 'target_temp_max', 'DECIMAL(5,2) AFTER target_temp_min');
    await addColumnIfNotExists(conn, 'session_logs', 'target_humidity_max', 'DECIMAL(5,2) AFTER target_temp_max');
    await addColumnIfNotExists(conn, 'session_logs', 'estimated_duration_sec', 'INT UNSIGNED AFTER target_humidity_max');
    await addColumnIfNotExists(conn, 'session_logs', 'early_stop', 'TINYINT(1) DEFAULT 0 AFTER result');
    console.log('[Migrate] ✅ Kolom setpoint & early_stop di session_logs siap');

    // 4. alerts — log peringatan/error
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        machine_id   VARCHAR(50) NOT NULL,
        type         ENUM('EMERGENCY_STOP','SENSOR_ERROR','WIFI_LOST','MQTT_LOST','TEMP_HIGH','TEMP_LOW','GENERAL') NOT NULL,
        message      TEXT,
        acknowledged TINYINT(1)  DEFAULT 0,
        ack_at       DATETIME,
        created_at   DATETIME    DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_machine_ack (machine_id, acknowledged)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[Migrate] ✅ Table: alerts');

    // 5. users — login dashboard (opsional auth)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        username     VARCHAR(50)  NOT NULL UNIQUE,
        password     VARCHAR(255) NOT NULL,
        role         ENUM('admin','viewer') DEFAULT 'viewer',
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[Migrate] ✅ Table: users');

    // 6. dryer_settings — setpoint custom (target suhu/kelembapan, estimasi waktu)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS dryer_settings (
        machine_id             VARCHAR(50) PRIMARY KEY,
        target_temp_min        DECIMAL(5,2) NOT NULL DEFAULT 50.00,
        target_temp_max        DECIMAL(5,2) NOT NULL DEFAULT 60.00,
        target_humidity_max    DECIMAL(5,2) NOT NULL DEFAULT 20.00,
        estimated_duration_min INT UNSIGNED NOT NULL DEFAULT 180,
        stable_minutes         INT UNSIGNED NOT NULL DEFAULT 5,
        updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('[Migrate] ✅ Table: dryer_settings');

    // Seed machine default
    await conn.query(`
      INSERT IGNORE INTO machines (machine_id, name, location)
      VALUES (?, 'BananaDryer Unit 1', 'Lab IoT');
    `, [process.env.MACHINE_ID || 'BananaDryer01']);
    console.log('[Migrate] ✅ Seed: machines');

    // Seed dryer_settings default
    await conn.query(`
      INSERT IGNORE INTO dryer_settings (machine_id)
      VALUES (?);
    `, [process.env.MACHINE_ID || 'BananaDryer01']);
    console.log('[Migrate] ✅ Seed: dryer_settings');

    console.log('[Migrate] Migrasi selesai!');
  } catch (err) {
    console.error('[Migrate] Error:', err.message);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();