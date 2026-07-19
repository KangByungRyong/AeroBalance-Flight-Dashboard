'use strict';

// ─── Top Navbar 세션 상태 (CLAUDE.md §10, 모든 페이지 공통) ───

const dmDotEl = document.querySelector('#session-status .status-dot');
const dmLabelEl = document.getElementById('session-label');
const dmTimerEl = document.getElementById('session-timer');

let dmSessionStartMs = null;
let dmTimerInterval = null;

function dmFmtElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function dmTick() {
  if (dmSessionStartMs === null) return;
  dmTimerEl.textContent = dmFmtElapsed(Date.now() - dmSessionStartMs);
}

async function dmRefreshSessionStatus() {
  try {
    const resp = await fetch('/management/session/active/');
    if (!resp.ok) return;
    const data = await resp.json();

    if (data.active) {
      dmDotEl.classList.remove('inactive');
      dmDotEl.classList.add('active');
      dmLabelEl.textContent = `${data.callsign} (${data.pilot_name})`;
      dmSessionStartMs = new Date(data.start_time).getTime();
      if (!dmTimerInterval) dmTimerInterval = setInterval(dmTick, 1000);
      dmTick();
    } else {
      dmDotEl.classList.remove('active');
      dmDotEl.classList.add('inactive');
      dmLabelEl.textContent = '세션 없음';
      dmTimerEl.textContent = '';
      dmSessionStartMs = null;
      if (dmTimerInterval) { clearInterval(dmTimerInterval); dmTimerInterval = null; }
    }
  } catch (e) {
    // 네트워크 오류 시 조용히 무시 — 다음 폴링에서 재시도
  }
}

dmRefreshSessionStatus();
setInterval(dmRefreshSessionStatus, 5000);
