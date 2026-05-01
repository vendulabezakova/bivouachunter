from django.shortcuts import render
from django.conf import settings
from django.contrib.auth import logout
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

    from django.contrib.auth import logout

def logout_view(request):
    logout(request)
    return render(request, 'account/logout.html')


import requests
from django.http import JsonResponse

def overpass_proxy(request):
    query = request.GET.get('query', '')
    if not query:
        return JsonResponse({'error': 'no query'}, status=400)
    
    try:
        response = requests.get(
            'https://overpass-api.de/api/interpreter',
            params={'data': query},
            timeout=30,
            headers={'User-Agent': 'BivouacHunter/1.0'}
        )
        if response.status_code == 200 and response.text:
            return JsonResponse(response.json())
        else:
            return JsonResponse({'elements': []})
    except Exception as e:
        return JsonResponse({'elements': [], 'error': str(e)})

def weather_proxy(request):
    lat = request.GET.get('lat')
    lng = request.GET.get('lng')
    
    if not lat or not lng:
        return JsonResponse({'error': 'missing coordinates'}, status=400)
    
    try:
        response = requests.get(
            'https://api.open-meteo.com/v1/forecast',
            params={
                'latitude': lat,
                'longitude': lng,
                'hourly': 'temperature_2m,precipitation,windspeed_10m,winddirection_10m,weathercode',
                'forecast_days': 1,
                'timezone': 'Europe/Prague',
            },
            timeout=10
        )
        return JsonResponse(response.json())
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)