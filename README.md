<div align="center">

# 🍌 BananaDryer IoT

### Sistem Monitoring & Kontrol Mesin Pengiris + Pengering Pisang Otomatis

**Arduino Nano** • **ESP32** • **MQTT** • **Node.js/Express** • **MySQL** • **React**

![Node](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-8.x-4479A1?style=flat-square&logo=mysql&logoColor=white)
![MQTT](https://img.shields.io/badge/MQTT-HiveMQ%20Cloud-660066?style=flat-square&logo=mqtt&logoColor=white)
![ESP32](https://img.shields.io/badge/ESP32-Firmware-E7352C?style=flat-square&logo=espressif&logoColor=white)
![License](https://img.shields.io/badge/Proyek%20Akhir-IT%20Del-blue?style=flat-square)

</div>

---

## 📚 Daftar Isi

- [Arsitektur Sistem](#-arsitektur-sistem)
- [Struktur Folder](#-struktur-folder)
- [Kebutuhan](#-kebutuhan-prerequisites)
- [1. Setup Database](#️-1-setup-database-mysql)
- [2. Setup Backend](#️-2-setup-backend)
- [3. Setup Frontend](#-3-setup-frontend)
- [4. Setup Firmware ESP32](#-4-setup-firmware-esp32)
- [5. Setup Firmware Arduino Nano](#-5-setup-firmware-arduino-nano)
- [6. Menjalankan Sistem Lengkap](#-6-menjalankan-sistem-secara-lengkap-urutan-yang-disarankan)
- [API Reference](#-api-reference-backend)
- [Troubleshooting](#️-troubleshooting-umum)
- [Lisensi](#-lisensi)

---

## 📐 Arsitektur Sistem

```
┌──────────────┐   UART ('$' protocol)   ┌──────────────┐   WiFi / MQTTS   ┌──────────────────┐
│ Arduino Nano │ ◄─────────────────────► │    ESP32     │ ───────────────► │  HiveMQ Cloud     │
│ (FSM, motor, │                         │ (WiFi/MQTT   │                  │  (MQTT Broker)    │
│  DHT, relay) │                         │  gateway)    │                  └─────────┬─────────┘
└──────────────┘                         └──────────────┘                            │
                                                                                       │ MQTT Subscribe
                                                                                       ▼
┌──────────────┐   Socket.IO (realtime)  ┌──────────────┐   SQL           ┌──────────────────┐
│   Frontend    │ ◄─────────────────────► │   Backend    │ ◄─────────────► │      MySQL        │
│ React + Vite  │        REST API         │ Node/Express │                 │  (bananadryer)    │
└──────────────┘                          └──────────────┘                 └──────────────────┘
```

**Alur data:**
1. Arduino Nano membaca sensor (DHT21) dan mengontrol motor (TB1 pendorong, TB2 pisau), relay heater, servo, lalu mengirim status via **UART** ke ESP32 memakai protokol berawalan `$`.
2. ESP32 meneruskan data ke **MQTT broker (HiveMQ Cloud)** dan menerima perintah (`cmd`) dari broker untuk diteruskan balik ke Nano via UART.
3. Backend Node.js **subscribe** ke topic MQTT, menyimpan data ke **MySQL**, lalu broadcast realtime ke frontend via **Socket.IO**.
4. Frontend React menampilkan dashboard (Pengiris, Pengering, History, Alerts) dan mengirim perintah kontrol lewat REST API.

<details>
<summary>⚡ Ringkasan cepat (klik untuk lihat)</summary>

| Komponen  | Peran                              | Port default |
|-----------|--------------------------------------|:---:|
| 🔩 Arduino Nano | Kontrol motor, relay, servo, baca sensor DHT21 | UART |
| 📶 ESP32   | Gateway WiFi ↔ MQTT, OTA update    | UART / WiFi |
| ☁️ MQTT Broker | Perantara pesan (HiveMQ Cloud)  | `8883` (MQTTS) |
| 🖥️ Backend | REST API + MQTT subscriber + Socket.IO | `3000` |
| 🗄️ MySQL   | Penyimpanan data sensor & sesi     | `3306` |
| 💻 Frontend | Dashboard React (Vite)            | `5173` |

</details>

---

## 📁 Struktur Folder

```
BananaDryer-IoT-main/
├── arduino-nano/
│   └── nano.ino          # Firmware Arduino Nano (FSM non-blocking)
├── esp32/
│   └── esp32.ino         # Firmware ESP32 (UART ↔ WiFi ↔ MQTT gateway)
├── backend/
│   ├── src/
│   │   ├── config/        # Koneksi database & MQTT
│   │   ├── controllers/    # Logic per-endpoint
│   │   ├── models/         # Migrasi skema database
│   │   ├── routes/         # Definisi REST API
│   │   ├── services/       # MQTT service (subscribe & simpan data)
│   │   ├── socket/          # Socket.IO realtime
│   │   ├── app.js
│   │   └── server.js
│   ├── .env               # Konfigurasi environment (jangan di-commit!)
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/     # Sidebar, StatCard, dll
    │   ├── hooks/           # api.js (axios), useSocket.js
    │   ├── pages/            # Dashboard, History, Alerts
    │   └── App.jsx
    ├── .env
    └── package.json
```

---

## 🔧 Kebutuhan (Prerequisites)

| Komponen        | Versi / Keterangan                          |
|------------------|----------------------------------------------|
| Node.js          | v18 atau lebih baru                          |
| npm              | bawaan Node.js                               |
| MySQL Server     | v8.x (bisa juga MariaDB)                     |
| Arduino IDE      | v2.x                                          |
| Akun MQTT Broker | HiveMQ Cloud (atau broker MQTT lain)         |

**Library Arduino yang dibutuhkan:**
- Untuk **ESP32** (`esp32/esp32.ino`): `PubSubClient`, `ArduinoJson`, `ArduinoOTA` (built-in ESP32 core), `WiFi`, `WiFiClientSecure`
- Untuk **Nano** (`arduino-nano/nano.ino`): `DHT sensor library`, `Servo`

---

## 🗄️ 1. Setup Database (MySQL)

### a. Buat database & user

Masuk ke MySQL:

```bash
mysql -u root -p
```

Buat database dan user (sesuaikan password):

```sql
CREATE DATABASE bananadryer CHARACTER SET utf8mb4;
CREATE USER 'banana'@'localhost' IDENTIFIED BY 'password_anda';
GRANT ALL PRIVILEGES ON bananadryer.* TO 'banana'@'localhost';
FLUSH PRIVILEGES;
```

> Jika backend dan MySQL berada di VM/host berbeda, ganti `'localhost'` menjadi `'%'` atau IP spesifik, dan pastikan `bind-address` di `my.cnf`/`mysqld.cnf` mengizinkan koneksi dari luar.

### b. Jalankan migrasi (membuat tabel otomatis)

Migrasi akan membuat tabel berikut secara otomatis: `machines`, `sensor_logs`, `session_logs`, `alerts`, `users`.

```bash
cd backend
npm install
npm run migrate
```

Jika berhasil, akan muncul log `[Migrate] ✅ Table: ...` untuk tiap tabel, dan seed data mesin default (`BananaDryer01`) otomatis ditambahkan ke tabel `machines`.

> 💡 Perintah `migrate` aman dijalankan berulang kali — memakai `CREATE TABLE IF NOT EXISTS` dan `INSERT IGNORE`, jadi tidak akan menduplikasi data.

**Skema tabel:**

| Tabel          | Fungsi                                                        |
|-----------------|----------------------------------------------------------------|
| `machines`      | Daftar mesin, status ONLINE/OFFLINE/ERROR, versi firmware      |
| `sensor_logs`   | Riwayat suhu, kelembapan, progress per waktu                   |
| `session_logs`  | Riwayat per-sesi pengeringan (durasi, suhu avg/max/min, hasil) |
| `alerts`        | Log peringatan/error (emergency stop, sensor error, dll)       |
| `users`         | Login dashboard (opsional, role admin/viewer)                  |

---

## ⚙️ 2. Setup Backend

### a. Konfigurasi environment

Buat/edit file `backend/.env`:

```env
# ── Server ──────────────────────────────────────────────────
PORT=3000

# ── MySQL ────────────────────────────────────────────────────
DB_HOST=localhost
DB_PORT=3306
DB_USER=banana
DB_PASSWORD=password_anda
DB_NAME=bananadryer

# ── MQTT ─────────────────────────────────────────────────────
MQTT_HOST=xxxxxxxxxxxxxxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=mqtt_username_anda
MQTT_PASSWORD=mqtt_password_anda
MQTT_CLIENT_ID=bananadryer-backend-01

# Machine ID (harus sama dengan MACHINE_ID di firmware ESP32)
MACHINE_ID=BananaDryer01
```

> ⚠️ **Jangan commit file `.env` berisi kredensial asli ke Git.** Ganti nilai di atas dengan kredensial MQTT broker dan MySQL milik Anda sendiri.

### b. Install dependencies & jalankan

```bash
cd backend
npm install

# Mode development (auto-restart pakai nodemon)
npm run dev

# Atau mode production
npm start
```

Jika berhasil, akan muncul log:

```
══════════════════════════════════════════
  BananaDryer Backend v1.0
  HTTP  : http://localhost:3000
  MQTT  : xxxxx.s1.eu.hivemq.cloud:8883
  DB    : localhost/bananadryer
══════════════════════════════════════════
[DB] MySQL connected
[MQTT] Connected to broker
[Socket.IO] Initialized
```

### c. Jalankan dengan PM2 (opsional, untuk production/VM)

```bash
npm install -g pm2
cd backend
pm2 start src/server.js --name bananadryer-backend
pm2 save
pm2 logs bananadryer-backend   # lihat log realtime
pm2 restart bananadryer-backend
pm2 stop bananadryer-backend
```

---

## 💻 3. Setup Frontend

### a. Konfigurasi environment

Buat/edit file `frontend/.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
```

> Jika backend diakses dari jaringan lain (misalnya VM diakses dari laptop lain, atau lewat tunnel seperti Cloudflare Tunnel/ngrok), ganti dengan URL/IP backend yang sesuai, contoh: `http://192.168.1.10:3000` atau `https://xxxxx.trycloudflare.com`.

### b. Install dependencies & jalankan

```bash
cd frontend
npm install

# Mode development
npm run dev
```

Frontend akan berjalan di `http://localhost:5173` (default Vite) dan bisa diakses dari perangkat lain di jaringan yang sama karena `vite.config.js` sudah diset `host: '0.0.0.0'`.

### c. Build untuk production

```bash
cd frontend
npm run build      # hasil build ada di folder dist/
npm run preview    # preview hasil build
```

Untuk deploy production, arahkan web server (nginx/Apache) atau static hosting ke folder `frontend/dist`.

---

## 🔌 4. Setup Firmware ESP32

1. Buka `esp32/esp32.ino` di Arduino IDE.
2. Install library: `PubSubClient`, `ArduinoJson` (via Library Manager).
3. Edit bagian konfigurasi di bagian atas file:

```cpp
// WiFi
#define WIFI_SSID        "NAMA_WIFI_ANDA"
#define WIFI_PASSWORD    "PASSWORD_WIFI_ANDA"

// MQTT Broker (HiveMQ Cloud free tier)
#define MQTT_HOST "xxxxxxxxxxxxxxxxxxxxxxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT       8883
#define MQTT_USER        "mqtt_username_anda"
#define MQTT_PASS        "mqtt_password_anda"

// Identitas mesin (harus sama dengan MACHINE_ID di backend/.env)
#define MACHINE_ID       "BananaDryer01"
```

4. Pilih board **ESP32 Dev Module** di Tools > Board, pilih port yang sesuai, lalu **Upload**.
5. Firmware mendukung **OTA Update** (ArduinoOTA) untuk update tanpa kabel setelah upload pertama berhasil.

**Topic MQTT yang digunakan** (otomatis dari `MACHINE_ID`):

| Topic                                  | Arah              | Isi                                  |
|------------------------------------------|-------------------|----------------------------------------|
| `bananadryer/{MACHINE_ID}/data`          | ESP32 → Backend   | Data sensor (suhu, kelembapan, progress) |
| `bananadryer/{MACHINE_ID}/state`         | ESP32 → Backend   | State mesin (IDLE, DRYING, dll)       |
| `bananadryer/{MACHINE_ID}/status`        | ESP32 → Backend   | Status ONLINE/OFFLINE (retained, LWT) |
| `bananadryer/{MACHINE_ID}/heartbeat`     | ESP32 → Backend   | Heartbeat + info chip                 |
| `bananadryer/{MACHINE_ID}/cmd`           | Backend → ESP32   | Perintah kontrol (start/stop/reset)   |

---

## 🔩 5. Setup Firmware Arduino Nano

1. Buka `arduino-nano/nano.ino` di Arduino IDE.
2. Install library: `DHT sensor library` (Adafruit), `Servo` (biasanya sudah built-in).
3. Sesuaikan pin wiring bila berbeda dari default:

| Fungsi              | Pin   |
|----------------------|-------|
| TB1 (Pendorong) ENA  | 12    |
| TB1 DIR              | 11    |
| TB1 PUL              | 10    |
| TB2 (Pisau) ENA      | 9     |
| TB2 DIR              | 8     |
| TB2 PUL              | 7     |
| Relay Heater         | 6     |
| Servo                | 4     |
| DHT21                | A5    |
| Emergency Stop       | 2 (INT0, pull-up ke GND) |

4. Pilih board **Arduino Nano** (perhatikan pilihan bootloader Old/New sesuai chip), pilih port, lalu **Upload**.
5. Sambungkan Nano ke ESP32 lewat **UART** (RX-TX silang) untuk komunikasi protokol `$`.

---

## 🚀 6. Menjalankan Sistem Secara Lengkap (Urutan yang Disarankan)

1. **Nyalakan MySQL**, pastikan service berjalan:
   ```bash
   sudo systemctl start mysql
   sudo systemctl status mysql
   ```
2. **Migrasi database** (cukup sekali di awal, atau saat ada perubahan skema):
   ```bash
   cd backend && npm run migrate
   ```
3. **Jalankan backend**:
   ```bash
   cd backend && npm run dev
   # atau via PM2: pm2 start src/server.js --name bananadryer-backend
   ```
4. **Nyalakan hardware** (Nano + ESP32) — pastikan ESP32 berhasil connect WiFi & MQTT (cek Serial Monitor).
5. **Jalankan frontend**:
   ```bash
   cd frontend && npm run dev
   ```
6. Buka browser ke `http://localhost:5173` (atau IP VM jika diakses dari perangkat lain).

---

## 📡 API Reference (Backend)

Base URL: `http://localhost:3000/api`

### Sensor
| Method | Endpoint            | Keterangan                          |
|--------|----------------------|--------------------------------------|
| GET    | `/sensor/latest`     | Data sensor terbaru                  |
| GET    | `/sensor/history`    | Riwayat data sensor                  |
| GET    | `/sensor/summary`    | Ringkasan statistik sensor           |

### Machine (Kontrol)
| Method | Endpoint                          | Keterangan                     |
|--------|-------------------------------------|----------------------------------|
| GET    | `/machine/:machineId/status`       | Status mesin saat ini            |
| POST   | `/machine/:machineId/start`        | Mulai proses pengeringan/pengirisan |
| POST   | `/machine/:machineId/stop`         | Hentikan proses                  |
| POST   | `/machine/:machineId/reset`        | Reset state mesin                |
| POST   | `/machine/:machineId/cycles`       | Set jumlah siklus                |

### Session
| Method | Endpoint                  | Keterangan                        |
|--------|------------------------------|-------------------------------------|
| GET    | `/session`                  | Daftar semua sesi                   |
| GET    | `/session/:id`               | Detail satu sesi                    |
| GET    | `/session/:id/sensor`        | Data sensor untuk sesi tertentu     |

### Alerts
| Method | Endpoint              | Keterangan                    |
|--------|--------------------------|----------------------------------|
| GET    | `/alerts`                | Daftar semua alert               |
| PATCH  | `/alerts/ack-all`        | Acknowledge semua alert          |
| PATCH  | `/alerts/:id/ack`        | Acknowledge satu alert           |

### Lainnya
| Method | Endpoint       | Keterangan               |
|--------|-----------------|-----------------------------|
| GET    | `/health`       | Health check server         |

Realtime update (progress, suhu, kelembapan, status) dikirim lewat **Socket.IO** ke frontend tanpa perlu polling.

---

## 🛠️ Troubleshooting Umum

| Masalah                                            | Kemungkinan Penyebab & Solusi                                                                 |
|------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| `[DB] MySQL connection failed`                       | Cek `DB_HOST`/`DB_USER`/`DB_PASSWORD` di `.env`, pastikan MySQL berjalan dan user punya akses.  |
| `[MQTT] Error` / tidak pernah "Connected to broker"   | Cek `MQTT_HOST`/port/username/password, dan pastikan port 8883 tidak diblokir firewall.         |
| ESP32 tidak muncul data di dashboard                  | Pastikan `MACHINE_ID` di firmware ESP32 **sama persis** dengan `MACHINE_ID` di `backend/.env`.  |
| Data sensor tidak masuk ke `sensor_logs`              | Cek string yang dikirim Nano via UART tidak korup (mis. karakter aneh menggantikan huruf biasa).|
| Frontend tidak bisa konek backend                     | Cek `VITE_BACKEND_URL` di `frontend/.env` sesuai alamat backend yang aktif (localhost/IP/tunnel).|
| Error `LIMIT ?` di query MySQL (prepared statement)    | `LIMIT`/`OFFSET` di `mysql2` sebaiknya di-inject sebagai angka langsung (parsed int), bukan lewat parameter `?`. |

---

## 📄 Lisensi & Kredit

<div align="center">

Proyek ini dibuat untuk keperluan **Proyek Akhir** — Program Studi **DIII Teknologi Komputer**
**Institut Teknologi Del**

Dosen Pembimbing: **Pandapotan Siagian, ST, M.Eng.**

Made with 🍌 &nbsp;+&nbsp; ☕

</div>
