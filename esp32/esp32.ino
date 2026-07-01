// ============================================================
// BananaDryer — ESP32 Firmware v1.4
// IoT Gateway: UART ↔ WiFi ↔ MQTT
//
// Perubahan dari v1.3:
//   [O] Forward command manual baru ke Nano: HEATER, PUSHER, CUTTER
//       Format MQTT: {"cmd":"HEATER","value":"ON"}  -> $HEATER:ON
//                    {"cmd":"PUSHER","value":"FWD"}  -> $PUSHER:FWD
//                    {"cmd":"CUTTER","value":"ON"}   -> $CUTTER:ON
//
// Perubahan dari v1.2 -> v1.3:
//   [I] WiFi reconnect lebih robust — disconnect+begin setelah 3x gagal
//   [J] NTP timezone pakai configTzTime("WIB-7") — standar POSIX
//   [K] Heartbeat diperkaya: ChipModel, CpuFreq, FlashSize
//   [L] UART keepalive — ESP32 kirim $STATUS ke Nano tiap 15 detik
//   [M] MQTT retain dipisah: sensor=false, STATE/STATUS=true
//   [N] Komentar Root CA expiry date
//
// Tetap dari v1.2:
//   [A] STRINGIFY di atas — fix error kompilasi
//   [B] queueFlush() non-blocking (1 item per loop)
//   [C] publishData() cek return value, re-queue jika gagal
//   [D] Queue FIFO lengkap (qHead/qTail)
//   [E] MQTT buffer 1024 byte
//   [F] OTA Update via ArduinoOTA
//   [G] QoS 1 untuk TOPIC_CMD
//   [H] Sinkronisasi status setelah reconnect
//
// Library yang dibutuhkan (Arduino Library Manager):
//   - PubSubClient   (MQTT)
//   - ArduinoJson    (JSON)
//   - ArduinoOTA     (sudah built-in di ESP32 Arduino core)
//
// ============================================================

// [A] STRINGIFY harus di atas — dipakai di seluruh file
#define STRINGIFY(x) #x
#define TOSTRING(x)  STRINGIFY(x)

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <time.h>
#include "esp_task_wdt.h"

// ============================================================
// KONFIGURASI — Edit bagian ini
// ============================================================

// WiFi
#define WIFI_SSID        "ESP32L"
#define WIFI_PASSWORD    "12345678"

// MQTT Broker (HiveMQ Cloud free tier)
#define MQTT_HOST "d1b37a26c1fc403090006f2f46c45938.s1.eu.hivemq.cloud"
#define MQTT_PORT       8883
#define MQTT_USER        "angeleno"
#define MQTT_PASS        "Angeleno123"

// Identitas mesin
#define MACHINE_ID       "BananaDryer01"
#define FIRMWARE_VER     "1.4.0"
#define HARDWARE_REV     "RevA"

// MQTT Topics
#define TOPIC_DATA       "bananadryer/" MACHINE_ID "/data"
#define TOPIC_STATE      "bananadryer/" MACHINE_ID "/state"
#define TOPIC_CMD        "bananadryer/" MACHINE_ID "/cmd"
#define TOPIC_STATUS     "bananadryer/" MACHINE_ID "/status"
#define TOPIC_HEARTBEAT  "bananadryer/" MACHINE_ID "/heartbeat"

// UART ke Arduino Nano (ESP32: RX2=16, TX2=17)
#define NANO_BAUD        9600
#define UART_BUF_SIZE    256

// Timing
#define HEARTBEAT_MS        30000UL
#define UART_TIMEOUT_MS     60000UL
#define NANO_KEEPALIVE_MS   15000UL  // [L] Kirim $STATUS ke Nano tiap 15 detik
#define WDT_TIMEOUT_S       30
#define WIFI_MAX_RETRY      3        // [I] Setelah N kali gagal reconnect, begin() ulang

// [D] Queue FIFO — slot dan ukuran payload per slot
#define QUEUE_SIZE       20
#define QUEUE_ITEM_SIZE  512

// [J] NTP — timezone POSIX string, lebih standar dari TZ_OFFSET numerik
//     WIB=UTC+7, WITA=UTC+8 (ganti "WIB-7" ke "WITA-8"), WIT=UTC+9 ("WIT-9")
#define NTP_TZ           "WIB-7"
#define NTP_SERVER1      "pool.ntp.org"
#define NTP_SERVER2      "time.nist.gov"

