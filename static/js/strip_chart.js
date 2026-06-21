'use strict';

// ─── 9개 차트 프리셋 ─────────────────────────────────────────────────────────
// extract(d): WebSocket 페이로드 → 수치값 (없으면 null)
// d.params.{group_name}.{field_name} 구조로 접근
const CHART_PRESETS = {
  1: {
    label: 'Phi / Theta / Psi',
    series: [
      { key: 'phi',   label: 'Phi °',    stroke: '#ce93d8', extract: d => d.roll    ?? null },
      { key: 'theta', label: 'Theta °',  stroke: '#ffb74d', extract: d => d.pitch   ?? null },
      { key: 'psi',   label: 'Psi °',    stroke: '#f48fb1', extract: d => d.heading ?? null },
    ],
  },
  2: {
    label: 'P / Q / R',
    series: [
      { key: 'p', label: 'P °/s', stroke: '#ef5350', extract: d => d.params?.angular_rate?.p_deg_s ?? null },
      { key: 'q', label: 'Q °/s', stroke: '#42a5f5', extract: d => d.params?.angular_rate?.q_deg_s ?? null },
      { key: 'r', label: 'R °/s', stroke: '#26c6da', extract: d => d.params?.angular_rate?.r_deg_s ?? null },
    ],
  },
  3: {
    label: 'Ṗ / Q̇ / Ṙ  (Angular Accel)',
    series: [
      { key: 'pdot', label: 'Ṗ °/s²', stroke: '#ff7043', extract: d => d.params?.angular_accel?.p_dot ?? null },
      { key: 'qdot', label: 'Q̇ °/s²', stroke: '#66bb6a', extract: d => d.params?.angular_accel?.q_dot ?? null },
      { key: 'rdot', label: 'Ṙ °/s²', stroke: '#ab47bc', extract: d => d.params?.angular_accel?.r_dot ?? null },
    ],
  },
  4: {
    label: 'Control Surface',
    series: [
      { key: 'elev_fc', label: 'Elevator', stroke: '#ffa726', extract: d => d.params?.flight_control_surface?.elevator_fc ?? null },
      { key: 'ail_fc',  label: 'Aileron',  stroke: '#26a69a', extract: d => d.params?.flight_control_surface?.aileron_fc  ?? null },
      { key: 'rud_fc',  label: 'Rudder',   stroke: '#ec407a', extract: d => d.params?.flight_control_surface?.rudder_fc   ?? null },
    ],
  },
  5: {
    label: 'IAS / TAS / GS',
    series: [
      { key: 'ias', label: 'IAS kt', stroke: '#81c784', extract: d => d.ias_kt ?? null },
      { key: 'tas', label: 'TAS kt', stroke: '#4fc3f7', extract: d => d.tas_kt ?? null },
      { key: 'gs',  label: 'GS kt',  stroke: '#fff176', extract: d => d.gs_kt  ?? null },
    ],
  },
  6: {
    label: 'Alt / VVI',
    series: [
      { key: 'alt', label: 'Alt ft',  stroke: '#4fc3f7', extract: d => d.alt_ft   ?? null },
      { key: 'vvi', label: 'VVI fpm', stroke: '#80cbc4', extract: d => d.vvi_fpm  ?? null },
    ],
  },
  7: {
    label: 'AOA / Beta / Sideslip',
    series: [
      { key: 'aoa',      label: 'AOA °',      stroke: '#ffca28', extract: d => d.aoa_deg  ?? null },
      { key: 'beta',     label: 'Beta °',     stroke: '#ff7043', extract: d => d.beta_deg ?? null },
      { key: 'sideslip', label: 'Sideslip °', stroke: '#ab47bc', extract: d => d.params?.aoa?.sideslip_deg ?? null },
    ],
  },
  8: {
    label: 'Pilot Stick Input',
    series: [
      { key: 'elev_cmd', label: 'Elevator', stroke: '#ffa726', extract: d => d.params?.pilot_stick?.elevator_cmd ?? null },
      { key: 'ail_cmd',  label: 'Aileron',  stroke: '#26a69a', extract: d => d.params?.pilot_stick?.aileron_cmd  ?? null },
      { key: 'rud_cmd',  label: 'Rudder',   stroke: '#ec407a', extract: d => d.params?.pilot_stick?.rudder_cmd   ?? null },
    ],
  },
  9: {
    label: 'G-Load',
    series: [
      { key: 'g_norm',  label: 'Normal G', stroke: '#ef5350', extract: d => d.g_normal ?? null },
      { key: 'g_axial', label: 'Axial G',  stroke: '#42a5f5', extract: d => d.params?.mach?.gload_axial ?? null },
      { key: 'g_side',  label: 'Side G',   stroke: '#26c6da', extract: d => d.params?.mach?.gload_side  ?? null },
    ],
  },
};

