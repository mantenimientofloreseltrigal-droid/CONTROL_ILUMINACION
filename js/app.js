// ═══════════════════════════════════════════
// Fotoperiodo PWA — App principal (VERSIÓN COMPLETA)
// Finca Olas · Control Integral de Procesos
// ═══════════════════════════════════════════

// ── CONFIGURACIÓN DE CONEXIÓN ─────────────
// ¡NO OLVIDES PEGAR TU URL AQUÍ!
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwwlzQHvFFlerxzcAV5MB2V81hNHnRXKO3ibZ0_YiHgXsaC8apR1Yopid3LW2ojbfSEog/exec'; 

// ── CONFIGURACIÓN LOCAL ───────────────────
const CONFIG = {
  horoMinimo: 2.0, // 12 ciclos de 10 min
  pines: {
    '1234': { rol: 'operario', nombre: 'Operario' },
    '5678': { rol: 'supervisor', nombre: 'Supervisor' },
    '9999': { rol: 'gerente', nombre: 'Gerente' }
  },
  radioRangos: {
    'µmol/m²/s': { min: 1.5, max: 80, label: 'PAR' },
    'Lux': { min: 1000, max: 6000, label: 'Lux' }
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
let unidadActual = 'µmol/m²/s';
let camasSelRad = {};
let medicionesRad = {};

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
  const [y, m, d] = f.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}
function diasRestantes(fechaStr) {
  if (!fechaStr) return 999;
  const [y, m, d] = fechaStr.split('T')[0].split('-');
  const fin = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  return Math.ceil((fin - hoy) / 86400000);
}

// ── LOGIN ─────────────────────────────────
function initLogin() { document.getElementById('login-date').textContent = fechaHoyLarga(); }
function intentarLogin() {
  const nombre = document.getElementById('login-nombre').value.trim();
  const pin = Array.from(document.querySelectorAll('.login-pin')).map(i => i.value).join('');

  if (!nombre) { showLoginError('Escribe tu nombre'); return; }
  if (pin.length < 4) { showLoginError('Ingresa el PIN'); return; }
  const pinConfig = CONFIG.pines[pin];
  if (!pinConfig) { showLoginError('PIN incorrecto'); return; }

  currentOperario = nombre;
  currentRol = pinConfig.rol;
  window.currentOperario = nombre;

  document.getElementById('u-initials').textContent = nombre.split(' ').map(w => w[0].toUpperCase()).slice(0,2).join('');
  document.getElementById('u-name').textContent = nombre.split(' ')[0];
  document.getElementById('hdr-date').textContent = fechaHoyLarga();
  
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');

  initGPS();
  actualizarCatalogos();
  checkOnlineStatus();
}
function showLoginError(msg) {
  const el = document.getElementById('login-err'); el.textContent = msg; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}
function pinInput(el, idx) { if (el.value.length === 1 && idx < 3) document.querySelectorAll('.login-pin')[idx + 1].focus(); }
function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  stopGPS();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').classList.remove('active');
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
  
  // Selector Siembra
  const sBloque = document.getElementById('s-bloque');
  if (sBloque) {
    sBloque.innerHTML = '<option value="">Seleccione bloque...</option>';
    for (let i = 1; i <= 50; i++) sBloque.innerHTML += `<option value="${i}">Bloque ${i}</option>`;
  }

  // Filtro Variedades
  const semActual = obtenerSemanaActual();
  const sVar = document.getElementById('s-variedad');
  if (sVar) {
    const varSem = PLAN_SIEMBRAS.filter(p => String(p.Semana) === semActual && parseFloat(p.Cantidad) > 0).map(p => p.Variedad);
    const filt = CATALOGO_VARIEDADES.filter(v => varSem.includes(v.Variedad));
    if (filt.length === 0) sVar.innerHTML = '<option value="">Sin programación sem ' + semActual + '</option>';
    else sVar.innerHTML = filt.map(v => `<option value="${v.Noches}">${v.Variedad} (${v.Noches}n)</option>`).join('');
  }
  
  buildInicio();
  precalcularAlertas();
}

