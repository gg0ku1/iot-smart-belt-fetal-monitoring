/* =========================================================
   VITALIS MONITOR — IoT Smart Belt Dashboard
   app.js — Core Application Logic
   =========================================================
   Architecture:
   1. Firebase Realtime DB listener  → onValue()
   2. ML Classification Engine       → predict()
   3. UI Update Layer                → updateUI()
   4. Chart.js Graphs                → updateCharts()
   5. Alert System                   → pushAlert()
   6. Demo Mode (simulated data)     → demoTick()
   ========================================================= */

'use strict';

// ─────────────────────────────────────────────────────────
//  ★ STEP 1: PASTE YOUR FIREBASE CONFIG HERE
//  Get this from: Firebase Console → Project Settings → SDK
// ─────────────────────────────────────────────────────────
const FIREBASE_DEFAULT_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ─────────────────────────────────────────────────────────
//  ★ STEP 2: SET YOUR FIREBASE DATABASE URL HERE
//  This is the only field you MUST change for real data.
//  Format: https://<your-project>-default-rtdb.firebaseio.com
// ─────────────────────────────────────────────────────────
const MY_FIREBASE_URL = ""; // ← PASTE URL HERE, or leave blank for demo

// ─────────────────────────────────────────────────────────
//  ★ STEP 3: SET STARTUP MODE
//  'demo'     → simulated data (no hardware needed)
//  'firebase' → reads from real Firebase (needs URL above)
// ─────────────────────────────────────────────────────────
const STARTUP_MODE = MY_FIREBASE_URL ? 'firebase' : 'demo';

// Firebase data path
const DATA_PATH = "/data";   // expects: /data/pulse, /data/temp, /data/movement

// ─────────────────────────────────────────────────────────
//  ML CLASSIFICATION THRESHOLDS
// ─────────────────────────────────────────────────────────
const ML = {
  isNormal(pulse, temp, movement) {
    return pulse < 100 && movement > 0;
  },
  isSuspect(pulse, temp, movement) {
    return pulse > 120 && movement === 0;
  },
  isPathological(pulse, temp, movement) {
    return pulse > 140 && temp > 37.5;
  },
  predict(pulse, temp, movement) {
    if (this.isPathological(pulse, temp, movement)) return 'PATHOLOGICAL';
    if (this.isSuspect(pulse, temp, movement))      return 'SUSPECT';
    if (this.isNormal(pulse, temp, movement))       return 'NORMAL';
    // Edge cases — elevated pulse or temp but not meeting full criteria
    if (pulse > 140)  return 'PATHOLOGICAL';
    if (pulse > 120)  return 'SUSPECT';
    if (temp > 37.5)  return 'SUSPECT';
    return 'NORMAL';
  },
  confidence(pulse, temp, movement, status) {
    if (status === 'PATHOLOGICAL') {
      const margin = (pulse - 140) / 20;
      return Math.min(99, 80 + Math.round(margin * 19)) + '%';
    }
    if (status === 'SUSPECT') {
      return '74%';
    }
    // NORMAL
    const margin = (100 - pulse) / 100;
    return Math.min(99, 85 + Math.round(margin * 14)) + '%';
  }
};

// ─────────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────────
const state = {
  pulse:    null,
  temp:     null,
  movement: null,
  status:   null,
  prevStatus: null,
  connected: false,
  demoMode: false,
  alertCount: 0,
  sessionStart: Date.now(),

  // History arrays for charts (max 60 points)
  history: {
    pulse:    [],
    temp:     [],
    movement: [],
    labels:   [],
    maxPoints: 60
  }
};

// ─────────────────────────────────────────────────────────
//  CHART INSTANCES
// ─────────────────────────────────────────────────────────
let pulseChart, tempChart, moveChart, pulseMiniChart;

// ─────────────────────────────────────────────────────────
//  DEMO MODE SIMULATION
// ─────────────────────────────────────────────────────────
const Demo = {
  _interval: null,
  _tick: 0,
  _scenario: 'normal',   // 'normal' | 'suspect' | 'pathological' | 'cycle'
  _scenarioStep: 0,

  // Scenario cycle: normal → suspect → normal → pathological → normal
  _scenarios: ['normal', 'normal', 'normal', 'suspect', 'normal', 'pathological', 'normal'],

  generate() {
    this._tick++;
    // Advance scenario every ~30 ticks (30s in demo)
    if (this._tick % 30 === 0) {
      this._scenarioStep = (this._scenarioStep + 1) % this._scenarios.length;
      this._scenario = this._scenarios[this._scenarioStep];
    }

    let pulse, temp, movement;
    const t = this._tick;
    const wave = Math.sin(t * 0.3) * 3; // gentle oscillation

    switch (this._scenario) {
      case 'normal':
        pulse    = Math.round(72 + wave + Math.random() * 4);
        temp     = parseFloat((36.5 + Math.sin(t * 0.1) * 0.2).toFixed(1));
        movement = Math.random() > 0.15 ? Math.round(60 + Math.random() * 40) : 0;
        break;
      case 'suspect':
        pulse    = Math.round(128 + wave + Math.random() * 6);
        temp     = parseFloat((37.0 + Math.random() * 0.3).toFixed(1));
        movement = 0;  // no movement → suspect
        break;
      case 'pathological':
        pulse    = Math.round(148 + Math.random() * 10);
        temp     = parseFloat((38.1 + Math.random() * 0.4).toFixed(1));
        movement = Math.round(20 + Math.random() * 15);
        break;
      default:
        pulse = 76; temp = 36.5; movement = 80;
    }

    return { pulse, temp, movement };
  },

  start() {
    if (this._interval) clearInterval(this._interval);
    this._tick = 0;
    this._scenarioStep = 0;
    this._scenario = 'normal';
    this._interval = setInterval(() => {
      const data = this.generate();
      onDataReceived(data.pulse, data.temp, data.movement);
    }, 1000);
    showToast('📡 Demo Mode active — simulating ESP32 sensor data', 'info');
    updateModeIndicator('demo');
  },

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }
};

