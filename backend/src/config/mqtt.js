'use strict';

const mqtt    = require('mqtt');
require('dotenv').config();

const MACHINE_ID = process.env.MACHINE_ID || 'BananaDryer01';

// ── Topic map ───────────────────────────────────────────────
const TOPICS = {
  DATA:      `bananadryer/${MACHINE_ID}/data`,
  STATE:     `bananadryer/${MACHINE_ID}/state`,
  STATUS:    `bananadryer/${MACHINE_ID}/status`,
  HEARTBEAT: `bananadryer/${MACHINE_ID}/heartbeat`,
  CMD:       `bananadryer/${MACHINE_ID}/cmd`,
};

// ── Client options ──────────────────────────────────────────
const options = {
  host:      process.env.MQTT_HOST,
  port:      parseInt(process.env.MQTT_PORT) || 8883,
  protocol:  'mqtts',
  username:  process.env.MQTT_USERNAME,
  password:  process.env.MQTT_PASSWORD,
  clientId:  `bananadryer-backend-${Date.now()}`,  // selalu unik
  clean:     true,
  reconnectPeriod: 5000,
  connectTimeout:  30000,
  keepalive:       60,
  will: {
    topic:   `bananadryer/${MACHINE_ID}/status`,
    payload: JSON.stringify({ source: 'backend', status: 'OFFLINE' }),
    qos:     1,
    retain:  true,
  },
};

let client = null;

function init() {
  if (client) return client;

  client = mqtt.connect(options);

  client.on('connect', () => {
    console.log('[MQTT] Connected to broker');
  });

  client.on('reconnect', () => {
    console.warn('[MQTT] Reconnecting...');
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });

  client.on('offline', () => {
    console.warn('[MQTT] Offline');
  });

  return client;
}

function getClient() {
  if (!client) throw new Error('MQTT client belum diinisialisasi. Panggil init() dulu.');
  return client;
}

function publishCommand(cmd, value) {
  const c = getClient();
  const payload = value !== undefined
    ? JSON.stringify({ cmd, value, ts: new Date().toISOString() })
    : JSON.stringify({ cmd, ts: new Date().toISOString() });
  c.publish(TOPICS.CMD, payload, { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Publish CMD failed:', err.message);
    else     console.log(`[MQTT] CMD published: ${cmd}${value !== undefined ? ':' + value : ''}`);
  });
}

module.exports = { init, getClient, publishCommand, TOPICS };