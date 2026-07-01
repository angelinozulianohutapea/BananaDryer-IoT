// ============================================================
// BananaDryer — Arduino Nano Firmware v2.3
// Finite State Machine (FSM) — Non-Blocking (millis)
// Komunikasi UART dengan ESP32 (protokol '$')
//
// Perubahan dari v2.2:
//  ~ DHT error handling: pakai lastTemp dulu, ERROR hanya setelah
//    gagal terus-menerus selama DHT_FAIL_TIMEOUT (60 detik)
//  ~ Progress slicing: pakai currentCycle+1 saat FORWARD agar
//    dashboard tidak stuck di 0% selama siklus pertama
//  ~ DHT_READ_INTERVAL: diturunkan 10s → 5s (lebih responsif)
//
// CATATAN: TB1_STROKE_MS menggunakan waktu sebagai penentu
// stroke. Jika tersedia limit switch, ganti logika di
// updateStepper() dengan digitalRead(LIMIT_SW_PIN).
// ============================================================

#include <DHT.h>
#include <Servo.h>

// ============================================================
// PIN DEFINITIONS
// ============================================================
#define TB1_ENA        12   // Pendorong — Enable  (LOW = aktif)
#define TB1_DIR        11   // Pendorong — Direction
#define TB1_PUL        10   // Pendorong — Pulse

#define TB2_ENA         9   // Pisau — Enable  (LOW = aktif)
#define TB2_DIR         8   // Pisau — Direction
#define TB2_PUL         7   // Pisau — Pulse

#define RELAY_HEATER    6   // Active HIGH: ON=HIGH, OFF=LOW
#define SERVO_PIN       4
#define DHT_PIN        A5
#define DHT_TYPE       DHT21

// Emergency Stop — tombol fisik, hubungkan ke GND saat ditekan
// Menggunakan INPUT_PULLUP, interrupt INT0
#define ESTOP_PIN       2

// ============================================================
// MOTOR CONFIGURATION
// ============================================================
#define TB1_STROKE_MS   42000UL   // Durasi 1x stroke maju/mundur (ms)
#define TB1_STEP_US       150     // Half-period pulse TB1 (µs)
#define TB2_STEP_US       800     // Half-period pulse TB2 (µs)

// ============================================================
// RELAY
// ============================================================
#define HEATER_ON   HIGH
#define HEATER_OFF  LOW

// ============================================================
// SERVO
// ============================================================
#define SERVO_OPEN_POS     50
#define SERVO_CLOSE_POS    175
#define SERVO_OPEN_DELAY   800UL    // Tunggu servo buka penuh (ms)
#define SERVO_CLOSE_WAIT   600UL    // Tunggu servo tutup penuh (ms)

// ============================================================
// DHT
// ============================================================
#define DHT_READ_INTERVAL    5000UL  // Baca DHT tiap 5 detik
#define DHT_MAX_RETRY           3    // Kirim warning setelah gagal N kali
#define DHT_FAIL_TIMEOUT    60000UL  // ERROR jika gagal terus selama 60 detik

// ============================================================
// DRYING
// ============================================================
#define DRYING_DURATION    10800000UL   // 3 jam (ms)
#define TEMP_HEATER_ON          50.0f  // Heater ON jika suhu < 50°C
#define TEMP_HEATER_OFF         55.0f  // Heater OFF jika suhu >= 55°C

// ============================================================
// SERVO WAIT setelah slicing selesai
// ============================================================
#define SERVO_WAIT_DURATION  10000UL   // 10 detik servo tetap terbuka

// ============================================================
// STATE MACHINE
// ============================================================
enum MachineState {
  STATE_IDLE,
  STATE_SERVO_OPENING,    // Menunggu servo buka penuh
  STATE_SLICING_FORWARD,  // TB1 maju + TB2 ON
  STATE_SLICING_RETURN,   // TB1 mundur, TB2 OFF
  STATE_SERVO_WAIT,       // Servo tetap buka, tunggu irisan masuk
  STATE_SERVO_CLOSING,    // Servo menutup
  STATE_DRYING,           // Pengeringan
  STATE_FINISHED,         // Proses selesai, menunggu RESET
  STATE_ERROR             // Error
};

MachineState currentState = STATE_IDLE;

// ============================================================
// OBJECTS
// ============================================================
DHT   dht(DHT_PIN, DHT_TYPE);
Servo myServo;

// ============================================================
// GLOBAL VARIABLES
// ============================================================

// Konfigurasi
int  totalCycles    = 0;
int  currentCycle   = 0;