// ─────────────────────────────────────────────────────────
//  SIMULATION CONTROL — Manual scenario injection
//  Called by NORMAL / SUSPECT / PATHOLOGICAL buttons
// ─────────────────────────────────────────────────────────
const SIM_SCENARIOS = {
  NORMAL:       { pulse: 85,  temp: 36.5, movement: 1, status: 'NORMAL' },
  SUSPECT:      { pulse: 125, temp: 37.0, movement: 0, status: 'SUSPECT' },
  PATHOLOGICAL: { pulse: 150, temp: 38.0, movement: 0, status: 'PATHOLOGICAL' }
};

function simulateScenario(scenarioName, silent = false) {
  const scenario = SIM_SCENARIOS[scenarioName];
  if (!scenario) return;

  // Pause the auto-cycling demo ticker so it doesn't override immediately
  if (Demo._interval) {
    Demo.stop();
    // We keep state.demoMode = true so the UI still shows DEMO mode label
  }

  const { pulse, temp, movement } = scenario;

  // ── 1. Push to Firebase if a real connection is active ──
  if (state.firebaseActive && window._firebaseLoaded && window._vitalisDB) {
    try {
      const { ref, set } = window._firebaseLoaded;
      const dataRef = ref(window._vitalisDB, DATA_PATH);
      set(dataRef, { pulse, temp, movement, status: scenarioName, simulated: true, ts: Date.now() })
        .catch(err => console.warn('Firebase write failed:', err));
    } catch (e) { /* silent fail — UI still updates locally */ }
  }

  // ── 2. Immediately update the UI (works even without Firebase) ──
  onDataReceived(pulse, temp, movement);

  // ── 3. Log the simulated event to the Event Log ──
  if (!silent) {
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const logMessages = {
      NORMAL:       `[${timeStr}] NORMAL — Simulated: HR ${pulse} BPM, Temp ${temp}°C`,
      SUSPECT:      `[${timeStr}] SUSPECT — Simulated: HR ${pulse} BPM, Temp ${temp}°C, No movement`,
      PATHOLOGICAL: `[${timeStr}] PATHOLOGICAL — Simulated: HR ${pulse} BPM, Temp ${temp}°C (CRITICAL)`
    };
    const logTypes = { NORMAL: 'info', SUSPECT: 'warn', PATHOLOGICAL: 'patho' };
    pushAlert(logTypes[scenarioName], logMessages[scenarioName]);
  }

  // ── 4. Highlight the active simulation button ──
  document.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('sim-btn-active'));
  const activeBtn = document.getElementById('sim-btn-' + scenarioName.toLowerCase());
  if (activeBtn) activeBtn.classList.add('sim-btn-active');

  if (!silent) {
    showToast(`▶ Simulation: ${scenarioName} injected`, scenarioName === 'NORMAL' ? 'info' : scenarioName === 'SUSPECT' ? 'warn' : 'error');
  }
}

// ─────────────────────────────────────────────────────────
//  MODE SWITCHER — Toggle Demo ↔ Firebase at runtime
// ─────────────────────────────────────────────────────────
function switchToDemo() {
  // Stop any Firebase listener (we can't unsubscribe easily, so we just
  // stop pushing data by overriding the active flag)
  state.firebaseActive = false;
  state.demoMode = true;
  Demo.start();
  closeModePanel();
  pushAlert('info', 'Switched to Demo Mode — simulated data active.');
}

function switchToFirebase() {
  const urlInput = document.getElementById('mode-firebase-url');
  const url = urlInput ? urlInput.value.trim() : '';
  if (!url) {
    showToast('Please enter a valid Firebase URL', 'warn');
    return;
  }
  Demo.stop();
  state.demoMode = false;
  connectFirebaseRuntime(url);
  closeModePanel();
}

function connectFirebaseRuntime(url) {
  const config = { ...FIREBASE_DEFAULT_CONFIG, databaseURL: url };
  const onReady = () => {
    try {
      const { initializeApp, getDatabase, ref, onValue } = window._firebaseLoaded;
      const app = initializeApp(config, 'vitalis-rt-' + Date.now());
      const db  = getDatabase(app);
      window._vitalisDB = db; // expose for simulateScenario writes
      const dataRef = ref(db, DATA_PATH);
      state.firebaseActive = true;
      onValue(dataRef, (snapshot) => {
        if (!state.firebaseActive) return; // guard for when we switch back to demo
        const val = snapshot.val();
        if (val) {
          const pulse    = Number(val.pulse    || val.heartRate    || 0);
          const temp     = Number(val.temp     || val.temperature  || 0);
          const movement = Number(val.movement || val.accel        || 0);
          onDataReceived(pulse, temp, movement);
        }
      }, (err) => {
        setConnectionStatus(false);
        showToast('Firebase error: ' + err.message, 'error');
      });
      setConnectionStatus(true);
      updateModeIndicator('firebase');
      pushAlert('info', 'Connected to Firebase: ' + url);
      showToast('🔥 Firebase connected — live data active!', 'info');
    } catch(e) {
      showToast('Firebase init failed: ' + e.message, 'error');
    }
  };
  if (window._firebaseLoaded) onReady();
  else window.addEventListener('firebase-ready', onReady, { once: true });
}

