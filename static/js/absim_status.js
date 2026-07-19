'use strict';

const API_URL = '/absim/api/status/';
const POLL_INTERVAL_MS = 1000;

// ─── UI 업데이트 ──────────────────────────────────────────────
function updateUI(data) {
  const dot  = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');

  if (data.is_connected) {
    dot.className  = 'conn-dot conn-active';
    text.textContent = '연결됨';
    text.className = 'conn-text text-success';
  } else if (data.last_error) {
    dot.className  = 'conn-dot conn-warn';
    text.textContent = '연결 오류';
    text.className = 'conn-text text-warning';
  } else {
    dot.className  = 'conn-dot conn-idle';
    text.textContent = '대기 중 — ABSim-Dashboard 미연결';
    text.className = 'conn-text text-muted';
  }

  document.getElementById('since-last').textContent =
    data.since_last_sec !== null ? `${data.since_last_sec}초 전` : '—';
  document.getElementById('poll-count').textContent = data.poll_count.toLocaleString();
  document.getElementById('error-count').textContent = data.error_count.toLocaleString();
  document.getElementById('last-error').textContent = data.last_error || '—';

  document.getElementById('snap-track-count').textContent = data.track_count;
  document.getElementById('snap-model-count').textContent = data.model_count;
}

// ─── 폴링 ─────────────────────────────────────────────────────
async function poll() {
  try {
    const resp = await fetch(API_URL);
    if (resp.ok) {
      const data = await resp.json();
      updateUI(data);
    }
  } catch {
    // 네트워크 오류 시 UI 변경 없이 재시도 대기
  }
}

poll();
setInterval(poll, POLL_INTERVAL_MS);
