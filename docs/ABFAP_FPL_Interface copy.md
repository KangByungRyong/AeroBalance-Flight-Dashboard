# ABFAP → ABSim-Dashboard Flight Plan 수신 인터페이스 (스키마 초안)

> 대상: ABFAP(WS#1, 10.0.0.100) 연동팀
> 범위: ABFAP가 **Dashboard로 전달(push)하는** Flight Plan(FPL) 요청 스키마.
> `docs/ABFAP_Export_Interface.md`(Dashboard → ABFAP, tracks/model-status)의 범위 밖으로
> 남겨두었던 FPL 방향을 다루는 문서.
> 상태: **초안 — 구현은 완료되어 있으나 일부 필드 검증/명세는 확정 전 (§4 참고).**
> 작성일: 2026-07-18

---

## 0. 전제

- 통신 방향은 **Push**: ABFAP가 GufiID를 발급하고 대상 Model(RegNumber)까지 지정해서 Dashboard에
  `POST` 한다. Dashboard는 배정/발급 로직 없이 받은 값을 그대로 대상 Model에 relay만 한다
  (`CLAUDE.md` §3-3, `docs/ABFAP_Export_Interface.md` §4-1' 2026-07-17 확정 사항).
- 구현 위치: `apps/abfap_api/views.py: FlightPlanInboundView` (`POST /api/abfap/fpl/`). 아래
  스키마는 이 코드의 실제 파싱/검증 로직을 그대로 문서화한 것이다.
- 인증: `apps/abfap_api/decorators.py: abfap_ip_required` — `settings.ABFAP_ALLOWED_IPS`에 없는
  발신 IP는 403으로 차단 (WS#1 → WS#3 직접 접속, 프록시 없음 → `REMOTE_ADDR` 그대로 사용).
- Dashboard는 relay 성공 여부와 무관하게 수신한 FPL을 `apps/fpl/models.py: FlightPlan`에,
  relay 이력을 `FlightPlanInjection`에 항상 기록한다 (§1-4 참고).
- 대상 Model이 **RUN 상태 + UDP 연결 정상**이어야만 relay 가능하다 (`process_manager.is_running`
  + `status_listener.get_status().udp_connected`). 아니면 409로 거부.

---

## 1. FPL 수신 엔드포인트

### 1-1. 엔드포인트

| Method | Path | Content-Type |
|---|---|---|
| POST | `/api/abfap/fpl/` | `application/json` |

### 1-2. 요청 스키마

최상위 필드:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `gufi_id` | string | ✅ | ABFAP가 발급한 GUFI. `FPL_Data.GufiID`로 그대로 relay (≤50 byte, 초과분은 잘림) |
| `callsign` | string | ✅ | 기체 콜사인. `FPL_Data.CallSign`으로 relay (≤20 byte, 초과분은 잘림) |
| `target_model` | string | ✅ | 대상 `SimulationModel.name`(RegNumber, 예: `AB0010`). 존재하지 않으면 404, RUN/UDP 비정상이면 409 |
| `aircraft_type` | string | optional | `FlightPlan.aircraft_type` 저장용. 미지정 시 `''` |
| `dep` | string | optional | 출발지 ICAO 코드, `FlightPlan.dep` 저장용 (≤8자) |
| `arr` | string | optional | 목적지 ICAO 코드, `FlightPlan.arr` 저장용 (≤8자) |
| `eobt` | string (ISO8601 UTC) | **✅ 필수** | 예정 출발 시각. 누락/형식 오류 시 400으로 사전 거부(2026-07-18 구현). `FPL_Data`의 출발 UTC(`DepertureVP.UTC`)로도 그대로 재사용됨 — 형식은 `YYYY-MM-DDTHH:MM:SSZ` 권장(25자 이내, MFC가 형식 불일치 시 "Invalid UTC String"으로 거부) |
| `departure` | object | ✅ | 출발 지점. 아래 §1-3 |
| `arrival` | object | ✅ | 도착 지점. 아래 §1-3 |
| `waypoints` | array\<object\> | optional (기본 `[]`) | **출발/도착을 제외한** 경유점 목록, 순서대로 전송됨. 아래 §1-3 |

### 1-3. `departure` / `arrival` / `waypoints[]` 공통 스키마 (FIX_Property)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `name` | string | optional | 지점명 (≤30 byte, 초과분은 잘림). 기본 `''` |
| `lat` | double | ✅ | 위도. 미지정 시 `departure`/`arrival`은 400, `waypoints[]`는 relay 단계에서 502(§1-4) |
| `lon` | double | ✅ | 경도. 위와 동일 |
| `alt` | double | **✅ 필수** | 고도(feet). `departure`/`arrival`/`waypoints[]` 모두 누락 시 400으로 사전 거부(2026-07-18 구현) |
| `velocity` | double | optional | 속도(knot). 기본 `0` |
| `utc` | string | optional | 해당 지점 통과(예정) UTC. `departure`/`arrival`에서 비우면 `eobt` 값을 그대로 재사용. `waypoints[]`는 비우면 빈 문자열 |

> `waypoints`는 `DepertureVP`/`ArrivalVP`와 **분리된** `WayPoint[N]` 필드로 relay된다
> (`docs/ABSim-Dashboard_UDP_Interface.md` §3). 즉 `waypoints` 배열에는 출발/도착 지점을
> **다시 넣지 않는다** — 순수 경유점만 순서대로 나열한다 (`apps/debug_fpl` 실사용 패턴과 동일,
> 2026-07-18 확정).

### 1-4. 응답 스키마

**사전 검증 실패 (relay 시도 전, DB 기록 없음)**

| 상황 | status | body |
|---|---|---|
| JSON 파싱 실패 | 400 | `{"error": "invalid JSON"}` |
| `gufi_id`/`callsign`/`target_model`/`eobt` 중 누락 | 400 | `{"error": "필수 항목 누락: ..."}` |
| `eobt` 형식 오류 (파싱 불가) | 400 | `{"error": "eobt 형식이 올바르지 않습니다: ..."}` |
| `departure`/`arrival`의 `lat`/`lon` 누락 | 400 | `{"error": "departure(또는 arrival)의 위치(lat/lon)를 지정하세요."}` |
| `departure`/`arrival`의 `alt` 누락 | 400 | `{"error": "departure(또는 arrival)의 고도(alt)를 지정하세요."}` |
| `waypoints[i]`의 `lat`/`lon`/`alt` 누락 | 400 | `{"error": "waypoints[i]에 lat, lon, alt가 필요합니다."}` (누락된 필드만 나열) |
| `target_model`에 해당하는 Model 없음 | 404 | `{"error": "알 수 없는 Model: ..."}` |
| 대상 Model이 RUN 상태가 아니거나 UDP 미연결 | 409 | `{"error": "...: RUN 상태 및 UDP 연결이 정상인 Model만 대상으로 지정할 수 있습니다."}` |
| IP Allowlist 미통과 | 403 | `{"error": "...: 허용되지 않은 IP입니다."}` |

**relay 시도 (이 시점부터 `FlightPlan` + `FlightPlanInjection` 레코드가 항상 생성됨)**

| 상황 | status | body |
|---|---|---|
| relay 성공 | 200 | `{"success": true, "error": "", "injection_id": <int>, "flight_plan_id": <int>, "gufi_id": "..."}` |
| relay 실패 (예: `alt` 누락으로 패킷 생성 실패, UDP 전송 실패 등) | 502 | `{"success": false, "error": "<예외 메시지, 255자 이내>", "injection_id": <int>, "flight_plan_id": <int>, "gufi_id": "..."}` |

> relay 실패해도 `FlightPlan`/`FlightPlanInjection` 레코드는 남는다 — ABFAP가 실패를 감지하고
> 재전송하더라도 Dashboard 쪽 이력은 중복 누적된다는 점 참고(멱등성 없음, §4-3).

### 1-5. 샘플 요청

```json
{
  "gufi_id": "GUFI-2026-0718-000123",
  "callsign": "ABX01",
  "target_model": "AB0010",
  "aircraft_type": "ABX01",
  "dep": "RKSI",
  "arr": "RKPC",
  "eobt": "2026-07-18T06:30:00Z",
  "departure": {
    "name": "RKSI",
    "lat": 37.4602,
    "lon": 126.4407,
    "alt": 0,
    "velocity": 0,
    "utc": "2026-07-18T06:30:00Z"
  },
  "arrival": {
    "name": "RKPC",
    "lat": 33.5113,
    "lon": 126.4930,
    "alt": 0
  },
  "waypoints": [
    { "name": "OLMEN", "lat": 36.9, "lon": 126.6, "alt": 15000, "velocity": 250 },
    { "name": "KARBU", "lat": 35.7, "lon": 126.5, "alt": 18000, "velocity": 280 }
  ]
}
```

### 1-6. 샘플 응답 (성공)

```json
{
  "success": true,
  "error": "",
  "injection_id": 42,
  "flight_plan_id": 17,
  "gufi_id": "GUFI-2026-0718-000123"
}
```

---

## 2. 관련 구현

| 파일 | 역할 |
|---|---|
| `apps/abfap_api/views.py: FlightPlanInboundView` | 요청 파싱, 검증, `FlightPlan`/`FlightPlanInjection` 생성, relay 트리거 |
| `apps/abfap_api/decorators.py: abfap_ip_required` | IP Allowlist |
| `apps/fpl/models.py: FlightPlan / FlightPlanInjection` | FPL 원본 + relay 이력 저장 |
| `apps/simulation/absim_protocol.py: build_fpl_packet` | `FPL_Data` 바이너리 패킷 인코딩 |
| `apps/simulation/udp_client.py: send_fpl` | 대상 Model의 FPL Recv 포트(`127.0.0.1:50XX`)로 UDP 송신 |
| `docs/ABSim-Dashboard_UDP_Interface.md` §3 | `FPL_Data` wire 포맷 원본 스펙 |

기존 `apps/fpl/api_client.py`(Dashboard→ABFAP GET 스텁, "ABFAP가 만든 FPL을 Dashboard가 조회"
방향)는 이번 Push 방식 확정 이후 사용되지 않는다. 폐기 여부는 별도 정리 필요.

---

## 3. 공통 사항

| 항목 | 내용 |
|---|---|
| 인증 | IP Allowlist (`settings.ABFAP_ALLOWED_IPS`) |
| CSRF | 예외 처리됨 (`csrf_exempt`) — 서버 간 호출이므로 |
| 멱등성 | 없음. 동일 `gufi_id` 재전송 시 `FlightPlan`/`FlightPlanInjection`이 매번 새로 생성됨 |
| 좌표계/단위 | `lat`/`lon`: WGS84 degree · `alt`: feet · `velocity`: knot (`docs/ABSim-Dashboard_UDP_Interface.md` 참고) |

---

## 4. 판단 필요 항목

| # | 항목 | 상태 | 내용 |
|---|---|---|---|
| 1 | waypoints에 출발/도착 포함 여부 | **확정 (2026-07-18)** | 미포함 — 경유점만. `apps/simulation/absim_protocol.py: build_fpl_packet` 함수 docstring("waypoints는 dep/arr 포함 전체 항로점 리스트")은 실사용(`debug_fpl`, 본 스키마)과 어긋나므로 **코드 주석 수정 필요**(별도 작업) |
| 2 | `eobt` 필수 검증 | **확정 · 구현 완료 (2026-07-18)** | `FlightPlanInboundView`에 누락/형식오류 시 400 사전 검증 추가 (`apps/abfap_api/views.py`) |
| 3 | `departure`/`arrival`/`waypoints[]`의 `alt` 필수 검증 | **확정 · 구현 완료 (2026-07-18)** | 누락 시 400 사전 검증 추가 — 이전에는 relay 단계 KeyError → 502로만 노출되던 것을 개선 |
| 4 | 멱등성 (재전송 시 중복 방지) | **미확정** | 동일 `gufi_id` 재전송 시 기존 레코드를 갱신할지, 현재처럼 새로 쌓을지 |
| 5 | `waypoints[].utc` 형식/용도 | **미확정** | `departure`/`arrival`의 `utc`는 MFC가 실제로 파싱하지만(형식 불일치 시 거부), `WayPoint[].UTC`가 MFC에서 실제로 쓰이는지는 `docs/ABSIM_Interface_Doc.md` 확인 필요 |

구현 상세/수정은 위 §2 파일 참고. ABSim(MFC) 측 필드 사용 여부는 `docs/ABSIM_Interface_Doc.md` 참고.
