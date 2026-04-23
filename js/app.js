// ═══════════════════════════════════════════
// Fotoperiodo PWA — App principal
// Finca Olas · Control de Procesos
// ═══════════════════════════════════════════

// ── CONFIGURACIÓN DE CONEXIÓN ─────────────
const SCRIPT_URL = 'TU_URL_DE_APPS_SCRIPT_AQUI'; 

// ── CONFIGURACIÓN LOCAL ───────────────────
const CONFIG = {
  horoMinimo: 2.0,
  pines: {
    '1234': { rol: 'operario', nombre: 'Operario' },
    '5678': { rol: 'supervisor', nombre: 'Supervisor' },
    '9999': { rol: 'gerente', nombre: 'Gerente' }
  },
  turnos: [
    { id: 'H1', inicio: '21:00', fin: '03:00' },
    { id: 'H2', inicio: '21:10', fin: '03:10' },
    { id: 'H3', inicio: '21:20', fin: '03:20' }
  ]
};

// ── ESTADO GLOBAL ─────────────────────────
let DATOS_LUCES = [];
let CATALOGO_VARIEDADES = [];
let PLAN_SIEMBRAS = [];
let BLOQUES_ACTIVOS = [];
let BLOQUES_DATA = {};

let currentOperario = '';
let currentRol = '';
let bloqueActual = null;
let ladoSeleccionado = 'A';
let camaSeleccionada = null;
let lecturasPendientes = {};

// ── FECHAS Y SEMANAS ──────────────────────
function obtenerSemanaActual() {
  const d = new Date();
  const anio = String(d.getFullYear()).substring(2);
  const unoEne = new Date(d.getFullYear(), 0, 1);
  const sem = Math.ceil((((d - unoEne) / 86400000) + unoEne.getDay() + 1) / 7);
  return anio + String(sem).padStart(2, '0');
}

function fechaHoyLarga() {
  const d = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return dias[d.getDay()]+', '+d.getDate()+' de '+meses[d.getMonth()]+' '+d.getFullYear();
}

