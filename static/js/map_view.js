'use strict';

// ─── 지도 초기화 ──────────────────────────────────────────────
const TILE_URL  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO';

const map = L.map('map', { zoomControl: true, attributionControl: true })
              .setView([36.5, 127.5], 8);

window._leafletMap = map;

L.tileLayer(TILE_URL, {
  attribution: TILE_ATTR,
  maxZoom: 18,
  subdomains: 'abcd',
}).addTo(map);

// ─── 항적 렌더링 ──────────────────────────────────────────────
const MAX_TRACK_POINTS = 5000;
const trackPoints = [];
const trackPolyline = L.polyline([], {
  color: '#e94560',
  weight: 2,
  opacity: 0.8,
  smoothFactor: 1,
}).addTo(map);

// ─── 항공기 마커 (탑뷰 실루엣) ───────────────────────────────
function makeAircraftIcon(heading, color) {
  const h = heading || 0;
  const c = color || '#e94560';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <g transform="rotate(${h}, 20, 20)">
      <!-- 동체 -->
      <path d="M20,2 C22,5 23,12 23,22 C23,31 22,36 20,38 C18,36 17,31 17,22 C17,12 18,5 20,2 Z"
            fill="${c}" stroke="#fff" stroke-width="0.8"/>
      <!-- 주익 -->
      <path d="M20,14 L2,24 L3.5,26 L20,19 L36.5,26 L38,24 Z"
            fill="${c}" stroke="#fff" stroke-width="0.8"/>
      <!-- 미익 -->
      <path d="M20,30 L11,36 L12,37.5 L20,33 L28,37.5 L29,36 Z"
            fill="${c}" stroke="#fff" stroke-width="0.8"/>
      <!-- 기수 표시 (흰점) -->
      <circle cx="20" cy="3.5" r="1.5" fill="#fff" opacity="0.9"/>
    </g>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
  });
}

let aircraftMarker = null;
let hasFirstFix    = false;
let autoFollow     = true;

// ─── HUD 업데이트 ─────────────────────────────────────────────
function updateHud(d) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('hud-lat',     d.lat     != null ? d.lat.toFixed(5)     : '--');
  set('hud-lon',     d.lon     != null ? d.lon.toFixed(5)     : '--');
  set('hud-alt',     d.alt_ft  != null ? `${Math.round(d.alt_ft)} ft`  : '-- ft');
  set('hud-ias',     d.ias_kt  != null ? `${Math.round(d.ias_kt)} kt`  : '-- kt');
  set('hud-hdg',     d.heading != null ? `${Math.round(d.heading)}°`   : '--°');
  set('hud-pitch',   d.pitch   != null ? `${d.pitch.toFixed(1)}°`      : '--°');
  set('hud-roll',    d.roll    != null ? `${d.roll.toFixed(1)}°`       : '--°');
  set('hud-vvi',     d.vvi_fpm != null ? `${Math.round(d.vvi_fpm)} fpm` : '-- fpm');
}

// ─── WebSocket 데이터 수신 ────────────────────────────────────
window.addEventListener('flightData', (e) => {
  const d = e.detail;

  // 연결 인디케이터 갱신
  setWsStatus('active');

  // HUD는 항상 업데이트
  updateHud(d);

  // 위치 데이터가 없으면 지도 갱신 스킵
  if (d.lat == null || d.lon == null) {
    showNoGps(true);
    return;
  }
  showNoGps(false);

  const latlng = [d.lat, d.lon];

  // 항적 추가 (최대 MAX_TRACK_POINTS 유지)
  trackPoints.push(latlng);
  if (trackPoints.length > MAX_TRACK_POINTS) {
    trackPoints.shift();
  }
  trackPolyline.setLatLngs(trackPoints);

  // 항공기 마커 이동/생성
  if (!aircraftMarker) {
    aircraftMarker = L.marker(latlng, { icon: makeAircraftIcon(d.heading) })
                      .addTo(map);
  } else {
    aircraftMarker.setLatLng(latlng);
    aircraftMarker.setIcon(makeAircraftIcon(d.heading));
  }

  // 첫 위치 수신 시 지도 이동
  if (!hasFirstFix) {
    map.setView(latlng, 12);
    hasFirstFix = true;
  } else if (autoFollow) {
    map.panTo(latlng, { animate: true, duration: 0.5 });
  }
});