function buildInicio() {
  const ga = document.getElementById('grid-activos');
  const gi = document.getElementById('grid-inactivos');
  if (!ga || !gi) return;
  ga.innerHTML = ''; gi.innerHTML = '';
  let totalCamas = 0;

  for (let b = 1; b <= 50; b++) {
    const isActivo = BLOQUES_ACTIVOS.includes(b);
    const btn = document.createElement('button');
    btn.className = 'blq-btn ' + (isActivo ? 'activo' : 'inactivo');
    let cam = 0;
    if (BLOQUES_DATA[String(b)]) cam = BLOQUES_DATA[String(b)].total;
    if (isActivo) totalCamas += cam;

    btn.innerHTML = `<span class="blq-num">B${b}</span><span class="blq-sub">${isActivo ? cam+'c' : '—'}</span>`;
    if (isActivo) btn.onclick = () => abrirBloque(b);
    (isActivo ? ga : gi).appendChild(btn);
  }

  document.getElementById('cnt-act').textContent = BLOQUES_ACTIVOS.length;
  document.getElementById('cnt-luc').textContent = totalCamas;
}

// ── ALERTAS INTELIGENTES ──────────────────
function precalcularAlertas() {
  const navesAgrupadas = {};
  DATOS_LUCES.forEach(c => {
    const bl = c.bl, nave = Math.ceil(parseInt(c.cm) / 4);
    const key = `${bl}_${nave}`;
    if (!navesAgrupadas[key]) navesAgrupadas[key] = { bl, nave, camas: [], maxRetStr: c.ret_luces };
    navesAgrupadas[key].camas.push(c);
    if (new Date(c.ret_luces) > new Date(navesAgrupadas[key].maxRetStr)) navesAgrupadas[key].maxRetStr = c.ret_luces;
  });

  let html = '', contAlertas = 0;
  Object.values(navesAgrupadas).forEach(grupo => {
    const maxRestante = diasRestantes(grupo.maxRetStr);
    if (maxRestante <= 0) {
      html += `<div class="card" style="border: 2px solid var(--rojo); background: #FFF5F5; margin-bottom:10px;">
        <div style="font-weight:900; color:var(--rojo); font-size:14px;">🔴 APAGAR GUIRNALDAS</div>
        <div style="font-weight:bold; font-size:16px;">Bloque ${grupo.bl} - Nave ${grupo.nave}</div>
        <div style="font-size:12px; color:var(--ts);">Todas las camas completaron sus ciclos.</div></div>`;
      contAlertas++;
    } else {
      grupo.camas.forEach(c => {
        const dr = diasRestantes(c.ret_luces);
        if (dr <= 0) {
          html += `<div class="card" style="border: 2px solid var(--naranja); background: #FFFDF5; margin-bottom:10px;">
            <div style="font-weight:900; color:var(--naranja); font-size:14px;">⚠️ INSTALAR DIVISIÓN</div>
            <div style="font-weight:bold; font-size:16px;">Bloque ${grupo.bl} - Cama ${c.cm}${c.lado}</div>
            <div style="font-size:12px; color:var(--ts);">Variedad ${c.variedad} lista. Nave sigue encendida. Aísle.</div></div>`;
          contAlertas++;
        }
      });
    }
  });

  const cont = document.getElementById('alertas-content'), badge = document.getElementById('badge-alertas'), dot = document.getElementById('alerta-dot');
  if (cont) cont.innerHTML = html || '<div class="empty">Todo al día en campo.</div>';
  if (badge) badge.textContent = contAlertas;
  if (dot) dot.style.display = contAlertas > 0 ? 'block' : 'none';
}

// ── MÓDULO SIEMBRA (MAPA VISUAL) ──────────
function cambiarLado(l) {
  ladoSeleccionado = l;
  document.getElementById('btn-ladoA').classList.toggle('sel', l === 'A');
  document.getElementById('btn-ladoB').classList.toggle('sel', l === 'B');
  renderMapaCamas();
}

function renderMapaCamas() {
  const bl = document.getElementById('s-bloque').value;
  const grid = document.getElementById('mapa-grid');
  if (!grid || !bl) return;
  grid.innerHTML = '';

  const camasBl = DATOS_LUCES.filter(c => String(c.bl) === String(bl));
  let maxCamas = 40; 
  if (camasBl.length > 0) maxCamas = Math.ceil(Math.max(...camasBl.map(c => parseInt(c.cm))) / 4) * 4; 

  for (let i = 1; i <= maxCamas; i++) {
    const camaAct = camasBl.find(c => c.cm == i && c.lado == ladoSeleccionado);
    const btn = document.createElement('div');
    const tieneLuz = camaAct && camaAct.inic_luces;
    
    btn.className = `c-cel ${tieneLuz ? 'on' : ''} ${camaSeleccionada == i ? 'sel-rad' : ''}`;
    btn.textContent = i + ladoSeleccionado;
    
    if (!tieneLuz) btn.onclick = () => { camaSeleccionada = i; renderMapaCamas(); };
    else { btn.title = `Var: ${camaAct.variedad || 'N/A'}`; btn.style.cursor = 'not-allowed'; }
    grid.appendChild(btn);
  }
}

