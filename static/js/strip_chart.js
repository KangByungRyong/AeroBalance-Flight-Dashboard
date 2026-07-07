'use strict';

// ═══════════════════════════════════════════════════════
// 1. CHANNEL DEFINITIONS  (dataref_config.py 기준)
// ═══════════════════════════════════════════════════════
const CHANNEL_GROUPS = [
  {
    id: 'flight_basic', label: '비행 기본',
    channels: [
      { key: 'speed.vind_kias',       label: 'IAS',              unit: 'KIAS'  },
      { key: 'speed.vind_keas',       label: 'EAS',              unit: 'KEAS'  },
      { key: 'speed.vtrue_ktas',      label: 'TAS',              unit: 'KTAS'  },
      { key: 'speed.vtrue_ktgs',      label: 'Ground Speed',     unit: 'KGS'   },
      { key: 'speed.vind_mph',        label: 'IAS',              unit: 'MPH'   },
      { key: 'mach.vvi_fpm',          label: 'VVI',              unit: 'fpm'   },
      { key: 'mach.mach',             label: 'Mach',             unit: ''      },
      { key: 'mach.toten_vario',      label: 'Vario',            unit: ''      },
      { key: 'mach.gload_normal',     label: 'G-load Normal',    unit: 'g'     },
      { key: 'mach.gload_axial',      label: 'G-load Axial',     unit: 'g'     },
      { key: 'mach.gload_side',       label: 'G-load Side',      unit: 'g'     },
    ],
  },
  {
    id: 'attitude', label: '자세 / 방향',
    channels: [
      { key: 'attitude.pitch_deg',     label: 'Pitch',           unit: '°'    },
      { key: 'attitude.roll_deg',      label: 'Roll',            unit: '°'    },
      { key: 'attitude.true_hdg_deg',  label: 'Heading True',    unit: '°'    },
      { key: 'attitude.mag_hdg_deg',   label: 'Heading Mag',     unit: '°'    },
      { key: 'attitude.comp_hdg_deg',  label: 'Heading Comp',    unit: '°'    },
      { key: 'attitude.mag_var_deg',   label: 'Mag Variation',   unit: '°'    },
      { key: 'aoa.aoa_deg',            label: 'AOA',             unit: '°'    },
      { key: 'aoa.beta_deg',           label: 'Beta',            unit: '°'    },
      { key: 'aoa.hori_path_deg',      label: 'Horiz Path',      unit: '°'    },
      { key: 'aoa.vert_path_deg',      label: 'Vert Path',       unit: '°'    },
      { key: 'aoa.sideslip_deg',       label: 'Sideslip',        unit: '°'    },
    ],
  },
  {
    id: 'angular', label: '각속도 / 각가속도',
    channels: [
      { key: 'angular_rate.p_deg_s',  label: 'Roll Rate',    unit: '°/s'  },
      { key: 'angular_rate.q_deg_s',  label: 'Pitch Rate',   unit: '°/s'  },
      { key: 'angular_rate.r_deg_s',  label: 'Yaw Rate',     unit: '°/s'  },
      { key: 'angular_accel.p_dot',   label: 'Roll Accel',   unit: '°/s²' },
      { key: 'angular_accel.q_dot',   label: 'Pitch Accel',  unit: '°/s²' },
      { key: 'angular_accel.r_dot',   label: 'Yaw Accel',    unit: '°/s²' },
    ],
  },
  {
    id: 'controls', label: '조종 입력',
    channels: [
      { key: 'pilot_stick.elevator_cmd',  label: 'Elevator CMD', unit: '' },
      { key: 'pilot_stick.aileron_cmd',   label: 'Aileron CMD',  unit: '' },
      { key: 'pilot_stick.rudder_cmd',    label: 'Rudder CMD',   unit: '' },
    ],
  },
  {
    id: 'surfaces', label: '비행 조종면',
    channels: [
      { key: 'flight_control_surface.elevator_fc',          label: 'Elevator FC',      unit: '' },
      { key: 'flight_control_surface.aileron_fc',           label: 'Aileron FC',       unit: '' },
      { key: 'flight_control_surface.rudder_fc',            label: 'Rudder FC',        unit: '' },
      { key: 'flight_control_surface.nose_wheel_steer_deg', label: 'Nose Wheel Steer', unit: '°' },
    ],
  },
  {
    id: 'position', label: '위치',
    channels: [
      { key: 'position.latitude',           label: 'Latitude',      unit: '°'  },
      { key: 'position.longitude',          label: 'Longitude',     unit: '°'  },
      { key: 'position.cg_alt_ftmsl',       label: 'Alt MSL (CG)',  unit: 'ft' },
      { key: 'position.press_alt_ftmsl',    label: 'Alt MSL (Press)', unit: 'ft' },
      { key: 'position.gear_height_ftagl',  label: 'Alt AGL (Gear)', unit: 'ft' },
      { key: 'position.terrain_alt_ftmsl',  label: 'Terrain Alt',   unit: 'ft' },
    ],
  },
  {
    id: 'throttle_cmd', label: '스로틀 (조종)',
    channels: [
      { key: 'pilot_throttle.throttle1_cmd', label: 'Throttle 1 CMD', unit: '' },
      { key: 'pilot_throttle.throttle2_cmd', label: 'Throttle 2 CMD', unit: '' },
      { key: 'pilot_throttle.throttle3_cmd', label: 'Throttle 3 CMD', unit: '' },
      { key: 'pilot_throttle.throttle4_cmd', label: 'Throttle 4 CMD', unit: '' },
      { key: 'pilot_throttle.throttle5_cmd', label: 'Throttle 5 CMD', unit: '' },
    ],
  },
  {
    id: 'throttle_fc', label: '스로틀 (FC)',
    channels: [
      { key: 'fc_throttle.throttle1_fc', label: 'Throttle 1 FC', unit: '' },
      { key: 'fc_throttle.throttle2_fc', label: 'Throttle 2 FC', unit: '' },
      { key: 'fc_throttle.throttle3_fc', label: 'Throttle 3 FC', unit: '' },
      { key: 'fc_throttle.throttle4_fc', label: 'Throttle 4 FC', unit: '' },
      { key: 'fc_throttle.throttle5_fc', label: 'Throttle 5 FC', unit: '' },
    ],
  },
  {
    id: 'engine', label: '엔진 / 로터',
    channels: [
      { key: 'rotor_thrust.rotor1_thrust_lb', label: 'Rotor 1 Thrust', unit: 'lb' },
      { key: 'rotor_thrust.rotor2_thrust_lb', label: 'Rotor 2 Thrust', unit: 'lb' },
      { key: 'rotor_thrust.rotor3_thrust_lb', label: 'Rotor 3 Thrust', unit: 'lb' },
      { key: 'rotor_thrust.rotor4_thrust_lb', label: 'Rotor 4 Thrust', unit: 'lb' },
      { key: 'rotor_thrust.rotor5_thrust_lb', label: 'Rotor 5 Thrust', unit: 'lb' },
      { key: 'engine_torque.engine1_tq_nm',   label: 'Engine 1 Torque', unit: 'Nm' },
      { key: 'engine_torque.engine2_tq_nm',   label: 'Engine 2 Torque', unit: 'Nm' },
      { key: 'engine_torque.engine3_tq_nm',   label: 'Engine 3 Torque', unit: 'Nm' },
      { key: 'engine_torque.engine4_tq_nm',   label: 'Engine 4 Torque', unit: 'Nm' },
      { key: 'engine_torque.engine5_tq_nm',   label: 'Engine 5 Torque', unit: 'Nm' },
      { key: 'engine_rpm.engine1_rpm',        label: 'Engine 1 RPM',   unit: 'rpm' },
      { key: 'engine_rpm.engine2_rpm',        label: 'Engine 2 RPM',   unit: 'rpm' },
      { key: 'engine_rpm.engine3_rpm',        label: 'Engine 3 RPM',   unit: 'rpm' },
      { key: 'engine_rpm.engine4_rpm',        label: 'Engine 4 RPM',   unit: 'rpm' },
      { key: 'engine_rpm.engine5_rpm',        label: 'Engine 5 RPM',   unit: 'rpm' },
      { key: 'prop_rpm.prop1_rpm',            label: 'Prop 1 RPM',     unit: 'rpm' },
      { key: 'prop_rpm.prop2_rpm',            label: 'Prop 2 RPM',     unit: 'rpm' },
      { key: 'prop_rpm.prop3_rpm',            label: 'Prop 3 RPM',     unit: 'rpm' },
      { key: 'prop_rpm.prop4_rpm',            label: 'Prop 4 RPM',     unit: 'rpm' },
      { key: 'prop_rpm.prop5_rpm',            label: 'Prop 5 RPM',     unit: 'rpm' },
      { key: 'prop_pitch.prop1_pitch_deg',    label: 'Prop 1 Pitch',   unit: '°' },
      { key: 'prop_pitch.prop2_pitch_deg',    label: 'Prop 2 Pitch',   unit: '°' },
      { key: 'prop_pitch.prop3_pitch_deg',    label: 'Prop 3 Pitch',   unit: '°' },
      { key: 'prop_pitch.prop4_pitch_deg',    label: 'Prop 4 Pitch',   unit: '°' },
      { key: 'prop_pitch.prop5_pitch_deg',    label: 'Prop 5 Pitch',   unit: '°' },
      { key: 'prop_torque.prop1_tq_nm',       label: 'Prop 1 Torque',  unit: 'Nm' },
      { key: 'prop_torque.prop2_tq_nm',       label: 'Prop 2 Torque',  unit: 'Nm' },
      { key: 'prop_torque.prop3_tq_nm',       label: 'Prop 3 Torque',  unit: 'Nm' },
      { key: 'prop_torque.prop4_tq_nm',       label: 'Prop 4 Torque',  unit: 'Nm' },
      { key: 'prop_torque.prop5_tq_nm',       label: 'Prop 5 Torque',  unit: 'Nm' },
    ],
  },
  {
    id: 'battery', label: '배터리',
    channels: [
      { key: 'battery_amp.battery1_amp',          label: 'Battery 1 Current', unit: 'A'   },
      { key: 'battery_amp.battery2_amp',          label: 'Battery 2 Current', unit: 'A'   },
      { key: 'battery_amp.battery3_amp',          label: 'Battery 3 Current', unit: 'A'   },
      { key: 'battery_amp.battery4_amp',          label: 'Battery 4 Current', unit: 'A'   },
      { key: 'battery_amp.battery5_amp',          label: 'Battery 5 Current', unit: 'A'   },
      { key: 'battery_volt.battery1_volt',        label: 'Battery 1 Voltage', unit: 'V'   },
      { key: 'battery_volt.battery2_volt',        label: 'Battery 2 Voltage', unit: 'V'   },
      { key: 'battery_volt.battery3_volt',        label: 'Battery 3 Voltage', unit: 'V'   },
      { key: 'battery_volt.battery4_volt',        label: 'Battery 4 Voltage', unit: 'V'   },
      { key: 'battery_volt.battery5_volt',        label: 'Battery 5 Voltage', unit: 'V'   },
      { key: 'battery_temp.battery1_temp_degc',   label: 'Battery 1 Temp',   unit: '°C'  },
      { key: 'battery_temp.battery2_temp_degc',   label: 'Battery 2 Temp',   unit: '°C'  },
      { key: 'battery_temp.battery3_temp_degc',   label: 'Battery 3 Temp',   unit: '°C'  },
      { key: 'battery_temp.battery4_temp_degc',   label: 'Battery 4 Temp',   unit: '°C'  },
      { key: 'battery_temp.battery5_temp_degc',   label: 'Battery 5 Temp',   unit: '°C'  },
      { key: 'battery_wh.battery1_wh',            label: 'Battery 1 Energy', unit: 'Wh'  },
      { key: 'battery_wh.battery2_wh',            label: 'Battery 2 Energy', unit: 'Wh'  },
      { key: 'battery_wh.battery3_wh',            label: 'Battery 3 Energy', unit: 'Wh'  },
      { key: 'battery_wh.battery4_wh',            label: 'Battery 4 Energy', unit: 'Wh'  },
      { key: 'battery_wh.battery5_wh',            label: 'Battery 5 Energy', unit: 'Wh'  },
    ],
  },
  {
    id: 'environment', label: '환경 / 기상',
    channels: [
      { key: 'environment.am_prs_inhg',   label: 'Ambient Pressure',    unit: 'inHg'  },
      { key: 'environment.am_tmp_degc',   label: 'Ambient Temp',        unit: '°C'    },
      { key: 'environment.le_tmp_degc',   label: 'Leading Edge Temp',   unit: '°C'    },
      { key: 'environment.dens_ratio',    label: 'Density Ratio',       unit: ''      },
      { key: 'environment.a_ktas',        label: 'Speed of Sound',      unit: 'KTAS'  },
      { key: 'environment.q_psf',         label: 'Dynamic Pressure',    unit: 'psf'   },
      { key: 'environment.gravity_m_s2',  label: 'Gravity',             unit: 'm/s²'  },
      { key: 'weather.hori_wind_knots',   label: 'Wind Speed',          unit: 'kt'    },
      { key: 'weather.wind_dir_deg',      label: 'Wind Direction',      unit: '°'     },
      { key: 'weather.vert_wind_fpm',     label: 'Vertical Wind',       unit: 'fpm'   },
      { key: 'weather.turb',              label: 'Turbulence',          unit: ''      },
      { key: 'weather.rain',              label: 'Rain',                unit: ''      },
      { key: 'weather.snow',              label: 'Snow',                unit: ''      },
    ],
  },
  {
    id: 'time', label: '시간',
    channels: [
      { key: 'time.real_time',    label: 'Real Time',    unit: 's' },
      { key: 'time.total_time',   label: 'Total Time',   unit: 's' },
      { key: 'time.mission_time', label: 'Mission Time', unit: 's' },
      { key: 'time.timer',        label: 'Timer',        unit: 's' },
      { key: 'time.zulu_time',    label: 'Zulu Time',    unit: 's' },
      { key: 'time.local_time',   label: 'Local Time',   unit: 's' },
      { key: 'time.hobbs',        label: 'Hobbs',        unit: 'h' },
    ],
  },
];