// Heater
bool heaterState    = false;

// Stepper (non-blocking pulse)
bool          tb1PulHigh     = false;
bool          tb2PulHigh     = false;
unsigned long tb1LastUs      = 0;
unsigned long tb2LastUs      = 0;
unsigned long stepperStartMs = 0;
bool          stepperActive  = false;

// Timing state transitions
unsigned long stateEnteredMs = 0;

// DHT
unsigned long lastDHTRead    = 0;
int           dhtRetryCount  = 0;
unsigned long dhtFirstFailMs = 0;    // Kapan kegagalan DHT pertama kali terjadi
bool          dhtInFail      = false; // Sedang dalam kondisi gagal beruntun
float         lastTemp       = 0.0f;
float         lastHum        = 0.0f;

// Drying timer
unsigned long dryingStartMs  = 0;

// Uptime
unsigned long processStartMs = 0;

// Emergency Stop flag (set dari ISR)
volatile bool eStopTriggered = false;

// ============================================================
// FORWARD DECLARATIONS
// ============================================================
void readUART();
void setHeater(bool on);
void updateThermalControl(float temp);
void readDHT(bool reportData);
void enterState(MachineState s);
void startStepperForward();
void startStepperReturn();
void stopStepper();
void updateStepper();
void doEmergencyStop(const char* reason);
void sendData();
const char* stateToStr(MachineState s);

// ============================================================
// INTERRUPT — Emergency Stop tombol fisik
// ============================================================
void ESTOP_ISR() {
  eStopTriggered = true;
}

// ============================================================
// EMERGENCY STOP — dipanggil dari loop atau ISR flag
// ============================================================
void doEmergencyStop(const char* reason) {
  stopStepper();
  setHeater(false);
  myServo.write(SERVO_CLOSE_POS);
  totalCycles    = 0;
  currentCycle   = 0;
  dhtRetryCount  = 0;
  dhtInFail      = false;
  dhtFirstFailMs = 0;
  eStopTriggered = false;
  // Masuk ERROR bukan IDLE agar operator tahu ini bukan selesai normal
  currentState  = STATE_ERROR;
  stateEnteredMs = millis();
  Serial.print("$STATE:ERROR");
  Serial.print(",REASON=");
  Serial.println(reason);
}

// ============================================================
// HEATER
// ============================================================
void setHeater(bool on) {
  heaterState = on;
  digitalWrite(RELAY_HEATER, on ? HEATER_ON : HEATER_OFF);
  Serial.println(on ? "$HEATER:ON" : "$HEATER:OFF");
}

// Hysteresis thermal control
void updateThermalControl(float temp) {
  if (heaterState && temp >= TEMP_HEATER_OFF) {
    setHeater(false);
  } else if (!heaterState && temp < TEMP_HEATER_ON) {
    setHeater(true);
  }
}

// ============================================================
// SEND DATA — kirim paket data lengkap ke ESP32
// ============================================================
void sendData() {
  unsigned long elapsed   = 0;
  unsigned long remaining = 0;
  uint8_t       progress  = 0;   // 0–100%

  if (currentState == STATE_DRYING) {
    elapsed  = (millis() - dryingStartMs) / 1000UL;
    unsigned long totalSec = DRYING_DURATION / 1000UL;
    remaining = (elapsed < totalSec) ? (totalSec - elapsed) : 0;
    progress  = (uint8_t)((elapsed * 100UL) / totalSec);
    if (progress > 100) progress = 100;
  } else if (totalCycles > 0) {
    // Saat slicing: hitung dari siklus yang sedang/sudah dikerjakan
    // Gunakan currentCycle+1 saat FORWARD agar progress tidak stuck di 0%
    // saat siklus pertama baru dimulai
    unsigned long activeCycle = currentCycle;
    if (currentState == STATE_SLICING_FORWARD) activeCycle = currentCycle + 1;
    if (activeCycle > (unsigned long)totalCycles) activeCycle = totalCycles;
    progress = (uint8_t)((activeCycle * 100UL) / totalCycles);
  }

  unsigned long uptime = (millis() - processStartMs) / 1000UL;

  Serial.print("$DATA:STATE=");
  Serial.print(stateToStr(currentState));
  Serial.print(",TEMP=");
  Serial.print(lastTemp, 1);
  Serial.print(",HUM=");
  Serial.print(lastHum, 1);
  Serial.print(",HEATER=");
  Serial.print(heaterState ? "ON" : "OFF");
  Serial.print(",CYCLE=");
  Serial.print(currentCycle);
  Serial.print(",TOTAL=");
  Serial.print(totalCycles);
  Serial.print(",PROGRESS=");
  Serial.print(progress);
  Serial.print(",ELAPSED=");
  Serial.print(elapsed);
  Serial.print(",REMAIN=");
  Serial.print(remaining);
  Serial.print(",UPTIME=");
  Serial.println(uptime);
}