function fmtFecha(f) {
  if (!f) return '—';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

// ── LOGIN ─────────────────────────────────
function initLogin() {
  document.getElementById('login-date').textContent = fechaHoyLarga();
}

function intentarLogin() {
  const nombre = document.getElementById('login-nombre').value.trim();
  const pin = Array.from(document.querySelectorAll('.login-pin')).map(i => i.value).join('');

  if (!nombre) { showLoginError('Escribe tu nombre'); return; }
  if (pin.length < 4) { showLoginError('Ingresa el PIN'); return; }

  const pinConfig = CONFIG.pines[pin];
  if (!pinConfig) { showLoginError('PIN incorrecto'); return; }

  currentOperario = nombre;
  currentRol = pinConfig.rol;

  document.getElementById('u-initials').textContent = nombre.split(' ').map(w => w[0].toUpperCase()).slice(0,2).join('');
  document.getElementById('u-name').textContent = nombre.split(' ')[0];
  document.getElementById('hdr-date').textContent = fechaHoyLarga();
  
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');

  actualizarCatalogos();
  checkOnlineStatus();
}

function showLoginError(msg) {
  const el = document.getElementById('login-err');
  el.textContent = msg; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function pinInput(el, idx) {
  if (el.value.length === 1 && idx < 3) {
    document.querySelectorAll('.login-pin')[idx + 1].focus();
  }
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('login-nombre').value = '';
  document.querySelectorAll('.login-pin').forEach(i => i.value = '');
}

// ── DESCARGA DE DATOS ─────────────────────
async function actualizarCatalogos() {
  const semLabel = obtenerSemanaActual();
  document.getElementById('hdr-semana').textContent = "Semana " + semLabel;

  if (navigator.onLine) {
    try {
      const res = await fetch(SCRIPT_URL);
      const data = await res.json();
      
      DATOS_LUCES = data.camas || [];
      CATALOGO_VARIEDADES = data.variedades || [];
      PLAN_SIEMBRAS = data.plan || [];

      await setConfig('DATOS_LUCES', DATOS_LUCES);
      await setConfig('CATALOGO_VARIEDADES', CATALOGO_VARIEDADES);
      await setConfig('PLAN_SIEMBRAS', PLAN_SIEMBRAS);
      renderUI();
    } catch (e) { cargarDatosLocales(); }
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

function procesarDatos() {
  const bloques = {};
  DATOS_LUCES.forEach(r => {
    const b = r.bl;
    if (!bloques[b]) bloques[b] = { camas: [], total: 0 };
    bloques[b].camas.push(r);
    bloques[b].total++;
  });
  BLOQUES_DATA = bloques;
  BLOQUES_ACTIVOS = Object.keys(BLOQUES_DATA).map(Number).sort((a, b) => a - b);
}

function renderUI() {
  procesarDatos();
  
  const sBloque = document.getElementById('s-bloque');
  if (sBloque) {
    sBloque.innerHTML = '<option value="">Seleccione bloque...</option>';
    for (let i = 1; i <= 50; i++) {
      sBloque.innerHTML += `<option value="${i}">Bloque ${i}</option>`;
    }
  }

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

function buildInicio() {
  const ga = document.getElementById('grid-activos');
  if (!ga) return;
  ga.innerHTML = '';
  let totalCamas = 0;

  BLOQUES_ACTIVOS.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'blq-btn activo';
    const cam = BLOQUES_DATA[String(b)].total;
    totalCamas += cam;

    btn.innerHTML = `<span class="blq-num">B${b}</span><span class="blq-sub">${cam}c</span>`;
    btn.onclick = () => abrirBloque(b);
    ga.appendChild(btn);
  });

  document.getElementById('cnt-act').textContent = BLOQUES_ACTIVOS.length;
  document.getElementById('cnt-luc').textContent = totalCamas;
}

// ── MÓDULO SIEMBRA ────────────────────────
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
    msg.className = "msg err"; msg.style.display = 'block'; return;
  }

  const hoy = new Date();
  const retiro = new Date();
  retiro.setDate(hoy.getDate() + noches);

  const data = {
    bl: bl, cm: camaSeleccionada, lado: ladoSeleccionado,
    cm_orig: String(camaSeleccionada).padStart(3, '0') + ladoSeleccionado,
    inic_luces: hoy.toISOString().split('T')[0],
    ret_luces: retiro.toISOString().split('T')[0],
    fecha_sie: hoy.toISOString().split('T')[0],
    sem_sie: obtenerSemanaActual(),
    luces: noches, variedad: varNombre
  };

  await addToSyncQueue('nueva_siembra', data);
  msg.textContent = "¡Cama activada! Sincronizando...";
  msg.className = "msg ok"; msg.style.display = 'block';
  
  camaSeleccionada = null;
  setTimeout(() => {
    msg.style.display = 'none';
    actualizarCatalogos();
    irBloques();
  }, 2000);
}

// ── HORÓMETROS Y DETALLE ──────────────────
function getBloqueInfo(b) {
  const data = BLOQUES_DATA[String(b)];
  if (!data) return null;
  const naves = new Set(data.camas.map(c => Math.ceil(c.cm / 4)));
  return { naves: naves.size, totalCamas: data.total, camas: data.camas, horos: calcularHorometros(b, data.camas) };
}

function calcularHorometros(bloque, camas) {
  const MAX_NAVES = 6;
  const navesSet = new Set(camas.map(c => Math.ceil(c.cm / 4)));
  const nNaves = Math.max(...navesSet);
  let grupos = [], inicio = 1;

  while (inicio <= nNaves) {
    const fin = Math.min(inicio + MAX_NAVES - 1, nNaves);
    grupos.push({ inicio, fin });
    inicio = fin + 1;
  }

  if (grupos.length >= 2) {
    const ultimo = grupos[grupos.length - 1];
    if ((ultimo.fin - ultimo.inicio + 1) === 1) {
      grupos[grupos.length - 2].fin = ultimo.fin;
      grupos.pop();
    }
  }

  const horos = [];
  grupos.forEach((g, h) => {
    const turno = CONFIG.turnos[h % CONFIG.turnos.length];
    const camasH = camas.filter(c => { const n = Math.ceil(c.cm / 4); return n >= g.inicio && n <= g.fin; });
    horos.push({
      id: 'H' + (h + 1), naves: g.inicio + '–' + g.fin,
      turno: turno.inicio + '–' + turno.fin, min: CONFIG.horoMinimo,
      camasOn: camasH.map(c => c.cm + '-' + c.lado)
    });
  });
  return horos;
}

function abrirBloque(b) {
  bloqueActual = b;
  const info = getBloqueInfo(b);
  if (!info) return;

  showScreen('sc-detalle');
  document.getElementById('det-title').textContent = 'Bloque ' + b;
  renderHoros(b, info);
}

function renderHoros(b, info) {
  let html = '';
  info.horos.forEach(h => {
    html += `<div class="card">
      <div class="card-top"><div class="card-name">${h.id}</div><div class="badge b-ok">Naves ${h.naves}</div></div>
      <div class="turno-chip"><span class="tc-k">Turno</span><span class="tc-v">${h.turno}</span></div>
      <div class="field"><label>Lectura hoy (Acumulado)</label>
      <input type="number" step="0.1" inputmode="decimal" id="inp-${b}-${h.id}"></div>
      <button class="btn-g" onclick="guardarHoro(${b},'${h.id}')">Guardar</button>
      <div class="msg" id="msg-${b}-${h.id}"></div>
    </div>`;
  });
  document.getElementById('dv-horometros').innerHTML = html;
}

async function guardarHoro(b, hid) {
  const inp = document.getElementById('inp-' + b + '-' + hid);
  const msg = document.getElementById('msg-' + b + '-' + hid);
  if (!inp.value) return;

  const val = parseFloat(inp.value);
  const gpsResult = typeof saveGPSWithValidation === 'function' ? await saveGPSWithValidation(b) : {punto:{lat:0,lng:0}, valid:true};

  const lectura = {
    bloque: b, horometro: hid, lectura: val,
    operario: currentOperario, observacion: '',
    fecha: new Date().toISOString(),
    gps: gpsResult.punto, gpsValido: gpsResult.valid
  };

  await dbAdd('lecturas', lectura);
  await addToSyncQueue('lectura', lectura);

  msg.textContent = `Guardado: ${val}h. Sincronizando...`;
  msg.className = "msg ok"; msg.style.display = 'block';
  inp.value = '';
  trySyncData();
}

// ── NAVEGACIÓN Y SINCRONIZACIÓN ───────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  document.getElementById(id).classList.add('show');
}
function setNavSel(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById(id).classList.add('sel');
}
function irSiembra() { showScreen('sc-siembra'); setNavSel('nb-siembra'); renderMapaCamas(); }
function irBloques() { showScreen('sc-inicio'); setNavSel('nb-bloques'); }
function volver() { irBloques(); }