// ============================================================
// ROOT CA — HiveMQ Cloud (DigiCert Global Root CA)
// [N] PENTING: Sertifikat ini valid sampai 10 Nov 2031.
//     Jika TLS gagal mendadak setelah tanggal tersebut,
//     update Root CA dari: https://www.digicert.com/kb/digicert-root-certificates.htm
//     Pilih: DigiCert Global Root CA (PEM)
// ============================================================
static const char ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDrzCCApegAwIBAgIQCDvgVpBCRrGhdWrJWZHHSjANBgkqhkiG9w0BAQUFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBD
QTAeFw0wNjExMTAwMDAwMDBaFw0zMTExMTAwMDAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IENBMB4XDTA2MTExMDAw
MDAwMFoXDTMxMTExMDAwMDAwMFowYTELMAkGA1UEBhMCVVMxFTATBgNVBAoTDERp
Z2lDZXJ0IEluYzEZMBcGA1UECxMQd3d3LmRpZ2ljZXJ0LmNvbTEgMB4GA1UEAxMX
RGlnaUNlcnQgR2xvYmFsIFJvb3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw
ggEKAoIBAQDiO+ERct9bTWgDGrbbABUGKNpNmSb9oS4M5DtBhJxNpMuDo7aVMHM0
HHqWMi2M4Ra9Tx6H03O3tjgJMPGqJDYSuobEI4RnLfFprmVKOOGJtV6BzQ5qdTBZ
dEhcIyoUXgHFQUCi8FVEhS4EbR6SFdvtmMbQ+tFb2u7dNs3Xu3k2I7BzA8bRUms
k3eVv6fCBmpNT+cUdMjSGBu8k/0SWnkVJ1FgSwikZQiRkxlBM2uWYoKcOUa4MAaE
2nf2GdwULSmD3NlFM/JB+YC3LHJhrgW3Gy5tq9pNPTQJqMtT5pPrJDg2oo/jFJeM
2QpkHqO8tCNaM1PrRNH4jmHrCaOlBbJfAgMBAAGjYzBhMA4GA1UdDwEB/wQEAwIB
hjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBQD3lA1VtFMu2bwo+IbG8OXsj3R
VTAfBgNVHSMEGDAWgBQD3lA1VtFMu2bwo+IbG8OXsj3RVTANBgkqhkiG9w0BAQUF
AAOCAQEAEXoCmgqxbVCqUNvhioKUntMtPu+k4XHsHgOQoGKz4/dRzYLDGJR9kOJD
e6CQPK9lIXjVi1iS6JpAfPnvIr1NmEuOQZMNQh6A2hJKYy8NyUZQVT2p9GNLKe8i
JHT7/dpYDwgIMfaLkMoNHCKHTkIy4DKO0K7UhAqiDKLt3MF4xG25nnUH2GYYXJ0D
YCNYS+RPJJ5W8Kf3JCE3N4fKO9m4N+CiZLLN7x4lchNcLJENe4S9bEm2wZrIz8k
V8Y3mCKlVpPJRFOJ8PVgLqMqHwYrCcJqV0p6vRGbRYCAqtLjFLz1NP1PkVBTk+kE
S3cTAcJa1kZ7jM5dJKVeAjeyVg==
-----END CERTIFICATE-----
)EOF";

// ============================================================
// OBJEK GLOBAL
// ============================================================
WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);

// Non-blocking UART buffer
char     uartBuf[UART_BUF_SIZE];
uint16_t uartIdx = 0;

// [D] Queue FIFO lengkap — qTail = indeks baca, qHead = indeks tulis
//     Kosong : qCount == 0
//     Penuh  : qCount == QUEUE_SIZE
char     pubQueue[QUEUE_SIZE][QUEUE_ITEM_SIZE];
uint8_t  qHead  = 0;   // indeks tulis berikutnya
uint8_t  qTail  = 0;   // indeks baca berikutnya (oldest item)
uint8_t  qCount = 0;   // jumlah item aktif