// ============================================================
// DHT21 — Baca dengan graceful retry
//
// Strategi:
//  - Gagal 1–2x : diam saja, coba lagi di interval berikutnya
//  - Gagal >= DHT_MAX_RETRY : kirim $DHT:WARN, kontrol heater
//    menggunakan lastTemp (nilai terakhir yang valid)
//  - Gagal terus selama DHT_FAIL_TIMEOUT (60 detik): baru ERROR
// ============================================================
void readDHT(bool reportData) {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (isnan(t) || isnan(h)) {
    dhtRetryCount++;

    // Catat kapan kegagalan pertama kali terjadi
    if (!dhtInFail) {
      dhtInFail      = true;
      dhtFirstFailMs = millis();
    }

    if (dhtRetryCount >= DHT_MAX_RETRY) {
      // Kirim peringatan ke ESP32
      Serial.print("$DHT:WARN,RETRY=");
      Serial.print(dhtRetryCount);
      Serial.print(",USING_LAST=");
      Serial.print(lastTemp, 1);
      Serial.println("C");

      // Tetap kontrol heater menggunakan nilai terakhir yang valid
      // Ini lebih aman daripada membiarkan heater tidak terkontrol
      if (lastTemp > 0.0f) {
        updateThermalControl(lastTemp);
      }
    }

    // ERROR hanya jika gagal terus-menerus selama DHT_FAIL_TIMEOUT
    if (dhtInFail && (millis() - dhtFirstFailMs >= DHT_FAIL_TIMEOUT)) {
      doEmergencyStop("DHT_TIMEOUT");
    }

    // Tetap kirim data dengan lastTemp jika diminta (agar dashboard tidak beku)
    if (reportData && lastTemp > 0.0f) {
      sendData();
    }
    return;
  }

  // Baca berhasil — reset semua flag error
  dhtRetryCount  = 0;
  dhtInFail      = false;
  dhtFirstFailMs = 0;
  lastTemp       = t;
  lastHum        = h;

  updateThermalControl(t);

  if (reportData) {
    sendData();
  }
}

// ============================================================
// STATE NAME
// ============================================================
const char* stateToStr(MachineState s) {
  switch (s) {
    case STATE_IDLE:            return "IDLE";
    case STATE_SERVO_OPENING:   return "SERVO_OPENING";
    case STATE_SLICING_FORWARD: return "SLICING_FORWARD";
    case STATE_SLICING_RETURN:  return "SLICING_RETURN";
    case STATE_SERVO_WAIT:      return "SERVO_WAIT";
    case STATE_SERVO_CLOSING:   return "SERVO_CLOSING";
    case STATE_DRYING:          return "DRYING";
    case STATE_FINISHED:        return "FINISHED";
    case STATE_ERROR:           return "ERROR";
    default:                    return "UNKNOWN";
  }
}

// ============================================================
// ENTER STATE
// ============================================================
void enterState(MachineState s) {
  currentState   = s;
  stateEnteredMs = millis();
  Serial.print("$STATE:");
  Serial.println(stateToStr(s));
}

// ============================================================
// STEPPER — Mulai maju (TB1 + TB2 ON)
// ============================================================
void startStepperForward() {
  digitalWrite(TB1_DIR, LOW);
  digitalWrite(TB2_DIR, HIGH);
  digitalWrite(TB1_ENA, LOW);
  digitalWrite(TB2_ENA, LOW);

  tb1PulHigh     = false;
  tb2PulHigh     = false;
  tb1LastUs      = micros();
  tb2LastUs      = micros();
  stepperStartMs = millis();
  stepperActive  = true;

  Serial.print("$CYCLE:");
  Serial.print(currentCycle + 1);
  Serial.print("/");
  Serial.println(totalCycles);
}

// ============================================================
// STEPPER — Mulai mundur (TB1 saja, TB2 OFF)
// ============================================================
void startStepperReturn() {
  digitalWrite(TB2_ENA, HIGH);
  digitalWrite(TB2_PUL, LOW);
  tb2PulHigh = false;

  digitalWrite(TB1_DIR, HIGH);
  digitalWrite(TB1_ENA, LOW);

  tb1PulHigh     = false;
  tb1LastUs      = micros();
  stepperStartMs = millis();
  stepperActive  = true;
}

