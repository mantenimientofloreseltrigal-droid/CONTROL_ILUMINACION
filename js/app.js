// ═══════════════════════════════════════════
// Fotoperiodo PWA — App principal
// Finca Olas · Control de Procesos
// ═══════════════════════════════════════════

// ── CONFIGURACIÓN DE CONEXIÓN ─────────────
const SCRIPT_URL = 'TU_URL_DE_APPS_SCRIPT_AQUI'; 

// ── CONFIGURACIÓN LOCAL ───────────────────
const CONFIG = {
  finca: 'Finca Olas',
  centro: { lat: 6.122428, lng: -75.437225 },
  horoMinimo: 2.0, // Alerta si el avance es menor a 2 horas
  pines: {
    '1234': { rol: 'operario', nombre: 'Operario' },
    '5678': { rol: 'supervisor', nombre: 'Supervisor' },
    '9999': { rol: 'gerente', nombre: 'Gerente' }
  },
  radioRangos: {
    'µmol/m²/s': { min: 1.5, max: 80, label: 'PAR' },
    'Lux': { min: 1000, max: 6000, label: 'Lux' }
  }
};

// ── ESTADO GLOBAL ─────────────────────────
let DATOS_LUCES = [];
let CATALOGO_VARIEDADES = [];
let PLAN_SIEMBRAS = [];
let BLOQUES_ACTIVOS = [];

let currentOperario = '';
let currentRol = '';
let bloqueActual = null;
let ladoSeleccionado = 'A';
let camaSeleccionada = null;
let medicionesRad = {};
let lecturasPendientes = {};

// ── UTILIDADES DE FECHA Y SEMANA ──────────
function obtenerSemanaActual() {
  const d = new Date();
  const anio = String(d.getFullYear()).substring(2);
  const unoEne = new Date(d.getFullYear(), 0, 1);
  const sem = Math.ceil((((d - unoEne) / 86400000) + unoEne.getDay() + 1) / 7);
  return anio + String(sem).padStart(2, '0'); // Ejemplo: "2617"
}

function hoyStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtFecha(f) {
  if (!f) return '—';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

// ── CARGA DINÁMICA DE DATOS (GET) ──────────
async function actualizarCatalogos() {
  const semLabel = obtenerSemanaActual();
  const hdrSemana = document.getElementById('hdr-semana');
  if (hdrSemana) hdrSemana.textContent = "Semana " + semLabel;

  if (navigator.onLine) {
    try {
      const res = await fetch(SCRIPT_URL);
      const data = await res.json();
      
      DATOS_LUCES = data.camas || [];
      CATALOGO_VARIEDADES = data.variedades || [];
      PLAN_SIEMBRAS = data.plan || [];

      // Guardar en persistencia local (IndexedDB)
      await setConfig('DATOS_LUCES', DATOS_LUCES);
      await setConfig('CATALOGO_VARIEDADES', CATALOGO_VARIEDADES);
      await setConfig('PLAN_SIEMBRAS', PLAN_SIEMBRAS);

      renderUI();
    } catch (e) {
      console.warn("Error de conexión, usando datos locales");
      cargarDatosLocales();
    }
  } else {
    cargarDatosLocales();
  }
}

async function cargarDatosLocales() {
  DATOS_LUCES = await getConfig('DATOS_LUCES') || [];
  CATALOGO_VARIEDADES = await getConfig('CATALOGO_VARIEDADES') || [];
  PLAN_SIEMBRAS = await getConfig('PLAN_SIEMBRAS') || [];
  renderUI();
}

function renderUI() {
  BLOQUES_ACTIVOS = [...new Set(DATOS_LUCES.map(c => parseInt(c.bl)))].sort((a, b) => a - b);
  
  // Llenar selector de bloques en módulo Siembra
  const sBloque = document.getElementById('s-bloque');
  if (sBloque) {
    sBloque.innerHTML = '<option value="">Seleccione bloque...</option>';
    for (let i = 1; i <= 50; i++) {
      sBloque.innerHTML += `<option value="${i}">Bloque ${i}</option>`;
    }
  }

  // FILTRADO DE VARIEDADES POR SEMANA (Estructura 3 columnas)
  const semActual = obtenerSemanaActual();
  const sVar = document.getElementById('s-variedad');
  
  if (sVar) {
    const variedadesSemana = PLAN_SIEMBRAS
      .filter(p => String(p.Semana) === semActual && parseFloat(p.Cantidad) > 0)
      .map(p => p.Variedad);

    const filtradas = CATALOGO_VARIEDADES.filter(v => variedadesSemana.includes(v.Variedad));

    if (filtradas.length === 0) {
      sVar.innerHTML = '<option value="">Sin programación para sem ' + semActual + '</option>';
    } else {
      sVar.innerHTML = filtradas.map(v => 
        `<option value="${v.Noches}">${v.Variedad} (${v.Noches}n)</option>`
      ).join('');
    }
  }
  
  buildInicio();
}

// ── MÓDULO: SIEMBRA (MAPA VISUAL) ──────────
function cambiarLado(l) {
  ladoSeleccionado = l;
  document.getElementById('btn-ladoA').classList.toggle('sel', l === 'A');
  document.getElementById('btn-ladoB').classList.toggle('sel', l === 'B');
  renderMapaCamas();
}

function renderMapaCamas() {
  const bl = document.getElementById('s-bloque').value;
  const grid = document.getElementById('mapa-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!bl) return;

  // Se asumen 40 camas por bloque para la rejilla visual
  for (let i = 1; i <= 40; i++) {
    const camaActiva = DATOS_LUCES.find(c => c.bl == bl && c.cm == i && c.lado == ladoSeleccionado);
    const btn = document.createElement('div');
    btn.className = `c-cel ${camaActiva ? 'on' : ''} ${camaSeleccionada == i ? 'sel-rad' : ''}`;
    btn.textContent = i + ladoSeleccionado;
    
    if (!camaActiva) {
      btn.onclick = () => { camaSeleccionada = i; renderMapaCamas(); };
    } else {
      btn.title = `Variedad: ${camaActiva.variedad}`;
    }
    grid.appendChild(btn);
  }
}

async function guardarNuevaSiembra() {
  const bl = document.getElementById('s-bloque').value;
  const selector = document.getElementById('s-variedad');
  if (!selector.value) return;
  
  const noches = parseInt(selector.value);
  const varNombre = selector.options[selector.selectedIndex].text.split(' (')[0];
  const msg = document.getElementById('msg-siembra');

  if (!bl || !camaSeleccionada) {
    msg.textContent = "Seleccione Bloque y Cama en el mapa.";
    msg.className = "msg err"; return;
  }

  const hoy = new Date();
  const retiro = new Date();
  retiro.setDate(hoy.getDate() + noches);

  const data = {
    bl: bl,
    cm: camaSeleccionada,
    lado: ladoSeleccionado,
    cm_orig: String(camaSeleccionada).padStart(3, '0') + ladoSeleccionado,
    inic_luces: hoy.toISOString().split('T')[0],
    ret_luces: retiro.toISOString().split('T')[0],
    fecha_sie: hoy.toISOString().split('T')[0],
    sem_sie: obtenerSemanaActual(),
    luces: noches,
    variedad: varNombre
  };

  await addToSyncQueue('nueva_siembra', data);
  msg.textContent = "¡Cama activada! Sincronizando con Excel...";
  msg.className = "msg ok";
  
  camaSeleccionada = null;
  setTimeout(() => {
    actualizarCatalogos();
    irBloques();
  }, 1500);
}

// ── MÓDULO: HORÓMETROS Y ALERTAS ──────────
async function guardarHoro(b, hid) {
  const inp = document.getElementById('inp-' + b + '-' + hid);
  const msg = document.getElementById('msg-' + b + '-' + hid);
  if (!inp.value) return;

  const val = parseFloat(inp.value);
  const key = b + '_' + hid;
  const lectAyer = lecturasPendientes[key + '_ayer'] || 0;
  const diff = val - lectAyer;

  const gpsResult = await saveGPSWithValidation(b);

  const lectura = {
    bloque: b, horometro: hid, lectura: val,
    operario: currentOperario, fecha: new Date().toISOString(),
    gps: gpsResult.punto, gpsValido: gpsResult.valid
  };

  await dbAdd('lecturas', lectura);
  await addToSyncQueue('lectura', lectura);

  let msgText = `Guardado. Avance: ${diff.toFixed(2)}h.`;
  if (diff < CONFIG.horoMinimo) msgText += " ⚠ ALERTA: Avance menor a 2h.";
  
  msg.textContent = msgText;
  msg.className = diff < CONFIG.horoMinimo ? "msg err" : "msg ok";
  
  trySyncData();
}

// ── NAVEGACIÓN Y OTROS ────────────────────
function irSiembra() { 
  showScreen('sc-siembra'); 
  setNavSel('nb-siembra'); 
  renderMapaCamas(); 
}

function irBloques() { showScreen('sc-inicio'); setNavSel('nb-bloques'); }

function irHistorialGlobal() { 
  showScreen('sc-historial-global'); 
  setNavSel('nb-historial');
  renderHistorialGlobal();
}

async function renderHistorialGlobal() {
  const lecturas = await dbGetAll('lecturas');
  lecturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  
  let html = '<div class="sec-lbl">Historial de Lecturas</div>';
  lecturas.forEach(l => {
    html += `<div class="card" style="margin-bottom:8px">
      <div class="card-name">Bloque ${l.bloque} - ${l.horometro}</div>
      <div class="card-sub">${fmtFecha(l.fecha.split('T')[0])} - ${l.lectura}h</div>
    </div>`;
  });
  document.getElementById('historial-global-content').innerHTML = html;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  document.getElementById(id).classList.add('show');
}

function setNavSel(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById(id).classList.add('sel');
}

// ── SINCRONIZACIÓN (POST) ──────────────────
async function trySyncData() {
  if (!navigator.onLine) return;
  const queue = await getSyncQueue();
  for (let item of queue) {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(item)
      });
      const result = await res.json();
      if (result.status === 'ok') await dbDelete('sync_queue', item.id);
    } catch (e) { break; }
  }
}

// ── INICIALIZACIÓN ────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

actualizarCatalogos();
