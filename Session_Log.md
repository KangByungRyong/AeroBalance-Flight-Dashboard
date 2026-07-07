# Session Log — AeroBalance Flight Dashboard

---

## 2026-07-05

### 작업 범위 요약
Strip Chart 페이지 전면 재구성 및 Data Management 페이지 리팩토링.

---

### 완료된 작업

#### 1. Strip Chart 전면 재구성 (`strip_chart`)

**파라미터 채널 정의 (`strip_chart.js` — CHANNEL_GROUPS)**
- X-Plane 24개 DATA 그룹 기준으로 전체 채널 목록 정의
- 그룹 분류: 비행 기본, 자세/방향, 각속도/각가속도, 조종 입력, 비행 조종면, 착륙장치/브레이크, 엔진 파워, 연료 등
- 각 채널: `key`(WebSocket JSON 경로), `label`(표시명), `unit`(단위) 포함

**uPlot 차트 엔진 (`buildUplot`)**
- uPlot 인스턴스 생성/파괴/재빌드 분리 (`buildUplot` / `destroyUplot` / `rebuildUplot`)
- 60초 슬라이딩 윈도우 실시간 렌더링
- 다중 채널 동시 표시

**툴팁 시스템 (`initTooltip` / `showTooltip`)**
- 커서 위치 기준 nearest timestamp 탐색
- 모든 활성 차트 동기화 표시

**스타일 패널 (`makeStylePanel`)**
- 채널별 색상, 선 굵기, 대시 패턴 설정 UI
- 설정 실시간 적용 (uPlot rebuild 없이)

**팝업 / 도킹 시스템 (`createPopup` / `dockChart` / `undockChart`)**
- 차트를 독립 팝업으로 분리하거나 그리드 셀에 도킹
- 팝업 드래그 이동 (`attachPopupDrag`) / 리사이즈 (`attachPopupResize`)
- 셀 스플리터로 그리드 비율 조절 (`attachSplitter`)

**레이아웃 저장/복원**
- `sessionStorage` 기반 레이아웃 자동 저장 (`saveSessionLayout` / `restoreSessionLayout`)
- INI 파일 형식으로 레이아웃 내보내기/불러오기 (`generateIni` / `applyIni` / `downloadIni`)

**신규 파일**
- `static/css/strip_chart.css` — Strip Chart 전용 스타일 (872줄)
- `templates/strip_chart/external.html` — 팝업 분리 뷰 (132줄)

---

#### 2. Data Management 리팩토링 (`data_management`)

- `views.py`: 미구현 View 코드를 주석 처리하고 현재 구현 범위 명확화
- `forms.py`: FlightSession / FlightEvent 폼 정비
- `admin.py`: Django Admin 등록 정비
- `urls.py`: URL 패턴 정리
- `templates/data_management/index.html`: UI 레이아웃 재구성

---

#### 3. CLAUDE.md 업데이트

- **UDP 데이터 확장성 검토 결과 기록** (2026-07-05)
  - 결론: `dataref_config.py` 직접 편집 방식 유지
  - 향후 고려: Strip Chart 파라미터 선택 UI 동적화, GROUP_MAP 외부 파일화 (미착수 항목으로 등록)

---

#### 4. 시스템 자원 현황 점검

| 항목 | 현황 |
|------|------|
| CPU idle | 82.8% (여유 충분) |
| Django 메모리 | 약 111 MB (PID 38489) |
| MariaDB 메모리 | 14 MB |
| Swap | 0 (미사용) |
| UDP 수신 포트 | :49100 정상 대기 |
| WebSocket 연결 | 1개 활성 |

→ **결론:** X-Plane 동시 구동 포함해도 자원 여유 충분. M5 / 16GB 환경에서 성능 이슈 없음.

---

### 미완료 / 다음 세션 작업

| # | 항목 | 비고 |
|---|------|------|
| 1 | Strip Chart x축 동작 변경 | 현재: 0→60s 확장. 목표: 60s 고정 윈도우, 데이터가 우→좌로 흐르는 형태 |
| 2 | Strip Chart 파라미터 선택 UI 동적화 | GROUP_MAP 기반 자동 목록 생성 (CLAUDE.md ToDo 등록됨) |
| 3 | Data Management View 구현 | 세션 시작/종료, 특이사항 기록 UI |
| 4 | UDP 파서 확정 | X-Plane 버전 확정 후 진행 |

---

## 2026-06-21

### 완료된 작업
- Django 프로젝트 초기 구조 생성
- 사이드바 + Top Navbar 레이아웃 구성 (base.html)
- X-Plane UDP 수신 모듈 구현 (asyncio, 포트 49100)
- WebSocket Consumer 연결 (Django Channels)
- Map View (Page 1) 초기 구성