// ─── 상태 ────────────────────────────────────────────────────────────────────
const MAX_SLOTS  = 4;
let windowSec    = 60;
let frameCount   = 0;

// 활성 슬롯: 인덱스 0~3 → presetId | null
const activeSlots = [1, 2, 3, 4];

// 공유 타임스탬프 버퍼
const bufTs = [];

// 데이터 버퍼: presetId → { key → Float64Array-like [] }
// 비활성화 시 삭제 → 재활성화 시 null로 패딩하여 재생성
const bufData = {};

// uPlot 인스턴스: slot index 0~3
const charts = [null, null, null, null];

// ─── 버퍼 초기화 ─────────────────────────────────────────────────────────────
function ensureBuffer(presetId) {
  if (bufData[presetId]) return;
  const preset = CHART_PRESETS[presetId];
  bufData[presetId] = {};
  for (const s of preset.series) {
    // 현재 bufTs 길이만큼 null로 채워 타임라인 동기화
    bufData[presetId][s.key] = new Array(bufTs.length).fill(null);
  }
}

// ─── uPlot 생성 ──────────────────────────────────────────────────────────────
function createChart(slotIdx, presetId) {
  const preset  = CHART_PRESETS[presetId];
  const bodyEl  = document.getElementById(`slot-chart-${slotIdx}`);
  const titleEl = document.getElementById(`slot-title-${slotIdx}`);
  const badgeEl = document.getElementById(`slot-badge-${slotIdx}`);

  bodyEl.innerHTML = '';
  titleEl.textContent = preset.label;
  badgeEl.textContent = presetId;
  badgeEl.classList.remove('empty');

  ensureBuffer(presetId);

  const w = bodyEl.clientWidth  || 400;
  const h = bodyEl.clientHeight || 200;

  const opts = {
    width:  w,
    height: h,
    series: [
      { label: 'time' },
      ...preset.series.map(s => ({
        label:    s.label,
        stroke:   s.stroke,
        width:    1.5,
        spanGaps: false,
      })),
    ],
    axes: [
      {
        stroke: '#666',
        ticks:  { stroke: '#444', width: 0.5 },
        grid:   { stroke: '#2a2a4a', width: 0.5 },
        size:   30,
      },
      {
        stroke: '#888',
        ticks:  { stroke: '#444', width: 0.5 },
        grid:   { stroke: '#2a2a4a', width: 0.5 },
        size:   52,
      },
    ],
    scales: {
      x: {},
      y: {
        // Y축 범위: ±ceil(maxAbs / 10) × 10
        // 데이터 최대 절댓값을 10 단위로 올림한 대칭 범위
        range: (_u, dataMin, dataMax) => {
          const lo     = isFinite(dataMin) ? dataMin : 0;
          const hi     = isFinite(dataMax) ? dataMax : 0;
          const maxAbs = Math.max(Math.abs(lo), Math.abs(hi));
          const yRange = maxAbs > 0 ? Math.ceil(maxAbs / 10) * 10 : 10;
          return [-yRange, yRange];
        },
      },
    },
    cursor: { show: true },
    legend: { show: true, live: false },
    padding: [8, 8, 0, 0],
  };

  charts[slotIdx] = new uPlot(opts, [
    bufTs,
    ...preset.series.map(s => bufData[presetId][s.key]),
  ], bodyEl);
}

