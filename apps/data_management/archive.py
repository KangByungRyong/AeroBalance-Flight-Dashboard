"""세션 데이터 내보내기/가져오기 + 보존 기간 정책 (`CLAUDE.md` §10).

1시간 비행이 `FlightData`(50Hz, 원본 `params` 포함) 기준 ~700MB에 달할 수 있어
(§1 "UDP 정보 전체 저장" 원칙과 맞물림) DB 용량이 빠르게 늘어난다. `FlightSession`
메타데이터(Pilot/FPL/Callsign/시간)는 가벼우니 DB에 남기고, 부피가 큰
`FlightData`/`AbsimTrackLog`만 gzip JSON 파일로 내보낸 뒤 DB에서 삭제한다.

- `archive_session()` / `export_sessions()` — 세션을 내보내고 삭제 (데이터 관리
  페이지 상단 "내보내기" 버튼 — 체크박스로 여러 개 선택 가능 — +
  `archive_expired_sessions()` 자동 스윕이 공통으로 사용)
- `import_from_archive_data()` — 사용자가 파일 열기 다이얼로그로 고른 아카이브
  파일(들)을 DB로 복원한다. `FlightSession` 레코드가 아직 남아있고 아카이브
  상태면 그 레코드에 복원(중복 방지), 레코드가 없으면(삭제됐거나 다른 백업에서
  가져온 파일) 새 세션으로 복원한다 — 어느 쪽이든 같은 "가져오기" 동작 하나로
  처리된다.
"""
import gzip
import json
import logging
from datetime import timedelta
from pathlib import Path

from django.utils import timezone
from django.utils.dateparse import parse_datetime

logger = logging.getLogger(__name__)


def _session_track_time_range(session) -> tuple[float, float]:
    start_ts = session.start_time.timestamp()
    end_ts = (session.end_time or timezone.now()).timestamp()
    return start_ts, end_ts


def _serialize_session(session) -> dict:
    flight_data = list(
        session.flight_data.order_by("timestamp").values(
            "timestamp", "lat", "lon", "alt_ft", "ias_kt", "tas_kt", "gs_kt",
            "heading", "pitch", "roll", "params",
        )
    )

    from .models import AbsimTrackLog

    start_ts, end_ts = _session_track_time_range(session)
    absim_tracks = list(
        AbsimTrackLog.objects.filter(polled_at__gte=start_ts, polled_at__lte=end_ts)
        .order_by("polled_at")
        .values(
            "polled_at", "model_name", "callsign", "gufi_id", "lat", "lon", "alt",
            "hdg", "pitch", "roll", "spd", "tas", "cas", "uam_status", "udp_connected",
        )
    )

    return {
        "session": {
            "id": session.id,
            "callsign": session.callsign,
            "pilot": {
                "name": session.pilot.name,
                "organization": session.pilot.organization,
                "license_no": session.pilot.license_no,
            },
            "flight_plan_snapshot": session.flight_plan_snapshot,
            "start_time": session.start_time.isoformat(),
            "end_time": session.end_time.isoformat() if session.end_time else None,
            "end_reason": session.end_reason,
            "notes": session.notes,
        },
        "flight_data": flight_data,
        "absim_tracks": absim_tracks,
    }


def _archive_filename(session) -> str:
    raw = f"session_{session.id}_{session.callsign}_{session.start_time:%Y%m%d}.json.gz"
    return "".join(c for c in raw if c.isalnum() or c in "._-")


def archive_session(session, archive_dir: Path) -> Path:
    """세션의 FlightData/AbsimTrackLog를 gzip JSON으로 내보내고 DB에서 삭제한다.
    이미 종료된 세션에만 적용 — 진행 중인 세션은 호출측에서 걸러야 한다."""
    archive_dir = Path(archive_dir)
    archive_dir.mkdir(parents=True, exist_ok=True)

    data = _serialize_session(session)
    path = archive_dir / _archive_filename(session)
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(data, f, default=str)

    from .models import AbsimTrackLog

    start_ts, end_ts = _session_track_time_range(session)
    deleted_fd, _ = session.flight_data.all().delete()
    deleted_tracks, _ = AbsimTrackLog.objects.filter(
        polled_at__gte=start_ts, polled_at__lte=end_ts
    ).delete()

    session.archived_at = timezone.now()
    session.archive_path = str(path)
    session.save(update_fields=["archived_at", "archive_path"])

    logger.info(
        "세션 %s 아카이브 완료 → %s (FlightData %d건, AbsimTrackLog %d건 삭제)",
        session.id, path, deleted_fd, deleted_tracks,
    )
    return path


