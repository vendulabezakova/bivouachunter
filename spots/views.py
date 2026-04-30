from django.shortcuts import render
from .models import Spot
import json

def map_view(request):
    spots = Spot.objects.filter(is_public=True)
    spots_data = []
    for spot in spots:
        spots_data.append({
            'name': spot.name,
            'lat': float(spot.latitude),
            'lng': float(spot.longitude),
            'terrain': spot.get_terrain_display(),
            'orientation': spot.get_orientation_display(),
            'water_nearby': spot.water_nearby,
            'water_distance': spot.water_distance,
            'wind_exposure': spot.wind_exposure,
            'elevation': spot.elevation,
        })
    return render(request, 'spots/map.html', {'spots_json': json.dumps(spots_data)})