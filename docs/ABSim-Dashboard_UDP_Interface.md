# ABSim-Dashboard ↔ SKTSim(AB_Sim.exe) UDP 연동 명세

대상: ABSim-Dashboard(Django) 개발팀
소스 기준: `AB_Sim/AB_SimDlg.cpp`, `AB_Sim/UDP/Communication_Packet.h`, `AB_Sim/Ini_Files/SystemConf.ini`

## 1. 개요

SKTSim과 Dashboard(원문 코드 주석상 "Operation Console") 사이는 UDP 소켓 2개로 연동됩니다.

| 방향 | 용도 | 패킷 구조체 |
|---|---|---|
| Dashboard → SKTSim | 비행계획(FPL) 전달 | `FPL_Data` |
| SKTSim → Dashboard | 기체 상태(AC Status) 브로드캐스트 | `AC_Return` |

공통 인코딩 규칙:
- `#pragma pack(1)` — **구조체 패딩 없음**, 필드가 정의 순서대로 바로 이어붙습니다.
- Little-Endian (Windows x86/x64 네이티브).
- 문자열 필드는 고정폭 `char[N]`이며, 값 설정 시 `memset(0)` 후 `memcpy`하는 방식이라 null 종료 + 남는 바이트는 `0x00`으로 채워집니다.
- `BOOL`은 C의 `bool`(1바이트)이 아니라 **Win32 `BOOL`, 즉 4바이트 `int`**입니다. Python `struct`에서는 `i`로 매핑하세요.

## 2. 연결 정보 (`Ini_Files/SystemConf.ini`)

```
//UDP Setting
RegNumber, HLV001
Release Time Offset, 15
My IP Address, 127.0.0.1
FPL Recv, 127.0.0.1, 5001
AC Status Send, 127.0.0.1,7001
Debug IG Data, 127.0.0.1, 7005
Target AC Status Send, 127.0.0.1,6001
Target Debug IG, 10.0.0.110, 49000
```

| 소켓 | 방향 | 로컬(SKTSim) | 대상(Dashboard) | 비고 |
|---|---|---|---|---|
| FPL Recv | Dashboard → SKTSim | `127.0.0.1 : 50` + RegNumber 뒤 2자리 | - | **포트는 ini 값이 아니라 런타임에 재계산됩니다.** RegNumber가 `HLV001`이면 뒤 2자리 `01` → 포트 `5001`. RegNumber가 바뀌면 포트도 바뀌니 Dashboard 쪽에서 RegNumber → 포트 규칙을 동일하게 구현해야 합니다. |
| AC Status Send | SKTSim → Dashboard | `127.0.0.1:7001` | `127.0.0.1 :` (FPL Recv 포트 + 1000) | 대상 포트도 ini의 `Target AC Status Send` 값을 쓰지 않고 코드에서 `FPL Recv 포트 + 1000`으로 재계산합니다(`HLV001` 기준 `6001`). `Connect()`된 소켓에서 전송됩니다. |

> RegNumber가 바뀌는 배포 환경(기체별 exe)이라면, Dashboard는 고정 포트를 하드코딩하지 말고 RegNumber → 포트 변환 규칙(`5000 + 뒤 2자리`, `6000 + 뒤 2자리`)을 그대로 따라야 합니다.

## 3. Packet: `FPL_Data` (Dashboard → SKTSim, FPL Recv 소켓)

**가변 길이 패킷입니다.** `WayPoint[100]`을 항상 100개 꽉 채워 보내지 않고, **실제 `Waypoint_TotCount`개만큼만** 붙여서 보냅니다. `FIX_Property`(87B)를 3군데(출발/도착/웨이포인트 N개)에서 재사용합니다.

와이어 상 구성 순서:

1. **고정 헤더 (293 bytes)**: `GufiID` ~ `ArrivalVP`까지. 여기 포함된 `Waypoint_TotCount`로 이어지는 웨이포인트 개수를 판단합니다.
2. **가변 구간**: `FIX_Property × Waypoint_TotCount` (`Waypoint_TotCount × 87` bytes) — **딱 그 개수만큼만**, 100개 꽉 채우지 않습니다.
3. **고정 트레일러 (80 bytes)**: `MVT_Offset`(56B) + `Wind_Azimuth`/`Wind_HVelocity`/`Wind_VVelocity`(각 8B) — 가변 구간 바로 뒤에 이어집니다.

**전체 패킷 크기 = 293 + (Waypoint_TotCount × 87) + 80 = 373 + Waypoint_TotCount × 87 bytes**
(예: 웨이포인트 0개 → 373B, 5개 → 808B, 100개(최대) → 9073B — 기존과 동일)

