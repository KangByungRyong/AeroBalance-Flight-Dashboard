# ABSim-Dashboard → ABFAP 전달 인터페이스 설계안 (초안)

> 대상: ABFAP(WS#1, 10.0.0.100) 연동팀
> 범위: ABSim-Dashboard(WS#3, 10.0.0.120)가 **ABFAP로 전달(export)하는** 두 가지 데이터 —
> 항적(Track), Simulation 상태(Model Status). FPL(ABFAP → Dashboard 방향)은 본 문서
> 범위 밖이며 별도 설계 대상(전체 설계안 본문 참고).
> 상태: **초안 — 확정 전.** §4 판단 필요 항목 확인 후 debug 확정.
> 작성일: 2026-07-17

---

## 0. 전제

- Dashboard와 ABSim.exe는 WS#3 동일 PC (`CLAUDE.md` §2), ABFAP는 WS#1 별도 PC — 이 문서가 다루는
  구간은 **네트워크 너머(WS#3 → WS#1) REST 통신**이다.
- 데이터 원천은 `apps/simulation/status_listener.py`의 Model별 인메모리 캐시(`AC_Return` 파싱 결과,
  ~50Hz 갱신)다. 별도 DB 적재 없이 조회 시점 최신 스냅샷을 그대로 내려준다(§4-3 이력 필요 여부는
  판단 대기).
- Model(RegNumber, 예 `AB0010`)당 항상 기체 1대 1:1 대응 — `SimulationModel`(`apps/settings_app/models.py`) 기준.

---

## 1. 항적(Track) 전달

### 1-1. 엔드포인트 (안)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/abfap/tracks/` | RUN 중인 전체 Model의 최신 항적 스냅샷 배열 |

### 1-2. callsign 포함 방법

`AC_Return`(ABSim → Dashboard 텔레메트리)에는 `GufiID`만 있고 `CallSign`이 없다. 반대로
`FPL_Data`(Dashboard → ABSim)는 `GufiID`+`CallSign`+`RegNumber`를 함께 보낸다(§`docs/ABSim-Dashboard_UDP_Interface.md` §3.2).
따라서 **Dashboard가 FPL을 ABSim에 전달하는 시점에 `GufiID ↔ CallSign ↔ Model` 매핑을 별도
테이블에 기록**해두고, 항적 조회 시 `AC_Return.gufi_id`로 그 매핑을 조인해서 `callsign`을 채워
넣는다. (**확정**, 2026-07-17)

- ABFAP가 FPL을 Dashboard로 전송할 때 상태(§2) 조회 결과를 바탕으로 대상 Model을 직접 지정하고,
  `GufiID`도 ABFAP가 발급해서 함께 전달한다 — Dashboard는 배정/발급 로직 없이 받은 값을 그대로
  ABSim에 relay한다.
- 이 relay 시 기록되는 이력은 `apps/debug_fpl/models.py`의 `DebugFlightPlanInjection`(FPL 전송 시
  `gufi_id` + `callsign` + `target_model_name` 기록)과 **동일한 역할**을 하는 운영용 Injection
  기능으로 별도 구현 예정(가칭 `FlightPlanInjection`) — Debug 경로는 테스트 전용으로 그대로 유지.

### 1-3. 응답 필드 (안)

| 필드 | 타입 | 원천 | 비고 |
|---|---|---|---|
| `model` | string | `SimulationModel.name` | 예: `AB0010` |
| `callsign` | string \| null | FPL 전달 시 기록된 매핑 | 매핑 없으면 `null` |
| `gufi_id` | string | `AC_Return.GufiID` | |
| `lat` / `lon` / `alt` | double | `AC_Return.Latitude/Longitude/Altitude` | alt 단위 feet |
| `hdg` / `pitch` / `roll` | float | `AC_Return.psi/theta/phi` | degree |
| `spd` | float | `AC_Return.GroundSpeed` | knot |
| `tas` / `cas` | float | `AC_Return.TAS/CAS` | knot |
| `uam_status` | string | `AC_Return.UAMStatus` | |
| `udp_connected` | bool | `status_listener` stale 판정 | 3초 무응답 시 false |
| `updated_at` | string(ISO8601 UTC) | `status_listener` 마지막 수신 시각 | 신선도 판단용, 현재 내부에서만 쓰이고 외부 미노출 → 신규 노출 |

### 1-4. 샘플 응답

```json
{
  "tracks": [
    {
      "model": "AB0010",
      "callsign": "ABX01",
      "gufi_id": "GUFI-...",
      "lat": 37.123, "lon": 127.456, "alt": 3500.0,
      "hdg": 270.0, "pitch": 1.2, "roll": -0.5,
      "spd": 145.0, "tas": 150.0, "cas": 148.0,
      "uam_status": "CRUISE",
      "udp_connected": true,
      "updated_at": "2026-07-17T05:12:03.412Z"
    }
  ]
}
```

---

## 2. Simulation 상태(Model Status) 전달

### 2-1. 엔드포인트 (안)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/abfap/model-status/` | 전체 Model의 프로세스/UDP 통신 상태 배열 |

내부용 `/simulation/status/`(`apps/simulation/views.py: StatusListView`)와 조회 로직은 동일하나,
ABFAP 전용 별도 엔드포인트로 분리할지 그대로 재사용할지는 §4-4 판단 필요.

### 2-2. 응답 필드 (안)

| 필드 | 타입 | 원천 | 비고 |
|---|---|---|---|
| `model` | string | `SimulationModel.name` | |
| `callsign` | string \| null | §1-2 매핑 | 상태에도 동일 매핑 적용 시 |
| `process_running` | bool | `process_manager.is_running_bulk()` | ABSim.exe 프로세스 실행 여부 |
| `udp_connected` | bool | `status_listener.get_status()` | AC_Return 수신 정상 여부 |
| `uam_status` | string \| null | `status_listener.get_status()` | |
| `updated_at` | string(ISO8601 UTC) | 위와 동일 | |

### 2-3. 샘플 응답

```json
{
  "models": [
    {
      "model": "AB0010",
      "callsign": "ABX01",
      "process_running": true,
      "udp_connected": true,
      "uam_status": "CRUISE",
      "updated_at": "2026-07-17T05:12:03.412Z"
    }
  ]
}
```

---

## 3. 공통 사항 (안)

| 항목 | 안 |
|---|---|
| 통신 방향 | ABFAP가 Dashboard에 GET 요청(Pull) — Dashboard가 서버, ABFAP가 클라이언트 (**확정**) |
| 인증 | IP Allowlist (**확정**, 2026-07-17) — 허용 IP(WS#1, 10.0.0.100) 외 요청은 차단 |
| Content-Type | `application/json` |
| 에러 응답 | Django 표준 `JsonResponse({'error': ...}, status=4xx/5xx)` — 기존 `simulation/views.py` 패턴과 동일 |

---

## 4. 판단 필요 항목

| # | 항목 | 상태 | 내용 |
|---|------|------|------|
| 1 | **Pull vs Push (항적/상태)** | **확정** | Pull(ABFAP GET) |
| 1' | **Pull vs Push (FPL)** | **확정** | Push(ABFAP POST → Dashboard, `/api/abfap/fpl/`). 기존 `apps/fpl/api_client.py`(Dashboard→ABFAP GET 스텁)는 이번 구현에서 사용하지 않음(폐기 여부는 별도 정리 필요) |
| 2 | **GufiID↔CallSign 매핑** | **확정 · 구현 완료** | ABFAP가 GufiID 발급 + 대상 Model 지정 후 FPL과 함께 전달. `apps/fpl/models.py: FlightPlanInjection`에 relay 이력 기록, `apps/abfap_api/views.py: _callsigns_for()`가 gufi_id로 역조회 |
| 3 | **이력 vs 스냅샷** | **확정 · 구현 완료** | Snapshot만 제공 (`apps/simulation/status_snapshot.py`) |
| 4 | **Model Status 엔드포인트 분리 여부** | **확정 · 구현 완료** | `/api/abfap/model-status/` 신설(내부 `/simulation/status/`와 분리), 조회 로직은 `status_snapshot.build_snapshot()`으로 공유 |
| 5 | **인증/보안** | **확정 · 구현 완료** | IP Allowlist (`settings.ABFAP_ALLOWED_IPS`, `apps/abfap_api/decorators.py`) |
| 6 | **정지/미연결 Model 노출 방식** | **확정 · 구현 완료** | 전체 Model 포함 + 플래그(`process_running`/`udp_connected`) |
| 7 | **session_key 포함 여부** | **확정** | 제외 |

구현 상세는 `apps/abfap_api/`(views.py, decorators.py, urls.py), `apps/simulation/status_snapshot.py`,
`apps/fpl/models.py: FlightPlanInjection` 참고. ABSim(MFC) 측 확인 필요 항목은
`docs/ABSIM_Interface_Doc.md` 참고.
