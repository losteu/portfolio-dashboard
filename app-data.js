"use strict";

/* ═══ DATA LAYER ═══ */

// All unique area-group names (from areaRows or tpRows)
function allAreaNames() {
  const s = new Set();
  D.areaRows.forEach(r => s.add(r.name));
  D.tpRows.forEach(r => s.add(r.group));
  return [...s].filter(Boolean).sort();
}

// Map: gpCode → area group name (from tpRows)
function buildGpToArea() {
  const m = new Map();
  D.tpRows.forEach(r => { if(r.gpCode && r.group) m.set(String(r.gpCode), r.group); });
  return m;
}

// Area aggregate for period
function areaAgg(name) {
  const fm=dateToMonth(UI.dateFrom), tm=dateToMonth(UI.dateTo);
  const rows = D.areaRows.filter(r => r.name===name && (!fm||r.month>=fm) && (!tm||r.month<=tm));
  if(!rows.length) return {direct:0,distL:0,distNL:0,marginInc:0,avgUtil:0,months:0,finResult:0};
  return {
    direct: rows.reduce((a,r)=>a+r.direct,0),
    distL: rows.reduce((a,r)=>a+r.distL,0),
    distNL: rows.reduce((a,r)=>a+r.distNL,0),
    marginInc: rows.reduce((a,r)=>a+r.marginInc,0),
    avgUtil: rows.reduce((a,r)=>a+r.util,0)/rows.length,
    months: rows.length,
    finResult: rows.reduce((a,r)=>a+r.finResult,0),
  };
}
function calcAreaSheetSummary(useCurrentAreaFilters) {
  const fm=dateToMonth(UI.dateFrom), tm=dateToMonth(UI.dateTo);
  const rows = D.areaRows.filter(r => (!fm||r.month>=fm) && (!tm||r.month<=tm));
  const filtered = rows.filter(r => {
    if (!useCurrentAreaFilters) return true;
    if (UI.offA.has(r.name)) return false;
    if (UI.selA && r.name !== UI.selA) return false;
    return true;
  });
  const areaResult = filtered.reduce((a,r) => {
    const fin = (r.finResult || r.finResult === 0) ? r.finResult : (r.marginInc - r.direct - r.distL - r.distNL);
    return a + fin;
  }, 0);
  const needNormUp = filtered.reduce((a,r) => {
    const fin = (r.finResult || r.finResult === 0) ? r.finResult : (r.marginInc - r.direct - r.distL - r.distNL);
    return a + Math.max(-fin, 0);
  }, 0);
  return {areaResult, needNormUp};
}

// Filtered ships by date
function getShips() {
  let d = D.ships;
  if(UI.dateFrom) d = d.filter(s => s.date >= UI.dateFrom);
  if(UI.dateTo)   d = d.filter(s => s.date <= UI.dateTo);
  return d;
}

// Filtered TP rows by date
function getTP() {
  const fm=dateToMonth(UI.dateFrom), tm=dateToMonth(UI.dateTo);
  return D.tpRows.filter(r => (!fm||r.month>=fm) && (!tm||r.month<=tm));
}

function buildAllocatedShips(ships, tpRows, gpToArea) {
  const tpMap = new Map();
  tpRows.forEach(r => {
    const month = r.month || '';
    const gpCode = String(r.gpCode || '');
    if (!month || !gpCode) return;
    const key = `${month}|||${gpCode}`;
    if (!tpMap.has(key)) tpMap.set(key, { direct: 0, distL: 0, distNL: 0, marginInc: 0 });
    const item = tpMap.get(key);
    item.direct += r.direct || 0;
    item.distL += r.distL || 0;
    item.distNL += r.distNL || 0;
    item.marginInc += r.marginInc || 0;
  });

  const salesQtyMap = new Map();
  ships.forEach(s => {
    const month = dateToMonth(s.date);
    const gpId = String(s.gpId || '');
    if (!month || !gpId) return;
    const key = `${month}|||${gpId}`;
    salesQtyMap.set(key, (salesQtyMap.get(key) || 0) + (s.qty || 0));
  });

  return ships.map(s => {
    const month = dateToMonth(s.date);
    const gpId = String(s.gpId || '');
    const key = `${month}|||${gpId}`;
    const tpCost = tpMap.get(key) || { direct: 0, distL: 0, distNL: 0, marginInc: 0 };
    const totalQty = salesQtyMap.get(key) || 0;
    const share = totalQty > 0 ? (s.qty || 0) / totalQty : 0;
    const allocMarginInc = tpCost.marginInc * share;
    const allocDirect = tpCost.direct * share;
    const allocDistL = tpCost.distL * share;
    const allocDistNL = tpCost.distNL * share;
    const allocArea = allocDirect + allocDistL + allocDistNL;
    const allocAreaResult = allocMarginInc - allocArea;
    const cm = s.revenue - s.rawCost - s.normCost - s.transport;
    const op = cm + allocAreaResult;
    return {
      ...s,
      month,
      areaName: gpToArea ? (gpToArea.get(gpId) || '') : '',
      allocMarginInc,
      allocDirect,
      allocDistL,
      allocDistNL,
      allocArea,
      allocAreaResult,
      normGap: Math.max(-allocAreaResult, 0),
      cm,
      op,
      opMargin: s.revenue > 0 ? op / s.revenue : 0,
      tpMatched: tpMap.has(key),
    };
  });
}