// ─── GPS 없음 표시 ────────────────────────────────────────────
function showNoGps(visible) {
  const el = document.getElementById('no-gps-msg');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

// ─── WebSocket 연결 상태 표시 ─────────────────────────────────
function setWsStatus(state) {
  const dot  = document.getElementById('ws-dot');
  const text = document.getElementById('ws-text');
  if (!dot || !text) return;
  if (state === 'active') {
    dot.className  = 'ws-dot ws-active';
    text.textContent = 'X-Plane 연결됨';
  } else {
    dot.className  = 'ws-dot ws-idle';
    text.textContent = 'X-Plane 대기 중';
  }
}

// ─── 자동 팔로우 토글 버튼 ────────────────────────────────────
const followBtn = document.getElementById('follow-btn');
if (followBtn) {
  followBtn.addEventListener('click', () => {
    autoFollow = !autoFollow;
    followBtn.textContent = autoFollow ? '📍 팔로우 ON' : '📍 팔로우 OFF';
    followBtn.classList.toggle('follow-active', autoFollow);
    if (autoFollow && aircraftMarker) {
      map.panTo(aircraftMarker.getLatLng());
    }
  });
}

// 사용자가 직접 지도를 드래그하면 자동 팔로우 해제
map.on('dragstart', () => {
  autoFollow = false;
  if (followBtn) {
    followBtn.textContent = '📍 팔로우 OFF';
    followBtn.classList.remove('follow-active');
  }
});

// sidebar.js의 window._leafletMap 참조로 invalidateSize() 처리됨

// ─── ABSim-Dashboard REST 항적 (X-Plane과 별개 출처) ──────────
const ABSIM_TRACKS_URL = '/absim/api/tracks/';
const ABSIM_POLL_INTERVAL_MS = 1500;
const ABSIM_TRACK_COLOR = '#4ea8de';
const ABSIM_TRACK_COLOR_STALE = '#555b6e';

const absimMarkers = new Map(); // model → L.Marker

// ABSim-Dashboard 항적 마커: 기체 실루엣(heading 회전) + 항상 보이는 Callsign 라벨
function makeAbsimTrackIcon(heading, color, label) {
  const h = heading || 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32">
    <g transform="rotate(${h}, 20, 20)">
      <path d="M20,2 C22,5 23,12 23,22 C23,31 22,36 20,38 C18,36 17,31 17,22 C17,12 18,5 20,2 Z"
            fill="${color}" stroke="#fff" stroke-width="0.8"/>
      <path d="M20,14 L2,24 L3.5,26 L20,19 L36.5,26 L38,24 Z"
            fill="${color}" stroke="#fff" stroke-width="0.8"/>
      <path d="M20,30 L11,36 L12,37.5 L20,33 L28,37.5 L29,36 Z"
            fill="${color}" stroke="#fff" stroke-width="0.8"/>
      <circle cx="20" cy="3.5" r="1.5" fill="#fff" opacity="0.9"/>
    </g>
  </svg>`;
  const html = `<div class="absim-track-marker">
    ${svg}
    <div class="absim-track-label">${label}</div>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [1, 1], iconAnchor: [0, 0] });
}

function upsertAbsimTrack(track) {
  const latlng = [track.lat, track.lon];
  const stale = track.udp_connected === false;
  const label = track.callsign || track.model;
  const icon = makeAbsimTrackIcon(track.hdg, stale ? ABSIM_TRACK_COLOR_STALE : ABSIM_TRACK_COLOR, label);

  let marker = absimMarkers.get(track.model);
  if (!marker) {
    marker = L.marker(latlng, { icon }).addTo(map);
    absimMarkers.set(track.model, marker);
  } else {
    marker.setLatLng(latlng);
    marker.setIcon(icon);
  }

  marker.bindPopup(
    `<b>${label}</b> (${track.model})<br>` +
    `Alt: ${track.alt != null ? Math.round(track.alt) : '--'} ft &nbsp; ` +
    `Spd: ${track.spd != null ? Math.round(track.spd) : '--'} kt<br>` +
    (stale ? '⚠️ UDP 끊김' : '✅ UDP 연결됨')
  );
}