async function irHistorialGlobal() { 
  showScreen('sc-historial-global'); setNavSel('nb-historial');
  const lecturas = await dbGetAll('lecturas');
  lecturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  let html = '';
  lecturas.forEach(l => {
    html += `<div class="card" style="margin-bottom:8px">
      <div class="card-name">Bloque ${l.bloque} - ${l.horometro}</div>
      <div class="card-sub" style="font-size:12px;color:var(--ts)">${fmtFecha(l.fecha.split('T')[0])} | Operario: ${l.operario}</div>
      <div style="font-size:16px;font-weight:bold;color:var(--verde-m);margin-top:5px;">${l.lectura} h</div>
    </div>`;
  });
  document.getElementById('historial-global-content').innerHTML = html || '<div class="empty">Sin lecturas.</div>';
}

function checkOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  const syncDot = document.getElementById('sync-dot');
  const syncText = document.getElementById('sync-text');

  if (navigator.onLine) {
    banner.classList.remove('show');
    if (syncDot) syncDot.style.background = '#9FE1CB';
    if (syncText) syncText.textContent = 'Online';
    trySyncData();
  } else {
    banner.classList.add('show');
    if (syncDot) syncDot.style.background = '#EF9F27';
    if (syncText) syncText.textContent = 'Offline';
  }
}

window.addEventListener('online', checkOnlineStatus);
window.addEventListener('offline', checkOnlineStatus);

async function trySyncData() {
  if (!navigator.onLine) return;
  const queue = await getSyncQueue();
  for (let item of queue) {
    try {
      const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(item) });
      const result = await res.json();
      if (result.status === 'ok') await dbDelete('sync_queue', item.id);
    } catch (e) { break; }
  }
}

// ── INIT ──────────────────────────────────
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
initLogin();
