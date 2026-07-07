'use strict';

const API_URL = '/udp/api/status/';
const POLL_INTERVAL_MS = 1000;

// ─── 그룹 그리드 초기 렌더링 ──────────────────────────────────
function initGroupsGrid(groupsInfo) {
  const container = document.getElementById('groups-grid');
  if (!container || container.childElementCount > 0) return;

  for (const [idx, info] of Object.entries(groupsInfo)) {
    const badge = document.createElement('div');
    badge.id = `group-${idx}`;
    badge.className = 'group-badge group-idle';
    badge.title = `#${idx} ${info.label}`;
    badge.innerHTML = `<span class="group-idx">#${idx}</span><span class="group-name">${info.label}</span>`;
    container.appendChild(badge);
  }
}

// ─── UI 업데이트 ──────────────────────────────────────────────
function updateUI(data) {
  // 연결 상태 표시
  const dot  = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');

  if (data.is_active) {
    dot.className  = 'conn-dot conn-active';
    text.textContent = '수신 중';
    text.className = 'conn-text text-success';
  } else if (data.is_receiving) {
    dot.className  = 'conn-dot conn-warn';
    text.textContent = '신호 끊김 (3초 초과)';
    text.className = 'conn-text text-warning';
  } else {
    dot.className  = 'conn-dot conn-idle';
    text.textContent = '대기 중 — X-Plane 미연결';
    text.className = 'conn-text text-muted';
  }

  // 통계
  document.getElementById('pps').textContent =
    data.is_active ? `${data.packets_per_second} Hz` : '—';
  document.getElementById('since-last').textContent =
    data.since_last_sec !== null ? `${data.since_last_sec}초 전` : '—';
  document.getElementById('source-addr').textContent =
    data.source_addr || '—';
  document.getElementById('total-packets').textContent =
    data.total_packets.toLocaleString();

  // 그룹 그리드
  initGroupsGrid(data.groups_info);
  for (const [idx, info] of Object.entries(data.groups_info)) {
    const el = document.getElementById(`group-${idx}`);
    if (!el) continue;
    el.className = `group-badge ${info.receiving ? 'group-ok' : 'group-idle'}`;
  }

  // 스냅샷
  const snapKeys = [
    'ias_kt', 'tas_kt', 'gs_kt', 'alt_ft', 'vvi_fpm',
    'pitch', 'roll', 'heading', 'g_normal',
    'aoa_deg', 'beta_deg', 'mach', 'lat', 'lon',
  ];
  for (const key of snapKeys) {
    const el = document.getElementById(`snap-${key}`);
    if (!el) continue;
    const val = data.snapshot[key];
    el.textContent = val !== undefined ? val : '—';
  }
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
