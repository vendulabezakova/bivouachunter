from django.contrib import admin
from django.urls import path
from spots import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.map_view, name='map'),
]