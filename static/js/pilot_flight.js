'use strict';

// ─── Pilot Flight — Pilot 선택 + Callsign + FPL 불러오기(Map) + Edit Box +
//     .fms 생성/다운로드 + 데이터 저장 시작 (CLAUDE.md §10) ─────────────────

function getCsrf() {
  return document.querySelector('[name=csrfmiddlewaretoken]')?.value ?? '';
}

// ─── 지도 초기화 ──────────────────────────────────────────────
const TILE_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors';

const map = L.map('pf-map', { zoomControl: true }).setView([36.5, 127.5], 7);
L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, subdomains: 'abc' }).addTo(map);

const ROUTE_COLOR = '#4ea8de';
const routeLine = L.polyline([], { color: ROUTE_COLOR, weight: 2, dashArray: '6 4' }).addTo(map);

function makeFixIcon(label, color) {
  const html = `<div class="fp-fix-marker">
    <div class="fp-fix-dot" style="background:${color}"></div>
    <div class="fp-fix-label">${label}</div>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [1, 1], iconAnchor: [0, 0] });
}

// ─── 상태 (불러온 Flight Plan 메타 + 편집 가능한 좌표) ─────────
const state = {
  planId: null,
  name: '',
  aircraftType: '',
  dep: '',
  arr: '',
  eta: null,
  departure: null, // { name, lat, lon, alt, velocity, marker }
  arrival: null,
  waypoints: [],   // [{ name, lat, lon, alt, velocity, marker }]
};

// ─── 컨텍스트 메뉴 (지도 우클릭으로 좌표 조정) ─────────────────
const ctxMenu = document.getElementById('pf-context-menu');
const mapWrapper = document.getElementById('pf-map-wrapper');

function showContextMenu(originalEvent, items) {
  ctxMenu.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'fp-menu-item';
    div.textContent = item.label;
    div.addEventListener('click', () => { item.action(); hideContextMenu(); });
    ctxMenu.appendChild(div);
  });
  const rect = mapWrapper.getBoundingClientRect();
  ctxMenu.style.left = `${originalEvent.clientX - rect.left}px`;
  ctxMenu.style.top = `${originalEvent.clientY - rect.top}px`;
  ctxMenu.style.display = 'block';
}
function hideContextMenu() { ctxMenu.style.display = 'none'; }
document.addEventListener('click', hideContextMenu);

map.on('contextmenu', (e) => {
  if (freeFlightCheck.checked) return;
  const items = [];
  if (!state.departure) {
    items.push({ label: '출발점 지정', action: () => setDeparture(e.latlng) });
  } else if (!state.arrival) {
    items.push({ label: '경유점 추가', action: () => addWaypoint(e.latlng) });
    items.push({ label: '도착점 지정', action: () => setArrival(e.latlng) });
  } else {
    items.push({ label: '경유점 추가', action: () => addWaypoint(e.latlng) });
  }
  showContextMenu(e.originalEvent, items);
});

// ─── 출발/도착/경유점 조작 (flight_planning.js와 동일 패턴) ────
function setDeparture(latlng, extra) {
  if (state.departure?.marker) map.removeLayer(state.departure.marker);
  const marker = L.marker(latlng, { icon: makeFixIcon('DEP', '#2ecc71'), draggable: true }).addTo(map);
  state.departure = {
    name: extra?.name ?? '', lat: latlng.lat, lon: latlng.lng,
    alt: extra?.alt ?? 0, velocity: extra?.velocity ?? 0, marker,
  };
  marker.on('drag', () => {
    state.departure.lat = marker.getLatLng().lat;
    state.departure.lon = marker.getLatLng().lng;
    syncFormFromState();
    redrawRoute();
  });
  syncFormFromState();
  redrawRoute();
}

function setArrival(latlng, extra) {
  if (state.arrival?.marker) map.removeLayer(state.arrival.marker);
  const marker = L.marker(latlng, { icon: makeFixIcon('ARR', '#e94560'), draggable: true }).addTo(map);
  state.arrival = {
    name: extra?.name ?? '', lat: latlng.lat, lon: latlng.lng,
    alt: extra?.alt ?? 0, velocity: extra?.velocity ?? 0, marker,
  };
  marker.on('drag', () => {
    state.arrival.lat = marker.getLatLng().lat;
    state.arrival.lon = marker.getLatLng().lng;
    syncFormFromState();
    redrawRoute();
  });
  syncFormFromState();
  redrawRoute();
}

function addWaypoint(latlng, wpData) {
  const seq = state.waypoints.length + 1;
  const marker = L.marker(latlng, { icon: makeFixIcon(`WP${seq}`, '#f39c12'), draggable: true }).addTo(map);
  const wp = {
    name: wpData?.name ?? '',
    lat: latlng.lat,
    lon: latlng.lng,
    alt: wpData?.alt ?? 0,
    velocity: wpData?.velocity ?? 0,
    marker,
  };
  state.waypoints.push(wp);

  marker.on('drag', () => {
    wp.lat = marker.getLatLng().lat;
    wp.lon = marker.getLatLng().lng;
    renderWaypointTable();
    redrawRoute();
  });
  marker.on('contextmenu', (e) => {
    L.DomEvent.stopPropagation(e);
    showContextMenu(e.originalEvent, [
      { label: '삭제', action: () => removeWaypoint(state.waypoints.indexOf(wp)) },
    ]);
  });

  renderWaypointTable();
  redrawRoute();
}

function removeWaypoint(index) {
  const wp = state.waypoints[index];
  if (!wp) return;
  map.removeLayer(wp.marker);
  state.waypoints.splice(index, 1);
  state.waypoints.forEach((w, i) => w.marker.setIcon(makeFixIcon(`WP${i + 1}`, '#f39c12')));
  renderWaypointTable();
  redrawRoute();
}

function redrawRoute() {
  const pts = [];
  if (state.departure) pts.push([state.departure.lat, state.departure.lon]);
  state.waypoints.forEach((wp) => pts.push([wp.lat, wp.lon]));
  if (state.arrival) pts.push([state.arrival.lat, state.arrival.lon]);
  routeLine.setLatLngs(pts);
}

// ─── 폼(Edit Box) ↔ 상태 동기화 ────────────────────────────────
function syncFormFromState() {
  document.getElementById('pf-dep-name').value = state.departure?.name ?? '';
  document.getElementById('pf-dep-lat').value = state.departure?.lat ?? '';
  document.getElementById('pf-dep-lon').value = state.departure?.lon ?? '';
  document.getElementById('pf-dep-alt').value = state.departure?.alt ?? '';
  document.getElementById('pf-dep-velocity').value = state.departure?.velocity ?? '';

  document.getElementById('pf-arr-name').value = state.arrival?.name ?? '';
  document.getElementById('pf-arr-lat').value = state.arrival?.lat ?? '';
  document.getElementById('pf-arr-lon').value = state.arrival?.lon ?? '';
  document.getElementById('pf-arr-alt').value = state.arrival?.alt ?? '';
  document.getElementById('pf-arr-velocity').value = state.arrival?.velocity ?? '';
}

function bindPointForm(prefix, getPoint) {
  ['name', 'lat', 'lon', 'alt', 'velocity'].forEach((field) => {
    const el = document.getElementById(`pf-${prefix}-${field}`);
    el.addEventListener('change', () => {
      const point = getPoint();
      if (!point) return;
      const val = (field === 'name') ? el.value : parseFloat(el.value || '0');
      point[field] = val;
      if (field === 'lat' || field === 'lon') {
        point.marker.setLatLng([point.lat, point.lon]);
        redrawRoute();
      }
    });
  });
}
bindPointForm('dep', () => state.departure);
bindPointForm('arr', () => state.arrival);

function renderWaypointTable() {
  const tbody = document.getElementById('pf-waypoints-tbody');
  tbody.innerHTML = '';
  state.waypoints.forEach((wp, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input data-idx="${i}" data-field="name" value="${wp.name ?? ''}"></td>
      <td><input data-idx="${i}" data-field="lat" type="number" step="0.000001" value="${wp.lat}"></td>
      <td><input data-idx="${i}" data-field="lon" type="number" step="0.000001" value="${wp.lon}"></td>
      <td><input data-idx="${i}" data-field="alt" type="number" value="${wp.alt}"></td>
      <td><input data-idx="${i}" data-field="velocity" type="number" value="${wp.velocity}"></td>
      <td><button class="fp-wp-remove" data-idx="${i}" title="삭제">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('pf-waypoints-tbody').addEventListener('change', (e) => {
  const idx = parseInt(e.target.dataset.idx, 10);
  const field = e.target.dataset.field;
  const wp = state.waypoints[idx];
  if (!wp || !field) return;
  wp[field] = (field === 'name') ? e.target.value : parseFloat(e.target.value || '0');
  if (field === 'lat' || field === 'lon') {
    wp.marker.setLatLng([wp.lat, wp.lon]);
    redrawRoute();
  }
});

document.getElementById('pf-waypoints-tbody').addEventListener('click', (e) => {
  if (!e.target.classList.contains('fp-wp-remove')) return;
  removeWaypoint(parseInt(e.target.dataset.idx, 10));
});

document.getElementById('pf-wp-add-btn').addEventListener('click', () => {
  const center = state.arrival
    ? L.latLng((state.departure?.lat ?? state.arrival.lat) + (state.arrival.lat - (state.departure?.lat ?? state.arrival.lat)) / 2,
                (state.departure?.lon ?? state.arrival.lon) + (state.arrival.lon - (state.departure?.lon ?? state.arrival.lon)) / 2)
    : map.getCenter();
  addWaypoint(center);
});

// ─── Flight Plan 불러오기 (DB → Map + Edit Box) ────────────────
function resetRoute() {
  if (state.departure?.marker) map.removeLayer(state.departure.marker);
  if (state.arrival?.marker) map.removeLayer(state.arrival.marker);
  state.waypoints.forEach((wp) => map.removeLayer(wp.marker));
  state.planId = null;
  state.name = '';
  state.aircraftType = '';
  state.dep = '';
  state.arr = '';
  state.eta = null;
  state.departure = null;
  state.arrival = null;
  state.waypoints = [];
  syncFormFromState();
  renderWaypointTable();
  redrawRoute();
}

const planSelect = document.getElementById('pf-plan-select');
planSelect.addEventListener('change', async () => {
  const id = planSelect.value;
  resetRoute();
  if (!id) return;

  const resp = await fetch(`/flight-planning/${id}/`);
  if (!resp.ok) { alert('Flight Plan을 불러오지 못했습니다.'); return; }
  const data = await resp.json();

  state.planId = data.id;
  state.name = data.name;
  state.aircraftType = data.aircraft_type || '';
  state.dep = data.dep || '';
  state.arr = data.arr || '';
  state.eta = data.eta || null;

  setDeparture(L.latLng(data.departure.lat, data.departure.lon), data.departure);
  setArrival(L.latLng(data.arrival.lat, data.arrival.lon), data.arrival);
  data.waypoints.forEach((wp) => addWaypoint(L.latLng(wp.lat, wp.lon), wp));

  const bounds = routeLine.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
});

// ─── Free Flight 토글 ──────────────────────────────────────────
const freeFlightCheck = document.getElementById('pf-free-flight');
const pfBody = document.getElementById('pf-body');
const pfFmsHint = document.getElementById('pf-fms-hint');
const fmsBtn = document.getElementById('pf-fms-btn');

function applyFreeFlightUi() {
  const isFree = freeFlightCheck.checked;
  planSelect.disabled = isFree;
  pfBody.style.display = isFree ? 'none' : '';
  pfFmsHint.style.display = isFree ? 'none' : '';
  fmsBtn.style.display = isFree ? 'none' : '';
  if (isFree) {
    planSelect.value = '';
    resetRoute();
  }
}
freeFlightCheck.addEventListener('change', applyFreeFlightUi);
applyFreeFlightUi();

// ─── Pilot 선택/신규 등록 ──────────────────────────────────────
const pilotSelect = document.getElementById('pf-pilot-select');
const newPilotBtn = document.getElementById('pf-new-pilot-btn');
const newPilotForm = document.getElementById('pf-new-pilot-form');
const newPilotName = document.getElementById('pf-new-pilot-name');
const newPilotOrg = document.getElementById('pf-new-pilot-org');
const newPilotLicense = document.getElementById('pf-new-pilot-license');
const newPilotSave = document.getElementById('pf-new-pilot-save');
const callsignInput = document.getElementById('pf-callsign');

async function refreshPilots(selectId) {
  const resp = await fetch('/management/pilots/');
  if (!resp.ok) return;
  const data = await resp.json();
  const prev = selectId ?? pilotSelect.value;
  pilotSelect.innerHTML = '<option value="">선택하세요</option>';
  (data.pilots || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name}${p.organization ? ` (${p.organization})` : ''}`;
    pilotSelect.appendChild(opt);
  });
  if (prev) pilotSelect.value = prev;
}
refreshPilots();

