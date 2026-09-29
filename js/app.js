
const STORAGE_KEY = 'panel-programa-v4';
const ESTADOS = ['En curso', 'Sin movimiento', 'Retrasada', 'Terminado'];
const ESTADO_COLOR = { 'En curso': '#29a0e0', 'Sin movimiento': '#f2b134', 'Retrasada': '#e0524a', 'Terminado': '#1fa971' };
const ESTADO_BG = { 'En curso': 'var(--accent-soft)', 'Sin movimiento': 'var(--amber-soft)', 'Retrasada': 'var(--red-soft)', 'Terminado': 'var(--green-soft)' };
const ESTADO_INK = { 'En curso': 'var(--accent-dark)', 'Sin movimiento': 'var(--amber)', 'Retrasada': 'var(--red)', 'Terminado': 'var(--green)' };

function uid() { return 'id' + Math.random().toString(36).slice(2, 9); }

let appData = null;

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error leyendo localStorage', e);
  }
  return null;
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (e) {
    console.error('Error guardando en localStorage', e);
  }
}

/* ---------- Carga Inicial y Fetch Asíncrono ---------- */
async function initApp() {
  const local = loadLocalData();
  if (local) {
    appData = local;
  } else {
    try {
      const response = await fetch('./data/datos-programa.json');
      if (!response.ok) throw new Error('No se pudo cargar el archivo JSON.');
      appData = await response.json();
    } catch (err) {
      console.warn('Fallback: usando datos mínimos locales debido a un error de carga.', err);
      appData = {
        proyecto: { codigo: "INID240009", nombre: "Conecta e Innova", periodo: "2024–2027" },
        objetivos: []
      };
    }
  }

  // Inicializar cabecera
  document.getElementById('brand-name').textContent = appData.proyecto.nombre || 'Panel';
  document.getElementById('brand-code').textContent = appData.proyecto.codigo || '—';
  document.getElementById('logo-initials').textContent = (appData.proyecto.nombre || '?').trim().charAt(0).toUpperCase();

  // Enrutamiento por parámetros URL (?report= o ?gantt=)
  const __reportId = new URLSearchParams(location.search).get('report');
  const __ganttId = new URLSearchParams(location.search).get('gantt');

  if (__reportId) {
    showReportPage(__reportId);
  } else if (__ganttId) {
    showGanttPage(__ganttId);
  } else {
    renderPrograma();
    renderObjetivos();
    renderActividadesTab();
    renderCalendario();
  }
}

/* ---------- Navegación Sidebar ---------- */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i === item));
    ['programa', 'objetivos', 'actividades', 'calendario', 'indicadores'].forEach(v => {
      document.getElementById('view-' + v).classList.toggle('active', item.dataset.view === v);
    });
    document.getElementById('global-search').value = '';
    if (item.dataset.view === 'programa') renderPrograma();
    if (item.dataset.view === 'objetivos') renderObjetivos();
    if (item.dataset.view === 'actividades') renderActividadesTab();
    if (item.dataset.view === 'calendario') renderCalendario();
    if (item.dataset.view === 'indicadores') renderIndicadores();
  });
});

/* ---------- Utilidades de Avance y Formato ---------- */
function pctActividad(a) {
  if (a.tareas && a.tareas.length) {
    const suma = a.tareas.reduce((s, t) => s + (t.done ? (Number(t.peso) || 0) : 0), 0);
    return Math.max(0, Math.min(100, Math.round(suma)));
  }
  return a.avance || 0;
}

function pctHito(h) {
  if (!h.actividades.length) return 0;
  return Math.round(h.actividades.reduce((s, a) => s + pctActividad(a), 0) / h.actividades.length);
}

function pctObjetivo(o) {
  if (!o.hitos.length) return 0;
  return Math.round(o.hitos.reduce((s, h) => s + pctHito(h), 0) / o.hitos.length);
}

function avancePlanificado(a) {
  if (!a.fechaInicio || !a.fechaFin) return null;
  const start = new Date(a.fechaInicio).getTime();
  const end = new Date(a.fechaFin).getTime();
  const now = Date.now();
  if (isNaN(start) || isNaN(end) || end <= start) return null;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }
function escapeHtml(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function findObj(id) { return appData.objetivos.find(o => o.id === id); }
function findHito(o, id) { return o.hitos.find(h => h.id === id); }
function findAct(h, id) { return h.actividades.find(a => a.id === id); }
function findActAnywhere(actId) {
  for (const o of appData.objetivos) {
    for (const h of o.hitos) {
      const a = h.actividades.find(x => x.id === actId);
      if (a) return { o, h, a };
    }
  }
  return null;
}

/* ============ PESTAÑA OBJETIVOS ============ */
let path = { objId: null, hitoId: null, actId: null };
let objSortMode = 'none';

function shortHitoLabel(nombre) {
  const m = (nombre || '').match(/^[\d.]+/);
  return m ? m[0] : nombre;
}

function shortObjLabel(nombre) {
  const m = (nombre || '').match(/^Objetivo\s+\d+/i);
  return m ? m[0] : nombre;
}

function renderObjBreadcrumb() {
  const bc = document.getElementById('obj-breadcrumb');
  const o = path.objId ? findObj(path.objId) : null;
  if (!o) { bc.innerHTML = ''; return; }
  const h = path.hitoId ? findHito(o, path.hitoId) : null;
  const a = (h && path.actId) ? findAct(h, path.actId) : null;
  const parts = [{ label: shortObjLabel(o.nombre), full: o.nombre, onClick: () => { path.hitoId = null; path.actId = null; renderObjetivos(); } }];
  if (h) parts.push({ label: shortHitoLabel(h.nombre), full: h.nombre, onClick: () => { path.actId = null; renderObjetivos(); } });
  if (a) parts.push({ label: a.nombre, full: a.nombre, onClick: null });
  parts[parts.length - 1].label = parts[parts.length - 1].full;
  renderBreadcrumbInto(bc, parts, () => {
    if (path.actId) path.actId = null;
    else if (path.hitoId) path.hitoId = null;
    renderObjetivos();
  });
}

function renderBreadcrumbInto(container, parts, onBack) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'breadcrumb';
  if (parts.length > 1) {
    const back = document.createElement('button');
    back.className = 'back-btn';
    back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Atrás';
    back.addEventListener('click', onBack);
    wrap.appendChild(back);
  }
  parts.forEach((p, i) => {
    const span = document.createElement('span');
    span.className = 'crumb' + (p.onClick ? '' : ' current');
    span.textContent = p.label;
    if (p.onClick) span.addEventListener('click', p.onClick);
    wrap.appendChild(span);
    if (i < parts.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '›';
      wrap.appendChild(sep);
    }
  });
  container.appendChild(wrap);
}

function statusChip(estado) {
  return `<span class="status-chip" style="background:${ESTADO_BG[estado]};color:${ESTADO_INK[estado]}">${estado}</span>`;
}

function renderObjTabs() {
  const tabsWrap = document.getElementById('obj-tabs');
  tabsWrap.innerHTML = '';
  appData.objetivos.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'obj-tab' + (path.objId === o.id ? ' active' : '');
    btn.innerHTML = `${escapeHtml(shortObjLabel(o.nombre))} <span class="tab-pct">${pctObjetivo(o)}%</span>`;
    btn.addEventListener('click', () => {
      path = { objId: o.id, hitoId: null, actId: null };
      renderObjetivos();
    });
    tabsWrap.appendChild(btn);
  });
}

