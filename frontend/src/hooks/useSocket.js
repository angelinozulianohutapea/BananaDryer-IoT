import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export default function useSocket() {
  const [connected, setConnected]       = useState(false)
  const [sensorData, setSensorData]     = useState(null)
  const [machineState, setMachineState] = useState('IDLE')
  const [heartbeat, setHeartbeat]       = useState(null)
  const [alerts, setAlerts]             = useState([])
  const socketRef = useRef(null)

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('sensor:data', (data) => setSensorData(data))
    socket.on('machine:state', (data) => setMachineState(data.state || 'IDLE'))
    socket.on('machine:heartbeat', (data) => setHeartbeat(data))
    socket.on('machine:status', (data) => {
      if (!data.online) setMachineState('OFFLINE')
    })
    socket.on('alert:new', (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 50))
    })

    return () => socket.disconnect()
  }, [])

  return { connected, sensorData, machineState, heartbeat, alerts }
}
