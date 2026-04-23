// ═══════════════════════════════════════════
// Fotoperiodo PWA — App principal
// Finca Olas · Integración con Apps Script
// ═══════════════════════════════════════════

// ── CONFIGURACIÓN DE CONEXIÓN ─────────────
// ¡ANDRÉS, REEMPLAZA EL TEXTO DE ABAJO CON TU URL REAL DE APPS SCRIPT!
const SCRIPT_URL = 'TU_URL_AQUI'; 

// ── CONFIGURACIÓN LOCAL ───────────────────
const CONFIG = {
  finca: 'Finca Olas',
  centro: { lat: 6.122428, lng: -75.437225 },
  horoMinimo: 2.0,
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
      '<div class="turno-chip"><span class="tc-k">Turno</span><span class="tc-v">' + h.turno + '</span><span class="tc-k">Mín. Esperado</span><span class="tc-v">' + h.min + ' h</span></div>';

    if (diff !== null) {
      const pct = Math.min(100, Math.round(diff / h.min * 50));
      html += '<div class="horo-big" style="color:' + col + '">' + lectHoy.toFixed(1) + ' h</div>' +
        '<div class="diff-row"><span>Ayer: ' + lectAyer.toFixed(1) + ' h</span><span class="' + dcls + '">' + (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' h agregadas</span></div>' +
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
  if (esAlerta) msgText += ' ⚠ Alerta: Avance menor a 2 horas.';

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
        '<button onclick="quitarRadCama(' + b + ',\'' + cama + '\')" style="background:none;border:none;color:var(--ts);font-size:16px;cursor:pointer">✕</button></div>' +
        '<div class="puntos-grid">' +
        '<div class="punto-wrap"><div class="punto-label">Inicio</div><input class="punto-input" type="number" inputmode="decimal" step="0.1" id="p1-' + k + '" value="' + (med.p1||'') + '" oninput="calcRadProm(' + b + ',\'' + cama + '\')"></div>' +
        '<div class="punto-wrap"><div class="punto-label">Centro</div><input class="punto-input" type="number" inputmode="decimal" step="0.1" id="p2-' + k + '" value="' + (med.p2||'') + '" oninput="calcRadProm(' + b + ',\'' + cama + '\')"></div>' +
        '<div class="punto-wrap"><div class="punto-label">Final</div><input class="punto-input" type="number" inputmode="decimal" step="0.1" id="p3-' + k + '" value="' + (med.p3||'') + '" oninput="calcRadProm(' + b + ',\'' + cama + '\')"></div>' +
        '</div>' +
        '<div class="prom-row"><span class="prom-lbl">Promedio</span><span class="prom-val" id="prom-' + k + '">—</span></div>' +
        '<div id="ban-' + k + '"></div></div>';
    });
    html += '<button class="btn-az" onclick="guardarRadio(' + b + ')">Guardar mediciones</button>' +
      '<div class="msg" id="msg-rad-' + b + '"></div>';
  }

  document.getElementById('dv-radio').innerHTML = html;
}

function toggleRadCama(b, cama) {
  if (!camasSelRad[b]) camasSelRad[b] = [];
  const idx = camasSelRad[b].indexOf(cama);
  if (idx >= 0) camasSelRad[b].splice(idx, 1);
  else camasSelRad[b].push(cama);
  renderRadio(b, getBloqueInfo(b));
}

function quitarRadCama(b, cama) {
  if (!camasSelRad[b]) return;
  camasSelRad[b] = camasSelRad[b].filter(c => c !== cama);
  renderRadio(b, getBloqueInfo(b));
}

