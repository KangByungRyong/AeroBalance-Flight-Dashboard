"""DB 사용 용량 모니터링 (`CLAUDE.md` §10) — `DB_CAPACITY_LIMIT_GB` 기준.

MariaDB의 `information_schema.tables`에서 테이블별 데이터+인덱스 바이트를
합산한다 — 파일시스템 접근 없이 SQL만으로 확인 가능해 배포 환경(Windows 로컬
단독 실행)에서도 별도 OS 권한 없이 동작한다.
"""
from django.db import connection


def get_db_usage() -> dict:
    from django.conf import settings

    limit_gb = getattr(settings, "DB_CAPACITY_LIMIT_GB", 500.0)

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT table_name, data_length + index_length AS total_bytes
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
            ORDER BY total_bytes DESC
            """
        )
        rows = cursor.fetchall()

    total_bytes = sum(r[1] or 0 for r in rows)
    gib = 1024**3
    limit_bytes = limit_gb * gib
    percent = (total_bytes / limit_bytes * 100) if limit_bytes else 0.0

    top_tables = [
        {"name": name, "bytes": size or 0, "gb": round((size or 0) / gib, 3)}
        for name, size in rows[:8]
        if size
    ]

    return {
        "total_bytes": total_bytes,
        "total_gb": round(total_bytes / gib, 2),
        "limit_gb": limit_gb,
        "percent": round(percent, 1),
        "tables": top_tables,
    }
