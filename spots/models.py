from django.db import models

class Spot(models.Model):
    # Základní info
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Souřadnice
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    elevation = models.IntegerField(help_text="Nadmořská výška v metrech", null=True, blank=True)
    
    # Technické parametry
    ORIENTATION_CHOICES = [
        ('N', 'Sever'),
        ('NE', 'Severovýchod'),
        ('E', 'Východ'),
        ('SE', 'Jihovýchod'),
        ('S', 'Jih'),
        ('SW', 'Jihozápad'),
        ('W', 'Západ'),
        ('NW', 'Severozápad'),
    ]
    orientation = models.CharField(max_length=2, choices=ORIENTATION_CHOICES, blank=True)
    
    TERRAIN_CHOICES = [
        ('forest', 'Les'),
        ('meadow', 'Louka'),
        ('rocky', 'Skalnatý terén'),
        ('mixed', 'Smíšený'),
    ]
    terrain = models.CharField(max_length=20, choices=TERRAIN_CHOICES, blank=True)
    
    water_nearby = models.BooleanField(default=False, help_text="Je poblíž zdroj vody?")
    water_distance = models.IntegerField(help_text="Vzdálenost od vody v metrech", null=True, blank=True)
    
    shelter_nearby = models.BooleanField(default=False, help_text="Je poblíž přístřešek?")
    shelter_distance = models.IntegerField(help_text="Vzdálenost od přístřešku v metrech", null=True, blank=True)
    
    wind_exposure = models.IntegerField(
        help_text="Expozice větru 1-5 (1=chráněné, 5=velmi exponované)",
        null=True, blank=True
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    is_public = models.BooleanField(default=False)

    def __str__(self):
        return self.name