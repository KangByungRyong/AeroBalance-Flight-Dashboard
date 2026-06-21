-- xplane_monitor DB 생성 및 권한 부여
-- 실행: sudo mariadb < setup_db.sql

CREATE DATABASE IF NOT EXISTS xplane_monitor
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON xplane_monitor.* TO '1113253'@'localhost';

FLUSH PRIVILEGES;

SELECT 'DB 생성 및 권한 부여 완료' AS result;
