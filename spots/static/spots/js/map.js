const map = L.map('map').setView([49.8, 15.5], 7);

L.tileLayer(`https://api.mapy.cz/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=${MAPY_CZ_API_KEY}`, {
    attribution: '<a href="https://api.mapy.cz/copyright" target="_blank">© Mapy.cz</a>',
    minZoom: 0,
    maxZoom: 19,
}).addTo(map);

const spots = SPOTS_DATA;

spots.forEach(spot => {
    const marker = L.marker([spot.lat, spot.lng]).addTo(map);
    marker.bindPopup(`
        <strong>${spot.name}</strong><br>
        Terén: ${spot.terrain}<br>
        Orientace: ${spot.orientation}<br>
        Nadmořská výška: ${spot.elevation} m<br>
        Voda: ${spot.water_nearby ? '✅ ' + spot.water_distance + ' m' : '❌'}<br>
        Přístřešek: ${spot.shelter_nearby ? '✅ ' + spot.shelter_distance + ' m' : '❌'}<br>
        Expozice větru: ${spot.wind_exposure}/5
    `);
});

function toggleFilter() {
    const btn = document.getElementById('filterBtn');
    const dropdown = document.getElementById('filterDropdown');
    const overlay = document.getElementById('overlay');
    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
        closeFilter();
    } else {
        btn.classList.add('active');
        dropdown.classList.add('open');
        overlay.classList.add('open');
    }
}

function closeFilter() {
    document.getElementById('filterBtn').classList.remove('active');
    document.getElementById('filterDropdown').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
}

