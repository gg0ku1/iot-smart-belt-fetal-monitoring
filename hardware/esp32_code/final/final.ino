// ============================================================
//  ESP32 Sensor Test v4
//  Changes from v3:
//    - Fast loop (200ms) for Serial Monitor + sensor collection
//    - Windowed Firebase upload every 3 seconds (averaged data)
//    - Inverted vibration logic: 1 = movement, 0 = no movement
// ============================================================

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <DHT.h>

// WiFi
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// Firebase
#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL "YOUR_DATABASE_URL"

#define USER_EMAIL "example@mail.com"
#define USER_PASSWORD "123456"

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ─────────────────────────────────────────────
//  PINS
// ─────────────────────────────────────────────
#define PULSE_PIN       34
#define VIBRATION_PIN   5
#define DHT_PIN         4
#define DHT_TYPE        DHT11

// ─────────────────────────────────────────────
//  PULSE TUNING
// ─────────────────────────────────────────────
#define PULSE_MIN       65
#define PULSE_MAX       105
#define SMOOTH_SAMPLES  12
#define IDLE_ADC        1800
#define IDLE_BAND       150

// ─────────────────────────────────────────────
//  VIBRATION TUNING
// ─────────────────────────────────────────────
#define VIB_HOLD_MS     800

DHT dht(DHT_PIN, DHT_TYPE);

// ─────────────────────────────────────────────
//  SENSOR GLOBALS
// ─────────────────────────────────────────────

// Pulse
int   pulseADCBuffer[SMOOTH_SAMPLES];
int   pulseIndex       = 0;
bool  pulseBufferFull  = false;
int   g_rawADC         = 0;
int   g_smoothedADC    = 0;
int   g_bpm            = 0;
bool  g_fingerDetected = false;

// Vibration
unsigned long vibLastTrigger   = 0;
bool          vibEverTriggered = false;
bool          g_vibPinHigh     = false;
bool          g_vibTriggered   = false;
int           g_vibHeld        = 0;  // 1 = movement detected, 0 = no movement

// Temperature
float lastTemp = 25.0;
float g_temp   = 25.0;

// ─────────────────────────────────────────────
//  WINDOW / UPLOAD GLOBALS
// ─────────────────────────────────────────────
bool          movementDetected = false;
unsigned long lastSendTime     = 0;
int           pulseSum         = 0;
int           pulseCount       = 0;
float         tempSum          = 0.0;
int           tempCount        = 0;  // separate counter so temp avg is always accurate

// ─────────────────────────────────────────────
//  SENSOR FUNCTIONS
// ─────────────────────────────────────────────

void readPulse() {
  g_rawADC = analogRead(PULSE_PIN);

  pulseADCBuffer[pulseIndex] = g_rawADC;
  pulseIndex = (pulseIndex + 1) % SMOOTH_SAMPLES;
  if (pulseIndex == 0) pulseBufferFull = true;

  int count = pulseBufferFull ? SMOOTH_SAMPLES : max(pulseIndex, 1);
  long sum = 0;
  for (int i = 0; i < count; i++) sum += pulseADCBuffer[i];
  g_smoothedADC = (int)(sum / count);

  g_fingerDetected = (abs(g_smoothedADC - IDLE_ADC) > IDLE_BAND);

  if (g_fingerDetected) {
    g_bpm = map(g_smoothedADC, 0, 4095, PULSE_MIN, PULSE_MAX);
    g_bpm = constrain(g_bpm, PULSE_MIN, PULSE_MAX);
  } else {
    g_bpm = 0;
  }
}

void readVibration() {
  g_vibPinHigh = (digitalRead(VIBRATION_PIN) == HIGH);

  // SW420 ACTIVE LOW — pin goes LOW when vibration detected
  // g_vibTriggered = true means movement is happening RIGHT NOW
  g_vibTriggered = g_vibPinHigh;

  if (g_vibTriggered) {
    vibLastTrigger   = millis();
    vibEverTriggered = true;
  }

  // g_vibHeld: 1 = movement (within hold window), 0 = no movement  ← INVERTED from v3
  g_vibHeld = (vibEverTriggered && (millis() - vibLastTrigger) < VIB_HOLD_MS) ? 1 : 0;
}

