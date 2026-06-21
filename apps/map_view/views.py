from django.views.generic import TemplateView


class MapIndexView(TemplateView):
    template_name = "map_view/index.html"
    extra_context = {"active_page": "map"}
