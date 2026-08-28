from django.contrib import admin

from .models import FlightPlan, FlightPlanWaypoint


class FlightPlanWaypointInline(admin.TabularInline):
    model = FlightPlanWaypoint
    extra = 0


@admin.register(FlightPlan)
class FlightPlanAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "aircraft_type", "dep", "arr", "eta", "updated_at"]
    search_fields = ["name", "dep", "arr"]
    inlines = [FlightPlanWaypointInline]
