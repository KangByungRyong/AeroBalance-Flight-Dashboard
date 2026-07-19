'use strict';

// ─── 지도 초기화 (읽기 전용 — 선택한 FPL 경로만 표시) ────────
const TILE_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors';

const map = L.map('inj-map', { zoomControl: true }).setView([36.5, 127.5], 7);
L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, subdomains: 'abc' }).addTo(map);

const ROUTE_COLOR = '#4ea8de';
const routeLine = L.polyline([], { color: ROUTE_COLOR, weight: 2, dashArray: '6 4' }).addTo(map);
let routeMarkers = [];

function makeFixIcon(label, color) {
  const html = `<div class="fp-fix-marker">
    <div class="fp-fix-dot" style="background:${color}"></div>
    <div class="fp-fix-label">${label}</div>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [1, 1], iconAnchor: [0, 0] });
}

function drawPlanRoute(plan) {
  routeMarkers.forEach((m) => map.removeLayer(m));
  routeMarkers = [];

  const pts = [];
  const dep = L.marker([plan.departure.lat, plan.departure.lon], { icon: makeFixIcon('DEP', '#2ecc71') }).addTo(map);
  routeMarkers.push(dep);
  pts.push([plan.departure.lat, plan.departure.lon]);

  plan.waypoints.forEach((wp, i) => {
    const m = L.marker([wp.lat, wp.lon], { icon: makeFixIcon(`WP${i + 1}`, '#f39c12') }).addTo(map);
    routeMarkers.push(m);
    pts.push([wp.lat, wp.lon]);
  });

  const arr = L.marker([plan.arrival.lat, plan.arrival.lon], { icon: makeFixIcon('ARR', '#e94560') }).addTo(map);
  routeMarkers.push(arr);
  pts.push([plan.arrival.lat, plan.arrival.lon]);

  routeLine.setLatLngs(pts);
  const bounds = routeLine.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
}

function getCsrf() {
  return document.querySelector('[name=csrfmiddlewaretoken]')?.value ?? '';
}

// ─── Flight Plan 선택 ─────────────────────────────────────────
const planSelect = document.getElementById('inj-plan-select');
planSelect.addEventListener('change', async () => {
  const id = planSelect.value;
  if (!id) return;
  const resp = await fetch(`/flight-planning/${id}/`);
  if (!resp.ok) { alert('Flight Plan을 불러오지 못했습니다.'); return; }
  const plan = await resp.json();
  drawPlanRoute(plan);
});

// ─── 대상 Model 목록 (RUN + UDP 연결 정상만 선택 가능) ────────
const modelSelect = document.getElementById('inj-model-select');
const callsignInput = document.getElementById('inj-callsign');
const offsetInput = document.getElementById('inj-offset-min');

async function refreshModels() {
  const resp = await fetch('/absim/api/models/');
  if (!resp.ok) return;
  const data = await resp.json();
  const models = data.models || [];
  const prevValue = modelSelect.value;

  modelSelect.innerHTML = '<option value="">선택하세요</option>';
  models.forEach((m) => {
    const available = m.process_running && m.udp_connected;
    const opt = document.createElement('option');
    opt.value = m.model;
    opt.textContent = `${m.model}${m.callsign ? ` (${m.callsign})` : ''}${available ? '' : ' — 사용 불가'}`;
    opt.disabled = !available;
    modelSelect.appendChild(opt);
  });

  if (prevValue) modelSelect.value = prevValue;
}

modelSelect.addEventListener('change', () => {
  if (modelSelect.value && !callsignInput.value) {
    callsignInput.value = modelSelect.value;
  }
});

refreshModels();
setInterval(refreshModels, 2000);

// ─── 미리보기 / 전송 ──────────────────────────────────────────
function buildRequestPayload(force) {
  return {
    flight_plan_id: planSelect.value ? parseInt(planSelect.value, 10) : null,
    target_model: modelSelect.value,
    callsign: callsignInput.value.trim(),
    departure_offset_min: parseFloat(offsetInput.value) || 0,
    force: !!force,
  };
}

function validateSelection() {
  if (!planSelect.value) { alert('Flight Plan을 선택하세요.'); return false; }
  if (!modelSelect.value) { alert('대상 Model을 선택하세요.'); return false; }
  const offset = parseFloat(offsetInput.value);
  if (isNaN(offset) || offset < 0) { alert('Departure Offset은 0 이상의 숫자로 입력하세요.'); return false; }
  return true;
}

document.getElementById('inj-preview-btn').addEventListener('click', async () => {
  if (!validateSelection()) return;
  const resp = await fetch('/flight-plan-injection/preview/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(buildRequestPayload(false)),
  });
  const data = await resp.json();
  const pre = document.getElementById('inj-preview-json');
  if (resp.ok) {
    pre.textContent = JSON.stringify(data.payload, null, 2);
  } else {
    pre.textContent = `오류: ${data.error}`;
  }
});

function prependHistoryRow({ injected_at, flight_plan_name, target_model, callsign, gufi_id, success, error }) {
  const tbody = document.getElementById('inj-history-tbody');
  const tr = document.createElement('tr');
  const ts = injected_at ? injected_at.replace('T', ' ').slice(0, 19) : '';
  tr.innerHTML = `
    <td>${ts}</td>
    <td>${flight_plan_name}</td>
    <td>${target_model}</td>
    <td>${callsign}</td>
    <td>${gufi_id}</td>
    <td>${success ? '<span class="inj-ok">성공</span>' : '<span class="inj-fail">실패</span>'}</td>
    <td>${error || ''}</td>
  `;
  tbody.insertBefore(tr, tbody.firstChild);
}

async function sendInjection(force) {
  const planName = planSelect.options[planSelect.selectedIndex]?.textContent ?? '';
  const payload = buildRequestPayload(force);

  const resp = await fetch('/flight-plan-injection/send/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  const resultEl = document.getElementById('inj-result');

  if (resp.status === 409 && data.duplicate) {
    if (confirm('이미 이 Model로 전송된 Flight Plan입니다. 강제로 다시 전송하시겠습니까?')) {
      await sendInjection(true);
    }
    return;
  }

  if (!resp.ok) {
    resultEl.textContent = `전송 실패: ${data.error}`;
    resultEl.className = 'inj-result fail';
    return;
  }

  resultEl.textContent = data.success
    ? `전송 성공 (GufiID: ${data.gufi_id})`
    : `Dashboard relay 실패: ${data.error}`;
  resultEl.className = `inj-result ${data.success ? 'ok' : 'fail'}`;

  prependHistoryRow({
    injected_at: data.injected_at,
    flight_plan_name: planName,
    target_model: payload.target_model,
    callsign: payload.callsign,
    gufi_id: data.gufi_id,
    success: data.success,
    error: data.error,
  });
}

document.getElementById('inj-send-btn').addEventListener('click', () => {
  if (!validateSelection()) return;
  sendInjection(false);
});
