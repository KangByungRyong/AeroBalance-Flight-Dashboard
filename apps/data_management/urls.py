from django.urls import path

from .views import (
    DataManagementIndexView,
    PilotListCreateView,
    SessionBulkExportView,
    SessionDetailView,
    SessionEndView,
    SessionFileImportView,
    SessionStartView,
    db_usage_api,
    session_active_api,
)

app_name = "data_management"

urlpatterns = [
    path("", DataManagementIndexView.as_view(), name="index"),
    path("pilots/", PilotListCreateView.as_view(), name="pilots"),
    path("session/start/", SessionStartView.as_view(), name="session_start"),
    path("session/active/", session_active_api, name="session_active"),
    path("session/<int:pk>/end/", SessionEndView.as_view(), name="session_end"),
    path("session/export-bulk/", SessionBulkExportView.as_view(), name="session_export_bulk"),
    path("session/import-file/", SessionFileImportView.as_view(), name="session_import_file"),
    path("db-usage/", db_usage_api, name="db_usage"),
    path("session/<int:pk>/", SessionDetailView.as_view(), name="session_detail"),
]