function updateModeIndicator(mode) {
  const indicator = document.getElementById('mode-indicator');
  const modeText  = document.getElementById('mode-text');
  if (!indicator) return;
  if (mode === 'demo') {
    indicator.style.background = 'rgba(255,185,95,0.12)';
    indicator.style.borderColor = 'rgba(255,185,95,0.3)';
    indicator.style.color = '#ffb95f';
    if (modeText) modeText.textContent = 'Mode: DEMO (Simulated Data)';
  } else {
    indicator.style.background = 'rgba(78,222,163,0.10)';
    indicator.style.borderColor = 'rgba(78,222,163,0.3)';
    indicator.style.color = '#4edea3';
    if (modeText) modeText.textContent = 'Mode: LIVE (ESP32 Connected)';
  }
}

function openModePanel() {
  const panel = document.getElementById('mode-panel');
  if (panel) panel.classList.add('show');
}

function closeModePanel() {
  const panel = document.getElementById('mode-panel');
  if (panel) panel.classList.remove('show');
}

// ─────────────────────────────────────────────────────────
//  FIREBASE INTEGRATION
// ─────────────────────────────────────────────────────────
function connectFirebase(customUrl) {
  const urlInput = document.getElementById('firebase-url');
  const fbUrl    = customUrl || (urlInput && urlInput.value.trim()) || FIREBASE_DEFAULT_CONFIG.databaseURL;

  if (!fbUrl || fbUrl === FIREBASE_DEFAULT_CONFIG.databaseURL) {
    showToast('No Firebase URL provided — starting demo mode', 'warn');
    startDemoMode();
    return;
  }

  const config = { ...FIREBASE_DEFAULT_CONFIG, databaseURL: fbUrl };

  const onReady = () => {
    try {
      const { initializeApp, getDatabase, ref, onValue } = window._firebaseLoaded;
      const app = initializeApp(config, 'vitalis-' + Date.now());
      const db  = getDatabase(app);

      // Listen for data at /data node
      const dataRef = ref(db, DATA_PATH);
      onValue(dataRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          const pulse    = Number(val.pulse    || val.heartRate || 0);
          const temp     = Number(val.temp     || val.temperature || 0);
          const movement = Number(val.movement || val.accel || 0);
          onDataReceived(pulse, temp, movement);
        }
      }, (err) => {
        console.error('Firebase error:', err);
        setConnectionStatus(false);
        showToast('Firebase connection error — check URL or rules', 'error');
      });

      setConnectionStatus(true);
      if (typeof updateLandingStatus === 'function') {
        updateLandingStatus('System Status: Live  |  ESP32 Connected via Firebase', true);
      }
      hideDemoOverlay();
      showToast('Firebase connected ✓', 'info');
    } catch (e) {
      console.error('Firebase init error:', e);
      showToast('Firebase init failed — ' + e.message, 'error');
    }
  };

  if (window._firebaseLoaded) {
    onReady();
  } else {
    window.addEventListener('firebase-ready', onReady, { once: true });
  }
}

// ─────────────────────────────────────────────────────────
//  CORE DATA HANDLER — Called on every sensor update
// ─────────────────────────────────────────────────────────
function onDataReceived(pulse, temp, movement) {
  state.pulse    = pulse;
  state.temp     = temp;
  state.movement = movement;

  // Run ML classification
  const status = ML.predict(pulse, temp, movement);
  state.prevStatus = state.status;
  state.status     = status;

  // Store history
  addToHistory(pulse, temp, movement);

  // Update all UI
  updateStatusBanner(status, pulse, temp, movement);
  updateVitalCards(pulse, temp, movement, status);
  updateCharts();
  updateMLPanel(pulse, temp, movement, status);
  updateTimestamp();

  // Auto-alerts on status change
  if (status !== state.prevStatus && state.prevStatus !== null) {
    onStatusChange(status, pulse, temp, movement);
  }
}

// ─────────────────────────────────────────────────────────
//  HISTORY (for charts)
// ─────────────────────────────────────────────────────────
function addToHistory(pulse, temp, movement) {
  const H    = state.history;
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  H.pulse.push(pulse);
  H.temp.push(temp);
  H.movement.push(movement);
  H.labels.push(time);

  // Keep max points
  if (H.pulse.length > H.maxPoints) {
    H.pulse.shift();
    H.temp.shift();
    H.movement.shift();
    H.labels.shift();
  }
}