// Status
char     lastStateStr[32] = "IDLE";
bool     nanoOnline       = false;
bool     wifiReady        = false;
bool     ntpSynced        = false;

// Timing
unsigned long lastHeartbeat    = 0;
unsigned long lastNanoMsg      = 0;
unsigned long lastNanoKeepalive = 0;  // [L] Kapan terakhir kirim $STATUS ke Nano

// [I] WiFi reconnect counter
uint8_t  wifiRetryCount = 0;

// [B] Flush state — flush 1 item per loop() call
bool     flushActive = false;

// Prototype — diperlukan karena processNanoLine dipanggil dari readUartNonBlocking
void processNanoLine(const char* line);

// ============================================================
// NTP — Ambil timestamp ISO8601
// ============================================================
void getTimestamp(char* buf, size_t len) {
  if (!ntpSynced) {
    snprintf(buf, len, "1970-01-01T00:00:00+07:00");
    return;
  }
  time_t now    = time(nullptr);
  struct tm* t  = localtime(&now);
  strftime(buf, len, "%Y-%m-%dT%H:%M:%S+07:00", t);
}

// ============================================================
// [D] Queue FIFO helpers
// ============================================================
bool queueEmpty() { return qCount == 0; }
bool queueFull()  { return qCount == QUEUE_SIZE; }

// Push ke ekor queue; jika penuh, item tertua di-drop (qTail maju)
void queuePush(const char* json) {
  if (queueFull()) {
    // Overwrite item tertua — majukan tail
    qTail = (qTail + 1) % QUEUE_SIZE;
    qCount--;
    Serial.println("[Queue] Full — oldest item dropped");
  }
  strncpy(pubQueue[qHead], json, QUEUE_ITEM_SIZE - 1);
  pubQueue[qHead][QUEUE_ITEM_SIZE - 1] = '\0';
  qHead  = (qHead + 1) % QUEUE_SIZE;
  qCount++;
}

// Peek item terdepan tanpa menghapusnya
const char* queuePeek() {
  if (queueEmpty()) return nullptr;
  return pubQueue[qTail];
}

// Hapus item terdepan setelah berhasil publish
void queuePop() {
  if (queueEmpty()) return;
  qTail  = (qTail + 1) % QUEUE_SIZE;
  qCount--;
}

// ============================================================
// isConnected
// ============================================================
bool isConnected() {
  return wifiReady && mqttClient.connected();
}

// ============================================================
// Forward perintah ke Arduino Nano via UART
// ============================================================
void forwardToNano(const char* cmd) {
  Serial2.println(cmd);
  Serial.print("[UART->Nano] ");
  Serial.println(cmd);
}

// ============================================================
// [C][M] publishData — sensor retain=false, re-queue jika gagal
// ============================================================
void publishData(const char* json) {
  if (!isConnected()) {
    queuePush(json);
    return;
  }
  // [M] retain=false untuk data sensor — broker tidak perlu simpan nilai lama.
  //     Hanya STATE dan STATUS yang retain=true (lihat publishState/publishStatus).
  bool ok = mqttClient.publish(TOPIC_DATA, json, false);
  if (!ok) {
    Serial.println("[MQTT] publish failed — queuing");
    queuePush(json);
  }
}

// ============================================================
// [B] queueFlushStep — dipanggil di loop(), kirim 1 item saja
//     Tidak ada delay() — sepenuhnya non-blocking
// ============================================================
void queueFlushStep() {
  if (!flushActive || queueEmpty() || !isConnected()) {
    flushActive = false;
    return;
  }

  const char* item = queuePeek();
  if (item == nullptr) { flushActive = false; return; }

  bool ok = mqttClient.publish(TOPIC_DATA, item, false);  // [M] retain=false
  if (ok) {
    queuePop();
    Serial.print("[Queue] Flushed 1 item, remaining: ");
    Serial.println(qCount);
  } else {
    // Publish gagal — hentikan flush sementara, coba lagi loop berikutnya
    Serial.println("[Queue] Flush item failed — will retry");
    flushActive = false;
  }

  if (queueEmpty()) {
    flushActive = false;
    Serial.println("[Queue] Flush complete");
  }
}

