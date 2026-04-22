// ═══════════════════════════════════════════
// Fotoperiodo PWA — App principal
// Finca Olas · Integración con Apps Script
// ═══════════════════════════════════════════

// ── CONFIGURACIÓN DE CONEXIÓN ─────────────
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwlzQHvFFlerxzcAV5MB2V81hNHnRXKO3ibZ0_YiHgXsaC8apR1Yopid3LW2ojbfSEog/exec'; // <-- PEGA AQUÍ TU URL

// ── CONFIGURACIÓN LOCAL ───────────────────
const CONFIG = {
  finca: 'Finca Olas',
  centro: { lat: 6.122428, lng: -75.437225 },
  horoMinimo: 1.0,
  radioRangos: {
    'µmol/m²/s': { min: 1.5, max: 80, label: 'PAR' },
    'Lux': { min: 1000, max: 6000, label: 'Lux' },
    'Candela': { min: 500, max: 3000, label: 'cd' },
    'W/m²': { min: 2, max: 20, label: 'W/m²' }
  },
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

// ── ESTADO GLOBAL Y DATOS DINÁMICOS ───────
let DATOS_LUCES = [];
let BLOQUES_DATA = {};
let BLOQUES_ACTIVOS = [];

let currentOperario = '';
let currentRol = '';
let bloqueActual = null;
let unidadActual = 'µmol/m²/s';
let camasSelRad = {};
let medicionesRad = {};
let lecturasPendientes = {};

// ── PROCESAR DATOS ────────────────────────
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

// ── DESCARGAR CATALOGO DE CAMAS (GET) ─────
async function actualizarCatalogo() {
  const cached = await getConfig('DATOS_LUCES');
  if (cached) {
    DATOS_LUCES = cached;
    procesarDatos();
  }

  if (navigator.onLine) {
    try {
      const res = await fetch(SCRIPT_URL);
      const data = await res.json();
      if (data && data.length > 0) {
        DATOS_LUCES = data;
        await setConfig('DATOS_LUCES', data);
        procesarDatos();
        
        if (document.getElementById('app-shell').classList.contains('active')) {
          buildInicio(); 
        }
      }
    } catch (e) {
      console.warn('Error descargando catálogo, usando versión offline', e);
    }
  }
}

// Llamamos a la actualización al abrir la app
actualizarCatalogo();

// ── LÓGICA DE BLOQUES ─────────────────────
function getBloqueInfo(b) {
  const data = BLOQUES_DATA[String(b)];
  if (!data) return null;
  const naves = new Set(data.camas.map(c => Math.ceil(c.cm / 4)));
  return {
    naves: naves.size,
    totalCamas: data.total,
    camas: data.camas,
    horos: calcularHorometros(b, data.camas)
  };
}

function calcularHorometros(bloque, camas) {
  const MAX_NAVES = 6;
  const navesSet = new Set(camas.map(c => Math.ceil(c.cm / 4)));
  const nNaves = Math.max(...navesSet);

  let grupos = [];
  let inicio = 1;
  while (inicio <= nNaves) {
    const fin = Math.min(inicio + MAX_NAVES - 1, nNaves);
    grupos.push({ inicio, fin });
    inicio = fin + 1;
  }

  if (grupos.length >= 2) {
    const ultimo = grupos[grupos.length - 1];
    const navesUltimo = ultimo.fin - ultimo.inicio + 1;
    if (navesUltimo === 1) {
      const penultimo = grupos[grupos.length - 2];
      penultimo.fin = ultimo.fin;
      grupos.pop();
    }
  }

  const horos = [];
  grupos.forEach((g, h) => {
    const turno = CONFIG.turnos[h % CONFIG.turnos.length];
    const camasH = camas.filter(c => {
      const nave = Math.ceil(c.cm / 4);
      return nave >= g.inicio && nave <= g.fin;
    });
    horos.push({
      id: 'H' + (h + 1),
      naves: g.inicio + '–' + g.fin,
      navCount: g.fin - g.inicio + 1,
      turno: turno.inicio + '–' + turno.fin,
      min: CONFIG.horoMinimo,
      camasOn: camasH.map(c => c.cm + '-' + c.lado),
      camasData: camasH,
      lectAyer: null
    });
  });
  return horos;
}

// ── FECHA UTILS ───────────────────────────
function hoyStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtFecha(f) {
  if (!f) return '—';
  const [y,m,d] = f.split('-');
  return d+'/'+m+'/'+y;
}
function diasEntre(f1, f2) {
  return Math.ceil((new Date(f2) - new Date(f1)) / 86400000);
}
function diasRestantes(fechaFin) {
  return diasEntre(hoyStr(), fechaFin);
}
function fechaHoyLarga() {
  const d = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return dias[d.getDay()]+', '+d.getDate()+' de '+meses[d.getMonth()]+' '+d.getFullYear();
}
function semanaActual() {
  const d = new Date();
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
}

// ── LOGIN ─────────────────────────────────
function initLogin() {
  document.getElementById('login-date').textContent = fechaHoyLarga();
}

function intentarLogin() {
  const nombre = document.getElementById('login-nombre').value.trim();
  const pin = Array.from(document.querySelectorAll('.login-pin')).map(i => i.value).join('');

  if (!nombre) {
    showLoginError('Escribe tu nombre');
    return;
  }
  if (pin.length < 4) {
    showLoginError('Ingresa el PIN de 4 dígitos');
    return;
  }

  const pinConfig = CONFIG.pines[pin];
  if (!pinConfig) {
    showLoginError('PIN incorrecto');
    return;
  }

  currentOperario = nombre;
  currentRol = pinConfig.rol;
  window.currentOperario = nombre;

  document.getElementById('u-initials').textContent =
    nombre.split(' ').map(w => w[0].toUpperCase()).slice(0,2).join('');
  document.getElementById('u-name').textContent = nombre.split(' ')[0];
  document.getElementById('hdr-date').textContent = fechaHoyLarga();
  document.getElementById('hdr-semana').textContent = 'Semana ' + semanaActual();

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');

  initGPS();
  buildInicio();
  checkOnlineStatus();
}

function showLoginError(msg) {
  const el = document.getElementById('login-err');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function pinInput(el, idx) {
  if (el.value.length === 1 && idx < 3) {
    document.querySelectorAll('.login-pin')[idx + 1].focus();
  }
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  stopGPS();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('login-nombre').value = '';
  document.querySelectorAll('.login-pin').forEach(i => i.value = '');
}

// ── ONLINE STATUS Y SINCRONIZACIÓN ────────
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

let isSyncing = false;

async function trySyncData() {
  if (isSyncing || !navigator.onLine) return;
  isSyncing = true;

  const queue = await getSyncQueue();
  if (queue.length === 0) {
    isSyncing = false;
    return;
  }

  const syncText = document.getElementById('sync-text');
  if (syncText) syncText.textContent = `Sincronizando (${queue.length})...`;

  for (let item of queue) {
    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          id: item.id,
          type: item.type,
          data: item.data
        })
      });
      
      const result = await response.json();
      if (result.status === 'ok') {
        await dbDelete('sync_queue', item.id);
      }
    } catch (error) {
      console.error('Error sincronizando', error);
      break; 
    }
  }

  if (syncText) syncText.textContent = 'Online';
  isSyncing = false;
}