// ─────────────────────────────────────────────────────────
//  STATUS BANNER UPDATE
// ─────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  NORMAL: {
    cls:   'normal',
    icon:  'check_circle',
    label: 'STATUS: NORMAL \u2705',
    desc:  'All vital parameters are within safe limits. No abnormalities detected.',
    color: '#4edea3'
  },
  SUSPECT: {
    cls:   'suspect',
    icon:  'warning',
    label: 'STATUS: SUSPECT \u26a0\ufe0f',
    desc:  'Irregular patterns detected. Elevated readings observed. Clinical observation strongly recommended.',
    color: '#ffb95f'
  },
  PATHOLOGICAL: {
    cls:   'pathological',
    icon:  'report_gmailerrorred',
    label: 'STATUS: PATHOLOGICAL \ud83d\udea8',
    desc:  'CRITICAL \u2014 Fetal distress detected. Immediate medical intervention required. Alert dispatched.',
    color: '#ff6b6b'
  }
};

function updateStatusBanner(status) {
  const cfg    = STATUS_CONFIG[status];
  const banner = document.getElementById('status-banner');
  const icon   = document.getElementById('status-icon');
  const iconW  = document.getElementById('status-icon-wrap');
  const label  = document.getElementById('status-label');
  const desc   = document.getElementById('status-desc');

  // Remove all state classes
  banner.classList.remove('normal', 'suspect', 'pathological');
  icon.classList.remove('normal', 'suspect', 'pathological');
  iconW.classList.remove('normal', 'suspect', 'pathological');
  label.classList.remove('normal', 'suspect', 'pathological');

  // Apply new class
  banner.classList.add(cfg.cls);
  icon.classList.add(cfg.cls);
  iconW.classList.add(cfg.cls);
  label.classList.add(cfg.cls);

  icon.textContent  = cfg.icon;
  label.textContent = cfg.label;
  desc.textContent  = cfg.desc;

  // Emergency button glow on critical
  const emergencyBtn = document.getElementById('btn-call-emergency');
  if (status === 'PATHOLOGICAL') {
    emergencyBtn.classList.add('pulsing');
    document.getElementById('notif-dot').classList.add('show');
  } else {
    emergencyBtn.classList.remove('pulsing');
  }
}

// ─────────────────────────────────────────────────────────
//  VITAL CARDS UPDATE
// ─────────────────────────────────────────────────────────
function updateVitalCards(pulse, temp, movement, status) {
  // ---- Pulse Card ----
  const pulseVal   = document.getElementById('pulse-value');
  const pulseBadge = document.getElementById('pulse-badge');
  const pulseCard  = document.getElementById('pulse-card');

  pulseVal.textContent = pulse;

  if (status === 'PATHOLOGICAL' || pulse > 140) {
    pulseVal.style.color = '#ff6b6b';
    setBadge(pulseBadge, 'critical', '↑', 'CRITICAL');
    pulseCard.classList.add('alert-card');
    pulseCard.classList.remove('warn-card');
  } else if (status === 'SUSPECT' || pulse > 120) {
    pulseVal.style.color = '#ffb95f';
    setBadge(pulseBadge, 'warn', '↑', 'Elevated');
    pulseCard.classList.add('warn-card');
    pulseCard.classList.remove('alert-card');
  } else {
    pulseVal.style.color = '#4edea3';
    setBadge(pulseBadge, 'normal', '↗', 'Normal');
    pulseCard.classList.remove('alert-card', 'warn-card');
  }
  updateMiniChart(pulse);

  // ---- Temp Card ----
  const tempVal   = document.getElementById('temp-value');
  const tempBadge = document.getElementById('temp-badge');
  const tempBar   = document.getElementById('temp-bar');
  const tempCard  = document.getElementById('temp-card');

  tempVal.textContent = temp.toFixed(1);

  // Map 35–40°C to bar width 0–100%
  const tempPct = Math.max(0, Math.min(100, ((temp - 35) / 5) * 100));
  tempBar.style.width = tempPct + '%';

  if (temp > 37.5) {
    tempVal.style.color = '#ff6b6b';
    tempBar.classList.add('hot');
    setBadge(tempBadge, 'critical', '↑', 'HIGH FEVER');
    tempCard.classList.add('alert-card');
    tempCard.classList.remove('warn-card');
  } else if (temp > 37.0) {
    tempVal.style.color = '#ffb95f';
    tempBar.classList.remove('hot');
    setBadge(tempBadge, 'warn', '↑', 'Elevated');
    tempCard.classList.add('warn-card');
    tempCard.classList.remove('alert-card');
  } else {
    tempVal.style.color = '#e8eeff';
    tempBar.classList.remove('hot');
    setBadge(tempBadge, 'normal', '—', 'Stable');
    tempCard.classList.remove('alert-card', 'warn-card');
  }

  // ---- Movement Card ----
  const moveVal   = document.getElementById('move-value');
  const moveBadge = document.getElementById('move-badge');
  const moveCard  = document.getElementById('move-card');
  const moveDots  = document.getElementById('movement-dots');
  const dots      = moveDots.querySelectorAll('.m-dot');

  if (movement > 0) {
    moveVal.textContent = 'Active';
    moveVal.style.color = '#4edea3';
    setBadge(moveBadge, 'normal', '▲', 'Detected');
    moveCard.classList.remove('alert-card', 'warn-card');
    // Activate dots proportional to movement intensity
    const activeDots = Math.round((movement / 100) * dots.length);
    dots.forEach((d, i) => {
      d.classList.toggle('active', i < Math.max(1, activeDots));
    });
  } else {
    moveVal.textContent = 'None';
    moveVal.style.color = '#ff6b6b';
    setBadge(moveBadge, 'critical', '!', 'No Movement');
    moveCard.classList.add('alert-card');
    dots.forEach(d => d.classList.remove('active'));
  }

  // ---- Stats Card ----
  document.getElementById('stat-alerts').textContent = state.alertCount;
}

