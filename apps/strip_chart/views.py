from django.views.generic import TemplateView


class StripChartIndexView(TemplateView):
    template_name = "strip_chart/index.html"
    extra_context = {"active_page": "chart"}
