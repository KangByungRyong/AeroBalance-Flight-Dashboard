'use strict';

// ─── 데이터 관리 — 세션 조회(모달) + 체크박스 다중 선택 내보내기/파일 가져오기 ──

function getCsrf() {
  return document.querySelector('[name=csrfmiddlewaretoken]')?.value ?? '';
}

const detailModalEl = document.getElementById('dm-detail-modal');
const detailModal = detailModalEl ? new bootstrap.Modal(detailModalEl) : null;
const detailBody = document.getElementById('dm-detail-body');

const tbody = document.getElementById('dm-session-tbody');
const selectAllCheck = document.getElementById('dm-select-all');
const selectedCountEl = document.getElementById('dm-selected-count');
const exportBtn = document.getElementById('dm-export-btn');
const importBtn = document.getElementById('dm-import-btn');
const importFileInput = document.getElementById('dm-import-file-input');
const actionResult = document.getElementById('dm-action-result');

function fmt(iso) {
  return iso ? iso.replace('T', ' ').slice(0, 19) : '진행 중';
}

function row(label, value) {
  return `<tr><th>${label}</th><td>${value}</td></tr>`;
}

const REASON_LABEL = { manual: '수동 종료', timeout: '타임아웃 자동 종료', '': '진행 중' };

// ─── 세션 상세 모달 (조회 전용) ───────────────────────────────
async function openSessionDetail(id) {
  const resp = await fetch(`/management/session/${id}/`);
  if (!resp.ok) { alert('세션 상세를 불러오지 못했습니다.'); return; }
  const s = await resp.json();

  const flightPlanLabel = s.is_free_flight ? 'Free Flight' : (s.flight_plan_name || '—');

  detailBody.innerHTML = [
    row('Callsign', s.callsign),
    row('조종사', `${s.pilot.name}${s.pilot.organization ? ` (${s.pilot.organization})` : ''}`),
    row('자격번호', s.pilot.license_no || '—'),
    row('구분', flightPlanLabel),
    row('경로', `${s.dep || '—'} → ${s.arr || '—'}`),
    row('시작 시각', fmt(s.start_time)),
    row('종료 시각', fmt(s.end_time)),
    row('종료 사유', REASON_LABEL[s.end_reason] ?? s.end_reason),
    row('저장된 UDP 데이터', `${s.flight_data_count}건`),
    row('저장된 ABSim 항적', `${s.absim_track_count}건`),
    row('저장 상태', s.is_archived ? `내보냄 (${fmt(s.archived_at)})` : '보관 중'),
    row('아카이브 파일', s.archive_path || '—'),
    row('메모', s.notes || '—'),
  ].join('');

  detailModal?.show();
}

tbody.addEventListener('click', (e) => {
  if (e.target.matches('.dm-row-check')) return; // 체크박스 클릭은 모달을 열지 않음
  const tr = e.target.closest('.dm-session-row');
  if (tr) openSessionDetail(tr.dataset.id);
});

// ─── 체크박스 선택 ────────────────────────────────────────────
function getSelectedIds() {
  return Array.from(document.querySelectorAll('.dm-row-check:checked')).map((el) => parseInt(el.dataset.id, 10));
}

function refreshSelectionUi() {
  const count = getSelectedIds().length;
  selectedCountEl.textContent = `${count}개 선택`;
  exportBtn.disabled = count === 0;
}

tbody.addEventListener('change', (e) => {
  if (e.target.matches('.dm-row-check')) refreshSelectionUi();
});

selectAllCheck?.addEventListener('change', () => {
  document.querySelectorAll('.dm-row-check').forEach((el) => { el.checked = selectAllCheck.checked; });
  refreshSelectionUi();
});

function setActionResult(text, ok) {
  actionResult.textContent = text;
  actionResult.className = `dm-action-result mb-2 ${ok === true ? 'ok' : ok === false ? 'fail' : ''}`;
}