// ─── 슬롯 비우기 ─────────────────────────────────────────────────────────────
function clearSlot(slotIdx) {
  const presetId = activeSlots[slotIdx];

  if (charts[slotIdx]) {
    charts[slotIdx].destroy();
    charts[slotIdx] = null;
  }
  // 비활성화된 프리셋 버퍼 삭제 (재활성화 시 null-fill로 재생성)
  if (presetId !== null) delete bufData[presetId];

  const bodyEl  = document.getElementById(`slot-chart-${slotIdx}`);
  const titleEl = document.getElementById(`slot-title-${slotIdx}`);
  const badgeEl = document.getElementById(`slot-badge-${slotIdx}`);

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="panel-empty">
        <span class="empty-icon">📈</span>
        <span>번호 버튼으로 차트를 선택하세요</span>
      </div>`;
  }
  if (titleEl) titleEl.textContent = '비어있음';
  if (badgeEl) { badgeEl.textContent = '—'; badgeEl.classList.add('empty'); }
}

// ─── 프리셋 토글 ─────────────────────────────────────────────────────────────
function togglePreset(presetId) {
  const existingSlot = activeSlots.indexOf(presetId);

  if (existingSlot !== -1) {
    // 비활성화
    clearSlot(existingSlot);
    activeSlots[existingSlot] = null;
  } else {
    // 빈 슬롯 찾기
    const emptySlot = activeSlots.indexOf(null);
    if (emptySlot === -1) {
      // 4개 이미 사용 중 → 버튼 흔들기
      const btn = document.querySelector(`.preset-btn[data-preset="${presetId}"]`);
      if (btn) {
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 400);
      }
      return;
    }
    activeSlots[emptySlot] = presetId;
    createChart(emptySlot, presetId);
  }

  updateBtnStates();
  requestAnimationFrame(resizeAllCharts);
}

// ─── 버튼 활성 상태 동기화 ───────────────────────────────────────────────────
function updateBtnStates() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    const id = parseInt(btn.dataset.preset, 10);
    btn.classList.toggle('active', activeSlots.includes(id));
  });
}

// ─── 전체 차트 크기 조정 ─────────────────────────────────────────────────────
function resizeAllCharts() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!charts[i]) continue;
    const bodyEl = document.getElementById(`slot-chart-${i}`);
    if (!bodyEl) continue;
    const w = bodyEl.clientWidth;
    const h = bodyEl.clientHeight;
    if (w > 0 && h > 0) charts[i].setSize({ width: w, height: h });
  }
}

// ─── WebSocket 데이터 수신 (10Hz 데시메이션) ─────────────────────────────────
window.addEventListener('flightData', (e) => {
  frameCount++;
  if (frameCount % 5 !== 0) return;  // 50Hz → 10Hz

  const d      = e.detail;
  const now    = d.ts ?? Date.now() / 1000;
  const cutoff = now - windowSec;

  bufTs.push(now);

  // 활성 슬롯의 프리셋 버퍼에 데이터 추가
  for (const presetId of activeSlots) {
    if (presetId === null) continue;
    ensureBuffer(presetId);
    for (const s of CHART_PRESETS[presetId].series) {
      bufData[presetId][s.key].push(s.extract(d));
    }
  }

  // 윈도우 초과 데이터 제거
  while (bufTs.length > 0 && bufTs[0] < cutoff) {
    bufTs.shift();
    for (const buf of Object.values(bufData)) {
      for (const arr of Object.values(buf)) arr.shift();
    }
  }

  // 차트 업데이트
  for (let i = 0; i < MAX_SLOTS; i++) {
    const presetId = activeSlots[i];
    if (!charts[i] || presetId === null) continue;
    const preset = CHART_PRESETS[presetId];
    charts[i].setData([
      bufTs,
      ...preset.series.map(s => bufData[presetId][s.key]),
    ]);
  }
});

// ─── 툴바 이벤트 ─────────────────────────────────────────────────────────────
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    togglePreset(parseInt(btn.dataset.preset, 10));
  });
});

document.getElementById('window-select')?.addEventListener('change', e => {
  windowSec = parseInt(e.target.value, 10);
  // 버퍼 초기화
  bufTs.length = 0;
  for (const buf of Object.values(bufData)) {
    for (const arr of Object.values(buf)) arr.length = 0;
  }
});

window.addEventListener('resize', () => requestAnimationFrame(resizeAllCharts));

// ─── 초기 렌더링 ─────────────────────────────────────────────────────────────
(function init() {
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (activeSlots[i] !== null) createChart(i, activeSlots[i]);
  }
  // 레이아웃 완료 후 크기 맞춤
  requestAnimationFrame(() => requestAnimationFrame(resizeAllCharts));
})();