// Groups from ships (товарная группа)
function getGroups(ships) {
  const m = new Map();
  ships.forEach(s => {
    if(!m.has(s.gpGroup)) m.set(s.gpGroup, {id:s.gpGroup, name:s.gpGroup, gpIds:new Set()});
    m.get(s.gpGroup).gpIds.add(s.gpId);
  });
  return [...m.values()];
}

function getClients(ships) { return [...new Set(ships.map(s=>s.client))].sort(); }

/* Map: gpGroup → areaName (via gpIds → gpToArea) */
function groupToArea(groups, gpToArea) {
  const m = new Map();
  groups.forEach(g => {
    const areas = [...g.gpIds].map(id => gpToArea.get(String(id))).filter(Boolean);
    if(areas.length) {
      // Most common area for this group
      const freq = {};
      areas.forEach(a => freq[a]=(freq[a]||0)+1);
      const best = Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0];
      m.set(g.id, best);
    }
  });
  return m;
}

/* Effective disabled groups (from disabled areas) */
function effOffGroups(groups, g2a) {
  const s = new Set(UI.offG);
  groups.forEach(g => {
    const a = g2a.get(g.id);
    if(a && UI.offA.has(a)) s.add(g.id);
    // If area selected and group's area doesn't match → effectively off
    if(UI.selA && a !== UI.selA) s.add(g.id);
  });
  // If group selected, disable all others
  if(UI.selG) groups.forEach(g => { if(g.id !== UI.selG) s.add(g.id); });
  return s;
}

/* Also disable ships directly by gpId if their area is disabled */
function filterShipsByScenario(ships, gpToArea, scenario) {
  const offC = scenario?.offC || new Set();
  const offA = scenario?.offA || new Set();
  const offG = scenario?.offG || new Set();
  const offP = scenario?.offP || new Set();
  const selA = scenario?.selA || '';
  const selG = scenario?.selG || '';
  const selC = scenario?.selC || new Set();
  return ships.filter(s => {
    // Exclusion filters
    if(offC.has(s.client)) return false;
    const productKey = getProductKey(s);
    if(productKey && offP.has(productKey)) return false;
    const area = gpToArea.get(String(s.gpId));
    if(area && offA.has(area)) return false;
    if(offG.has(s.gpGroup)) return false;
    // Selection filters (include-only)
    if(selA) { if(!area || area !== selA) return false; }
    if(selG) { if(s.gpGroup !== selG) return false; }
    if(selC.size) { if(!selC.has(s.client)) return false; }
    return true;
  });
}
function filterActiveShips(ships, gpToArea) {
  return filterShipsByScenario(ships, gpToArea, {
    offA: UI.offA,
    offG: UI.offG,
    offC: UI.offC,
    offP: UI.offP,
    selA: UI.selA,
    selG: UI.selG,
    selC: UI.selC,
  });
}
function shipScenarioSignature(rows) {
  const rev = rows.reduce((a, s) => a + (s.revenue || 0), 0);
  const qty = rows.reduce((a, s) => a + (s.qty || 0), 0);
  return `${rows.length}|${Math.round(rev)}|${Math.round(qty)}`;
}

/* Full P&L calculation */
function calcPL(rows) {
  const rev = rows.reduce((a,s) => a+s.revenue, 0);
  const vc  = rows.reduce((a,s) => a+s.rawCost+s.normCost+s.transport, 0);
  const cm1 = rev - vc;
  const totMarginInc = rows.reduce((a,s) => a + (s.allocMarginInc || 0), 0);
  const totDirect = rows.reduce((a,s) => a + (s.allocDirect || 0), 0);
  const totDistL = rows.reduce((a,s) => a + (s.allocDistL || 0), 0);
  const totDistNL = rows.reduce((a,s) => a + (s.allocDistNL || 0), 0);
  const areaResult = rows.reduce((a,s) => a + (s.allocAreaResult || 0), 0);
  const needNormUp = rows.reduce((a,s) => a + Math.max(-(s.allocAreaResult || 0), 0), 0);
  const opResult = cm1 + areaResult;
  return {rev,vc,cm1,totMarginInc,totDirect,totDistL,totDistNL,areaResult,needNormUp,opResult,
    m1:rev>0?cm1/rev:0, mArea:rev>0?areaResult/rev:0, mOp:rev>0?opResult/rev:0};
}

