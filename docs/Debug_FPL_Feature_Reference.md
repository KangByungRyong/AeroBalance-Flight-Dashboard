# Debug Flight Planning / Debug FPL Injection — 구성 참고 문서

> 목적: ABSim-Dashboard(WS#3)에 구현된 **Debug Flight Planning** / **Debug Flight
> Plan Injection** 기능을 ABFAP(WS#1)에 유사하게 이식할 때 참고할 현재 구성
> 스냅샷. 작성 시점: 2026-07-17.
> 원본 구현: `apps/debug_fpl/` (ABSim-Dashboard)

---

## 0. 먼저 확인할 것 — ABFAP 이식 시 그대로 가져올 수 없는 부분

이 기능은 **Dashboard와 ABSim.exe가 동일 PC(WS#3)** 라는 전제 위에 설계되어
있다 (`CLAUDE.md` §2 참고). ABFAP는 **WS#1(별도 PC, 10.0.0.100)** 이므로 아래
2가지는 그대로 복사하면 동작하지 않는다.

| 구성요소 | ABSim-Dashboard(WS#3)에서의 구현 | ABFAP(WS#1)에서 필요한 대안 |
|---|---|---|
| FPL 전송 경로 | `apps/simulation/udp_client.py` — `127.0.0.1:50XX`로 **Loopback UDP** 직접 전송 | 네트워크 너머 ABSim(10.0.0.120)으로 전송해야 함. `CLAUDE.md` §3-3 기준으로는 ABFAP가 FPL을 만들면 **ABSim-Dashboard가 HTTP GET으로 가져가서** 자신이 로컬 UDP로 중계하는 구조가 이미 문서화되어 있음. ABFAP 쪽에 Debug FPL Injection을 만든다면 "직접 UDP 전송"이 아니라 "ABSim-Dashboard가 가져갈 수 있게 노출하는 API" 또는 별도 확인된 원격 전송 경로가 필요 — **설계 확정 전 사용자 확인 필요**. |
| 대상 실행 여부 판정 | `apps/simulation/process_manager.py`(tasklist/taskkill) + `apps/simulation/status_listener.py`(로컬 UDP AC_Return 수신) — 같은 PC이므로 프로세스 테이블/로컬 소켓을 직접 조회 | ABFAP는 ABSim 프로세스에 직접 접근할 수 없음. WS#3 REST API(`:8001`) 조회 또는 ABSim-Dashboard가 제공하는 상태 API를 통해야 함 |
| `SimulationModel` (RegNumber/포트 규칙) | `apps/settings_app/models.py` — 폴더명(AB0010~AB0100) 기준 RegNumber·포트 계산 | ABFAP가 이 모델 목록을 그대로 알 필요는 없을 수 있음 — ABSim-Dashboard가 이미 관리하는 정보를 재조회할지, ABFAP가 별도로 인스턴스 목록을 가질지 확인 필요 |

**결론**: 아래 §1~§6은 "동일 PC 로컬 UDP" 전제하의 구현이며, **UI/데이터
모델/바이너리 프로토콜 인코딩 로직은 그대로 재사용 가능**하지만, **전송
경로(§4)와 대상 가용성 판정(§3 `InjectionIndexView`, `is_available`)은
ABFAP 환경에 맞게 다시 설계해야 한다.**

---

## 1. 화면 구성

| 화면 | URL | 템플릿 | 역할 |
|---|---|---|---|
| Debug Flight Planning | `/pseudo-command/debug-fpl/` | `debug_fpl/planning.html` | FPL 라이브러리 목록 + Leaflet 지도 기반 편집 |
| Debug Flight Plan Injection | `/pseudo-command/debug-fpl/inject/` | `debug_fpl/injection.html` | 편집된 FPL을 대상 인스턴스에 전송 + 이력 조회 |

두 화면은 `Pseudo Command`(디버그/테스트용) 메뉴 하위에 위치하며, 별도 앱
`apps/debug_fpl/`로 분리되어 있다 — 사용자가 사전 확인한 설계 판단(앱 분리,
공용 프로토콜 계층 재사용, Model 선택+Callsign 직접 입력, Leaflet CDN 사용)을
그대로 채택한 결과.

### 1-1. Debug Flight Planning 화면 동작
- 좌측: 저장된 FPL 목록(`+ 신규 Debug FPL` 포함) — 클릭 시 우측 지도/폼에 로드
- 우측: Leaflet 다크 지도
  - **우클릭**: 출발점이 없으면 "출발점 지정" 메뉴, 있으면 "경유점 추가"/"도착점
    지정" 메뉴. 기존 경유점 우클릭 시 "삭제" 메뉴
  - 마커 클릭: GPS 정보 표시 / 드래그: 위경도 즉시 갱신(폼 동기화)
  - 출발/도착 좌표·이름·고도(ft)는 별도 입력 폼으로도 직접 수정 가능
  - 경유점 테이블: 이름/위도/경도/고도(ft)/속도(kt) 인라인 편집 + 행 삭제
- 저장 방식 2가지 (사용자가 명시 요구한 요건):
  - **저장**: 기존 레코드 제자리 수정 (`save_as=false` + `id` 포함)
  - **다른 이름으로 저장**: 새 레코드 생성, 원본 보존 (`save_as=true`)
  - 이름 중복 체크는 서버에서 수행 (`PlanSaveView`)

### 1-2. Debug FPL Injection 화면 동작
- 상단: Debug FPL 선택 / 대상 Model 선택 / Callsign(미입력 시 Model명 기본) /
  예정 출발(분 후, 기본 1분) / [전송 원문 미리보기] / [Injection 전송]
- 대상 Model 드롭다운은 **RUN 상태 + UDP 연결 정상**인 것만 선택 가능
  (`option disabled`) — WebSocket(`/ws/model-status/`)으로 실시간 동기화
- "전송 원문 미리보기": 실제로 wire에 나갈 바이너리 패킷을 만들어 그 자리에서
  디코딩한 결과를 텍스트로 보여줌 (UDP 전송/이력 저장 없음)
- "Injection 전송": 실제 UDP 전송 + `DebugFlightPlanInjection` 이력 기록
- 하단: 선택한 FPL의 경로를 보여주는 소형 지도 + Injection 이력 테이블
  (시각/FPL명/대상/Callsign/출발예정UTC/GufiID/Waypoint수/성공·실패)

---

## 2. 데이터 모델 (`apps/debug_fpl/models.py`)

```python
class DebugFlightPlan(models.Model):
    name = CharField(unique=True)
    departure_name / departure_lat / departure_lon / departure_alt(ft)
    arrival_name   / arrival_lat   / arrival_lon   / arrival_alt(ft)
    created_at, updated_at

class DebugFlightPlanWaypoint(models.Model):
    flight_plan = FK(DebugFlightPlan, related_name='waypoints', on_delete=CASCADE)
    seq, name, lat, lon, alt(ft), velocity(kt)
    unique_together = [('flight_plan', 'seq')]

class DebugFlightPlanInjection(models.Model):
    flight_plan = FK(DebugFlightPlan, null=True, on_delete=SET_NULL)
    flight_plan_name  # 스냅샷 — 원본 삭제돼도 이력 유지
    target_model = FK(SimulationModel, null=True, on_delete=SET_NULL)
    target_model_name  # 스냅샷
    callsign, gufi_id, departure_utc, waypoint_count
    success, error_message, injected_at
```

핵심 설계: **Injection 이력은 FK가 아니라 이름 스냅샷을 같이 저장**한다.
원본 FPL/대상 Model이 나중에 삭제·변경돼도 이력 조회가 깨지지 않는다.
ABFAP 이식 시에도 이 패턴을 유지할 것을 권장.

`DebugFlightPlan.to_dict()`가 지도/Edit Box 로드 및 패킷 생성에 공용으로
쓰인다 (`{id, name, departure:{...}, arrival:{...}, waypoints:[...]}`).

---

## 3. 서버 API (`apps/debug_fpl/views.py`, `urls.py`)

| 메서드 | URL | View | 역할 |
|---|---|---|---|
| GET | `/pseudo-command/debug-fpl/` | `PlanningIndexView` | 목록 페이지 |
| GET | `/pseudo-command/debug-fpl/<id>/` | `PlanDetailView` | FPL 전체 데이터 JSON |
| GET | `/pseudo-command/debug-fpl/active-for-model/<model_name>/` | `ActivePlanForModelView` | 해당 Model에 마지막으로 성공 주입된 FPL (모니터링 지도 오버레이용) |
| POST | `/pseudo-command/debug-fpl/save/` | `PlanSaveView` | 신규/수정/다른 이름으로 저장 공용 처리 |
| POST | `/pseudo-command/debug-fpl/<id>/delete/` | `PlanDeleteView` | 삭제 |
| GET | `/pseudo-command/debug-fpl/inject/` | `InjectionIndexView` | Injection 페이지 (Model 가용성 계산 포함) |
| POST | `/pseudo-command/debug-fpl/inject/preview/` | `InjectionPreviewView` | 패킷 생성 후 즉시 디코딩해 원문만 응답 (전송 없음) |
| POST | `/pseudo-command/debug-fpl/inject/send/` | `InjectionSendView` | 실제 UDP 전송 + 이력 저장 |

`InjectionSendView`는 전송 전 `process_manager.is_running(...)` +
`status_listener.get_status(...).get('udp_connected')`로 대상이 살아있는지
재검증한다 — 화면의 disabled 처리와 별개로 **서버 측에서도 반드시 재검증**한다는
점이 이식 시 지켜야 할 원칙 (레이스 컨디션 방지).

`_build_fpl_packet_for_request()`가 preview/send 두 View의 공용 로직: 출발
예정 UTC를 `now + departure_offset_min`로 계산하고, GufiID를 매 요청마다
`DBG-{uuid4().hex}`로 새로 발급한다 — **미리보기와 실제 전송은 서로 다른
GufiID/UTC를 가진다** (문서화된 동작, 화면에도 안내 문구 있음).

---

## 4. 바이너리 프로토콜 & 전송 (`apps/simulation/absim_protocol.py`, `udp_client.py`)

와이어 포맷은 `docs/ABSim-Dashboard_UDP_Interface.md`(§3 `FPL_Data`, §4
`AC_Return`)에 정의된 `#pragma pack(1)` / Little-Endian 구조체를 Python
`struct`로 그대로 인코딩·디코딩한다.

- `FIX_PROPERTY_FMT = '<30s4d25s'` (87B) — Name/Lat/Lon/Alt(ft)/Velocity(kt)/UTC, 출발·도착·경유점 공용
- `HEADER_PREFIX_FMT = '<50s25si20s20s'` (119B) — GufiID/UTC/WaypointCount/Callsign/RegNumber
- 헤더 293B(고정) + 경유점 87B×N(가변, **100개 꽉 채우지 않고 실제 개수만**) + 트레일러 80B
- `build_fpl_packet()` — dict 입력 → bytes. 도착 FIX_Property의 UTC를 비워
  보내면 ABSim이 "Invalid UTC String"으로 거부하므로 **출발 UTC를 재사용해
  형식만 항상 채운다** (실제 도착 예정 시각 계산은 하지 않음 — Debug FPL 특성)
- `decode_fpl_packet()` — build 결과 bytes를 그대로 역파싱 (미리보기용, 문자열
  길이 제한으로 잘린 값 등 실제 전송 내용을 그대로 드러냄)
- `parse_ac_return()` — SKTSim → Dashboard AC_Return(312B) 파싱 (모니터링용,
  Debug FPL과 직접 관련 없음)

전송은 `udp_client.send_fpl(packet, port, host='127.0.0.1')` — **매 호출마다
소켓을 새로 열고 sendto 후 닫는 단순 fire-and-forget**. ABFAP에서는 host가
`127.0.0.1`일 수 없으므로 §0 표 참고.

---

## 5. 시드 데이터 형식 (`docs/Debug_FPL.ini` + `DebugFPL_Waypoint1~9.ini`)

인덱스 파일 `Debug_FPL.ini` — 한 줄에 `이름, 웨이포인트파일명`:
```
Yeoui-Do -> Jamsil,			DebugFPL_Waypoint1.ini
Jamsil -> Yeoui-Do,			DebugFPL_Waypoint2.ini
...
```

웨이포인트 파일(`DebugFPL_Waypoint1.ini` 예시) — CSV 유사 포맷, 고정 4줄
헤더 후 실제 경로점:
```
Waypoint Name,		Latitude,	Longitude,	Altitude,	Velocity   ← 주석성 헤더(파싱 안 함)
Yeoui-Do VP,		37.532919,	126.912443,	32                     ← 출발(이름,위도,경도,고도)
Jamsil VP,		37.513759,	127.072393,	32                     ← 도착(이름,위도,경도,고도)
Total Waypoint Indx,	8                                          ← 이후 웨이포인트 총 개수
Yeoui-Do VP,		37.532919,	126.912443,	32,	0              ← 이하 N줄: 이름,위도,경도,고도,속도
PT0,			37.532919,	126.924900,	160,	0
...
Jamsil VP,		37.513759,	127.072393,	32,	0
```

로드 커맨드: `python manage.py seed_debug_fpl` (`apps/debug_fpl/management/commands/seed_debug_fpl.py`)
— 이름 기준 `get_or_create` + 갱신이라 재실행해도 안전(중복 생성 안 됨).

---

## 6. 프론트엔드 구성

| 파일 | 역할 |
|---|---|
| `static/js/debug_fpl_planning.js` | 지도 편집(마커 드래그/컨텍스트 메뉴), 폼 동기화, 저장/삭제 fetch 호출 |
| `static/js/debug_fpl_injection.js` | FPL/Model 선택, 미리보기·전송 fetch, Model 가용성 WebSocket 동기화, 이력 행 prepend |

- 지도 라이브러리: **Leaflet 1.9.4 (CDN, unpkg)** — 신규 의존성 추가 없이 CDN
  스크립트/CSS만 템플릿에 추가
- 타일: OpenStreetMap 표준 타일 (`{s}.tile.openstreetmap.org`) — 참고로 상황
  모니터링(Sim Monitoring) 트랙맵은 CARTO 다크 타일을 쓰지만 이 두 화면은
  기본 OSM 타일 사용
- CSRF: 쿠키의 `csrftoken`을 직접 읽어 `X-CSRFToken` 헤더로 첨부하는 단순한
  fetch 패턴 (프레임워크 없이 vanilla JS)
- Injection 화면은 `/ws/model-status/` WebSocket으로 Model 상태 변화를 받으면
  `/simulation/status/`를 다시 조회해 드롭다운 가용성을 갱신 (WS 페이로드
  자체에는 `process_running`이 없어서 재조회가 필요 — 코드 주석에 이유 명시)

---

## 7. ABFAP 이식 체크리스트 (제안)

1. **전송 경로 확정** — ABFAP가 Debug FPL을 직접 어딘가로 보낼지, 아니면
   `CLAUDE.md` §3-3처럼 ABSim-Dashboard가 GET으로 가져가 중계하는 기존 경로를
   탈지 사용자 확인 필요 (§0 표 1행)
2. **대상 가용성 판정 방식 확정** — WS#3 REST(`:8001`) 폴링인지, ABSim-Dashboard가
   제공하는 상태 API를 쓸지 확인 필요 (§0 표 2행)
3. `apps/debug_fpl/models.py`의 3개 모델 + `to_dict()` 패턴은 거의 그대로 이식 가능
4. `absim_protocol.py`의 `build_fpl_packet`/`decode_fpl_packet`은 프로토콜이
   동일하다면 그대로 재사용 가능 (전송 함수만 host 개념 없이 실제 목적지로 교체)
5. Planning 화면(지도 편집 UX)은 인프라 의존성이 없어 **가장 그대로 이식하기
   쉬운 부분** — Leaflet CDN + JS 그대로 포팅 가능
6. Injection 화면은 "대상 선택 드롭다운의 가용성 판정" 로직만 ABFAP 환경에 맞게
   교체하면 나머지(미리보기/전송/이력)는 구조 재사용 가능
7. 시드 데이터가 필요하면 `docs/Debug_FPL.ini` 포맷 그대로 복사해 커맨드만
   경로 조정

---

## 참고 원본 파일 목록

```
apps/debug_fpl/
├── models.py                 # §2
├── views.py                  # §3
├── urls.py                   # §3
├── admin.py
├── management/commands/seed_debug_fpl.py   # §5
├── migrations/
└── templates/debug_fpl/{planning,injection}.html   # §1, §6

apps/simulation/
├── absim_protocol.py         # §4 (build_fpl_packet/decode_fpl_packet/parse_ac_return)
└── udp_client.py             # §4 (send_fpl)

static/js/debug_fpl_planning.js    # §6
static/js/debug_fpl_injection.js   # §6

docs/Debug_FPL.ini                 # §5
docs/DebugFPL_Waypoint1~9.ini       # §5
docs/ABSim-Dashboard_UDP_Interface.md   # 와이어 프로토콜 원본 명세
```