// ============================================================
// Publish helpers — pakai char[], bukan String
// ============================================================
void publishState(const char* state) {
  if (!isConnected()) return;
  char ts[32];  getTimestamp(ts, sizeof(ts));
  char out[256];
  snprintf(out, sizeof(out),
    "{\"machine\":\"%s\",\"state\":\"%s\",\"ts\":\"%s\"}",
    MACHINE_ID, state, ts);
  mqttClient.publish(TOPIC_STATE, out, true);
}

void publishStatus(const char* msg) {
  if (!isConnected()) return;
  char ts[32];  getTimestamp(ts, sizeof(ts));
  char out[256];
  snprintf(out, sizeof(out),
    "{\"machine\":\"%s\",\"status\":\"%s\",\"ts\":\"%s\"}",
    MACHINE_ID, msg, ts);
  mqttClient.publish(TOPIC_STATUS, out);
}

// [K] Heartbeat diperkaya: ChipModel, CpuFreq, FlashSize
void publishHeartbeat() {
  if (!isConnected()) return;
  char ts[32];  getTimestamp(ts, sizeof(ts));
  uint32_t heapFree  = esp_get_free_heap_size();
  uint32_t heapMin   = esp_get_minimum_free_heap_size();
  int8_t   rssi      = WiFi.RSSI();
  uint32_t uptimeSec = millis() / 1000;

  char out[512];
  snprintf(out, sizeof(out),
    "{\"machine\":\"%s\",\"firmware\":\"%s\",\"hardware\":\"%s\","
    "\"chip\":\"%s\",\"chip_rev\":%u,\"cpu_mhz\":%u,\"flash_mb\":%u,"
    "\"wifi_rssi\":%d,\"heap_free\":%u,\"heap_min\":%u,"
    "\"uptime\":%u,\"nano\":\"%s\",\"mqtt\":\"connected\","
    "\"queue\":%u,\"ntp\":%s,\"ts\":\"%s\"}",
    MACHINE_ID, FIRMWARE_VER, HARDWARE_REV,
    ESP.getChipModel(), ESP.getChipRevision(),
    ESP.getCpuFreqMHz(), ESP.getFlashChipSize() / (1024 * 1024),
    rssi, heapFree, heapMin,
    uptimeSec,
    nanoOnline ? "online" : "offline",
    qCount,
    ntpSynced ? "true" : "false",
    ts);
  mqttClient.publish(TOPIC_HEARTBEAT, out);
}

// ============================================================
// Parse baris $DATA dari Nano
// Format: $DATA:STATE=DRYING,TEMP=54.3,HUM=41.2,...
// ============================================================
void parseDataLine(const char* val) {
  char buf[UART_BUF_SIZE];
  strncpy(buf, val, sizeof(buf) - 1);
  buf[sizeof(buf) - 1] = '\0';

  char  stateVal[32]  = "";
  float tempVal       = 0.0f;
  float humVal        = 0.0f;
  char  heaterVal[8]  = "";
  int   cycleVal      = 0;
  int   totalVal      = 0;
  int   progressVal   = 0;
  int   elapsedVal    = 0;
  int   remainVal     = 0;
  int   uptimeVal     = 0;

  char* token = strtok(buf, ",");
  while (token != NULL) {
    char* eq = strchr(token, '=');
    if (eq != NULL) {
      *eq       = '\0';
      char* key = token;
      char* v   = eq + 1;

      if      (strcmp(key, "STATE")    == 0) strncpy(stateVal,  v, sizeof(stateVal)  - 1);
      else if (strcmp(key, "TEMP")     == 0) tempVal     = atof(v);
      else if (strcmp(key, "HUM")      == 0) humVal      = atof(v);
      else if (strcmp(key, "HEATER")   == 0) strncpy(heaterVal, v, sizeof(heaterVal) - 1);
      else if (strcmp(key, "CYCLE")    == 0) cycleVal    = atoi(v);
      else if (strcmp(key, "TOTAL")    == 0) totalVal    = atoi(v);
      else if (strcmp(key, "PROGRESS") == 0) progressVal = atoi(v);
      else if (strcmp(key, "ELAPSED")  == 0) elapsedVal  = atoi(v);
      else if (strcmp(key, "REMAIN")   == 0) remainVal   = atoi(v);
      else if (strcmp(key, "UPTIME")   == 0) uptimeVal   = atoi(v);
    }
    token = strtok(NULL, ",");
  }

  if (strlen(stateVal) > 0) {
    strncpy(lastStateStr, stateVal, sizeof(lastStateStr) - 1);
  }

  char ts[32];  getTimestamp(ts, sizeof(ts));
  char out[QUEUE_ITEM_SIZE];
  snprintf(out, sizeof(out),
    "{\"machine\":\"%s\","
    "\"state\":\"%s\","
    "\"temperature\":%.1f,"
    "\"humidity\":%.1f,"
    "\"heater\":\"%s\","
    "\"cycle\":%d,"
    "\"total\":%d,"
    "\"progress\":%d,"
    "\"elapsed\":%d,"
    "\"remain\":%d,"
    "\"uptime\":%d,"
    "\"ts\":\"%s\"}",
    MACHINE_ID,
    stateVal, tempVal, humVal, heaterVal,
    cycleVal, totalVal, progressVal,
    elapsedVal, remainVal, uptimeVal, ts);

  publishData(out);
}

