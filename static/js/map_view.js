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
function makeAircraftIcon(heading) {
  const h = heading || 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <g transform="rotate(${h}, 20, 20)">
      <!-- 동체 -->
      <path d="M20,2 C22,5 23,12 23,22 C23,31 22,36 20,38 C18,36 17,31 17,22 C17,12 18,5 20,2 Z"
            fill="#e94560" stroke="#fff" stroke-width="0.8"/>
      <!-- 주익 -->
      <path d="M20,14 L2,24 L3.5,26 L20,19 L36.5,26 L38,24 Z"
            fill="#e94560" stroke="#fff" stroke-width="0.8"/>
      <!-- 미익 -->
      <path d="M20,30 L11,36 L12,37.5 L20,33 L28,37.5 L29,36 Z"
            fill="#e94560" stroke="#fff" stroke-width="0.8"/>
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