// ============================================================
// STEPPER — Berhenti
// ============================================================
void stopStepper() {
  digitalWrite(TB1_ENA, HIGH);
  digitalWrite(TB2_ENA, HIGH);
  digitalWrite(TB1_PUL, LOW);
  digitalWrite(TB2_PUL, LOW);
  stepperActive = false;
  tb1PulHigh    = false;
  tb2PulHigh    = false;
}

// ============================================================
// STEPPER — Update pulse (dipanggil setiap loop)
// ============================================================
void updateStepper() {
  if (!stepperActive) return;

  unsigned long nowUs = micros();

  // TB1 pulse
  if (!tb1PulHigh) {
    if (nowUs - tb1LastUs >= (unsigned long)TB1_STEP_US) {
      digitalWrite(TB1_PUL, HIGH);
      tb1PulHigh = true;
      tb1LastUs  = nowUs;
    }
  } else {
    if (nowUs - tb1LastUs >= (unsigned long)TB1_STEP_US) {
      digitalWrite(TB1_PUL, LOW);
      tb1PulHigh = false;
      tb1LastUs  = nowUs;
    }
  }

  // TB2 pulse — hanya saat SLICING_FORWARD
  if (currentState == STATE_SLICING_FORWARD) {
    nowUs = micros();
    if (!tb2PulHigh) {
      if (nowUs - tb2LastUs >= (unsigned long)TB2_STEP_US) {
        digitalWrite(TB2_PUL, HIGH);
        tb2PulHigh = true;
        tb2LastUs  = nowUs;
      }
    } else {
      if (nowUs - tb2LastUs >= (unsigned long)TB2_STEP_US) {
        digitalWrite(TB2_PUL, LOW);
        tb2PulHigh = false;
        tb2LastUs  = nowUs;
      }
    }
  }

  // Cek durasi stroke habis
  if (millis() - stepperStartMs >= TB1_STROKE_MS) {
    stopStepper();

    if (currentState == STATE_SLICING_FORWARD) {
      enterState(STATE_SLICING_RETURN);
      startStepperReturn();

    } else if (currentState == STATE_SLICING_RETURN) {
      currentCycle++;

      if (currentCycle < totalCycles) {
        enterState(STATE_SLICING_FORWARD);
        startStepperForward();
      } else {
        enterState(STATE_SERVO_WAIT);
      }
    }
  }
}

// ============================================================
// UART — Baca perintah dari ESP32
// ============================================================
void readUART() {
  while (Serial.available()) {
    String raw = Serial.readStringUntil('\n');
    raw.trim();

    if (!raw.startsWith("$")) continue;
    String cmd = raw.substring(1);

    // ---- CYCLES ----
    if (cmd.startsWith("CYCLES:")) {
      if (currentState != STATE_IDLE) {
        Serial.println("$ERROR:BUSY"); return;
      }
      int val = cmd.substring(7).toInt();
      if (val > 0) {
        totalCycles = val;
        Serial.print("$ACK:CYCLES=");
        Serial.println(totalCycles);
      } else {
        Serial.println("$ERROR:CYCLES_INVALID");
      }
    }

    // ---- START ----
    else if (cmd == "START") {
      if (currentState != STATE_IDLE) {
        Serial.println("$ERROR:NOT_IDLE"); return;
      }
      if (totalCycles <= 0) {
        Serial.println("$ERROR:CYCLES_NOT_SET"); return;
      }

      currentCycle   = 0;
      dhtRetryCount  = 0;
      lastDHTRead    = millis() - DHT_READ_INTERVAL;
      processStartMs = millis();

      myServo.write(SERVO_OPEN_POS);
      Serial.println("$SERVO:OPEN");
      setHeater(true);

      enterState(STATE_SERVO_OPENING);
      Serial.println("$ACK:START");
    }

    // ---- STOP (Emergency via UART) ----
    else if (cmd == "STOP") {
      doEmergencyStop("UART_STOP");
      // Override ke IDLE agar bisa START lagi tanpa RESET
      currentState   = STATE_IDLE;
      dhtInFail      = false;
      dhtFirstFailMs = 0;
      Serial.println("$STATE:IDLE");
      Serial.println("$ACK:STOP");
    }

    // ---- RESET ----
    else if (cmd == "RESET") {
      if (currentState == STATE_FINISHED || currentState == STATE_ERROR) {
        totalCycles    = 0;
        currentCycle   = 0;
        dhtRetryCount  = 0;
        dhtInFail      = false;
        dhtFirstFailMs = 0;
        enterState(STATE_IDLE);
        Serial.println("$ACK:RESET");
      } else {
        Serial.println("$ERROR:RESET_NOT_ALLOWED");
      }
    }

    // ---- STATUS ----
    else if (cmd == "STATUS") {
      sendData();
    }
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(9600);

  // Stepper & relay pins
  pinMode(TB1_ENA, OUTPUT); pinMode(TB1_DIR, OUTPUT); pinMode(TB1_PUL, OUTPUT);
  pinMode(TB2_ENA, OUTPUT); pinMode(TB2_DIR, OUTPUT); pinMode(TB2_PUL, OUTPUT);
  pinMode(RELAY_HEATER, OUTPUT);

  // Emergency Stop pin — INPUT_PULLUP, tekan = LOW
  pinMode(ESTOP_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ESTOP_PIN), ESTOP_ISR, FALLING);

  // Kondisi awal: semua mati
  digitalWrite(TB1_ENA,      HIGH);
  digitalWrite(TB2_ENA,      HIGH);
  digitalWrite(TB1_PUL,      LOW);
  digitalWrite(TB2_PUL,      LOW);
  digitalWrite(RELAY_HEATER, HEATER_OFF);

  myServo.attach(SERVO_PIN);
  myServo.write(SERVO_CLOSE_POS);

  dht.begin();
  delay(2000);   // DHT21 warm-up wajib

  enterState(STATE_IDLE);
  Serial.println("$READY");
}

