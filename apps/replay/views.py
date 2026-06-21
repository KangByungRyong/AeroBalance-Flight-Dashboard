from django.views.generic import TemplateView


class ReplayIndexView(TemplateView):
    template_name = "replay/index.html"
    extra_context = {"active_page": "replay"}