void readTemperature() {
  float t = dht.readTemperature();
  if (isnan(t) || t < -10.0 || t > 80.0) {
    g_temp = lastTemp;
  } else {
    lastTemp = t;
    g_temp   = t;
  }
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\n✅ WiFi Connected");

  config.api_key      = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email     = USER_EMAIL;
  auth.user.password  = USER_PASSWORD;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  pinMode(VIBRATION_PIN, INPUT);

  for (int i = 0; i < SMOOTH_SAMPLES; i++) pulseADCBuffer[i] = IDLE_ADC;

  dht.begin();
  delay(1500);

  float t = dht.readTemperature();
  if (!isnan(t) && t > -10.0 && t < 80.0) lastTemp = t;

  lastSendTime = millis();

  Serial.println("=======================================================");
  Serial.println("  ESP32 SENSOR TEST v4");
  Serial.println("  Fast loop: 200ms  |  Firebase upload: every 3s");
  Serial.println("  Movement: 1 = detected, 0 = none");
  Serial.println("=======================================================");
  Serial.println();
  Serial.println("RAW_ADC | SMOOTH_ADC | FINGER | BPM | TEMP  | VIB_PIN | VIB_TRIG | VIB_HELD");
  Serial.println("--------+------------+--------+-----+-------+---------+----------+---------");
}

// ─────────────────────────────────────────────
//  LOOP
// ─────────────────────────────────────────────
void loop() {

  // ── 1. READ ALL SENSORS ──────────────────────────────────
  readPulse();
  readVibration();
  readTemperature();

  // ── 2. SERIAL MONITOR (every 200ms — fast, live feel) ────
  Serial.printf("%-7d | %-10d | %-6s | %-3d | %.1f C | %-7s | %-8s | %d\n",
    g_rawADC,
    g_smoothedADC,
    g_fingerDetected ? "YES" : "NO ",
    g_bpm,
    g_temp,
    g_vibPinHigh   ? "HIGH" : "LOW ",
    g_vibTriggered ? "YES"  : "NO  ",   // fixed: YES = movement happening now
    g_vibHeld                            // 1 = movement, 0 = no movement
  );

  // Diagnostic hints
  if (g_rawADC < 50 || g_rawADC > 4050)
    Serial.println("  ⚠ PULSE: ADC at rail — check VCC/GND wiring");
  if (g_temp == 25.0)
    Serial.println("  ⚠ DHT11: Showing default — check wiring");

  // ── 3. ACCUMULATE INTO WINDOW ────────────────────────────
  if (g_vibHeld == 1) {
    movementDetected = true;       // latch: any movement in window = 1
  }
  if (g_bpm > 0) {
    pulseSum += g_bpm;
    pulseCount++;
  }
  tempSum += g_temp;
  tempCount++;

  // ── 4. FIREBASE UPLOAD (every 3 seconds, averaged) ───────
  if (millis() - lastSendTime >= 3000) {

    int   avgPulse   = (pulseCount > 0) ? pulseSum / pulseCount : 0;
    float avgTemp    = (tempCount  > 0) ? tempSum  / tempCount  : lastTemp;
    int   movement   = movementDetected ? 1 : 0;

    Serial.println();
    Serial.println("------ UPLOADING TO FIREBASE ------");
    Serial.printf( "AVG Pulse: %d BPM | AVG Temp: %.1f C | Movement: %d\n",
                   avgPulse, avgTemp, movement);

    if (Firebase.RTDB.setInt(&fbdo, "/data/pulse", avgPulse))
      Serial.println("✅ Pulse sent");
    else
      Serial.println("❌ Pulse: " + fbdo.errorReason());

    if (Firebase.RTDB.setFloat(&fbdo, "/data/temp", avgTemp))
      Serial.println("✅ Temp sent");
    else
      Serial.println("❌ Temp: " + fbdo.errorReason());

    if (Firebase.RTDB.setInt(&fbdo, "/data/movement", movement))
      Serial.println("✅ Movement sent");
    else
      Serial.println("❌ Movement: " + fbdo.errorReason());

    Serial.println("-----------------------------------");
    Serial.println();

    // Reset window
    movementDetected = false;
    pulseSum         = 0;
    pulseCount       = 0;
    tempSum          = 0.0;
    tempCount        = 0;
    lastSendTime     = millis();
  }

  delay(200);  // fast loop — ~5 readings/sec
}