async function guardarNuevaSiembra() {
  const bl = document.getElementById('s-bloque').value, selector = document.getElementById('s-variedad'), msg = document.getElementById('msg-siembra');
  if (!selector.value || !bl || !camaSeleccionada) { msg.textContent = "Complete Bloque, Cama y Variedad."; msg.className = "msg err"; msg.style.display = 'block'; return; }
  
  const noches = parseInt(selector.value), varNombre = selector.options[selector.selectedIndex].text.split(' (')[0];
  const hoy = new Date(), retiro = new Date(); retiro.setDate(hoy.getDate() + noches);

  const data = {
    bl, cm: camaSeleccionada, lado: ladoSeleccionado, cm_orig: String(camaSeleccionada).padStart(3, '0') + ladoSeleccionado,
    inic_luces: hoy.toISOString().split('T')[0], ret_luces: retiro.toISOString().split('T')[0],
    fecha_sie: hoy.toISOString().split('T')[0], sem_sie: obtenerSemanaActual(), luces: noches, variedad: varNombre
  };

  await addToSyncQueue('nueva_siembra', data);
  msg.textContent = "¡Cama activada! Sincronizando..."; msg.className = "msg ok"; msg.style.display = 'block';
  camaSeleccionada = null; setTimeout(() => { msg.style.display = 'none'; actualizarCatalogos(); irBloques(); }, 2000);
}

// ── DETALLE BLOQUE Y HORÓMETROS ───────────
function getBloqueInfo(b) {
  const data = BLOQUES_DATA[String(b)];
  if (!data) return null;
  const naves = new Set(data.camas.map(c => Math.ceil(c.cm / 4)));
  return { naves: naves.size, totalCamas: data.total, camas: data.camas, horos: calcularHorometros(b, data.camas) };
}

function calcularHorometros(bloque, camas) {
  const MAX_NAVES = 6, nNaves = Math.max(...new Set(camas.map(c => Math.ceil(c.cm / 4))));
  let grupos = [], inicio = 1;
  while (inicio <= nNaves) { grupos.push({ inicio, fin: Math.min(inicio + MAX_NAVES - 1, nNaves) }); inicio += MAX_NAVES; }
  if (grupos.length >= 2 && (grupos[grupos.length - 1].fin - grupos[grupos.length - 1].inicio + 1) === 1) {
    grupos[grupos.length - 2].fin = grupos[grupos.length - 1].fin; grupos.pop();
  }
  return grupos.map((g, h) => {
    const t = CONFIG.turnos[h % CONFIG.turnos.length];
    const camH = camas.filter(c => { const n = Math.ceil(c.cm / 4); return n >= g.inicio && n <= g.fin; });
    return { id: 'H'+(h+1), naves: g.inicio+'–'+g.fin, turno: t.inicio+'–'+t.fin, min: CONFIG.horoMinimo, camasOn: camH.map(c => c.cm+'-'+c.lado), camasData: camH };
  });
}

function abrirBloque(b) {
  bloqueActual = b; const info = getBloqueInfo(b); if (!info) return;
  showScreen('sc-detalle'); document.getElementById('det-title').textContent = 'Bloque ' + b;
  renderHoros(b, info); renderCamas(b, info); renderRadio(b, info); renderHistBloque(b);
  switchDT('horometros', document.querySelectorAll('.dtab')[0]); setNavSel('nb-bloques');
}

