/**
 * WebSocket 클라이언트 — Replay 재생 데이터 수신 (`ws_client.js`와 동일한 패턴).
 * 재생 중인 세션이 있을 때만 서버가 메시지를 보내므로, 상시 연결해두고 대기한다.
 */
(function () {
  const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/replay/`;
  const MAX_DELAY = 30000;
  let ws = null;
  let delay = 1000;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      delay = 1000;
      console.debug('[Replay WS] 연결됨');
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'end') {
        window.dispatchEvent(new CustomEvent('replayEnd', { detail: data }));
      } else {
        window.dispatchEvent(new CustomEvent('replayData', { detail: data }));
      }
    };

    ws.onclose = () => {
      console.debug(`[Replay WS] 연결 끊김 — ${delay}ms 후 재연결`);
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, MAX_DELAY);
    };

    ws.onerror = () => ws.close();
  }

  connect();
})();