// ═══════════════════════════════════════════════════════
// 2. GRID CONFIGS
// ═══════════════════════════════════════════════════════
const GRID_CONFIGS = {
  '2x2': { cols: 2, rows: 2 },
  '3x3': { cols: 3, rows: 3 },
  '4x3': { cols: 4, rows: 3 },
};

// ═══════════════════════════════════════════════════════
// 3. STATE
// ═══════════════════════════════════════════════════════
let chartIdSeq    = 0;
let popupCascade  = 0;
let popupZCounter = 0;
let currentGrid   = '2x2';
let colSizes      = null;
let rowSizes      = null;
let activeDragCell = null;
let liveTimeout    = null;
let liveLastRender = 0;
let udpConnected   = false;
const LIVE_RENDER_MS = 1000 / 20;

let lastMouseX = 0;
let lastMouseY = 0;
let tooltipEl  = null;

const SESSION_KEY = 'sc_layout';
let _saveTimer    = null;

const charts = new Map();   // id → chart object

let dockArea    = null;
let popupLayer  = null;
let flightBC    = null;

// /chart/external/ 경로에서 열린 경우 BroadcastChannel에서 데이터를 수신
const IS_EXTERNAL = location.pathname.includes('/external');

// ═══════════════════════════════════════════════════════
// 4. COLOR PALETTE
// ═══════════════════════════════════════════════════════
const PALETTE = [
  '#44aaff','#ff7744','#44ff88','#ff44bb','#ffdd44',
  '#44ffee','#ff4444','#aaaaff','#88ff44','#ff88cc',
];
let paletteIdx = 0;
const nextColor = () => PALETTE[paletteIdx++ % PALETTE.length];