> 이전 버전(항상 9073B 고정 전송) 대비 절대 하위호환이 아닙니다. 웨이포인트가 적을 때 IP 단편화도 사실상 사라집니다(대부분 MTU 이내).

### 3.1 `FIX_Property` (87 bytes, 하위 구조체)

| Offset | Size | 필드 | 타입 | 단위/비고 |
|---|---|---|---|---|
| 0 | 30 | `Name` | char[30] | 미사용(웨이포인트 배열에선 SKTSim이 읽지 않음) |
| 30 | 8 | `Latitude` | double | degree |
| 38 | 8 | `Longitude` | double | degree |
| 46 | 8 | `Altitude` | double | **feet.** `DepertureVP`/`ArrivalVP`/`WayPoint[]` 전부 동일하게 피트로 통일 |
| 54 | 8 | `Velocity` | double | **knot.** SKTSim이 내부에서 m/s로 변환해서 사용(`AB_SimDlg.cpp:1524`, `/ ms2knot`) |
| 62 | 25 | `UTC` | char[25] | `YYYY-MM-DDTHH:MM:SSZ`, 웨이포인트 배열에선 미사용 |

### 3.2 `FPL_Data` 필드 (오프셋은 헤더/트레일러 기준, 가변 구간은 N=`Waypoint_TotCount`)

| Offset | Size | 필드 | 타입 |
|---|---|---|---|
| 0 | 50 | `GufiID` | char[50] |
| 50 | 25 | `UTC` | char[25] |
| 75 | 4 | `Waypoint_TotCount` | int |
| 79 | 20 | `CallSign` | char[20] |
| 99 | 20 | `RegNumber` | char[20] |
| 119 | 87 | `DepertureVP` | FIX_Property |
| 206 | 87 | `ArrivalVP` | FIX_Property |
| **293** | **N × 87** | `WayPoint[N]` | FIX_Property × N (**고정 100 아님**) |
| 293 + N×87 | 56 | `MVT_Offset` | MVT_Time (int × 14, §5 참고 — 현재 미사용) |
| 349 + N×87 | 8 | `Wind_Azimuth` | double |
| 357 + N×87 | 8 | `Wind_HVelocity` | double |
| 365 + N×87 | 8 | `Wind_VVelocity` | double |

**주의**: `WayPoint`는 N개만 보내고, 그 뒤에 바로 `MVT_Offset`/`Wind_*` 트레일러가 옵니다(100개 슬롯 자리를 비워두지 않습니다). N=0이면 `WayPoint` 구간 자체가 없고 헤더 바로 뒤에 트레일러가 옵니다.

### 3.3 Python `struct` 참고 포맷 (little-endian, 가변 길이 — N=웨이포인트 수)

```python
import struct

FIX_PROPERTY_FMT = "30s4d25s"           # 87 bytes
HEADER_FMT = "<50s25si20s20s" + "30s4d25s" * 2   # GufiID..ArrivalVP, 293 bytes
TRAILER_FMT = "<14i3d"                            # MVT_Offset + Wind_*, 80 bytes

def build_fpl_packet(header_values, waypoints, trailer_values):
    n = len(waypoints)
    body = struct.pack(HEADER_FMT, *header_values)  # header_values[2]는 반드시 n과 일치해야 함
    for wp in waypoints:
        body += struct.pack("<" + FIX_PROPERTY_FMT, *wp)
    body += struct.pack(TRAILER_FMT, *trailer_values)
    return body

def parse_fpl_packet(data: bytes):
    header = struct.unpack(HEADER_FMT, data[:293])
    n = header[2]  # Waypoint_TotCount
    waypoints = [
        struct.unpack("<" + FIX_PROPERTY_FMT, data[293 + i*87 : 293 + (i+1)*87])
        for i in range(n)
    ]
    trailer_offset = 293 + n * 87
    trailer = struct.unpack(TRAILER_FMT, data[trailer_offset:trailer_offset + 80])
    return header, waypoints, trailer

assert struct.calcsize(HEADER_FMT) == 293
assert struct.calcsize(TRAILER_FMT) == 80
```

## 4. Packet: `AC_Return` (SKTSim → Dashboard, AC Status Send 소켓, 매 tick 전송)

총 크기 **312 bytes**. 전송 주기는 시뮬레이션 타이머 tick(`m_iTimeStep = 20ms`, 약 **50Hz**)마다입니다. Dashboard 수신 루프가 이 속도를 감당할 수 있어야 합니다.

