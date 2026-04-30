from django.contrib import admin
from .models import Spot

@admin.register(Spot)
class SpotAdmin(admin.ModelAdmin):
    list_display = ['name', 'terrain', 'orientation', 'water_nearby', 'wind_exposure', 'is_public']
    list_filter = ['terrain', 'orientation', 'water_nearby', 'is_public']
    search_fields = ['name', 'description']