newPilotBtn.addEventListener('click', () => {
  newPilotForm.style.display = newPilotForm.style.display === 'none' ? 'flex' : 'none';
});

newPilotSave.addEventListener('click', async () => {
  const name = newPilotName.value.trim();
  if (!name) { alert('이름을 입력하세요.'); return; }
  const resp = await fetch('/management/pilots/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify({
      name,
      organization: newPilotOrg.value.trim(),
      license_no: newPilotLicense.value.trim(),
    }),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || '조종사 등록 실패'); return; }
  await refreshPilots(String(data.id));
  newPilotForm.style.display = 'none';
  newPilotName.value = '';
  newPilotOrg.value = '';
  newPilotLicense.value = '';
});

// ─── .fms 생성/다운로드 (Edit Box에 반영된 현재 좌표 그대로) ───
function buildPointsPayload() {
  return {
    dep: state.dep,
    arr: state.arr,
    departure: state.departure
      ? { name: state.departure.name, lat: state.departure.lat, lon: state.departure.lon, alt: state.departure.alt, velocity: state.departure.velocity }
      : null,
    arrival: state.arrival
      ? { name: state.arrival.name, lat: state.arrival.lat, lon: state.arrival.lon, alt: state.arrival.alt, velocity: state.arrival.velocity }
      : null,
    waypoints: state.waypoints.map((wp) => ({ name: wp.name, lat: wp.lat, lon: wp.lon, alt: wp.alt, velocity: wp.velocity })),
  };
}

