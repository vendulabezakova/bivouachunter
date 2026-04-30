from django.shortcuts import render
from django.conf import settings
from .models import Spot
import json

def map_view(request):
    spots = Spot.objects.filter(is_public=True)

    # Filtry z URL parametrů
    orientation = request.GET.get('orientation')
    terrain = request.GET.get('terrain')
    water_max = request.GET.get('water_max')
    shelter_max = request.GET.get('shelter_max')

    if orientation:
        spots = spots.filter(orientation=orientation)
    if terrain:
        spots = spots.filter(terrain=terrain)
    if water_max:
        spots = spots.filter(water_nearby=True, water_distance__lte=int(water_max))
    if shelter_max:
        spots = spots.filter(shelter_nearby=True, shelter_distance__lte=int(shelter_max))

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
            'shelter_nearby': spot.shelter_nearby,
            'shelter_distance': spot.shelter_distance,
            'wind_exposure': spot.wind_exposure,
            'elevation': spot.elevation,
        })

    return render(request, 'spots/map.html', {
        'spots_json': json.dumps(spots_data),
        'mapy_cz_api_key': settings.MAPY_CZ_API_KEY,
    })