/* ═══ FILE LOADERS ═══ */
function parseSQLrows(data) {
  return data.map(r => {
    const g = (...ks) => { for(const k of ks){const v=r[k]; if(v!==undefined&&v!==null&&String(v).trim()!=='') return String(v).trim();} return null; };
    const revenue = pn(g("Выручка по ГП (RUR)","Выручка_по_ГП_(RUR)","Revenue_RUR"));
    const rawCost = pn(g("Прямые_Затраты_Сырье_Склад","Прямые Затраты Сырье Склад"));
    const normCost = pn(g("Прямые_Затраты_Нормы_Цех","Прямые Затраты Нормы Цех"));
    const transport = pn(g("Прямые_Затраты_Транспорт","Прямые Затраты Транспорт"));
    const orderId = g("Код заявки","ORDER_ID") || "";
    return {
      orderId,
      docCode: orderId || "",
      docSource: orderId ? 'order' : '',
      date: g("Дата заявки (отгрузки)","Дата_заявки","Order_Date") || buildMonthDate(g("Год"), g("Месяц")) || "",
      client: g("Клиент","Client_Name","Клиент ")||"",
      gpGroup: g("Товарная группа","Товарная_группа","GP_Group")||"",
      gpName: g("Готовая продукция (ГП)","Готовая продукция","GP_Name")||"",
      gpId: String(g("Код_ГП","Код ГП","GP_ID","TOV_ID")||""),
      qty: pn(g("Отгружено ГП (кг)","Отгружено_ГП_(кг)","GP_Qty")),
      revenue,
      rawCost,
      normCost,
      transport,
      finIncome: revenue - rawCost - normCost - transport,
    };
  }).filter(r => r.revenue > 0);
}

function parseFinIncomeRows(data) {
  return data.map(r => {
    const g = (...ks) => { for(const k of ks){const v=r[k]; if(v!==undefined&&v!==null&&String(v).trim()!=='') return String(v).trim();} return null; };
    const revenue = pn(g("Сумма (руб.)","Выручка (руб.)","Выручка"));
    const finIncome = pn(g("Фин. Доход (руб.)","Фин. Доход","Финансовый доход"));
    const costValue = g("Себестоимость (руб.)","Себестоимость","Себестоимость, руб");
    const totalCost = costValue !== null ? pn(costValue) : (revenue - finIncome);
    const orderId = g("Код заявки","ORDER_ID") || "";
    return {
      orderId,
      docCode: orderId || "",
      docSource: orderId ? 'order' : '',
      date: buildMonthDate(g("Год","year"), g("Месяц","month")) || g("Дата заявки (отгрузки)","Дата_заявки","Order_Date") || "",
      client: g("Клиент","Client_Name","Клиент ") || "",
      gpGroup: g("Товарная группа","Товарная_группа","GP_Group") || "",
      gpName: g("Товарная позиция (название)","Готовая продукция (ГП)","Готовая продукция","GP_Name") || "",
      gpId: String(g("Товарная позиция (код)","Код_ГП","Код ГП","GP_ID","TOV_ID") || ""),
      qty: pn(g("Кол-во (кг)","Отгружено ГП (кг)","Отгружено_ГП_(кг)","GP_Qty")),
      revenue,
      rawCost: totalCost,
      normCost: 0,
      transport: 0,
      finIncome,
    };
  }).filter(r => r.revenue > 0);
}