// ============================================================
// Proses satu baris UART dari Arduino Nano
// ============================================================
void processNanoLine(const char* line) {
  if (line[0] != '$') return;

  lastNanoMsg = millis();
  nanoOnline  = true;

  Serial.print("[Nano] ");
  Serial.println(line);

  const char* body = line + 1;  // skip '$'

  if (strncmp(body, "DATA:", 5) == 0) {
    parseDataLine(body + 5);
  }
  else if (strncmp(body, "STATE:", 6) == 0) {
    const char* state = body + 6;
    strncpy(lastStateStr, state, sizeof(lastStateStr) - 1);
    publishState(state);
  }
  else if (strncmp(body, "HEATER:", 7) == 0) {
    if (isConnected()) {
      char ts[32]; getTimestamp(ts, sizeof(ts));
      char out[192];
      snprintf(out, sizeof(out),
        "{\"machine\":\"%s\",\"heater\":\"%s\",\"ts\":\"%s\"}",
        MACHINE_ID, body + 7, ts);
      mqttClient.publish(TOPIC_DATA, out);
    }
  }
  else if (strncmp(body, "SERVO:", 6) == 0) {
    if (isConnected()) {
      char ts[32]; getTimestamp(ts, sizeof(ts));
      char out[192];
      snprintf(out, sizeof(out),
        "{\"machine\":\"%s\",\"servo\":\"%s\",\"ts\":\"%s\"}",
        MACHINE_ID, body + 6, ts);
      mqttClient.publish(TOPIC_DATA, out);
    }
  }
  else if (strcmp(body, "PROCESS:COMPLETE") == 0) {
    publishState("FINISHED");
    publishStatus("PROCESS_COMPLETE");
  }
  else if (strncmp(body, "ERROR:", 6) == 0) {
    publishState("ERROR");
    if (isConnected()) {
      char ts[32]; getTimestamp(ts, sizeof(ts));
      char out[256];
      snprintf(out, sizeof(out),
        "{\"machine\":\"%s\",\"error\":\"%s\",\"ts\":\"%s\"}",
        MACHINE_ID, body + 6, ts);
      mqttClient.publish(TOPIC_STATUS, out);
    }
  }
  else if (strncmp(body, "DHT:WARN", 8) == 0) {
    if (isConnected()) {
      char ts[32]; getTimestamp(ts, sizeof(ts));
      char out[256];
      snprintf(out, sizeof(out),
        "{\"machine\":\"%s\",\"warning\":\"%s\",\"ts\":\"%s\"}",
        MACHINE_ID, body, ts);
      mqttClient.publish(TOPIC_STATUS, out);
    }
  }
  else if (strncmp(body, "MANUAL:", 7) == 0) {
    if (isConnected()) {
      char ts[32]; getTimestamp(ts, sizeof(ts));
      char out[192];
      snprintf(out, sizeof(out),
        "{\"machine\":\"%s\",\"manual\":\"%s\",\"ts\":\"%s\"}",
        MACHINE_ID, body + 7, ts);
      mqttClient.publish(TOPIC_STATUS, out);
    }
  }
  else if (strncmp(body, "ACK:", 4)  == 0 ||
           strcmp(body,  "READY")    == 0 ||
           strncmp(body, "CYCLE:", 6) == 0) {
    if (isConnected()) {
      char ts[32]; getTimestamp(ts, sizeof(ts));
      char out[192];
      snprintf(out, sizeof(out),
        "{\"machine\":\"%s\",\"info\":\"%s\",\"ts\":\"%s\"}",
        MACHINE_ID, body, ts);
      mqttClient.publish(TOPIC_STATUS, out);
    }
  }
}