// ============================================================
// LOOP
// ============================================================
void loop() {

  // --- Cek Emergency Stop tombol fisik ---
  if (eStopTriggered) {
    // Hanya aktif jika mesin sedang berjalan
    if (currentState != STATE_IDLE   &&
        currentState != STATE_FINISHED &&
        currentState != STATE_ERROR) {
      doEmergencyStop("BUTTON_ESTOP");
    } else {
      eStopTriggered = false;
    }
  }

  readUART();
  updateStepper();

  unsigned long now = millis();

  // ---- STATE_SERVO_OPENING ----
  if (currentState == STATE_SERVO_OPENING) {
    if (now - stateEnteredMs >= SERVO_OPEN_DELAY) {
      enterState(STATE_SLICING_FORWARD);
      startStepperForward();
    }
    return;
  }

  // ---- STATE_SLICING_FORWARD / STATE_SLICING_RETURN ----
  // updateStepper() handle transisi. Kita tambah monitoring DHT.
  if (currentState == STATE_SLICING_FORWARD ||
      currentState == STATE_SLICING_RETURN) {

    if (now - lastDHTRead >= DHT_READ_INTERVAL) {
      lastDHTRead = now;
      readDHT(true);   // Kirim $DATA saat slicing juga
    }
    return;
  }

  // ---- STATE_SERVO_WAIT ----
  if (currentState == STATE_SERVO_WAIT) {
    if (now - lastDHTRead >= DHT_READ_INTERVAL) {
      lastDHTRead = now;
      readDHT(true);
    }
    if (now - stateEnteredMs >= SERVO_WAIT_DURATION) {
      enterState(STATE_SERVO_CLOSING);
      myServo.write(SERVO_CLOSE_POS);
      Serial.println("$SERVO:CLOSE");
    }
    return;
  }

  // ---- STATE_SERVO_CLOSING ----
  if (currentState == STATE_SERVO_CLOSING) {
    if (now - stateEnteredMs >= SERVO_CLOSE_WAIT) {
      dryingStartMs = millis();
      lastDHTRead   = millis() - DHT_READ_INTERVAL;
      enterState(STATE_DRYING);
    }
    return;
  }

  // ---- STATE_DRYING ----
  if (currentState == STATE_DRYING) {
    if (now - lastDHTRead >= DHT_READ_INTERVAL) {
      lastDHTRead = now;
      readDHT(true);
    }
    if (now - dryingStartMs >= DRYING_DURATION) {
      setHeater(false);
      enterState(STATE_FINISHED);
      Serial.println("$PROCESS:COMPLETE");
    }
    return;
  }

  // ---- STATE_FINISHED ----
  if (currentState == STATE_FINISHED) {
    return;
  }

  // ---- STATE_ERROR ----
  if (currentState == STATE_ERROR) {
    // Pastikan semua aktuator mati (guard tambahan)
    if (stepperActive) stopStepper();
    if (heaterState)   setHeater(false);
    return;
  }
}