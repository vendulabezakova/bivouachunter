const map = L.map('map', { zoomControl: true });

// Zkus geolokaci hned při inicializaci mapy
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        function(position) {
            map.setView([position.coords.latitude, position.coords.longitude], 13);
        },
        function() {
            // Fallback pokud geolokace selže
            map.setView([49.8, 15.5], 7);
        }
    );
} else {
    map.setView([49.8, 15.5], 7);
}

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
        // Schovej "Hledat v této oblasti" když se otevře filtr
        if (searchBtn) {
            searchBtn.remove();
            searchBtn = null;
        }
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
    const water = document.getElementById('f-water').value;
    const shelter = document.getElementById('f-shelter').value;
    const elevation = document.getElementById('f-elevation').value;

    if (water) params.append('water_max', water);
    if (shelter) params.append('shelter_max', shelter);
    if (elevation) params.append('elevation_min', elevation);

    let count = [water, shelter, elevation].filter(Boolean).length;
    updateFilterBtn(count);
    closeFilter();

    if (water || shelter) {
        const center = map.getCenter();
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = Math.abs(ne.lat - sw.lat);
        const lngDiff = Math.abs(ne.lng - sw.lng);
        const radiusM = Math.max(latDiff, lngDiff) * 55000;

        const waterRadius = water ? radiusM : 0;
        const shelterRadius = shelter ? radiusM : 0;
        fetchPOIFiltered(center.lat, center.lng, waterRadius, shelterRadius);
    } else {
        clearPOI();
    }

    if (elevation) {
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
            node["amenity"="shelter"]["shelter_type"="picnic_shelter"](around:${radiusM},${lat},${lng});
            node["amenity"="shelter"][!"shelter_type"](around:${radiusM},${lat},${lng});
            node["natural"="spring"](around:${radiusM},${lat},${lng});
            node["amenity"="drinking_water"]["drinking_water"!="no"](around:${radiusM},${lat},${lng});
        );
        out body;
    `;

    const url = `/api/overpass/?query=${encodeURIComponent(query)}`;

    fetch(url)
        .then(r => r.json())
        .then(data => {
            console.log('Overpass výsledky:', data.elements.length, data.elements);
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

                const popupContent = document.createElement('div');
                    popupContent.style.minWidth = '260px';
                    popupContent.innerHTML = `
                        <strong>${icon} ${name}</strong><br>
                        <span style="font-size:12px; color:#7aada0;">${getTypeName(type)}</span>
                        <div style="font-size:11px; color:#4a7a6e; margin-top:4px;">⏳ Načítám počasí...</div>
                    `;

                const popup = L.popup().setContent(popupContent);
                marker.bindPopup(popup);

                marker.on('popupopen', function() {
                    fetchWeather(el.lat, el.lon, popupContent);
                });

                poiMarkers.push(marker);
            });

                    if (data.elements.length === 0) {
            showNoResults();
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
        queryParts.push(`node["amenity"="shelter"]["shelter_type"="picnic_shelter"](around:${shelterRadius},${lat},${lng});`);
        queryParts.push(`node["amenity"="shelter"][!"shelter_type"](around:${shelterRadius},${lat},${lng});`);
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

                const popupContent = document.createElement('div');
                    popupContent.style.minWidth = '260px';
                    popupContent.innerHTML = `
                        <strong>${icon} ${name}</strong><br>
                        <span style="font-size:12px; color:#7aada0;">${getTypeName(type)}</span>
                        <div style="font-size:11px; color:#4a7a6e; margin-top:4px;">⏳ Načítám počasí...</div>
                    `;

                const popup = L.popup().setContent(popupContent);
                marker.bindPopup(popup);

                marker.on('popupopen', function() {
                    fetchWeather(el.lat, el.lon, popupContent);
                });

                poiMarkers.push(marker);
            });

                if (data.elements.length === 0) {
                showNoResults();
            }  
        })
        .catch(err => {
            console.error('Overpass API error:', err);
        });
}

// POČASÍ
function degreesToDirection(deg) {
    const dirs = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function weatherCodeToIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 2) return '🌤️';
    if (code <= 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 57) return '🌧️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '❄️';
    if (code <= 99) return '⛈️';
    return '🌡️';
}

function getTypeName(type) {
    const names = {
        'lean_to': 'Přístřešek',
        'wilderness_hut': 'Horská chata',
        'alpine_hut': 'Alpská chata',
        'shelter': 'Přístřešek',
        'spring': 'Pramen',
        'drinking_water': 'Pitná voda',
    };
    return names[type] || type;
}

function fetchWeather(lat, lng, popupElement) {
    fetch(`/api/weather/?lat=${lat}&lng=${lng}`)
        .then(r => r.json())
        .then(data => {
            const now = new Date();
            const hours = data.hourly;
            const times = hours.time;

            let currentIdx = 0;
            for (let i = 0; i < times.length; i++) {
                if (new Date(times[i]) <= now) currentIdx = i;
            }

            const offsets = [0, 3, 6, 12];
            let weatherHtml = `
                <div style="margin-top:10px; border-top:0.5px solid #2e4a42; padding-top:8px; min-width:220px;">
            `;

            offsets.forEach(offset => {
                const idx = Math.min(currentIdx + offset, times.length - 1);
                const temp = Math.round(hours.temperature_2m[idx]);
                const precip = hours.precipitation[idx];
                const wind = Math.round(hours.windspeed_10m[idx]);
                const windDir = degreesToDirection(hours.winddirection_10m[idx]);
                const icon = weatherCodeToIcon(hours.weathercode[idx]);

                // Reálný čas
                const realTime = new Date(now.getTime() + offset * 60 * 60 * 1000);
                const timeLabel = offset === 0 
                    ? 'Teď' 
                    : realTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

                weatherHtml += `
                    <div style="display:grid; grid-template-columns: 48px 1fr; gap:4px; margin-bottom:8px; font-size:12px; align-items:center; white-space:nowrap;">
                        <span style="color:#7aada0; font-weight:600;">${timeLabel}</span>
                        <div>
                            <span>${icon} ${temp}°C</span>
                            <span style="margin-left:8px;">💨 ${wind} km/h od ${windDir}</span>
                            <span style="margin-left:8px; white-space:nowrap;">🌧 ${precip} mm</span>
                        </div>
                    </div>
                `;
            });

            weatherHtml += '</div>';

            // Odstraň "Načítám počasí..." a přidej data
            const loading = popupElement.querySelector('div');
            if (loading) loading.remove();
            popupElement.innerHTML += weatherHtml;
        })
        .catch(err => {
            console.error('Weather error:', err);
        });
}

function showNoResults() {
    const msg = document.createElement('div');
    msg.innerHTML = '🔍 V okolí nic nenalezeno';
    msg.style.cssText = `
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        padding: 10px 20px;
        background: #1c2b27;
        color: #c8e8e2;
        border: 0.5px solid #4a7a6e;
        border-radius: 20px;
        font-size: 14px;
        font-family: 'Nunito', sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}