function resetFilters() {
    ['f-orientation','f-terrain','f-water','f-shelter','f-wind'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('f-elevation').value = '';
    updateFilterBtn(0);
    window.location.href = '/';
}

function applyFilters() {
    const params = new URLSearchParams();
    const orientation = document.getElementById('f-orientation').value;
    const terrain = document.getElementById('f-terrain').value;
    const water = document.getElementById('f-water').value;
    const shelter = document.getElementById('f-shelter').value;
    const wind = document.getElementById('f-wind').value;
    const elevation = document.getElementById('f-elevation').value;

    if (orientation) params.append('orientation', orientation);
    if (terrain) params.append('terrain', terrain);
    if (water) params.append('water_max', water);
    if (shelter) params.append('shelter_max', shelter);
    if (wind) params.append('wind_max', wind);
    if (elevation) params.append('elevation_min', elevation);

    let count = [orientation, terrain, water, shelter, wind, elevation].filter(Boolean).length;
    updateFilterBtn(count);
    closeFilter();

    // Pokud je vybraná voda nebo přístřešek, hledej přes Overpass
    const center = map.getCenter();
    const lat = center.lat;
    const lng = center.lng;

    if (water || shelter) {
        const waterRadius = water ? parseInt(water) : 0;
        const shelterRadius = shelter ? parseInt(shelter) : 0;
        fetchPOIFiltered(lat, lng, waterRadius, shelterRadius);
    } else {
        clearPOI();
    }

    // Filtruj vlastní spoty přes URL
    if (orientation || terrain || wind || elevation) {
        window.location.href = '/?' + params.toString();
    }
}

function updateFilterBtn(count) {
    const btn = document.getElementById('filterBtn');
    if (count > 0) {
        btn.innerHTML = `🔍 Filtrovat <span class="active-count">${count}</span> <span class="arrow">▾</span>`;
    } else {
        btn.innerHTML = '🔍 Filtrovat <span class="arrow">▾</span>';
    }
}

// GEOLOKACE
function locateUser() {
    if (!navigator.geolocation) {
        alert('Tvůj prohlížeč nepodporuje geolokaci.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            map.setView([lat, lng], 13);

            const userMarker = L.circleMarker([lat, lng], {
                radius: 10,
                fillColor: '#c1603a',
                color: '#faeee8',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(map);

            userMarker.bindPopup('📍 Jsi tady').openPopup();

            fetchPOI(lat, lng, 2000);
        },
        function(error) {
            alert('Nepodařilo se zjistit tvou polohu. Zkontroluj nastavení prohlížeče.');
        }
    );
}

// OVERPASS API
let poiMarkers = [];

function clearPOI() {
    poiMarkers.forEach(m => map.removeLayer(m));
    poiMarkers = [];
}

function fetchPOI(lat, lng, radiusM) {
    clearPOI();

    const query = `
        [out:json][timeout:25];
        (
            node["tourism"="lean_to"](around:${radiusM},${lat},${lng});
            node["tourism"="wilderness_hut"](around:${radiusM},${lat},${lng});
            node["tourism"="alpine_hut"](around:${radiusM},${lat},${lng});
            node["amenity"="shelter"]["shelter_type"="lean_to"](around:${radiusM},${lat},${lng});
            node["amenity"="shelter"]["shelter_type"="basic_hut"](around:${radiusM},${lat},${lng});
            node["amenity"="shelter"]["shelter_type"="weather_shelter"](around:${radiusM},${lat},${lng});
            node["natural"="spring"](around:${radiusM},${lat},${lng});
            node["amenity"="drinking_water"]["drinking_water"!="no"](around:${radiusM},${lat},${lng});
        );
        out body;
    `;

    const url = `/api/overpass/?query=${encodeURIComponent(query)}`;

    fetch(url)
        .then(r => r.json())
        .then(data => {
            data.elements.forEach(el => {
                const type = el.tags.tourism || el.tags.amenity || el.tags.natural;
                let color = '#1a6b57';
                let icon = '🛖';

                if (type === 'spring' || type === 'drinking_water') {
                    color = '#1a5a8a';
                    icon = '💧';
                }

                const marker = L.circleMarker([el.lat, el.lon], {
                    radius: 8,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 0.85
                }).addTo(map);

                const name = el.tags.name || (type === 'spring' || type === 'drinking_water' ? 'Zdroj vody' : 'Přístřešek');

                marker.bindPopup(`
                    <strong>${icon} ${name}</strong><br>
                    <span style="color:#7aada0; font-size:12px;">${type}</span>
                `);

                poiMarkers.push(marker);
            });

            if (data.elements.length === 0) {
                alert('V okolí nebyly nalezeny žádné přístřešky ani zdroje vody.');
            }
        })
        .catch(err => {
            console.error('Overpass API error:', err);
        });
}

function fetchPOIFiltered(lat, lng, waterRadius, shelterRadius) {
    clearPOI();

    let queryParts = [];

    if (waterRadius > 0) {
        queryParts.push(`node["natural"="spring"](around:${waterRadius},${lat},${lng});`);
        queryParts.push(`node["amenity"="drinking_water"]["drinking_water"!="no"](around:${waterRadius},${lat},${lng});`);
    }

    if (shelterRadius > 0) {
        queryParts.push(`node["tourism"="lean_to"](around:${shelterRadius},${lat},${lng});`);
        queryParts.push(`node["tourism"="wilderness_hut"](around:${shelterRadius},${lat},${lng});`);
        queryParts.push(`node["tourism"="alpine_hut"](around:${shelterRadius},${lat},${lng});`);
        queryParts.push(`node["amenity"="shelter"]["shelter_type"="lean_to"](around:${shelterRadius},${lat},${lng});`);
        queryParts.push(`node["amenity"="shelter"]["shelter_type"="basic_hut"](around:${shelterRadius},${lat},${lng});`);
        queryParts.push(`node["amenity"="shelter"]["shelter_type"="weather_shelter"](around:${shelterRadius},${lat},${lng});`);
    }

    if (queryParts.length === 0) return;

    const query = `
        [out:json][timeout:25];
        (
            ${queryParts.join('\n')}
        );
        out body;
    `;

    const url = `/api/overpass/?query=${encodeURIComponent(query)}`;

    fetch(url)
        .then(r => r.json())
        .then(data => {
            data.elements.forEach(el => {
                const type = el.tags.tourism || el.tags.amenity || el.tags.natural;
                let color = '#1a6b57';
                let icon = '🛖';

                if (type === 'spring' || type === 'drinking_water') {
                    color = '#1a5a8a';
                    icon = '💧';
                }

                const marker = L.circleMarker([el.lat, el.lon], {
                    radius: 8,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: 0.85
                }).addTo(map);

                const name = el.tags.name || (type === 'spring' || type === 'drinking_water' ? 'Zdroj vody' : 'Přístřešek');

                marker.bindPopup(`
                    <strong>${icon} ${name}</strong><br>
                    <span style="font-size:12px; color:#7aada0;">${type}</span>
                `);

                poiMarkers.push(marker);
            });

            if (data.elements.length === 0) {
                alert('V okolí nebyly nalezeny žádné výsledky pro zvolené filtry.');
            }
        })
        .catch(err => {
            console.error('Overpass API error:', err);
        });
}

document.getElementById('locateBtn').addEventListener('click', locateUser);