function pruneAbsimTracks(seenModels) {
  for (const [model, marker] of absimMarkers) {
    if (!seenModels.has(model)) {
      map.removeLayer(marker);
      absimMarkers.delete(model);
    }
  }
}

async function pollAbsimTracks() {
  try {
    const resp = await fetch(ABSIM_TRACKS_URL);
    if (!resp.ok) return;
    const data = await resp.json();
    const seen = new Set();
    for (const track of (data.tracks || [])) {
      if (track.lat == null || track.lon == null) continue;
      upsertAbsimTrack(track);
      seen.add(track.model);
    }
    pruneAbsimTracks(seen);
  } catch {
    // 네트워크 오류 시 마지막으로 표시된 상태 유지
  }
}

pollAbsimTracks();
setInterval(pollAbsimTracks, ABSIM_POLL_INTERVAL_MS);

// ─── Replay 항적 (Online 데이터와 구분되는 연한 색 + "_Replay" 라벨) ──────
const REPLAY_TRACK_COLOR = '#ffb3c6';
const REPLAY_MAX_TRACK_POINTS = 3000;

const replayTracks = new Map(); // session_id → { marker, polyline, points[] }

function makeReplayIcon(heading, label) {
  const h = heading || 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="36" height="36">
    <g transform="rotate(${h}, 20, 20)">
      <path d="M20,2 C22,5 23,12 23,22 C23,31 22,36 20,38 C18,36 17,31 17,22 C17,12 18,5 20,2 Z"
            fill="${REPLAY_TRACK_COLOR}" stroke="#fff" stroke-width="0.8" opacity="0.85"/>
      <path d="M20,14 L2,24 L3.5,26 L20,19 L36.5,26 L38,24 Z"
            fill="${REPLAY_TRACK_COLOR}" stroke="#fff" stroke-width="0.8" opacity="0.85"/>
      <path d="M20,30 L11,36 L12,37.5 L20,33 L28,37.5 L29,36 Z"
            fill="${REPLAY_TRACK_COLOR}" stroke="#fff" stroke-width="0.8" opacity="0.85"/>
      <circle cx="20" cy="3.5" r="1.5" fill="#fff" opacity="0.8"/>
    </g>
  </svg>`;
  const html = `<div class="absim-track-marker">
    ${svg}
    <div class="absim-track-label replay-track-label">${label}</div>
  </div>`;
  return L.divIcon({ html, className: '', iconSize: [1, 1], iconAnchor: [0, 0] });
}

function upsertReplayTrack(pkt) {
  if (pkt.lat == null || pkt.lon == null) return;
  const latlng = [pkt.lat, pkt.lon];
  const icon = makeReplayIcon(pkt.heading, pkt.label);

  let entry = replayTracks.get(pkt.session_id);
  if (!entry) {
    entry = {
      marker: L.marker(latlng, { icon }).addTo(map),
      polyline: L.polyline([], { color: REPLAY_TRACK_COLOR, weight: 2, opacity: 0.7, dashArray: '4 4' }).addTo(map),
      points: [],
    };
    replayTracks.set(pkt.session_id, entry);
  } else {
    entry.marker.setLatLng(latlng);
    entry.marker.setIcon(icon);
  }

  entry.points.push(latlng);
  if (entry.points.length > REPLAY_MAX_TRACK_POINTS) entry.points.shift();
  entry.polyline.setLatLngs(entry.points);

  entry.marker.bindPopup(
    `<b>${pkt.label}</b><br>` +
    `Alt: ${pkt.alt_ft != null ? Math.round(pkt.alt_ft) : '--'} ft &nbsp; ` +
    `IAS: ${pkt.ias_kt != null ? Math.round(pkt.ias_kt) : '--'} kt`
  );
}

function removeReplayTrack(sessionId) {
  const entry = replayTracks.get(sessionId);
  if (!entry) return;
  map.removeLayer(entry.marker);
  map.removeLayer(entry.polyline);
  replayTracks.delete(sessionId);
}

window.addEventListener('replayData', (e) => upsertReplayTrack(e.detail));
window.addEventListener('replayEnd', (e) => removeReplayTrack(e.detail.session_id));
