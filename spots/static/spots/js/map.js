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
        closeLayers();
        btn.classList.add('active');
        dropdown.classList.add('open');
        overlay.classList.add('open');
    }
}

function closeFilter() {
    document.getElementById('filterBtn').classList.remove('active');
    document.getElementById('filterDropdown').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
    if (typeof closeLayers === 'function') closeLayers();
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
    // Aktualizuj aktivní filtry lištu
    updateActiveFilterBar();
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

// MOCKUP HEATMAPA - testovací data pro prezentaci
const mockSpots = [
    { lat: 50.0869, lng: 17.2316, score: 'green', name: 'Sedlo pod Pradědem', elevation: 1380, slope: 2, orientation: 'J', trail: 120, spring: 200, terrain: 'louka, chráněná kotlina' },
    { lat: 50.0712, lng: 17.2089, score: 'green', name: 'Louka nad Ovčárnou', elevation: 1250, slope: 4, orientation: 'JV', trail: 80, spring: 350, terrain: 'louka, smíšený les' },
    { lat: 50.0634, lng: 17.2445, score: 'yellow', name: 'Hrana Velkého Děda', elevation: 1420, slope: 7, orientation: 'Z', trail: 210, spring: 600, terrain: 'skalnatý, exponovaný' },
    { lat: 50.0923, lng: 17.1987, score: 'green', name: 'Kotlina u Barborky', elevation: 1180, slope: 3, orientation: 'J', trail: 150, spring: 180, terrain: 'les smíšený' },
    { lat: 50.0556, lng: 17.2234, score: 'yellow', name: 'Svah Petrovy kameny', elevation: 1490, slope: 9, orientation: 'SZ', trail: 340, spring: 800, terrain: 'skalnatý terén' },
];

const scoreColors = {
    green: { fill: '#2d6a4f', border: '#52b788', label: 'Ideální' },
    yellow: { fill: '#d4a017', border: '#ffd166', label: 'Použitelný' },
    orange: { fill: '#c1603a', border: '#f4845f', label: 'Hraniční' },
};

let heatSpotMarkers = [];

function renderHeatSpots() {
    heatSpotMarkers.forEach(m => map.removeLayer(m));
    heatSpotMarkers = [];

    mockSpots.forEach(spot => {
        const colors = scoreColors[spot.score];

        // Velký průhledný kruh - "zóna"
        const zone = L.circle([spot.lat, spot.lng], {
            radius: 400,
            fillColor: colors.fill,
            fillOpacity: 0.25,
            color: colors.border,
            weight: 1.5,
            opacity: 0.6,
        }).addTo(map);

        // Malý střed
        const center = L.circle([spot.lat, spot.lng], {
            radius: 80,
            fillColor: colors.fill,
            fillOpacity: 0.9,
            color: colors.border,
            weight: 2,
            opacity: 1,
        }).addTo(map);

        // Klik otevře detail
        center.on('click', () => openSpotDetail(spot));
        zone.on('click', () => openSpotDetail(spot));

        heatSpotMarkers.push(zone, center);
    });
}

function openSpotDetail(spot) {
    const colors = scoreColors[spot.score];
    const panel = document.getElementById('spot-detail-panel');
    
    document.getElementById('spot-detail-coords').textContent = `${spot.lat.toFixed(4)}°N, ${spot.lng.toFixed(4)}°E`;
    document.getElementById('spot-detail-score').textContent = colors.label;
    document.getElementById('spot-detail-score').style.color = colors.border;
    document.getElementById('spot-detail-elevation').textContent = spot.elevation + ' m';
    document.getElementById('spot-detail-slope').textContent = spot.slope + '° — ' + (spot.slope <= 5 ? 'Rovný terén — ideální' : spot.slope <= 10 ? 'Mírný svah' : 'Strmý svah');
    document.getElementById('spot-detail-slope').style.color = spot.slope <= 5 ? '#52b788' : spot.slope <= 10 ? '#ffd166' : '#f4845f';
    document.getElementById('spot-detail-orientation').textContent = spot.orientation;
    document.getElementById('spot-detail-trail').textContent = spot.trail + ' m';
    document.getElementById('spot-detail-spring').textContent = spot.spring + ' m';
    document.getElementById('spot-detail-terrain').textContent = spot.terrain;

    panel.classList.add('open');
}

// Zobraz heatmapu hned
renderHeatSpots();

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

// =====================
// LAYER PICKER
// =====================

// Vrstevnice (OpenTopoMap)
const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    opacity: 0.6
});

