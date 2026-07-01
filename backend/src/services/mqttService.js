'use strict';

const pool      = require('../config/database');
const mqttCfg   = require('../config/mqtt');
const socket    = require('../socket/socket');

const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// ── State sesi aktif (in-memory) ────────────────────────────
let activeSession = {
  id:         null,
  startedAt:  null,
  temps:      [],
};

// ── Start ────────────────────────────────────────────────────
function start() {
  const client = mqttCfg.getClient();
  const { TOPICS } = mqttCfg;

  // Subscribe semua topic
  const topics = [TOPICS.DATA, TOPICS.STATE, TOPICS.STATUS, TOPICS.HEARTBEAT];
  topics.forEach(t => {
    client.subscribe(t, { qos: 1 }, (err) => {
      if (err) console.error(`[MQTT] Subscribe gagal: ${t}`, err.message);
      else     console.log(`[MQTT] Subscribed: ${t}`);
    });
  });

  client.on('message', async (topic, buffer) => {
    let payload;
    try {
      payload = JSON.parse(buffer.toString());
    } catch {
      console.warn(`[MQTT] Payload bukan JSON di topic ${topic}`);
      return;
    }

    // ── Router berdasarkan topic ──────────────────────────
    if (topic === TOPICS.DATA)      await handleData(payload);
    else if (topic === TOPICS.STATE)     await handleState(payload);
    else if (topic === TOPICS.STATUS)    await handleStatus(payload);
    else if (topic === TOPICS.HEARTBEAT) await handleHeartbeat(payload);
  });
}