document.getElementById('locateBtn').addEventListener('click', locateUser);

// HLEDAT V TÉTO OBLASTI
let searchBtn = null;

map.on('moveend', function() {
    const dropdown = document.getElementById('filterDropdown');
    if (dropdown.classList.contains('open')) return;

    if (!searchBtn) {
        searchBtn = document.createElement('button');
        searchBtn.innerHTML = '🔍 Hledat v této oblasti';
        searchBtn.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            padding: 8px 20px;
            background: #1c2b27;
            color: #c8e8e2;
            border: 0.5px solid #4a7a6e;
            border-radius: 20px;
            font-size: 14px;
            font-family: 'Nunito', sans-serif;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(searchBtn);

        searchBtn.addEventListener('click', function() {
            const center = map.getCenter();
            const water = document.getElementById('f-water').value;
            const shelter = document.getElementById('f-shelter').value;

            if (water || shelter) {
                const bounds = map.getBounds();
                const ne = bounds.getNorthEast();
                const sw = bounds.getSouthWest();
                const latDiff = Math.abs(ne.lat - sw.lat);
                const lngDiff = Math.abs(ne.lng - sw.lng);
                const radiusM = Math.max(latDiff, lngDiff) * 55000;

                const waterRadius = water ? radiusM : 0;
                const shelterRadius = shelter ? radiusM : 0;
                fetchPOIFiltered(center.lat, center.lng, waterRadius, shelterRadius);
            }

            searchBtn.remove();
            searchBtn = null;
        });
    }
});

// Automatická geolokace při načtení
window.addEventListener('load', function() {
    locateUser();
});

function hideLoading() {
    const screen = document.getElementById('loading-screen');
    screen.classList.add('hidden');
    document.getElementById('map').style.opacity = '1';
    setTimeout(() => screen.remove(), 400);
}

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        function(position) {
            map.setView([position.coords.latitude, position.coords.longitude], 13);
            hideLoading();
        },
        function() {
            map.setView([49.8, 15.5], 7);
            hideLoading();
        }
    );
} else {
    map.setView([49.8, 15.5], 7);
    hideLoading();
}

function openUserPanel() {
    document.getElementById('userPanel').classList.add('open');
    document.getElementById('userPanelOverlay').classList.add('open');
}

function closeUserPanel() {
    document.getElementById('userPanel').classList.remove('open');
    document.getElementById('userPanelOverlay').classList.remove('open');
}