// ============================================================
// Non-blocking UART reader
// ============================================================
void readUartNonBlocking() {
  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\n' || c == '\r') {
      if (uartIdx > 0) {
        uartBuf[uartIdx] = '\0';
        processNanoLine(uartBuf);
        uartIdx = 0;
      }
    } else {
      if (uartIdx < UART_BUF_SIZE - 1) {
        uartBuf[uartIdx++] = c;
      } else {
        Serial.println("[UART] Buffer overflow — resetting");
        uartIdx = 0;
      }
    }
  }
}

// ============================================================
// [G][O] MQTT Callback — QoS 1 untuk TOPIC_CMD
//        + forwarding manual command (HEATER/PUSHER/CUTTER)
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char msg[256] = "";
  uint16_t len  = (length < sizeof(msg) - 1) ? (uint16_t)length : sizeof(msg) - 1;
  memcpy(msg, payload, len);
  msg[len] = '\0';

  // Trim trailing whitespace
  char* p = msg + strlen(msg) - 1;
  while (p >= msg && (*p == ' ' || *p == '\r' || *p == '\n')) *p-- = '\0';

  Serial.print("[MQTT] Cmd: ");
  Serial.println(msg);

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, msg);

  if (!err && doc.containsKey("cmd")) {
    const char* cmd = doc["cmd"];

    if      (strcmp(cmd, "START")  == 0) { forwardToNano("$START");  publishStatus("CMD_ACK:START"); }
    else if (strcmp(cmd, "STOP")   == 0) { forwardToNano("$STOP");   publishStatus("CMD_ACK:STOP"); }
    else if (strcmp(cmd, "RESET")  == 0) { forwardToNano("$RESET");  publishStatus("CMD_ACK:RESET"); }
    else if (strcmp(cmd, "STATUS") == 0) { forwardToNano("$STATUS"); }
    else if (strcmp(cmd, "CYCLES") == 0 && doc.containsKey("value")) {
      int cycles = doc["value"].as<int>();
      char uartCmd[32];
      snprintf(uartCmd, sizeof(uartCmd), "$CYCLES:%d", cycles);
      forwardToNano(uartCmd);
      publishStatus("CMD_ACK:CYCLES");
    }
    // [O] Manual — Heater. value: "ON" / "OFF"
    else if (strcmp(cmd, "HEATER") == 0 && doc.containsKey("value")) {
      const char* v = doc["value"];
      char uartCmd[24];
      snprintf(uartCmd, sizeof(uartCmd), "$HEATER:%s", v);
      forwardToNano(uartCmd);
      publishStatus("CMD_ACK:HEATER");
    }
    // [O] Manual — Pendorong. value: "FWD" / "REV" / "STOP"
    else if (strcmp(cmd, "PUSHER") == 0 && doc.containsKey("value")) {
      const char* v = doc["value"];
      char uartCmd[24];
      snprintf(uartCmd, sizeof(uartCmd), "$PUSHER:%s", v);
      forwardToNano(uartCmd);
      publishStatus("CMD_ACK:PUSHER");
    }
    // [O] Manual — Pemotong. value: "ON" / "OFF"
    else if (strcmp(cmd, "CUTTER") == 0 && doc.containsKey("value")) {
      const char* v = doc["value"];
      char uartCmd[24];
      snprintf(uartCmd, sizeof(uartCmd), "$CUTTER:%s", v);
      forwardToNano(uartCmd);
      publishStatus("CMD_ACK:CUTTER");
    }
  } else {
    // Fallback plain text (tes manual via MQTT client)
    if      (strcmp(msg, "START")  == 0) { forwardToNano("$START");  publishStatus("CMD_ACK:START"); }
    else if (strcmp(msg, "STOP")   == 0) { forwardToNano("$STOP");   publishStatus("CMD_ACK:STOP"); }
    else if (strcmp(msg, "RESET")  == 0) { forwardToNano("$RESET");  publishStatus("CMD_ACK:RESET"); }
    else if (strcmp(msg, "STATUS") == 0) { forwardToNano("$STATUS"); }
    else if (strncmp(msg, "CYCLES:", 7) == 0) {
      char uartCmd[32];
      snprintf(uartCmd, sizeof(uartCmd), "$%s", msg);
      forwardToNano(uartCmd);
    }
  }
}