// Horská služba — Overpass layer group
const rescueLayer = L.layerGroup();
let rescueLoaded = false;

function loadRescueStations() {
    if (rescueLoaded) return;
    rescueLoaded = true;

    const center = map.getCenter();
    const query = `
        [out:json][timeout:25];
        (
            node["emergency"="mountain_rescue"](around:100000,${center.lat},${center.lng});
            node["emergency"="rescue_station"](around:100000,${center.lat},${center.lng});
        );
        out body;
    `;

    fetch(`/api/overpass/?query=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
            data.elements.forEach(el => {
                const marker = L.circleMarker([el.lat, el.lon], {
                    radius: 9,
                    fillColor: '#c0392b',
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                });
                const name = el.tags.name || 'Stanice horské služby';
                marker.bindPopup(`<strong>🚑 ${name}</strong><br><span style="font-size:12px;color:#7aada0;">Horská záchranná služba</span>`);
                rescueLayer.addLayer(marker);
            });
        })
        .catch(err => console.error('Rescue stations error:', err));
}

function toggleLayer(name) {
    if (name === 'topo') {
        if (map.hasLayer(topoLayer)) {
            map.removeLayer(topoLayer);
        } else {
            map.addLayer(topoLayer);
        }
    }
    if (name === 'rescue') {
        if (map.hasLayer(rescueLayer)) {
            map.removeLayer(rescueLayer);
        } else {
            loadRescueStations();
            map.addLayer(rescueLayer);
        }
    }
}

function toggleLayers() {
    const btn = document.getElementById('layersBtn');
    const dropdown = document.getElementById('layersDropdown');
    const overlay = document.getElementById('overlay');
    const isOpen = dropdown.classList.contains('open');

    if (isOpen) {
        closeLayers();
    } else {
        // Zavři filtr bez volání closeLayers
        document.getElementById('filterBtn').classList.remove('active');
        document.getElementById('filterDropdown').classList.remove('open');
        btn.classList.add('active');
        dropdown.classList.add('open');
        overlay.classList.add('open');
    }
}

function closeLayers() {
    document.getElementById('layersBtn').classList.remove('active');
    document.getElementById('layersDropdown').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
}

function updateActiveFilterBar() {
    const bar = document.getElementById('activeFilterBar');
    const water = document.getElementById('f-water').value;
    const shelter = document.getElementById('f-shelter').value;
    const trail = document.getElementById('f-trail') ? document.getElementById('f-trail').value : '';
    const slope = document.getElementById('f-slope') ? document.getElementById('f-slope').value : '';
    const orientation = document.getElementById('f-orientation').value;
    const bivakreg = document.getElementById('f-bivakreg') ? document.getElementById('f-bivakreg').value : '';

    const tags = [];
    if (slope) tags.push(`sklon <${slope}°`);
    if (orientation) tags.push(`orientace ${orientation}`);
    if (trail) tags.push(`od pěšiny do ${trail} m`);
    if (water) tags.push(`pramen do ${water} m`);
    if (shelter) tags.push(`přístřešek do ${shelter} m`);
    if (bivakreg === 'allowed') tags.push('bivak povolen');
    if (bivakreg === 'restricted') tags.push('bivak s omezením');

    if (tags.length > 0) {
        bar.style.display = 'flex';
        bar.innerHTML = tags.map(t => `<span class="filter-tag">${t}</span>`).join('');
    } else {
        bar.style.display = 'none';
    }
}

function switchTab(tab) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    
    if (tab === 'map') {
        toggleFilter();
    } else if (tab === 'profile') {
        openUserPanel();
    }
}