// ── Handler: DATA (sensor) ───────────────────────────────────
async function handleData(p) {
  try {
    const temp     = parseFloat(p.temperature) || null;
    const hum      = parseFloat(p.humidity)    || null;
    const progress = parseInt(p.progress)      || null;
    const cycCur   = parseInt(p.cycle ?? p.cycle_current) || null;
    const cycTot   = parseInt(p.total ?? p.cycle_total)   || null;
    const state    = p.state  || null;
    const heater   = p.heater || null;
    const recAt    = p.ts ? new Date(p.ts) : new Date();

    await pool.query(
      `INSERT INTO sensor_logs
         (machine_id, temperature, humidity, progress, cycle_current, cycle_total, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [MACHINE_ID, temp, hum, progress, cycCur, cycTot, recAt]
    );

    if (activeSession.id) {
      if (temp !== null) {
        activeSession.temps.push(temp);
      }
      // Data cycle ("cycle"/"total") cuma dikirim lewat topic DATA, bukan STATE,
      // jadi update cycles_done/cycles_total session di sini.
      if (cycCur !== null || cycTot !== null) {
        await pool.query(
          `UPDATE session_logs
           SET cycles_done = COALESCE(?, cycles_done),
               cycles_total = COALESCE(?, cycles_total)
           WHERE id = ?`,
          [cycCur, cycTot, activeSession.id]
        );
      }
    }

    socket.emit('sensor:data', {
      machine_id: MACHINE_ID,
      temperature: temp,
      humidity:    hum,
      progress,
      cycle_current: cycCur,
      cycle_total:   cycTot,
      state,
      heater,
      ts: recAt,
    });

  } catch (err) {
    console.error('[mqttService] handleData error:', err.message);
  }
}

// State yang dianggap "tidak aktif" — di luar ini berarti mesin sedang bekerja
const NON_ACTIVE_STATES = ['IDLE', 'FINISHED', 'ERROR'];

// ── Handler: STATE ───────────────────────────────────────────
async function handleState(p) {
  try {
    const state = p.state || null;

    // Update status mesin
    await pool.query(
      `UPDATE machines SET status = 'ONLINE', last_seen = NOW() WHERE machine_id = ?`,
      [MACHINE_ID]
    );

    // Sesi dimulai — begitu state pertama yang "aktif" diterima
    // (bukan menunggu SERVO_OPENING spesifik, karena paket UART bisa drop/corrupt
    // dan state itu gak selalu sempat sampai ke backend dengan utuh)
    if (state && !NON_ACTIVE_STATES.includes(state) && !activeSession.id) {
      const [res] = await pool.query(
        `INSERT INTO session_logs (machine_id, state, cycles_total, started_at)
         VALUES (?, ?, ?, NOW())`,
        [MACHINE_ID, state, p.cycle_total || null]
      );
      activeSession.id        = res.insertId;
      activeSession.startedAt = new Date();
      activeSession.temps     = [];
      console.log(`[Session] Started, id=${activeSession.id}`);
    }

    // Update state sesi aktif
    if (activeSession.id && state) {
      await pool.query(
        `UPDATE session_logs SET state = ?, cycles_done = ? WHERE id = ?`,
        [state, p.cycle_current || 0, activeSession.id]
      );
    }

    // Sesi selesai atau error
    if (state === 'FINISHED' || state === 'ERROR' || state === 'IDLE') {
      if (activeSession.id) {
        await _closeSession(state);
      }
    }

    // Alert jika EMERGENCY_STOP
    if (state === 'ERROR') {
      await _createAlert('EMERGENCY_STOP', `State error: ${JSON.stringify(p)}`);
    }

    // Emit ke dashboard
    socket.emit('machine:state', { machine_id: MACHINE_ID, state, ts: p.ts });

  } catch (err) {
    console.error('[mqttService] handleState error:', err.message);
  }
}

// ── Handler: STATUS ──────────────────────────────────────────
async function handleStatus(p) {
  try {
    if (p.source === 'backend') return;

    const online = (p.status !== 'OFFLINE');

    await pool.query(
      `UPDATE machines
       SET status = ?, last_seen = NOW()
       WHERE machine_id = ?`,
      [online ? 'ONLINE' : 'OFFLINE', MACHINE_ID]
    );

    if (!online) {
      await _createAlert('WIFI_LOST', 'ESP32 melaporkan status OFFLINE');
    }

    socket.emit('machine:status', { machine_id: MACHINE_ID, online, ts: p.ts });

  } catch (err) {
    console.error('[mqttService] handleStatus error:', err.message);
  }
}

// ── Handler: HEARTBEAT ───────────────────────────────────────
async function handleHeartbeat(p) {
  try {
    await pool.query(
      `UPDATE machines SET last_seen = NOW(), status = 'ONLINE',
       firmware_esp = COALESCE(?, firmware_esp)
       WHERE machine_id = ?`,
      [p.firmware || null, MACHINE_ID]
    );

    socket.emit('machine:heartbeat', { machine_id: MACHINE_ID, ...p });

  } catch (err) {
    console.error('[mqttService] handleHeartbeat error:', err.message);
  }
}

// ── Helper: tutup sesi ───────────────────────────────────────
async function _closeSession(result) {
  const temps = activeSession.temps;
  const avg   = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(2) : null;
  const max   = temps.length ? Math.max(...temps) : null;
  const min   = temps.length ? Math.min(...temps) : null;

  const durSec = activeSession.startedAt
    ? Math.floor((Date.now() - activeSession.startedAt.getTime()) / 1000)
    : null;

  const resultMap = { FINISHED: 'FINISHED', ERROR: 'ERROR', IDLE: 'STOPPED' };

  await pool.query(
    `UPDATE session_logs
     SET finished_at = NOW(), duration_sec = ?, result = ?,
         temp_avg = ?, temp_max = ?, temp_min = ?
     WHERE id = ?`,
    [durSec, resultMap[result] || 'STOPPED', avg, max, min, activeSession.id]
  );

  console.log(`[Session] Closed id=${activeSession.id}, result=${result}`);
  activeSession = { id: null, startedAt: null, temps: [] };
}

// ── Helper: buat alert ───────────────────────────────────────
async function _createAlert(type, message) {
  const [result] = await pool.query(
    `INSERT INTO alerts (machine_id, type, message) VALUES (?, ?, ?)`,
    [MACHINE_ID, type, message]
  );
  socket.emit('alert:new', { id: result.insertId, machine_id: MACHINE_ID, type, message, acknowledged: 0, ts: new Date() });
}

module.exports = { start };