function renderHoros(b, info) {
  let html = '';
  info.horos.forEach(h => {
    const k = b+'_'+h.id, ayer = lecturasPendientes[k+'_ayer']||0, hoy = lecturasPendientes[k+'_hoy']||0, diff = hoy>0 ? (hoy-ayer) : null;
    html += `<div class="card ${diff!==null && diff<h.min ? 'alerta':''}"><div class="card-top"><div class="card-name">${h.id}</div><div class="badge b-ok">Naves ${h.naves}</div></div>
      <div class="turno-chip"><span class="tc-k">Turno</span><span class="tc-v">${h.turno}</span></div>
      ${diff!==null ? `<div class="horo-big">${hoy.toFixed(1)}h</div>` : '<div class="horo-big" style="color:var(--ts)">— h</div>'}
      <div class="field"><label>Lectura hoy (Acumulado)</label><input type="number" step="0.1" inputmode="decimal" id="inp-${b}-${h.id}"></div>
      <button class="btn-g" onclick="guardarHoro(${b},'${h.id}')">Guardar</button><div class="msg" id="msg-${b}-${h.id}"></div></div>`;
  });
  document.getElementById('dv-horometros').innerHTML = html;
}

async function guardarHoro(b, hid) {
  const inp = document.getElementById('inp-' + b + '-' + hid), msg = document.getElementById('msg-' + b + '-' + hid);
  if (!inp.value) return; const val = parseFloat(inp.value);
  const gpsResult = typeof saveGPSWithValidation === 'function' ? await saveGPSWithValidation(b) : {punto:{lat:0,lng:0}, valid:true};
  const lec = { bloque: b, horometro: hid, lectura: val, operario: currentOperario, observacion: '', fecha: new Date().toISOString(), gps: gpsResult.punto, gpsValido: gpsResult.valid };
  await dbAdd('lecturas', lec); await addToSyncQueue('lectura', lec);
  const k = b+'_'+hid; lecturasPendientes[k+'_ayer'] = lecturasPendientes[k+'_hoy']; lecturasPendientes[k+'_hoy'] = val;
  msg.textContent = `Guardado: ${val}h`; msg.className = "msg ok"; msg.style.display = 'block'; inp.value = ''; trySyncData();
}

// ── VISTA CAMAS (INFO) ────────────────────
function renderCamas(b, info) {
  let html = '';
  info.horos.forEach(h => {
    html += `<div class="card" style="margin-bottom:8px"><div class="card-top"><div><div class="card-name">${h.id}</div><div class="card-sub">Naves ${h.naves}</div></div></div>`;
    ['A', 'B'].forEach(lado => {
      const del = h.camasData.filter(c => c.lado === lado); if (!del.length) return;
      del.sort((a, c2) => a.cm - c2.cm); html += `<div class="lado-label">Lado ${lado}</div><div class="camas-g">`;
      del.forEach(c => { html += `<div class="c-cel on" title="Var: ${c.variedad || ''}">${c.cm}-${lado}</div>`; });
      html += '</div>';
    }); html += '</div>';
  }); document.getElementById('dv-camas').innerHTML = html;
}

// ── MÓDULO RADIOMETRÍA ────────────────────
function renderRadioGlobal() {
  showScreen('sc-radio-global'); setNavSel('nb-radio');
  let html = '<div class="bloques-grid">';
  BLOQUES_ACTIVOS.forEach(b => { html += `<button class="blq-btn activo" onclick="abrirBloqueRadio(${b})"><span class="blq-num">B${b}</span><span class="blq-sub">Medir</span></button>`; });
  html += '</div>'; document.getElementById('radio-global-content').innerHTML = html;
}

function abrirBloqueRadio(b) {
  abrirBloque(b);
  setTimeout(() => { switchDT('radio', document.querySelectorAll('.dtab')[2]); }, 50);
}

