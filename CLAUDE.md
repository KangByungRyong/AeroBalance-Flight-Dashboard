# CLAUDE.md — ABFAP (Flight Data Monitoring + Flight Planning Platform)

## 프로젝트 개요
이 저장소는 **ABFAP**(WS#1) 플랫폼 코드가 들어가는 곳이다. X-Plane 시뮬레이터로부터
UDP 데이터를 수신해 실시간 시각화·MariaDB 저장하는 기존 기능에 더해, 별도 저장소인
**ABSim-Dashboard**(WS#3, 배포 시 `10.0.0.120`)와 REST API로 연동하여 항적을
수신하고 Flight Plan을 전달하는 기능을 추가한다. **개발 환경에서는 `10.0.0.110`을
사용**(`.env: ABSIM_DASHBOARD_BASE_URL`, 2026-07-18 확정) — 배포 전환 시 `.env`만
`10.0.0.120`으로 바꾸면 됨(코드 변경 불필요).

- `ABSim-Dashboard`는 이 저장소에 포함되지 않은 **별도 프로젝트**다. 연동은 항상
  REST API 경계(`docs/ABFAP_Export_Interface.md`)를 통해서만 이루어진다.
- 연동 체계: `ABFAP(이 저장소) ↔ ABSim-Dashboard(WS#3) ↔ ABSim.exe`. ABSim-Dashboard ↔
  ABSim 구간은 이미 구성 완료 상태(ABSim-Dashboard 쪽 작업)이며, 현재 진행 대상은
  `ABFAP ↔ ABSim-Dashboard` 구간이다.
- 관련 설계 문서: `docs/ABFAP_Export_Interface.md`(Dashboard→ABFAP 항적/상태 Pull 확정
  스펙), `docs/ABFAP_FPL_Interface.md`(**ABFAP→Dashboard FPL Push 확정 스펙** —
  `POST /api/abfap/fpl/` 요청/응답 필드, Dashboard 쪽 구현 완료 기준 문서화),
  `docs/Debug_FPL_Feature_Reference.md`(ABSim-Dashboard의 기존 Debug FPL 기능 — Flight
  Planning/Injection 이식 시 UI·데이터모델 참고용), `docs/ABSim-Dashboard_UDP_Interface.md`
  (ABSim MFC 바이너리 프로토콜, ABFAP는 직접 다루지 않음 — Dashboard가 인코딩/relay 책임).

---

## 기술 스택

### Backend
- **Python**: 3.11
- **Django**: 5.2 LTS
- **Django Channels**: 4.x (WebSocket 실시간 통신)
- **ASGI 서버**: Uvicorn (개발) / Daphne (배포)
- **DB**: MariaDB (mysqlclient 드라이버)
- **REST 클라이언트**: `requests`(또는 `httpx`) — ABSim-Dashboard `/api/abfap/*` 폴링용
  (백그라운드 asyncio 태스크 또는 주기 폴러로 구현, 하드코딩 금지 — host/포트/allowlist
  는 `.env`)

### Frontend
- **UI 언어**: 한국어 전용
- **테마**: 다크 테마 (전체 UI)
- **지도**: Leaflet.js + Canvas Overlay — Air Traffic Tracking은 CartoDB Dark Matter
  (다크) 타일, Flight Planning/Flight Plan Injection은 OpenStreetMap 기본(표준) 타일
  (`tile.openstreetmap.org`, 2026-07-18 변경: 경로 편집 시 지형·라벨 가독성을 위해
  일반 지도로 전환 → 이후 OSM 표준 타일로 재확정)
- **차트**: uPlot (Strip Chart — 실시간 + Replay, **X-Plane 연동 전용**, ABSim-Dashboard
  항적에는 적용하지 않음)
- **템플릿**: Django Template + Bootstrap 5 (다크 모드)

### 데이터 흐름

**X-Plane 경로 (기존):**
```
X-Plane (UDP 송출)
↓ 50Hz
UDP Listener (Python asyncio thread)
↓
Django Channels Consumer
↓ WebSocket (50Hz → 프론트 전송)
Browser (Leaflet + uPlot)
↓ 병렬
MariaDB (50Hz 전체 저장)
```

**ABSim-Dashboard 경로 (신규, 2026-07-18 구현):**
```
ABSim-Dashboard  GET /api/abfap/tracks/, /api/abfap/model-status/
       ↑ 주기 폴링(REST, 기본 1초, absim_link/rest_client.py)
ABFAP REST 클라이언트 (백그라운드 asyncio 태스크, in-memory 캐시)
       ↓
GET /absim/api/tracks/ (ABFAP 자체 JSON API, 캐시 그대로 pass-through)
       ↑ 폴링(1.5초, static/js/map_view.js)
Browser (Air Traffic Tracking 지도 — X-Plane 항적은 WebSocket, ABSim-Dashboard
         항적은 REST 폴링으로 같은 지도에 병합 표시. 실시간성이 X-Plane 50Hz만큼
         필요 없어 Channels를 거치지 않고 단순 폴링으로 구현 — udp_status.js와
         동일한 패턴)

ABFAP (Flight Plan Injection)  POST /api/abfap/fpl/  →  ABSim-Dashboard
       (ABFAP는 바이너리 프로토콜을 모름 — JSON만 전송, 인코딩/ABSim relay는 Dashboard 책임)
```

---

## 환경 설정

### 개발 환경
- **OS**: macOS
- **가상환경**: venv
- **실행**: `python manage.py runserver`

### 배포 환경
- **OS**: Windows (로컬 단독 실행)
- **실행**: `python manage.py runserver 0.0.0.0:8000`
- **외부 접근**: 불필요 (localhost 전용)
- **크로스 플랫폼 주의사항**:
  - 파일 경로는 항상 `os.path.join()` 또는 `pathlib.Path` 사용
  - 절대경로 하드코딩 금지
  - 줄바꿈: `.gitattributes`로 LF 통일

---

## Django 앱 구조
xplane_monitor/          ← Django 프로젝트 루트
├── config/              ← settings, urls, asgi, wsgi
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   └── asgi.py          ← Channels ASGI 진입점
├── apps/
│   ├── udp_receiver/       ← UDP 수신 + WebSocket Consumer (X-Plane)
│   ├── absim_link/         ← 구현 완료: ABSim-Dashboard REST 폴링 클라이언트 + 연동 상태
│   ├── map_view/           ← Page 1: Air Traffic Tracking (X-Plane 항적 WS + REST 항적 폴링 병합)
│   ├── strip_chart/        ← Page 2: Strip Chart (uPlot, X-Plane 전용)
│   ├── flight_planning/    ← 구현 완료: Flight Planning (FPL 라이브러리 편집)
│   ├── flight_plan_injection/ ← 구현 완료: Flight Plan Injection (ABSim-Dashboard로 POST)
│   ├── data_management/   ← Page: 조종사/특이사항 관리 (보류 — 추후 구성)
│   └── replay/             ← Page: 저장 데이터 Replay (보류 — 추후 구성)
├── static/
│   ├── js/
│   │   ├── uplot.min.js
│   │   └── leaflet/
│   └── css/
├── templates/
│   ├── base.html        ← 다크 테마 공통 레이아웃
│   └── ...
├── .env                 ← DB 접속정보 등 환경변수
├── requirements.txt
└── CLAUDE.md

---
┌───────────────────────────────────────────────────────────────────────┐
│ [☰] Flight Data Monitoring System   🔴세션명 UDP●REST●            │  ← Top Navbar
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│  ☰ 메뉴  │                                                          │
│  ──────  │           메인 콘텐츠 영역                                │
│  🗺️ 지도  │         (Page별 전환 렌더링)                              │
│          │                                                          │
│  📈 차트  │                                                          │
│          │                                                          │
│  🧭 계획  │                                                          │
│  🛫 주입  │                                                          │
│          │                                                          │
│  ──────  │                                                          │
│  ⚙️ 설정  │                                                          │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
---

## 포털 UI 구조

### 전체 레이아웃
- **구성 방식**: 좌측 고정 사이드바 + 우측 메인 콘텐츠 영역
- **사이드바 토글**: 상단 햄버거 버튼(☰)으로 열기/닫기
  - 열림 상태: 사이드바 너비 220px, 메뉴 텍스트 + 아이콘 표시
  - 닫힘 상태: 사이드바 너비 60px, 아이콘만 표시 (툴팁으로 메뉴명)
- **상태 유지**: `localStorage`에 사이드바 열림/닫힘 상태 저장
- **반응형**: 데스크탑 전용 (모바일 미지원)

### Top Navbar
- 좌측: 햄버거 버튼(☰) + 시스템 로고/타이틀
- 우측: 현재 비행 세션 상태만 표시 (🔴 비행중: 세션명 + 경과 시간, 실시간 카운트업 /
  ⚫ 대기중: "세션 없음")
- **UDP/REST 연결 상태는 Navbar 점 표시가 아니라 사이드바 하단의 전용 상태 페이지로
  구현됨** (2026-07-18, 기존 `udp_receiver:status` 패턴을 그대로 따름) — 사이드바
  하단에 "UDP 상태"(X-Plane), "REST 상태"(ABSim-Dashboard, 신규) 링크 2개, 각각
  연결 상태/최근 성공 시각/오류 내역을 보여주는 별도 페이지로 이동
- 배경: 다크 테마 (#1a1a2e 계열)

### 사이드바 메뉴 구성
☰  Flight Monitor          ← 로고/타이틀 영역
━━━━━━━━━━━━━━━━━━━
🗺️  Air Traffic Tracking    ← /map/
📈  Strip Chart             ← /chart/ (X-Plane 전용)
🧭  Flight Planning         ← /flight-planning/ (신규)
🛫  Flight Plan Injection   ← /flight-plan-injection/ (신규)
━━━━━━━━━━━━━━━━━━━
⚙️  설정                   ← /settings/

> 데이터 관리 / Replay는 보류 상태 — 구현 전까지 사이드바 메뉴에서 제외.
> 구현 시점에 위 목록으로 복귀.

### 페이지별 URL 구조
| **페이지** | **URL** | **앱** |
|-----------|---------|--------|
| Air Traffic Tracking | `/map/` | `map_view` |
| Strip Chart | `/chart/` | `strip_chart` |
| Flight Planning | `/flight-planning/` | `flight_planning` |
| Flight Plan Injection | `/flight-plan-injection/` | `flight_plan_injection` |
| 데이터 관리 (보류) | `/management/` | `data_management` |
| Replay (보류) | `/replay/` | `replay` |
| 설정 | `/settings/` | `config` |
| 루트 리다이렉트 | `/` → `/map/` | — |

### base.html 구조
```html
<!DOCTYPE html>
<html lang="ko" data-theme="dark">
<head>
  <!-- 공통 CSS: Bootstrap 5 다크, uPlot, Leaflet -->
</head>
<body class="d-flex">

  <!-- 좌측 사이드바 -->
  <nav id="sidebar" class="sidebar {% raw %}{% block sidebar_class %}{% endblock %}{% endraw %}">
    <div class="sidebar-header">
      <button id="hamburger-btn">☰</button>
      <span class="sidebar-title">Flight Monitor</span>
    </div>
    <ul class="sidebar-menu">
      <li class="{% raw %}{% if active_page == 'map' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'map_view:index' %}{% endraw %}">
          <span class="icon">🗺️</span>
          <span class="label">Air Traffic Tracking</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'chart' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'strip_chart:index' %}{% endraw %}">
          <span class="icon">📈</span>
          <span class="label">Strip Chart</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'flight_planning' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'flight_planning:index' %}{% endraw %}">
          <span class="icon">🧭</span>
          <span class="label">Flight Planning</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'flight_plan_injection' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'flight_plan_injection:index' %}{% endraw %}">
          <span class="icon">🛫</span>
          <span class="label">Flight Plan Injection</span>
        </a>
      </li>
      <!-- 데이터 관리 / Replay: 보류 — 구현 시 복귀 -->
    </ul>
    <ul class="sidebar-menu sidebar-bottom">
      <li class="{% raw %}{% if active_page == 'udp_status' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'udp_receiver:status' %}{% endraw %}">
          <span class="icon">📡</span>
          <span class="label">UDP 상태</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'rest_status' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'absim_link:status' %}{% endraw %}">
          <span class="icon">🔗</span>
          <span class="label">REST 상태</span>
        </a>
      </li>
      <li>
        <a href="{% raw %}{% url 'config:settings' %}{% endraw %}">
          <span class="icon">⚙️</span>
          <span class="label">설정</span>
        </a>
      </li>
    </ul>
  </nav>

  <!-- 메인 콘텐츠 -->
  <div id="main-wrapper" class="flex-grow-1">

    <!-- Top Navbar -->
    <header class="top-navbar">
      <div class="navbar-left">
        <button id="hamburger-btn-top">☰</button>
        <span class="system-title">Flight Data Monitoring System</span>
      </div>
      <div class="navbar-right">
        <div id="session-status">
          <!-- WebSocket으로 실시간 업데이트 -->
          <span class="status-dot"></span>
          <span id="session-label">세션 없음</span>
          <span id="session-timer"></span>
        </div>
      </div>
    </header>

    <!-- 페이지 콘텐츠 -->
    <main id="content">
      {% raw %}{% block content %}{% endblock %}{% endraw %}
    </main>

  </div>

  <!-- 공통 JS: WebSocket 연결, 사이드바 토글 -->
  {% raw %}{% block extra_js %}{% endblock %}{% endraw %}
</body>
</html>

:root {
  --bg-primary:    #0d0d1a;   /* 최외곽 배경 */
  --bg-secondary:  #1a1a2e;   /* 사이드바, 카드 배경 */
  --bg-tertiary:   #16213e;   /* 입력 필드, 테이블 행 */
  --accent-blue:   #0f3460;   /* 강조 배경 */
  --accent-active: #e94560;   /* 활성 메뉴, 버튼 포인트 */
  --text-primary:  #e0e0e0;   /* 기본 텍스트 */
  --text-muted:    #888888;   /* 보조 텍스트 */
  --border-color:  #2a2a4a;   /* 구분선 */
  --sidebar-width-open:   220px;
  --sidebar-width-closed:  60px;
  --navbar-height:          56px;
}


// static/js/sidebar.js
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('main-wrapper');
const STORAGE_KEY = 'sidebar_open';

function setSidebar(isOpen) {
  sidebar.classList.toggle('collapsed', !isOpen);
  mainWrapper.classList.toggle('sidebar-collapsed', !isOpen);
  localStorage.setItem(STORAGE_KEY, isOpen ? '1' : '0');
}

// 초기 상태 복원
const savedState = localStorage.getItem(STORAGE_KEY);
setSidebar(savedState !== '0');  // 기본값: 열림

// 햄버거 버튼 클릭
document.querySelectorAll('#hamburger-btn, #hamburger-btn-top')
  .forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen = !sidebar.classList.contains('collapsed');
      setSidebar(!isOpen);
    });
  });

## 페이지별 콘텐츠 영역 특이사항
Air Traffic Tracking: 콘텐츠 영역 = 지도 100% 풀사이즈. X-Plane 항적 + ABSim-Dashboard
REST 항적을 같은 지도에 병합 표시 (마커 스타일/색상으로 출처 구분). 사이드바 닫힘 시
지도 영역 자동 확장 (resize 이벤트 → map.invalidateSize())
Strip Chart: 상단 파라미터 선택 툴바 + 하단 uPlot 차트 영역 (X-Plane 데이터 전용)
Flight Planning (신규): 좌측 FPL 목록 + 우측 Leaflet 지도 편집(출발/경유/도착) + 폼
(`docs/Debug_FPL_Feature_Reference.md` §1-1 패턴 이식)
Flight Plan Injection (신규): 상단 FPL/대상 Model/Callsign 선택 + 미리보기(JSON)/전송
버튼 + 하단 소형 지도 + 전송 이력 테이블 (`docs/Debug_FPL_Feature_Reference.md` §1-2
패턴 이식, 단 전송은 UDP가 아니라 `POST /api/abfap/fpl/`)
데이터 관리 / Replay: 보류 — 추후 별도 작업

## 활성 메뉴 표시 방법
각 View의 get_context_data() 또는 CBV extra_context에 active_page 값을 전달하여 사이드바 활성 항목 강조

# 예시
class MapIndexView(TemplateView):
    template_name = 'map_view/index.html'
    extra_context = {'active_page': 'map'}


## 핵심 모듈별 구현 지침

### 1. UDP 수신 (udp_receiver)
- `asyncio` 기반 비동기 UDP 소켓으로 구현
- Django 서버 시작 시 **백그라운드 태스크**로 자동 실행
- 수신 포트: 기본 `49000` (`.env`에서 설정 가능)
- X-Plane 버전: **개발 중 확정** → 파서는 플러그인 구조로 분리
- DataRef 목록: **개발 중 확정** → `dataref_config.py`에서 중앙 관리
- 수신 데이터는 즉시 두 경로로 분기:
  1. **WebSocket** → 프론트 실시간 전송 (50Hz 원본)
  2. **DB 저장** → MariaDB에 50Hz 전체 저장

### 2. 실시간 전송 (WebSocket)
- Django Channels `WebsocketConsumer` 사용
- Channel Layer: In-Memory (단일 서버이므로 Redis 불필요)
- 메시지 포맷: JSON
  ```json
  {
    "ts": 1718123456.789,
    "lat": 37.123,
    "lon": 127.456,
    "alt_ft": 3500,
    "ias_kt": 120,
    "heading": 270,
    "pitch": 2.5,
    "roll": -1.2,
    "params": {}
  }
### 3. 지도 (map_view — Page 1)
타일: CartoDB Dark Matter (https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png)
항적선: Canvas Overlay (L.canvas()) — DOM 없이 직접 렌더링
항공기 아이콘: SVG 기반 커스텀 마커 (heading에 따라 회전)
표시 정보: 위치, 속도, 고도, 헤딩 (HUD 스타일 오버레이)
### 4. Strip Chart (strip_chart — Page 2)
라이브러리: uPlot (~45KB, Canvas 2D, 60FPS+)
표시 주파수: 10Hz (50Hz 수신 → 5프레임마다 1개 표시)
슬라이딩 윈도우: 최근 60초 (사용자 조절 가능)
기본 표시 파라미터: 고도, IAS, 피치, 롤, 헤딩 (DataRef 확정 후 업데이트)
### 5. 데이터 관리 (data_management — Page 3)
비행 세션: 수동 버튼으로 시작/종료
시작: 세션 레코드 생성, UDP 수신 → DB 저장 활성화
종료: 세션 종료 시각 기록, 저장 비활성화
조종사 정보: 이름, 소속, 메모 (추후 필드 확장)
특이사항: 자유 텍스트 + 타임스탬프 자동 기록
UI: Django Form + HTMX (페이지 리로드 없이 저장)
### 6. Replay (replay — 보류)
DB에서 세션 데이터 조회 → 시간 순서대로 재생 (추후 구성, 현재 미착수)
재생 속도: 0.5x / 1x / 2x / 4x 배속 지원
동시 재현: 지도(Leaflet) + Strip Chart(uPlot) 동기화 재생
구간 선택: 전체 재생 / 시간 범위 선택 재생
재생 컨트롤: 재생/일시정지/정지/구간이동

### 7. ABSim-Dashboard REST 연동 (absim_link — 구현 완료 2026-07-18)
- 대상: `GET /api/abfap/tracks/`, `GET /api/abfap/model-status/`
  (`docs/ABFAP_Export_Interface.md` §1~2 기준, host/주기/타임아웃은 `.env`:
  `ABSIM_DASHBOARD_BASE_URL`/`ABSIM_POLL_INTERVAL_SEC`/`ABSIM_REQUEST_TIMEOUT_SEC`)
- `apps/absim_link/rest_client.py` — `udp_listener.py`와 동일한 패턴(Daphne
  twisted_loop 태스크 등록 + lifespan startup 이중 등록)으로 백그라운드 asyncio
  폴링 루프 실행, `httpx.AsyncClient`로 두 엔드포인트 순차 조회 후 in-memory
  dataclass(`_RestStatus`)에 캐시
- 폴링 주기: 기본 1초(`ABSIM_POLL_INTERVAL_SEC`) — X-Plane 50Hz와 달리 Channels를
  거치지 않고 **단순 폴링**으로 프론트까지 전달 (아래 §Map 참고)
- 자체 API 3개 노출: `GET /absim/` (상태 페이지, `udp_receiver:status`와 동일 UI
  패턴), `GET /absim/api/status/` (연결 상태 JSON), `GET /absim/api/tracks/`
  (캐시된 항적 배열 pass-through — `map_view.js`가 1.5초 간격으로 폴링해 지도에 표시)
- 인증 없음(ABFAP는 클라이언트) — Dashboard 쪽 IP allowlist에 ABFAP 발신 IP 등록
  필요(운영 환경 설정 사항, 미확정 항목 참고)

### 8. Flight Planning (flight_planning — 구현 완료 2026-07-18)
- `docs/Debug_FPL_Feature_Reference.md` §1-1, §2의 `DebugFlightPlan`/
  `DebugFlightPlanWaypoint` 패턴을 이식 — 모델명은 `FlightPlan`/`FlightPlanWaypoint`
  (Debug 접두어 없이 운영 기능으로 구성, `apps/flight_planning/models.py`)
- Leaflet 지도 편집(우클릭 메뉴로 출발/경유/도착 지정, 드래그로 좌표 수정) + 테이블
  인라인 편집 + 저장/다른 이름으로 저장(이름 unique, 서버 중복 체크) —
  `static/js/flight_planning.js`, `apps/flight_planning/views.py: FlightPlanSaveView`
- ABSim.exe 바이너리 프로토콜과 무관 — 여기서는 좌표/속도/이름만 다루고, 인코딩은
  Injection 단계(§9)에서도 하지 않음(그것도 Dashboard 책임)
- **EOBT 자동 계산 (`apps/flight_planning/eobt.py`, 2026-07-18 확정 / 2026-07-19
  이·착륙 구간 예외 추가)**: 사용자는 Flight Planning 화면에서 **도착
  예정시각(ETA)** 을 입력한다. `eobt`(출발 예정시각, Injection 요청 필수 필드)는
  ETA에서 역산한다:
  1. 경로를 `[departure, waypoint_1, ..., waypoint_N, arrival]` 순서로 두고, 각 구간
     (leg)의 거리(great-circle, nm)를 구간별 **도착 지점의 `velocity`(kt)** 로 나눠
     구간 소요시간을 계산 (`leg_time = leg_distance_nm / arrival_point.velocity_kt`
     시간, 이후 초로 변환)
     - **예외**: `departure`/`arrival`의 velocity는 항상 0으로 기재되며(순항
       속도가 아니라 각각 이륙/착륙을 의미) 실제 순항 시간 계산에 쓰지 않는다.
       - `[departure → waypoint_1]` 구간: `waypoint_1`은 이륙 고도(climb-out)를
         의미하므로 거리/속도 계산 없이 이륙 구간(20초)에 포함하고,
         `waypoint_1.utc = departure.utc`(= `eobt + 20초`)로 둔다.
       - `[waypoint_N → arrival]` 구간: `waypoint_N`은 착륙 진입(final
         approach)을 의미하므로 동일하게 거리/속도 계산 없이 착륙 구간(20초)에
         포함하고, `arrival.utc = waypoint_N.utc`로 둔다.
       - 따라서 순항 시간 계산에는 Waypoint 간 구간만 쓰이며, Waypoint가 하나도
         없는(departure→arrival 직항) 경로는 순항 속도를 구할 방법이 없어
         `ScheduleError`.
  2. `총 비행시간 = Σleg_time + 20초(이륙) + 20초(착륙)`
  3. `eobt = ETA - 총 비행시간`
  4. 각 지점의 통과 예정 UTC도 같이 계산해 채운다: `departure.utc = eobt + 20초`,
     `waypoint_i.utc = eobt + 20초 + (departure~waypoint_i 누적 leg_time)`,
     `arrival.utc = ETA - 20초`
  - Waypoint 간 구간의 `velocity`가 0이거나 미입력이면 나눗셈 불가 — 저장/전송
    전 유효성 검사로 막을 것 (경유점별 계획속도 입력 필수, 단 첫/마지막
    Waypoint는 위 이·착륙 예외로 인해 속도 입력이 불필요함)

### 9. Flight Plan Injection (flight_plan_injection — 구현 완료 2026-07-18)
- 요청/응답 필드는 `docs/ABFAP_FPL_Interface.md` §1-2/§1-3 그대로 (`gufi_id`,
  `callsign`, `target_model`, `aircraft_type`, `dep`, `arr`, `eobt`, `departure`/
  `arrival`/`waypoints[]` — 각 `name`/`lat`/`lon`/`alt`/`velocity`/`utc`),
  `apps/flight_plan_injection/views.py: _build_payload()`가 실제 구성
- **Debug FPL과의 핵심 차이**: 로컬 UDP 전송이 아니라 `POST /api/abfap/fpl/`(JSON,
  `httpx.post`, sync) — ABFAP는 `absim_protocol.py` 수준의 바이너리 인코딩을 몰라도 됨
- `gufi_id`는 ABFAP가 매 전송마다 `ABF-{uuid4().hex}`로 자체 발급
- **Departure Time(EOBT) 계산 방식 변경(2026-07-19 확정)**: Flight Plan에 저장된
  ETA를 역산하지 않고, **`EOBT = Injection 시각(전송 버튼을 누른 현재 시각,
  `timezone.now()`) + Departure Offset`** 으로 직접 계산한다 — Callsign 입력칸
  오른쪽에 "Departure Offset (분)" 입력을 추가(`templates/flight_plan_injection/
  index.html`, 기본 1분), 요청 바디 `departure_offset_min` 필드로 전달
  (`static/js/flight_plan_injection.js`). 서버는 `_resolve_request()`에서 EOBT를
  구한 뒤 `apps/flight_planning/eobt.py: compute_schedule_for_plan_from_eobt()`
  (ETA 역산용 `compute_schedule()`과 달리 EOBT를 그대로 기준점 삼아 각 지점 통과
  UTC를 순방향 계산)로 `departure.utc`/`waypoints[].utc`/`arrival.utc`를 계산 —
  Flight Plan 저장 시 입력한 ETA는 Injection 단계에서 더 이상 쓰이지 않는다
  (`YYYY-MM-DDTHH:MM:SSZ` 포맷, MFC가 형식 불일치 시 거부하므로 `+00:00` 아닌
  `Z` 접미사 고정은 기존과 동일)
- **멱등성 없음(문서 §4-4)에 대한 ABFAP 측 대응**: `InjectionSendView`가 전송 전
  `FlightPlanInjection.objects.filter(flight_plan_id=, target_model_name=,
  success=True).exists()`로 중복을 검사해 409(`duplicate: true`)로 차단 — 프론트가
  이를 받으면 `confirm()`으로 사용자 확인 후 `force: true`를 실어 재요청해야만 우회
  가능. 대상 Model 가용성(RUN+UDP연결)도 `absim_link.rest_client.get_models()` 캐시로
  서버측 재검증(레이스 컨디션 방지, Debug FPL §3 원칙과 동일)
- "미리보기"(`InjectionPreviewView`, `POST /flight-plan-injection/preview/`)는 실제
  전송될 JSON payload를 그대로 계산해 보여주기만 하고 전송/이력 저장 없음
- 전송 이력(`FlightPlanInjection`)은 FK(`SET_NULL`)+이름 스냅샷 패턴 —
  원본 FPL/Model이 삭제돼도 이력 조회가 깨지지 않음. Dashboard 응답의
  `injection_id`(→`dashboard_injection_id`)/`flight_plan_id`(→
  `dashboard_flight_plan_id`)/`gufi_id`도 같이 저장
- end-to-end 테스트 완료(Django test client + `httpx.post` 모킹): 정상 전송 →
  중복 차단(409) → `force=True` 우회 전송까지 확인

### DB 설계 원칙
저장 주기
비행 데이터: 50Hz 전체 저장 (초당 50행)
세션 메타: 별도 테이블 (시작/종료 시각, 조종사, 메모)
핵심 테이블 (초안)
-- 비행 세션
FlightSession: id, pilot_name, start_time, end_time, notes

-- 비행 데이터 (50Hz)
FlightData: id, session_id(FK), timestamp, lat, lon,
            alt_ft, ias_kt, tas_kt, gs_kt,
            heading, pitch, roll,
            params(JSON)  ← DataRef 확정 전 유연하게 사용

-- 특이사항
FlightEvent: id, session_id(FK), timestamp, category, description
인덱스 전략
FlightData: (session_id, timestamp) 복합 인덱스 필수
Replay 조회 성능을 위해 파티셔닝 검토 (데이터 누적 후)

### 코딩 컨벤션
## Python
PEP 8 준수
Type hint 필수 (def receive(self, data: dict) -> None:)
비동기 함수는 async/await 명시
환경변수는 .env + django-environ 으로만 관리
하드코딩 금지: IP, 포트, DB 접속정보, 경로
## Django
Class-Based View 우선 사용
URL 네이밍: 앱명:뷰명 형식 (map_view:index)
템플릿 태그보다 API(JSON) + JS 방식 선호 (실시간 데이터)
select_related / prefetch_related 적극 활용
## JavaScript
const / let 사용, var 금지
WebSocket 재연결 로직 필수 구현 (지수 백오프)
uPlot 인스턴스는 모듈 단위로 분리 관리
## 공통
커밋 메시지: 한국어 허용, feat: / fix: / docs: 프리픽스 사용
함수/변수명: 영어 (snake_case)
주석: 한국어 허용

실행방법
# 1. 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate        # macOS
venv\Scripts\activate           # Windows

# 2. 패키지 설치
pip install -r requirements.txt

# 3. 환경변수 설정
cp .env.example .env
# .env 파일에서 DB 접속정보, UDP 포트 설정

# 4. DB 마이그레이션
python manage.py migrate

# 5. 개발 서버 실행 (ASGI — Channels 필수)
python manage.py runserver

미확정 항목 (개발 중 업데이트 필요)
 X-Plane 버전 확정 → UDP 패킷 파서 구현
 DataRef 전체 목록 확정 → dataref_config.py 작성
 조종사 정보 필드 상세 확정
 특이사항 카테고리 분류 체계 확정
 항공 차트 오버레이 필요 여부 (공역 경계 등)
 ABSim-Dashboard REST 폴링 주기 (우선 1~2Hz 제안, 확정 필요)
 ABFAP → Dashboard 인증 방식 (Dashboard는 IP allowlist 확정 — ABFAP 쪽 발신 IP 등록 필요)
 `waypoints[].utc`가 ABSim(MFC)에서 실제로 사용되는지 (`docs/ABFAP_FPL_Interface.md` §4-5,
 Dashboard 쪽 미확인 — ABFAP는 우선 계산해서 채우기로 확정, MFC 실사용 여부와 무관하게 진행)

참고 자료
Django 5.2 LTS 공식 문서
Django Channels 공식 문서
uPlot GitHub
Leaflet.js 공식 문서
X-Plane UDP 데이터 포맷


---

## To Do List

### UDP 데이터 확장성 (2026-07-05 검토 완료)

**배경:** X-Plane에서 새 데이터 그룹을 추가했을 때 대시보드 코드 수정 없이 자동 처리 가능한지 검토.

**결론:** 현재 구조(`dataref_config.py` 직접 편집 방식) 유지.

**워크플로우:**
1. X-Plane에서 새 DATA 그룹 활성화
2. `apps/udp_receiver/dataref_config.py`의 `GROUP_MAP`에 그룹 정의 추가
3. 서버 재시작 → 수신·DB 저장·WebSocket 전송·Strip Chart 표시 자동 반영

**향후 고려 (미착수):**
- [ ] Strip Chart 파라미터 선택 UI 동적화 — `GROUP_MAP` 기반으로 선택 가능한 파라미터 목록을 자동 생성하도록 변경 (현재 하드코딩)
- [ ] `GROUP_MAP` 외부 파일(JSON/YAML)화 — Python 코드 편집 없이 그룹 정의 추가 가능하게 (현재는 불필요, 필요 시 검토)

---

### ABFAP ↔ ABSim-Dashboard 연동 (2026-07-18 검토 완료)

**배경:** ABFAP(이 저장소) ↔ ABSim-Dashboard(WS#3, 별도 저장소) 간 REST 연동 체계
구성. ABSim-Dashboard ↔ ABSim 구간은 이미 구성 완료. `docs/ABFAP_Export_Interface.md`,
`docs/Debug_FPL_Feature_Reference.md` 검토 결과 이 저장소에는 관련 코드가 전혀 없어
전 항목 신규 구현.

**진행 순서:**
1. CLAUDE.md 개정(본 갱신) — 완료
2. `POST /api/abfap/fpl/` 요청 스키마 확인 — 완료 (`docs/ABFAP_FPL_Interface.md`,
   Dashboard 쪽 구현 완료 기준 문서. EOBT 역산 로직·멱등성 대응 방침도 확정, §8~9 참고)
3. `absim_link` 앱: REST 폴링 클라이언트(tracks/model-status) + 상태 페이지 — 완료
   (사이드바 하단 "REST 상태" 링크, `/absim/api/tracks/` 노출, §7 참고)
4. Air Traffic Tracking 지도: X-Plane 항적(WS) + REST 항적(폴링) 병합 표시 — 완료
   (`static/js/map_view.js`, 색상으로 출처 구분 — X-Plane 빨강 / ABSim-Dashboard 파랑,
   `udp_connected=false`인 Model은 회색으로 표시. ABSim-Dashboard 마커는 Callsign을
   `makeAbsimTrackIcon()`으로 마커 하단에 항상 표시 — 클릭 시 팝업으로 고도/속도/
   UDP 상태 추가 표시, 2026-07-18 추가)
5. `flight_planning` 앱: FPL 라이브러리 편집 화면 + ETA 입력 → EOBT 역산 — 완료
   (`/flight-planning/`, 사이드바 "Flight Planning" 링크, §8 참고, end-to-end 검증 완료)
6. `flight_plan_injection` 앱: 대상 Model 선택 → JSON POST 전송 + 이력 + 재전송 차단 —
   완료 (`/flight-plan-injection/`, 사이드바 "Flight Plan Injection" 링크, §9 참고,
   Django test client + `httpx.post` 모킹으로 정상/중복차단/force우회 3가지 시나리오
   검증 완료. **실제 ABSim-Dashboard 서버와의 연동은 미검증** — 이 저장소 안에서
   재현 가능한 범위까지만 확인)

**보류 (미착수):**
- [ ] 데이터 관리 (조종사/특이사항 관리)
- [ ] Replay

---

**참고 출처**
- [[0]](#__0) [uPlot GitHub — leeoniya/uPlot](https://github.com/leeoniya/uplot)
- [[2]](#__2) [uPlot 라이브러리 심층 리뷰](https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/)
- [[5]](#__5) [uPlot 공식 데모 — Sine wave stream 60Hz](https://leeoniya.github.io/uPlot/demos/index.html)
- [[6]](#__6) [uPlot NPM 패키지](https://app.unpkg.com/uplot@1.6.28/files/README.md)
