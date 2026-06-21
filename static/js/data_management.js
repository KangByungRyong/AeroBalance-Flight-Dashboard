// ─── 데이터 관리 (Page 3) ────────────────────────────────────────────────────

function getCsrf() {
  return document.querySelector('[name=csrfmiddlewaretoken]')?.value ?? '';
}

// 새 세션 시작
document.getElementById('btn-confirm-start')?.addEventListener('click', async () => {
  const form = document.getElementById('start-session-form');
  const data = new FormData(form);
  const res = await fetch('/management/session/start/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCsrf() },
    body: data,
  });
  const json = await res.json();
  if (json.status === 'ok') {
    location.reload();
  } else {
    alert('세션 시작 실패: ' + JSON.stringify(json.errors));
  }
});

// 세션 항목 클릭 → 상세 로드 (추후 구현)
document.querySelectorAll('.session-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.session-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    // TODO: 세션 상세 패널 비동기 로드
  });
});
