'use strict';

// ─── Replay 페이지 — 세션 선택 + 재생/정지 컨트롤 ──────────────────────────
// 실제 재생 데이터의 시각화는 이 페이지가 아니라 Air Traffic Tracking(/map/)·
// Data Chart(/chart/) 페이지에서 이루어진다(서버가 ws/replay/로 브로드캐스트).

function getCsrf() {
  return document.querySelector('[name=csrfmiddlewaretoken]')?.value ?? '';
}

const rpPage = document.querySelector('.rp-page');
const MAX_SESSIONS = parseInt(rpPage?.dataset.maxSessions || '5', 10);

const tbody = document.getElementById('rp-session-tbody');
const selectedCountEl = document.getElementById('rp-selected-count');
const playBtn = document.getElementById('rp-play-btn');
const stopBtn = document.getElementById('rp-stop-btn');
const resultEl = document.getElementById('rp-action-result');
const activePanel = document.getElementById('rp-active-panel');
const activeList = document.getElementById('rp-active-list');

const selectedIds = new Set();
let statusPollTimer = null;

function fmtTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { hour12: false });
}

function showResult(message, ok) {
  resultEl.textContent = message;
  resultEl.className = `rp-action-result ${ok ? 'ok' : 'fail'}`;
}

function updateSelectedCount() {
  selectedCountEl.textContent = `${selectedIds.size}개 선택 (최대 ${MAX_SESSIONS}개)`;
  playBtn.disabled = selectedIds.size === 0;

  // 5개 선택 시 나머지 체크박스 비활성화
  tbody.querySelectorAll('.rp-row-check').forEach((cb) => {
    const id = parseInt(cb.dataset.id, 10);
    if (!selectedIds.has(id)) {
      cb.disabled = selectedIds.size >= MAX_SESSIONS;
      cb.closest('.rp-session-row')?.classList.toggle('rp-row-disabled', cb.disabled);
    }
  });
}

async function loadSessions() {
  try {
    const resp = await fetch('/replay/api/sessions/');
    const data = await resp.json();
    renderSessions(data.sessions || []);
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="rp-empty">세션 목록을 불러오지 못했습니다.</td></tr>';
  }
}

function renderSessions(sessions) {
  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="rp-empty">재생 가능한 저장된 세션이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = sessions.map((s) => `
    <tr class="rp-session-row" data-id="${s.id}">
      <td><input type="checkbox" class="rp-row-check" data-id="${s.id}"></td>
      <td>${s.callsign}</td>
      <td>${s.pilot_name}</td>
      <td>${fmtTime(s.start_time)}</td>
      <td>${fmtTime(s.end_time)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.rp-row-check').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      const id = parseInt(cb.dataset.id, 10);
      if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
      updateSelectedCount();
    });
  });
  tbody.querySelectorAll('.rp-session-row').forEach((row) => {
    row.addEventListener('click', () => {
      const cb = row.querySelector('.rp-row-check');
      if (cb && !cb.disabled) cb.click();
    });
  });

  updateSelectedCount();
}

playBtn.addEventListener('click', async () => {
  if (!selectedIds.size) return;
  playBtn.disabled = true;
  try {
    const resp = await fetch('/replay/start/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({ session_ids: Array.from(selectedIds) }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      showResult(data.error || '재생을 시작하지 못했습니다.', false);
      playBtn.disabled = false;
      return;
    }
    const errors = (data.results || []).filter((r) => r.status === 'error');
    if (errors.length) {
      showResult(`일부 세션 재생 실패: ${errors.map((e) => `#${e.session_id} (${e.message})`).join(', ')}`, false);
    } else {
      showResult('재생을 시작했습니다. Air Traffic Tracking / Data Chart 페이지에서 확인하세요.', true);
    }
    startStatusPolling();
  } catch {
    showResult('서버와 통신할 수 없습니다.', false);
    playBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  try {
    await fetch('/replay/stop/', { method: 'POST', headers: { 'X-CSRFToken': getCsrf() } });
    showResult('재생을 정지했습니다.', true);
  } catch {
    showResult('서버와 통신할 수 없습니다.', false);
  }
  refreshStatus();
});

function renderActive(sessions) {
  if (!sessions.length) {
    activePanel.style.display = 'none';
    activeList.innerHTML = '';
    return;
  }
  activePanel.style.display = '';
  activeList.innerHTML = sessions.map((s) => `
    <div class="rp-active-item ${s.finished ? 'finished' : ''}">
      <span class="rp-active-label">${s.label}</span>
      <div class="rp-active-bar-track">
        <div class="rp-active-bar-fill" style="width:${Math.round(s.progress * 100)}%"></div>
      </div>
      <span class="rp-active-pct">${s.finished ? '완료' : `${Math.round(s.progress * 100)}%`}</span>
    </div>
  `).join('');
}

async function refreshStatus() {
  try {
    const resp = await fetch('/replay/status/');
    const data = await resp.json();
    renderActive(data.sessions || []);
    stopBtn.disabled = !data.playing;
    if (!data.playing) {
      playBtn.disabled = selectedIds.size === 0;
      stopStatusPolling();
    }
  } catch {
    // 네트워크 오류 시 마지막 상태 유지
  }
}

function startStatusPolling() {
  stopStatusPolling();
  refreshStatus();
  statusPollTimer = setInterval(refreshStatus, 1000);
}

function stopStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

loadSessions();
refreshStatus().then(() => {
  // 페이지 진입 시 이미 재생 중이면(다른 탭에서 시작) 폴링 재개
  if (stopBtn && !stopBtn.disabled) startStatusPolling();
});
