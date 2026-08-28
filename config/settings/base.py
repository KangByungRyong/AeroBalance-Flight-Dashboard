from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")

INSTALLED_APPS = [
    "daphne",  # runserver → ASGI/WebSocket 지원 (channels보다 먼저)
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "channels",
    # Local
    "apps.udp_receiver",
    "apps.absim_link",
    "apps.map_view",
    "apps.strip_chart",
    "apps.flight_planning",
    "apps.flight_plan_injection",
    "apps.pilot_flight",
    "apps.data_management",
    "apps.replay",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD"),
        "HOST": env("DB_HOST", default="127.0.0.1"),
        "PORT": env("DB_PORT", default="3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        },
    }
}

# Django Channels — In-Memory Channel Layer (단일 서버)
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "ko-kr"
TIME_ZONE = "Asia/Seoul"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

UDP_PORT: int = env.int("UDP_PORT", default=49100)
XPLANE_IP: str = env("XPLANE_IP", default="10.0.0.110")

STRIP_CHART_PRESETS_DIR: Path = BASE_DIR / "data" / "strip_chart_presets"

# ABSim-Dashboard(WS#3) REST 연동 (docs/ABFAP_Export_Interface.md)
ABSIM_DASHBOARD_BASE_URL: str = env("ABSIM_DASHBOARD_BASE_URL", default="")
ABSIM_POLL_INTERVAL_SEC: float = env.float("ABSIM_POLL_INTERVAL_SEC", default=1.0)
ABSIM_REQUEST_TIMEOUT_SEC: float = env.float("ABSIM_REQUEST_TIMEOUT_SEC", default=2.0)

# 데이터 관리 — 비행 세션 저장 (CLAUDE.md §10)
FLIGHT_DATA_FLUSH_INTERVAL_SEC: float = env.float("FLIGHT_DATA_FLUSH_INTERVAL_SEC", default=1.0)
SESSION_AUTO_END_TIMEOUT_SEC: float = env.float("SESSION_AUTO_END_TIMEOUT_SEC", default=60.0)
SESSION_WATCHDOG_INTERVAL_SEC: float = env.float("SESSION_WATCHDOG_INTERVAL_SEC", default=5.0)

# 데이터 관리 — 보존 기간 정책(아카이브, CLAUDE.md §10): FlightData/AbsimTrackLog가
# 50Hz 원본 저장으로 용량이 빠르게 늘어나(1시간 비행 ≈ 700MB) 오래된 세션은
# gzip JSON으로 내보낸 뒤 DB에서 삭제한다.
SESSION_RETENTION_DAYS: int = env.int("SESSION_RETENTION_DAYS", default=30)
SESSION_RETENTION_SWEEP_INTERVAL_SEC: float = env.float(
    "SESSION_RETENTION_SWEEP_INTERVAL_SEC", default=3600.0
)
SESSION_ARCHIVE_DIR: Path = BASE_DIR / "data" / "session_archives"

# 데이터 관리 — DB 용량 모니터링 (CLAUDE.md §10)
DB_CAPACITY_LIMIT_GB: float = env.float("DB_CAPACITY_LIMIT_GB", default=500.0)
