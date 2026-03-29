"use strict";
/*═══════════════════════════════════════════════════════════════════
  PORTFOLIO DASHBOARD v3 — Clean rebuild
  Data flow:
    SQL (csv/xlsx) → shipments[]{gpId,gpGroup,client,revenue,costs}
    Excel Sheet1   → tpRows[]{group,gpCode,month,costs,margin}
    Excel Sheet2   → areaRows[]{name,month,util,costs,margin,finResult}
    Link: gpCode(Excel) = gpId(SQL) via tpRows
    Link: group(tpRows) = name(areaRows) — area group level
═══════════════════════════════════════════════════════════════════*/

/* ═══ STATE ═══ */
let D = {
  ships: [],       // SQL shipments
  tpRows: [],      // Excel sheet1: TP details
  areaRows: [],    // Excel sheet2: area aggregates
  sqlOk: false,
  areaOk: false,
  salesMode: '',
};
let UI = {
  offA: new Set(), offG: new Set(), offC: new Set(), offP: new Set(),
  selA: '', selG: '', selC: new Set(),  // selected (include-only) filters
  tab: 'overview', scOpen: false,
  dateFrom: '', dateTo: '',
  searchG: '', searchC: '', searchP: '', searchTP: '',
  grpSort: 'rev', grpSortDir: 1, grpPage: 0,
  cliSort: 'rev', cliSortDir: 1, cliPage: 0,
  prodSort: 'marginInc', prodSortDir: 1, prodPage: 0,
  cpSort: 'revenue', cpSortDir: 1, cpPage: 0,
  grpNegOnly: false,
  cpNegOnly: false,
  cpOpen: new Set(),
  salesInputMode: 'auto',
  holdingMonthlyInput: '',
  holdingAllocMode: 'revenue',
  quickMenu: null,
  _selCExpand: false,
  _mounted: false,
  _renderTimers: Object.create(null),
};
let charts = {};

function getSalesMeta(mode) {
  const resolved = mode || D.salesMode || (UI.salesInputMode === 'finIncome' ? 'finIncome' : 'sql');
  if (resolved === 'finIncome') {
    return {
      mode: 'finIncome',
      variantLabel: 'Продажи: фин. доход / себестоимость',
      badgeLabel: 'Фин. доход',
      uploadLabel: 'Продажи',
      cost1Label: 'Себестоимость продаж',
      cost1Short: 'Себест.',
      profit1Label: 'Фин. доход',
      profit1Short: 'Фин.дох.',
      profitabilityLabel: 'Фин. дох-ть',
      hasSplitCosts: false,
    };
  }
  return {
    mode: 'sql',
    variantLabel: 'SQL: сырье / норматив / транспорт',
    badgeLabel: 'SQL',
    uploadLabel: 'SQL данные',
    cost1Label: 'Сырье',
    cost1Short: 'Сырье',
    cost2Label: 'Нормативы',
    cost2Short: 'Норм.',
    cost3Label: 'Транспорт',
    cost3Short: 'Трансп.',
    profit1Label: 'Маржа 1',
    profit1Short: 'М1',
    profitabilityLabel: 'Рент.',
    hasSplitCosts: true,
  };
}