function calcRadProm(b, cama) {
  const k = b + '_' + cama;
  const p1 = parseFloat(document.getElementById('p1-' + k)?.value) || 0;
  const p2 = parseFloat(document.getElementById('p2-' + k)?.value) || 0;
  const p3 = parseFloat(document.getElementById('p3-' + k)?.value) || 0;
  const vals = [p1, p2, p3].filter(v => v > 0);
  const prom = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const rango = CONFIG.radioRangos[unidadActual];
  const promEl = document.getElementById('prom-' + k);
  const banEl = document.getElementById('ban-' + k);
  if (!promEl) return;

  if (prom === null) { promEl.textContent = '—'; promEl.style.color = 'var(--ts)'; if(banEl) banEl.innerHTML=''; return; }

  const esAl = prom < rango.min, esAv = prom > rango.max;
  const col = esAl ? 'var(--rojo)' : esAv ? 'var(--naranja)' : 'var(--verde-m)';
  promEl.textContent = prom.toFixed(1) + ' ' + unidadActual;
  promEl.style.color = col;

  const banTxt = esAl ? 'Bajo mínimo (' + rango.min + ' ' + rango.label + '). Revisar lámpara.'
    : esAv ? 'Sobre máximo (' + rango.max + ' ' + rango.label + '). Verificar.'
    : 'Dentro del rango (' + rango.min + '–' + rango.max + ' ' + rango.label + ').';
  const banCls = esAl ? 'ba' : esAv ? 'bw' : 'bk';
  if (banEl) banEl.innerHTML = '<div class="banner ' + banCls + '" style="margin-top:6px"><span>&#9432;</span><span>' + banTxt + '</span></div>';

  medicionesRad[k] = { p1, p2, p3, prom: prom.toFixed(1), unidad: unidadActual };
}

async function guardarRadio(b) {
  const msg = document.getElementById('msg-rad-' + b);
  if (!msg) return;
  msg.textContent = 'Guardando...'; msg.className = 'msg ok'; msg.style.display = 'block';

  const gpsResult = await saveGPSWithValidation(b);

  for (const cama of (camasSelRad[b] || [])) {
    const k = b + '_' + cama;
    const med = medicionesRad[k];
    if (!med) continue;
    const registro = {
      bloque: b, cama, ...med, operario: currentOperario,
      fecha: new Date().toISOString(), gps: gpsResult.punto, gpsValido: gpsResult.valid
    };
    await dbAdd('radiometria', registro);
    await addToSyncQueue('radiometria', registro);
  }

  const n = camasSelRad[b]?.length || 0;
  msg.textContent = n + ' cama(s) guardadas.' + (!gpsResult.valid ? ' ⚠ GPS fuera del área.' : '');
  camasSelRad[b] = [];
  medicionesRad = {};
  trySyncData();
}

// ── HISTORIAL BLOQUE (Dentro de detalle) ──
async function renderHistBloque(b) {
  const lecturas = await dbGetAll('lecturas');
  const del = lecturas.filter(l => l.bloque === b).sort((a, c) => new Date(c.fecha) - new Date(a.fecha)).slice(0, 20);

  let html = '<div class="card"><div class="sec-lbl" style="margin-bottom:8px">Últimas lecturas — Bloque ' + b + '</div>';
  if (!del.length) {
    html += '<div class="empty">Sin lecturas registradas aún.</div>';
  } else {
    del.forEach(l => {
      const f = new Date(l.fecha);
      const fStr = f.getDate() + '/' + (f.getMonth()+1) + ' ' + f.getHours() + ':' + String(f.getMinutes()).padStart(2,'0');
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--borde)">' +
        '<span style="font-size:11px;color:var(--ts)">' + fStr + ' · ' + l.horometro + '</span>' +
        '<span style="font-size:13px;font-weight:700">' + l.lectura.toFixed(1) + ' h</span>' +
        '<span style="font-size:10px;color:var(--ts)">' + (l.gpsValido ? '✓ GPS' : '⚠ GPS') + '</span></div>';
    });
  }
  html += '</div>';
  document.getElementById('dv-hist').innerHTML = html;
}

