// ============================================
// GLOBAL STATE
// ============================================
const STATE = {
    lat: 50.45,
    lon: 30.52,
    name: 'Київ, Україна',
    currentModel: 'gfs',
    profileModel: 'gfs',
    currentTab: 'map',
    data: {},
    settings: {
        autoRefresh: true,
        windSpeed: 'kmh'
    },
    charts: {},
    autoPlayInterval: null,
    currentTimelineIndex: 0
};

// ============================================
// CONVERSION FUNCTIONS
// ============================================
function convertWindSpeed(kmh) {
    switch (STATE.settings.windSpeed) {
        case 'ms': return kmh / 3.6;
        case 'mph': return kmh * 0.621371;
        case 'kt': return kmh * 0.539957;
        default: return kmh;
    }
}

function getWindSpeedUnit() {
    const units = { kmh: 'км/год', ms: 'м/с', mph: 'mph', kt: 'kt' };
    return units[STATE.settings.windSpeed] || 'км/год';
}

function formatWindSpeed(kmh) {
    return Math.round(convertWindSpeed(kmh));
}

// ============================================
// DEW POINT & CLOUD BASE
// ============================================
function calculateDewPoint(temp, humidity) {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100.0);
    return (b * alpha) / (a - alpha);
}

function calculateCloudBase(temp, dewPoint) {
    const spread = temp - dewPoint;
    if (spread <= 0) return 0;
    return Math.round((spread / 2.5) * 122);
}

function getCloudBaseInfo() {
    return `📏 Висота низу хмар розрахована за формулою:
CBH = ((T - Td) / 2.5) × 122 метрів

де:
• T = Температура повітря (°C)
• Td = Точка роси (°C)  
• 2.5 = Градієнт охолодження (°C/1000 футів)

⚠️ Приблизний розрахунок для кучастих хмар.
💡 Чим менше різниця T-Td, тим нижче хмари.`;
}

// ============================================
// INITIALIZATION
// ============================================
let map, marker;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 UAV Forecast Pro v3');
    initMap();
    setupEventListeners();
    loadAllData();
});

// ============================================
// MAP
// ============================================
function initMap() {
    map = L.map('map').setView([STATE.lat, STATE.lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    marker = L.marker([STATE.lat, STATE.lon], { draggable: true }).addTo(map);
    
    marker.on('dragend', e => {
        const pos = marker.getLatLng();
        updateCoordinates(pos.lat, pos.lng);
    });

    map.on('click', e => {
        marker.setLatLng(e.latlng);
        updateCoordinates(e.latlng.lat, e.latlng.lng);
    });
}

function updateCoordinates(lat, lon) {
    STATE.lat = lat;
    STATE.lon = lon;
    document.getElementById('mapCoords').textContent = 
        `${lat.toFixed(2)}°${lat > 0 ? 'N' : 'S'}, ${lon.toFixed(2)}°${lon > 0 ? 'E' : 'W'}`;
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('locationBtn').addEventListener('click', () => openModal('locationModal'));
    document.getElementById('refreshBtn').addEventListener('click', loadAllData);
    document.getElementById('settingsBtn').addEventListener('click', () => openModal('settingsModal'));
    
    document.getElementById('myLocationBtn').addEventListener('click', getMyLocation);
    document.getElementById('getDataBtn').addEventListener('click', loadAllData);
    
    document.getElementById('applyLocationBtn').addEventListener('click', applyLocation);
    document.getElementById('cancelLocationBtn').addEventListener('click', () => closeModal('locationModal'));
    
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('latInput').value = btn.dataset.lat;
            document.getElementById('lonInput').value = btn.dataset.lon;
            document.getElementById('nameInput').value = btn.dataset.name + ', Україна';
        });
    });
    
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('cancelSettingsBtn').addEventListener('click', () => closeModal('settingsModal'));
    
    document.querySelectorAll('#modelButtons .model-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#modelButtons .model-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            STATE.currentModel = btn.dataset.model;
            renderForecast();
        });
    });
    
    document.querySelectorAll('#profileModelButtons .model-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#profileModelButtons .model-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            STATE.profileModel = btn.dataset.model;
            renderWindProfile();
        });
    });
    
    document.getElementById('prevHourBtn').addEventListener('click', () => scrollTimeline(-1));
    document.getElementById('nextHourBtn').addEventListener('click', () => scrollTimeline(1));
    document.getElementById('autoPlayBtn').addEventListener('click', toggleAutoPlay);
}