function setBadge(el, type, icon, text) {
  el.className = 'vital-badge ' + type;
  el.innerHTML = `<span style="font-size:12px">${icon}</span> ${text}`;
}

// ─────────────────────────────────────────────────────────
//  CHART.JS SETUP
// ─────────────────────────────────────────────────────────
function initCharts() {
  Chart.defaults.color          = '#5a6480';
  Chart.defaults.borderColor    = 'rgba(255,255,255,0.04)';
  Chart.defaults.font.family    = 'Inter';

  const sharedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: { legend: { display: false }, tooltip: { enabled: true, callbacks: {} } },
    scales: {
      x: {
        display: true,
        ticks: {
          color: '#5a6480',
          font: { size: 9 },
          maxTicksLimit: 8,
          maxRotation: 0
        },
        grid: { color: 'rgba(255,255,255,0.03)' }
      },
      y: {
        display: true,
        ticks: { color: '#5a6480', font: { size: 9 } },
        grid: { color: 'rgba(255,255,255,0.04)' }
      }
    },
    elements: {
      line: { tension: 0.4, borderWidth: 2 },
      point: { radius: 0, hoverRadius: 4 }
    }
  };

  // Pulse Chart
  pulseChart = new Chart(document.getElementById('pulse-chart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'BPM',
        data: [],
        borderColor: '#4edea3',
        backgroundColor: createGradient('pulse-chart', '#4edea3'),
        fill: true
      }]
    },
    options: {
      ...sharedOptions,
      scales: {
        ...sharedOptions.scales,
        y: {
          ...sharedOptions.scales.y,
          min: 50, max: 200,
          ticks: { ...sharedOptions.scales.y.ticks, stepSize: 30 }
        }
      }
    }
  });

  // Temp Chart
  tempChart = new Chart(document.getElementById('temp-chart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '°C',
        data: [],
        borderColor: '#ffb95f',
        backgroundColor: createGradient('temp-chart', '#ffb95f'),
        fill: true
      }]
    },
    options: {
      ...sharedOptions,
      scales: {
        ...sharedOptions.scales,
        y: {
          ...sharedOptions.scales.y,
          min: 35, max: 41,
          ticks: { ...sharedOptions.scales.y.ticks, stepSize: 1 }
        }
      }
    }
  });

  // Movement Chart (bar)
  moveChart = new Chart(document.getElementById('move-chart'), {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Movement',
        data: [],
        backgroundColor: [],
        borderRadius: 3,
        borderSkipped: false
      }]
    },
    options: {
      ...sharedOptions,
      scales: {
        ...sharedOptions.scales,
        y: { ...sharedOptions.scales.y, min: 0, max: 120 }
      }
    }
  });

  // Mini Pulse Chart on card
  pulseMiniChart = new Chart(document.getElementById('pulse-mini-chart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        borderColor: '#4edea3',
        backgroundColor: 'rgba(78,222,163,0.15)',
        fill: true,
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { tension: 0.4 }, point: { radius: 0 } },
      animation: { duration: 200 }
    }
  });
}

function createGradient(canvasId, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return 'transparent';
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 120);
  gradient.addColorStop(0, color.replace(')', ',0.25)').replace('rgb', 'rgba'));
  gradient.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
  return gradient;
}