function buildMonthDate(year, month) {
  const y = parseInt(String(year || '').trim(), 10);
  const m = parseInt(String(month || '').trim(), 10);
  if (!y || !m || m < 1 || m > 12) return '';
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function getOrderUrl(code) {
  const v = String(code || '').trim();
  return v ? `https://cisp.ssnab.ru/Sales/Orders/Order/${encodeURIComponent(v)}` : '';
}

function normalizeColName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectSalesMode(rows, forcedMode) {
  const sample = rows.find(r => Object.keys(r || {}).length) || {};
  const cols = Object.keys(sample).map(normalizeColName);
  const hasSqlCols =
    cols.some(c => c.includes('выручка по гп')) ||
    cols.some(c => c.includes('прямые_затраты_сырье_склад')) ||
    cols.includes('код заявки');
  const hasFinCols =
    cols.some(c => c.includes('товарная позиция (код)')) &&
    cols.some(c => c.includes('сумма (руб.)')) &&
    cols.some(c => c.includes('фин. доход'));

  if (forcedMode === 'sql') {
    if (!hasSqlCols) throw new Error('Выбран SQL-режим, но в файле нет колонок SQL выгрузки.');
    return 'sql';
  }
  if (forcedMode === 'finIncome') {
    if (!hasFinCols) throw new Error('Выбран режим "фин. доход", но в файле нет нужных колонок продаж.');
    return 'finIncome';
  }
  if (hasSqlCols) return 'sql';
  if (hasFinCols) return 'finIncome';
  throw new Error('Формат продаж не распознан. Выберите вариант вручную и загрузите файл снова.');
}

function resetScenarioFilters() {
  UI.offA = new Set();
  UI.offG = new Set();
  UI.offC = new Set();
  UI.offP = new Set();
  UI.selA = '';
  UI.selG = '';
  UI.selC = new Set();
  UI._selCSearch = '';
  UI.searchP = '';
  UI.grpPage = 0;
  UI.cliPage = 0;
  UI.prodPage = 0;
  UI.cpPage = 0;
  UI.grpNegOnly = false;
  UI.cpNegOnly = false;
  UI.quickMenu = null;
}

function applySalesData(rows, mode, opts) {
  const options = opts || {};
  rows.forEach(r => { r.date = normDate(r.date); });
  const prepared = rows.filter(r => r.revenue > 0);
  if (!prepared.length) return false;
  D.ships = prepared;
  D.sqlOk = true;
  D.salesMode = mode;
  resetScenarioFilters();
  autoSetDates();
  if (!options.skipRender) render();
  if (!options.silent) toast(`✓ ${getSalesMeta(mode).variantLabel}: ${prepared.length} строк продаж`, 'ok');
  return true;
}

function buildWaterfallModel(cur, ships, meta) {
  const raw = ships.reduce((a, s) => a + s.rawCost, 0);
  const norm = ships.reduce((a, s) => a + s.normCost, 0);
  const trans = ships.reduce((a, s) => a + s.transport, 0);
  let model;
  if (meta.hasSplitCosts) {
    model = {
      labels: ['Выручка', meta.cost1Short, meta.cost2Short, meta.cost3Short, meta.profit1Short, 'Рез.уч.', 'После уч.'],
      values: [cur.rev, -raw, -norm, -trans, cur.cm1, cur.areaResult, cur.opResult],
      totalIdx: new Set([0, 4, 6]),
    };
  } else {
    model = {
      labels: ['Выручка', meta.cost1Short, meta.profit1Short, 'Рез.уч.', 'После уч.'],
      values: [cur.rev, -raw, cur.cm1, cur.areaResult, cur.opResult],
      totalIdx: new Set([0, 2, 4]),
    };
  }
  if (cur.holdingTotal > 0) {
    model.labels.push('Холдинг', 'Итог');
    model.values.push(-cur.holdingTotal, cur.finalResult);
    model.totalIdx.add(model.labels.length - 1);
  }
  return model;
}

/* ═══ HELPERS ═══ */
const fmt = n => { if(Math.abs(n)>=1e6) return (n/1e6).toFixed(2)+'М'; if(Math.abs(n)>=1e3) return (n/1e3).toFixed(1)+'К'; return Math.round(n).toString(); };
const fmtF = n => n.toLocaleString('ru-RU',{maximumFractionDigits:0})+' ₽';
const pct = n => (n*100).toFixed(1)+'%';
const pn = v => { if(v==null||v==='') return 0; let s=String(v).trim().replace(/\s/g,'').replace(/,/g,'.'); return parseFloat(s)||0; };
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const tog = (set,id) => { set.has(id)?set.delete(id):set.add(id); };
const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#ec4899','#14b8a6','#6366f1','#f97316','#06b6d4'];

const RU_M = {'январь':'01','февраль':'02','март':'03','апрель':'04','май':'05','июнь':'06','июль':'07','август':'08','сентябрь':'09','октябрь':'10','ноябрь':'11','декабрь':'12'};
function monthKeyFromDate(date) { return String(date || '').slice(0, 7); }
function countMonthsInclusive(from, to) {
  const fm = monthKeyFromDate(from);
  const tm = monthKeyFromDate(to);
  if (!fm || !tm) return 0;
  const [fy, fmNum] = fm.split('-').map(Number);
  const [ty, tmNum] = tm.split('-').map(Number);
  if (!fy || !fmNum || !ty || !tmNum) return 0;
  const diff = (ty - fy) * 12 + (tmNum - fmNum);
  return diff >= 0 ? diff + 1 : 0;
}
function parseMoneyInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 0;
  let mult = 1;
  if (/(млрд|bn|b\b|billion)/.test(raw)) mult = 1e9;
  else if (/(млн|mm\b|m\b|million)/.test(raw)) mult = 1e6;
  else if (/(тыс|k\b|thousand)/.test(raw)) mult = 1e3;
  const cleaned = raw.replace(/\s+/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num * mult : 0;
}
function getPeriodMonthCount(ships) {
  const viaRange = countMonthsInclusive(UI.dateFrom, UI.dateTo);
  if (viaRange > 0) return viaRange;
  const months = new Set(ships.map(s => dateToMonth(s.date)).filter(Boolean));
  return months.size;
}
function getHoldingModeLabel(mode, marginLabel, salesMode, form) {
  if (mode === 'margin') {
    if (form === 'prep') return salesMode === 'finIncome' ? 'фин. доходу > 0' : 'марже 1 > 0';
    return `${marginLabel} > 0`;
  }
  return form === 'prep' ? 'выручке' : 'Выручка';
}
function getHoldingConfig(ships, meta) {
  const monthly = Math.max(0, parseMoneyInput(UI.holdingMonthlyInput));
  const months = getPeriodMonthCount(ships);
  const total = monthly > 0 && months > 0 ? monthly * months : 0;
  const requestedMode = UI.holdingAllocMode === 'margin' ? 'margin' : 'revenue';
  return {
    monthly,
    months,
    total,
    salesMode: meta.mode,
    marginLabel: meta.profit1Label,
    requestedMode,
    requestedModeLabel: getHoldingModeLabel(requestedMode, meta.profit1Label, meta.mode, 'title'),
    requestedModeText: getHoldingModeLabel(requestedMode, meta.profit1Label, meta.mode, 'prep'),
  };
}
function getHoldingBasisValue(ship, mode) {
  if (mode === 'margin') return Math.max(ship.cm || 0, 0);
  return Math.max(ship.revenue || 0, 0);
}
function applyHoldingAllocation(rows, config) {
  const emptyRows = rows.map(r => ({...r, allocHolding: 0, finalOp: r.op, finalOpMargin: r.opMargin}));
  const summary = {
    ...config,
    enabled: config.total > 0,
    rows: emptyRows,
    activeTotal: 0,
    basisTotal: 0,
    effectiveMode: config.requestedMode,
    effectiveModeLabel: getHoldingModeLabel(config.requestedMode, config.marginLabel, config.salesMode, 'title'),
    effectiveModeText: getHoldingModeLabel(config.requestedMode, config.marginLabel, config.salesMode, 'prep'),
    warning: '',
  };
  if (!rows.length || config.total <= 0) return summary;
  let effectiveMode = config.requestedMode;
  let basisTotal = rows.reduce((a, r) => a + getHoldingBasisValue(r, effectiveMode), 0);
  let warning = '';
  if (effectiveMode === 'margin' && basisTotal <= 0) {
    effectiveMode = 'revenue';
    basisTotal = rows.reduce((a, r) => a + getHoldingBasisValue(r, effectiveMode), 0);
    warning = 'Для аллокации по марже не хватило положительной базы, поэтому временно использована выручка.';
  }
  const rowsWithHolding = rows.map(r => {
    const allocHolding = basisTotal > 0 ? config.total * getHoldingBasisValue(r, effectiveMode) / basisTotal : 0;
    const finalOp = r.op - allocHolding;
    return {
      ...r,
      allocHolding,
      finalOp,
      finalOpMargin: r.revenue > 0 ? finalOp / r.revenue : 0,
    };
  });
  return {
    ...summary,
    rows: rowsWithHolding,
    activeTotal: rowsWithHolding.reduce((a, r) => a + r.allocHolding, 0),
    basisTotal,
    effectiveMode,
    effectiveModeLabel: getHoldingModeLabel(effectiveMode, config.marginLabel, config.salesMode, 'title'),
    effectiveModeText: getHoldingModeLabel(effectiveMode, config.marginLabel, config.salesMode, 'prep'),
    warning,
  };
}
function withHolding(pl, holdingSummary) {
  const holdingTotal = holdingSummary.activeTotal || 0;
  const finalResult = pl.opResult - holdingTotal;
  return {
    ...pl,
    holdingTotal,
    finalResult,
    mFinal: pl.rev > 0 ? finalResult / pl.rev : 0,
  };
}
function parseMonth(s) {
  if(!s) return '';
  s = String(s).trim().toLowerCase();
  // "202509" → "2025-09"
  if(/^\d{6}$/.test(s)) return s.slice(0,4)+'-'+s.slice(4);
  // "2025-09" → as is
  if(/^\d{4}-\d{2}/.test(s)) return s.slice(0,7);
  // "сентябрь 2025"
  for(const[name,num] of Object.entries(RU_M)) { if(s.includes(name)){const m=s.match(/\d{4}/);if(m)return m[0]+'-'+num; }}
  return '';
}
function dateToMonth(d) { return d ? d.slice(0,7) : ''; }
function normDate(d) {
  if(!d) return '';
  if(/^\d{2}\.\d{2}\.\d{4}/.test(d)){const p=d.split('.');return p[2]+'-'+p[1]+'-'+p[0];}
  if(/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0,10);
  const dt=new Date(d); if(!isNaN(dt)) return dt.toISOString().slice(0,10);
  return '';
}
const detectDelim = t => { const l=t.split(/\r?\n/)[0]||''; if(l.includes('\t'))return'\t'; if(l.includes(';'))return';'; return','; };
const trimKeys = arr => arr.map(r => { const o={}; for(const k of Object.keys(r)) o[k.trim()]=r[k]; return o; });
const PAGE_SZ = 100;
function getProductKey(item) {
  const id = String(item?.gpId ?? item?.gpCode ?? '').trim();
  if (id) return `id:${id}`;
  const name = String(item?.gpName ?? item?.name ?? '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}
function buildProductLabel(item) {
  const name = String(item?.gpName ?? item?.name ?? item?.gpCode ?? '').trim();
  const group = String(item?.gpGroup ?? item?.group ?? '').trim();
  if (group && group !== name) return `${name} · ${group}`;
  return name;
}
function getProducts(ships) {
  const m = new Map();
  ships.forEach(s => {
    const key = getProductKey(s);
    if (!key || m.has(key)) return;
    m.set(key, {key, name: s.gpName || String(s.gpId || ''), group: s.gpGroup || '', label: buildProductLabel(s)});
  });
  return [...m.values()].sort((a,b) => a.label.localeCompare(b.label, 'ru'));
}
function getScenarioSet(kind) {
  if (kind === 'area') return UI.offA;
  if (kind === 'group') return UI.offG;
  if (kind === 'client') return UI.offC;
  if (kind === 'product') return UI.offP;
  return null;
}
function renderQuickEntity(kind, key, label) {
  const text = String(label || '').trim();
  if (!text) return '<span style="color:var(--tx3)">—</span>';
  if (!key) return `<span>${esc(text)}</span>`;
  const set = getScenarioSet(kind);
  const excluded = !!set?.has(key);
  const open = !excluded && UI.quickMenu && UI.quickMenu.kind === kind && UI.quickMenu.key === key;
  const entityText = kind === 'product' ? 'продукт' : kind === 'group' ? 'группу' : kind === 'area' ? 'участок' : 'клиента';
  return `<div class="qwrap${open ? ' open' : ''}"><button type="button" class="qlink${excluded ? ' off' : ''}" data-qtoggle="1" data-qkind="${kind}" data-qkey="${esc(key)}" data-qlabel="${esc(text)}" data-qexcluded="${excluded ? '1' : '0'}" title="${excluded ? 'Включить обратно в расчет' : 'Исключить из расчета'}"><span class="qdot"></span><span class="qtxt">${esc(text)}</span></button>${open ? `<div class="qmenu"><div class="qmeta">Сейчас участвует в сценарии.</div><button type="button" class="qact warn" data-qact="toggle" data-qkind="${kind}" data-qkey="${esc(key)}" data-qlabel="${esc(text)}">Исключить ${entityText}</button></div>` : ''}</div>`;
}

function bar(v,max,color,w) {
  const r=max>0?Math.min(Math.abs(v)/max,1):0;
  return `<div class="bw" style="width:${w||120}px"><div class="bf" style="width:${r*100}%;background:${v<0?'#fca5a5':color}"></div></div>`;
}
function bdg(val) {
  const bg=val>.3?'var(--green-bg)':val>.15?'var(--amber-bg)':'var(--red-bg)';
  const c=val>.3?'var(--green)':val>.15?'var(--amber)':'var(--red)';
  return `<span class="bp" style="background:${bg};color:${c}">${pct(val)}</span>`;
}
function utilC(u){ return u>=80?'var(--green)':u>=50?'var(--amber)':'var(--red)'; }
function sortButton(attr,key,label,activeKey,dir){
  const active = activeKey === key;
  const arrow = active ? (dir > 0 ? '▼' : '▲') : '';
  return `<button type="button" class="thb${active ? ' on' : ''}" ${attr}="${key}" aria-label="Сортировать по ${esc(label)}">${esc(label)}<span class="tharr">${arrow}</span></button>`;
}
function deltaPill(delta){
  if(delta===undefined || Math.abs(delta) < 1) return '';
  return `<span class="hero-delta ${delta>=0 ? 'up' : 'dn'}">${delta>=0 ? '↑' : '↓'} ${fmtF(Math.abs(delta))}</span>`;
}
function makeInputRestorer(id){
  const prev = document.getElementById(id);
  if(!prev) return null;
  const pos = typeof prev.selectionStart === 'number' ? prev.selectionStart : null;
  return () => {
    const el = document.getElementById(id);
    if(!el) return;
    el.focus();
    if(pos !== null && typeof el.setSelectionRange === 'function'){
      const clamped = Math.min(pos, String(el.value || '').length);
      el.setSelectionRange(clamped, clamped);
    }
  };
}
function queueRender(token, delay, restore){
  clearTimeout(UI._renderTimers[token]);
  UI._renderTimers[token] = setTimeout(() => {
    render();
    if(typeof restore === 'function') requestAnimationFrame(restore);
    delete UI._renderTimers[token];
  }, delay);
}
function bindDebouncedInput(id, onValue, delay=120){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', e => {
    onValue(e.target.value);
    queueRender(id, delay, makeInputRestorer(id));
  });
}

let toastT; function toast(msg,type){ let el=document.getElementById('toast'); if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el);} el.className='toast '+(type||'info');el.textContent=msg; clearTimeout(toastT); toastT=setTimeout(()=>el.remove(),5000); }