// ── INICIO (BLOQUES ACTIVOS) ──────────────
function buildInicio() {
  const ga = document.getElementById('grid-activos');
  const gi = document.getElementById('grid-inactivos');
  ga.innerHTML = ''; gi.innerHTML = '';
  let totalCamas = 0, totalAlertas = 0;

  const hoy = hoyStr();
  const alertasBloques = new Set();
  DATOS_LUCES.forEach(r => {
    const dr = diasRestantes(r.ret_luces);
    if (dr <= 2 && dr >= -1) alertasBloques.add(r.bl);
  });

  for (let b = 1; b <= 50; b++) {
    const isActivo = BLOQUES_ACTIVOS.includes(b);
    const isAlerta = alertasBloques.has(String(b));
    const btn = document.createElement('button');
    btn.className = 'blq-btn ' + (isActivo ? (isAlerta ? 'alerta' : 'activo') : 'inactivo');

    let cam = 0;
    if (BLOQUES_DATA[String(b)]) cam = BLOQUES_DATA[String(b)].total;
    if (isActivo) totalCamas += cam;
    if (isAlerta) totalAlertas++;

    btn.innerHTML = '<span class="blq-num">B' + b + '</span><span class="blq-sub">' +
      (isActivo && cam > 0 ? cam + 'c' : '—') + '</span>' +
      (isAlerta ? '<span class="blq-dot"></span>' : '');

    if (isActivo) btn.onclick = () => abrirBloque(b);
    (isActivo ? ga : gi).appendChild(btn);
  }

  document.getElementById('cnt-act').textContent = BLOQUES_ACTIVOS.length;
  document.getElementById('cnt-luc').textContent = totalCamas;
  document.getElementById('cnt-aler').textContent = totalAlertas;
  if (totalAlertas > 0) document.getElementById('alerta-dot').style.display = 'block';
}

// ── DETALLE BLOQUE ────────────────────────
function abrirBloque(b) {
  bloqueActual = b;
  const info = getBloqueInfo(b);
  if (!info) return;

  showScreen('sc-detalle');
  document.getElementById('det-title').textContent = 'Bloque ' + b;
  document.getElementById('d-naves').textContent = info.naves;
  document.getElementById('d-cl').textContent = info.totalCamas;
  document.getElementById('d-horos').textContent = info.horos.length;

  const al = info.camas.filter(c => diasRestantes(c.ret_luces) <= 2).length;
  document.getElementById('d-al').textContent = al;

  renderHoros(b, info);
  renderCamas(b, info);
  renderRadio(b, info);
  renderHistBloque(b);

  resetTabs();
  setNavSel('nb-bloques');
}