// ============================================
// TOOLTIP
// ============================================
function showTooltip(event, text) {
    const tooltip = document.getElementById('tooltip');
    tooltip.textContent = text;
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
    tooltip.classList.add('show');
}

function hideTooltip() {
    document.getElementById('tooltip').classList.remove('show');
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tabName) {
    STATE.currentTab = tabName;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    if (tabName === 'map') {
        setTimeout(() => map.invalidateSize(), 100);
    } else if (tabName === 'forecast') {
        renderForecast();
    } else if (tabName === 'profile') {
        renderWindProfile();
    } else if (tabName === 'compare') {
        renderComparison();
    } else if (tabName === 'charts') {
        renderCharts();
    }
}

// ============================================
// MODAL
// ============================================
function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// ============================================
// GEOLOCATION
// ============================================
function getMyLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                STATE.lat = position.coords.latitude;
                STATE.lon = position.coords.longitude;
                STATE.name = 'Моя локація';
                
                marker.setLatLng([STATE.lat, STATE.lon]);
                map.setView([STATE.lat, STATE.lon], 12);
                updateCoordinates(STATE.lat, STATE.lon);
                updateLocationDisplay();
                loadAllData();
            },
            (error) => alert('Помилка геолокації: ' + error.message)
        );
    }
}

function applyLocation() {
    STATE.lat = parseFloat(document.getElementById('latInput').value);
    STATE.lon = parseFloat(document.getElementById('lonInput').value);
    STATE.name = document.getElementById('nameInput').value;
    
    marker.setLatLng([STATE.lat, STATE.lon]);
    map.setView([STATE.lat, STATE.lon], 10);
    updateCoordinates(STATE.lat, STATE.lon);
    updateLocationDisplay();
    
    closeModal('locationModal');
    loadAllData();
}

function updateLocationDisplay() {
    document.getElementById('locationText').textContent = STATE.name;
    document.getElementById('coordText').textContent = 
        `${STATE.lat.toFixed(2)}°${STATE.lat > 0 ? 'N' : 'S'}, ${STATE.lon.toFixed(2)}°${STATE.lon > 0 ? 'E' : 'W'}`;
}

// ============================================
// SETTINGS
// ============================================
function saveSettings() {
    STATE.settings.autoRefresh = document.getElementById('autoRefresh').checked;
    STATE.settings.windSpeed = document.querySelector('input[name="windSpeed"]:checked').value;
    
    closeModal('settingsModal');
    renderForecast();
    renderWindProfile();
}

// ============================================
// DATA LOADING
// ============================================
async function loadAllData() {
    showLoading(true);
    
    try {
        const [gfs, icon, ecmwf, windy] = await Promise.all([
            fetchOpenMeteo('gfs_global'),
            fetchOpenMeteo('icon_global'),
            fetchOpenMeteo('ecmwf_ifs025'),
            fetchWindy()
        ]);

        STATE.data = { gfs, icon, ecmwf, windy };
        renderForecast();
        showLoading(false);
    } catch (error) {
        console.error('❌ Помилка:', error);
        alert('Помилка завантаження: ' + error.message);
        showLoading(false);
    }
}

