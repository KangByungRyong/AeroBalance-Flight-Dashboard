-- AbsimTrackLog: lat/lon/alt/hdg/pitch/roll/spd/tas/cas NOT NULL -> NULL 허용
-- 배경: Dashboard(GET /api/abfap/tracks/)가 텔레메트리를 아직 받지 못한 Model에
--       대해 해당 필드를 null로 응답할 수 있음(docs/ABFAP_Export_Interface.md
--       §1-3 스펙은 non-null double이나 실제 응답은 다름) — 종전에는 NOT NULL
--       제약으로 인해 bulk_create 배치 전체가 IntegrityError(1048)로 롤백되어
--       유실됨. FlightData와 동일하게 "값을 지어내지 않는다" 원칙 적용(CLAUDE.md §1).
-- 대응 커밋: apps/data_management/models.py(AbsimTrackLog), apps/absim_link/rest_client.py
-- Django 마이그레이션: apps/data_management/migrations/0004_alter_absimtracklog_alt_alter_absimtracklog_cas_and_more.py
--   (python manage.py migrate 로도 동일하게 반영됨 — 이 스크립트는 MASTER 병합 시
--    운영 DB에 수동 반영하기 위한 동등한 DDL)
-- 실행: mariadb xplane_monitor < 2026-08-28_alter_absim_track_log_nullable.sql

USE xplane_monitor;

ALTER TABLE `absim_track_log` MODIFY `lat`   double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `lon`   double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `alt`   double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `hdg`   double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `pitch` double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `roll`  double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `spd`   double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `tas`   double precision NULL;
ALTER TABLE `absim_track_log` MODIFY `cas`   double precision NULL;

-- Django의 django_migrations 테이블에도 반영 기록 추가(마이그레이션을 별도로
-- 돌리지 않고 이 DDL만 수동 적용하는 경우, 이후 `manage.py migrate` 실행 시
-- 이미 적용된 것으로 인식시켜 재실행 충돌을 방지)
INSERT INTO `django_migrations` (`app`, `name`, `applied`)
SELECT 'data_management', '0004_alter_absimtracklog_alt_alter_absimtracklog_cas_and_more', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `django_migrations`
  WHERE `app` = 'data_management'
    AND `name` = '0004_alter_absimtracklog_alt_alter_absimtracklog_cas_and_more'
);

SELECT 'absim_track_log nullable 컬럼 반영 완료' AS result;