function updateCharts() {
  if (!pulseChart) return;

  const H   = state.history;
  const n   = H.pulse.length;
  const labels = H.labels.map((l, i) => (n - i) % 5 === 0 ? l : '');

  // Pulse chart
  pulseChart.data.labels              = labels;
  pulseChart.data.datasets[0].data    = H.pulse;
  pulseChart.data.datasets[0].borderColor = state.status === 'PATHOLOGICAL' ? '#ff6b6b'
                                          : state.status === 'SUSPECT'      ? '#ffb95f'
                                          : '#4edea3';
  pulseChart.update('none');

  // Temp chart
  tempChart.data.labels             = labels;
  tempChart.data.datasets[0].data   = H.temp;
  tempChart.data.datasets[0].borderColor = H.temp.slice(-1)[0] > 37.5 ? '#ff6b6b' : '#ffb95f';
  tempChart.update('none');

  // Movement chart
  const movColors = H.movement.map(v => v > 0
    ? 'rgba(78,222,163,0.6)'
    : 'rgba(255,107,107,0.6)');
  moveChart.data.labels                          = labels;
  moveChart.data.datasets[0].data               = H.movement;
  moveChart.data.datasets[0].backgroundColor    = movColors;
  moveChart.update('none');

  // Mini chart
  pulseMiniChart.data.labels            = H.labels.slice(-20);
  pulseMiniChart.data.datasets[0].data  = H.pulse.slice(-20);
  pulseMiniChart.update('none');

  // Averages
  const avgPulse = Math.round(avg(H.pulse));
  const avgTemp  = avg(H.temp).toFixed(1);
  const pulseAvgEl = document.getElementById('pulse-avg-label');
  const tempAvgEl  = document.getElementById('temp-avg-label');

  if (pulseAvgEl) {
    pulseAvgEl.textContent = `avg. ${avgPulse} bpm`;
    pulseAvgEl.className   = 'chart-avg ' + (avgPulse > 140 ? 'crit' : avgPulse > 120 ? 'warn' : '');
  }
  if (tempAvgEl) {
    tempAvgEl.textContent = `avg. ${avgTemp} °C`;
    tempAvgEl.className   = 'chart-avg ' + (avgTemp > 37.5 ? 'crit' : '');
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function updateMiniChart(pulse) {
  if (!pulseMiniChart) return;
  pulseMiniChart.data.datasets[0].borderColor =
    state.status === 'PATHOLOGICAL' ? '#ff6b6b' :
    state.status === 'SUSPECT'      ? '#ffb95f' :
    '#4edea3';
}

// ─────────────────────────────────────────────────────────
//  ML PANEL UPDATE
// ─────────────────────────────────────────────────────────
function updateMLPanel(pulse, temp, movement, status) {
  const normalRule  = document.getElementById('ml-normal');
  const suspectRule = document.getElementById('ml-suspect');
  const pathoRule   = document.getElementById('ml-pathological');
  const outputVal   = document.getElementById('ml-output-value');
  const outputConf  = document.getElementById('ml-output-conf');
  const mlChip      = document.getElementById('ml-chip');

  // Reset all rules
  [normalRule, suspectRule, pathoRule].forEach(r => {
    r.classList.remove('active-rule', 'active-suspect', 'active-patho');
  });

  const conf = ML.confidence(pulse, temp, movement, status);

  // Activate matching rule
  if (status === 'NORMAL') {
    normalRule.classList.add('active-rule');
    document.getElementById('ml-normal-status').textContent  = '✓ Matched';
    document.getElementById('ml-suspect-status').textContent = '○ Not met';
    document.getElementById('ml-patho-status').textContent   = '○ Not met';
  } else if (status === 'SUSPECT') {
    suspectRule.classList.add('active-suspect');
    document.getElementById('ml-normal-status').textContent  = '○ Not met';
    document.getElementById('ml-suspect-status').textContent = '⚠ Matched';
    document.getElementById('ml-patho-status').textContent   = '○ Not met';
  } else {
    pathoRule.classList.add('active-patho');
    document.getElementById('ml-normal-status').textContent  = '○ Not met';
    document.getElementById('ml-suspect-status').textContent = '○ Not met';
    document.getElementById('ml-patho-status').textContent   = '🚨 Matched';
  }

  outputVal.textContent = status;
  outputVal.className   = 'ml-output-value ' + status.toLowerCase();
  outputConf.textContent = 'Confidence: ' + conf;

  mlChip.innerHTML = `<span class="ml-chip-dot"></span> ${status}`;
  mlChip.style.background = status === 'PATHOLOGICAL' ? 'rgba(255,107,107,0.12)'
                          : status === 'SUSPECT'       ? 'rgba(255,185,95,0.12)'
                          : 'rgba(78,222,163,0.08)';
  mlChip.style.color = status === 'PATHOLOGICAL' ? '#ff6b6b'
                     : status === 'SUSPECT'       ? '#ffb95f'
                     : '#4edea3';
}

// ─────────────────────────────────────────────────────────
//  ALERT SYSTEM
// ─────────────────────────────────────────────────────────
function onStatusChange(newStatus, pulse, temp, movement) {
  let type, msg;

  if (newStatus === 'PATHOLOGICAL') {
    type = 'patho';
    msg  = `PATHOLOGICAL: Pulse ${pulse} BPM, Temp ${temp.toFixed(1)}°C — Immediate attention required!`;
    showToast('🚨 PATHOLOGICAL STATE DETECTED', 'error');
    playAlertSound();
  } else if (newStatus === 'SUSPECT') {
    type = 'warn';
    if (pulse > 120 && movement === 0) {
      msg = `SUSPECT: High pulse (${pulse} BPM) with no detected movement.`;
    } else if (pulse > 120) {
      msg = `SUSPECT: Elevated fetal heart rate detected (${pulse} BPM).`;
    } else {
      msg = `SUSPECT: Abnormal readings — temp ${temp.toFixed(1)}°C.`;
    }
    showToast('⚠️ Suspect state detected', 'warn');
  } else {
    type = 'info';
    msg  = `Status returned to NORMAL — Pulse ${pulse} BPM, Temp ${temp.toFixed(1)}°C.`;
  }

  pushAlert(type, msg);
}

function pushAlert(type, msg) {
  state.alertCount++;
  document.getElementById('stat-alerts').textContent = state.alertCount;

  // Update nav badge
  const badge = document.getElementById('alert-badge');
  badge.textContent = state.alertCount;

  // Notif dot on ANY alert
  document.getElementById('notif-dot').classList.add('show');

  const list = document.getElementById('alerts-list');

  // Remove empty state if present
  const empty = list.querySelector('.alert-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const typeLabels = {
    info:  'Info',
    warn:  'Attention ⚠️',
    crit:  'Critical',
    patho: 'Pathological 🚨'
  };

  const item = document.createElement('div');
  item.className = 'alert-item ' + type;
  item.innerHTML = `
    <div class="alert-header">
      <span class="alert-type ${type}">${typeLabels[type] || type}</span>
      <span class="alert-time">${time}</span>
    </div>
    <div class="alert-msg">${msg}</div>
  `;

  // Prepend (newest first)
  list.insertBefore(item, list.firstChild);

  // Max 20 alerts in list
  const items = list.querySelectorAll('.alert-item');
  if (items.length > 20) items[items.length - 1].remove();
}

function clearAlerts() {
  const list = document.getElementById('alerts-list');
  list.innerHTML = `<div class="alert-empty">
    <span class="material-symbols-outlined" style="font-size:36px;opacity:0.3">notifications_none</span>
    <p>No events. Monitoring live...</p>
  </div>`;
  state.alertCount = 0;
  document.getElementById('stat-alerts').textContent = '0';
  document.getElementById('alert-badge').textContent = '0';
  document.getElementById('notif-dot').classList.remove('show');
}

// ─────────────────────────────────────────────────────────
//  AUDIO ALERT (Web Audio API beep)
// ─────────────────────────────────────────────────────────
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(delay => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  } catch (e) { /* ignore audio errors */ }
}

// ─────────────────────────────────────────────────────────
//  TIMESTAMP
// ─────────────────────────────────────────────────────────
function updateTimestamp() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
  });
  const el = document.getElementById('status-time');
  if (el) el.textContent = timeStr;

  // Also update the "Last Updated" system label
  const lu = document.getElementById('last-updated');
  if (lu) lu.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─────────────────────────────────────────────────────────