async function fetchOpenMeteo(model) {
    const url = `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${STATE.lat}&longitude=${STATE.lon}` +
        `&models=${model}` +
        `&hourly=temperature_2m,relativehumidity_2m,dewpoint_2m,precipitation,weathercode` +
        `,cloudcover,visibility,windspeed_10m,windspeed_80m,windspeed_120m,windspeed_180m` +
        `,winddirection_10m,winddirection_80m,winddirection_120m,winddirection_180m` +
        `,windgusts_10m` +
        `&daily=sunrise,sunset` +
        `&timezone=auto&forecast_days=2`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${model}: ${res.status}`);
    return await res.json();
}

async function fetchWindy() {
    const res = await fetch('https://api.windy.com/api/point-forecast/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat: STATE.lat,
            lon: STATE.lon,
            model: "gfs",
            parameters: ["wind", "temp"],
            levels: ["surface", "950h", "900h", "850h", "800h", "700h", "600h", "500h"],
            key: "8LSlMIu1xWAVn4ePmrgxIMyzvg9VBC6G"
        })
    });
    
    if (!res.ok) throw new Error(`Windy: ${res.status}`);
    return await res.json();
}

function showLoading(show) {
    document.getElementById('loadingDiv').style.display = show ? 'block' : 'none';
}

// ============================================
// FORECAST RENDERING
// ============================================
function renderForecast() {
    const model = STATE.currentModel;
    const data = STATE.data[model];
    
    if (!data) return;

    renderTiles(data, model);
    renderTimeline(data, model);
    renderDetailedTable(data, model);
}

function renderTiles(data, model) {
    const tilesGrid = document.getElementById('tilesGrid');
    
    if (model === 'windy') {
        const wind = calcWind(data['wind_u-surface'][0], data['wind_v-surface'][0]);
        const temp = data['temp-surface'][0] - 273.15;
        
        tilesGrid.innerHTML = `
            <div class="tile">
                <div class="tile-icon">💨</div>
                <div class="tile-label">Вітер</div>
                <div class="tile-value">${formatWindSpeed(wind.speed)}</div>
                <div class="tile-subtitle">${getWindSpeedUnit()}</div>
            </div>
            <div class="tile">
                <div class="tile-icon">🌡️</div>
                <div class="tile-label">Температура</div>
                <div class="tile-value">${Math.round(temp)}°C</div>
            </div>
        `;
        return;
    }

    const h = data.hourly;
    const now = getCurrentHourIndex(data);
    const temp = h.temperature_2m[now];
    const humidity = h.relativehumidity_2m[now];
    const dewPoint = h.dewpoint_2m ? h.dewpoint_2m[now] : calculateDewPoint(temp, humidity);
    const cloudBase = calculateCloudBase(temp, dewPoint);
    
    tilesGrid.innerHTML = `
        <div class="tile">
            <div class="tile-icon">${getWeatherIcon(h.weathercode[now])}</div>
            <div class="tile-label">Погода</div>
            <div class="tile-value">${getWeatherText(h.weathercode[now])}</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">💨</div>
            <div class="tile-label">Вітер</div>
            <div class="tile-value">${formatWindSpeed(h.windspeed_10m[now])}</div>
            <div class="tile-subtitle">${getWindSpeedUnit()}</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">🌪️</div>
            <div class="tile-label">Пориви</div>
            <div class="tile-value">${formatWindSpeed(h.windgusts_10m[now])}</div>
            <div class="tile-subtitle">${getWindSpeedUnit()}</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">🌡️</div>
            <div class="tile-label">Температура</div>
            <div class="tile-value">${Math.round(temp)}°C</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">💧</div>
            <div class="tile-label">Точка роси</div>
            <div class="tile-value">${Math.round(dewPoint)}°C</div>
            <div class="tile-subtitle">Різниця ${Math.round(temp - dewPoint)}°C</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">💦</div>
            <div class="tile-label">Вологість</div>
            <div class="tile-value">${humidity}%</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">☁️</div>
            <div class="tile-label">Хмарність</div>
            <div class="tile-value">${h.cloudcover[now]}%</div>
        </div>
        
        <div class="tile">
            <div class="info-icon" onmouseenter="showTooltip(event, \`${getCloudBaseInfo()}\`)" onmouseleave="hideTooltip()">ℹ️</div>
            <div class="tile-icon">⛅</div>
            <div class="tile-label">База хмар</div>
            <div class="tile-value">${cloudBase}</div>
            <div class="tile-subtitle">метрів (розрах.)</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">👁️</div>
            <div class="tile-label">Видимість</div>
            <div class="tile-value">${Math.round(h.visibility[now]/1000)}</div>
            <div class="tile-subtitle">км</div>
        </div>
        
        <div class="tile">
            <div class="tile-icon">🌧️</div>
            <div class="tile-label">Опади</div>
            <div class="tile-value">${h.precipitation[now]}</div>
            <div class="tile-subtitle">мм/год</div>
        </div>
    `;
}

function renderTimeline(data, model) {
    if (model === 'windy') return;
    
    const h = data.hourly;
    const scroll = document.getElementById('timelineScroll');
    
    const html = h.time.slice(0, 24).map((time, i) => {
        const date = new Date(time);
        const hour = date.getHours().toString().padStart(2, '0');
        const wind = h.windspeed_10m[i];
        const dir = getWindArrow(h.winddirection_10m[i]);
        const temp = Math.round(h.temperature_2m[i]);
        const icon = getWeatherIcon(h.weathercode[i]);
        
        return `
            <div class="timeline-item ${i === 0 ? 'active' : ''}" data-index="${i}">
                <div class="timeline-hour">${hour}:00</div>
                <div class="timeline-icon">${icon}</div>
                <div class="timeline-wind">
                    <span>${formatWindSpeed(wind)}</span>
                    <span class="wind-arrow">${dir}</span>
                </div>
                <div class="timeline-temp">${temp}°C</div>
            </div>
        `;
    }).join('');
    
    scroll.innerHTML = html;
    
    scroll.querySelectorAll('.timeline-item').forEach((item, idx) => {
        item.addEventListener('click', () => {
            scroll.querySelectorAll('.timeline-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            STATE.currentTimelineIndex = idx;
        });
    });
}

function renderDetailedTable(data, model) {
    if (model === 'windy') return;
    
    const h = data.hourly;
    const tbody = document.getElementById('detailedTableBody');
    const currentHour = new Date().getHours();
    
    const rows = h.time.slice(0, 24).map((time, i) => {
        const date = new Date(time);
        const hour = date.getHours();
        const isCurrent = hour === currentHour;
        const temp = h.temperature_2m[i];
        const humidity = h.relativehumidity_2m[i];
        const dewPoint = h.dewpoint_2m ? h.dewpoint_2m[i] : calculateDewPoint(temp, humidity);
        const cloudBase = calculateCloudBase(temp, dewPoint);
        
        return `
            <tr class="${isCurrent ? 'current-hour' : ''}">
                <td><strong>${hour.toString().padStart(2, '0')}:00</strong></td>
                <td>${formatWindSpeed(h.windspeed_10m[i])} ${getWindSpeedUnit()} ${getWindArrow(h.winddirection_10m[i])}</td>
                <td>${formatWindSpeed(h.windgusts_10m[i])} ${getWindSpeedUnit()}</td>
                <td>1 500+ м</td>
                <td>${Math.round(temp)}°C</td>
                <td>${Math.round(dewPoint)}°C</td>
                <td>${humidity}%</td>
                <td>${h.cloudcover[i]}%</td>
                <td>${cloudBase} м</td>
                <td>${Math.round(h.visibility[i]/1000)} км</td>
                <td>${h.precipitation[i]} мм</td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = rows;
}