function updateRowStatus(id, archived) {
  const tr = document.querySelector(`.dm-session-row[data-id="${id}"]`);
  if (!tr) return;
  const cell = tr.querySelector('.dm-status-cell');
  if (cell) cell.innerHTML = archived ? '<span class="dm-archived">내보냄</span>' : '보관 중';
}

// ─── 내보내기 (체크박스로 선택된 세션들) ───────────────────────
exportBtn?.addEventListener('click', async () => {
  const ids = getSelectedIds();
  if (!ids.length) return;
  if (!confirm(`선택한 ${ids.length}개 세션의 상세 데이터를 파일로 내보내고 DB에서 삭제합니다. 계속할까요?`)) return;

  const resp = await fetch('/management/session/export-bulk/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify({ session_ids: ids }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    setActionResult(data.error || '내보내기 실패', false);
    return;
  }

  const results = data.results || [];
  results.forEach((r) => { if (r.status === 'ok') updateRowStatus(r.id, true); });

  const okCount = results.filter((r) => r.status === 'ok').length;
  const skipCount = results.filter((r) => r.status === 'skip').length;
  const errCount = results.filter((r) => r.status === 'error').length;
  setActionResult(
    `내보내기 완료: 성공 ${okCount}건, 건너뜀 ${skipCount}건, 실패 ${errCount}건`,
    errCount === 0,
  );

  document.querySelectorAll('.dm-row-check:checked').forEach((el) => { el.checked = false; });
  if (selectAllCheck) selectAllCheck.checked = false;
  refreshSelectionUi();
});

// ─── 가져오기 (파일 열기 다이얼로그) ───────────────────────────
importBtn?.addEventListener('click', () => importFileInput.click());

importFileInput?.addEventListener('change', async () => {
  const files = Array.from(importFileInput.files || []);
  if (!files.length) return;

  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));

  const resp = await fetch('/management/session/import-file/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrf() },
    body: formData,
  });
  const data = await resp.json();
  importFileInput.value = ''; // 같은 파일 다시 선택 가능하도록 초기화

  if (!resp.ok) {
    setActionResult(data.error || '가져오기 실패', false);
    return;
  }

  const results = data.results || [];
  const okCount = results.filter((r) => r.status === 'ok').length;
  const errCount = results.filter((r) => r.status === 'error').length;
  setActionResult(
    `가져오기 완료: 성공 ${okCount}건, 실패 ${errCount}건` + (errCount ? ` — ${results.filter((r) => r.status === 'error').map((r) => `${r.filename}: ${r.message}`).join(', ')}` : ''),
    errCount === 0,
  );

  if (okCount > 0) {
    // 새 세션이 생겼거나 기존 세션이 복원됐을 수 있으므로 목록을 다시 그린다.
    setTimeout(() => location.reload(), 1200);
  }
});

// ─── DB 사용 용량 (DB_CAPACITY_LIMIT_GB 기준) ─────────────────
async function refreshDbUsage() {
  const resp = await fetch('/management/db-usage/');
  if (!resp.ok) return;
  const data = await resp.json();

  document.getElementById('dm-usage-text').textContent =
    `${data.total_gb.toLocaleString()}GB / ${data.limit_gb.toLocaleString()}GB (${data.percent}%)`;

  const fill = document.getElementById('dm-usage-bar-fill');
  fill.style.width = `${Math.min(data.percent, 100)}%`;
  fill.className = 'dm-usage-bar-fill' + (data.percent >= 90 ? ' danger' : data.percent >= 70 ? ' warn' : '');

  const tablesEl = document.getElementById('dm-usage-tables');
  tablesEl.innerHTML = (data.tables || [])
    .map((t) => `<span class="dm-usage-table-item"><strong>${t.gb}GB</strong> ${t.name}</span>`)
    .join('');
}

refreshDbUsage();
setInterval(refreshDbUsage, 30000);

refreshSelectionUi();