function renderGlobalSearch(query) {
  const q = query.trim().toLowerCase();
  document.getElementById('obj-tabs').innerHTML = '';
  document.getElementById('obj-actions').innerHTML = '';
  const bc = document.getElementById('obj-breadcrumb');
  bc.innerHTML = `<div class="breadcrumb"><span class="crumb current"><i class="fa-solid fa-magnifying-glass"></i> Resultados para "${escapeHtml(query)}"</span></div>`;

  const content = document.getElementById('obj-content');
  content.innerHTML = '';

  const results = [];
  appData.objetivos.forEach(o => {
    if (o.nombre.toLowerCase().includes(q)) results.push({ level: 'objetivo', o });
    o.hitos.forEach(h => {
      if (h.nombre.toLowerCase().includes(q)) results.push({ level: 'hito', o, h });
      h.actividades.forEach(a => {
        const haystack = [a.nombre, a.responsable, a.descripcionAvance, a.resultadoEsperado, a.justificacionDesviacion]
          .filter(Boolean).join(' ').toLowerCase();
        if (haystack.includes(q)) results.push({ level: 'actividad', o, h, a });
      });
    });
  });

  if (!results.length) {
    content.innerHTML = `<div class="empty-hint">Sin resultados para "${escapeHtml(query)}".</div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'box-grid';
  results.forEach(r => {
    let title, sub, pct;
    if (r.level === 'objetivo') { title = r.o.nombre; sub = 'Objetivo'; pct = pctObjetivo(r.o); }
    else if (r.level === 'hito') { title = r.h.nombre; sub = r.o.nombre; pct = pctHito(r.h); }
    else { title = r.a.nombre; sub = `${shortObjLabel(r.o.nombre)} · ${shortHitoLabel(r.h.nombre)}`; pct = pctActividad(r.a); }

    const box = makeBox({
      title, sub, pct, noActions: true,
      onOpen: () => {
        path.objId = r.o.id;
        path.hitoId = r.h ? r.h.id : null;
        path.actId = r.a ? r.a.id : null;
        const input = document.getElementById('global-search');
        input.value = '';
        renderObjetivos();
      },
      onDelete: () => {}
    });
    if (r.level === 'actividad') {
      const chip = document.createElement('div');
      chip.innerHTML = statusChip(r.a.estado);
      box.insertBefore(chip.firstChild, box.querySelector('.box-title'));
    }
    grid.appendChild(box);
  });
  content.appendChild(grid);
}

function renderObjActions() {
  const wrap = document.getElementById('obj-actions');
  wrap.innerHTML = '';
  if (!path.objId) return;
  const o = findObj(path.objId);

  if (!path.hitoId) {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-link';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Nuevo hito';
    addBtn.addEventListener('click', () => {
      o.hitos.push({ id: uid(), nombre: 'Nuevo hito', actividades: [] });
      saveData();
      renderObjetivos();
    });
    wrap.appendChild(addBtn);
  } else if (!path.actId) {
    const h = findHito(o, path.hitoId);

    const addBtn = document.createElement('button');
    addBtn.className = 'add-link';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Nueva actividad';
    addBtn.addEventListener('click', () => {
      h.actividades.push({ id: uid(), nombre: 'Nueva actividad', responsable: '', fechaInicio: '', fechaFin: '', avance: 0, estado: 'En curso', destacada: false, tareas: [] });
      saveData();
      renderObjetivos();
    });
    wrap.appendChild(addBtn);

    const sortWrap = document.createElement('div');
    sortWrap.className = 'sort-row';
    sortWrap.innerHTML = `
      <label>Ordenar por</label>
      <select id="obj-sort">
        <option value="none">Sin orden</option>
        <option value="inicio_asc">Fecha inicio: más próxima primero</option>
        <option value="inicio_desc">Fecha inicio: más antigua primero</option>
        <option value="rango_desc">Rango (duración): mayor a menor</option>
        <option value="rango_asc">Rango (duración): menor a mayor</option>
      </select>
    `;
    sortWrap.querySelector('#obj-sort').value = objSortMode;
    sortWrap.querySelector('#obj-sort').addEventListener('change', (e) => {
      objSortMode = e.target.value;
      renderObjetivos();
    });
    wrap.appendChild(sortWrap);
  }
}

function renderObjetivos(filterText) {
  if (!path.objId && appData.objetivos.length) path.objId = appData.objetivos[0].id;
  renderObjTabs();
  renderObjBreadcrumb();
  renderObjActions();
  const content = document.getElementById('obj-content');
  content.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'box-grid';
  const q = (filterText || '').trim().toLowerCase();

  if (!path.objId) {
    content.innerHTML = '<div class="empty-hint">No hay objetivos cargados en este panel.</div>';
    return;
  }

  if (!path.hitoId) {
    const o = findObj(path.objId);
    o.hitos.filter(h => !q || h.nombre.toLowerCase().includes(q)).forEach(h => {
      const pct = pctHito(h);
      const box = makeBox({
        title: h.nombre, sub: `${h.actividades.length} actividad(es)`, pct, locked: !!h.locked,
        onOpen: () => { path.hitoId = h.id; renderObjetivos(); },
        onDelete: () => { o.hitos = o.hitos.filter(x => x !== h); saveData(); renderObjetivos(); }
      });
      grid.appendChild(box);
    });
  } else if (!path.actId) {
    const o = findObj(path.objId), h = findHito(o, path.hitoId);
    let lista = h.actividades.filter(a => !q || a.nombre.toLowerCase().includes(q)).map((a, i) => ({ a, i }));
    const toTime = (s) => s ? new Date(s).getTime() : null;

    if (objSortMode === 'inicio_asc' || objSortMode === 'inicio_desc') {
      lista.sort((x, y) => {
        const tx = toTime(x.a.fechaInicio), ty = toTime(y.a.fechaInicio);
        if (tx === null && ty === null) return x.i - y.i;
        if (tx === null) return 1;
        if (ty === null) return -1;
        return objSortMode === 'inicio_asc' ? tx - ty : ty - tx;
      });
    } else if (objSortMode === 'rango_desc' || objSortMode === 'rango_asc') {
      lista.sort((x, y) => {
        const rx = (toTime(x.a.fechaFin) ?? 0) - (toTime(x.a.fechaInicio) ?? 0);
        const ry = (toTime(y.a.fechaFin) ?? 0) - (toTime(y.a.fechaInicio) ?? 0);
        return objSortMode === 'rango_desc' ? ry - rx : rx - ry;
      });
    }

    lista.forEach(({ a }) => {
      const pct = pctActividad(a);
      const box = makeBox({
        title: a.nombre, sub: a.responsable || 'Sin responsable', pct, locked: !!a.locked,
        onOpen: () => { path.actId = a.id; renderObjetivos(); },
        onDelete: () => { h.actividades = h.actividades.filter(x => x !== a); saveData(); renderObjetivos(); }
      });
      const chip = document.createElement('div');
      chip.innerHTML = statusChip(a.estado);
      box.insertBefore(chip.firstChild, box.querySelector('.box-title'));
      grid.appendChild(box);
    });
  } else {
    const o = findObj(path.objId), h = findHito(o, path.hitoId), a = findAct(h, path.actId);
    content.appendChild(renderDetalle(a, () => renderObjetivos()));
    return;
  }

  if (!grid.children.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-hint';
    empty.textContent = q ? 'Sin resultados para tu búsqueda.' : 'No hay elementos todavía.';
    content.appendChild(empty);
    return;
  }
  content.appendChild(grid);
}

/* ============ PESTAÑA ACTIVIDADES / TAREAS ============ */
let actPath = { actId: null };

function renderActividadesTab() {
  const bc = document.getElementById('act2-breadcrumb');
  const content = document.getElementById('act2-content');
  const found = actPath.actId ? findActAnywhere(actPath.actId) : null;
  const a = found ? found.a : null;

  const parts = [{ label: 'Actividades destacadas', onClick: () => { actPath = { actId: null }; renderActividadesTab(); } }];
  if (a) parts.push({ label: a.nombre, onClick: null });
  renderBreadcrumbInto(bc, parts, () => { actPath.actId = null; renderActividadesTab(); });

  content.innerHTML = '';

  if (!a) {
    const destacadas = [];
    appData.objetivos.forEach(o => o.hitos.forEach(h => h.actividades.forEach(act => {
      if (act.destacada) destacadas.push({ o, h, act });
    })));
    if (!destacadas.length) {
      content.innerHTML = '<div class="empty-hint">Todavía no marcaste ninguna actividad con estrella. Entra al detalle de una actividad en "Objetivos" y usa el botón de estrella junto a "Ver dashboard".</div>';
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'box-grid';
    destacadas.forEach(({ o, h, act }) => {
      const box = makeBox({
        title: act.nombre, sub: `${o.nombre} · ${h.nombre}`, pct: pctActividad(act),
        onOpen: () => { actPath.actId = act.id; renderActividadesTab(); },
        onDelete: () => { act.destacada = false; saveData(); renderActividadesTab(); },
        deleteLabel: 'star'
      });
      const chip = document.createElement('div');
      chip.innerHTML = statusChip(act.estado);
      box.insertBefore(chip.firstChild, box.querySelector('.box-title'));
      grid.appendChild(box);
    });
    content.appendChild(grid);
    return;
  }

  content.appendChild(renderDetalle(a, () => renderActividadesTab()));
}

/* ============ Boxes y Detalle de Actividad ============ */
function makeBox({ title, sub, pct, onOpen, onDelete, star, deleteLabel, locked, noActions }) {
  const box = document.createElement('div');
  box.className = 'box' + (star ? ' has-star' : '');
  box.innerHTML = `
    ${star ? `<button class="star${star.on ? ' on' : ''}"><i class="fa-solid fa-star"></i></button>` : ''}
    ${noActions ? '' : (locked
      ? `<span class="lock-badge" title="Cargado desde la Carta Gantt — no editable"><i class="fa-solid fa-lock"></i></span>`
      : `<button class="del">${deleteLabel === 'star' ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-solid fa-xmark"></i>'}</button>`
    )}
    <div class="box-title">${escapeHtml(title)}</div>
    <div class="box-sub">${escapeHtml(sub)}</div>
    <div class="pct-row"><div class="pct">${pct}%</div></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  `;
  box.addEventListener('click', (e) => { if (!e.target.closest('.del') && !e.target.closest('.star')) onOpen(); });
  const delBtn = box.querySelector('.del');
  if (delBtn) delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (deleteLabel === 'star') { onDelete(); return; }
    if (confirm('¿Eliminar "' + title + '"? Esto borra también lo que tenga dentro.')) onDelete();
  });
  if (star) {
    box.querySelector('.star').addEventListener('click', (e) => { e.stopPropagation(); star.onToggle(); });
  }
  return box;
}

function importTasksFromExcel(file, a, onDone) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.find(n => /gantt/i.test(n)) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) { alert('Ese archivo no tiene datos.'); return; }

      const header = rows[0].map(h => String(h).toLowerCase().trim());
      const idx = (patterns) => header.findIndex(h => patterns.some(p => h.includes(p)));
      const iTarea = idx(['tarea']);
      const iResp = idx(['responsable']);
      const iEstado = idx(['estado']);
      const iPrioridad = idx(['prioridad']);
      const iFecha = idx(['fecha']);
      const iNotas = idx(['nota', 'distribuible']);

      if (iTarea === -1) { alert('No encontré una columna "Tarea" en la hoja "' + sheetName + '".'); return; }

      const dataRows = rows.slice(1).filter(r => r[iTarea] && String(r[iTarea]).trim());
      if (!dataRows.length) { alert('No encontré filas con tareas en ese archivo.'); return; }

      if (!a.tareas) a.tareas = [];
      const restante = Math.max(0, 100 - pctActividad(a));
      const pesoCada = dataRows.length ? Math.round((restante / dataRows.length) * 10) / 10 : 0;

      dataRows.forEach(r => {
        const estadoTexto = iEstado !== -1 ? String(r[iEstado] || '').toLowerCase() : '';
        const done = /complet/.test(estadoTexto);
        let fechaInicio = '';
        if (iFecha !== -1 && r[iFecha]) {
          const v = r[iFecha];
          if (v instanceof Date && !isNaN(v)) fechaInicio = v.toISOString().slice(0, 10);
          else if (typeof v === 'string' && v.trim()) fechaInicio = v.trim();
        }
        a.tareas.push({
          t: String(r[iTarea]).trim(),
          done,
          peso: pesoCada,
          fechaInicio,
          fechaFin: '',
          responsable: iResp !== -1 ? String(r[iResp] || '').trim() : '',
          prioridad: iPrioridad !== -1 ? String(r[iPrioridad] || '').trim() : '',
          notas: iNotas !== -1 ? String(r[iNotas] || '').trim() : ''
        });
      });

      onDone();
      alert(`Se cargaron ${dataRows.length} tarea(s) desde "${file.name}".`);
    } catch (err) {
      console.error(err);
      alert('No pude leer ese archivo. Revisa que sea un Excel (.xlsx) válido.');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderDetalle(a, onChange) {
  const pct = pctActividad(a);
  const wrap = document.createElement('div');
  wrap.className = 'detail-card';
  wrap.innerHTML = `
    <div class="ring-wrap">
      <div class="ring">
        <svg viewBox="0 0 78 78">
          <circle cx="39" cy="39" r="33" stroke="var(--gray-chip)"></circle>
          <circle id="det-ring" cx="39" cy="39" r="33" stroke="var(--accent)"></circle>
        </svg>
        <span>${pct}%</span>
      </div>
      <div style="flex:1">
        <h2 style="margin:0">${escapeHtml(a.nombre)}</h2>
        <div style="margin-top:8px">${statusChip(a.estado)}</div>
      </div>
      <button class="star-btn${a.destacada ? ' on' : ''}" id="d-star" title="Destacar en Actividades"><i class="fa-solid fa-star"></i> ${a.destacada ? 'Destacada' : 'Destacar'}</button>
      <button class="dash-btn" id="d-dashboard"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ver dashboard</button>
    </div>

    <details class="edit-fields">
      <summary>Editar detalles <span class="chev"><i class="fa-solid fa-chevron-down"></i></span></summary>
      <div class="row" style="margin-top:14px">
        <div class="field"><label>Nombre</label><input id="d-nombre" value="${escapeAttr(a.nombre)}"></div>
        <div class="field"><label>Responsable</label><input id="d-resp" value="${escapeAttr(a.responsable)}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Fecha inicio</label><input type="date" id="d-ini" value="${a.fechaInicio}"></div>
        <div class="field"><label>Fecha fin</label><input type="date" id="d-fin" value="${a.fechaFin}"></div>
        <div class="field"><label>Estado</label>
          <select id="d-estado">${ESTADOS.map(s => `<option ${s === a.estado ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      ${(!a.tareas || !a.tareas.length) ? `
        <div class="row"><div class="field"><label>Avance manual (%)</label><input type="number" min="0" max="100" id="d-avance" value="${a.avance || 0}"></div></div>
      ` : ''}
      <div class="row">
        <div class="field"><label>Resultado esperado</label><textarea id="d-resultado">${escapeHtml(a.resultadoEsperado || '')}</textarea></div>
      </div>
      <div class="row">
        <div class="field"><label>Año reportado</label><input id="d-anio" value="${escapeAttr(a.anioReportado || '')}"></div>
        <div class="field"><label>Fecha estimada de término</label><input type="date" id="d-festimada" value="${a.fechaEstimadaTermino || ''}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Descripción de avance a la fecha</label><textarea id="d-descavance">${escapeHtml(a.descripcionAvance || '')}</textarea></div>
      </div>
      <div class="row">
        <div class="field"><label>Justificación de la desviación (si aplica)</label><textarea id="d-justif">${escapeHtml(a.justificacionDesviacion || '')}</textarea></div>
      </div>
    </details>

    <details class="edit-fields" id="d-tasks-details">
      <summary>
        <span>Tareas a realizar <span class="tab-pct" id="d-tasks-count"></span></span>
        <span class="chev"><i class="fa-solid fa-chevron-down"></i></span>
      </summary>
      <div style="margin-top:14px">
        <p style="margin:0 0 10px;font-size:.7rem;color:var(--ink-soft)">Al marcar una tarea como hecha, su % se suma al avance total. Cada tarea nueva ya propone el % que falta para llegar a 100 — lo puedes ajustar si quieres que represente menos.</p>
        <div class="task-list" id="d-tasks"></div>
        <div class="task-toolbar">
          <button class="add-task-btn" id="d-addtask"><i class="fa-solid fa-plus"></i> Agregar tarea</button>
          <button class="add-task-btn" id="d-uploadtasks"><i class="fa-solid fa-file-arrow-up"></i> Cargar actividades (Excel)</button>
          <input type="file" id="d-file-input" accept=".xlsx,.xls" style="display:none">
        </div>
      </div>
    </details>

    <div class="gantt-section-head">
      <h3 style="font-size:.85rem;margin:0">Carta Gantt de la actividad</h3>
      <div style="display:flex; gap:8px;">
        <button class="gantt-view-btn" id="d-view-gantt"><i class="fa-solid fa-chart-gantt"></i> Ver carta Gantt</button>
        <button class="gantt-view-btn" id="d-open-json-modal" style="background:var(--gray-chip); color:var(--ink);"><i class="fa-solid fa-code"></i> Importar JSON</button>
      </div>
    </div>
    <div id="d-gantt"></div>

    <!-- Modal para pegar JSON -->
    <div class="confirm-modal-overlay" id="modal-paste-json">
      <div class="confirm-modal" style="max-width:600px;">
        <h3 style="margin-bottom:6px;"><i class="fa-solid fa-file-import"></i> Actualizar mediante JSON</h3>
        <p style="margin-bottom:12px;">Pega aquí el contenido JSON para actualizar los datos del proyecto o de esta actividad:</p>
        <textarea class="json-textarea" id="paste-json-input" placeholder='Pega tu JSON aquí...'></textarea>
        <div class="confirm-modal-actions">
          <button class="asist-btn-action" id="modal-json-cancel" style="background:var(--bg); color:var(--ink); padding:8px 14px;">Cancelar</button>
          <button class="dash-btn" id="modal-json-save" style="padding:8px 18px;"><i class="fa-solid fa-floppy-disk"></i> Guardar y actualizar</button>
        </div>
      </div>
    </div>
  `;

  const ring = wrap.querySelector('#det-ring');
  const r = 33, c = 2 * Math.PI * r;
  ring.style.strokeDasharray = c;
  ring.style.strokeDashoffset = c * (1 - pct / 100);

  if (a.locked) {
    wrap.querySelectorAll('.edit-fields input, .edit-fields select, .edit-fields textarea').forEach(el => el.disabled = true);
    const summaryEl = wrap.querySelector('.edit-fields summary');
    if (summaryEl) summaryEl.insertAdjacentHTML('beforeend', ' <span class="locked-note"><i class="fa-solid fa-lock"></i> Cargado desde la Carta Gantt</span>');
  }

  wrap.querySelector('#d-dashboard').addEventListener('click', () => {
    const base = location.origin + location.pathname;
    window.open(base + '?report=' + encodeURIComponent(a.id), '_blank');
  });

  wrap.querySelector('#d-star').addEventListener('click', (e) => {
    a.destacada = !a.destacada;
    saveData();
    e.currentTarget.classList.toggle('on', a.destacada);
    e.currentTarget.innerHTML = `<i class="fa-solid fa-star"></i> ${a.destacada ? 'Destacada' : 'Destacar'}`;
  });

  wrap.querySelector('#d-nombre').addEventListener('input', e => { a.nombre = e.target.value; saveData(); });
  wrap.querySelector('#d-resp').addEventListener('input', e => { a.responsable = e.target.value; saveData(); });
  wrap.querySelector('#d-ini').addEventListener('input', e => { a.fechaInicio = e.target.value; saveData(); renderGantt(); });
  wrap.querySelector('#d-fin').addEventListener('input', e => { a.fechaFin = e.target.value; saveData(); renderGantt(); });
  wrap.querySelector('#d-estado').addEventListener('change', e => { a.estado = e.target.value; saveData(); onChange(); });
  const avanceInp = wrap.querySelector('#d-avance');
  if (avanceInp) avanceInp.addEventListener('input', e => { a.avance = Number(e.target.value); saveData(); onChange(); });
  wrap.querySelector('#d-resultado').addEventListener('input', e => { a.resultadoEsperado = e.target.value; saveData(); });
  wrap.querySelector('#d-anio').addEventListener('input', e => { a.anioReportado = e.target.value; saveData(); });
  wrap.querySelector('#d-festimada').addEventListener('input', e => { a.fechaEstimadaTermino = e.target.value; saveData(); });
  wrap.querySelector('#d-descavance').addEventListener('input', e => { a.descripcionAvance = e.target.value; saveData(); });
  wrap.querySelector('#d-justif').addEventListener('input', e => { a.justificacionDesviacion = e.target.value; saveData(); });

  function renderTasks() {
    const tasksWrap = wrap.querySelector('#d-tasks');
    tasksWrap.innerHTML = '';
    const countEl = wrap.querySelector('#d-tasks-count');
    if (countEl) countEl.textContent = (a.tareas || []).length + ' tarea(s)';
    (a.tareas || []).forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'task-row' + (t.done ? ' done' : '') + (t.locked ? ' locked' : '');
      const metaTip = [
        t.responsable ? 'Responsable: ' + t.responsable : '',
        t.prioridad ? 'Prioridad: ' + t.prioridad : '',
        t.notas ? 'Notas: ' + t.notas : ''
      ].filter(Boolean).join('\n');
      if (metaTip) row.title = metaTip;
      row.innerHTML = `
        <input type="checkbox" ${t.done ? 'checked' : ''} ${t.locked ? 'disabled' : ''}>
        <input type="text" class="task-name" value="${escapeAttr(t.t)}" placeholder="Nombre de la tarea" ${t.locked ? 'disabled' : ''}>
        ${metaTip ? '<i class="fa-solid fa-circle-info task-meta-ico"></i>' : ''}
        <input type="number" class="task-peso" min="0" max="100" value="${t.peso || 0}" title="Peso en % que aporta al avance" ${t.locked ? 'disabled' : ''}>
        <input type="date" class="task-start" value="${t.fechaInicio || ''}" title="Inicio" ${t.locked ? 'disabled' : ''}>
        <input type="date" class="task-end" value="${t.fechaFin || ''}" title="Fin" ${t.locked ? 'disabled' : ''}>
        ${t.locked ? '<span class="lock-badge" style="position:static" title="Cargado desde la Carta Gantt"><i class="fa-solid fa-lock"></i></span>' : '<button class="rm"><i class="fa-solid fa-xmark"></i></button>'}
      `;
      row.querySelector('input[type=checkbox]').addEventListener('change', e => { t.done = e.target.checked; saveData(); renderRing(); onChange(); });
      row.querySelector('.task-name').addEventListener('input', e => { t.t = e.target.value; saveData(); });
      row.querySelector('.task-peso').addEventListener('input', e => { t.peso = Number(e.target.value); saveData(); renderRing(); onChange(); });
      row.querySelector('.task-start').addEventListener('input', e => { t.fechaInicio = e.target.value; saveData(); renderGantt(); });
      row.querySelector('.task-end').addEventListener('input', e => { t.fechaFin = e.target.value; saveData(); renderGantt(); });
      const rmBtn = row.querySelector('.rm');
      if (rmBtn) rmBtn.addEventListener('click', () => { a.tareas.splice(i, 1); saveData(); renderTasks(); renderGantt(); renderRing(); onChange(); });
      tasksWrap.appendChild(row);
    });
  }
  renderTasks();

  wrap.querySelector('#d-addtask').addEventListener('click', () => {
    if (!a.tareas) a.tareas = [];
    const restante = Math.max(0, 100 - pctActividad(a));
    a.tareas.push({ t: '', done: false, peso: restante, fechaInicio: '', fechaFin: '' });
    saveData(); renderTasks(); renderGantt(); onChange();
  });

  wrap.querySelector('#d-uploadtasks').addEventListener('click', () => {
    wrap.querySelector('#d-file-input').click();
  });
  wrap.querySelector('#d-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importTasksFromExcel(file, a, () => { saveData(); renderTasks(); renderGantt(); renderRing(); onChange(); });
    e.target.value = '';
  });

  wrap.querySelector('#d-view-gantt').addEventListener('click', () => {
    const base = location.origin + location.pathname;
    window.open(base + '?gantt=' + encodeURIComponent(a.id), '_blank');
  });

  // Modal para pegar JSON
  const modalPaste = wrap.querySelector('#modal-paste-json');
  const txtPaste = wrap.querySelector('#paste-json-input');

  wrap.querySelector('#d-open-json-modal').addEventListener('click', () => {
    txtPaste.value = '';
    modalPaste.classList.add('show');
    txtPaste.focus();
  });

  wrap.querySelector('#modal-json-cancel').addEventListener('click', () => {
    modalPaste.classList.remove('show');
  });

  wrap.querySelector('#modal-json-save').addEventListener('click', () => {
    const raw = txtPaste.value.trim();
    if (!raw) {
      alert('Debes pegar contenido JSON antes de guardar.');
      return;
    }

    try {
      const incoming = JSON.parse(raw);

      if (incoming.nombre || incoming.tareas || incoming.gruposAsistentes || incoming.presupuesto || incoming.encargados) {
        Object.assign(a, incoming);
      } else if (incoming.objetivos && Array.isArray(incoming.objetivos)) {
        if (incoming.proyecto) {
          appData.proyecto = { ...appData.proyecto, ...incoming.proyecto };
          document.getElementById('brand-name').textContent = appData.proyecto.nombre;
          document.getElementById('brand-code').textContent = appData.proyecto.codigo;
          document.getElementById('logo-initials').textContent = (appData.proyecto.nombre || '?').trim().charAt(0).toUpperCase();
        }

        incoming.objetivos.forEach(inObj => {
          let targetObj = appData.objetivos.find(o => o.id === inObj.id);
          if (!targetObj) {
            appData.objetivos.push(inObj);
            return;
          }
          targetObj.nombre = inObj.nombre || targetObj.nombre;

          (inObj.hitos || []).forEach(inHito => {
            let targetHito = targetObj.hitos.find(h => h.id === inHito.id);
            if (!targetHito) {
              targetObj.hitos.push(inHito);
              return;
            }
            targetHito.nombre = inHito.nombre || targetHito.nombre;
            targetHito.locked = inHito.locked ?? targetHito.locked;

            (inHito.actividades || []).forEach(inAct => {
              let targetAct = targetHito.actividades.find(act => act.id === inAct.id);
              if (!targetAct) {
                targetHito.actividades.push(inAct);
              } else {
                Object.assign(targetAct, inAct);
              }
            });
          });
        });
      } else {
        alert('El formato no corresponde a una actividad ni a una estructura de objetivos válida.');
        return;
      }

      saveData();
      modalPaste.classList.remove('show');
      onChange();
      alert('Datos actualizados correctamente desde el JSON.');
    } catch (err) {
      console.error(err);
      alert('Error de sintaxis: el texto pegado no es un JSON válido.');
    }
  });

  function renderGantt() {
    wrap.querySelector('#d-gantt').innerHTML = renderGanttHTML(a);
  }
  renderGantt();

  function renderRing() {
    const newPct = pctActividad(a);
    const ringEl = wrap.querySelector('#det-ring');
    const rr = 33, cc = 2 * Math.PI * rr;
    ringEl.style.strokeDashoffset = cc * (1 - newPct / 100);
    wrap.querySelector('.ring span').textContent = newPct + '%';
  }

  return wrap;
}