// ============================================
// WIND PROFILE
// ============================================
function renderWindProfile() {
    const model = STATE.profileModel;
    const data = STATE.data[model];
    const tbody = document.getElementById('profileTableBody');
    
    if (!data) return;
    
    let rows = '';
    
    if (model === 'windy') {
        const wd = data;
        const levels = {
            '500h': '5500м',
            '600h': '4200м',
            '700h': '3000м',
            '800h': '2000м',
            '850h': '1500м',
            '900h': '1000м',
            '950h': '500м',
            'surface': '10м'
        };
        
        Object.entries(levels).forEach(([lvl, height]) => {
            const wind = calcWind(wd[`wind_u-${lvl}`][0], wd[`wind_v-${lvl}`][0]);
            const temp = wd[`temp-${lvl}`][0] - 273.15;
            
            rows += `
                <tr>
                    <td><strong>${height}</strong> <span class="info-badge">Windy</span></td>
                    <td>${formatWindSpeed(wind.speed)} ${getWindSpeedUnit()} ${getWindArrow(wind.direction)}</td>
                    <td>-</td>
                    <td>${Math.round(wind.direction)}° (${getWindDir(wind.direction)})</td>
                    <td>${Math.round(temp)}°C</td>
                </tr>
            `;
        });
    } else {
        const h = data.hourly;
        const now = getCurrentHourIndex(data);
        
        const levels = [
            { name: '180м', speed: h.windspeed_180m[now], dir: h.winddirection_180m[now], temp: h.temperature_2m[now] },
            { name: '120м', speed: h.windspeed_120m[now], dir: h.winddirection_120m[now], temp: h.temperature_2m[now] },
            { name: '80м', speed: h.windspeed_80m[now], dir: h.winddirection_80m[now], temp: h.temperature_2m[now] },
            { name: '10м', speed: h.windspeed_10m[now], dir: h.winddirection_10m[now], temp: h.temperature_2m[now] }
        ];
        
        levels.forEach(lvl => {
            rows += `
                <tr>
                    <td><strong>${lvl.name}</strong> <span class="info-badge">${model.toUpperCase()}</span></td>
                    <td>${formatWindSpeed(lvl.speed)} ${getWindSpeedUnit()} ${getWindArrow(lvl.dir)}</td>
                    <td>${formatWindSpeed(h.windgusts_10m[now])} ${getWindSpeedUnit()}</td>
                    <td>${Math.round(lvl.dir)}° (${getWindDir(lvl.dir)})</td>
                    <td>${Math.round(lvl.temp)}°C</td>
                </tr>
            `;
        });
    }
    
    tbody.innerHTML = rows;
    renderProfileChart();
}