| Offset | Size | 필드 | 타입 | 내용 |
|---|---|---|---|---|
| 0 | 4 | `Connection` | BOOL | 매 tick `TRUE` 고정(하트비트 용도) |
| 4 | 50 | `GufiID` | char[50] | 수신한 FPL의 GufiID, FPL 없으면 전부 0 |
| 54 | 4 | `OnSKD` | BOOL | FPL 유효 여부 |
| 58 | 56 | `MVT_Offset` | MVT_Time (int×14) | **현재 미사용, 항상 무의미한 값** (§5 참고) |
| 114 | 50 | `Departure_ATime` | char[50] | 출발 상태 진입 시 UTC 문자열 |
| 164 | 50 | `Arrival_ATime` | char[50] | 도착 시 UTC 문자열 |
| 214 | 50 | `UAMStatus` | char[50] | 상태 문자열 (예: `"AutoFlight - Departure"`) |
| 264 | 4 | `TAS` | float | True Air Speed, **단위: knot** |
| 268 | 4 | `CAS` | float | 계기속도, **단위: knot** |
| 272 | 4 | `GroundSpeed` | float | 지상속도, **단위: knot** |
| 276 | 4 | `phi` | float | Roll, deg |
| 280 | 4 | `theta` | float | Pitch, deg |
| 284 | 4 | `psi` | float | Heading, deg |
| 288 | 8 | `Longitude` | double | degree |
| 296 | 8 | `Latitude` | double | degree |
| 304 | 8 | `Altitude` | double | **feet** |

> `MVT_Message` 필드는 사용하지 않아 삭제되었습니다(구버전 문서와 offset이 다를 수 있으니 주의).

### 4.1 Python `struct` 참고 포맷

```python
AC_RETURN_FMT = "<i50si14i50s50s50sffffffddd"
assert struct.calcsize(AC_RETURN_FMT) == 312
```

## 5. 알려진 이슈 / TODO (Dashboard 설계 시 참고)

1. **`MVT_Offset` 필드(양쪽 패킷 모두, 56 bytes)는 SKTSim 쪽에서 값을 채우지 않는 죽은 필드**입니다. MVT(Movement) 연동은 추후 별도 작업 예정이며, 그 전까지는 이 필드를 신뢰하지 마세요.
2. **`FPL_Data`는 가변 길이(373 ~ 9073 bytes)**입니다. 웨이포인트 수가 많으면(약 13개, ~1500B 이상) 여전히 UDP 안전 MTU(~1472B)를 넘어 IP 단편화될 수 있으니, 손실 네트워크 환경이라면 유의하세요. Dashboard의 recv buffer는 최대치(9073B) 기준으로 여유 있게(예: 9100 bytes) 잡아두는 게 안전합니다.
3. **포트 하드코딩 금지**: FPL Recv/AC Status 포트는 RegNumber에서 파생되므로, 여러 기체를 동시에 다루는 Dashboard라면 기체별 RegNumber → 포트 매핑을 관리해야 합니다.
4. `AC Status Send`는 연결 여부와 무관하게 SKTSim이 계속 broadcast하듯 전송합니다(`sendto` 대상 고정, ACK 없음). Dashboard가 잠깐 꺼져 있어도 SKTSim은 에러 없이 계속 보냅니다.
5. **속도 단위는 양방향 모두 knot로 통일했습니다.** `FPL_Data.WayPoint[].Velocity`(Dashboard→SKTSim), `AC_Return.TAS/CAS/GroundSpeed`(SKTSim→Dashboard) 전부 knot 기준이며, SKTSim이 내부 m/s 모델값과 상호 변환(`× ms2knot` / `/ ms2knot`, `AB_SimDlg.cpp:1524, 1930-1932`)합니다. Dashboard는 별도 단위 변환 없이 knot 값을 그대로 쓰면 됩니다.
6. **고도 단위는 전 구간 feet로 통일했습니다.** `DepertureVP`/`ArrivalVP`/`WayPoint[]`(`FPL_Data`), `Altitude`(`AC_Return`) 전부 feet 기준이며, SKTSim이 내부 meter 모델값과 상호 변환합니다(`AB_SimDlg.cpp:197-198, 1523, 1603, 1938, 2263-2264`, `× meter2ft` / `/ meter2ft`).
7. **상승율/하강율(Rate of Climb/Descent, ft/min)은 현재 어느 패킷에도 필드가 없습니다.** 우선 보류하기로 했습니다 — 추후 필요해지면 `AC_Return`에 새 필드를 추가하고(내부적으로 `NED_Velocity.r3c1`(m/s, 하강 방향 +)이 대응) Dashboard 파서도 같이 갱신해야 합니다.
8. **`FPL_Data`는 v2부터 가변 길이 프로토콜입니다.** `WayPoint[100]`을 고정 전송하던 이전 방식과 호환되지 않으니, Dashboard는 반드시 §3의 가변 길이 포맷(헤더 293B + N×87B + 트레일러 80B)으로 패킷을 만들어야 합니다.
