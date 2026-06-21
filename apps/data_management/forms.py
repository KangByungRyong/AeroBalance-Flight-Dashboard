from django import forms

from .models import FlightSession, FlightEvent


class FlightSessionForm(forms.ModelForm):
    class Meta:
        model = FlightSession
        fields = ["pilot_name", "organization", "notes"]
        widgets = {
            "pilot_name": forms.TextInput(attrs={"class": "form-control"}),
            "organization": forms.TextInput(attrs={"class": "form-control"}),
            "notes": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }
        labels = {
            "pilot_name": "조종사명",
            "organization": "소속",
            "notes": "메모",
        }


class FlightEventForm(forms.ModelForm):
    class Meta:
        model = FlightEvent
        fields = ["category", "description"]
        widgets = {
            "category": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }
        labels = {
            "category": "카테고리",
            "description": "내용",
        }
