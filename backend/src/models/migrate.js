'use strict';

require('dotenv').config();
const pool = require('../config/database');

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

    // Seed machine default
    await conn.query(`
      INSERT IGNORE INTO machines (machine_id, name, location)
      VALUES (?, 'BananaDryer Unit 1', 'Lab IoT');
    `, [process.env.MACHINE_ID || 'BananaDryer01']);
    console.log('[Migrate] ✅ Seed: machines');

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