const WINDOW_SEC = 60;

// ═══════════════════════════════════════════════════════
// 5. TOOLTIP
// ═══════════════════════════════════════════════════════
function initTooltip() {
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'chart-tooltip';
  tooltipEl.innerHTML = '<div class="tt-time"></div><div class="tt-rows"></div>';
  document.body.appendChild(tooltipEl);
  document.addEventListener('mousemove', e => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

function nearestIdx(times, ts) {
  if (!times.length) return -1;
  let lo = 0, hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function fmtVal(v) {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100)  return v.toFixed(1);
  if (a >= 1)    return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(2);
}

function showTooltip(activeChart, ts) {
  const rows = [];
  for (const c of charts.values()) {
    const i = nearestIdx(c.data.times, ts);
    if (i < 0) continue;
    const isActive = c.id === activeChart.id;
    const val = c.data.values[i];
    if (val != null) {
      rows.push({ label: c.channelLabel, unit: c.channelUnit, val, color: c.style.stroke, bold: isActive });
    }
    for (const es of c.extraSeries) {
      if (i < es.values.length && es.values[i] != null) {
        rows.push({ label: es.label, unit: es.unit, val: es.values[i], color: es.stroke, bold: isActive });
      }
    }
  }

  if (!rows.length) { hideTooltip(); return; }

  const d = new Date(ts * 1000);
  tooltipEl.querySelector('.tt-time').textContent = d.toTimeString().slice(0, 8);
  tooltipEl.querySelector('.tt-rows').innerHTML = rows.map(r =>
    `<div class="tt-row${r.bold ? ' tt-active' : ''}">` +
    `<span class="tt-dot" style="color:${r.color}">■</span>` +
    `<span class="tt-label">${r.label}${r.unit ? ` (${r.unit})` : ''}</span>` +
    `<span class="tt-val">${fmtVal(r.val)}</span>` +
    `</div>`
  ).join('');

  tooltipEl.style.display = 'block';
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  const MARGIN = 14;
  let tx = lastMouseX + MARGIN;
  let ty = lastMouseY - 10;
  if (tx + tw > window.innerWidth  - MARGIN) tx = lastMouseX - tw - MARGIN;
  if (ty + th > window.innerHeight - MARGIN) ty = window.innerHeight - th - MARGIN;
  if (ty < MARGIN) ty = MARGIN;
  tooltipEl.style.left = `${tx}px`;
  tooltipEl.style.top  = `${ty}px`;
}

// ═══════════════════════════════════════════════════════
// 5.5 LIVE UDP DATA HANDLER
// ═══════════════════════════════════════════════════════
function chartData(chart) {
  return [chart.data.times, chart.data.values, ...chart.extraSeries.map(es => es.values)];
}

function onFlightData(event) {
  const pkt    = event.detail;
  const ts     = pkt.ts;
  const params = pkt.params;
  if (!params || charts.size === 0) return;

  const cutoff = ts - WINDOW_SEC;
  let anyUpdated = false;

  for (const chart of charts.values()) {
    const dot   = chart.channelKey.indexOf('.');
    const group = chart.channelKey.slice(0, dot);
    const field = chart.channelKey.slice(dot + 1);
    const val   = params[group]?.[field];
    if (val == null) continue;

    chart.data.times.push(ts);
    chart.data.values.push(val);

    for (const es of chart.extraSeries) {
      const edot = es.key.indexOf('.');
      es.values.push(params[es.key.slice(0, edot)]?.[es.key.slice(edot + 1)] ?? null);
    }

    while (chart.data.times.length > 0 && chart.data.times[0] < cutoff) {
      chart.data.times.shift();
      chart.data.values.shift();
      for (const es of chart.extraSeries) es.values.shift();
    }
    anyUpdated = true;
  }

  if (!anyUpdated) return;

  // 시뮬레이터와 동일한 20Hz 속도로 렌더링 스로틀
  const now = performance.now();
  if (now - liveLastRender >= LIVE_RENDER_MS) {
    liveLastRender = now;
    for (const chart of charts.values()) {
      if (chart.uplot) chart.uplot.setData(chartData(chart));
    }
  }

  // 수신 중 → Disconnect 표시 해제, 5초 침묵 시 Disconnect 표시
  setUdpConnected(true);
  clearTimeout(liveTimeout);
  liveTimeout = setTimeout(() => setUdpConnected(false), 5000);
}

function setUdpConnected(connected) {
  udpConnected = connected;
  const el = document.getElementById('udp-status');
  if (el) el.style.display = (!connected && charts.size > 0) ? '' : 'none';
}

// ═══════════════════════════════════════════════════════
// 6. uPLOT FACTORY
// ═══════════════════════════════════════════════════════

function buildUplot(bodyEl, chart) {
  const w = Math.max(bodyEl.clientWidth  || 400, 60);
  const h = Math.max(bodyEl.clientHeight || 240, 60);

  const dashMap  = { solid: undefined, dashed: [8, 4], dotted: [2, 4] };
  const allSeries = [
    { stroke: chart.style.stroke, dash: chart.style.dash, label: chart.channelLabel },
    ...chart.extraSeries.map(es => ({ stroke: es.stroke, dash: es.dash, label: es.label })),
  ];

  const opts = {
    width: w, height: h,
    pxAlign: true,
    cursor: { show: true, drag: { x: false, y: false } },
    legend: { show: false },
    padding: [6, 6, 0, 0],
    scales: {
      x: {
        time: true,
        range(u, dataMin, dataMax) {
          const latest = (dataMax != null && isFinite(dataMax))
            ? dataMax
            : Date.now() / 1000;
          return [latest - WINDOW_SEC, latest];
        },
      },
      y: {
        auto: true,
        range(u, dataMin, dataMax) {
          const pad = (dataMax - dataMin) * 0.15 || Math.abs(dataMax) * 0.1 || 1;
          const lo  = chart.yMin != null ? chart.yMin : dataMin - pad;
          const hi  = chart.yMax != null ? chart.yMax : dataMax + pad;
          return [lo, hi];
        },
      },
    },
    axes: [
      {
        stroke: '#666',
        ticks: { stroke: '#2a2a4a', width: 1 },
        grid:  { stroke: '#1e1e3a', width: 1 },
        size: 36,
        values: (_u, ts) => ts.map(t => {
          if (t == null) return '';
          const d = new Date(t * 1000);
          return d.toTimeString().slice(0, 8);
        }),
      },
      {
        stroke: '#888',
        ticks: { stroke: '#2a2a4a', width: 1 },
        grid:  { stroke: '#1e1e3a', width: 1 },
        size: 52,
      },
    ],
    series: [
      {},
      ...allSeries.map(s => ({
        stroke: s.stroke,
        width:  3,
        dash:   dashMap[s.dash] || undefined,
        label:  s.label,
      })),
    ],
    hooks: {
      setCursor: [u => {
        const idx = u.cursor.idx;
        if (idx == null || !u.data[0]?.length) { hideTooltip(); return; }
        const ts = u.data[0][idx];
        if (ts == null) { hideTooltip(); return; }
        showTooltip(chart, ts);
      }],
    },
  };

  const u = new uPlot(opts, chartData(chart), bodyEl);
  u.over.addEventListener('mouseleave', hideTooltip);

  // canvas background via CSS
  const canvas = bodyEl.querySelector('canvas');
  if (canvas) canvas.style.background = '#0d0d1a';

  const ro = new ResizeObserver(entries => {
    const { width: rw, height: rh } = entries[0].contentRect;
    if (rw > 30 && rh > 30) u.setSize({ width: Math.floor(rw), height: Math.floor(rh) });
  });
  ro.observe(bodyEl);

  chart.uplot = u;
  chart._ro   = ro;
}

function destroyUplot(chart) {
  if (chart._ro)    { chart._ro.disconnect(); chart._ro = null; }
  if (chart.uplot)  { chart.uplot.destroy();  chart.uplot = null; }
  if (chart.bodyEl) chart.bodyEl.innerHTML = '';
}

function rebuildUplot(chart) {
  destroyUplot(chart);
  if (chart.bodyEl) buildUplot(chart.bodyEl, chart);
  scheduleSave();
}

// ═══════════════════════════════════════════════════════
// 7. STYLE PANEL
// ═══════════════════════════════════════════════════════
function makeStylePanel(chart, anchorEl) {
  const existing = anchorEl.querySelector('.style-panel');
  if (existing) { existing.remove(); return; }

  const panel        = document.createElement('div');
  panel.className    = 'style-panel';

  const dashVal      = chart.style.dash === 'dashed' ? 'dashed'
                     : chart.style.dash === 'dotted' ? 'dotted' : 'solid';
  const previewColor = PALETTE[paletteIdx % PALETTE.length];

  const extraListHtml = chart.extraSeries.map((es, i) => `
    <div class="sp-extra-item">
      <span class="sp-extra-dot" style="color:${es.stroke}">■</span>
      <span class="sp-extra-label">${es.label}${es.unit ? ` (${es.unit})` : ''}</span>
      <button class="sp-extra-remove" data-es-idx="${i}">✕</button>
    </div>`).join('');

  const groupOpts = CHANNEL_GROUPS.map(g =>
    `<option value="${g.id}">${g.label}</option>`).join('');

  panel.innerHTML = `
    <div class="sp-section">
      <div class="sp-section-title">선 스타일</div>
      <label>색상<input type="color" class="sp-color" value="${chart.style.stroke}"></label>
      <label>형태
        <select class="sp-dash">
          <option value="solid"  ${dashVal==='solid'  ?'selected':''}>실선</option>
          <option value="dashed" ${dashVal==='dashed' ?'selected':''}>파선</option>
          <option value="dotted" ${dashVal==='dotted' ?'selected':''}>점선</option>
        </select>
      </label>
      <div class="style-panel-btns">
        <button class="sp-close-btn">취소</button>
        <button class="sp-apply">적용</button>
      </div>
    </div>
    <div class="sp-section sp-section-sep">
      <div class="sp-section-title">Y축 범위</div>
      <div class="sp-yaxis-row">
        <label class="sp-yaxis-label">Min<input type="number" class="sp-ymin sp-num-input" placeholder="auto" value="${chart.yMin ?? ''}"></label>
        <label class="sp-yaxis-label">Max<input type="number" class="sp-ymax sp-num-input" placeholder="auto" value="${chart.yMax ?? ''}"></label>
        <button class="sp-yaxis-apply">적용</button>
      </div>
    </div>
    <div class="sp-section sp-section-sep">
      <div class="sp-section-title">채널 추가</div>
      <select class="sp-add-group sp-full-select">
        <option value="">-- 분야 선택 --</option>
        ${groupOpts}
      </select>
      <select class="sp-add-channel sp-full-select" disabled>
        <option value="">-- 항목 선택 --</option>
      </select>
      <div class="sp-add-row">
        <input type="color" class="sp-add-color" value="${previewColor}">
        <select class="sp-add-dash-sel sp-add-dash">
          <option value="solid">실선</option>
          <option value="dashed">파선</option>
          <option value="dotted">점선</option>
        </select>
        <button class="sp-add-btn" disabled>추가</button>
      </div>
      ${extraListHtml ? `<div class="sp-extra-list">${extraListHtml}</div>` : ''}
    </div>`;

  // --- 선 스타일 ---
  panel.querySelector('.sp-apply').addEventListener('click', () => {
    chart.style.stroke = panel.querySelector('.sp-color').value;
    chart.style.dash   = panel.querySelector('.sp-dash').value;
    rebuildUplot(chart);
    panel.remove();
  });
  panel.querySelector('.sp-close-btn').addEventListener('click', () => panel.remove());

  // --- Y축 범위 ---
  panel.querySelector('.sp-yaxis-apply').addEventListener('click', () => {
    const minStr = panel.querySelector('.sp-ymin').value.trim();
    const maxStr = panel.querySelector('.sp-ymax').value.trim();
    chart.yMin = minStr !== '' ? parseFloat(minStr) : null;
    chart.yMax = maxStr !== '' ? parseFloat(maxStr) : null;
    rebuildUplot(chart);
  });

  // --- 채널 추가 ---
  const addGroupSel   = panel.querySelector('.sp-add-group');
  const addChannelSel = panel.querySelector('.sp-add-channel');
  const addBtn        = panel.querySelector('.sp-add-btn');

  addGroupSel.addEventListener('change', () => {
    addChannelSel.innerHTML = '<option value="">-- 항목 선택 --</option>';
    addChannelSel.disabled  = true;
    addBtn.disabled         = true;
    if (!addGroupSel.value) return;
    const g = CHANNEL_GROUPS.find(x => x.id === addGroupSel.value);
    g?.channels.forEach(ch => addChannelSel.appendChild(new Option(ch.label, ch.key)));
    addChannelSel.disabled = false;
  });

  addChannelSel.addEventListener('change', () => {
    addBtn.disabled = !addChannelSel.value;
  });

  addBtn.addEventListener('click', () => {
    const key = addChannelSel.value;
    if (!key) return;
    if (chart.channelKey === key || chart.extraSeries.some(es => es.key === key)) return;
    const g   = CHANNEL_GROUPS.find(x => x.id === addGroupSel.value);
    const def = g?.channels.find(ch => ch.key === key);
    if (!def) return;
    chart.extraSeries.push({
      key:    def.key,
      label:  def.label,
      unit:   def.unit,
      stroke: panel.querySelector('.sp-add-color').value,
      dash:   panel.querySelector('.sp-add-dash-sel').value,
      values: new Array(chart.data.times.length).fill(null),
    });
    paletteIdx++;
    rebuildUplot(chart);
    panel.remove();
    makeStylePanel(chart, anchorEl);
  });

  panel.querySelectorAll('.sp-extra-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      chart.extraSeries.splice(parseInt(btn.dataset.esIdx), 1);
      rebuildUplot(chart);
      panel.remove();
      makeStylePanel(chart, anchorEl);
    });
  });

  anchorEl.appendChild(panel);
}