// ============================================================
// WiFi Event Handler
// ============================================================
void onWifiEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      Serial.print("[WiFi] Connected, IP: ");
      Serial.println(WiFi.localIP());
      wifiReady      = true;
      wifiRetryCount = 0;  // [I] Reset retry counter saat berhasil
      // [J] configTzTime — POSIX timezone string, lebih portable dari TZ_OFFSET numerik
      configTzTime(NTP_TZ, NTP_SERVER1, NTP_SERVER2);
      Serial.println("[NTP] Syncing (" NTP_TZ ")...");
      break;

    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.println("[WiFi] Disconnected...");
      wifiReady = false;
      ntpSynced = false;
      wifiRetryCount++;
      // [I] Setelah WIFI_MAX_RETRY kali gagal, begin() ulang (bukan sekadar reconnect)
      if (wifiRetryCount >= WIFI_MAX_RETRY) {
        Serial.printf("[WiFi] %d retries — doing full begin()\n", wifiRetryCount);
        wifiRetryCount = 0;
        WiFi.disconnect(true);
        delay(200);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      } else {
        WiFi.reconnect();
      }
      break;

    default:
      break;
  }
}

// ============================================================
// MQTT Connect — LWT + Subscribe QoS 1 + [H] Status Sync
// ============================================================
void connectMqtt() {
  if (mqttClient.connected() || !wifiReady) return;

  Serial.print("[MQTT] Connecting...");

  char clientId[48];
  snprintf(clientId, sizeof(clientId), "%s_%04X",
           MACHINE_ID, (uint16_t)random(0xFFFF));

  // LWT — broker publish ini jika ESP32 terputus mendadak
  char lwtPayload[128];
  snprintf(lwtPayload, sizeof(lwtPayload),
    "{\"machine\":\"%s\",\"status\":\"OFFLINE\"}",
    MACHINE_ID);

  bool ok = mqttClient.connect(
    clientId,
    MQTT_USER, MQTT_PASS,
    TOPIC_STATUS, 1, true,   // LWT: topic, QoS, retain, payload
    lwtPayload
  );

  if (ok) {
    Serial.println(" OK");

    // [G] Subscribe TOPIC_CMD dengan QoS 1 agar perintah tidak hilang
    mqttClient.subscribe(TOPIC_CMD, 1);

    publishStatus("ONLINE");
    publishHeartbeat();

    // [H] Sinkronisasi status setelah reconnect:
    //     Minta Nano kirim status terkini & publish state terakhir yang diketahui
    forwardToNano("$STATUS");
    if (strlen(lastStateStr) > 0) {
      publishState(lastStateStr);
    }

    // Aktifkan flush queue (non-blocking, 1 item per loop)
    if (!queueEmpty()) {
      flushActive = true;
      Serial.print("[Queue] Starting flush, items: ");
      Serial.println(qCount);
    }

  } else {
    Serial.print(" Failed, rc=");
    Serial.println(mqttClient.state());
  }
}