// ── HISTORIAL GLOBAL CON FILTROS ──────────
async function irHistorialGlobal() {
  showScreen('sc-historial-global');
  setNavSel('nb-historial');

  const selectElement = document.getElementById('filtro-bloque');
  if (selectElement.options.length <= 1) {
    BLOQUES_ACTIVOS.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = 'Bloque ' + b;
      selectElement.appendChild(opt);
    });
  }
  
  await renderHistorialGlobal();
}

async function renderHistorialGlobal() {
  const bFilter = document.getElementById('filtro-bloque').value;
  const fFilter = document.getElementById('filtro-fecha').value;
  let lecturas = await dbGetAll('lecturas');

  lecturas.sort((a, c) => new Date(c.fecha) - new Date(a.fecha));

  if (bFilter) {
    lecturas = lecturas.filter(l => String(l.bloque) === String(bFilter));
  }
  if (fFilter) {
    lecturas = lecturas.filter(l => l.fecha.startsWith(fFilter));
  }

  let html = '';
  if (!lecturas.length) {
    html = '<div class="empty">No se encontraron lecturas para estos filtros.</div>';
  } else {
    lecturas.forEach(l => {
      const f = new Date(l.fecha);
      const fStr = f.getDate() + '/' + (f.getMonth() + 1) + '/' + f.getFullYear() + ' ' + f.getHours() + ':' + String(f.getMinutes()).padStart(2, '0');
      html += '<div class="card" style="margin-bottom: 8px;">' +
        '<div class="card-top" style="margin-bottom: 4px;">' +
          '<div class="card-name">Bloque ' + l.bloque + ' — ' + l.horometro + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--ts);margin-bottom:4px;">' + fStr + ' · Operario: ' + l.operario + '</div>' +
        '<div style="font-size:15px;font-weight:800;color:var(--verde-m)">Acumulado: ' + l.lectura.toFixed(1) + ' h</div>';
      
      if (l.observacion) {
        html += '<div style="font-size:11px; margin-top:6px; color:var(--ts); font-style:italic;">Obs: ' + l.observacion + '</div>';
      }
      html += '</div>';
    });
  }
  document.getElementById('historial-global-content').innerHTML = html;
}

// ── ALERTAS ───────────────────────────────
function renderAlertas() {
  let html = '';
  const alertasBloques = new Set();
  DATOS_LUCES.forEach(r => {
    const dr = diasRestantes(r.ret_luces);
    if (dr <= 3 && dr >= -1) {
      const cls = dr <= 0 ? 'ba' : 'bw';
      const tipo = dr <= 0 ? 'Vencida' : 'Vence en ' + dr + ' día(s)';
      html += '<div class="alert-item ' + cls + '" onclick="abrirBloque(' + parseInt(r.bl) + ')" style="border-radius:10px;margin-bottom:6px">' +
        '<div class="ai-dot" style="background:' + (dr <= 0 ? 'var(--rojo)' : 'var(--naranja)') + '"></div>' +
        '<div class="ai-body"><div class="ai-title">B' + r.bl + ' · Cama ' + r.cm_orig + '</div>' +
        '<div class="ai-meta">' + tipo + ' · Retiro: ' + fmtFecha(r.ret_luces) + '<br>' +
        'Siembra: ' + fmtFecha(r.fecha_sie) + ' · ' + r.luces + ' noches</div></div></div>';
    }
  });

  if (!html) {
    html = '<div class="banner bk" style="border-radius:10px"><span>✓</span><span>Sin alertas activas hoy.</span></div>';
  }

  document.getElementById('alertas-content').innerHTML = html;
}