function loadSales(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const parseRows = rows => {
    const trimmed = trimKeys(rows);
    const mode = detectSalesMode(trimmed, UI.salesInputMode);
    const parsed = mode === 'finIncome' ? parseFinIncomeRows(trimmed) : parseSQLrows(trimmed);
    if (applySalesData(parsed, mode)) return;
    toast('Нет данных с выручкой > 0','err');
  };
  if(ext==='xlsx'||ext==='xls') {
    const rd=new FileReader(); rd.onload=e=>{try{
      const wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
      parseRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{raw:false}));
    }catch(err){toast('Ошибка продаж: '+err.message,'err')}}; rd.readAsArrayBuffer(file); return;
  }
  const tryEnc = enc => {
    const rd=new FileReader(); rd.onload=e=>{
      let txt=e.target.result; if(txt.charCodeAt(0)===0xFEFF)txt=txt.slice(1);
      const dl=detectDelim(txt); const p=Papa.parse(txt,{header:true,skipEmptyLines:true,delimiter:dl});
      if(!p.data?.length){if(enc==='UTF-8')tryEnc('windows-1251');else toast('Не удалось прочитать','err');return;}
      try {
        const trimmed = trimKeys(p.data);
        const mode = detectSalesMode(trimmed, UI.salesInputMode);
        const rows = mode === 'finIncome' ? parseFinIncomeRows(trimmed) : parseSQLrows(trimmed);
        if (applySalesData(rows, mode)) return;
        if(enc==='UTF-8') tryEnc('windows-1251'); else toast('Нет данных с выручкой > 0','err');
      } catch(err) {
        if(enc==='UTF-8') tryEnc('windows-1251'); else toast('Колонки не совпали: '+err.message,'err');
      }
    }; rd.readAsText(file,enc);
  }; tryEnc('UTF-8');
}