// ═══════════════════════════════════════════════════════
// 8. POPUP MANAGER
// ═══════════════════════════════════════════════════════
const POPUP_W = 440;
const POPUP_H = 300;
const CASCADE = 30;
const MAX_CASCADE = 9;

function makeTitle(chart) {
  return chart.channelUnit
    ? `${chart.channelLabel} (${chart.channelUnit})`
    : chart.channelLabel;
}

function createPopup(chart, cfg = {}) {
  const offset = (popupCascade % MAX_CASCADE) * CASCADE;
  popupCascade++;

  const px = cfg.left   ?? (100 + offset);
  const py = cfg.top    ?? (80  + offset);
  const pw = cfg.width  ?? POPUP_W;
  const ph = cfg.height ?? POPUP_H;

  const popup = document.createElement('div');
  popup.className = 'chart-popup';
  popup.dataset.chartId = chart.id;
  popup.style.cssText = `left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;z-index:${++popupZCounter};`;

  popup.innerHTML = `
    <div class="popup-titlebar">
      <span class="popup-title">${makeTitle(chart)}</span>
      <div class="popup-controls">
        <button class="pb-style" title="스타일 편집">⚙</button>
        <button class="pb-dock"  title="도킹 (드래그 또는 클릭)">▣</button>
        <button class="pb-close" title="닫기">✕</button>
      </div>
    </div>
    <div class="popup-body"></div>
    <div class="popup-resize"></div>`;

  chart.bodyEl      = popup.querySelector('.popup-body');
  chart.containerEl = popup;
  chart.location    = 'popup';

  popupLayer.appendChild(popup);

  requestAnimationFrame(() => buildUplot(chart.bodyEl, chart));

  attachPopupDrag(popup, chart);
  attachPopupResize(popup);

  popup.querySelector('.pb-style').addEventListener('click', () =>
    makeStylePanel(chart, popup));

  popup.querySelector('.pb-dock').addEventListener('click', () =>
    startDockSelect(chart, popup));

  popup.querySelector('.pb-close').addEventListener('click', () =>
    closeChart(chart));

  popup.addEventListener('mousedown', () => {
    popup.style.zIndex = ++popupZCounter;
  });
}