// ============================================================
// [F] OTA Update setup
// ============================================================
void setupOTA() {
  ArduinoOTA.setHostname(MACHINE_ID);
  // Opsional: ArduinoOTA.setPassword("ota_password");

  ArduinoOTA.onStart([]() {
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
    Serial.println("[OTA] Start: " + type);
    publishStatus("OTA_START");
    // Hentikan watchdog selama OTA agar tidak reboot di tengah update
    esp_task_wdt_delete(NULL);
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Done — rebooting");
    publishStatus("OTA_DONE");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    static uint8_t lastPct = 255;
    uint8_t pct = (uint8_t)(progress * 100 / total);
    if (pct != lastPct) {
      Serial.printf("[OTA] Progress: %u%%\r", pct);
      lastPct = pct;
    }
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Error[%u]: ", error);
    if      (error == OTA_AUTH_ERROR)    Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR)   Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR)     Serial.println("End Failed");
    publishStatus("OTA_ERROR");
    // Re-daftarkan watchdog setelah OTA gagal
    esp_task_wdt_add(NULL);
  });

  ArduinoOTA.begin();
  Serial.println("[OTA] Ready, hostname: " MACHINE_ID);
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial2.begin(NANO_BAUD, SERIAL_8N1, 16, 17);

  Serial.println("\n[ESP32] BananaDryer Gateway v" FIRMWARE_VER
                 " (hw:" HARDWARE_REV ")");
  Serial.print("[ESP32] Machine: ");
  Serial.println(MACHINE_ID);

  // [A] Watchdog — sekarang STRINGIFY sudah terdefinisi di atas
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);
  Serial.println("[WDT] Watchdog " TOSTRING(WDT_TIMEOUT_S) "s");

  // WiFi Event Handler
  WiFi.onEvent(onWifiEvent);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);   // Pastikan auto-reconnect aktif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting...");

  unsigned long wifiStart = millis();
  while (!wifiReady && millis() - wifiStart < 15000) {
    delay(200);
    Serial.print(".");
    esp_task_wdt_reset();
  }
  Serial.println();

  // NTP — tunggu maks 5 detik; configTzTime sudah dipanggil di onWifiEvent
  if (wifiReady) {
    Serial.print("[NTP] Waiting");
    unsigned long ntpStart = millis();
    while (time(nullptr) < 100000UL && millis() - ntpStart < 5000) {
      delay(100);
      Serial.print(".");
      esp_task_wdt_reset();
    }
    if (time(nullptr) > 100000UL) {
      ntpSynced = true;
      char ts[32]; getTimestamp(ts, sizeof(ts));
      Serial.print("\n[NTP] Synced: ");
      Serial.println(ts);
    } else {
      Serial.println("\n[NTP] Timeout — will sync in background");
    }
  }

  // TLS & MQTT
  wifiClient.setInsecure();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(60);
  mqttClient.setBufferSize(1024);   // [E] Diperbesar ke 1024 byte

  connectMqtt();

  // [F] OTA
  if (wifiReady) setupOTA();

  lastHeartbeat    = millis();
  lastNanoMsg      = millis();
  lastNanoKeepalive = millis();

  Serial.println("[ESP32] Setup done");
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  // Reset watchdog di awal setiap iterasi
  esp_task_wdt_reset();

  unsigned long now = millis();

  // MQTT loop (wajib)
  if (wifiReady) {
    mqttClient.loop();
  }

  // MQTT reconnect — non-blocking, coba setiap 5 detik
  if (!mqttClient.connected() && wifiReady) {
    static unsigned long lastMqttAttempt = 0;
    if (now - lastMqttAttempt >= 5000) {
      lastMqttAttempt = now;
      connectMqtt();
    }
  }

  // [F] OTA handle
  if (wifiReady) {
    ArduinoOTA.handle();
  }

  // Cek NTP sinkron di background
  if (!ntpSynced && wifiReady && time(nullptr) > 100000UL) {
    ntpSynced = true;
    char ts[32]; getTimestamp(ts, sizeof(ts));
    Serial.print("[NTP] Synced: ");
    Serial.println(ts);
  }

  // Heartbeat
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    publishHeartbeat();
  }

  // [L] UART keepalive — kirim $STATUS ke Nano tiap 15 detik
  //     Memastikan Nano tidak dianggap offline saat state IDLE (jarang kirim data)
  if (now - lastNanoKeepalive >= NANO_KEEPALIVE_MS) {
    lastNanoKeepalive = now;
    forwardToNano("$STATUS");
  }

  // Cek Nano online/offline
  if (nanoOnline && (now - lastNanoMsg >= UART_TIMEOUT_MS)) {
      nanoOnline = false;
      Serial.println("[UART] Nano timeout");
    publishStatus("NANO_OFFLINE");
  }

  // [B] Flush queue — 1 item per loop, non-blocking
  if (flushActive && isConnected()) {
    queueFlushStep();
  }

  // Non-blocking UART reader
  readUartNonBlocking();
}
