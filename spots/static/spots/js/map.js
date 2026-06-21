const map = L.map('map', { zoomControl: true });

// Zkus geolokaci hned při inicializaci mapy
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        function(position) {
            map.setView([position.coords.latitude, position.coords.longitude], 13);
        },
        function() {
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

// =====================
// HELPERS
// =====================

function isMobile() {
    return window.innerWidth <= 768;
}

// Bezpečné přidání/odebrání třídy — element nemusí existovat
function setClass(id, cls, add) {
    const el = document.getElementById(id);
    if (el) el.classList[add ? 'add' : 'remove'](cls);
}

// =====================
// FILTER
// =====================

function toggleFilter() {
    const dropdown = document.getElementById('filterDropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
        closeFilter();
    } else {
        if (searchBtn) { searchBtn.remove(); searchBtn = null; }
        closeLayers();
        setClass('filterBtn', 'active', true);
        dropdown.classList.add('open');
        setClass('overlay', 'open', true);
        // Schovat floating tlačítka pod filtrem
        setClass('map-floating-btns', 'hidden', true);
        // Schovat aktivní filtr lištu — obsah je vidět přímo ve filtru
        setClass('activeFilterBar', 'hidden', true);
    }
}

function closeFilter() {
    setClass('filterBtn', 'active', false);
    setClass('filterDropdown', 'open', false);
    setClass('overlay', 'open', false);
    // Vrátit floating tlačítka
    setClass('map-floating-btns', 'hidden', false);
    // Vrátit aktivní filtr lištu (updateActiveFilterBar rozhodne jestli je vidět)
    setClass('activeFilterBar', 'hidden', false);
}

function resetFilters() {
    ['f-orientation', 'f-terrain', 'f-water', 'f-shelter', 'f-trail', 'f-slope', 'f-bivakreg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const elev = document.getElementById('f-elevation');
    if (elev) elev.value = '';
    updateFilterBtn(0);
    updateActiveFilterBar();
    closeFilter();
    clearPOI();
}

function applyFilters() {
    const params = new URLSearchParams();
    const water = document.getElementById('f-water').value;
    const shelter = document.getElementById('f-shelter').value;
    const elevation = document.getElementById('f-elevation') ? document.getElementById('f-elevation').value : '';

    if (water) params.append('water_max', water);
    if (shelter) params.append('shelter_max', shelter);
    if (elevation) params.append('elevation_min', elevation);

    const count = [water, shelter, elevation].filter(Boolean).length;
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
        fetchPOIFiltered(center.lat, center.lng, water ? radiusM : 0, shelter ? radiusM : 0);
    } else {
        clearPOI();
    }

    if (elevation) {
        window.location.href = '/?' + params.toString();
    }

    updateActiveFilterBar();
}

function updateFilterBtn(count) {
    const btn = document.getElementById('filterBtn');
    if (!btn) return;
    if (count > 0) {
        btn.innerHTML = `🔍 Filtrovat <span class="active-count">${count}</span> <span class="arrow">▾</span>`;
    } else {
        btn.innerHTML = 'Filtrovat <span class="arrow">▾</span>';
    }
}

// =====================
// LAYERS
// =====================

function toggleLayers() {
    const dropdown = document.getElementById('layersDropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
        closeLayers();
    } else {
        setClass('filterBtn', 'active', false);
        setClass('filterDropdown', 'open', false);
        setClass('layersBtn', 'active', true);
        dropdown.classList.add('open');
        setClass('overlay', 'open', true);
    }
}

function closeLayers() {
    setClass('layersBtn', 'active', false);
    setClass('layersDropdown', 'open', false);
    setClass('overlay', 'open', false);
}

// =====================
// GEOLOKACE
// =====================

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
        function() {
            alert('Nepodařilo se zjistit tvou polohu. Zkontroluj nastavení prohlížeče.');
        }
    );
}

const locateBtnEl = document.getElementById('locateBtn');
if (locateBtnEl) locateBtnEl.addEventListener('click', locateUser);

// =====================
// OVERPASS API
// =====================

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
    fetch(`/api/overpass/?query=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
            renderPOIElements(data.elements);
            if (data.elements.length === 0) showNoResults();
        })
        .catch(err => console.error('Overpass API error:', err));
}

function fetchPOIFiltered(lat, lng, waterRadius, shelterRadius) {
    clearPOI();
    const queryParts = [];
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
    const query = `[out:json][timeout:25];\n(\n${queryParts.join('\n')}\n);\nout body;`;
    fetch(`/api/overpass/?query=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then(data => {
            renderPOIElements(data.elements);
            if (data.elements.length === 0) showNoResults();
        })
        .catch(err => console.error('Overpass API error:', err));
}

