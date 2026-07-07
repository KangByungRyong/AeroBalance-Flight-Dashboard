/**
 * WebSocket 클라이언트 — X-Plane 실시간 데이터 수신.
 * 지수 백오프 방식으로 재연결한다.
 */
(function () {
  const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/flight/`;
  const MAX_DELAY = 30000;
  let ws = null;
  let delay = 1000;
  let sessionStart = null;
  let timerInterval = null;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      delay = 1000;
      console.debug('[WS] 연결됨');
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      // 전역 이벤트로 각 페이지 모듈에 데이터 전달
      window.dispatchEvent(new CustomEvent('flightData', { detail: data }));
      updateSessionStatus(data);
    };

    ws.onclose = () => {
      console.debug(`[WS] 연결 끊김 — ${delay}ms 후 재연결`);
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, MAX_DELAY);
    };

    ws.onerror = () => ws.close();
  }

  function updateSessionStatus(data) {
    const dot = document.querySelector('.status-dot');
    const label = document.getElementById('session-label');
    const timer = document.getElementById('session-timer');
    if (!dot || !label) return;

    if (data.session_id) {
      dot.className = 'status-dot active';
      label.textContent = data.session_name || '비행중';
      if (!sessionStart) {
        sessionStart = Date.now();
        timerInterval = timerInterval || setInterval(tickTimer, 1000);
      }
    } else {
      dot.className = 'status-dot inactive';
      label.textContent = '세션 없음';
      if (timer) timer.textContent = '';
      sessionStart = null;
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function tickTimer() {
    if (!sessionStart) return;
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const h = Math.floor(elapsed / 3600).toString().padStart(2, '0');
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const timer = document.getElementById('session-timer');
    if (timer) timer.textContent = `${h}:${m}:${s}`;
  }

  connect();
})();