function renderGanttHTML(a) {
  const tareasConFecha = (a.tareas || []).filter(t => t.fechaInicio && t.fechaFin);
  if (!tareasConFecha.length) {
    return '<div class="empty-hint" style="padding:16px">Agrega fecha de inicio y fin a las tareas para ver la carta Gantt de esta actividad.</div>';
  }
  let allDates = [];
  tareasConFecha.forEach(t => { allDates.push(new Date(t.fechaInicio).getTime(), new Date(t.fechaFin).getTime()); });
  if (a.fechaInicio) allDates.push(new Date(a.fechaInicio).getTime());
  if (a.fechaFin) allDates.push(new Date(a.fechaFin).getTime());
  const min = Math.min(...allDates), max = Math.max(...allDates);
  const span = Math.max(1, max - min);
  const todayPct = Math.max(0, Math.min(100, ((Date.now() - min) / span) * 100));

  let rows = (a.tareas || []).map(t => {
    if (!t.fechaInicio || !t.fechaFin) return '';
    const start = new Date(t.fechaInicio).getTime(), end = new Date(t.fechaFin).getTime();
    const left = ((start - min) / span) * 100;
    const width = Math.max(1.5, ((end - start) / span) * 100);
    return `
      <div class="gantt-row">
        <div class="gantt-label" title="${escapeAttr(t.t)}">${escapeHtml(t.t || '(sin nombre)')}</div>
        <div class="gantt-track">
          <div class="gantt-bar${t.done ? ' done' : ''}" style="left:${left}%;width:${width}%"></div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="gantt-chart">
      <div class="gantt-today-line" style="left:calc(150px + ${todayPct}% * (100% - 150px) / 100)"></div>
      ${rows}
    </div>
  `;
}

/* ============ VISTA AVANCE Y DASHBOARD ============ */
let charts = {};
function destroyCharts() { Object.values(charts).forEach(c => c && c.destroy()); charts = {}; }

function allActividadesFlat() {
  const list = [];
  appData.objetivos.forEach(o => o.hitos.forEach(h => h.actividades.forEach(a => list.push({ ...a, _o: o, _h: h }))));
  return list;
}

function renderPrograma() {
  const acts = allActividadesFlat();
  const wrap = document.getElementById('programa-content');
  if (!acts.length) {
    wrap.innerHTML = '<div class="empty-hint">Aún no hay actividades cargadas. Ve a "Objetivos" para crear objetivos, hitos y actividades.</div>';
    return;
  }
  const avanceReal = Math.round(acts.reduce((s, a) => s + pctActividad(a), 0) / acts.length);
  const totalHitos = appData.objetivos.reduce((s, o) => s + o.hitos.length, 0);
  const retrasadas = acts.filter(a => a.estado === 'Retrasada').length;
  const hoy = new Date();
  const vencidasSinCierre = acts.filter(a => a.fechaFin && new Date(a.fechaFin) < hoy && pctActividad(a) < 100).length;
  const requierenRevision = acts.filter(a => a.estado === 'Retrasada' || (a.fechaFin && new Date(a.fechaFin) < hoy && pctActividad(a) < 100)).length;

  wrap.innerHTML = `
    <div class="stat-strip">
      <div class="stat-block"><div class="lbl">Avance real</div><div class="val-row"><div class="val">${avanceReal}%</div></div><div class="sub">promedio de actividades</div></div>
      <div class="stat-block"><div class="lbl">Actividades</div><div class="val-row"><div class="val">${acts.length}</div></div><div class="sub">${totalHitos} hito(s) visibles</div></div>
      <div class="stat-block"><div class="lbl">Retrasadas</div><div class="val-row"><div class="val">${retrasadas}</div>${retrasadas > 0 ? '<span class="delta bad">revisar</span>' : ''}</div><div class="sub">según estado reportado</div></div>
      <div class="stat-block"><div class="lbl">Vencidas sin cierre</div><div class="val-row"><div class="val">${vencidasSinCierre}</div>${vencidasSinCierre > 0 ? '<span class="delta bad">revisar</span>' : ''}</div><div class="sub">fecha fin superada</div></div>
    </div>
    <div class="charts-grid">
      <div class="chart-card">
        <h3>Avance real por objetivo</h3>
        <p class="hint">Comparado con lo esperado según las fechas cargadas.</p>
        <canvas id="chart-plan" height="220"></canvas>
      </div>
      <div class="chart-card">
        <h3>Estado de las actividades</h3>
        <p class="hint">Distribución por estado.</p>
        <canvas id="chart-estado" height="220"></canvas>
        ${requierenRevision > 0 ? `<div class="alert"><i class="fa-solid fa-triangle-exclamation"></i> ${requierenRevision} actividad(es) requieren revisión.</div>` : ''}
      </div>
    </div>
    <div class="chart-card" style="margin-top:16px">
      <h3>Avance por hito</h3>
      <p class="hint">Para localizar dónde se concentra el atraso.</p>
      <canvas id="chart-hitos" height="${Math.max(180, totalHitos * 32)}"></canvas>
    </div>
  `;

  destroyCharts();
  const objLabels = [], objReal = [], objPlan = [];
  appData.objetivos.forEach(o => {
    if (!o.hitos.length) return;
    objLabels.push(o.nombre);
    objReal.push(pctObjetivo(o));
    const plans = [];
    o.hitos.forEach(h => h.actividades.forEach(a => { const p = avancePlanificado(a); if (p !== null) plans.push(p); }));
    objPlan.push(plans.length ? Math.round(plans.reduce((s, v) => s + v, 0) / plans.length) : 0);
  });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? '#2a2d33' : '#eceef1';
  const fontColor = isDark ? '#9198a1' : '#888d96';

  charts.plan = new Chart(document.getElementById('chart-plan'), {
    type: 'bar',
    data: {
      labels: objLabels,
      datasets: [
        { label: 'Planificado', data: objPlan, backgroundColor: isDark ? '#1c2c3f' : '#d3ecf9', borderRadius: 6 },
        { label: 'Real', data: objReal, backgroundColor: '#29a0e0', borderRadius: 6 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      scales: {
        x: { min: 0, max: 100, ticks: { color: fontColor, callback: v => v + '%' }, grid: { color: gridColor } },
        y: { ticks: { color: fontColor }, grid: { display: false } }
      },
      plugins: { legend: { position: 'top', align: 'start', labels: { color: fontColor, boxWidth: 10, usePointStyle: true } } }
    }
  });

  const counts = {}; ESTADOS.forEach(s => counts[s] = 0);
  acts.forEach(a => counts[a.estado] = (counts[a.estado] || 0) + 1);
  charts.estado = new Chart(document.getElementById('chart-estado'), {
    type: 'bar',
    data: {
      labels: ESTADOS,
      datasets: [{ data: ESTADOS.map(s => counts[s]), backgroundColor: ESTADOS.map(s => ESTADO_COLOR[s]), borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Actividades', color: fontColor }, ticks: { color: fontColor }, grid: { color: gridColor } },
        y: { ticks: { color: fontColor }, grid: { display: false } }
      }
    }
  });

  const hitoLabels = [], hitoVals = [], hitoColors = [];
  appData.objetivos.forEach(o => o.hitos.forEach(h => {
    if (!h.actividades.length) return;
    hitoLabels.push(h.nombre);
    const v = pctHito(h);
    hitoVals.push(v);
    hitoColors.push(v >= 50 ? '#1fa971' : '#e0524a');
  }));

  const order = hitoVals.map((v, i) => i).sort((a, b) => hitoVals[b] - hitoVals[a]);
  charts.hitos = new Chart(document.getElementById('chart-hitos'), {
    type: 'bar',
    data: {
      labels: order.map(i => hitoLabels[i]),
      datasets: [{ data: order.map(i => hitoVals[i]), backgroundColor: order.map(i => hitoColors[i]), borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, title: { display: true, text: 'Avance real (%)', color: fontColor }, ticks: { color: fontColor, callback: v => v + '%' }, grid: { color: gridColor } },
        y: { ticks: { color: fontColor }, grid: { display: false } }
      }
    }
  });
}

/* ---------- Report Page Standalone (?report=ID) ---------- */
function showReportPage(actId) {
  document.querySelector('.app').style.display = 'none';
  const page = document.getElementById('report-page');
  page.style.display = 'block';

  if (actId === 'general') { renderGeneralReportPage(page); return; }

  const found = findActAnywhere(actId);
  if (!found) {
    page.innerHTML = `
      <div class="report-wrap">
        <div class="detail-card" style="text-align:center">
          <p style="color:var(--ink-soft)">No se encontró esa actividad.</p>
          <button class="report-back" id="rp-back"><i class="fa-solid fa-arrow-left"></i> Volver al panel</button>
        </div>
      </div>`;
    document.getElementById('rp-back').addEventListener('click', () => { location.href = location.pathname; });
    return;
  }

  const { o, h, a } = found;
  const pct = pctActividad(a);

  function render() {
    page.innerHTML = `
      <div class="report-wrap">
        <div class="report-topbar">
          <div class="report-brand">
            <div class="logo-mark" style="width:26px;height:26px;font-size:.7rem">${(appData.proyecto.nombre || '?').charAt(0).toUpperCase()}</div>
            ${escapeHtml(appData.proyecto.nombre)}
            <span class="report-tag">Reporte de actividad</span>
          </div>
          <button class="report-back" id="rp-back"><i class="fa-solid fa-arrow-left"></i> Volver al panel</button>
        </div>
        <div class="report-path">${escapeHtml(o.nombre)} › ${escapeHtml(h.nombre)}</div>
        <div class="detail-card">
          <div class="ring-wrap">
            <div class="ring">
              <svg viewBox="0 0 78 78">
                <circle cx="39" cy="39" r="33" stroke="var(--gray-chip)"></circle>
                <circle id="rp-ring" cx="39" cy="39" r="33" stroke="var(--accent)"></circle>
              </svg>
              <span>${pct}%</span>
            </div>
            <div style="flex:1">
              <h2 style="margin:0">${escapeHtml(a.nombre)}</h2>
              <div style="margin-top:8px">${statusChip(a.estado)}</div>
            </div>
          </div>
          <div class="report-grid">
            <div class="report-stat"><div class="lbl">Responsable</div><div class="val">${escapeHtml(a.responsable || '—')}</div></div>
            <div class="report-stat"><div class="lbl">Fecha inicio</div><div class="val">${a.fechaInicio || '—'}</div></div>
            <div class="report-stat"><div class="lbl">Fecha fin</div><div class="val">${a.fechaFin || '—'}</div></div>
            <div class="report-stat"><div class="lbl">Año reportado</div><div class="val">${escapeHtml(a.anioReportado || '—')}</div></div>
            <div class="report-stat"><div class="lbl">Fecha estimada de término</div><div class="val">${a.fechaEstimadaTermino || '—'}</div></div>
          </div>
          ${a.resultadoEsperado ? `<div class="note-block"><div class="lbl">Resultado esperado</div><p>${escapeHtml(a.resultadoEsperado)}</p></div>` : ''}
          ${a.descripcionAvance ? `<div class="note-block"><div class="lbl">Descripción de avance a la fecha</div><p>${escapeHtml(a.descripcionAvance)}</p></div>` : ''}
          ${a.justificacionDesviacion ? `<div class="note-block"><div class="lbl">Justificación de la desviación</div><p>${escapeHtml(a.justificacionDesviacion)}</p></div>` : ''}
          <h3 style="font-size:.85rem;margin:20px 0 8px">Tareas</h3>
          <div class="task-list" id="rp-tasks"></div>
          <button class="add-task-btn" id="rp-addtask"><i class="fa-solid fa-plus"></i> Agregar tarea</button>
          <h3 style="font-size:.85rem;margin:22px 0 8px">Carta Gantt de la actividad</h3>
          <div id="rp-gantt">${renderGanttHTML(a)}</div>
        </div>
      </div>
    `;
    const ring = document.getElementById('rp-ring');
    const r = 33, c = 2 * Math.PI * r;
    ring.style.strokeDasharray = c;
    ring.style.strokeDashoffset = c * (1 - pct / 100);

    const tasksWrap = document.getElementById('rp-tasks');
    (a.tareas || []).forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'task-row' + (t.done ? ' done' : '') + (t.locked ? ' locked' : '');
      row.innerHTML = `
        <input type="checkbox" ${t.done ? 'checked' : ''} ${t.locked ? 'disabled' : ''}>
        <input type="text" class="task-name" value="${escapeAttr(t.t)}" placeholder="Nombre de la tarea" ${t.locked ? 'disabled' : ''}>
        <input type="number" class="task-peso" min="0" max="100" value="${t.peso || 0}" title="Peso en % que aporta al avance" ${t.locked ? 'disabled' : ''}>
        <input type="date" class="task-start" value="${t.fechaInicio || ''}" title="Inicio" ${t.locked ? 'disabled' : ''}>
        <input type="date" class="task-end" value="${t.fechaFin || ''}" title="Fin" ${t.locked ? 'disabled' : ''}>
        ${t.locked ? '<span class="lock-badge" style="position:static" title="Cargado desde la Carta Gantt"><i class="fa-solid fa-lock"></i></span>' : '<button class="rm"><i class="fa-solid fa-xmark"></i></button>'}
      `;
      row.querySelector('input[type=checkbox]').addEventListener('change', e => { t.done = e.target.checked; saveData(); render(); });
      row.querySelector('.task-name').addEventListener('input', e => { t.t = e.target.value; saveData(); });
      row.querySelector('.task-peso').addEventListener('input', e => { t.peso = Number(e.target.value); saveData(); render(); });
      row.querySelector('.task-start').addEventListener('input', e => { t.fechaInicio = e.target.value; saveData(); document.getElementById('rp-gantt').innerHTML = renderGanttHTML(a); });
      row.querySelector('.task-end').addEventListener('input', e => { t.fechaFin = e.target.value; saveData(); document.getElementById('rp-gantt').innerHTML = renderGanttHTML(a); });
      const rmBtn = row.querySelector('.rm');
      if (rmBtn) rmBtn.addEventListener('click', () => { a.tareas.splice(i, 1); saveData(); render(); });
      tasksWrap.appendChild(row);
    });
    if (!a.tareas || !a.tareas.length) tasksWrap.innerHTML = '<div class="empty-hint" style="padding:14px">Sin tareas cargadas.</div>';

    document.getElementById('rp-addtask').addEventListener('click', () => {
      if (!a.tareas) a.tareas = [];
      const restante = Math.max(0, 100 - pctActividad(a));
      a.tareas.push({ t: '', done: false, peso: restante, fechaInicio: '', fechaFin: '' });
      saveData();
      render();
    });
    document.getElementById('rp-back').addEventListener('click', () => { location.href = location.pathname; });
  }
  render();
}

function renderGeneralReportPage(page) {
  const acts = allActividadesFlat();
  if (!acts.length) {
    page.innerHTML = `
      <div class="report-wrap">
        <div class="detail-card" style="text-align:center">
          <p style="color:var(--ink-soft)">Todavía no hay actividades cargadas en el panel.</p>
          <button class="report-back" id="rp-back"><i class="fa-solid fa-arrow-left"></i> Volver al panel</button>
        </div>
      </div>`;
    document.getElementById('rp-back').addEventListener('click', () => { location.href = location.pathname; });
    return;
  }

  const avanceReal = Math.round(acts.reduce((s, a) => s + pctActividad(a), 0) / acts.length);
  const totalHitos = appData.objetivos.reduce((s, o) => s + o.hitos.length, 0);
  const retrasadas = acts.filter(a => a.estado === 'Retrasada').length;
  const hoy = new Date();
  const vencidasSinCierre = acts.filter(a => a.fechaFin && new Date(a.fechaFin) < hoy && pctActividad(a) < 100).length;
  const requierenRevision = acts.filter(a => a.estado === 'Retrasada' || (a.fechaFin && new Date(a.fechaFin) < hoy && pctActividad(a) < 100)).length;

  page.innerHTML = `
    <div class="report-wrap">
      <div class="report-topbar">
        <div class="report-brand">
          <div class="logo-mark" style="width:26px;height:26px;font-size:.7rem">${(appData.proyecto.nombre || '?').charAt(0).toUpperCase()}</div>
          ${escapeHtml(appData.proyecto.nombre)}
          <span class="report-tag">Dashboard general</span>
        </div>
        <button class="report-back" id="rp-back"><i class="fa-solid fa-arrow-left"></i> Volver al panel</button>
      </div>

      <div class="stat-strip">
        <div class="stat-block"><div class="lbl">Avance real</div><div class="val-row"><div class="val">${avanceReal}%</div></div><div class="sub">promedio de actividades</div></div>
        <div class="stat-block"><div class="lbl">Actividades</div><div class="val-row"><div class="val">${acts.length}</div></div><div class="sub">${totalHitos} hito(s) visibles</div></div>
        <div class="stat-block"><div class="lbl">Retrasadas</div><div class="val-row"><div class="val">${retrasadas}</div>${retrasadas > 0 ? '<span class="delta bad">revisar</span>' : ''}</div><div class="sub">según estado reportado</div></div>
        <div class="stat-block"><div class="lbl">Vencidas sin cierre</div><div class="val-row"><div class="val">${vencidasSinCierre}</div>${vencidasSinCierre > 0 ? '<span class="delta bad">revisar</span>' : ''}</div><div class="sub">fecha fin superada</div></div>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <h3>Avance real por objetivo</h3>
          <p class="hint">Comparado con lo esperado según las fechas cargadas.</p>
          <canvas id="rp-chart-plan" height="220"></canvas>
        </div>
        <div class="chart-card">
          <h3>Estado de las actividades</h3>
          <p class="hint">Distribución por estado.</p>
          <canvas id="rp-chart-estado" height="220"></canvas>
          ${requierenRevision > 0 ? `<div class="alert"><i class="fa-solid fa-triangle-exclamation"></i> ${requierenRevision} actividad(es) requieren revisión.</div>` : ''}
        </div>
      </div>

      <div class="chart-card" style="margin-top:16px">
        <h3>Avance por hito</h3>
        <p class="hint">Para localizar dónde se concentra el atraso.</p>
        <canvas id="rp-chart-hitos" height="${Math.max(180, totalHitos * 32)}"></canvas>
      </div>
    </div>
  `;
  document.getElementById('rp-back').addEventListener('click', () => { location.href = location.pathname; });

  const objLabels = [], objReal = [], objPlan = [];
  appData.objetivos.forEach(o => {
    if (!o.hitos.length) return;
    objLabels.push(o.nombre);
    objReal.push(pctObjetivo(o));
    const plans = [];
    o.hitos.forEach(h => h.actividades.forEach(a => { const p = avancePlanificado(a); if (p !== null) plans.push(p); }));
    objPlan.push(plans.length ? Math.round(plans.reduce((s, v) => s + v, 0) / plans.length) : 0);
  });

  new Chart(document.getElementById('rp-chart-plan'), {
    type: 'bar',
    data: {
      labels: objLabels,
      datasets: [
        { label: 'Planificado', data: objPlan, backgroundColor: '#d3ecf9', borderRadius: 6 },
        { label: 'Real', data: objReal, backgroundColor: '#29a0e0', borderRadius: 6 }
      ]
    },
    options: {
      indexAxis: 'y',
      scales: {
        x: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#eceef1' } },
        y: { grid: { display: false } }
      },
      plugins: { legend: { position: 'top', align: 'start', labels: { boxWidth: 10, usePointStyle: true } } }
    }
  });

  const counts = {}; ESTADOS.forEach(s => counts[s] = 0);
  acts.forEach(a => counts[a.estado] = (counts[a.estado] || 0) + 1);
  new Chart(document.getElementById('rp-chart-estado'), {
    type: 'bar',
    data: {
      labels: ESTADOS,
      datasets: [{ data: ESTADOS.map(s => counts[s]), backgroundColor: ESTADOS.map(s => ESTADO_COLOR[s]), borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Actividades' }, grid: { color: '#eceef1' } },
        y: { grid: { display: false } }
      }
    }
  });

  const hitoLabels = [], hitoVals = [], hitoColors = [];
  appData.objetivos.forEach(o => o.hitos.forEach(h => {
    if (!h.actividades.length) return;
    hitoLabels.push(h.nombre);
    const v = pctHito(h);
    hitoVals.push(v);
    hitoColors.push(v >= 50 ? '#1fa971' : '#e0524a');
  }));

  const order = hitoVals.map((v, i) => i).sort((a, b) => hitoVals[b] - hitoVals[a]);
  new Chart(document.getElementById('rp-chart-hitos'), {
    type: 'bar',
    data: {
      labels: order.map(i => hitoLabels[i]),
      datasets: [{ data: order.map(i => hitoVals[i]), backgroundColor: order.map(i => hitoColors[i]), borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, title: { display: true, text: 'Avance real (%)' }, ticks: { callback: v => v + '%' }, grid: { color: '#eceef1' } },
        y: { grid: { display: false } }
      }
    }
  });
}

/* ============ PESTAÑA CALENDARIO ============ */
let calState = { year: new Date().getFullYear(), month: new Date().getMonth(), viewingActId: null };

function allActividadesRefs() {
  const list = [];
  appData.objetivos.forEach(o => o.hitos.forEach(h => h.actividades.forEach(a => list.push({ o, h, a }))));
  return list;
}

function renderCalendario() {
  const wrap = document.getElementById('cal-content');

  if (calState.viewingActId) {
    const found = findActAnywhere(calState.viewingActId);
    wrap.innerHTML = '';
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.style.marginBottom = '16px';
    backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Volver al calendario';
    backBtn.addEventListener('click', () => { calState.viewingActId = null; renderCalendario(); });
    wrap.appendChild(backBtn);
    if (found) {
      wrap.appendChild(renderDetalle(found.a, () => renderCalendario()));
    } else {
      const empty = document.createElement('div');
      empty.className = 'empty-hint';
      empty.textContent = 'No se encontró esa actividad.';
      wrap.appendChild(empty);
    }
    return;
  }

  const refs = allActividadesRefs();
  const y = calState.year, m = calState.month;
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const byDate = {};
  function addMark(dateStr, kind, ref) {
    if (!dateStr) return;
    if (!byDate[dateStr]) byDate[dateStr] = { start: [], end: [] };
    byDate[dateStr][kind].push(ref);
  }
  refs.forEach(ref => {
    addMark(ref.a.fechaInicio, 'start', ref);
    addMark(ref.a.fechaFin, 'end', ref);
    if (ref.a.fechaEstimadaTermino && ref.a.fechaEstimadaTermino !== ref.a.fechaFin) addMark(ref.a.fechaEstimadaTermino, 'end', ref);
  });

  const firstOfMonth = new Date(y, m, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: daysInPrevMonth - startWeekday + 1 + i, outside: true, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, outside: false, dateStr });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: nextDay++, outside: true, dateStr: null });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  wrap.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" id="cal-prev"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="cal-title">${monthNames[m]} ${y}</div>
      <button class="cal-nav" id="cal-next"><i class="fa-solid fa-chevron-right"></i></button>
      <button class="cal-today" id="cal-today-btn">Hoy</button>
    </div>
    <div class="cal-grid cal-weekdays">
      ${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => `<div class="cal-weekday">${d}</div>`).join('')}
    </div>
    <div class="cal-grid" id="cal-days"></div>
    <div id="cal-day-detail"></div>
  `;

  document.getElementById('cal-prev').addEventListener('click', () => {
    calState.month--; if (calState.month < 0) { calState.month = 11; calState.year--; }
    renderCalendario();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calState.month++; if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalendario();
  });
  document.getElementById('cal-today-btn').addEventListener('click', () => {
    const now = new Date(); calState.year = now.getFullYear(); calState.month = now.getMonth();
    renderCalendario();
  });

  const daysWrap = document.getElementById('cal-days');
  cells.forEach(cell => {
    const div = document.createElement('div');
    div.className = 'cal-day' + (cell.outside ? ' outside' : '') + (cell.dateStr === todayStr ? ' today' : '');
    const marks = cell.dateStr ? byDate[cell.dateStr] : null;
    div.innerHTML = `
      <div class="cal-day-num">${cell.day}</div>
      ${marks ? `<div class="cal-dots">
        ${marks.start.length ? `<span class="cal-dot start" title="${marks.start.length} inicia(n)"></span>` : ''}
        ${marks.end.length ? `<span class="cal-dot end" title="${marks.end.length} vence(n)"></span>` : ''}
      </div>` : ''}
    `;
    if (marks && (marks.start.length || marks.end.length)) {
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => renderCalDayDetail(cell.dateStr, marks));
    }
    daysWrap.appendChild(div);
  });
}

function renderCalDayDetail(dateStr, marks) {
  const wrap = document.getElementById('cal-day-detail');
  const items = [];
  marks.start.forEach(ref => items.push({ ref, kind: 'Inicia' }));
  marks.end.forEach(ref => items.push({ ref, kind: 'Vence' }));
  wrap.innerHTML = `<h3 class="cal-detail-title">${dateStr}</h3>`;
  const list = document.createElement('div');
  list.className = 'cal-item-list';
  items.forEach(({ ref, kind }) => {
    const row = document.createElement('div');
    row.className = 'cal-item';
    row.innerHTML = `
      <span class="cal-item-kind ${kind === 'Inicia' ? 'good' : 'warn'}">${kind}</span>
      <div class="cal-item-body">
        <div class="cal-item-name">${escapeHtml(ref.a.nombre)}</div>
        <div class="cal-item-sub">${escapeHtml(ref.o.nombre)} · ${escapeHtml(ref.h.nombre)}</div>
      </div>
      <i class="fa-solid fa-chevron-right"></i>
    `;
    row.addEventListener('click', () => { calState.viewingActId = ref.a.id; renderCalendario(); });
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

/* ============ PESTAÑA INDICADORES ============ */
let indFilter = { estado: 'todos', objId: 'todos' };

function renderIndicadores() {
  const wrap = document.getElementById('ind-content');
  const refs = allActividadesRefs();
  if (!refs.length) {
    wrap.innerHTML = '<div class="empty-hint">Aún no hay actividades cargadas.</div>';
    return;
  }

  const objOptions = appData.objetivos.map(o => `<option value="${o.id}">${escapeHtml(shortObjLabel(o.nombre))}</option>`).join('');
  const estadoOptions = ESTADOS.map(s => `<option value="${s}">${s}</option>`).join('');

  wrap.innerHTML = `
    <div class="ind-filters">
      <select id="ind-f-obj"><option value="todos">Todos los objetivos</option>${objOptions}</select>
      <select id="ind-f-estado"><option value="todos">Todos los estados</option>${estadoOptions}</select>
    </div>
    <div class="ind-table-wrap">
      <table class="ind-table">
        <thead>
          <tr>
            <th>Objetivo</th><th>Hito</th><th>Actividad</th><th>Estado</th><th>Avance</th><th>Fecha inicio</th><th>Fecha fin</th>
          </tr>
        </thead>
        <tbody id="ind-tbody"></tbody>
      </table>
    </div>
  `;

  document.getElementById('ind-f-obj').value = indFilter.objId;
  document.getElementById('ind-f-estado').value = indFilter.estado;
  document.getElementById('ind-f-obj').addEventListener('change', e => { indFilter.objId = e.target.value; renderIndTable(refs); });
  document.getElementById('ind-f-estado').addEventListener('change', e => { indFilter.estado = e.target.value; renderIndTable(refs); });

  renderIndTable(refs);
}

function renderIndTable(refs) {
  const tbody = document.getElementById('ind-tbody');
  const filtered = refs.filter(({ o, a }) => {
    if (indFilter.objId !== 'todos' && o.id !== indFilter.objId) return false;
    if (indFilter.estado !== 'todos' && a.estado !== indFilter.estado) return false;
    return true;
  });
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:24px">Sin resultados para este filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(({ o, h, a }) => `
    <tr>
      <td>${escapeHtml(shortObjLabel(o.nombre))}</td>
      <td>${escapeHtml(shortHitoLabel(h.nombre))}</td>
      <td class="ind-act-name">${escapeHtml(a.nombre)}</td>
      <td>${statusChip(a.estado)}</td>
      <td><b>${pctActividad(a)}%</b></td>
      <td>${a.fechaInicio || '—'}</td>
      <td>${a.fechaFin || '—'}</td>
    </tr>
  `).join('');
}

/* ============ CARTA GANTT STANDALONE (4 TABS) ============ */
function showGanttPage(actId) {
  document.querySelector('.app').style.display = 'none';
  const page = document.getElementById('report-page');
  page.style.display = 'block';

  const found = findActAnywhere(actId);
  if (!found) {
    page.innerHTML = `
      <div class="report-wrap">
        <div class="detail-card" style="text-align:center">
          <p style="color:var(--ink-soft)">No se encontró esa actividad.</p>
          <button class="back-btn" onclick="location.href=location.pathname"><i class="fa-solid fa-arrow-left"></i> Volver al panel</button>
        </div>
      </div>`;
    return;
  }
  const { a } = found;

  if (!a.tareas) a.tareas = [];
  if (!a.encargados) a.encargados = [];
  if (!a.gruposAsistentes) a.gruposAsistentes = [];
  if (!a.presupuesto) a.presupuesto = [];

  const PRIORIDADES_GANTT = ['Urgente', 'Prioritario', 'Secundario', 'Completado'];
  const ESTADOS_GANTT = ['No iniciada', 'En curso', 'Bloqueada', 'Completada'];

  let activeTabId = 'tab-gantt';
  let pendingTabSwitch = null;
  let pendingDeleteCallback = null;

  let isEditingGantt = false;
  let workingGantt = JSON.parse(JSON.stringify(a.tareas));
  let hasPendingGantt = false;

  let isEditingEnc = false;
  let workingEnc = JSON.parse(JSON.stringify(a.encargados));
  let hasPendingEnc = false;

  let isEditingAsist = false;
  let workingAsist = JSON.parse(JSON.stringify(a.gruposAsistentes));
  let hasPendingAsist = false;

  let isEditingPres = false;
  let workingPres = JSON.parse(JSON.stringify(a.presupuesto));
  let hasPendingPres = false;

  function setDirtyGantt(isDirty) {
    hasPendingGantt = isDirty;
    const bar = page.querySelector('#gantt-save-bar');
    if (bar) bar.classList.toggle('show', isDirty);
  }

  function setDirtyEnc(isDirty) {
    hasPendingEnc = isDirty;
    const bar = page.querySelector('#enc-save-bar');
    if (bar) bar.classList.toggle('show', isDirty);
  }

  function setDirtyAsist(isDirty) {
    hasPendingAsist = isDirty;
    const bar = page.querySelector('#asist-save-bar');
    if (bar) bar.classList.toggle('show', isDirty);
  }

  function setDirtyPres(isDirty) {
    hasPendingPres = isDirty;
    const bar = page.querySelector('#pres-save-bar');
    if (bar) bar.classList.toggle('show', isDirty);
  }

  function showDeleteConfirm(title, message, onConfirm) {
    pendingDeleteCallback = onConfirm;
    const modal = page.querySelector('#gantt-global-delete-modal');
    modal.querySelector('#modal-del-title').textContent = title;
    modal.querySelector('#modal-del-msg').textContent = message;
    modal.classList.add('show');
  }

  function render() {
    const pct = pctActividad(a);

    page.innerHTML = `
      <div class="report-wrap ig-wrap">
        <div class="gantt-title-row">
          <h1 class="gantt-act-title">${escapeHtml(a.nombre)}</h1>
          <div class="gantt-act-pct">${pct}%</div>
        </div>

        <div class="gantt-tabs">
          <button class="gantt-tab-btn ${activeTabId === 'tab-gantt' ? 'active' : ''}" data-tab="tab-gantt">Carta gantt</button>
          <button class="gantt-tab-btn ${activeTabId === 'tab-encargados' ? 'active' : ''}" data-tab="tab-encargados">Encargados</button>
          <button class="gantt-tab-btn ${activeTabId === 'tab-asistentes' ? 'active' : ''}" data-tab="tab-asistentes">Asistentes</button>
          <button class="gantt-tab-btn ${activeTabId === 'tab-presupuestos' ? 'active' : ''}" data-tab="tab-presupuestos">Presupuestos</button>
        </div>

        <!-- TAB CARTA GANTT -->
        <div id="tab-gantt" class="gantt-tab-pane ${activeTabId === 'tab-gantt' ? 'active' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <p style="margin:0; font-size:.8rem; color:var(--ink-soft);">
              ${isEditingGantt ? 'Modo edición activado. Modifica tareas, prioridades, estados y links.' : 'Modo previsualización (solo lectura).'}
            </p>
            <div style="display:flex; gap:8px;">
              <button class="asist-btn-action asist-btn-edit ${isEditingGantt ? 'active-edit' : ''}" id="gantt-toggle-edit-btn" style="padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid ${isEditingGantt ? 'fa-eye' : 'fa-pen-to-square'}"></i> ${isEditingGantt ? 'Terminar edición' : 'Editar'}
              </button>
              <button class="asist-btn-action asist-btn-add" id="gantt-add-task-btn" style="display:${isEditingGantt ? 'inline-flex' : 'none'}; padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid fa-plus"></i> Agregar tarea
              </button>
            </div>
          </div>

          <div class="gantt-table-container">
            <table class="gantt-tbl">
              <thead>
                <tr>
                  <th style="min-width:180px;">Tarea</th>
                  <th style="min-width:120px;">Prioridad</th>
                  <th style="min-width:120px;">Responsable</th>
                  <th style="min-width:120px;">Estado</th>
                  <th style="min-width:120px;">Fecha de inicio</th>
                  <th style="min-width:180px;">Distribuible</th>
                  <th style="min-width:160px;">Notas</th>
                  ${isEditingGantt ? '<th style="width:40px; text-align:center;"></th>' : ''}
                </tr>
              </thead>
              <tbody id="gantt-table-body"></tbody>
            </table>
          </div>

          <div class="save-floating-bar" id="gantt-save-bar">
            <div class="bar-text">
              <i class="fa-solid fa-circle-exclamation" style="color:var(--amber); font-size:1.1rem;"></i>
              Tienes cambios sin guardar en la Carta Gantt.
            </div>
            <button class="dash-btn" id="gantt-save-btn" style="padding:8px 18px;">
              <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
            </button>
          </div>
        </div>

        <!-- TAB ENCARGADOS -->
        <div id="tab-encargados" class="gantt-tab-pane ${activeTabId === 'tab-encargados' ? 'active' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <p style="margin:0; font-size:.8rem; color:var(--ink-soft);">
              ${isEditingEnc ? 'Modo edición activado. Modifica tareas, encargados e insumos.' : 'Modo previsualización (solo lectura).'}
            </p>
            <div style="display:flex; gap:8px;">
              <button class="asist-btn-action asist-btn-edit ${isEditingEnc ? 'active-edit' : ''}" id="enc-toggle-edit-btn" style="padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid ${isEditingEnc ? 'fa-eye' : 'fa-pen-to-square'}"></i> ${isEditingEnc ? 'Terminar edición' : 'Editar'}
              </button>
              <button class="asist-btn-action asist-btn-add" id="enc-add-item-btn" style="display:${isEditingEnc ? 'inline-flex' : 'none'}; padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid fa-plus"></i> Agregar encargado
              </button>
            </div>
          </div>

          <div class="gantt-table-container">
            <table class="gantt-tbl">
              <thead>
                <tr>
                  <th style="min-width:220px;">Tarea</th>
                  <th style="min-width:140px;">Encargado</th>
                  <th style="min-width:260px;">Insumos</th>
                  ${isEditingEnc ? '<th style="width:40px; text-align:center;"></th>' : ''}
                </tr>
              </thead>
              <tbody id="enc-table-body"></tbody>
            </table>
          </div>

          <div class="save-floating-bar" id="enc-save-bar">
            <div class="bar-text">
              <i class="fa-solid fa-circle-exclamation" style="color:var(--amber); font-size:1.1rem;"></i>
              Tienes cambios sin guardar en la lista de encargados.
            </div>
            <button class="dash-btn" id="enc-save-btn" style="padding:8px 18px;">
              <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
            </button>
          </div>
        </div>

        <!-- TAB ASISTENTES -->
        <div id="tab-asistentes" class="gantt-tab-pane ${activeTabId === 'tab-asistentes' ? 'active' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <p style="margin:0; font-size:.8rem; color:var(--ink-soft);">
              ${isEditingAsist ? 'Modo edición activado. Modifica valores o estructura.' : 'Modo previsualización (solo lectura).'}
            </p>
            <div style="display:flex; gap:8px;">
              <button class="asist-btn-action asist-btn-edit ${isEditingAsist ? 'active-edit' : ''}" id="asist-toggle-edit-btn" style="padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid ${isEditingAsist ? 'fa-eye' : 'fa-pen-to-square'}"></i> ${isEditingAsist ? 'Terminar edición' : 'Editar'}
              </button>
              <button class="asist-btn-action asist-btn-add" id="asist-add-group-btn" style="display:${isEditingAsist ? 'inline-flex' : 'none'}; padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid fa-plus"></i> Crear nuevo grupo
              </button>
            </div>
          </div>

          <div class="gantt-table-container">
            <table class="gantt-tbl">
              <thead>
                <tr>
                  <th>Grupo / Entidad</th>
                  <th style="width:130px; text-align:right;">Cantidad</th>
                  ${isEditingAsist ? '<th style="width:40px; text-align:center;"></th>' : ''}
                </tr>
              </thead>
              <tbody id="asist-table-body"></tbody>
            </table>
          </div>

          <div class="save-floating-bar" id="asist-save-bar">
            <div class="bar-text">
              <i class="fa-solid fa-circle-exclamation" style="color:var(--amber); font-size:1.1rem;"></i>
              Tienes cambios sin guardar en la lista de asistentes.
            </div>
            <button class="dash-btn" id="asist-save-btn" style="padding:8px 18px;">
              <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
            </button>
          </div>
        </div>

        <!-- TAB PRESUPUESTOS -->
        <div id="tab-presupuestos" class="gantt-tab-pane ${activeTabId === 'tab-presupuestos' ? 'active' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <p style="margin:0; font-size:.8rem; color:var(--ink-soft);">
              ${isEditingPres ? 'Modo edición activado. Modifica valores o ítems presupuestarios.' : 'Modo previsualización (solo lectura).'}
            </p>
            <div style="display:flex; gap:8px;">
              <button class="asist-btn-action asist-btn-edit ${isEditingPres ? 'active-edit' : ''}" id="pres-toggle-edit-btn" style="padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid ${isEditingPres ? 'fa-eye' : 'fa-pen-to-square'}"></i> ${isEditingPres ? 'Terminar edición' : 'Editar'}
              </button>
              <button class="asist-btn-action asist-btn-add" id="pres-add-item-btn" style="display:${isEditingPres ? 'inline-flex' : 'none'}; padding:7px 14px; font-size:.8rem;">
                <i class="fa-solid fa-plus"></i> Agregar ítem
              </button>
            </div>
          </div>

          <div class="gantt-table-container">
            <table class="gantt-tbl">
              <thead>
                <tr>
                  <th style="min-width:140px;">Ítem</th>
                  <th style="min-width:180px;">Detalle</th>
                  <th style="width:90px; text-align:right;">Cantidad</th>
                  <th style="width:120px; text-align:right;">Costo Unitario</th>
                  <th style="width:120px; text-align:right;">Costo Total</th>
                  <th style="min-width:150px;">Observaciones</th>
                  ${isEditingPres ? '<th style="width:40px; text-align:center;"></th>' : ''}
                </tr>
              </thead>
              <tbody id="pres-table-body"></tbody>
            </table>
          </div>

          <div class="save-floating-bar" id="pres-save-bar">
            <div class="bar-text">
              <i class="fa-solid fa-circle-exclamation" style="color:var(--amber); font-size:1.1rem;"></i>
              Tienes cambios sin guardar en el presupuesto.
            </div>
            <button class="dash-btn" id="pres-save-btn" style="padding:8px 18px;">
              <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
            </button>
          </div>
        </div>
      </div>

      <!-- Modal de confirmación al cambiar de pestaña sin guardar -->
      <div class="confirm-modal-overlay" id="gantt-tab-confirm-modal">
        <div class="confirm-modal">
          <h3>¿Deseas guardar los cambios?</h3>
          <p id="modal-tab-confirm-msg">Tienes modificaciones sin guardar. Si cambias de pestaña, se perderán las ediciones.</p>
          <div class="confirm-modal-actions">
            <button class="asist-btn-action" id="modal-tab-cancel" style="background:var(--bg); color:var(--ink); padding:8px 14px;">Cancelar</button>
            <button class="asist-btn-action" id="modal-tab-discard" style="background:var(--red-soft); color:var(--red); padding:8px 14px;">Descartar cambios</button>
            <button class="dash-btn" id="modal-tab-save" style="padding:8px 16px;">Guardar y continuar</button>
          </div>
        </div>
      </div>

      <!-- Modal de confirmación global para eliminar -->
      <div class="confirm-modal-overlay" id="gantt-global-delete-modal">
        <div class="confirm-modal">
          <h3 id="modal-del-title">Confirmar eliminación</h3>
          <p id="modal-del-msg">¿Estás seguro de que deseas eliminar este elemento? Esta acción no se puede deshacer.</p>
          <div class="confirm-modal-actions">
            <button class="asist-btn-action" id="modal-del-cancel" style="background:var(--bg); color:var(--ink); padding:8px 14px;">Cancelar</button>
            <button class="asist-btn-action" id="modal-del-confirm" style="background:var(--red-soft); color:var(--red); padding:8px 14px; font-weight:700;">Eliminar</button>
          </div>
        </div>
      </div>
    `;

    renderGanttRows();
    renderEncargadosRows();
    renderAsistentesRows();
    renderPresupuestosRows();

    if (hasPendingGantt) setDirtyGantt(true);
    if (hasPendingEnc) setDirtyEnc(true);
    if (hasPendingAsist) setDirtyAsist(true);
    if (hasPendingPres) setDirtyPres(true);

    page.querySelector('#gantt-toggle-edit-btn').addEventListener('click', () => { isEditingGantt = !isEditingGantt; activeTabId = 'tab-gantt'; render(); });
    page.querySelector('#enc-toggle-edit-btn').addEventListener('click', () => { isEditingEnc = !isEditingEnc; activeTabId = 'tab-encargados'; render(); });
    page.querySelector('#asist-toggle-edit-btn').addEventListener('click', () => { isEditingAsist = !isEditingAsist; activeTabId = 'tab-asistentes'; render(); });
    page.querySelector('#pres-toggle-edit-btn').addEventListener('click', () => { isEditingPres = !isEditingPres; activeTabId = 'tab-presupuestos'; render(); });

    page.querySelector('#gantt-save-btn').addEventListener('click', saveGanttChanges);
    page.querySelector('#enc-save-btn').addEventListener('click', saveEncargadosChanges);
    page.querySelector('#asist-save-btn').addEventListener('click', saveAsistentesChanges);
    page.querySelector('#pres-save-btn').addEventListener('click', savePresupuestosChanges);

    page.querySelector('#gantt-add-task-btn').addEventListener('click', () => {
      workingGantt.push({ id: uid(), t: 'Nueva tarea', prioridad: 'Secundario', responsable: '', estado: 'No iniciada', fechaInicio: '', distribuible: '', distribuibleTexto: '', notas: '' });
      setDirtyGantt(true);
      renderGanttRows();
    });

    page.querySelector('#enc-add-item-btn').addEventListener('click', () => {
      workingEnc.push({ id: uid(), tarea: '', encargado: '', insumos: '' });
      setDirtyEnc(true);
      renderEncargadosRows();
    });

    page.querySelector('#asist-add-group-btn').addEventListener('click', () => {
      workingAsist.push({ id: uid(), nombre: 'Nuevo grupo', items: [{ id: uid(), nombre: 'Nuevo asistente / entidad', cantidad: 1 }] });
      setDirtyAsist(true);
      renderAsistentesRows();
    });

    page.querySelector('#pres-add-item-btn').addEventListener('click', () => {
      workingPres.push({ id: uid(), item: 'Nuevo ítem', detalle: '', cantidad: 1, costoUnitario: 0, observaciones: '' });
      setDirtyPres(true);
      renderPresupuestosRows();
    });

    page.querySelectorAll('.gantt-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const currentActive = page.querySelector('.gantt-tab-btn.active');
        if (currentActive === btn) return;

        const leavingGantt = currentActive.dataset.tab === 'tab-gantt' && hasPendingGantt;
        const leavingEnc = currentActive.dataset.tab === 'tab-encargados' && hasPendingEnc;
        const leavingAsist = currentActive.dataset.tab === 'tab-asistentes' && hasPendingAsist;
        const leavingPres = currentActive.dataset.tab === 'tab-presupuestos' && hasPendingPres;

        if (leavingGantt || leavingEnc || leavingAsist || leavingPres) {
          pendingTabSwitch = btn;
          let tabName = 'esta pestaña';
          if (leavingGantt) tabName = 'Carta Gantt';
          else if (leavingEnc) tabName = 'Encargados';
          else if (leavingAsist) tabName = 'Asistentes';
          else if (leavingPres) tabName = 'Presupuestos';

          page.querySelector('#modal-tab-confirm-msg').textContent = `Tienes modificaciones sin guardar en ${tabName}. Si cambias de pestaña, se perderán las ediciones.`;
          page.querySelector('#gantt-tab-confirm-modal').classList.add('show');
          return;
        }

        switchTab(btn);
      });
    });

    page.querySelector('#modal-tab-cancel').addEventListener('click', () => {
      page.querySelector('#gantt-tab-confirm-modal').classList.remove('show');
      pendingTabSwitch = null;
    });

    page.querySelector('#modal-tab-discard').addEventListener('click', () => {
      const currentActive = page.querySelector('.gantt-tab-btn.active');
      if (currentActive.dataset.tab === 'tab-gantt') {
        workingGantt = JSON.parse(JSON.stringify(a.tareas));
        setDirtyGantt(false);
        isEditingGantt = false;
      } else if (currentActive.dataset.tab === 'tab-encargados') {
        workingEnc = JSON.parse(JSON.stringify(a.encargados));
        setDirtyEnc(false);
        isEditingEnc = false;
      } else if (currentActive.dataset.tab === 'tab-asistentes') {
        workingAsist = JSON.parse(JSON.stringify(a.gruposAsistentes));
        setDirtyAsist(false);
        isEditingAsist = false;
      } else if (currentActive.dataset.tab === 'tab-presupuestos') {
        workingPres = JSON.parse(JSON.stringify(a.presupuesto));
        setDirtyPres(false);
        isEditingPres = false;
      }
      page.querySelector('#gantt-tab-confirm-modal').classList.remove('show');
      if (pendingTabSwitch) {
        switchTab(pendingTabSwitch);
        pendingTabSwitch = null;
      }
    });

    page.querySelector('#modal-tab-save').addEventListener('click', () => {
      const currentActive = page.querySelector('.gantt-tab-btn.active');
      if (currentActive.dataset.tab === 'tab-gantt') saveGanttChanges();
      else if (currentActive.dataset.tab === 'tab-encargados') saveEncargadosChanges();
      else if (currentActive.dataset.tab === 'tab-asistentes') saveAsistentesChanges();
      else if (currentActive.dataset.tab === 'tab-presupuestos') savePresupuestosChanges();

      page.querySelector('#gantt-tab-confirm-modal').classList.remove('show');
      if (pendingTabSwitch) {
        switchTab(pendingTabSwitch);
        pendingTabSwitch = null;
      }
    });

    page.querySelector('#modal-del-cancel').addEventListener('click', () => {
      page.querySelector('#gantt-global-delete-modal').classList.remove('show');
      pendingDeleteCallback = null;
    });

    page.querySelector('#modal-del-confirm').addEventListener('click', () => {
      if (pendingDeleteCallback) pendingDeleteCallback();
      page.querySelector('#gantt-global-delete-modal').classList.remove('show');
      pendingDeleteCallback = null;
    });
  }

  function switchTab(btn) {
    activeTabId = btn.dataset.tab;
    page.querySelectorAll('.gantt-tab-btn').forEach(b => b.classList.remove('active'));
    page.querySelectorAll('.gantt-tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = page.querySelector('#' + btn.dataset.tab);
    if (target) target.classList.add('active');
  }

  function saveGanttChanges() {
    a.tareas = JSON.parse(JSON.stringify(workingGantt));
    saveData();
    setDirtyGantt(false);
    isEditingGantt = false;
    activeTabId = 'tab-gantt';
    render();
  }

  function saveEncargadosChanges() {
    a.encargados = JSON.parse(JSON.stringify(workingEnc));
    saveData();
    setDirtyEnc(false);
    isEditingEnc = false;
    activeTabId = 'tab-encargados';
    render();
  }

  function saveAsistentesChanges() {
    a.gruposAsistentes = JSON.parse(JSON.stringify(workingAsist));
    saveData();
    setDirtyAsist(false);
    isEditingAsist = false;
    activeTabId = 'tab-asistentes';
    render();
  }

  function savePresupuestosChanges() {
    a.presupuesto = JSON.parse(JSON.stringify(workingPres));
    saveData();
    setDirtyPres(false);
    isEditingPres = false;
    activeTabId = 'tab-presupuestos';
    render();
  }

  function renderGanttRows() {
    const tbody = page.querySelector('#gantt-table-body');
    if (!tbody) return;

    if (!workingGantt.length) {
      tbody.innerHTML = `<tr><td colspan="${isEditingGantt ? 8 : 7}" style="text-align:center; color:var(--ink-soft); padding:24px;">No hay tareas registradas en la Carta Gantt.</td></tr>`;
      return;
    }

    let html = '';
    workingGantt.forEach((t, idx) => {
      let distHtml = '—';
      const link = (t.distribuible || '').trim();
      const texto = (t.distribuibleTexto || '').trim() || link;

      if (isEditingGantt) {
        distHtml = `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <input type="text" class="asist-input-name" data-field="distribuible" data-tidx="${idx}" value="${escapeAttr(t.distribuible)}" placeholder="URL: https://...">
            <input type="text" class="asist-input-name" data-field="distribuibleTexto" data-tidx="${idx}" value="${escapeAttr(t.distribuibleTexto)}" placeholder="Texto del enlace (opcional)" style="font-size:.74rem; color:var(--ink-soft);">
          </div>
        `;
      } else if (link) {
        const urlFinal = /^https?:\/\//i.test(link) ? link : 'https://' + link;
        distHtml = `<a href="${escapeAttr(urlFinal)}" target="_blank" rel="noopener noreferrer" class="gantt-link">${escapeHtml(texto)}</a>`;
      }

      html += `
        <tr data-tidx="${idx}">
          <td class="col-tarea">
            ${isEditingGantt ? `<input type="text" class="asist-input-name" data-field="t" data-tidx="${idx}" value="${escapeAttr(t.t)}" placeholder="Nombre de la tarea">` : escapeHtml(t.t || '—')}
          </td>
          <td>
            ${isEditingGantt ? `
              <select class="asist-input-qty" style="width:115px; text-align:left;" data-field="prioridad" data-tidx="${idx}">
                ${PRIORIDADES_GANTT.map(p => `<option value="${p}" ${t.prioridad === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>` : escapeHtml(t.prioridad || '—')}
          </td>
          <td>
            ${isEditingGantt ? `<input type="text" class="asist-input-name" data-field="responsable" data-tidx="${idx}" value="${escapeAttr(t.responsable)}" placeholder="Responsable">` : escapeHtml(t.responsable || '—')}
          </td>
          <td>
            ${isEditingGantt ? `
              <select class="asist-input-qty" style="width:115px; text-align:left;" data-field="estado" data-tidx="${idx}">
                ${ESTADOS_GANTT.map(s => `<option value="${s}" ${t.estado === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>` : escapeHtml(t.estado || '—')}
          </td>
          <td>
            ${isEditingGantt ? `<input type="date" class="asist-input-qty" style="width:130px; text-align:left;" data-field="fechaInicio" data-tidx="${idx}" value="${t.fechaInicio || ''}">` : (t.fechaInicio || '—')}
          </td>
          <td class="col-tarea">${distHtml}</td>
          <td class="col-notas">
            ${isEditingGantt ? `<input type="text" class="asist-input-name" data-field="notas" data-tidx="${idx}" value="${escapeAttr(t.notas)}" placeholder="Notas">` : escapeHtml(t.notas || '—')}
          </td>
          ${isEditingGantt ? `
            <td style="text-align:center;">
              <button class="asist-btn-action asist-btn-del" data-action="del-gantt" data-tidx="${idx}" title="Eliminar tarea">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </td>` : ''}
        </tr>
      `;
    });

    tbody.innerHTML = html;

    if (!isEditingGantt) return;

    tbody.querySelectorAll('input[data-field], select[data-field]').forEach(input => {
      input.addEventListener('input', e => {
        const { field, tidx } = e.target.dataset;
        workingGantt[tidx][field] = e.target.value;
        if (field === 'estado') {
          workingGantt[tidx].done = (e.target.value === 'Completada');
        }
        setDirtyGantt(true);
      });
    });

    tbody.querySelectorAll('[data-action="del-gantt"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const tIdx = e.currentTarget.dataset.tidx;
        const nombre = workingGantt[tIdx].t || 'esta tarea';
        showDeleteConfirm('Eliminar tarea de Carta Gantt', `¿Estás seguro de que deseas eliminar "${nombre}"?`, () => {
          workingGantt.splice(tIdx, 1);
          setDirtyGantt(true);
          renderGanttRows();
        });
      });
    });
  }

  function renderEncargadosRows() {
    const tbody = page.querySelector('#enc-table-body');
    if (!tbody) return;

    if (!workingEnc.length) {
      tbody.innerHTML = `<tr><td colspan="${isEditingEnc ? 4 : 3}" style="text-align:center; color:var(--ink-soft); padding:24px;">No hay encargados asignados.</td></tr>`;
      return;
    }

    let html = '';
    workingEnc.forEach((item, idx) => {
      html += `
        <tr data-eidx="${idx}">
          <td class="col-tarea">
            ${isEditingEnc ? `<input type="text" class="asist-input-name" data-field="tarea" data-eidx="${idx}" value="${escapeAttr(item.tarea)}" placeholder="Nombre de la tarea">` : escapeHtml(item.tarea || '—')}
          </td>
          <td>
            ${isEditingEnc ? `<input type="text" class="asist-input-name" data-field="encargado" data-eidx="${idx}" value="${escapeAttr(item.encargado)}" placeholder="Encargado">` : escapeHtml(item.encargado || '—')}
          </td>
          <td class="col-notas">
            ${isEditingEnc ? `<input type="text" class="asist-input-name" data-field="insumos" data-eidx="${idx}" value="${escapeAttr(item.insumos)}" placeholder="Insumos o materiales">` : escapeHtml(item.insumos || '—')}
          </td>
          ${isEditingEnc ? `
            <td style="text-align:center;">
              <button class="asist-btn-action asist-btn-del" data-action="del-enc" data-eidx="${idx}" title="Eliminar asignación">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </td>` : ''}
        </tr>
      `;
    });

    tbody.innerHTML = html;

    if (!isEditingEnc) return;

    tbody.querySelectorAll('input[data-field]').forEach(inp => {
      inp.addEventListener('input', e => {
        const { field, eidx } = e.target.dataset;
        workingEnc[eidx][field] = e.target.value;
        setDirtyEnc(true);
      });
    });

    tbody.querySelectorAll('[data-action="del-enc"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const eIdx = e.currentTarget.dataset.eidx;
        const nombre = workingEnc[eIdx].tarea || 'esta tarea';
        showDeleteConfirm('Eliminar asignación de encargado', `¿Estás seguro de que deseas eliminar la asignación para "${nombre}"?`, () => {
          workingEnc.splice(eIdx, 1);
          setDirtyEnc(true);
          renderEncargadosRows();
        });
      });
    });
  }

  function renderAsistentesRows() {
    const tbody = page.querySelector('#asist-table-body');
    if (!tbody) return;

    let totalGeneral = 0;
    let html = '';

    workingAsist.forEach((g, gIdx) => {
      const subtotal = (g.items || []).reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
      totalGeneral += subtotal;

      html += `
        <tr style="background:var(--gray-chip); font-weight:700;">
          <td colspan="2" style="padding:${isEditingAsist ? '7px 12px' : '10px 14px'}; font-size:.76rem; text-transform:uppercase; letter-spacing:.5px; color:var(--ink-soft);">
            ${isEditingAsist ? `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <input type="text" class="asist-input-group" data-gidx="${gIdx}" value="${escapeAttr(g.nombre)}">
                <button class="asist-btn-action asist-btn-add" data-action="add-item-asist" data-gidx="${gIdx}">
                  <i class="fa-solid fa-plus"></i> Agregar ítem
                </button>
              </div>` : escapeHtml(g.nombre)}
          </td>
          ${isEditingAsist ? `
            <td style="text-align:center;">
              <button class="asist-btn-action asist-btn-del" data-action="del-group-asist" data-gidx="${gIdx}" title="Eliminar grupo">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>` : ''}
        </tr>
      `;

      (g.items || []).forEach((it, itIdx) => {
        html += `
          <tr>
            <td class="col-tarea" style="padding-left:24px;">
              ${isEditingAsist ? `<input type="text" class="asist-input-name" data-gidx="${gIdx}" data-itidx="${itIdx}" value="${escapeAttr(it.nombre)}" placeholder="Nombre del participante o entidad">` : escapeHtml(it.nombre)}
            </td>
            <td style="text-align:right;">
              ${isEditingAsist ? `<input type="number" min="0" class="asist-input-qty" data-gidx="${gIdx}" data-itidx="${itIdx}" value="${it.cantidad ?? 0}">` : (it.cantidad ?? 0)}
            </td>
            ${isEditingAsist ? `
              <td style="text-align:center;">
                <button class="asist-btn-action asist-btn-del" data-action="del-item-asist" data-gidx="${gIdx}" data-itidx="${itIdx}" title="Eliminar ítem">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </td>` : ''}
          </tr>
        `;
      });

      html += `
        <tr style="background:rgba(0,0,0,.02); font-weight:600;">
          <td style="padding-left:24px; color:var(--ink-soft); font-size:.78rem;">Subtotal ${escapeHtml(g.nombre || '')}</td>
          <td style="text-align:right; font-weight:700;">${subtotal}</td>
          ${isEditingAsist ? '<td></td>' : ''}
        </tr>
      `;
    });

    html += `
      <tr style="background:var(--accent-soft); border-top:2px solid var(--accent); font-weight:800;">
        <td style="color:var(--accent-dark); font-size:.9rem;">TOTAL GENERAL ASISTENTES</td>
        <td style="text-align:right; color:var(--accent-dark); font-size:1.05rem;" id="asist-total-val">${totalGeneral}</td>
        ${isEditingAsist ? '<td></td>' : ''}
      </tr>
    `;

    tbody.innerHTML = html;

    if (!isEditingAsist) return;

    tbody.querySelectorAll('.asist-input-group').forEach(inp => {
      inp.addEventListener('input', e => {
        workingAsist[e.target.dataset.gidx].nombre = e.target.value;
        setDirtyAsist(true);
      });
    });

    tbody.querySelectorAll('.asist-input-name').forEach(inp => {
      inp.addEventListener('input', e => {
        const { gidx, itidx } = e.target.dataset;
        workingAsist[gidx].items[itidx].nombre = e.target.value;
        setDirtyAsist(true);
      });
    });

    tbody.querySelectorAll('.asist-input-qty').forEach(inp => {
      inp.addEventListener('input', e => {
        const { gidx, itidx } = e.target.dataset;
        workingAsist[gidx].items[itidx].cantidad = Number(e.target.value) || 0;
        setDirtyAsist(true);
        recalculateAsistTotals();
      });
    });

    tbody.querySelectorAll('[data-action="add-item-asist"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const gIdx = e.currentTarget.dataset.gidx;
        workingAsist[gIdx].items.push({ id: uid(), nombre: '', cantidad: 1 });
        setDirtyAsist(true);
        renderAsistentesRows();
      });
    });

    tbody.querySelectorAll('[data-action="del-item-asist"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const { gidx, itidx } = e.currentTarget.dataset;
        const nombre = workingAsist[gidx].items[itidx].nombre || 'este ítem';
        showDeleteConfirm('Eliminar asistente', `¿Estás seguro de que deseas eliminar "${nombre}"?`, () => {
          workingAsist[gidx].items.splice(itidx, 1);
          setDirtyAsist(true);
          renderAsistentesRows();
        });
      });
    });

    tbody.querySelectorAll('[data-action="del-group-asist"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const gIdx = e.currentTarget.dataset.gidx;
        const nombre = workingAsist[gIdx].nombre || 'este grupo';
        showDeleteConfirm('Eliminar grupo', `¿Estás seguro de que deseas eliminar el grupo "${nombre}" y todos sus integrantes asociados?`, () => {
          workingAsist.splice(gIdx, 1);
          setDirtyAsist(true);
          renderAsistentesRows();
        });
      });
    });
  }

  function recalculateAsistTotals() {
    let grandTotal = 0;
    workingAsist.forEach(g => {
      grandTotal += (g.items || []).reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
    });
    const totalEl = page.querySelector('#asist-total-val');
    if (totalEl) totalEl.textContent = grandTotal;
  }

  function renderPresupuestosRows() {
    const tbody = page.querySelector('#pres-table-body');
    if (!tbody) return;

    let totalPresupuesto = 0;
    let html = '';

    if (!workingPres.length) {
      tbody.innerHTML = `<tr><td colspan="${isEditingPres ? 7 : 6}" style="text-align:center; color:var(--ink-soft); padding:24px;">No hay partidas presupuestarias registradas.</td></tr>`;
      return;
    }

    workingPres.forEach((p, pIdx) => {
      const cant = Number(p.cantidad) || 0;
      const cUnit = Number(p.costoUnitario) || 0;
      const cTot = cant * cUnit;
      totalPresupuesto += cTot;

      html += `
        <tr data-pidx="${pIdx}">
          <td>
            ${isEditingPres ? `<input type="text" class="asist-input-name" data-field="item" data-pidx="${pIdx}" value="${escapeAttr(p.item)}" placeholder="Ítem">` : escapeHtml(p.item || '—')}
          </td>
          <td class="col-tarea">
            ${isEditingPres ? `<input type="text" class="asist-input-name" data-field="detalle" data-pidx="${pIdx}" value="${escapeAttr(p.detalle)}" placeholder="Detalle">` : escapeHtml(p.detalle || '—')}
          </td>
          <td style="text-align:right;">
            ${isEditingPres ? `<input type="number" min="0" class="asist-input-qty" data-field="cantidad" data-pidx="${pIdx}" value="${cant}">` : cant}
          </td>
          <td style="text-align:right;">
            ${isEditingPres ? `<input type="number" min="0" class="asist-input-qty" style="width:90px;" data-field="costoUnitario" data-pidx="${pIdx}" value="${cUnit}">` : '$' + cUnit.toLocaleString('es-CL')}
          </td>
          <td style="text-align:right; font-weight:700;" class="pres-row-tot">
            $${cTot.toLocaleString('es-CL')}
          </td>
          <td class="col-notas">
            ${isEditingPres ? `<input type="text" class="asist-input-name" data-field="observaciones" data-pidx="${pIdx}" value="${escapeAttr(p.observaciones)}" placeholder="Observaciones">` : escapeHtml(p.observaciones || '—')}
          </td>
          ${isEditingPres ? `
            <td style="text-align:center;">
              <button class="asist-btn-action asist-btn-del" data-action="del-pres" data-pidx="${pIdx}" title="Eliminar ítem presupuestario">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </td>` : ''}
        </tr>
      `;
    });

    html += `
      <tr style="background:var(--accent-soft); border-top:2px solid var(--accent); font-weight:800;">
        <td colspan="4" style="color:var(--accent-dark); font-size:.9rem;">TOTAL PRESUPUESTO</td>
        <td style="text-align:right; color:var(--accent-dark); font-size:1.05rem;" id="pres-total-val">$${totalPresupuesto.toLocaleString('es-CL')}</td>
        <td></td>
        ${isEditingPres ? '<td></td>' : ''}
      </tr>
    `;

    tbody.innerHTML = html;

    if (!isEditingPres) return;

    tbody.querySelectorAll('input[data-field]').forEach(inp => {
      inp.addEventListener('input', e => {
        const { field, pidx } = e.target.dataset;
        const val = (field === 'cantidad' || field === 'costoUnitario') ? (Number(e.target.value) || 0) : e.target.value;
        workingPres[pidx][field] = val;
        setDirtyPres(true);

        if (field === 'cantidad' || field === 'costoUnitario') {
          recalculatePresTotals();
        }
      });
    });

    tbody.querySelectorAll('[data-action="del-pres"]').forEach(btn => {
      btn.addEventListener('click', e => {
        const pIdx = e.currentTarget.dataset.pidx;
        const nombre = workingPres[pIdx].item || 'este ítem';
        showDeleteConfirm('Eliminar ítem presupuestario', `¿Estás seguro de que deseas eliminar "${nombre}"?`, () => {
          workingPres.splice(pIdx, 1);
          setDirtyPres(true);
          renderPresupuestosRows();
        });
      });
    });
  }

  function recalculatePresTotals() {
    let grandTotal = 0;
    workingPres.forEach((p, i) => {
      const cant = Number(p.cantidad) || 0;
      const cUnit = Number(p.costoUnitario) || 0;
      const cTot = cant * cUnit;
      grandTotal += cTot;

      const row = page.querySelector(`tr[data-pidx="${i}"] .pres-row-tot`);
      if (row) row.textContent = '$' + cTot.toLocaleString('es-CL');
    });

    const totalEl = page.querySelector('#pres-total-val');
    if (totalEl) totalEl.textContent = '$' + grandTotal.toLocaleString('es-CL');
  }

  render();
}

/* ---------- Control de Tema Claro / Oscuro ---------- */
const THEME_KEY = 'panel-theme';

function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.setAttribute('data-theme', mode);
  else document.documentElement.removeAttribute('data-theme');
  document.getElementById('theme-light').classList.toggle('on', mode === 'light');
  document.getElementById('theme-dark').classList.toggle('on', mode === 'dark');
  destroyCharts();
  if (document.getElementById('view-programa').classList.contains('active')) renderPrograma();
}

try {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(savedTheme);
} catch (e) {
  applyTheme('light');
}

document.getElementById('theme-light').addEventListener('click', () => {
  try { localStorage.setItem(THEME_KEY, 'light'); } catch (e) {}
  applyTheme('light');
});

document.getElementById('theme-dark').addEventListener('click', () => {
  try { localStorage.setItem(THEME_KEY, 'dark'); } catch (e) {}
  applyTheme('dark');
});

document.getElementById('pg-dashboard').addEventListener('click', () => {
  const base = location.origin + location.pathname;
  window.open(base + '?report=general', '_blank');
});

/* ---------- Inicialización Asíncrona ---------- */
initApp();