function renderPOIElements(elements) {
    elements.forEach(el => {
        const type = el.tags.tourism || el.tags.amenity || el.tags.natural;
        const isWater = (type === 'spring' || type === 'drinking_water');
        const color = isWater ? '#1a5a8a' : '#1a6b57';
        const icon = isWater ? '💧' : '🛖';
        const name = el.tags.name || (isWater ? 'Zdroj vody' : 'Přístřešek');

        const marker = L.circleMarker([el.lat, el.lon], {
            radius: 8,
            fillColor: color,
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85
        }).addTo(map);

        const popupContent = document.createElement('div');
        popupContent.style.minWidth = '260px';
        popupContent.innerHTML = `
            <strong>${icon} ${name}</strong><br>
            <span style="font-size:12px; color:#7aada0;">${getTypeName(type)}</span>
            <div style="font-size:11px; color:#4a7a6e; margin-top:4px;">⏳ Načítám počasí...</div>
        `;

        marker.bindPopup(L.popup().setContent(popupContent));
        marker.on('popupopen', function() { fetchWeather(el.lat, el.lon, popupContent); });
        poiMarkers.push(marker);
    });
}

// =====================
// POČASÍ
// =====================

function degreesToDirection(deg) {
    const dirs = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function weatherCodeToIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 2) return '🌤️';
    if (code <= 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '❄️';
    if (code <= 99) return '⛈️';
    return '🌡️';
}

function getTypeName(type) {
    const names = {
        lean_to: 'Přístřešek',
        wilderness_hut: 'Horská chata',
        alpine_hut: 'Alpská chata',
        shelter: 'Přístřešek',
        spring: 'Pramen',
        drinking_water: 'Pitná voda',
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
            let weatherHtml = `<div style="margin-top:10px; border-top:0.5px solid #2e4a42; padding-top:8px; min-width:220px;">`;
            offsets.forEach(offset => {
                const idx = Math.min(currentIdx + offset, times.length - 1);
                const temp = Math.round(hours.temperature_2m[idx]);
                const precip = hours.precipitation[idx];
                const wind = Math.round(hours.windspeed_10m[idx]);
                const windDir = degreesToDirection(hours.winddirection_10m[idx]);
                const icon = weatherCodeToIcon(hours.weathercode[idx]);
                const realTime = new Date(now.getTime() + offset * 3600000);
                const timeLabel = offset === 0
                    ? 'Teď'
                    : realTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
                weatherHtml += `
                    <div style="display:grid; grid-template-columns: 48px 1fr; gap:4px; margin-bottom:8px; font-size:12px; align-items:center; white-space:nowrap;">
                        <span style="color:#7aada0; font-weight:600;">${timeLabel}</span>
                        <div>
                            <span>${icon} ${temp}°C</span>
                            <span style="margin-left:8px;">💨 ${wind} km/h od ${windDir}</span>
                            <span style="margin-left:8px;">🌧 ${precip} mm</span>
                        </div>
                    </div>
                `;
            });
            weatherHtml += '</div>';
            const loading = popupElement.querySelector('div');
            if (loading) loading.remove();
            popupElement.innerHTML += weatherHtml;
        })
        .catch(err => console.error('Weather error:', err));
}

// =====================
// NO RESULTS TOAST
// =====================

function showNoResults() {
    const msg = document.createElement('div');
    msg.innerHTML = '🔍 V okolí nic nenalezeno';
    // Na mobilu tab bar má 64px, přidáme rezervu
    const bottomOffset = isMobile() ? '80px' : '32px';
    msg.style.cssText = `
        position: fixed;
        bottom: ${bottomOffset};
        left: 50%;
        transform: translateX(-50%);
        z-index: 1100;
        padding: 10px 20px;
        background: #1c2b27;
        color: #c8e8e2;
        border: 0.5px solid #4a7a6e;
        border-radius: 20px;
        font-size: 14px;
        font-family: 'Nunito', sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        white-space: nowrap;
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}

// =====================
// HLEDAT V TÉTO OBLASTI
// =====================

let searchBtn = null;

map.on('moveend', function() {
    const dropdown = document.getElementById('filterDropdown');
    if (dropdown && dropdown.classList.contains('open')) return;
    if (searchBtn) return;

    searchBtn = document.createElement('button');
    searchBtn.innerHTML = '🔍 Hledat v této oblasti';
    // Na mobilu není navbar → dej tlačítko úplně nahoře s malým offsetem
    const topOffset = isMobile() ? '16px' : '80px';
    searchBtn.style.cssText = `
        position: fixed;
        top: ${topOffset};
        left: 50%;
        transform: translateX(-50%);
        z-index: 1100;
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
            const radiusM = Math.max(Math.abs(ne.lat - sw.lat), Math.abs(ne.lng - sw.lng)) * 55000;
            fetchPOIFiltered(center.lat, center.lng, water ? radiusM : 0, shelter ? radiusM : 0);
        }
        searchBtn.remove();
        searchBtn = null;
    });
});

