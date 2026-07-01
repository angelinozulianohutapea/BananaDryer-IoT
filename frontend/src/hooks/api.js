import axios from 'axios'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const api = axios.create({ baseURL: `${BACKEND_URL}/api` })

// Hanya route /machine yang punya parameter :machineId di backend.
// Route sensor, session, dan alerts TIDAK pakai machineId di path
// (machine_id-nya diambil dari env MACHINE_ID di server).
export const getMachineStatus  = () => api.get('/machine/BananaDryer01/status')
export const getSensorHistory  = (limit = 50) => api.get(`/sensor/history?limit=${limit}`)
export const getSessions       = () => api.get('/session')
export const getSessionSensor  = (id) => api.get(`/session/${id}/sensor`)
export const getAlerts         = (unreadOnly = false) => api.get(`/alerts${unreadOnly ? '?unread=true' : ''}`)
export const acknowledgeAlert  = (id) => api.patch(`/alerts/${id}/ack`)
export const acknowledgeAll    = () => api.patch('/alerts/ack-all')

export const sendCommand = (cmd, value) => {
  if (cmd === 'START')  return api.post('/machine/BananaDryer01/start')
  if (cmd === 'STOP')   return api.post('/machine/BananaDryer01/stop')
  if (cmd === 'RESET')  return api.post('/machine/BananaDryer01/reset')
  if (cmd === 'CYCLES') return api.post('/machine/BananaDryer01/cycles', { cycles: value })
  return Promise.reject(new Error('Unknown command'))
}

// ── Manual control per-komponen ──────────────────────────────
export const controlHeater = (state) => api.post('/machine/BananaDryer01/heater', { state }) // 'ON' | 'OFF'
export const controlPusher = (action) => api.post('/machine/BananaDryer01/pusher', { action }) // 'FORWARD' | 'REVERSE' | 'STOP'
export const controlCutter = (state) => api.post('/machine/BananaDryer01/cutter', { state }) // 'ON' | 'OFF'

// ── Setpoint / setting kustom ─────────────────────────────────
export const getSettings    = () => api.get('/settings')
export const updateSettings = (payload) => api.put('/settings', payload)

export default api