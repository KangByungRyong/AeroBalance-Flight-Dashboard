// ─── Replay (Page 4) ─────────────────────────────────────────────────────────
// 세션 데이터를 DB에서 받아와 지도 + Strip Chart를 동기화 재생한다.
// TODO: 세션 선택 UI 및 /replay/api/session/<id>/data/ 엔드포인트 구현 후 연결.

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const map = L.map('replay-map').setView([37.0, 127.5], 8);
window._leafletMap = map;
L.tileLayer(TILE_URL, { subdomains: 'abcd', maxZoom: 18 }).addTo(map);

let replayData = [];
let replayIndex = 0;
let speed = 1;
let playing = false;
let rafId = null;
let lastRealTime = null;
let startTs = null;

const progressEl = document.getElementById('replay-progress');
const timeEl = document.getElementById('replay-time');

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function tick(now) {
  if (!playing) return;
  if (lastRealTime == null) lastRealTime = now;

  const elapsed = (now - lastRealTime) / 1000 * speed;
  lastRealTime = now;

  if (replayIndex < replayData.length) {
    const frame = replayData[replayIndex];
    // TODO: 지도 마커 업데이트, uPlot 데이터 추가
    const pct = (replayIndex / (replayData.length - 1)) * 100;
    progressEl.value = pct;
    const simSec = frame.timestamp - startTs;
    timeEl.textContent = formatTime(simSec);
    replayIndex++;
    rafId = requestAnimationFrame(tick);
  } else {
    playing = false;
  }
}

document.getElementById('btn-play')?.addEventListener('click', () => {
  if (!replayData.length) return;
  playing = true;
  lastRealTime = null;
  rafId = requestAnimationFrame(tick);
});

document.getElementById('btn-pause')?.addEventListener('click', () => {
  playing = false;
  cancelAnimationFrame(rafId);
});

document.getElementById('btn-stop')?.addEventListener('click', () => {
  playing = false;
  cancelAnimationFrame(rafId);
  replayIndex = 0;
  progressEl.value = 0;
  timeEl.textContent = '00:00';
});

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    speed = parseFloat(btn.dataset.speed);
  });
});

progressEl?.addEventListener('input', () => {
  if (!replayData.length) return;
  replayIndex = Math.floor((progressEl.value / 100) * (replayData.length - 1));
});
