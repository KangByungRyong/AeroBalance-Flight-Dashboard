from django.views.generic import TemplateView


class DataManagementIndexView(TemplateView):
    template_name = "data_management/index.html"
    extra_context = {"active_page": "management"}


# ─── 추후 구성 예정 ──────────────────────────────────────────
# import json
# from typing import Any
#
# from django.http import HttpRequest, JsonResponse
# from django.utils import timezone
# from django.views import View
#
# from .forms import FlightSessionForm, FlightEventForm
# from .models import FlightSession, FlightEvent
#
#
#     def get_context_data(self, **kwargs: Any) -> dict:
#         context = super().get_context_data(**kwargs)
#         context["sessions"] = FlightSession.objects.all()[:50]
#         context["session_form"] = FlightSessionForm()
#         return context
#
#
# class SessionStartView(View):
#     def post(self, request: HttpRequest) -> JsonResponse:
#         form = FlightSessionForm(request.POST)
#         if form.is_valid():
#             session = form.save()
#             return JsonResponse({"status": "ok", "session_id": session.pk})
#         return JsonResponse({"status": "error", "errors": form.errors}, status=400)
#
#
# class SessionEndView(View):
#     def post(self, request: HttpRequest, pk: int) -> JsonResponse:
#         try:
#             session = FlightSession.objects.get(pk=pk, end_time__isnull=True)
#         except FlightSession.DoesNotExist:
#             return JsonResponse({"status": "error", "message": "세션을 찾을 수 없습니다."}, status=404)
#         session.end_time = timezone.now()
#         session.save(update_fields=["end_time"])
#         return JsonResponse({"status": "ok"})
#
#
# class EventCreateView(View):
#     def post(self, request: HttpRequest, session_pk: int) -> JsonResponse:
#         try:
#             session = FlightSession.objects.get(pk=session_pk)
#         except FlightSession.DoesNotExist:
#             return JsonResponse({"status": "error"}, status=404)
#         form = FlightEventForm(request.POST)
#         if form.is_valid():
#             event = form.save(commit=False)
#             event.session = session
#             event.save()
#             return JsonResponse({"status": "ok", "event_id": event.pk})
#         return JsonResponse({"status": "error", "errors": form.errors}, status=400)