function renderProfileChart() {
    const ctx = document.getElementById('profileChart');
    if (!ctx) return;
    
    if (STATE.charts.profile) STATE.charts.profile.destroy();
    
    const model = STATE.profileModel;
    const data = STATE.data[model];
    
    let labels = [];
    let speeds = [];
    
    if (model === 'windy') {
        const wd = data;
        const levels = ['surface', '950h', '900h', '850h', '800h', '700h', '600h', '500h'];
        const heights = ['10м', '500м', '1000м', '1500м', '2000м', '3000м', '4200м', '5500м'];
        
        labels = heights;
        speeds = levels.map(lvl => {
            const wind = calcWind(wd[`wind_u-${lvl}`][0], wd[`wind_v-${lvl}`][0]);
            return formatWindSpeed(wind.speed);
        });
    } else {
        const h = data.hourly;
        const now = getCurrentHourIndex(data);
        
        labels = ['10м', '80м', '120м', '180м'];
        speeds = [
            formatWindSpeed(h.windspeed_10m[now]),
            formatWindSpeed(h.windspeed_80m[now]),
            formatWindSpeed(h.windspeed_120m[now]),
            formatWindSpeed(h.windspeed_180m[now])
        ];
    }
    
    STATE.charts.profile = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `Швидкість вітру (${getWindSpeedUnit()})`,
                data: speeds,
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                tension: 0.3,
                fill: true,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

// ============================================
// COMPARISON
// ============================================
function renderComparison() {
    const tbody = document.getElementById('compareTableBody');
    const now = getCurrentHourIndex(STATE.data.gfs);
    
    const params = [
        { name: 'Вітер 10м', key: 'windspeed_10m', unit: ` ${getWindSpeedUnit()}`, wind: true },
        { name: 'Пориви', key: 'windgusts_10m', unit: ` ${getWindSpeedUnit()}`, wind: true },
        { name: 'Температура', key: 'temperature_2m', unit: '°C' },
        { name: 'Точка роси', key: 'dewpoint_2m', unit: '°C', calc: true },
        { name: 'Вологість', key: 'relativehumidity_2m', unit: '%' },
        { name: 'Хмарність', key: 'cloudcover', unit: '%' }
    ];
    
    const rows = params.map(param => {
        let row = `<tr><td><strong>${param.name}</strong></td>`;
        
        ['gfs', 'icon', 'ecmwf'].forEach(model => {
            const data = STATE.data[model];
            if (data && data.hourly && data.hourly[param.key]) {
                let val = data.hourly[param.key][now];
                if (param.wind) val = formatWindSpeed(val);
                row += `<td>${Math.round(val)}${param.unit}</td>`;
            } else if (param.calc) {
                const temp = data.hourly.temperature_2m[now];
                const hum = data.hourly.relativehumidity_2m[now];
                row += `<td>${Math.round(calculateDewPoint(temp, hum))}${param.unit}</td>`;
            } else {
                row += '<td>-</td>';
            }
        });
        
        const wd = STATE.data.windy;
        if (param.name === 'Вітер 10м' && wd) {
            const wind = calcWind(wd['wind_u-surface'][0], wd['wind_v-surface'][0]);
            row += `<td>${formatWindSpeed(wind.speed)} ${getWindSpeedUnit()}</td>`;
        } else if (param.name === 'Температура' && wd) {
            row += `<td>${Math.round(wd['temp-surface'][0] - 273.15)}°C</td>`;
        } else {
            row += '<td>-</td>';
        }
        
        row += '</tr>';
        return row;
    }).join('');
    
    tbody.innerHTML = rows;
    renderComparisonCharts();
}

function renderComparisonCharts() {
    renderComparisonChart('compareWindChart', 'windspeed_10m', 'Вітер', getWindSpeedUnit(), true);
    renderComparisonChart('compareTempChart', 'temperature_2m', 'Температура', '°C', false);
}

function renderComparisonChart(canvasId, dataKey, label, unit, isWind) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
    
    const models = ['gfs', 'icon', 'ecmwf'];
    const colors = { gfs: '#4CAF50', icon: '#2196F3', ecmwf: '#9C27B0' };
    
    const datasets = models.map(model => {
        const data = STATE.data[model];
        if (!data || !data.hourly || !data.hourly[dataKey]) return null;
        
        const values = data.hourly[dataKey].slice(0, 24).map(v => 
            isWind ? formatWindSpeed(v) : Math.round(v)
        );
        
        return {
            label: model.toUpperCase(),
            data: values,
            borderColor: colors[model],
            backgroundColor: colors[model] + '30',
            tension: 0.3,
            borderWidth: 3
        };
    }).filter(d => d !== null);
    
    const labels = Array.from({length: 24}, (_, i) => `${i}:00`);
    
    STATE.charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } },
                title: { display: true, text: `${label} (${unit})`, color: '#fff' }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

