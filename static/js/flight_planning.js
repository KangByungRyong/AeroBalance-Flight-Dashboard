'use strict';

// ─── 지도 초기화 ──────────────────────────────────────────────
const TILE_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors';

const map = L.map('fp-map', { zoomControl: true }).setView([36.5, 127.5], 8);
L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, subdomains: 'abc' }).addTo(map);

const ROUTE_COLOR = '#4ea8de';
const routeLine = L.polyline([], { color: ROUTE_COLOR, weight: 2, dashArray: '6 4' }).addTo(map);

// ─── 지점 마커 아이콘 ─────────────────────────────────────────
function makeFixIcon(label, color) {
  const html = `<div class="fp-fix-marker">
    <div class="fp-fix-dot" style="background:${color}"></div>
    <div class="fp-fix-label">${label}</div>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [1, 1], iconAnchor: [0, 0] });
}

// ─── 상태 ─────────────────────────────────────────────────────
const state = {
  id: null,
  departure: null, // { name, lat, lon, alt, velocity, marker }
  arrival: null,
  waypoints: [],   // [{ name, lat, lon, alt, velocity, marker }]
};

function getCsrf() {
  return document.querySelector('[name=csrfmiddlewaretoken]')?.value ?? '';
}

// ─── 컨텍스트 메뉴 ────────────────────────────────────────────
const ctxMenu = document.getElementById('fp-context-menu');
const mapWrapper = document.getElementById('fp-map-wrapper');

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

// ─── 출발/도착/경유점 조작 ────────────────────────────────────
function setDeparture(latlng) {
  if (state.departure?.marker) map.removeLayer(state.departure.marker);
  const marker = L.marker(latlng, { icon: makeFixIcon('DEP', '#2ecc71'), draggable: true }).addTo(map);
  state.departure = { name: '', lat: latlng.lat, lon: latlng.lng, alt: 0, velocity: 0, marker };
  marker.on('drag', () => {
    state.departure.lat = marker.getLatLng().lat;
    state.departure.lon = marker.getLatLng().lng;
    syncFormFromState();
    redrawRoute();
  });
  syncFormFromState();
  redrawRoute();
}

function setArrival(latlng) {
  if (state.arrival?.marker) map.removeLayer(state.arrival.marker);
  const marker = L.marker(latlng, { icon: makeFixIcon('ARR', '#e94560'), draggable: true }).addTo(map);
  state.arrival = { name: '', lat: latlng.lat, lon: latlng.lng, alt: 0, velocity: 0, marker };
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
  relabelWaypointMarkers();
  renderWaypointTable();
  redrawRoute();
}

function relabelWaypointMarkers() {
  state.waypoints.forEach((wp, i) => {
    wp.marker.setIcon(makeFixIcon(`WP${i + 1}`, '#f39c12'));
  });
}

function redrawRoute() {
  const pts = [];
  if (state.departure) pts.push([state.departure.lat, state.departure.lon]);
  state.waypoints.forEach((wp) => pts.push([wp.lat, wp.lon]));
  if (state.arrival) pts.push([state.arrival.lat, state.arrival.lon]);
  routeLine.setLatLngs(pts);
}

// ─── 폼 ↔ 상태 동기화 ─────────────────────────────────────────
function syncFormFromState() {
  document.getElementById('dep-name').value = state.departure?.name ?? '';
  document.getElementById('dep-lat').value = state.departure?.lat ?? '';
  document.getElementById('dep-lon').value = state.departure?.lon ?? '';
  document.getElementById('dep-alt').value = state.departure?.alt ?? '';
  document.getElementById('dep-velocity').value = state.departure?.velocity ?? '';

  document.getElementById('arr-name').value = state.arrival?.name ?? '';
  document.getElementById('arr-lat').value = state.arrival?.lat ?? '';
  document.getElementById('arr-lon').value = state.arrival?.lon ?? '';
  document.getElementById('arr-alt').value = state.arrival?.alt ?? '';
  document.getElementById('arr-velocity').value = state.arrival?.velocity ?? '';
}

function bindPointForm(prefix, getPoint) {
  ['name', 'lat', 'lon', 'alt', 'velocity'].forEach((field) => {
    const el = document.getElementById(`${prefix}-${field}`);
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
  const tbody = document.getElementById('fp-waypoints-tbody');
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

document.getElementById('fp-waypoints-tbody').addEventListener('change', (e) => {
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

document.getElementById('fp-waypoints-tbody').addEventListener('click', (e) => {
  if (!e.target.classList.contains('fp-wp-remove')) return;
  removeWaypoint(parseInt(e.target.dataset.idx, 10));
});

// ─── ETA ↔ datetime-local (UTC 그대로, 브라우저 타임존 변환 없음) ───
function isoToLocalInputValue(iso) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(iso || '');
  return m ? m[1] : '';
}
function inputValueToIsoUtc(value) {
  if (!value) return null;
  return value.length === 16 ? `${value}:00Z` : `${value}Z`;
}

// ─── 폼 초기화 (신규) ─────────────────────────────────────────
function resetForm() {
  state.id = null;
  if (state.departure?.marker) map.removeLayer(state.departure.marker);
  if (state.arrival?.marker) map.removeLayer(state.arrival.marker);
  state.waypoints.forEach((wp) => map.removeLayer(wp.marker));
  state.departure = null;
  state.arrival = null;
  state.waypoints = [];

  document.getElementById('fp-id').value = '';
  document.getElementById('fp-name').value = '';
  document.getElementById('fp-aircraft-type').value = '';
  document.getElementById('fp-dep').value = '';
  document.getElementById('fp-arr').value = '';
  document.getElementById('fp-eta').value = '';
  document.getElementById('fp-schedule-result').textContent = 'EOBT: —';
  document.getElementById('fp-delete-btn').disabled = true;
  document.querySelectorAll('.fp-list-item').forEach((li) => li.classList.remove('active'));

  syncFormFromState();
  renderWaypointTable();
  redrawRoute();
}

// ─── 저장된 FPL 로드 ──────────────────────────────────────────
async function loadPlan(id) {
  const resp = await fetch(`/flight-planning/${id}/`);
  if (!resp.ok) { alert('Flight Plan을 불러오지 못했습니다.'); return; }
  const data = await resp.json();

  resetForm();
  state.id = data.id;
  document.getElementById('fp-id').value = data.id;
  document.getElementById('fp-name').value = data.name;
  document.getElementById('fp-aircraft-type').value = data.aircraft_type || '';
  document.getElementById('fp-dep').value = data.dep || '';
  document.getElementById('fp-arr').value = data.arr || '';
  document.getElementById('fp-eta').value = isoToLocalInputValue(data.eta);
  document.getElementById('fp-delete-btn').disabled = false;

  setDeparture(L.latLng(data.departure.lat, data.departure.lon));
  state.departure.name = data.departure.name;
  state.departure.alt = data.departure.alt;
  state.departure.velocity = data.departure.velocity;

  setArrival(L.latLng(data.arrival.lat, data.arrival.lon));
  state.arrival.name = data.arrival.name;
  state.arrival.alt = data.arrival.alt;
  state.arrival.velocity = data.arrival.velocity;

  data.waypoints.forEach((wp) => {
    addWaypoint(L.latLng(wp.lat, wp.lon), wp);
  });

  syncFormFromState();
  renderWaypointTable();
  redrawRoute();

  const bounds = routeLine.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });

  document.querySelectorAll('.fp-list-item').forEach((li) => {
    li.classList.toggle('active', li.dataset.id === String(id));
  });

  if (data.schedule && !data.schedule.error) {
    showSchedule(data.schedule);
  }
}

document.querySelectorAll('.fp-list-item[data-id]').forEach((li) => {
  li.addEventListener('click', () => loadPlan(li.dataset.id));
});

document.getElementById('fp-new-btn').addEventListener('click', resetForm);

// ─── 저장/삭제/미리보기 ───────────────────────────────────────
function buildPayload() {
  return {
    id: state.id,
    name: document.getElementById('fp-name').value.trim(),
    aircraft_type: document.getElementById('fp-aircraft-type').value.trim(),
    dep: document.getElementById('fp-dep').value.trim(),
    arr: document.getElementById('fp-arr').value.trim(),
    eta: inputValueToIsoUtc(document.getElementById('fp-eta').value),
    departure: state.departure ? {
      name: state.departure.name, lat: state.departure.lat, lon: state.departure.lon,
      alt: state.departure.alt, velocity: state.departure.velocity,
    } : null,
    arrival: state.arrival ? {
      name: state.arrival.name, lat: state.arrival.lat, lon: state.arrival.lon,
      alt: state.arrival.alt, velocity: state.arrival.velocity,
    } : null,
    waypoints: state.waypoints.map((wp) => ({
      name: wp.name, lat: wp.lat, lon: wp.lon, alt: wp.alt, velocity: wp.velocity,
    })),
  };
}

function showSchedule(schedule) {
  const el = document.getElementById('fp-schedule-result');
  if (schedule.error) {
    el.textContent = `계산 불가: ${schedule.error}`;
    return;
  }
  const fmt = (iso) => iso.replace('T', ' ').slice(0, 19) + 'Z';
  el.textContent = `EOBT: ${fmt(schedule.eobt)}  /  DEP: ${fmt(schedule.departure_utc)}  /  ARR: ${fmt(schedule.arrival_utc)}`;
}

document.getElementById('fp-preview-btn').addEventListener('click', async () => {
  const payload = buildPayload();
  if (!payload.departure || !payload.arrival || !payload.eta) {
    alert('출발점/도착점/ETA를 먼저 입력하세요.');
    return;
  }
  const resp = await fetch('/flight-planning/preview/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (resp.ok) {
    showSchedule(data.schedule);
  } else {
    alert(data.error || '계산 실패');
  }
});

async function savePlan(saveAs) {
  const payload = buildPayload();
  if (!payload.name) { alert('이름을 입력하세요.'); return; }
  if (!payload.departure || !payload.arrival) { alert('출발점/도착점을 지도에서 지정하세요.'); return; }
  if (!payload.eta) { alert('도착 예정시각(ETA)을 입력하세요.'); return; }
  payload.save_as = saveAs;

  const resp = await fetch('/flight-planning/save/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (resp.ok) {
    location.reload();
  } else {
    alert(data.error || '저장 실패');
  }
}

document.getElementById('fp-save-btn').addEventListener('click', () => savePlan(false));
document.getElementById('fp-save-as-btn').addEventListener('click', () => savePlan(true));

document.getElementById('fp-delete-btn').addEventListener('click', async () => {
  if (!state.id) return;
  if (!confirm('이 Flight Plan을 삭제하시겠습니까?')) return;
  const resp = await fetch(`/flight-planning/${state.id}/delete/`, {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrf() },
  });
  if (resp.ok) {
    location.reload();
  } else {
    const data = await resp.json();
    alert(data.error || '삭제 실패');
  }
});

// ─── 초기 상태 ────────────────────────────────────────────────
renderWaypointTable();