//  SESSION TIMER
// ─────────────────────────────────────────────────────────
function startSessionTimer() {
  setInterval(() => {
    const elapsed = Date.now() - state.sessionStart;
    const h = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
    const el = document.getElementById('stat-session');
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// ─────────────────────────────────────────────────────────
//  CONNECTION STATUS
// ─────────────────────────────────────────────────────────
function setConnectionStatus(connected) {
  state.connected = connected;
  const el = document.getElementById('connection-status');
  const ld = document.getElementById('live-dot');
  const lt = document.getElementById('live-text');
  const cd = el && el.querySelector('.conn-dot');
  if (!el) return;
  if (connected) {
    el.innerHTML = `<span class="conn-dot"></span> Firebase Connected`;
    if (ld) { ld.classList.remove('offline'); }
    if (lt) { lt.textContent = 'LIVE'; lt.style.color = '#4edea3'; }
  } else {
    el.innerHTML = `<span class="conn-dot disconnected"></span> Disconnected`;
    if (ld) { ld.classList.add('offline'); }
    if (lt) { lt.textContent = 'OFFLINE'; lt.style.color = '#ff6b6b'; }
  }
}

// ─────────────────────────────────────────────────────────
//  TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { info: 'info', warn: 'warning', error: 'report' };
  const icon = icons[type] || 'info';

  const toast = document.createElement('div');
  toast.className = 'toast ' + (type === 'warn' ? 'warn' : type === 'error' ? 'error' : '');
  toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;flex-shrink:0">${icon}</span>${msg}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─────────────────────────────────────────────────────────
//  MODALS
// ─────────────────────────────────────────────────────────
function triggerEmergency() {
  const modal    = document.getElementById('emergency-modal');
  const timeEl   = document.getElementById('modal-time');
  const timeStr  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (timeEl) timeEl.textContent = timeStr;
  modal.classList.add('show');
  pushAlert('crit', `[${timeStr}] EMERGENCY triggered. Clinical team notified. Status \u2192 PATHOLOGICAL.`);
  playAlertSound();
  // Force system into PATHOLOGICAL state on emergency
  simulateScenario('PATHOLOGICAL', /* silent = */ true);
}

function sendAlert() {
  const modal = document.getElementById('alert-modal');
  modal.classList.add('show');
  pushAlert('warn', 'Manual alert sent to on-duty clinical team.');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});

// ─────────────────────────────────────────────────────────
//  SIDEBAR TOGGLE (mobile)
// ─────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─────────────────────────────────────────────────────────
//  DEMO MODE & OVERLAY
// ─────────────────────────────────────────────────────────
function startDemoMode() {
  state.demoMode = true;
  // Update landing status before hiding overlay
  if (typeof updateLandingStatus === 'function') {
    updateLandingStatus('System Status: Simulation Demo Active  |  Simulated ESP32 data', true);
  }
  hideDemoOverlay();
  setConnectionStatus(true);

  // Seed with initial normal data
  pushAlert('info', 'System diagnostic complete: IoT Smart Belt v4 connected.');
  Demo.start();
}

function hideDemoOverlay() {
  const overlay = document.getElementById('demo-overlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.style.display = 'none', 400);
}

// ─────────────────────────────────────────────────────────
//  TIME RANGE TOGGLE (visual only — history length changes)
// ─────────────────────────────────────────────────────────
function setTimeRange(btn, range) {
  document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const points = { '6H': 60, '12H': 120, '24H': 240 };
  state.history.maxPoints = points[range] || 60;
}

// ─────────────────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  }
  // E = Emergency, D = Demo mode
  if (e.key === 'e' && !e.target.matches('input')) triggerEmergency();
});

// ─────────────────────────────────────────────────────────
//  SECTION NAVIGATION — smooth scroll + highlight
// ─────────────────────────────────────────────────────────

/**
 * Smoothly scrolls to a section by ID and briefly flashes a
 * teal border around it so the user knows exactly where they landed.
 */
function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Brief highlight after scroll (wait for scroll to settle)
  setTimeout(() => highlightSection(el), 400);
}