// ============================================
// CHARTS
// ============================================
function renderCharts() {
    const model = STATE.currentModel;
    const data = STATE.data[model];
    
    if (!data || model === 'windy') return;
    
    const h = data.hourly;
    const labels = Array.from({length: 24}, (_, i) => `${i}:00`);
    
    renderFlyabilityChart(h, labels);
    renderWindGustsChart(h, labels);
    renderTempDewChart(h, labels);
    renderSimpleChart('humidityChart', labels, h.relativehumidity_2m.slice(0, 24), 'Вологість', '%', '#2196F3');
    renderSimpleChart('cloudChart', labels, h.cloudcover.slice(0, 24), 'Хмарність', '%', '#9E9E9E');
    renderBarChart('precipChart', labels, h.precipitation.slice(0, 24), 'Опади', 'мм/год', '#03A9F4');
}

function renderFlyabilityChart(h, labels) {
    const ctx = document.getElementById('flyabilityChart');
    if (!ctx) return;
    if (STATE.charts.flyability) STATE.charts.flyability.destroy();
    
    const flyable = h.windspeed_10m.slice(0, 24).map((wind, i) => {
        return wind < 15 && h.precipitation[i] === 0 && h.cloudcover[i] < 80 ? 1 : 0;
    });
    
    STATE.charts.flyability = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Можна літати',
                data: flyable,
                backgroundColor: flyable.map(v => v === 1 ? '#4CAF50' : '#F44336')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false, max: 1, min: 0 },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

