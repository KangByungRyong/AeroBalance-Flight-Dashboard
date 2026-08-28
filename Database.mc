-- xplane_monitor.absim_track_log definition

CREATE TABLE `absim_track_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `polled_at` double NOT NULL,
  `model_name` varchar(50) NOT NULL,
  `callsign` varchar(20) NOT NULL,
  `gufi_id` varchar(50) NOT NULL,
  `lat` double NOT NULL,
  `lon` double NOT NULL,
  `alt` double NOT NULL,
  `hdg` double NOT NULL,
  `pitch` double NOT NULL,
  `roll` double NOT NULL,
  `spd` double NOT NULL,
  `tas` double NOT NULL,
  `cas` double NOT NULL,
  `uam_status` varchar(30) NOT NULL,
  `udp_connected` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_absim_track_polled_at` (`polled_at`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.flight_plan definition

CREATE TABLE `flight_plan` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `aircraft_type` varchar(50) NOT NULL,
  `dep` varchar(8) NOT NULL,
  `arr` varchar(8) NOT NULL,
  `eta` datetime(6) NOT NULL,
  `departure_name` varchar(30) NOT NULL,
  `departure_lat` double NOT NULL,
  `departure_lon` double NOT NULL,
  `departure_alt` double NOT NULL,
  `departure_velocity` double NOT NULL,
  `arrival_name` varchar(30) NOT NULL,
  `arrival_lat` double NOT NULL,
  `arrival_lon` double NOT NULL,
  `arrival_alt` double NOT NULL,
  `arrival_velocity` double NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.pilot definition

CREATE TABLE `pilot` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `organization` varchar(200) NOT NULL,
  `license_no` varchar(50) NOT NULL,
  `notes` longtext NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.flight_plan_injection definition

CREATE TABLE `flight_plan_injection` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `flight_plan_name` varchar(100) NOT NULL,
  `target_model_name` varchar(50) NOT NULL,
  `callsign` varchar(20) NOT NULL,
  `gufi_id` varchar(50) NOT NULL,
  `eobt` datetime(6) DEFAULT NULL,
  `dashboard_injection_id` int(11) DEFAULT NULL,
  `dashboard_flight_plan_id` int(11) DEFAULT NULL,
  `status_code` int(11) DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `error_message` varchar(255) NOT NULL,
  `injected_at` datetime(6) NOT NULL,
  `flight_plan_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `flight_plan_injection_flight_plan_id_bb1c36cb_fk_flight_plan_id` (`flight_plan_id`),
  CONSTRAINT `flight_plan_injection_flight_plan_id_bb1c36cb_fk_flight_plan_id` FOREIGN KEY (`flight_plan_id`) REFERENCES `flight_plan` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.flight_plan_waypoint definition

CREATE TABLE `flight_plan_waypoint` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `seq` int(10) unsigned NOT NULL CHECK (`seq` >= 0),
  `name` varchar(30) NOT NULL,
  `lat` double NOT NULL,
  `lon` double NOT NULL,
  `alt` double NOT NULL,
  `velocity` double NOT NULL,
  `flight_plan_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `flight_plan_waypoint_flight_plan_id_seq_83f9457f_uniq` (`flight_plan_id`,`seq`),
  CONSTRAINT `flight_plan_waypoint_flight_plan_id_6e6ee703_fk_flight_plan_id` FOREIGN KEY (`flight_plan_id`) REFERENCES `flight_plan` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=170 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.flight_session definition

CREATE TABLE `flight_session` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `flight_plan_snapshot` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`flight_plan_snapshot`)),
  `callsign` varchar(20) NOT NULL,
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `end_reason` varchar(10) NOT NULL,
  `notes` longtext NOT NULL,
  `flight_plan_id` bigint(20) DEFAULT NULL,
  `pilot_id` bigint(20) NOT NULL,
  `archive_path` varchar(500) NOT NULL,
  `archived_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `flight_session_flight_plan_id_11810706_fk_flight_plan_id` (`flight_plan_id`),
  KEY `flight_session_pilot_id_08653f9b_fk_pilot_id` (`pilot_id`),
  CONSTRAINT `flight_session_flight_plan_id_11810706_fk_flight_plan_id` FOREIGN KEY (`flight_plan_id`) REFERENCES `flight_plan` (`id`),
  CONSTRAINT `flight_session_pilot_id_08653f9b_fk_pilot_id` FOREIGN KEY (`pilot_id`) REFERENCES `pilot` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.flight_data definition

CREATE TABLE `flight_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `timestamp` double NOT NULL,
  `lat` double DEFAULT NULL,
  `lon` double DEFAULT NULL,
  `alt_ft` double DEFAULT NULL,
  `ias_kt` double DEFAULT NULL,
  `tas_kt` double DEFAULT NULL,
  `gs_kt` double DEFAULT NULL,
  `heading` double DEFAULT NULL,
  `pitch` double DEFAULT NULL,
  `roll` double DEFAULT NULL,
  `params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`params`)),
  `session_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_timestamp` (`session_id`,`timestamp`),
  CONSTRAINT `flight_data_session_id_87893974_fk_flight_session_id` FOREIGN KEY (`session_id`) REFERENCES `flight_session` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- xplane_monitor.flight_event definition

CREATE TABLE `flight_event` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `timestamp` datetime(6) NOT NULL,
  `category` varchar(50) NOT NULL,
  `description` longtext NOT NULL,
  `session_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `flight_event_session_id_f490e281_fk_flight_session_id` (`session_id`),
  CONSTRAINT `flight_event_session_id_f490e281_fk_flight_session_id` FOREIGN KEY (`session_id`) REFERENCES `flight_session` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;