// ── RECORRIDO GPS ─────────────────────────
async function renderRecorrido() {
  const puntos = await getGPSHistory(new Date().toISOString());
  let html = '<div class="sec-lbl">Recorrido de hoy — ' + currentOperario + '</div>';

  if (!puntos.length) {
    html += '<div class="empty">Sin registros GPS aún.<br>Se registran al guardar lecturas.</div>';
  } else {
    html += '<div class="card"><div class="sec-lbl" style="margin-bottom:8px">Puntos registrados: ' + puntos.length + '</div>';
    puntos.slice(-15).reverse().forEach(p => {
      const f = new Date(p.fecha);
      const fStr = f.getHours() + ':' + String(f.getMinutes()).padStart(2,'0');
      const icon = p.tipo === 'lectura' ? '&#9201;' : p.tipo === 'radiometria' ? '&#9728;' : '&#128205;';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--borde)">' +
        '<span style="font-size:12px">' + icon + ' ' + fStr + '</span>' +
        '<span style="font-size:11px;color:var(--ts)">' + (p.bloque ? 'B' + p.bloque : 'Auto') + '</span>' +
        '<span style="font-size:10px;font-weight:700;color:' + (p.enFinca ? 'var(--verde-m)' : 'var(--rojo)') + '">' +
        (p.enFinca ? '✓ En finca' : '⚠ Fuera') + '</span></div>';
    });
    html += '</div>';
  }
  document.getElementById('recorrido-content').innerHTML = html;
}

// ── NAVEGACIÓN ────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  document.getElementById(id).classList.add('show');
}
function setNavSel(id) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById(id).classList.add('sel');
}
function resetTabs() {
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('sel'));
  document.querySelectorAll('.dview').forEach(v => v.classList.remove('show'));
  document.querySelectorAll('.dtab')[0].classList.add('sel');
  document.getElementById('dv-horometros').classList.add('show');
}
function switchDT(id, el) {
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('sel'));
  document.querySelectorAll('.dview').forEach(v => v.classList.remove('show'));
  el.classList.add('sel');
  document.getElementById('dv-' + id).classList.add('show');
}
function irBloques() { showScreen('sc-inicio'); setNavSel('nb-bloques'); }
function irAlertas() { showScreen('sc-alertas'); renderAlertas(); setNavSel('nb-alertas'); }
function irRecorrido() { showScreen('sc-recorrido'); renderRecorrido(); setNavSel('nb-recorrido'); }
function irRadioGlobal() { showScreen('sc-radio-global'); renderRadioGlobal(); setNavSel('nb-radio'); }
function volver() { showScreen('sc-inicio'); setNavSel('nb-bloques'); }

function renderRadioGlobal() {
  let html = '<div class="banner bb" style="border-radius:10px;margin-bottom:10px"><span>&#9728;</span><span>Selecciona un bloque para medir intensidad lumínica.</span></div>';
  html += '<div class="bloques-grid">';
  BLOQUES_ACTIVOS.forEach(b => {
    html += '<button class="blq-btn activo" onclick="abrirBloqueRadio(' + b + ')"><span class="blq-num">B' + b + '</span><span class="blq-sub">Medir</span></button>';
  });
  html += '</div>';
  document.getElementById('radio-global-content').innerHTML = html;
}

function abrirBloqueRadio(b) {
  abrirBloque(b);
  setTimeout(() => {
    document.querySelectorAll('.dtab').forEach(t => t.classList.remove('sel'));
    document.querySelectorAll('.dview').forEach(v => v.classList.remove('show'));
    document.querySelectorAll('.dtab')[2].classList.add('sel');
    document.getElementById('dv-radio').classList.add('show');
  }, 50);
}

// ── REGISTER SERVICE WORKER ───────────────
if ('serviceWorker' in navigator) {
  // ATENCIÓN: Se quitó el '/' inicial para que funcione en GitHub Pages
  navigator.serviceWorker.register('sw.js').then(reg => {
    console.log('SW registrado correctamente.');
    reg.addEventListener('message', e => {
      if (e.data?.type === 'SYNC_REQUESTED') trySyncData();
    });
  }).catch(e => console.warn('SW error:', e));
}

// ── INIT ──────────────────────────────────
initLogin();
