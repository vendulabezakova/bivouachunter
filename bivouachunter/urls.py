from django.contrib import admin
from django.urls import path, include
from spots import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('allauth.urls')),
    path('odhlasit/', views.logout_view, name='custom_logout'),
    path('', views.map_view, name='map'),
    path('api/overpass/', views.overpass_proxy, name='overpass_proxy'),
    path('api/weather/', views.weather_proxy, name='weather_proxy'),
]