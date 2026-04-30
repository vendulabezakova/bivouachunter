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
    window.location.href = '/?' + params.toString();
}

function updateFilterBtn(count) {
    const btn = document.getElementById('filterBtn');
    if (count > 0) {
        btn.innerHTML = `🔍 Filtrovat <span class="active-count">${count}</span> <span class="arrow">▾</span>`;
    } else {
        btn.innerHTML = '🔍 Filtrovat <span class="arrow">▾</span>';
    }
}