function highlightSection(el) {
  el.classList.remove('section-flash'); // reset if triggered twice quickly
  // Force reflow so the animation restarts cleanly
  void el.offsetWidth;
  el.classList.add('section-flash');
  // Remove class after animation ends so it can be re-triggered
  el.addEventListener('animationend', () => el.classList.remove('section-flash'), { once: true });
}

/**
 * Used by the sidebar nav — scrolls to section and updates the
 * active highlight on the clicked sidebar item.
 */
function sidebarNav(sectionId, clickedEl) {
  scrollToSection(sectionId);

  // Update active state on sidebar nav items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');

  // Close sidebar on mobile after navigation
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  }
}

// ─────────────────────────────────────────────────────────
//  SETTINGS PANEL — lightweight toggle
// ─────────────────────────────────────────────────────────

function toggleSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  const isOpen = panel.classList.toggle('open');

  // Sync mode label inside settings panel
  const spMode     = document.getElementById('sp-mode');
  const spFirebase = document.getElementById('sp-firebase');
  const modeText   = document.getElementById('mode-text');

  if (spMode && modeText) {
    spMode.textContent = state.firebaseActive ? 'Live (Firebase)' : 'Demo';
  }
  if (spFirebase) {
    spFirebase.textContent = state.firebaseActive ? 'Connected' : 'Demo (local)';
    spFirebase.className   = 'settings-row-val' + (state.firebaseActive ? ' sp-green' : '');
  }

  // Highlight the settings gear button while panel is open
  const btn = document.getElementById('btn-settings');
  if (btn) {
    btn.style.background = isOpen ? 'var(--bg-5)' : '';
    btn.style.color      = isOpen ? 'var(--primary)' : '';
  }
}

// Close settings panel when clicking outside of it
document.addEventListener('click', (e) => {
  const panel = document.getElementById('settings-panel');
  const btn   = document.getElementById('btn-settings');
  const sidebarSettingsBtn = document.getElementById('nav-settings');
  if (!panel) return;
  if (
    panel.classList.contains('open') &&
    !panel.contains(e.target) &&
    e.target !== btn &&
    !btn?.contains(e.target) &&
    e.target !== sidebarSettingsBtn &&
    !sidebarSettingsBtn?.contains(e.target)
  ) {
    panel.classList.remove('open');
    if (btn) { btn.style.background = ''; btn.style.color = ''; }
  }
});

// ─────────────────────────────────────────────────────────
//  TOPBAR ACTIVE LINK — highlight correct tab on scroll
// ─────────────────────────────────────────────────────────
(function initScrollSpy() {
  const sections = [
    { id: 'overview-section',  link: 'Live Feed'  },
    { id: 'analytics-section', link: 'Analytics'  },
    { id: 'patient-section',   link: 'Patients'   },
  ];

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const match = sections.find(s => s.id === entry.target.id);
      if (!match) return;

      document.querySelectorAll('.topbar-link').forEach(l => l.classList.remove('active'));
      const activeLink = [...document.querySelectorAll('.topbar-link')]
        .find(l => l.textContent.trim() === match.link);
      if (activeLink) activeLink.classList.add('active');
    });
  }, { threshold: 0.2 });

  document.addEventListener('DOMContentLoaded', () => {
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
  });
})();

// ─────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('%c VITALIS MONITOR INITIALISED ', 'background:#4edea3;color:#003824;font-weight:bold;padding:4px 8px;border-radius:4px;');
  console.log('%c Startup Mode: ' + STARTUP_MODE, 'color:#4edea3');

  // Init Chart.js
  initCharts();

  // Session timer
  startSessionTimer();

  // Auto-start based on STARTUP_MODE config
  if (STARTUP_MODE === 'firebase' && MY_FIREBASE_URL) {
    // Auto-connect Firebase, skip overlay
    hideDemoOverlay();
    connectFirebaseRuntime(MY_FIREBASE_URL);
    state.demoMode = false;
  } else {
    // Show config overlay for user to choose
    // (Demo overlay is shown by default in HTML)
    updateModeIndicator('demo');
  }
});

// ─────────────────────────────────────────────────────────
//  GLOBAL EXPOSE (for HTML onclick attributes)
// ─────────────────────────────────────────────────────────
window.triggerEmergency    = triggerEmergency;
window.sendAlert           = sendAlert;
window.closeModal          = closeModal;
window.clearAlerts         = clearAlerts;
window.startDemoMode       = startDemoMode;
window.connectFirebase     = connectFirebase;
window.switchToDemo        = switchToDemo;
window.switchToFirebase    = switchToFirebase;
window.openModePanel       = openModePanel;
window.closeModePanel      = closeModePanel;
window.setTimeRange        = setTimeRange;
window.toggleSidebar       = toggleSidebar;
window.simulateScenario    = simulateScenario;
window.scrollToSection     = scrollToSection;
window.sidebarNav          = sidebarNav;
window.toggleSettingsPanel  = toggleSettingsPanel;
window.showToast            = showToast;
window.openAdvancedSetup    = openAdvancedSetup;
window.toggleAdvancedSetup  = toggleAdvancedSetup;
window.updateLandingStatus  = updateLandingStatus;