function renderWindGustsChart(h, labels) {
    const ctx = document.getElementById('windChart');
    if (!ctx) return;
    if (STATE.charts.wind) STATE.charts.wind.destroy();
    
    STATE.charts.wind = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Вітер (${getWindSpeedUnit()})`,
                    data: h.windspeed_10m.slice(0, 24).map(v => formatWindSpeed(v)),
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.2)',
                    tension: 0.3
                },
                {
                    label: `Пориви (${getWindSpeedUnit()})`,
                    data: h.windgusts_10m.slice(0, 24).map(v => formatWindSpeed(v)),
                    borderColor: '#F44336',
                    backgroundColor: 'rgba(244, 67, 54, 0.2)',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

function renderTempDewChart(h, labels) {
    const ctx = document.getElementById('tempChart');
    if (!ctx) return;
    if (STATE.charts.temp) STATE.charts.temp.destroy();

    const temps = h.temperature_2m.slice(0, 24).map(v => Math.round(v));
    const dewPoints = h.dewpoint_2m 
        ? h.dewpoint_2m.slice(0, 24).map(v => Math.round(v))
        : temps.map((t, i) => Math.round(calculateDewPoint(t, h.relativehumidity_2m[i])));
    
    STATE.charts.temp = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Температура (°C)',
                    data: temps,
                    borderColor: '#FF5722',
                    backgroundColor: 'rgba(255, 87, 34, 0.2)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Точка роси (°C)',
                    data: dewPoints,
                    borderColor: '#00BCD4',
                    backgroundColor: 'rgba(0, 188, 212, 0.2)',
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

function renderSimpleChart(canvasId, labels, data, label, unit, color) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
    
    STATE.charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `${label} (${unit})`,
                data: data.map(v => Math.round(v)),
                borderColor: color,
                backgroundColor: color + '30',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

function renderBarChart(canvasId, labels, data, label, unit, color) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (STATE.charts[canvasId]) STATE.charts[canvasId].destroy();
    
    STATE.charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: `${label} (${unit})`,
                data: data.map(v => Math.round(v * 10) / 10),
                backgroundColor: color
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#fff' } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } },
                x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#fff' } }
            }
        }
    });
}

// ============================================
// TIMELINE CONTROLS
// ============================================
function scrollTimeline(direction) {
    const scroll = document.getElementById('timelineScroll');
    scroll.scrollBy({ left: direction * 336, behavior: 'smooth' });
}

function toggleAutoPlay() {
    const btn = document.getElementById('autoPlayBtn');
    
    if (STATE.autoPlayInterval) {
        clearInterval(STATE.autoPlayInterval);
        STATE.autoPlayInterval = null;
        btn.textContent = '▶️ Auto Play';
        btn.classList.remove('active');
    } else {
        STATE.autoPlayInterval = setInterval(() => scrollTimeline(1), 2000);
        btn.textContent = '⏸️ Зупинити';
        btn.classList.add('active');
    }
}

// ============================================
// UTILITY
// ============================================
function getCurrentHourIndex(data) {
    if (!data || !data.hourly) return 0;
    const now = new Date().getHours();
    const idx = data.hourly.time.findIndex(t => new Date(t).getHours() === now);
    return idx >= 0 ? idx : 0;
}

function calcWind(u, v) {
    const speed = Math.sqrt(u * u + v * v) * 3.6;
    const direction = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
    return { speed, direction };
}

function getWindArrow(deg) {
    const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
    return arrows[Math.round(deg / 45) % 8];
}

function getWindDir(deg) {
    const dirs = ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'];
    return dirs[Math.round(deg / 45) % 8];
}

function getWeatherIcon(code) {
    const icons = {
        0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
        45: '🌫️', 48: '🌫️',
        51: '🌧️', 53: '🌧️', 55: '🌧️',
        61: '🌧️', 63: '🌧️', 65: '🌧️',
        71: '🌨️', 73: '🌨️', 75: '🌨️',
        80: '🌦️', 81: '🌧️', 82: '⛈️',
        95: '⛈️', 96: '⛈️', 99: '⛈️'
    };
    return icons[code] || '🌤️';
}

function getWeatherText(code) {
    const texts = {
        0: 'Ясно', 1: 'Переважно ясно', 2: 'Хмарно', 3: 'Похмуро',
        45: 'Туман', 48: 'Туман',
        51: 'Мряка', 53: 'Дощ', 55: 'Сильний дощ',
        61: 'Дощ', 63: 'Дощ', 65: 'Сильний дощ',
        71: 'Сніг', 73: 'Сніг', 75: 'Сильний сніг',
        80: 'Злива', 81: 'Злива', 82: 'Гроза',
        95: 'Гроза', 96: 'Гроза', 99: 'Гроза'
    };
    return texts[code] || 'Хмарно';
}

// ============================================
// AUTO REFRESH
// ============================================
setInterval(() => {
    if (STATE.settings.autoRefresh) {
        console.log('🔄 Автооновлення');
        loadAllData();
    }
}, 15 * 60 * 1000);

console.log('✅ UAV Forecast Pro v3 готовий!');