function attachPopupDrag(popup, chart) {
  const bar = popup.querySelector('.popup-titlebar');
  bar.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();

    const ox = e.clientX - popup.offsetLeft;
    const oy = e.clientY - popup.offsetTop;

    const onMove = e => {
      popup.style.left = `${Math.max(0, e.clientX - ox)}px`;
      popup.style.top  = `${Math.max(0, e.clientY - oy)}px`;

      // detect dock cell under cursor
      popup.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      popup.style.pointerEvents = 'auto';
      const cell = el?.closest('.dock-cell:not(.occupied)');

      if (activeDragCell && activeDragCell !== cell) {
        activeDragCell.classList.remove('drag-over');
        activeDragCell = null;
      }
      if (cell) {
        cell.classList.add('drag-over');
        activeDragCell = cell;
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (activeDragCell) {
        activeDragCell.classList.remove('drag-over');
        dockChart(chart, activeDragCell, popup);
        activeDragCell = null;
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function attachPopupResize(popup) {
  popup.querySelector('.popup-resize').addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const sx = e.clientX, sy = e.clientY;
    const sw = popup.offsetWidth, sh = popup.offsetHeight;

    const onMove = e => {
      popup.style.width  = `${Math.max(280, sw + e.clientX - sx)}px`;
      popup.style.height = `${Math.max(180, sh + e.clientY - sy)}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Click-to-select-cell docking (▣ button)
function startDockSelect(chart, popup) {
  const emptyCells = Array.from(dockArea.querySelectorAll('.dock-cell:not(.occupied)'));
  if (!emptyCells.length) {
    alert('비어 있는 도킹 셀이 없습니다. 배열을 변경하거나 기존 차트를 닫아주세요.');
    return;
  }
  emptyCells.forEach(c => c.classList.add('dock-select-mode'));

  const handler = e => {
    const cell = e.target.closest('.dock-cell.dock-select-mode');
    emptyCells.forEach(c => c.classList.remove('dock-select-mode'));
    document.removeEventListener('click', handler, true);
    if (cell) {
      e.stopPropagation();
      dockChart(chart, cell, popup);
    }
  };
  setTimeout(() => document.addEventListener('click', handler, true), 50);
}

// ═══════════════════════════════════════════════════════
// 9. DOCK MANAGER
// ═══════════════════════════════════════════════════════
function buildDockGrid(layout) {
  const cfg = (typeof layout === 'string') ? GRID_CONFIGS[layout] : layout;
  const { cols, rows } = cfg;
  const totalCells = cols * rows;

  // Undock charts that exceed new cell count
  for (const chart of charts.values()) {
    if (chart.location.startsWith('dock:')) {
      if (parseInt(chart.location.split(':')[1]) >= totalCells)
        undockChart(chart, true);
    }
  }

  dockArea.innerHTML = '';

  // Build alternating track+splitter template
  const colTpl = Array.from({ length: cols }, (_, i) => (i < cols-1 ? '1fr 4px' : '1fr')).join(' ');
  const rowTpl = Array.from({ length: rows }, (_, i) => (i < rows-1 ? '1fr 4px' : '1fr')).join(' ');
  dockArea.style.gridTemplateColumns = colTpl;
  dockArea.style.gridTemplateRows    = rowTpl;

  colSizes = null;
  rowSizes = null;

  // Cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx  = r * cols + c;
      const cell = document.createElement('div');
      cell.className = 'dock-cell';
      cell.dataset.cellIndex = idx;
      cell.style.gridColumn  = `${c * 2 + 1}`;
      cell.style.gridRow     = `${r * 2 + 1}`;
      setPlaceholder(cell);
      dockArea.appendChild(cell);
    }
  }

  // Vertical splitters (between columns)
  for (let c = 0; c < cols - 1; c++) {
    const vs = document.createElement('div');
    vs.className = 'cell-splitter v-split';
    vs.style.gridColumn = `${c * 2 + 2}`;
    vs.style.gridRow    = `1 / ${rows * 2}`;
    dockArea.appendChild(vs);
    attachSplitter(vs, 'col', c);
  }

  // Horizontal splitters (between rows)
  for (let r = 0; r < rows - 1; r++) {
    const hs = document.createElement('div');
    hs.className = 'cell-splitter h-split';
    hs.style.gridRow    = `${r * 2 + 2}`;
    hs.style.gridColumn = `1 / ${cols * 2}`;
    dockArea.appendChild(hs);
    attachSplitter(hs, 'row', r);
  }

  // Re-insert charts that still fit
  for (const chart of charts.values()) {
    if (chart.location.startsWith('dock:')) {
      const idx  = parseInt(chart.location.split(':')[1]);
      const cell = dockArea.querySelector(`[data-cell-index="${idx}"]`);
      if (cell) insertIntoCell(chart, cell);
    }
  }

  currentGrid = (typeof layout === 'string') ? layout : `${cols}x${rows}`;
}

function resolvedSizes(axis) {
  const prop = axis === 'col' ? 'gridTemplateColumns' : 'gridTemplateRows';
  const raw  = getComputedStyle(dockArea)[prop];
  return raw.split(' ')
    .filter(s => s !== '4px')
    .map(s => parseFloat(s));
}

function attachSplitter(el, axis, idx) {
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();

    const sizes = resolvedSizes(axis);
    const startMouse = axis === 'col' ? e.clientX : e.clientY;
    const a0 = sizes[idx], b0 = sizes[idx + 1];
    const MIN = 80;

    const update = sizes => {
      const parts = [];
      sizes.forEach((s, i) => { parts.push(`${s}px`); if (i < sizes.length-1) parts.push('4px'); });
      const tpl = parts.join(' ');
      if (axis === 'col') dockArea.style.gridTemplateColumns = tpl;
      else                dockArea.style.gridTemplateRows    = tpl;
    };

    const onMove = e => {
      const delta = (axis === 'col' ? e.clientX : e.clientY) - startMouse;
      const newA  = Math.max(MIN, Math.min(a0 + b0 - MIN, a0 + delta));
      sizes[idx]   = newA;
      sizes[idx+1] = a0 + b0 - newA;
      update(sizes);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function dockChart(chart, cell, popupEl) {
  if (!cell || cell.classList.contains('occupied')) return;
  const idx = parseInt(cell.dataset.cellIndex);
  destroyUplot(chart);
  popupEl?.remove();
  chart.location = `dock:${idx}`;
  insertIntoCell(chart, cell);
  scheduleSave();
}

function insertIntoCell(chart, cell) {
  cell.classList.add('occupied');
  cell.innerHTML = `
    <div class="cell-header">
      <span class="cell-title">${makeTitle(chart)}</span>
      <div class="cell-controls">
        <button class="cc-style" title="스타일">⚙</button>
        <button class="cc-undock" title="팝업으로">↗</button>
        <button class="cc-close" title="제거">✕</button>
      </div>
    </div>
    <div class="cell-body"></div>`;

  chart.bodyEl      = cell.querySelector('.cell-body');
  chart.containerEl = cell;

  requestAnimationFrame(() => buildUplot(chart.bodyEl, chart));

  cell.querySelector('.cc-style').addEventListener('click', () =>
    makeStylePanel(chart, cell.querySelector('.cell-header')));

  cell.querySelector('.cc-undock').addEventListener('click', () =>
    undockChart(chart, true));

  cell.querySelector('.cc-close').addEventListener('click', () => {
    closeChart(chart);
  });
}

function setPlaceholder(cell) {
  cell.classList.remove('occupied');
  cell.innerHTML = `
    <div class="cell-placeholder">
      <span class="ph-icon">📈</span>
      <span>차트를 여기에 드래그하거나<br>▣ 버튼을 클릭하세요</span>
    </div>`;
}

function undockChart(chart, showPopup) {
  if (!chart.location.startsWith('dock:')) return;
  const idx  = parseInt(chart.location.split(':')[1]);
  const cell = dockArea.querySelector(`[data-cell-index="${idx}"]`);
  destroyUplot(chart);
  chart.location = 'popup';
  if (cell) setPlaceholder(cell);
  if (showPopup) createPopup(chart);
  scheduleSave();
}

function closeChart(chart) {
  destroyUplot(chart);
  if (chart.location === 'popup') {
    chart.containerEl?.remove();
  } else if (chart.location.startsWith('dock:')) {
    const idx  = parseInt(chart.location.split(':')[1]);
    const cell = dockArea.querySelector(`[data-cell-index="${idx}"]`);
    if (cell) setPlaceholder(cell);
  }
  charts.delete(chart.id);
  if (charts.size === 0) { popupCascade = 0; paletteIdx = 0; }
  setUdpConnected(udpConnected);
  scheduleSave();
}

// ═══════════════════════════════════════════════════════
// 10. TOOLBAR
// ═══════════════════════════════════════════════════════
function initToolbar() {
  const selGroup   = document.getElementById('sel-group');
  const selChannel = document.getElementById('sel-channel');
  const btnChart   = document.getElementById('btn-chart');

  CHANNEL_GROUPS.forEach(g => selGroup.appendChild(new Option(g.label, g.id)));

  selGroup.addEventListener('change', () => {
    selChannel.innerHTML = '<option value="">-- 항목 선택 --</option>';
    selChannel.disabled  = true;
    btnChart.disabled    = true;
    if (!selGroup.value) return;
    const g = CHANNEL_GROUPS.find(x => x.id === selGroup.value);
    g?.channels.forEach(ch => selChannel.appendChild(new Option(ch.label, ch.key)));
    selChannel.disabled = false;
  });

  selChannel.addEventListener('change', () => {
    btnChart.disabled = !selChannel.value;
  });

  btnChart.addEventListener('click', () => {
    const key = selChannel.value;
    if (!key) return;

    // 이미 팝업으로 열려 있으면 최상위로
    for (const c of charts.values()) {
      if (c.channelKey === key && c.location === 'popup') {
        c.containerEl.style.zIndex = ++popupZCounter;
        return;
      }
    }

    const g   = CHANNEL_GROUPS.find(x => x.id === selGroup.value);
    const def = g?.channels.find(ch => ch.key === key);
    if (!def) return;

    const chart = {
      id: ++chartIdSeq,
      channelKey:   def.key,
      channelLabel: def.label,
      channelUnit:  def.unit,
      style:       { stroke: nextColor(), dash: 'solid' },
      data:        { times: [], values: [] },
      extraSeries: [],
      yMin: null,
      yMax: null,
      uplot: null, _ro: null,
      location: 'popup',
      bodyEl: null, containerEl: null,
    };

    charts.set(chart.id, chart);
    createPopup(chart);
    scheduleSave();
  });

  document.getElementById('btn-external-window')?.addEventListener('click', () => {
    window.open(
      '/chart/external/',
      '_blank',
      `width=${screen.width > 1920 ? 1200 : 960},height=800,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no`
    );
  });

  document.querySelectorAll('.btn-grid').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-grid').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildDockGrid(btn.dataset.grid);
      scheduleSave();
    });
  });

  const colsInput  = document.getElementById('grid-cols-input');
  const rowsInput  = document.getElementById('grid-rows-input');
  const btnCustom  = document.getElementById('btn-grid-custom');

  btnCustom.addEventListener('click', () => {
    const cols = Math.max(1, Math.min(8, parseInt(colsInput.value) || 2));
    const rows = Math.max(1, Math.min(6, parseInt(rowsInput.value) || 2));
    colsInput.value = cols;
    rowsInput.value = rows;
    document.querySelectorAll('.btn-grid').forEach(b => b.classList.remove('active'));
    buildDockGrid({ cols, rows });
    scheduleSave();
  });
}

// ═══════════════════════════════════════════════════════
// 11. LAYOUT SAVE / LOAD
// ═══════════════════════════════════════════════════════

// --- Auto-save (sessionStorage) ---

function saveSessionLayout() {
  if (charts.size === 0) {
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, generateIni());
  }
}

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveSessionLayout, 300);
}

function restoreSessionLayout() {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) applyIni(saved);
}

// --- Clear confirm modal ---

function initClearButton() {
  const modal = document.createElement('div');
  modal.id = 'clear-confirm-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="ccm-box">
      <div class="ccm-title">⚠ 차트 초기화</div>
      <div class="ccm-msg">현재 모든 차트 구성이 삭제됩니다.<br>계속하시겠습니까?</div>
      <div class="ccm-btns">
        <button id="ccm-cancel">취소</button>
        <button id="ccm-confirm">초기화</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
  modal.querySelector('#ccm-cancel').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.querySelector('#ccm-confirm').addEventListener('click', () => {
    for (const c of Array.from(charts.values())) closeChart(c);
    buildDockGrid('2x2');
    document.querySelectorAll('.btn-grid').forEach(b => {
      b.classList.toggle('active', b.dataset.grid === '2x2');
    });
    sessionStorage.removeItem(SESSION_KEY);
    modal.style.display = 'none';
  });

  document.getElementById('btn-clear-layout').addEventListener('click', () => {
    modal.style.display = 'flex';
  });
}

function parseCurrentGridCfg() {
  const parts = currentGrid.split('x');
  return { cols: parseInt(parts[0]) || 2, rows: parseInt(parts[1]) || 2 };
}

function parseIni(text) {
  const result = {};
  let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === ';' || line[0] === '#') continue;
    const secMatch = line.match(/^\[(.+)\]$/);
    if (secMatch) { section = secMatch[1]; result[section] = {}; continue; }
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && section) {
      result[section][line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
    }
  }
  return result;
}

function generateIni() {
  const lines = [];
  const { cols, rows } = parseCurrentGridCfg();

  lines.push('[layout]');
  lines.push(`grid_cols=${cols}`);
  lines.push(`grid_rows=${rows}`);
  lines.push('');

  const chartArr = Array.from(charts.values());
  lines.push('[charts]');
  lines.push(`count=${chartArr.length}`);
  lines.push('');

  chartArr.forEach((c, i) => {
    lines.push(`[chart_${i}]`);
    lines.push(`location=${c.location}`);
    if (c.location.startsWith('dock:')) {
      lines.push(`cell_index=${c.location.split(':')[1]}`);
    } else if (c.containerEl) {
      lines.push(`popup_left=${c.containerEl.offsetLeft}`);
      lines.push(`popup_top=${c.containerEl.offsetTop}`);
      lines.push(`popup_width=${c.containerEl.offsetWidth}`);
      lines.push(`popup_height=${c.containerEl.offsetHeight}`);
    }
    lines.push(`channel_key=${c.channelKey}`);
    lines.push(`channel_label=${c.channelLabel}`);
    lines.push(`channel_unit=${c.channelUnit}`);
    lines.push(`stroke=${c.style.stroke}`);
    lines.push(`dash=${c.style.dash}`);
    lines.push(`y_min=${c.yMin ?? ''}`);
    lines.push(`y_max=${c.yMax ?? ''}`);
    lines.push(`extra_count=${c.extraSeries.length}`);
    lines.push('');

    c.extraSeries.forEach((es, j) => {
      lines.push(`[chart_${i}_extra_${j}]`);
      lines.push(`key=${es.key}`);
      lines.push(`label=${es.label}`);
      lines.push(`unit=${es.unit}`);
      lines.push(`stroke=${es.stroke}`);
      lines.push(`dash=${es.dash}`);
      lines.push('');
    });
  });

  return lines.join('\n');
}

function downloadIni(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}.ini`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyIni(iniText) {
  const ini = parseIni(iniText);
  if (!ini.layout || !ini.charts) return;

  for (const c of Array.from(charts.values())) closeChart(c);

  const cols = parseInt(ini.layout.grid_cols) || 2;
  const rows = parseInt(ini.layout.grid_rows) || 2;
  buildDockGrid({ cols, rows });

  const count = parseInt(ini.charts.count) || 0;
  for (let i = 0; i < count; i++) {
    const sec = ini[`chart_${i}`];
    if (!sec?.channel_key) continue;

    const extraCount  = parseInt(sec.extra_count) || 0;
    const extraSeries = [];
    for (let j = 0; j < extraCount; j++) {
      const esec = ini[`chart_${i}_extra_${j}`];
      if (!esec?.key) continue;
      extraSeries.push({
        key:    esec.key,
        label:  esec.label  || esec.key,
        unit:   esec.unit   || '',
        stroke: esec.stroke || nextColor(),
        dash:   esec.dash   || 'solid',
        values: [],
      });
    }

    const yMinRaw = sec.y_min !== '' ? parseFloat(sec.y_min) : null;
    const yMaxRaw = sec.y_max !== '' ? parseFloat(sec.y_max) : null;

    const chart = {
      id:           ++chartIdSeq,
      channelKey:   sec.channel_key,
      channelLabel: sec.channel_label || sec.channel_key,
      channelUnit:  sec.channel_unit  || '',
      style:        { stroke: sec.stroke || nextColor(), dash: sec.dash || 'solid' },
      data:         { times: [], values: [] },
      extraSeries,
      yMin: (yMinRaw != null && !isNaN(yMinRaw)) ? yMinRaw : null,
      yMax: (yMaxRaw != null && !isNaN(yMaxRaw)) ? yMaxRaw : null,
      uplot: null, _ro: null,
      location: 'popup',
      bodyEl: null, containerEl: null,
    };

    charts.set(chart.id, chart);

    if (sec.location?.startsWith('dock')) {
      const cellIdx = parseInt(sec.cell_index);
      const cell    = dockArea.querySelector(`[data-cell-index="${cellIdx}"]`);
      if (cell && !cell.classList.contains('occupied')) {
        chart.location = `dock:${cellIdx}`;
        insertIntoCell(chart, cell);
        continue;
      }
    }

    createPopup(chart, {
      left:   parseInt(sec.popup_left)   || undefined,
      top:    parseInt(sec.popup_top)    || undefined,
      width:  parseInt(sec.popup_width)  || undefined,
      height: parseInt(sec.popup_height) || undefined,
    });
  }
  scheduleSave();
}

function initSaveLoad() {
  const modal = document.createElement('div');
  modal.id = 'layout-save-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="lsm-box">
      <div class="lsm-title">레이아웃 저장</div>
      <div class="lsm-row">
        <input type="text" id="lsm-filename" placeholder="layout" maxlength="80" autocomplete="off">
        <span class="lsm-ext">.ini</span>
      </div>
      <div class="lsm-btns">
        <button id="lsm-cancel">취소</button>
        <button id="lsm-confirm">저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const filenameInput = modal.querySelector('#lsm-filename');

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
  });
  modal.querySelector('#lsm-cancel').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.querySelector('#lsm-confirm').addEventListener('click', () => {
    const name = filenameInput.value.trim() || 'layout';
    downloadIni(name, generateIni());
    modal.style.display = 'none';
  });
  filenameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  modal.querySelector('#lsm-confirm').click();
    if (e.key === 'Escape') modal.style.display = 'none';
  });

  document.getElementById('btn-save-layout').addEventListener('click', () => {
    filenameInput.value = '';
    modal.style.display = 'flex';
    filenameInput.focus();
  });

  const fileInput = document.getElementById('layout-file-input');
  document.getElementById('btn-load-layout').addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => applyIni(e.target.result);
    reader.readAsText(file, 'utf-8');
  });
}

// ═══════════════════════════════════════════════════════
// 12. INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  dockArea   = document.getElementById('dock-area');
  popupLayer = document.createElement('div');
  popupLayer.id = 'popup-layer';
  document.body.appendChild(popupLayer);

  // BroadcastChannel 설정
  flightBC = new BroadcastChannel('flight-data-bc');
  if (IS_EXTERNAL) {
    // 외부창: BroadcastChannel 수신 → 로컬 flightData 이벤트로 재발행
    flightBC.onmessage = e => {
      window.dispatchEvent(new CustomEvent('flightData', { detail: e.data }));
    };
  } else {
    // 메인창: flightData를 외부창으로 브로드캐스트
    window.addEventListener('flightData', e => flightBC.postMessage(e.detail));
  }

  initTooltip();
  initToolbar();
  initSaveLoad();
  initClearButton();
  buildDockGrid('2x2');
  restoreSessionLayout();
  window.addEventListener('flightData', onFlightData);
});