fmsBtn.addEventListener('click', async () => {
  if (!state.departure || !state.arrival) { alert('출발점/도착점 좌표를 먼저 확인하세요.'); return; }

  const payload = { ...buildPointsPayload(), callsign: callsignInput.value.trim() || 'FLIGHT' };
  const resp = await fetch('/flight-planning/fms-preview/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const data = await resp.json();
    alert(data.error || '.fms 생성 실패');
    return;
  }

  const disposition = resp.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : 'flight.fms';

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ─── 데이터 저장 시작 / 비행 종료 ───────────────────────────────
const startBtn = document.getElementById('pf-start-btn');
const endBtn = document.getElementById('pf-end-btn');
const activeBanner = document.getElementById('pf-active-banner');

function setSessionUiActive(active, info) {
  if (active) {
    startBtn.style.display = 'none';
    endBtn.style.display = '';
    endBtn.dataset.sessionId = info.session_id;
    activeBanner.style.display = '';
    activeBanner.textContent = `진행 중: ${info.callsign} (${info.pilot_name})`;
  } else {
    startBtn.style.display = '';
    endBtn.style.display = 'none';
    activeBanner.style.display = 'none';
  }
}

async function refreshActiveSession() {
  const resp = await fetch('/management/session/active/');
  if (!resp.ok) return;
  const data = await resp.json();
  setSessionUiActive(data.active, data);
}
refreshActiveSession();
setInterval(refreshActiveSession, 5000);

startBtn.addEventListener('click', async () => {
  const pilotId = pilotSelect.value;
  const callsign = callsignInput.value.trim();
  const freeFlight = freeFlightCheck.checked;

  if (!pilotId) { alert('조종사를 선택하세요.'); return; }
  if (!callsign) { alert('Callsign을 입력하세요.'); return; }
  if (!freeFlight && (!state.departure || !state.arrival)) {
    alert('Flight Plan을 선택하거나 Free Flight를 체크하세요.');
    return;
  }

  const body = { pilot_id: pilotId, callsign, flight_plan_id: freeFlight ? null : state.planId };
  if (!freeFlight) {
    body.flight_plan_snapshot = {
      name: state.name,
      aircraft_type: state.aircraftType,
      dep: state.dep,
      arr: state.arr,
      eta: state.eta,
      ...buildPointsPayload(),
    };
  }

  const resp = await fetch('/management/session/start/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || '비행 시작 실패'); return; }
  refreshActiveSession();
});

endBtn.addEventListener('click', async () => {
  const sessionId = endBtn.dataset.sessionId;
  if (!sessionId) return;
  if (!confirm('비행을 종료하시겠습니까?')) return;
  const resp = await fetch(`/management/session/${sessionId}/end/`, {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrf() },
  });
  const data = await resp.json();
  if (!resp.ok) { alert(data.error || '종료 실패'); return; }
  refreshActiveSession();
});

// ─── 초기 상태 ────────────────────────────────────────────────
renderWaypointTable();
