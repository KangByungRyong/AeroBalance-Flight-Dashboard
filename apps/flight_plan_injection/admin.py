from django.contrib import admin

from .models import FlightPlanInjection


@admin.register(FlightPlanInjection)
class FlightPlanInjectionAdmin(admin.ModelAdmin):
    list_display = [
        "id", "flight_plan_name", "target_model_name", "callsign",
        "success", "status_code", "injected_at",
    ]
    list_filter = ["success", "target_model_name"]
    search_fields = ["flight_plan_name", "target_model_name", "gufi_id"]
