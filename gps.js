// ═══════════════════════════════════════════
// GPS — Tracking y validación de ubicación
// ═══════════════════════════════════════════
const FINCA_CENTER = { lat: 6.122428, lng: -75.437225 };
const FINCA_RADIUS_M = 1500; // Radio de la finca en metros
const BLOQUE_RADIUS_M = 150; // Radio válido por bloque
const GPS_INTERVAL_MS = 300000; // 5 minutos

let gpsWatchId = null;
let gpsTrackInterval = null;
let currentPosition = null;
let gpsActive = false;

function initGPS() {
  if (!navigator.geolocation) {
    console.warn('GPS no disponible');
    return false;
  }
  gpsActive = true;
  
  // Watch continuo
  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      currentPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: Date.now()
      };
      updateGPSIndicator(true);
    },
    err => {
      console.warn('GPS error:', err);
      updateGPSIndicator(false);
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
  );

  // Registrar punto cada 5 min
  gpsTrackInterval = setInterval(() => {
    if (currentPosition) saveGPSPoint('auto');
  }, GPS_INTERVAL_MS);

  return true;
}

function stopGPS() {
  if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
  if (gpsTrackInterval) clearInterval(gpsTrackInterval);
  gpsActive = false;
  updateGPSIndicator(false);
}

async function saveGPSPoint(tipo, bloque) {
  if (!currentPosition) return null;
  const punto = {
    lat: currentPosition.lat,
    lng: currentPosition.lng,
    accuracy: currentPosition.accuracy,
    fecha: new Date().toISOString(),
    tipo: tipo, // 'auto', 'lectura', 'radiometria'
    bloque: bloque || null,
    operario: window.currentOperario || '',
    enFinca: isInsideFinca(currentPosition.lat, currentPosition.lng),
  };
  await dbAdd('gps_puntos', punto);
  await addToSyncQueue('gps', punto);
  return punto;
}

async function saveGPSWithValidation(bloque) {
  if (!currentPosition) return { valid: false, msg: 'GPS no disponible', punto: null };
  
  const punto = await saveGPSPoint('lectura', bloque);
  const enFinca = isInsideFinca(currentPosition.lat, currentPosition.lng);
  
  return {
    valid: enFinca,
    msg: enFinca ? 'Ubicación verificada' : 'Fuera del área de la finca',
    punto,
    distance: distToFinca(currentPosition.lat, currentPosition.lng)
  };
}

function isInsideFinca(lat, lng) {
  return haversineM(lat, lng, FINCA_CENTER.lat, FINCA_CENTER.lng) <= FINCA_RADIUS_M;
}

function distToFinca(lat, lng) {
  return Math.round(haversineM(lat, lng, FINCA_CENTER.lat, FINCA_CENTER.lng));
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getCurrentPosition() {
  return currentPosition;
}

function isGPSActive() {
  return gpsActive && currentPosition !== null;
}

function updateGPSIndicator(active) {
  const dot = document.getElementById('gps-dot');
  const txt = document.getElementById('gps-text');
  if (dot) dot.style.background = active ? '#9FE1CB' : '#E24B4A';
  if (txt) txt.textContent = active ? 'GPS activo' : 'Sin GPS';
}

async function getGPSHistory(fecha) {
  const all = await dbGetAll('gps_puntos');
  if (!fecha) return all;
  const day = fecha.split('T')[0];
  return all.filter(p => p.fecha.startsWith(day));
}