function renderRadio(b, info) {
  if (!camasSelRad[b]) camasSelRad[b] = []; const rango = CONFIG.radioRangos[unidadActual];
  let html = `<div class="unidad-sel">`;
  Object.keys(CONFIG.radioRangos).forEach(u => { html += `<button class="unidad-btn ${u===unidadActual?'sel':''}" onclick="unidadActual='${u}';renderRadio(${b},getBloqueInfo(${b}))">${u}</button>`; });
  html += `</div><div class="banner bb"><span>&#9728;</span><span>Toca las camas para medirlas.</span></div>`;
  
  info.horos.forEach(h => {
    html += `<div class="card" style="margin-bottom:8px"><div class="card-top"><div class="card-name">${h.id}</div></div>`;
    ['A', 'B'].forEach(lado => {
      const del = h.camasData.filter(c => c.lado === lado); if (!del.length) return;
      html += `<div class="lado-label">Lado ${lado}</div><div class="camas-g">`;
      del.forEach(c => {
        const key = c.cm+'-'+c.lado, isSel = camasSelRad[b].includes(key);
        html += `<div class="c-cel ${isSel?'sel-rad':'on'}" onclick="toggleRadCama(${b},'${key}')">${key}</div>`;
      }); html += '</div>';
    }); html += '</div>';
  });

  if (camasSelRad[b].length > 0) {
    html += '<div class="sec-lbl" style="margin-top:6px">Mediciones</div>';
    camasSelRad[b].forEach(cama => {
      const k = b+'_'+cama, med = medicionesRad[k]||{};
      html += `<div class="card azul">
        <div style="font-weight:800;color:var(--azul);display:flex;justify-content:space-between"><span>Cama ${cama}</span><button onclick="quitarRadCama(${b},'${cama}')" style="background:none;border:none">✕</button></div>
        <div class="puntos-grid">
          <div class="punto-wrap"><div class="punto-label">Inicio</div><input class="punto-input" type="number" id="p1-${k}" value="${med.p1||''}" oninput="calcRadProm(${b},'${cama}')"></div>
          <div class="punto-wrap"><div class="punto-label">Centro</div><input class="punto-input" type="number" id="p2-${k}" value="${med.p2||''}" oninput="calcRadProm(${b},'${cama}')"></div>
          <div class="punto-wrap"><div class="punto-label">Final</div><input class="punto-input" type="number" id="p3-${k}" value="${med.p3||''}" oninput="calcRadProm(${b},'${cama}')"></div>
        </div>
        <div class="prom-row"><span class="prom-lbl">Promedio</span><span class="prom-val" id="prom-${k}">${med.prom||'—'}</span></div></div>`;
    });
    html += `<button class="btn-az" onclick="guardarRadio(${b})">Guardar</button><div class="msg" id="msg-rad-${b}"></div>`;
  }
  document.getElementById('dv-radio').innerHTML = html;
}

function toggleRadCama(b, cama) {
  if (!camasSelRad[b]) camasSelRad[b] = []; const idx = camasSelRad[b].indexOf(cama);
  if (idx >= 0) camasSelRad[b].splice(idx, 1); else camasSelRad[b].push(cama);
  renderRadio(b, getBloqueInfo(b));
}
function quitarRadCama(b, cama) { camasSelRad[b] = camasSelRad[b].filter(c => c !== cama); renderRadio(b, getBloqueInfo(b)); }
function calcRadProm(b, cama) {
  const k = b+'_'+cama, p1 = parseFloat(document.getElementById('p1-'+k)?.value)||0, p2 = parseFloat(document.getElementById('p2-'+k)?.value)||0, p3 = parseFloat(document.getElementById('p3-'+k)?.value)||0;
  const vals = [p1,p2,p3].filter(v => v>0), prom = vals.length>0 ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  const promEl = document.getElementById('prom-'+k); if (!promEl) return;
  if (prom === null) { promEl.textContent = '—'; return; }
  promEl.textContent = prom.toFixed(1) + ' ' + unidadActual;
  medicionesRad[k] = { p1, p2, p3, prom: prom.toFixed(1), unidad: unidadActual };
}
async function guardarRadio(b) {
  const msg = document.getElementById('msg-rad-'+b); if (!msg) return;
  const gpsResult = typeof saveGPSWithValidation === 'function' ? await saveGPSWithValidation(b) : {punto:{lat:0,lng:0},valid:true};
  for (const cama of (camasSelRad[b] || [])) {
    const med = medicionesRad[b+'_'+cama]; if (!med) continue;
    const reg = { bloque: b, cama, ...med, operario: currentOperario, fecha: new Date().toISOString(), gps: gpsResult.punto, gpsValido: gpsResult.valid };
    await dbAdd('radiometria', reg); await addToSyncQueue('radiometria', reg);
  }
  msg.textContent = camasSelRad[b].length + ' camas guardadas.'; msg.className = "msg ok"; msg.style.display = 'block';
  camasSelRad[b] = []; medicionesRad = {}; setTimeout(()=>{ renderRadio(b, getBloqueInfo(b)); trySyncData(); }, 1500);
}

