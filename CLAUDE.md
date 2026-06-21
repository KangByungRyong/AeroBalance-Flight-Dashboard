# CLAUDE.md — X-Plane Flight Data Monitoring System

## 프로젝트 개요
X-Plane 시뮬레이터로부터 UDP 데이터를 수신하여 실시간으로 시각화하고,
MariaDB에 저장·관리하는 Django 기반 웹 애플리케이션.

---

## 기술 스택

### Backend
- **Python**: 3.11
- **Django**: 5.2 LTS
- **Django Channels**: 4.x (WebSocket 실시간 통신)
- **ASGI 서버**: Uvicorn (개발) / Daphne (배포)
- **DB**: MariaDB (mysqlclient 드라이버)

### Frontend
- **UI 언어**: 한국어 전용
- **테마**: 다크 테마 (전체 UI)
- **지도**: Leaflet.js + Canvas Overlay + CartoDB Dark Matter 타일
- **차트**: uPlot (Strip Chart — 실시간 + Replay)
- **템플릿**: Django Template + Bootstrap 5 (다크 모드)

### 데이터 흐름
X-Plane (UDP 송출)
↓ 50Hz
UDP Listener (Python asyncio thread)
↓
Django Channels Consumer
↓ WebSocket (50Hz → 프론트 전송)
Browser (Leaflet + uPlot)
↓ 병렬
MariaDB (50Hz 전체 저장)


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
│   ├── udp_receiver/    ← UDP 수신 + WebSocket Consumer
│   ├── map_view/        ← Page 1: 항행지도 + 항적
│   ├── strip_chart/     ← Page 2: Strip Chart (uPlot)
│   ├── data_management/ ← Page 3: 조종사/특이사항 관리
│   └── replay/          ← Page 4: 저장 데이터 Replay
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
┌─────────────────────────────────────────────────────────┐
│  [☰] Flight Data Monitoring System        🔴 비행중 세션명 │  ← Top Navbar
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  ☰ 메뉴  │                                              │
│  ──────  │           메인 콘텐츠 영역                    │
│  🗺️ 지도  │         (Page별 전환 렌더링)                  │
│          │                                              │
│  📈 차트  │                                              │
│          │                                              │
│  📋 관리  │                                              │
│          │                                              │
│  ▶️ 리플레이│                                              │
│          │                                              │
│  ──────  │                                              │
│  ⚙️ 설정  │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
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
- 우측: 현재 비행 세션 상태 표시
  - 🔴 비행중: 세션명 + 경과 시간 (실시간 카운트업)
  - ⚫ 대기중: "세션 없음" 표시
- 배경: 다크 테마 (#1a1a2e 계열)

### 사이드바 메뉴 구성
☰  Flight Monitor          ← 로고/타이틀 영역
━━━━━━━━━━━━━━━━━━━
🗺️  항행지도               ← Page 1: /map/
📈  Strip Chart            ← Page 2: /chart/
📋  데이터 관리             ← Page 3: /management/
▶️  Replay                 ← Page 4: /replay/
━━━━━━━━━━━━━━━━━━━
⚙️  설정                   ← /settings/


### 페이지별 URL 구조
| **페이지** | **URL** | **앱** |
|-----------|---------|--------|
| 항행지도 | `/map/` | `map_view` |
| Strip Chart | `/chart/` | `strip_chart` |
| 데이터 관리 | `/management/` | `data_management` |
| Replay | `/replay/` | `replay` |
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
          <span class="label">항행지도</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'chart' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'strip_chart:index' %}{% endraw %}">
          <span class="icon">📈</span>
          <span class="label">Strip Chart</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'management' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'data_management:index' %}{% endraw %}">
          <span class="icon">📋</span>
          <span class="label">데이터 관리</span>
        </a>
      </li>
      <li class="{% raw %}{% if active_page == 'replay' %}active{% endif %}{% endraw %}">
        <a href="{% raw %}{% url 'replay:index' %}{% endraw %}">
          <span class="icon">▶️</span>
          <span class="label">Replay</span>
        </a>
      </li>
    </ul>
    <ul class="sidebar-menu sidebar-bottom">
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
항행지도 (Page 1): 콘텐츠 영역 = 지도 100% 풀사이즈
사이드바 닫힘 시 지도 영역 자동 확장 (resize 이벤트 → map.invalidateSize())
Strip Chart (Page 2): 상단 파라미터 선택 툴바 + 하단 uPlot 차트 영역
데이터 관리 (Page 3): 좌측 세션 목록 + 우측 상세 편집 패널 (2-column)
Replay (Page 4): 상단 지도 + 하단 차트 (수직 분할) + 하단 재생 컨트롤 바

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
### 6. Replay (replay — Page 4)
DB에서 세션 데이터 조회 → 시간 순서대로 재생
재생 속도: 0.5x / 1x / 2x / 4x 배속 지원
동시 재현: 지도(Leaflet) + Strip Chart(uPlot) 동기화 재생
구간 선택: 전체 재생 / 시간 범위 선택 재생
재생 컨트롤: 재생/일시정지/정지/구간이동

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

참고 자료
Django 5.2 LTS 공식 문서
Django Channels 공식 문서
uPlot GitHub
Leaflet.js 공식 문서
X-Plane UDP 데이터 포맷


---

## 💡 다음 단계 제안

CLAUDE.md가 완성되었으니 아래 순서로 개발을 시작하면 됩니다:

1. **Django 프로젝트 초기화** → 앱 구조 생성
2. **UDP 수신 모듈** → X-Plane 버전 확정 후 파서 작성
3. **WebSocket Consumer** → 실시간 데이터 파이프라인
4. **Page 1 (지도)** → Leaflet + Canvas Overlay
5. **Page 2 (차트)** → uPlot Strip Chart
6. **Page 3/4** → 데이터 관리 + Replay

---

**참고 출처**
- [[0]](#__0) [uPlot GitHub — leeoniya/uPlot](https://github.com/leeoniya/uplot)
- [[2]](#__2) [uPlot 라이브러리 심층 리뷰](https://cprimozic.net/notes/posts/my-thoughts-on-the-uplot-charting-library/)
- [[5]](#__5) [uPlot 공식 데모 — Sine wave stream 60Hz](https://leeoniya.github.io/uPlot/demos/index.html)
- [[6]](#__6) [uPlot NPM 패키지](https://app.unpkg.com/uplot@1.6.28/files/README.md)
