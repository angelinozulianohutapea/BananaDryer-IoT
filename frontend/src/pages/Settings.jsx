import { useState, useEffect } from 'react'
import { SlidersHorizontal, Save, RotateCcw, ThermometerSun, Droplets, Timer, Gauge } from 'lucide-react'
import { getSettings, updateSettings } from '../hooks/api'

// Nilai default — dipakai kalau user klik "Reset ke Default"
// (harus sama dengan default di backend/src/models/migrate.js)
const DEFAULTS = {
  target_temp_min: 50,
  target_temp_max: 60,
  target_humidity_max: 20,
  estimated_duration_min: 180,
  stable_minutes: 5,
}

export default function Settings() {
  const [form, setForm]       = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [saved, setSaved]     = useState(false)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getSettings()
      const d = res.data?.data
      if (d) {
        setForm({
          target_temp_min:        Number(d.target_temp_min),
          target_temp_max:        Number(d.target_temp_max),
          target_humidity_max:    Number(d.target_humidity_max),
          estimated_duration_min: Number(d.estimated_duration_min),
          stable_minutes:         Number(d.stable_minutes),
        })
        setUpdatedAt(d.updated_at)
      }
    } catch (e) {
      setError('Gagal memuat setpoint: ' + (e.response?.data?.message || e.message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const set = (key) => (e) => {
    const val = e.target.value
    setForm(f => ({ ...f, [key]: val === '' ? '' : Number(val) }))
    setSaved(false)
  }

  const validate = () => {
    if (form.target_temp_min === '' || form.target_temp_max === '' || form.target_humidity_max === '' ||
        form.estimated_duration_min === '' || form.stable_minutes === '') {
      return 'Semua field wajib diisi'
    }
    if (form.target_temp_min < 0 || form.target_temp_min > 100) return 'Target suhu minimum harus 0–100°C'
    if (form.target_temp_max < 0 || form.target_temp_max > 100) return 'Target suhu maksimum harus 0–100°C'
    if (Number(form.target_temp_min) >= Number(form.target_temp_max)) return 'Suhu minimum harus lebih kecil dari maksimum'
    if (form.target_humidity_max < 0 || form.target_humidity_max > 100) return 'Target kelembapan maksimum harus 0–100%'
    if (form.estimated_duration_min < 1) return 'Estimasi durasi harus lebih dari 0 menit'
    if (form.stable_minutes < 1) return 'Stable minutes harus lebih dari 0 menit'
    return ''
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)
    try {
      const res = await updateSettings(form)
      setUpdatedAt(res.data?.data?.updated_at || new Date().toISOString())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError('Gagal menyimpan: ' + (e.response?.data?.message || e.message))
    } finally {
      setSaving(false)
    }
  }

  const handleResetDefault = () => {
    setForm(DEFAULTS)
    setSaved(false)
    setError('')
  }

  const durationHours = form.estimated_duration_min
    ? (form.estimated_duration_min / 60).toFixed(1)
    : '-'

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan Setpoint</h1>
          <p className="page-subtitle">Kustomisasi target pengeringan &amp; deteksi selesai lebih awal</p>
        </div>
        <div className="status-badge" style={{ background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f6' }}>
          <SlidersHorizontal size={14} />
          {updatedAt ? `Update terakhir: ${new Date(updatedAt).toLocaleString('id-ID')}` : '—'}
        </div>
      </div>

      {error && <div className="conn-bar conn-err">⚠️ {error}</div>}
      {saved && <div className="conn-bar conn-ok">✅ Setpoint berhasil disimpan &amp; langsung berlaku untuk sesi berikutnya</div>}

      {loading ? (
        <div className="card">Memuat setpoint...</div>
      ) : (
        <>
          {/* Target Suhu & Kelembapan */}
          <div className="card">
            <div className="card-title">Target Suhu &amp; Kelembapan Ideal</div>
            <p className="settings-desc">
              Mesin dianggap sudah kering kalau suhu &amp; kelembapan berada dalam rentang ini
              secara terus-menerus selama <strong>stable minutes</strong> di bawah — bisa berhenti
              lebih cepat dari estimasi waktu.
            </p>
            <div className="settings-grid">
              <div className="form-group">
                <label className="form-label"><ThermometerSun size={14} /> Suhu Minimum (°C)</label>
                <input
                  type="number" step="0.5" className="form-input"
                  value={form.target_temp_min} onChange={set('target_temp_min')}
                />
              </div>
              <div className="form-group">
                <label className="form-label"><ThermometerSun size={14} /> Suhu Maksimum (°C)</label>
                <input
                  type="number" step="0.5" className="form-input"
                  value={form.target_temp_max} onChange={set('target_temp_max')}
                />
              </div>
              <div className="form-group">
                <label className="form-label"><Droplets size={14} /> Kelembapan Maksimum (%)</label>
                <input
                  type="number" step="0.5" className="form-input"
                  value={form.target_humidity_max} onChange={set('target_humidity_max')}
                />
              </div>
            </div>
          </div>

          {/* Estimasi Waktu & Stabilitas */}
          <div className="card">
            <div className="card-title">Estimasi Waktu &amp; Deteksi Stabil</div>
            <div className="settings-grid">
              <div className="form-group">
                <label className="form-label"><Timer size={14} /> Estimasi Durasi (menit)</label>
                <input
                  type="number" step="5" className="form-input"
                  value={form.estimated_duration_min} onChange={set('estimated_duration_min')}
                />
                <span className="form-hint">≈ {durationHours} jam</span>
              </div>
              <div className="form-group">
                <label className="form-label"><Gauge size={14} /> Stable Minutes</label>
                <input
                  type="number" step="1" className="form-input"
                  value={form.stable_minutes} onChange={set('stable_minutes')}
                />
                <span className="form-hint">Lama harus stabil di rentang target sebelum dianggap "kering"</span>
              </div>
            </div>
          </div>

          {/* Preview band ideal */}
          <div className="card">
            <div className="card-title">Preview Rentang Ideal</div>
            <div className="settings-preview">
              <div className="preview-item">
                <span className="preview-label">Suhu</span>
                <span className="preview-value" style={{ color: 'var(--yellow)' }}>
                  {form.target_temp_min || 0}°C – {form.target_temp_max || 0}°C
                </span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Kelembapan</span>
                <span className="preview-value" style={{ color: 'var(--blue)' }}>
                  ≤ {form.target_humidity_max || 0}%
                </span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Estimasi Waktu</span>
                <span className="preview-value" style={{ color: 'var(--text)' }}>
                  {durationHours} jam ({form.estimated_duration_min || 0} menit)
                </span>
              </div>
              <div className="preview-item">
                <span className="preview-label">Stabil Sebelum Berhenti</span>
                <span className="preview-value" style={{ color: 'var(--green)' }}>
                  {form.stable_minutes || 0} menit
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="card">
            <div className="control-row">
              <button className="btn btn-green" disabled={saving} onClick={handleSave}>
                <Save size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                {saving ? 'Menyimpan...' : 'Simpan Setpoint'}
              </button>
              <button className="btn btn-yellow" disabled={saving} onClick={handleResetDefault}>
                <RotateCcw size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Reset ke Default
              </button>
            </div>
            <p className="settings-hint-footer">
              Perubahan setpoint hanya berlaku untuk sesi pengeringan yang dimulai <strong>setelah</strong> disimpan —
              sesi yang sedang berjalan tetap memakai setpoint lama (sudah disnapshot saat sesi dimulai).
            </p>
          </div>
        </>
      )}
    </div>
  )
}