// =====================
// LOADING
// =====================

function hideLoading() {
    const screen = document.getElementById('loading-screen');
    if (!screen) return;
    screen.classList.add('hidden');
    document.getElementById('map').style.opacity = '1';
    setTimeout(() => screen.remove(), 400);
}

window.addEventListener('load', function() { locateUser(); });

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

// =====================
// USER PANEL
// =====================

function openUserPanel() {
    setClass('userPanel', 'open', true);
    setClass('userPanelOverlay', 'open', true);
}

function closeUserPanel() {
    setClass('userPanel', 'open', false);
    setClass('userPanelOverlay', 'open', false);
}

// =====================
// LAYER PICKER
// =====================

const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    opacity: 0.6
});

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
                    radius: 9, fillColor: '#c0392b', color: '#ffffff',
                    weight: 2, opacity: 1, fillOpacity: 0.9
                });
                marker.bindPopup(`<strong>🚑 ${el.tags.name || 'Stanice horské služby'}</strong><br><span style="font-size:12px;color:#7aada0;">Horská záchranná služba</span>`);
                rescueLayer.addLayer(marker);
            });
        })
        .catch(err => console.error('Rescue stations error:', err));
}

function toggleLayer(name) {
    if (name === 'topo') {
        map.hasLayer(topoLayer) ? map.removeLayer(topoLayer) : map.addLayer(topoLayer);
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

// =====================
// AKTIVNÍ FILTRY LIŠTA
// =====================

function updateActiveFilterBar() {
    const bar = document.getElementById('activeFilterBar');
    const row = document.getElementById('filterTagsRow');
    if (!bar || !row) return;
    const get = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const water = get('f-water');
    const shelter = get('f-shelter');
    const trail = get('f-trail');
    const slope = get('f-slope');
    const orientation = get('f-orientation');
    const bivakreg = get('f-bivakreg');

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
        row.innerHTML = tags.map(t => `<span class="filter-tag">${t}</span>`).join('');
    } else {
        bar.style.display = 'none';
        row.innerHTML = '';
    }
}

// =====================
// TAB BAR
// =====================

function switchTab(tab) {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + tab);
    if (activeTab) activeTab.classList.add('active');

    closeLayers();

    if (tab === 'map') {
        const dropdown = document.getElementById('filterDropdown');
        const isOpen = dropdown && dropdown.classList.contains('open');
        if (isOpen) {
            // Filtr je otevřený → zavřít (shodit dolů)
            closeFilter();
        } else {
            // Filtr je zavřený → otevřít, pokud jsou aktivní filtry nebo vždy
            closeFilter(); // zavři cokoliv jiného
            toggleFilter();
        }
    } else if (tab === 'profile') {
        closeFilter();
        openUserPanel();
    } else {
        closeFilter();
    }
}

// =====================
// MOCKUP HEATMAPA
// =====================

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
        const zone = L.circle([spot.lat, spot.lng], {
            radius: 400, fillColor: colors.fill, fillOpacity: 0.25,
            color: colors.border, weight: 1.5, opacity: 0.6,
        }).addTo(map);
        const center = L.circle([spot.lat, spot.lng], {
            radius: 80, fillColor: colors.fill, fillOpacity: 0.9,
            color: colors.border, weight: 2, opacity: 1,
        }).addTo(map);
        center.on('click', () => openSpotDetail(spot));
        zone.on('click', () => openSpotDetail(spot));
        heatSpotMarkers.push(zone, center);
    });
}

function openSpotDetail(spot) {
    const colors = scoreColors[spot.score];
    const panel = document.getElementById('spot-detail-panel');
    if (!panel) return;

    document.getElementById('spot-detail-coords').textContent = `${spot.lat.toFixed(4)}°N, ${spot.lng.toFixed(4)}°E`;
    const scoreEl = document.getElementById('spot-detail-score');
    scoreEl.textContent = colors.label;
    scoreEl.style.color = colors.border;
    document.getElementById('spot-detail-elevation').textContent = spot.elevation + ' m';
    const slopeEl = document.getElementById('spot-detail-slope');
    slopeEl.textContent = spot.slope + '° — ' + (spot.slope <= 5 ? 'Rovný terén — ideální' : spot.slope <= 10 ? 'Mírný svah' : 'Strmý svah');
    slopeEl.style.color = spot.slope <= 5 ? '#52b788' : spot.slope <= 10 ? '#ffd166' : '#f4845f';
    document.getElementById('spot-detail-orientation').textContent = spot.orientation;
    document.getElementById('spot-detail-trail').textContent = spot.trail + ' m';
    document.getElementById('spot-detail-spring').textContent = spot.spring + ' m';
    document.getElementById('spot-detail-terrain').textContent = spot.terrain;

    panel.classList.add('open');
}

renderHeatSpots();