function loadAreas(file) {
  const rd=new FileReader(); rd.onload=e=>{try{
    const wb=XLSX.read(e.target.result,{type:'array'});
    const sheets=wb.SheetNames;

    // Auto-detect sheets
    let tpSheet=null, areaSheet=null;
    for(const sn of sheets) {
      const d=XLSX.utils.sheet_to_json(wb.Sheets[sn],{range:0});
      const cols=Object.keys(d[0]||{}).join(' ').toLowerCase();
      if(cols.includes('код тп')||cols.includes('код_тп')) tpSheet=sn;
      else if(cols.includes('загруженность')||cols.includes('период')) areaSheet=sn;
    }
    if(!tpSheet&&!areaSheet) { tpSheet=sheets[0]; areaSheet=sheets[1]||sheets[0]; }
    if(!tpSheet) tpSheet=sheets[0];
    if(!areaSheet) areaSheet=sheets[1]||sheets[0];

    // Parse TP (Sheet1)
    if(tpSheet) {
      const raw = trimKeys(XLSX.utils.sheet_to_json(wb.Sheets[tpSheet]));
      D.tpRows = raw.map(r => {
        const g=(...ks)=>{for(const k of ks){const v=r[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return null;};
        const m6 = g("Месяц","месяц","month");
        return {
          group: g("Группа участков","Группа_участков","group")||"",
          area: g("Участок","участок","area")||"",
          gpName: g("ГП","гп","gpName")||"",
          gpCode: String(g("код ТП","код_ТП","Код_ГП","gpCode")||""),
          month: m6 ? (/^\d{6}$/.test(m6)?m6.slice(0,4)+'-'+m6.slice(4):parseMonth(m6)) : "",
          qty: pn(g("Кол-во ГП (кг)_","Кол-во ГП","qty")),
          direct: Math.abs(pn(g("Прямые затраты, руб","Прямые_затраты","Прямые затраты","direct"))),
          distL: Math.abs(pn(g("Распределенные с логикой затраты","Распред_с_логикой","distL"))),
          distNL: Math.abs(pn(g("Распределенные без логики затраты","Распред_без_логики","distNL"))),
          marginInc: pn(g("Маржинальный доход от выпуска, руб","Маржинальный_доход","marginInc")),
        };
      }).filter(r => r.group && r.month);
    }

    // Parse Areas (Sheet2)
    if(areaSheet && areaSheet !== tpSheet) {
      const raw = trimKeys(XLSX.utils.sheet_to_json(wb.Sheets[areaSheet]));
      D.areaRows = raw.map(r => {
        const g=(...ks)=>{for(const k of ks){const v=r[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return null;};
        return {
          name: g("Наименование группы Участков","Наименование_участка","Наименование группы участков","name")||"",
          month: parseMonth(g("период","Месяц","month")||""),
          util: pn(g("Загруженность","Загруженность_процент","util"))*100,
          direct: Math.abs(pn(g("Прямые затраты, руб","Прямые_затраты","Прямые затраты","direct"))),
          distL: Math.abs(pn(g("Распределенные с логикой затраты","Распред_с_логикой","Распределенные с логикой","distL"))),
          distNL: Math.abs(pn(g("Распределенные без логики затраты","Распред_без_логики","Распределенные без логики","distNL"))),
          marginInc: pn(g("Маржинальный доход от выпуска, руб","Маржинальный_доход","marginInc")),
          finResult: pn(g("Финансовый результат от выпуска, руб","Финансовый_результат","finResult")),
        };
      }).filter(r => r.name && r.month);
    }

    D.areaOk = (D.tpRows.length>0 || D.areaRows.length>0);
    UI.offA = new Set();
    UI.quickMenu = null;
    render();
    toast(`✓ ${D.tpRows.length} ТП строк, ${D.areaRows.length} участков строк`,'ok');
  }catch(err){toast('Ошибка Excel: '+err.message,'err')}}; rd.readAsArrayBuffer(file);
}

function autoSetDates() {
  const dates = D.ships.map(s=>s.date).filter(Boolean).sort();
  if(dates.length) { UI.dateFrom=dates[0]; UI.dateTo=dates[dates.length-1]; }
}

/* ═══ AUTO-LOAD from /data/ folder ═══ */
async function autoLoad() {
  // Try loading sales data from data/sql_data.csv
  try {
    const resp = await fetch('./data/sql_data.csv');
    if(resp.ok) {
      const txt = await resp.text();
      const dl = detectDelim(txt);
      const p = Papa.parse(txt,{header:true,skipEmptyLines:true,delimiter:dl});
      if(p.data?.length) {
        const trimmed = trimKeys(p.data);
        const mode = detectSalesMode(trimmed, 'auto');
        const rows = mode === 'finIncome' ? parseFinIncomeRows(trimmed) : parseSQLrows(trimmed);
        applySalesData(rows, mode, {skipRender:true, silent:true});
        if(rows.length) toast(`✓ Автозагрузка продаж (${getSalesMeta(mode).badgeLabel}): ${rows.length} строк`,'ok');
      }
    }
  } catch(e) { /* no file, ok */ }

  // Try loading Areas from data/areas.xlsx
  try {
    const resp = await fetch('./data/areas.xlsx');
    if(resp.ok) {
      const buf = await resp.arrayBuffer();
      // Re-use loadAreas logic but from buffer
      const wb = XLSX.read(buf, {type:'array'});
      const sheets=wb.SheetNames;
      let tpSheet=null, areaSheet=null;
      for(const sn of sheets) {
        const d=trimKeys(XLSX.utils.sheet_to_json(wb.Sheets[sn],{range:0}));
        const cols=Object.keys(d[0]||{}).join(' ').toLowerCase();
        if(cols.includes('код тп')) tpSheet=sn;
        else if(cols.includes('загруженность')||cols.includes('период')) areaSheet=sn;
      }
      if(!tpSheet) tpSheet=sheets[0];
      if(!areaSheet) areaSheet=sheets[1]||sheets[0];

      if(tpSheet) {
        const raw=trimKeys(XLSX.utils.sheet_to_json(wb.Sheets[tpSheet]));
        D.tpRows=raw.map(r=>{const g=(...ks)=>{for(const k of ks){const v=r[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return null;};const m6=g("Месяц","месяц","month");return{group:g("Группа участков","group")||"",area:g("Участок","area")||"",gpName:g("ГП","gpName")||"",gpCode:String(g("код ТП","Код_ГП")||""),month:m6?(/^\d{6}$/.test(m6)?m6.slice(0,4)+'-'+m6.slice(4):parseMonth(m6)):"",qty:pn(g("Кол-во ГП (кг)_","qty")),direct:Math.abs(pn(g("Прямые затраты, руб","direct"))),distL:Math.abs(pn(g("Распределенные с логикой затраты","distL"))),distNL:Math.abs(pn(g("Распределенные без логики затраты","distNL"))),marginInc:pn(g("Маржинальный доход от выпуска, руб","marginInc"))};}).filter(r=>r.group&&r.month);
      }
      if(areaSheet && areaSheet!==tpSheet) {
        const raw=trimKeys(XLSX.utils.sheet_to_json(wb.Sheets[areaSheet]));
        D.areaRows=raw.map(r=>{const g=(...ks)=>{for(const k of ks){const v=r[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return null;};return{name:g("Наименование группы Участков","name")||"",month:parseMonth(g("период","Месяц")||""),util:pn(g("Загруженность"))*100,direct:Math.abs(pn(g("Прямые затраты, руб","direct"))),distL:Math.abs(pn(g("Распределенные с логикой затраты","distL"))),distNL:Math.abs(pn(g("Распределенные без логики затраты","distNL"))),marginInc:pn(g("Маржинальный доход от выпуска, руб","marginInc")),finResult:pn(g("Финансовый результат от выпуска, руб","finResult"))};}).filter(r=>r.name&&r.month);
      }
      if(D.tpRows.length||D.areaRows.length) { D.areaOk=true; toast(`✓ Автозагрузка: ${D.tpRows.length} ТП, ${D.areaRows.length} участков`,'ok'); }
    }
  } catch(e) { /* no file, ok */ }

  render();
}
