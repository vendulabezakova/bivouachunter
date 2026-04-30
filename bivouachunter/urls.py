from django.contrib import admin
from django.urls import path, include
from spots import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('allauth.urls')),
    path('odhlasit/', views.logout_view, name='custom_logout'),
    path('', views.map_view, name='map'),
]