from django.contrib import admin

from .models import FlightSession, FlightData, FlightEvent


@admin.register(FlightSession)
class FlightSessionAdmin(admin.ModelAdmin):
    list_display = ["id", "pilot_name", "organization", "start_time", "end_time", "is_active"]
    list_filter = ["organization"]
    search_fields = ["pilot_name", "organization"]


@admin.register(FlightEvent)
class FlightEventAdmin(admin.ModelAdmin):
    list_display = ["id", "session", "timestamp", "category", "description"]
    list_filter = ["category"]
