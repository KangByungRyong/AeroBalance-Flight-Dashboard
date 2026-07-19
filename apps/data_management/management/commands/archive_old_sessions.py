from django.core.management.base import BaseCommand

from apps.data_management.archive import archive_expired_sessions


class Command(BaseCommand):
    help = "SESSION_RETENTION_DAYS보다 오래 전에 종료된 세션을 아카이브(gzip JSON 내보내기 후 DB에서 삭제)한다."

    def handle(self, *args, **options) -> None:
        count = archive_expired_sessions()
        self.stdout.write(self.style.SUCCESS(f"{count}건 아카이브 완료"))