// ── HORÓMETROS ────────────────────────────
function renderHoros(b, info) {
  let html = '';
  info.horos.forEach(h => {
    const key = b + '_' + h.id;
    const lectAyer = lecturasPendientes[key + '_ayer'] || 0;
    const lectHoy = lecturasPendientes[key + '_hoy'] || 0;
    const diff = lectHoy > 0 ? parseFloat((lectHoy - lectAyer).toFixed(2)) : null;
    const esAl = diff !== null && diff < h.min;
    const esAv = diff !== null && !esAl && diff < h.min * 1.3;
    const cls = diff === null ? '' : (esAl ? 'alerta' : esAv ? 'aviso' : 'ok');
    const bcls = diff === null ? 'b-gr' : (esAl ? 'b-al' : esAv ? 'b-av' : 'b-ok');
    const btxt = diff === null ? 'Sin lectura' : (esAl ? 'Alerta' : esAv ? 'Revisar' : 'Normal');
    const col = diff === null ? 'var(--ts)' : (esAl ? 'var(--rojo)' : esAv ? 'var(--naranja)' : 'var(--verde-m)');
    const dcls = diff === null ? '' : (esAl ? 'd-al' : esAv ? 'd-av' : 'd-ok');

    html += '<div class="card ' + cls + '">' +
      '<div class="card-top"><div><div class="card-name">' + h.id + '</div><div class="card-sub">Naves ' + h.naves + ' · ' + h.camasOn.length + ' camas</div></div><span class="badge ' + bcls + '">' + btxt + '</span></div>' +
      '<div class="turno-chip"><span class="tc-k">Turno</span><span class="tc-v">' + h.turno + '</span><span class="tc-k">Mín.</span><span class="tc-v">' + h.min + ' h</span></div>';

    if (diff !== null) {
      const pct = Math.min(100, Math.round(diff / h.min * 50));
      html += '<div class="horo-big" style="color:' + col + '">' + lectHoy.toFixed(1) + ' h</div>' +
        '<div class="diff-row"><span>Ayer: ' + lectAyer.toFixed(1) + ' h</span><span class="' + dcls + '">' + (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' h hoy</span></div>' +
        '<div class="prog"><div class="prog-f" style="width:' + pct + '%;background:' + col + '"></div></div>';
    } else {
      html += '<div class="horo-big" style="color:var(--ts)">— h</div>' +
        '<div class="diff-row"><span>Sin lectura anterior</span><span></span></div>';
    }

    html += '<div class="field"><label>Lectura de hoy (h acumuladas)</label>' +
      '<input type="number" step="0.1" inputmode="decimal" placeholder="Ingrese lectura..." id="inp-' + b + '-' + h.id + '"></div>' +
      '<div class="field"><label>Observación (opcional)</label>' +
      '<input type="text" placeholder="Ej: bombillo intermitente" id="obs-' + b + '-' + h.id + '"></div>' +
      '<button class="btn-g" onclick="guardarHoro(' + b + ',\'' + h.id + '\')">Guardar lectura</button>' +
      '<div class="msg" id="msg-' + b + '-' + h.id + '"></div></div>';
  });
  document.getElementById('dv-horometros').innerHTML = html;
}

async function guardarHoro(b, hid) {
  const inp = document.getElementById('inp-' + b + '-' + hid);
  const obs = document.getElementById('obs-' + b + '-' + hid);
  const msg = document.getElementById('msg-' + b + '-' + hid);

  if (!inp.value) {
    msg.textContent = 'Ingresa la lectura del horómetro.';
    msg.className = 'msg err'; msg.style.display = 'block'; return;
  }

  const val = parseFloat(inp.value);
  const key = b + '_' + hid;

  msg.textContent = 'Guardando...'; msg.className = 'msg ok'; msg.style.display = 'block';

  const gpsResult = await saveGPSWithValidation(b);

  const lectura = {
    bloque: b, horometro: hid, lectura: val,
    operario: currentOperario, observacion: obs.value || '',
    fecha: new Date().toISOString(),
    gps: gpsResult.punto,
    gpsValido: gpsResult.valid
  };

  await dbAdd('lecturas', lectura);
  await addToSyncQueue('lectura', lectura);

  const ayerKey = key + '_ayer';
  const hoyKey = key + '_hoy';
  if (lecturasPendientes[hoyKey]) {
    lecturasPendientes[ayerKey] = lecturasPendientes[hoyKey];
  }
  lecturasPendientes[hoyKey] = val;

  const diff = lecturasPendientes[ayerKey] ? val - lecturasPendientes[ayerKey] : null;
  const esAlerta = diff !== null && diff < CONFIG.horoMinimo;

  let msgText = 'Guardado — ';
  if (diff !== null) msgText += diff.toFixed(2) + ' h registradas.';
  else msgText += 'Primera lectura del período.';
  if (!gpsResult.valid) msgText += ' ⚠ GPS fuera del área.';
  if (esAlerta) msgText += ' ⚠ Alerta: bajo mínimo.';

  msg.textContent = msgText;
  inp.value = '';

  const info = getBloqueInfo(b);
  if (info) renderHoros(b, info);

  trySyncData();
}

// ── CAMAS (solo lectura) ──────────────────
function renderCamas(b, info) {
  let html = '';
  info.horos.forEach(h => {
    html += '<div class="card" style="margin-bottom:8px"><div class="card-top" style="margin-bottom:8px">' +
      '<div><div class="card-name">' + h.id + '</div><div class="card-sub">Naves ' + h.naves + '</div></div>' +
      '<span class="badge b-ok">' + h.camasOn.length + ' en luces</span></div>';

    ['A', 'B'].forEach(lado => {
      const del = h.camasData.filter(c => c.lado === lado);
      if (!del.length) return;
      del.sort((a, c2) => a.cm - c2.cm);
      html += '<div class="lado-label">Lado ' + lado + '</div><div class="camas-g">';
      del.forEach(c => {
        const dr = diasRestantes(c.ret_luces);
        const cls = dr <= 2 ? 'vence' : 'on';
        const title = 'Siembra: ' + fmtFecha(c.fecha_sie) + ' · Fin: ' + fmtFecha(c.ret_luces) + ' · ' + c.luces + ' noches';
        html += '<div class="c-cel ' + cls + '" title="' + title + '">' + c.cm + '-' + lado +
          (dr <= 2 ? '<br><span style="font-size:8px">' + dr + 'd</span>' : '') + '</div>';
      });
      html += '</div>';
    });
    html += '<div style="font-size:10px;color:var(--ts);text-align:right;margin-top:4px">Solo lectura</div></div>';
  });
  document.getElementById('dv-camas').innerHTML = html;
}

// ── RADIOMETRÍA ───────────────────────────
function renderRadio(b, info) {
  if (!camasSelRad[b]) camasSelRad[b] = [];
  const rango = CONFIG.radioRangos[unidadActual];

  let html = '<div class="unidad-sel">';
  Object.keys(CONFIG.radioRangos).forEach(u => {
    html += '<button class="unidad-btn ' + (u === unidadActual ? 'sel' : '') + '" onclick="unidadActual=\'' + u + '\';renderRadio(' + b + ',getBloqueInfo(' + b + '))">' + u + '</button>';
  });
  html += '</div>';

  html += '<div class="rango-info">' +
    '<div class="rango-item"><div class="rango-k">Mínimo</div><div class="rango-v" style="color:var(--rojo)">' + rango.min + ' ' + rango.label + '</div></div>' +
    '<div class="rango-item"><div class="rango-k">Máximo</div><div class="rango-v" style="color:var(--naranja)">' + rango.max + ' ' + rango.label + '</div></div></div>';

  html += '<div class="banner bb"><span>&#9728;</span><span>Toca las camas verdes para seleccionarlas. Mide 3 puntos por cama (inicio, centro, final).</span></div>';

  info.horos.forEach(h => {
    html += '<div class="card" style="margin-bottom:8px"><div class="card-top" style="margin-bottom:6px">' +
      '<div><div class="card-name">' + h.id + '</div></div></div>';
    ['A', 'B'].forEach(lado => {
      const del = h.camasData.filter(c => c.lado === lado);
      if (!del.length) return;
      del.sort((a, c2) => a.cm - c2.cm);
      html += '<div class="lado-label">Lado ' + lado + '</div><div class="camas-g">';
      del.forEach(c => {
        const key = c.cm + '-' + c.lado;
        const isSel = camasSelRad[b].includes(key);
        html += '<div class="c-cel ' + (isSel ? 'sel-rad' : 'on') + '" onclick="toggleRadCama(' + b + ',\'' + key + '\')">' + key + '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
  });

  if (camasSelRad[b].length > 0) {
    html += '<div class="sec-lbl" style="margin-top:6px">Mediciones</div>';
    camasSelRad[b].forEach(cama => {
      const k = b + '_' + cama;
      const med = medicionesRad[k] || {};
      html += '<div class="card azul"><div style="font-size:13px;font-weight:800;color:var(--azul);margin-bottom:8px;display:flex;justify-content:space-between">' +
        '<span>Cama ' + cama + '</span>' +
        '<button onclick="quitarRadC