def export_sessions(session_ids: list[int], archive_dir: Path) -> list[dict]:
    """여러 세션을 한 번에 내보낸다 (데이터 관리 페이지 체크박스 다중 선택).
    진행 중이거나 이미 내보낸 세션은 건너뛰고 이유를 결과에 남긴다."""
    from .models import FlightSession

    sessions_by_id = {s.pk: s for s in FlightSession.objects.filter(pk__in=session_ids)}

    results = []
    for sid in session_ids:
        session = sessions_by_id.get(sid)
        if session is None:
            results.append({"id": sid, "status": "error", "message": "세션을 찾을 수 없습니다."})
            continue
        if session.is_active:
            results.append({"id": sid, "status": "skip", "message": "진행 중인 세션은 내보낼 수 없습니다."})
            continue
        if session.is_archived:
            results.append({"id": sid, "status": "skip", "message": "이미 내보낸 세션입니다."})
            continue
        try:
            path = archive_session(session, archive_dir)
            results.append({"id": sid, "status": "ok", "archive_path": str(path)})
        except Exception as exc:
            logger.exception("세션 %s 내보내기 실패", sid)
            results.append({"id": sid, "status": "error", "message": str(exc)})
    return results


def parse_archive_bytes(raw: bytes) -> dict:
    """업로드된 `.json.gz` 파일의 바이트를 파싱한다."""
    text = gzip.decompress(raw).decode("utf-8")
    return json.loads(text)


def _find_or_create_pilot(pilot_data):
    from .models import Pilot

    if isinstance(pilot_data, str):
        pilot_data = {"name": pilot_data}
    elif not isinstance(pilot_data, dict):
        pilot_data = {}

    name = (pilot_data.get("name") or "Unknown").strip() or "Unknown"
    pilot = Pilot.objects.filter(name=name).first()
    if pilot is None:
        pilot = Pilot.objects.create(
            name=name,
            organization=pilot_data.get("organization") or "",
            license_no=pilot_data.get("license_no") or "",
        )
    return pilot


def import_from_archive_data(data: dict) -> dict:
    """아카이브 JSON에서 세션을 복원한다.

    원본 `FlightSession`(archive 시 남겨둔 메타 레코드)이 아직 있고 아카이브
    상태면 그 레코드에 복원(중복 방지). 레코드가 없으면(삭제됐거나 다른
    백업에서 가져온 파일) 메타데이터로 새 세션을 만들어 복원한다.
    반환: {session, flight_data, absim_tracks, reused}
    """
    from .models import AbsimTrackLog, FlightData, FlightSession

    meta = data.get("session") or {}
    original_id = meta.get("id")

    session = None
    if original_id:
        session = FlightSession.objects.filter(pk=original_id, archived_at__isnull=False).first()

    reused = session is not None

    if session is None:
        pilot = _find_or_create_pilot(meta.get("pilot"))
        session = FlightSession.objects.create(
            pilot=pilot,
            flight_plan=None,  # 원본 FlightPlan 레코드와의 FK는 복원하지 않음(스냅샷만 유지)
            flight_plan_snapshot=meta.get("flight_plan_snapshot"),
            callsign=meta.get("callsign", ""),
            end_time=parse_datetime(meta["end_time"]) if meta.get("end_time") else None,
            end_reason=meta.get("end_reason", ""),
            notes=meta.get("notes", ""),
        )
        # start_time은 auto_now_add라 생성 시점으로 채워짐 — 원본 시각으로 덮어쓴다.
        start_dt = parse_datetime(meta["start_time"]) if meta.get("start_time") else None
        if start_dt:
            FlightSession.objects.filter(pk=session.pk).update(start_time=start_dt)
            session.start_time = start_dt
    else:
        session.archived_at = None
        session.save(update_fields=["archived_at"])

    flight_data_rows = [FlightData(session=session, **row) for row in data.get("flight_data", [])]
    absim_rows = [AbsimTrackLog(**row) for row in data.get("absim_tracks", [])]
    if flight_data_rows:
        FlightData.objects.bulk_create(flight_data_rows)
    if absim_rows:
        AbsimTrackLog.objects.bulk_create(absim_rows)

    logger.info(
        "세션 %s %s ← 업로드 파일 (FlightData %d건, AbsimTrackLog %d건)",
        session.id, "복원" if reused else "신규 생성", len(flight_data_rows), len(absim_rows),
    )
    return {
        "session": session,
        "flight_data": len(flight_data_rows),
        "absim_tracks": len(absim_rows),
        "reused": reused,
    }


def archive_expired_sessions() -> int:
    """`SESSION_RETENTION_DAYS`보다 오래 전에 종료된 세션을 아카이브한다.
    반환: 처리된 세션 수."""
    from django.conf import settings

    from .models import FlightSession

    retention_days = getattr(settings, "SESSION_RETENTION_DAYS", 30)
    archive_dir = getattr(settings, "SESSION_ARCHIVE_DIR")
    cutoff = timezone.now() - timedelta(days=retention_days)

    targets = FlightSession.objects.filter(
        end_time__isnull=False, end_time__lt=cutoff, archived_at__isnull=True
    )

    count = 0
    for session in targets:
        try:
            archive_session(session, archive_dir)
            count += 1
        except Exception:
            logger.exception("세션 %s 자동 아카이브 실패", session.id)
    return count
