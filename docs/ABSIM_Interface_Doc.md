# ABFAP 연동 기능 구현에 따른 ABSim(MFC) 영향 검토

> 목적: `apps/abfap_api`(ABFAP ↔ ABSim-Dashboard REST 연동, 2026-07-17 구현) 작업 중
> ABSim(MFC C++, `AB_Sim.exe`) 측 코드/설정 변경이 필요한지 검토한 결과.
> 참고: `docs/ABSim-Dashboard_UDP_Interface.md`(기존 UDP 와이어 명세),
> `docs/ABFAP_Export_Interface.md`(ABFAP 대상 REST 설계).
> 작성일: 2026-07-17

---

## 결론

**이번 구현 범위(항적/Simulation 상태 export, FPL inbound relay)만으로는 ABSim(MFC) 측
코드 변경이 필요하지 않다.** 세 기능 모두 기존에 확인된 `FPL_Data`/`AC_Return` 와이어
포맷(§`ABSim-Dashboard_UDP_Interface.md`)을 그대로 사용한다:

- 항적/Simulation 상태 export → `AC_Return`을 수신하는 기존 `status_listener` 캐시를
  그대로 읽어서 REST로 재포장. ABSim이 새로 보내야 하는 필드 없음.
- FPL inbound relay → ABFAP가 넘긴 GufiID/CallSign/좌표를 기존 `build_fpl_packet()`으로
  인코딩해 기존 FPL Recv 소켓(`127.0.0.1:50XX`)에 그대로 전송. 패킷 구조·필드 변경 없음.

다만 아래 항목은 **ABSim 쪽 코드 변경은 아니지만, 와이어 포맷의 기존 제약과 ABFAP의
실제 데이터 형식이 맞는지 ABSim/ABFAP 담당자와 반드시 확인**해야 한다. 확인 없이 그대로
운영하면 조용히 잘리거나(truncate) 매칭이 깨질 수 있는 지점들이다.

---

## 확인 필요 항목

### 1. GufiID 길이 제약 (char[50])

`FPL_Data.GufiID`는 고정 `char[50]`이다(`docs/ABSim-Dashboard_UDP_Interface.md` §3.2).
Dashboard의 `_str_bytes()`는 초과분을 **에러 없이 잘라서** 보낸다
(`apps/simulation/absim_protocol.py:25`). 이번 기능은 GufiID를 **ABFAP가 발급**하므로
(2026-07-17 결정), ABFAP의 실제 GUFI 포맷이 UTF-8 기준 50바이트를 넘지 않는지 확인이
필요하다. 넘을 경우 Dashboard가 relay한 GufiID와 ABSim이 `AC_Return`으로 돌려주는
GufiID가 서로 달라져, 항적 export의 callsign 매칭(`FlightPlanInjection.gufi_id` 조인,
`apps/abfap_api/views.py: _callsigns_for()`)이 깨진다.

### 2. CallSign 길이 제약 (char[20])

`FPL_Data.CallSign`도 `char[20]` 고정이다. ABFAP의 콜사인 포맷이 20자를 넘지 않는지
확인 필요 — 초과 시 마찬가지로 조용히 잘린다.

### 3. AC_Return의 GufiID 에코 동작 확인

Dashboard가 보낸 `FPL_Data.GufiID`를 ABSim이 내부적으로 그대로 저장했다가
`AC_Return.GufiID`로 **변형 없이 그대로 돌려주는지** 실제 동작 확인이 필요하다.
(`apps/simulation/absim_protocol.py`의 `parse_ac_return()`이 `AC_Return.GufiID`를
그대로 읽어오는 구조라, ABSim 쪽에서 이 값을 가공하면 조인이 깨진다.) 기존 Debug FPL
Injection 기능으로 이미 간접 검증되었을 가능성이 있으나(자체 발급 GufiID 기준), ABFAP가
발급하는 실제 포맷으로도 별도 확인 권장.

### 4. RegNumber 필드에 넣는 값 (기존 이슈, 이번 기능도 동일하게 사용)

`FPL_Data.RegNumber`에는 현재 `SimulationModel.name`(폴더명, 예: `AB0010`)을 그대로
넣고 있다(`apps/debug_fpl/views.py`와 이번 `apps/abfap_api/views.py` 모두 동일). 그런데
`SimulationModel.reg_tail_override`가 설정된 Model은 실제 ABSim 프로세스의 RegNumber와
폴더명이 다를 수 있음이 이미 확인된 바 있다(2026-07-16, 프로젝트 메모리
`reg_tail_override vs process image name`). 이번 기능이 새로 만든 문제는 아니지만,
운영 트래픽(ABFAP 발) FPL도 동일 로직을 타므로 함께 확인 필요 — `RegNumber` 필드에
폴더명 대신 `reg_tail`(정수, 뒤 2자리) 기준 문자열을 넣어야 하는지 ABSim 쪽 파싱 로직
확인 요청.

---

## 참고 — 이번 기능이 ABSim 쪽에 요구하지 않는 것

- `AC_Return`에 `CallSign` 필드 추가: **불필요.** callsign은 Dashboard가 FPL relay 시점에
  기록한 `FlightPlanInjection`(gufi_id 기준)에서 역으로 채운다.
- `AC_Return`에 session_key 등 추가 필드: **불필요.** 이번 설계에서 session_key는
  export 대상에서 제외하기로 확정(2026-07-17).
- UDP-A(10Hz, 기존 ABSim→ABFAP 직접 브로드캐스트, 49000) 관련 변경: **불필요.** 이번
  항적/상태 export는 Dashboard가 REST로 대체 제공하는 경로이며, ABSim의 기존 UDP-A
  송출 로직과는 무관.
