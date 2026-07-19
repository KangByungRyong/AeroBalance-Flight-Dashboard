from django.contrib import admin

from .models import AbsimTrackLog, FlightData, FlightEvent, FlightSession, Pilot


@admin.register(Pilot)
class PilotAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "organization", "license_no", "created_at"]
    search_fields = ["name", "organization", "license_no"]


@admin.register(FlightSession)
class FlightSessionAdmin(admin.ModelAdmin):
    list_display = [
        "id", "callsign", "pilot", "flight_plan", "start_time", "end_time",
        "end_reason", "is_active", "archived_at",
    ]
    list_filter = ["end_reason"]
    search_fields = ["callsign", "pilot__name"]


@admin.register(FlightEvent)
class FlightEventAdmin(admin.ModelAdmin):
    list_display = ["id", "session", "timestamp", "category", "description"]
    list_filter = ["category"]


@admin.register(FlightData)
class FlightDataAdmin(admin.ModelAdmin):
    list_display = ["id", "session", "timestamp", "lat", "lon", "alt_ft"]


@admin.register(AbsimTrackLog)
class AbsimTrackLogAdmin(admin.ModelAdmin):
    list_display = ["id", "polled_at", "model_name", "callsign", "lat", "lon", "alt", "udp_connected"]
    list_filter = ["model_name", "udp_connected"]