// ── GPS Y RECORRIDO ───────────────────────
async function renderRecorrido() {
  showScreen('sc-recorrido'); setNavSel('nb-recorrido');
  const puntos = typeof getGPSHistory === 'function' ? await getGPSHistory(new Date().toISOString()) : [];
  let html = `<div class="sec-lbl">Recorrido de hoy — ${currentOperario}</div>`;
  if (!puntos.length) { html += '<div class="empty">Sin registros GPS.</div>'; } 
  else {
    html += `<div class="card">`;
    puntos.slice(-15).reverse().forEach(p => {
      const f = new Date(p.fecha), fStr = f.getHours()+':'+String(f.getMinutes()).padStart(2,'0');
      html += `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--borde);padding:5px 0">
        <span>${fStr}</span><span>${p.bloque ? 'B'+p.bloque : 'Auto'}</span><span style="color:${p.enFinca?'var(--verde-m)':'var(--rojo)'}">${p.enFinca?'✓ Finca':'⚠ Fuera'}</span></div>`;
    }); html += '</div>';
  }
  document.getElementById('recorrido-content').innerHTML = html;
}

// ── HISTORIALES Y NAVEGACIÓN ──────────────
async function renderHistBloque(b) {
  const lecturas = await dbGetAll('lecturas'), del = lecturas.filter(l => l.bloque === b).sort((a, c) => new Date(c.fecha) - new Date(a.fecha)).slice(0, 10);
  let html = '<div class="card">';
  if (!del.length) html += '<div class="empty">Sin lecturas.</div>';
  else del.forEach(l => { html += `<div style="border-bottom:1px solid var(--borde);padding:5px 0"><span>${fmtFecha(l.fecha)} - ${l.horometro}</span><span style="float:right;font-weight:bold">${l.lectura}h</span></div>`; });
  document.getElementById('dv-hist').innerHTML = html + '</div>';
}

async function renderHistorialGlobal() {
  const bFilter = document.getElementById('filtro-bloque').value;
  let lecturas = await dbGetAll('lecturas');
  lecturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  if (bFilter) lecturas = lecturas.filter(l => String(l.bloque) === String(bFilter));
  
  let html = '';
  lecturas.forEach(l => {
    html += `<div class="card" style="margin-bottom:8px"><div class="card-name">Bloque ${l.bloque} - ${l.horometro}</div>
      <div style="font-size:12px;color:var(--ts)">${fmtFecha(l.fecha)} | Op: ${l.operario}</div><div style="font-size:16px;font-weight:bold;color:var(--verde-m)">${l.lectura} h</div></div>`;
  });
  document.getElementById('historial-global-content').innerHTML = html || '<div class="empty">Sin lecturas.</div>';
}

function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); document.getElementById(id).classList.add('show'); }
function setNavSel(id) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('sel')); document.getElementById(id).classList.add('sel'); }
function switchDT(id, el) { document.querySelectorAll('.dtab').forEach(t => t.classList.remove('sel')); document.querySelectorAll('.dview').forEach(v => v.classList.remove('show')); el.classList.add('sel'); document.getElementById('dv-'+id).classList.add('show'); }

function irBloques() { showScreen('sc-inicio'); setNavSel('nb-bloques'); }
function irSiembra() { showScreen('sc-siembra'); setNavSel('nb-siembra'); renderMapaCamas(); }
function irAlertas() { showScreen('sc-alertas'); setNavSel('nb-alertas'); precalcularAlertas(); }
function irRecorrido() { renderRecorrido(); }
function irHistorialGlobal() { showScreen('sc-historial-global'); setNavSel('nb-historial'); renderHistorialGlobal(); }
function volver() { irBloques(); }

// ── RED Y SINCRO ──────────────────────────
function checkOnlineStatus() {
  const banner = document.getElementById('offline-banner'), syncDot = document.getElementById('sync-dot'), syncText = document.getElementById('sync-text');
  if (navigator.onLine) { banner.classList.remove('show'); if(syncDot) syncDot.style.background = '#9FE1CB'; if(syncText) syncText.textContent = 'Online'; trySyncData(); } 
  else { banner.classList.add('show'); if(syncDot) syncDot.style.background = '#EF9F27'; if(syncText) syncText.textContent = 'Offline'; }
}
window.addEventListener('online', checkOnlineStatus);
window.addEventListener('offline', checkOnlineStatus);

async function trySyncData() {
  if (!navigator.onLine) return; const queue = await getSyncQueue();
  for (let item of queue) {
    try { const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(item) });
      if ((await res.json()).status === 'ok') await dbDelete('sync_queue', item.id);
    } catch (e) { break; }
  }
}

// ── INIT ──────────────────────────────────
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
initLogin();
