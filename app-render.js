"use strict";

/* ═══ RENDER ═══ */
function render() {
  Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}}); charts={};

  const ships = getShips();
  const salesMeta = getSalesMeta();
  const holdingConfig = getHoldingConfig(ships, salesMeta);
  const gpToArea = buildGpToArea();
  const groups = getGroups(ships);
  const clients = getClients(ships);
  const products = getProducts(ships);
  const g2a = groupToArea(groups, gpToArea);
  const eog = effOffGroups(groups, g2a);
  const active = filterActiveShips(ships, gpToArea);
  const displayShips = filterShipsByScenario(ships, gpToArea, {
    offA: new Set(),
    offG: new Set(),
    offC: new Set(),
    offP: new Set(),
    offCP: new Set(),
    selA: UI.selA,
    selG: UI.selG,
    selC: UI.selC,
  });
  const hasSel = !!(UI.selA || UI.selG || UI.selC.size);
  const hasSalesSlice = !!(UI.selG || UI.selC.size);
  const hasSalesScenario = !!(UI.offG.size || UI.offC.size || UI.offP.size || UI.offCP.size || UI.selG || UI.selC.size);
  const areaOnlyActive = hasSalesScenario
    ? filterShipsByScenario(ships, gpToArea, {
        offA: UI.offA,
        offG: new Set(),
        offC: new Set(),
        offP: new Set(),
        offCP: new Set(),
        selA: UI.selA,
        selG: '',
        selC: new Set(),
      })
    : active;
  const salesScenarioAffectsSales = hasSalesScenario && shipScenarioSignature(areaOnlyActive) !== shipScenarioSignature(active);
  const scenarioOffCount = UI.offA.size + UI.offG.size + UI.offC.size + UI.offP.size + UI.offCP.size;
  const changed = scenarioOffCount > 0 || hasSel;
  const disN = scenarioOffCount;
  const areas = allAreaNames();

  // Debug: mapping coverage
  const mappedGpIds = new Set(gpToArea.keys());
  const allGpIds = new Set(ships.map(s=>s.gpId));
  const matchCount = [...allGpIds].filter(id=>mappedGpIds.has(id)).length;

  // TP aggregated (needed by gStats)
  const tpFiltered = getTP();
  const baseAlloc = buildAllocatedShips(ships, tpFiltered, gpToArea);
  const areaOnlyAlloc = buildAllocatedShips(areaOnlyActive, tpFiltered, gpToArea);
  const currentAlloc = buildAllocatedShips(active, tpFiltered, gpToArea);
  const displayAlloc = buildAllocatedShips(displayShips, tpFiltered, gpToArea);
  const holdingBase = applyHoldingAllocation(baseAlloc, holdingConfig);
  const holdingAreaOnly = applyHoldingAllocation(areaOnlyAlloc, holdingConfig);
  const holdingCurrent = applyHoldingAllocation(currentAlloc, holdingConfig);
  const holdingDisplay = applyHoldingAllocation(displayAlloc, holdingConfig);
  const allocActive = holdingCurrent.rows;
  const allocDisplay = holdingDisplay.rows;
  const base = withHolding(calcPL(baseAlloc), holdingBase);
  const areaOnly = withHolding(calcPL(areaOnlyAlloc), holdingAreaOnly);
  const cur = withHolding(calcPL(currentAlloc), holdingCurrent);
  const overviewUsesAreaSheet = D.areaRows.length > 0 && !hasSalesSlice;
  const overviewAnchoredToSheet = overviewUsesAreaSheet && salesScenarioAffectsSales;
  const baseAreaSheet = overviewUsesAreaSheet ? calcAreaSheetSummary(false) : null;
  const curAreaSheet = overviewUsesAreaSheet ? calcAreaSheetSummary(true) : null;
  function mergeAreaSheet(summary, areaSheet) {
    if (!areaSheet) return {...summary, needNormUp:summary.needNormUp||0};
    const opResult = summary.cm1 + areaSheet.areaResult;
    const finalResult = opResult - summary.holdingTotal;
    return {
      ...summary,
      areaResult: areaSheet.areaResult,
      needNormUp: areaSheet.needNormUp,
      opResult,
      finalResult,
      mArea: summary.rev>0 ? areaSheet.areaResult/summary.rev : 0,
      mOp: summary.rev>0 ? opResult/summary.rev : 0,
      mFinal: summary.rev>0 ? finalResult/summary.rev : 0,
    };
  }
  const baseS = overviewUsesAreaSheet
    ? mergeAreaSheet(overviewAnchoredToSheet ? areaOnly : base, overviewAnchoredToSheet ? curAreaSheet : baseAreaSheet)
    : {...base, needNormUp:base.needNormUp||0};
  const curS = overviewUsesAreaSheet
    ? mergeAreaSheet(cur, curAreaSheet)
    : {...cur, needNormUp:cur.needNormUp||0};
  const areaReconGap = overviewUsesAreaSheet ? curS.areaResult - cur.areaResult : 0;
  const holdingConfigured = holdingConfig.monthly > 0;
  const groupResultKey = holdingConfigured ? 'gNet' : 'gOp';
  const groupPctKey = holdingConfigured ? 'mNet' : 'mOp';
  const cpResultKey = holdingConfigured ? 'finalOp' : 'op';
  const cpPctKey = holdingConfigured ? 'finalOpMargin' : 'opMargin';
  const productGroupMap = new Map();
  ships.forEach(s => {
    const productKey = getProductKey(s);
    if (productKey && !productGroupMap.has(productKey)) productGroupMap.set(productKey, s.gpGroup || '');
  });

  function sortStatRows(rows, key, dir) {
    rows.sort((a,b)=>{
      const av=a[key], bv=b[key];
      if(typeof av==='string') return dir*av.localeCompare(bv,'ru');
      return dir*((bv||0)-(av||0));
    });
    return rows;
  }

  function buildGroupStats(rows) {
    return groups.map(g => {
      const sh=rows.filter(s=>s.gpGroup===g.id); const rev=sh.reduce((a,s)=>a+s.revenue,0);
      const raw=sh.reduce((a,s)=>a+s.rawCost,0), norm=sh.reduce((a,s)=>a+s.normCost,0), trans=sh.reduce((a,s)=>a+s.transport,0);
      const vc=raw+norm+trans, cm=rev-vc;
      const gMarginInc=sh.reduce((a,s)=>a+s.allocMarginInc,0), gDirect=sh.reduce((a,s)=>a+s.allocDirect,0), gDistL=sh.reduce((a,s)=>a+s.allocDistL,0), gDistNL=sh.reduce((a,s)=>a+s.allocDistNL,0);
      const gAreaResult=sh.reduce((a,s)=>a+s.allocAreaResult,0), needNormUp=sh.reduce((a,s)=>a+s.normGap,0);
      const holding=sh.reduce((a,s)=>a+s.allocHolding,0);
      const gOp=sh.reduce((a,s)=>a+s.op,0), gNet=sh.reduce((a,s)=>a+s.finalOp,0);
      return {...g, rev, raw, norm, trans, vc, cm, gMarginInc, gDirect, gDistL, gDistNL, gAreaResult, needNormUp, gOp, gNet, holding, margin:rev>0?cm/rev:0, mArea:rev>0?gAreaResult/rev:0, mOp:rev>0?gOp/rev:0, mNet:rev>0?gNet/rev:0, areaName:g2a.get(g.id)||'—', off:eog.has(g.id), qty:sh.reduce((a,s)=>a+s.qty,0), cnt:sh.length};
    });
  }

  function buildClientStats(rows) {
    return clients.map(c => {
      const sh=rows.filter(s=>s.client===c); const rev=sh.reduce((a,s)=>a+s.revenue,0);
      const raw=sh.reduce((a,s)=>a+s.rawCost,0), norm=sh.reduce((a,s)=>a+s.normCost,0), trans=sh.reduce((a,s)=>a+s.transport,0);
      const vc=raw+norm+trans, cm=rev-vc;
      const allocMarginInc=sh.reduce((a,s)=>a+s.allocMarginInc,0), allocDirect=sh.reduce((a,s)=>a+s.allocDirect,0), allocDistL=sh.reduce((a,s)=>a+s.allocDistL,0), allocDistNL=sh.reduce((a,s)=>a+s.allocDistNL,0);
      const allocArea=sh.reduce((a,s)=>a+s.allocArea,0), areaResult=sh.reduce((a,s)=>a+s.allocAreaResult,0), needNormUp=sh.reduce((a,s)=>a+s.normGap,0), op=sh.reduce((a,s)=>a+s.op,0), holding=sh.reduce((a,s)=>a+s.allocHolding,0), finalResult=sh.reduce((a,s)=>a+s.finalOp,0);
      return {id:c,name:c,rev,raw,norm,trans,vc,cm,allocMarginInc,allocDirect,allocDistL,allocDistNL,allocArea,areaResult,needNormUp,op,holding,finalResult,margin:rev>0?cm/rev:0,mOp:rev>0?op/rev:0,mNet:rev>0?finalResult/rev:0,groups:[...new Set(sh.map(s=>s.gpGroup))].length,off:UI.offC.has(c),qty:sh.reduce((a,s)=>a+s.qty,0),cnt:sh.length};
    });
  }

  const gStats = sortStatRows(buildGroupStats(allocActive), UI.grpSort, UI.grpSortDir);
  const tabGStats = sortStatRows(buildGroupStats(allocDisplay), UI.grpSort, UI.grpSortDir);
  const cStats = sortStatRows(buildClientStats(allocActive), UI.cliSort, UI.cliSortDir);
  const tabCStats = sortStatRows(buildClientStats(allocDisplay), UI.cliSort, UI.cliSortDir);

  const areaHoldingMap = new Map();
  allocActive.forEach(s => {
    if (!s.areaName) return;
    areaHoldingMap.set(s.areaName, (areaHoldingMap.get(s.areaName) || 0) + s.allocHolding);
  });

  const aStats = areas.map(name => {
    const ag = areaAgg(name);
    const on = !UI.offA.has(name);
    // Shipments count
    const gpCodes = new Set(D.tpRows.filter(r=>r.group===name).map(r=>r.gpCode));
    const sh = active.filter(s => gpCodes.has(String(s.gpId)));
    const myNL = ag.distNL;
    const opResult=ag.finResult || ag.marginInc-ag.direct-ag.distL-myNL;
    const holding=areaHoldingMap.get(name)||0;
    return {name,...ag,myNL,on,cnt:sh.length,
      cm2:ag.marginInc-ag.direct, cm3:ag.marginInc-ag.direct-ag.distL,
      opResult, needNormUp:Math.max(-opResult,0), holding, finalAfterHolding:opResult-holding};
  });

  // TP aggregated
  const tpMap = new Map();
  tpFiltered.forEach(r => {
    const key=r.gpCode;
    if(!tpMap.has(key)) tpMap.set(key,{gpCode:r.gpCode,gpName:r.gpName,group:r.group,qty:0,direct:0,distL:0,distNL:0,marginInc:0});
    const o=tpMap.get(key); o.qty+=r.qty; o.direct+=r.direct; o.distL+=r.distL; o.distNL+=r.distNL; o.marginInc+=r.marginInc;
  });
  function buildProductStats(salesRows, allocRows) {
    const gpSalesMap = new Map();
    salesRows.forEach(s => {
      const k = String(s.gpId || '').trim();
      if(!k) return;
      if(!gpSalesMap.has(k)) gpSalesMap.set(k,{rev:0,qty:0,clients:new Set(),gpName:s.gpName||'',salesGroup:s.gpGroup||''});
      const o=gpSalesMap.get(k); o.rev+=s.revenue; o.qty+=s.qty; o.clients.add(s.client);
      if(!o.gpName && s.gpName) o.gpName=s.gpName;
      if(!o.salesGroup && s.gpGroup) o.salesGroup=s.gpGroup;
    });
    const gpHoldingMap = new Map();
    allocRows.forEach(s => {
      const k=String(s.gpId);
      if(!gpHoldingMap.has(k)) gpHoldingMap.set(k,{holding:0});
      gpHoldingMap.get(k).holding += s.allocHolding;
    });
    const allCodes = new Set([...tpMap.keys(), ...gpSalesMap.keys()]);
    const rows=[...allCodes].map(code=>{
      const tp=tpMap.get(code)||{gpCode:code,gpName:'',group:'',qty:0,direct:0,distL:0,distNL:0,marginInc:0};
      const sales=gpSalesMap.get(code)||{rev:0,qty:0,clients:new Set(),gpName:'',salesGroup:''};
      const gpName=tp.gpName||sales.gpName||code;
      const group=tp.group||gpToArea.get(String(code))||'';
      const productKey=getProductKey({gpCode:code,gpName});
      const productGroup=productGroupMap.get(productKey)||sales.salesGroup||'';
      const fin=tp.marginInc-tp.direct-tp.distL-tp.distNL;
      const holding=(gpHoldingMap.get(String(code))||{holding:0}).holding;
      const hasTp=tpMap.has(code);
      const hasSales=gpSalesMap.has(code);
      const off=!!((productKey && UI.offP.has(productKey)) || (group && UI.offA.has(group)) || (productGroup && eog.has(productGroup)));
      return {...tp,gpCode:code,gpName,group,productKey,productGroup,off,rev:sales.rev,sqlQty:sales.qty,clientCnt:sales.clients.size,clientList:[...sales.clients].slice(0,5).join(', '),salesGroup:sales.salesGroup||'',fin,needNormUp:Math.max(-fin,0),holding,finalAfterHolding:fin-holding,margin:tp.marginInc>0?fin/tp.marginInc:0,hasTp,hasSales,matchLabel:hasTp&&hasSales?'ТП + продажи':hasTp?'Только ТП':'Только продажи'};
    });
    return sortStatRows(rows, UI.prodSort, UI.prodSortDir);
  }

  function buildClientProductStats(rows) {
    const cpMap = new Map();
    rows.forEach(s => {
      const key=getClientProductKey(s) || (s.client+'|||'+s.gpId);
      if(!cpMap.has(key)) cpMap.set(key,{rowKey:key,client:s.client,gpId:s.gpId,gpName:s.gpName,gpGroup:s.gpGroup,qty:0,revenue:0,rawCost:0,normCost:0,transport:0,allocDirect:0,allocDistL:0,allocDistNL:0,allocAreaResult:0,normGap:0,allocHolding:0,tpMatchedCnt:0,rowCnt:0,docs:new Map()});
      const o=cpMap.get(key); o.qty+=s.qty; o.revenue+=s.revenue; o.rawCost+=s.rawCost; o.normCost+=s.normCost; o.transport+=s.transport; o.allocDirect+=s.allocDirect; o.allocDistL+=s.allocDistL; o.allocDistNL+=s.allocDistNL; o.allocAreaResult+=s.allocAreaResult; o.normGap+=s.normGap; o.allocHolding+=s.allocHolding; o.tpMatchedCnt+=s.tpMatched?1:0; o.rowCnt+=1;
      const docCode = String(s.docCode || '').trim();
      if(docCode){
        if(!o.docs.has(docCode)) o.docs.set(docCode,{code:docCode,source:s.docSource || '',rows:0,qty:0,revenue:0});
        const d=o.docs.get(docCode); d.rows+=1; d.qty+=s.qty||0; d.revenue+=s.revenue||0;
      }
    });
    const items=[...cpMap.values()].map(c=>{const vc=c.rawCost+c.normCost+c.transport; const allocArea=c.allocDirect+c.allocDistL+c.allocDistNL; const areaResult=c.allocAreaResult; const cm=c.revenue-vc; const op=cm+areaResult; const finalOp=op-c.allocHolding; const docs=[...c.docs.values()].sort((a,b)=>b.revenue-a.revenue||b.qty-a.qty||String(a.code).localeCompare(String(b.code),'ru',{numeric:true})); const productKey=getProductKey(c); const rowKey=c.rowKey || getClientProductKey(c); const off=!!(UI.offC.has(c.client) || (productKey && UI.offP.has(productKey)) || UI.offCP.has(rowKey) || eog.has(c.gpGroup)); return{...c,rowKey,productKey,off,vc,allocArea,areaResult,needNormUp:c.normGap,cm,op,finalOp,margin:c.revenue>0?cm/c.revenue:0,opMargin:c.revenue>0?op/c.revenue:0,finalOpMargin:c.revenue>0?finalOp/c.revenue:0,tpMatched:c.tpMatchedCnt>0,docs,docMode:docs.length?'order':'none'};});
    return sortStatRows(items, UI.cpSort, UI.cpSortDir);
  }

  const tabTpStats = buildProductStats(displayShips, allocDisplay);
  const cpStats = buildClientProductStats(allocActive);
  const tabCpStats = buildClientProductStats(allocDisplay);
  const excludedClientProducts = [...UI.offCP].map(key => ({key,label:buildClientProductLabel(key, ships)})).sort((a,b)=>a.label.localeCompare(b.label, 'ru'));
  const tabGStatsFiltered = UI.tabSearchG ? tabGStats.filter(g => matchesSearch(UI.tabSearchG, g.name, g.areaName)) : tabGStats;
  const tabCStatsFiltered = UI.tabSearchC ? tabCStats.filter(c => matchesSearch(UI.tabSearchC, c.name)) : tabCStats;
  const tabTpStatsFiltered = UI.searchTP ? tabTpStats.filter(t => matchesSearch(UI.searchTP, t.gpName, t.group, t.salesGroup, t.gpCode, t.clientList)) : tabTpStats;
  const cpStatsFiltered = UI.tabSearchCP ? cpStats.filter(c => matchesSearch(UI.tabSearchCP, c.client, c.gpName, c.gpGroup, c.gpId)) : cpStats;
  const tabCpStatsFiltered = UI.tabSearchCP ? tabCpStats.filter(c => matchesSearch(UI.tabSearchCP, c.client, c.gpName, c.gpGroup, c.gpId)) : tabCpStats;
  const tabAStats = UI.tabSearchA ? aStats.filter(a => matchesSearch(UI.tabSearchA, a.name)) : aStats;

  const negGroups = gStats.filter(g => g[groupResultKey] < 0).sort((a,b) => a[groupResultKey] - b[groupResultKey]);
  const negClientProducts = cpStats.filter(c => c[cpResultKey] < 0).sort((a,b) => a[cpResultKey] - b[cpResultKey]);

  const maxGR=Math.max(...gStats.map(g=>g.rev),1), maxCR=Math.max(...cStats.map(c=>c.rev),1);
  const fGroups=UI.searchG?groups.filter(g=>g.name.toLowerCase().includes(UI.searchG.toLowerCase())):groups;
  const fClients=UI.searchC?clients.filter(c=>c.toLowerCase().includes(UI.searchC.toLowerCase())):clients;
  const fProducts=UI.searchP?products.filter(p=>(`${p.label} ${p.group}`).toLowerCase().includes(UI.searchP.toLowerCase())):products;
  const primaryValue = holdingConfigured ? curS.finalResult : curS.opResult;
  const primaryBaseValue = holdingConfigured ? baseS.finalResult : baseS.opResult;
  const primaryLabel = holdingConfigured ? 'После затрат холд.' : 'После участков';
  const primaryPct = holdingConfigured ? curS.mFinal : curS.mOp;
  const primarySub = holdingConfigured
    ? `После участков - холдинг · ${pct(primaryPct)}`
    : `${salesMeta.profit1Label} + финрез участков · ${pct(primaryPct)}`;
  const impactDelta = primaryValue - primaryBaseValue;
  const impactBasisText = overviewUsesAreaSheet ? 'по листу участков' : 'по связанным продажам';
  const impactDirection = impactDelta >= 0 ? 'лучше' : 'хуже';
  const heroCards = [
    kpi('Выручка',fmt(curS.rev)+' ₽',`${active.length}/${ships.length} строк в срезе`,changed?curS.rev-baseS.rev:undefined),
    kpi(salesMeta.profit1Label,fmt(curS.cm1)+' ₽',pct(curS.m1),changed?curS.cm1-baseS.cm1:undefined),
    kpi('Рез. участков',fmt(curS.areaResult)+' ₽',`${overviewUsesAreaSheet?'Лист участков':'Связанные продажи'} · ${pct(curS.mArea)}`,changed?curS.areaResult-baseS.areaResult:undefined,curS.areaResult<0),
    holdingConfigured
      ? kpi('Холдинг',fmt(curS.holdingTotal)+' ₽',`${holdingConfig.months} мес. · ${holdingCurrent.effectiveModeText}`,changed?curS.holdingTotal-baseS.holdingTotal:undefined)
      : kpi('Норматив ↑',fmt(curS.needNormUp)+' ₽','чтобы закрыть минус участков',changed?curS.needNormUp-baseS.needNormUp:undefined,curS.needNormUp>0),
  ];

  function kpi(l,v,sub,delta,warn){
    let h=`<div class="k${warn?' w':''}"><div class="kl">${l}</div><div class="kv" style="color:${warn?'var(--red)':'var(--tx)'}">${v}</div>`;
    if(sub)h+=`<div class="ks">${sub}</div>`; if(delta!==undefined && Math.abs(delta)>=1)h+=`<div class="kd ${delta>=0?'up':'dn'}">${delta>=0?'↑':'↓'} ${fmtF(Math.abs(delta))}</div>`; return h+'</div>';
  }

  let html='';
  // Header
  html+=`<section class="top-shell fu"><div class="brand-block"><div class="brand-kicker">Аналитическая консоль</div><h1>Портфельный анализ</h1><p class="brand-sub">Продажи, участки и сценарные затраты в одном рабочем поле. Верх экрана теперь должен отвечать на главный вопрос сразу: что сейчас происходит с итогом.</p></div><div class="hdr-r">
    <select id="salesMode" class="tgsc" aria-label="Режим продаж">
      <option value="auto"${UI.salesInputMode==='auto'?' selected':''}>Автоформат продаж</option>
      <option value="sql"${UI.salesInputMode==='sql'?' selected':''}>SQL: сырье / норматив / транспорт</option>
      <option value="finIncome"${UI.salesInputMode==='finIncome'?' selected':''}>Продажи: фин. доход / себестоимость</option>
    </select>
    <label class="fbtn${D.sqlOk?' ok':''}"><span>${D.sqlOk?'✓':'↑'} Продажи</span><input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" id="fSQL"></label>
    <label class="fbtn${D.areaOk?' ok':''}"><span>${D.areaOk?'✓':'↑'} Участки (.xlsx)</span><input type="file" accept=".xlsx,.xls" id="fArea"></label>
  </div></section>`;
  // Period
  html+=`<div class="pbar fu"><label>Период</label><input type="date" id="dFrom" value="${UI.dateFrom}" aria-label="Начало периода"><span style="color:var(--muted)">—</span><input type="date" id="dTo" value="${UI.dateTo}" aria-label="Конец периода"><span class="pinfo">${active.length}/${ships.length} строк продаж</span>`;
  if(D.sqlOk) html+=`<span class="pinfo" style="background:#eff6ff;color:var(--blue)">Режим: ${salesMeta.variantLabel}</span>`;
  if(D.areaOk) html+=`<span class="pinfo" style="background:#f5f3ff;color:var(--purple)">Связано: ${matchCount}/${allGpIds.size} ГП → участки</span>`;
  if(holdingConfigured) html+=`<span class="pinfo" style="background:#fff7ed;color:#c2410c">Холдинг: ${fmtF(holdingConfig.monthly)}/мес · ${holdingConfig.months} мес. · по ${holdingCurrent.effectiveModeText}</span>`;
  html+=`</div>`;
  // Tabs
  const tabList=[['overview','Обзор'],['charts','Графики'],['groups','Группы'],['clients','Клиенты'],['products','Продукция'],['clientprod','Клиент×Продукт'],['areas','Участки']];
  html+=`<div class="nav fu"><div class="tabs">${tabList.map(([k,l])=>`<button class="tb${UI.tab===k?' on':''}" data-tab="${k}" type="button">${l}</button>`).join('')}</div><div class="navr">${changed?`<span class="bcnt">${disN} откл.</span>`:''}<button class="tgsc" id="toggleSc" type="button">${UI.scOpen?'▴ Скрыть сценарий':'▾ Показать сценарий'}</button></div></div>`;

  // Hero summary
  html+=`<section class="hero fu"><div class="hero-main${primaryValue<0?' warn':''}"><div class="hero-eyebrow">Главный итог</div><h2>${primaryLabel}</h2><div class="hero-value">${fmt(primaryValue)} ₽</div><p class="hero-sub">${primarySub}</p><div class="hero-foot">${deltaPill(changed?impactDelta:undefined)}<span class="hero-pill">Источник участков: ${overviewUsesAreaSheet?'лист':'аллокация продаж'}</span>${holdingConfigured?`<span class="hero-pill">Холдинг: ${fmtF(holdingConfig.monthly)}/мес</span>`:''}</div></div><div class="hero-grid">${heroCards.join('')}</div></section>`;

  // Impact
  if(changed && Math.abs(impactDelta) >= 1){
    const g=impactDelta>=0;
    html+=`<div class="imp fu ${g?'g':'b'}"><strong style="color:${g?'var(--green)':'var(--red)'}">${g?'✓ Улучшает':'⚠ Ухудшает'}</strong> ${primaryLabel.toLowerCase()} на <strong class="mn">${fmtF(Math.abs(impactDelta))}</strong></div>`;
    if(overviewAnchoredToSheet) {
      html+=`<div class="dbg" style="margin-top:10px">Главный итог держит общий финрез участков по листу: <span class="mn">${fmtF(curS.areaResult)}</span>. Исключения меняют только продажную часть, поэтому итог сравнивается с базой без этих исключений в том же контуре участков: <span class="mn">${fmtF(primaryBaseValue)}</span>.</div>`;
    } else {
      html+=`<div class="dbg" style="margin-top:10px">Сопоставимая база без текущих исключений (${impactBasisText}): <span class="mn">${fmtF(primaryBaseValue)}</span>. Текущий сценарий ${impactDirection} этой базы на <span class="mn">${fmtF(Math.abs(impactDelta))}</span>.</div>`;
    }
  }
  if(overviewUsesAreaSheet && Math.abs(areaReconGap) > 1) html+=`<div class="rnote">В обзоре финрез участков берется напрямую с листа «Данные по участкам»: ${fmtF(curS.areaResult)}. По связанным продажам сейчас разнесено ${fmtF(cur.areaResult)}, разница ${fmtF(areaReconGap)} пока не попадает в детальные вкладки из-за неполной связки ГП → участки.</div>`;
  if(!overviewUsesAreaSheet && salesScenarioAffectsSales) html+=`<div class="rnote">При срезах по клиентам или группам обзорный финрез участков считается по связанным продажам, а не напрямую по листу участков. Поэтому выгодность сценария выше сравнивается с сопоставимой базой по связанным продажам.</div>`;
  if(curS.needNormUp>0) html+=`<div class="rnote">Норматив сейчас не покрывает участки на ${fmtF(curS.needNormUp)}. На вкладке «Участки» карточки с минусовым финрезом показывают, на сколько нужно поднять производственный норматив.</div>`;
  if(holdingConfigured) html+=`<div class="rnote">Холдинг: ${fmtF(holdingConfig.monthly)} / мес × ${holdingConfig.months} мес. = ${fmtF(curS.holdingTotal)} в текущем срезе, распределение по ${holdingCurrent.effectiveModeText}.</div>`;

  // Scenario
  if(UI.scOpen){
    const selCCount = UI.selC.size;
    html+=`<section class="scp fu"><div class="sc-head"><div><div class="brand-kicker">Панель сценария</div><div class="sc-title">Фильтры & сценарий</div><p class="brand-sub">Сначала сужайте рабочую выборку, затем настраивайте холдинг и только после этого переходите к точечным исключениям.</p></div>${changed?`<span class="bcnt">${disN} исключений${hasSel?' · выборка активна':''}</span>`:''}</div><div class="sc-grid">`;
    html+=`<div class="sc-panel"><div class="sch"><div class="slb">Выборка</div><span class="pinfo">${hasSel?'Фильтры активны':'Все данные в срезе'}</span></div><div class="field-grid"><div><div class="slb" style="margin-bottom:4px">Участок</div><select id="selA" class="sinp"><option value="">Все участки</option>${areas.map(a=>`<option value="${esc(a)}"${UI.selA===a?' selected':''}>${esc(a)}</option>`).join('')}</select></div><div><div class="slb" style="margin-bottom:4px">Товарная группа</div><select id="selG" class="sinp"><option value="">Все группы</option>${groups.map(g=>`<option value="${esc(g.id)}"${UI.selG===g.id?' selected':''}>${esc(g.name)}</option>`).join('')}</select></div><div><div class="slb" style="margin-bottom:4px">Клиенты ${selCCount?`<span style="color:var(--blue);font-weight:700">(${selCCount})</span>`:''}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><input class="sinp" placeholder="Поиск клиента…" id="sSelC" value="${esc(UI._selCSearch||'')}"><button class="fbtn" id="selCBtn" type="button">${selCCount?'Сбросить выбор':(UI._selCExpand?'Скрыть список':'Показать список')}</button></div></div></div>`;
    if(UI._selCSearch || selCCount || UI._selCExpand) {
      const fSelC = clients.filter(c => {
        if(UI._selCSearch) return c.toLowerCase().includes(UI._selCSearch.toLowerCase());
        if(UI._selCExpand) return true;
        return UI.selC.has(c);
      }).slice(0, UI._selCSearch ? 50 : 30);
      html+=`<div class="scs" style="margin-top:12px"><div class="scw">${fSelC.map(c=>`<button class="ch ${UI.selC.has(c)?'on':'off'}" style="${UI.selC.has(c)?'background:var(--teal)':''}" data-selC="${esc(c)}" type="button">${esc(c)}</button>`).join('')}</div></div>`;
    }
    html+=`</div>`;
    html+=`<div class="sc-panel"><div class="sch"><div class="slb">Холдинг</div>${holdingConfigured?`<span class="pinfo" style="background:#fff7ed;color:#c2410c">${fmtF(holdingConfig.total)} за период</span>`:''}</div><div class="field-grid"><div><div class="slb" style="margin-bottom:4px">Сумма в месяц, ₽</div><input id="holdingMonthly" class="sinp" placeholder="446 млн" value="${esc(UI.holdingMonthlyInput||'')}"></div><div><div class="slb" style="margin-bottom:4px">Распределять по</div><select id="holdingAllocMode" class="sinp"><option value="revenue"${UI.holdingAllocMode==='revenue'?' selected':''}>Выручке</option><option value="margin"${UI.holdingAllocMode==='margin'?' selected':''}>${salesMeta.profit1Label}</option></select></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><div class="pinfo">${holdingConfig.months || 0} мес. в периоде</div><div class="pinfo" style="background:#fffbeb;color:#92400e">${holdingConfigured?fmtF(holdingConfig.total):'0 ₽'} пул</div>${holdingConfigured?`<button class="fbtn" id="clearHolding" type="button">Очистить</button>`:''}</div><div style="margin-top:10px;font-size:12px;color:var(--tx3)">Поддерживается ввод: <span class="mn">446000000</span>, <span class="mn">446 млн</span>, <span class="mn">0.446 млрд</span>.</div>${holdingCurrent.warning?`<div class="dbg" style="margin-top:10px;margin-bottom:0">${esc(holdingCurrent.warning)}</div>`:''}</div>`;
    html+=`<div class="sc-panel wide"><details${UI._exclOpen?' open':''}><summary class="slb" style="cursor:pointer;user-select:none">Исключения ${scenarioOffCount?'<span style="color:var(--red);font-weight:700">'+scenarioOffCount+' откл.</span>':''}</summary><div style="margin-top:8px;font-size:12px;color:var(--tx3)">Цветной чип = участвует, красный зачеркнутый = исключен. Быстрое меню по названию в таблицах тоже использует этот же сценарий.</div><div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">`;
    if(areas.length) html+=`<div><div class="slb" style="margin-bottom:6px">Участки</div><div class="scw">${areas.map((a,i)=>`<button class="ch excl ${UI.offA.has(a)?'off':'on'}" style="${UI.offA.has(a)?'':`background:${COLORS[i%10]}`}" data-tA="${esc(a)}" type="button">${esc(a.length>32?a.slice(0,32)+'…':a)}</button>`).join('')}</div></div>`;
    html+=`<div><div class="slb" style="margin-bottom:6px">Группы ${UI.offG.size>0?'<button class="sea" id="enG" type="button">Вкл. все</button>':''}</div>${groups.length>8?`<input class="sinp" placeholder="Поиск…" id="sG" value="${esc(UI.searchG)}" style="margin-bottom:8px">`:''}<div class="scw">${fGroups.map(g=>`<button class="ch excl ${eog.has(g.id)?'off':'on'}" style="${eog.has(g.id)?'':'background:var(--blue)'}" data-tG="${esc(g.id)}" type="button">${esc(g.name)}</button>`).join('')}</div></div>`;
    html+=`<div><div class="slb" style="margin-bottom:6px">Клиенты ${UI.offC.size>0?'<button class="sea" id="enC" type="button">Вкл. все</button>':''}</div>${clients.length>8?`<input class="sinp" placeholder="Поиск…" id="sC" value="${esc(UI.searchC)}" style="margin-bottom:8px">`:''}<div class="scw">${fClients.map(c=>`<button class="ch excl ${UI.offC.has(c)?'off':'on'}" style="${UI.offC.has(c)?'':'background:var(--green)'}" data-tC="${esc(c)}" type="button">${esc(c)}</button>`).join('')}</div></div>`;
    html+=`<div><div class="slb" style="margin-bottom:6px">Продукция ${UI.offP.size>0?'<button class="sea" id="enP" type="button">Вкл. все</button>':''}</div>${products.length>8?`<input class="sinp" placeholder="Поиск продукции…" id="sP" value="${esc(UI.searchP)}" style="margin-bottom:8px">`:''}<div class="scw">${fProducts.map(p=>`<button class="ch excl ${UI.offP.has(p.key)?'off':'on'}" style="${UI.offP.has(p.key)?'':'background:#0ea5e9'}" data-tP="${esc(p.key)}" type="button" title="${esc(p.label)}">${esc(p.label.length>36?p.label.slice(0,36)+'…':p.label)}</button>`).join('')}</div></div>`;
    if(excludedClientProducts.length) html+=`<div><div class="slb" style="margin-bottom:6px">Связки клиент × продукт <button class="sea" id="enCP" type="button">Вкл. все</button></div><div class="scw">${excludedClientProducts.map(cp=>`<button class="ch excl off" data-tCP="${esc(cp.key)}" type="button" title="${esc(cp.label)}">${esc(cp.label.length>72?cp.label.slice(0,72)+'…':cp.label)}</button>`).join('')}</div><div class="dbg" style="margin-top:8px;margin-bottom:0">Эти исключения снимают только конкретную связку, а не клиента или продукт целиком.</div></div>`;
    html+=`</div></details></div></div>`;
    if(changed)html+=`<div class="scr"><button id="resetAll" class="fbtn" type="button">↺ Сбросить всё</button></div>`;
    html+=`</section>`;
  }

  // === TAB CONTENT ===

  if(UI.tab==='overview'){
    let rows=salesMeta.hasSplitCosts
      ? [{l:'Выручка',v:curS.rev,c:'var(--blue)'},{l:`— ${salesMeta.cost1Label} (SQL)`,v:-active.reduce((a,s)=>a+s.rawCost,0),c:'var(--red)'},{l:`— ${salesMeta.cost2Label} (SQL)`,v:-active.reduce((a,s)=>a+s.normCost,0),c:'var(--amber)'},{l:`— ${salesMeta.cost3Label} (SQL)`,v:-active.reduce((a,s)=>a+s.transport,0),c:'#eab308'},{l:`= ${salesMeta.profit1Label}`,v:curS.cm1,c:'var(--green)',b:1},{l:'± Финрез участков',v:curS.areaResult,c:curS.areaResult>=0?'var(--green)':'var(--red)'},{l:'= После участков',v:curS.opResult,c:curS.opResult>=0?'var(--teal)':'var(--red)',b:1}]
      : [{l:'Выручка',v:curS.rev,c:'var(--blue)'},{l:`— ${salesMeta.cost1Label}`,v:-active.reduce((a,s)=>a+s.rawCost,0),c:'var(--red)'},{l:`= ${salesMeta.profit1Label}`,v:curS.cm1,c:'var(--green)',b:1},{l:'± Финрез участков',v:curS.areaResult,c:curS.areaResult>=0?'var(--green)':'var(--red)'},{l:'= После участков',v:curS.opResult,c:curS.opResult>=0?'var(--teal)':'var(--red)',b:1}];
    if(holdingConfigured) rows = rows.concat([{l:`— Холдинг (${holdingCurrent.effectiveModeLabel})`,v:-curS.holdingTotal,c:'#c2410c'},{l:'= После затрат холд.',v:curS.finalResult,c:curS.finalResult>=0?'var(--teal)':'var(--red)',b:1}]);
    html+=`<div class="cd fu"><div class="cdh"><h3>Ступенчатый P&L</h3></div><div style="padding:0 20px 20px">${rows.map(r=>`<div class="wfr${r.b?' wfb':''}"><div class="wfl">${r.l}</div><div class="wfbr">${bar(r.v,cur.rev,r.c,200)}</div><div class="wfv" style="color:${r.v<0?'var(--red)':'var(--tx)'}">${fmtF(r.v)}</div></div>`).join('')}</div></div>`;
    html+=`<div class="cg fu" style="margin-top:16px">
      <div class="cc overview-card">
        <h3>Группы, которые тянут вниз</h3>
        <p>${negGroups.length ? `${negGroups.length} групп с отрицательным ${holdingConfigured?'итогом после затрат холдинга':'результатом после участков'}` : 'Отрицательных групп по текущему срезу нет'}</p>
        ${negGroups.length ? `<div class="table-shell"><table><thead><tr><th>Группа</th><th>Участок</th><th>${holdingConfigured?'После затрат холд.':'После уч.'}</th><th>${holdingConfigured?'Итог %':'После уч.%'}</th></tr></thead><tbody>${negGroups.slice(0,10).map(g=>`<tr class="neg"><td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(g.name)}">${esc(g.name)}</td><td style="color:var(--tx3);font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.areaName)}</td><td class="mn" style="color:var(--red);font-weight:600">${fmt(g[groupResultKey])}</td><td>${bdg(g[groupPctKey])}</td></tr>`).join('')}</tbody></table></div>` : `<div class="dbg">Все группы в текущем срезе остаются в плюсе.</div>`}
      </div>
      <div class="cc overview-card">
        <h3>Клиент × продукт, которые тянут вниз</h3>
        <p>${negClientProducts.length ? `${negClientProducts.length} связок с отрицательным ${holdingConfigured?'итогом после затрат холдинга':'результатом после участков'}` : 'Отрицательных связок по текущему срезу нет'}</p>
        ${negClientProducts.length ? `<div class="table-shell"><table><thead><tr><th>Клиент</th><th>Продукт</th><th>${holdingConfigured?'После затрат холд.':'После уч.'}</th><th>${holdingConfigured?'Итог %':'После уч.%'}</th></tr></thead><tbody>${negClientProducts.slice(0,12).map(c=>`<tr class="neg"><td style="font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.client)}">${esc(c.client)}</td><td style="max-width:280px;white-space:normal;line-height:1.35;overflow-wrap:anywhere" title="${esc(c.gpName)}">${esc(c.gpName)}</td><td class="mn" style="color:var(--red);font-weight:600">${fmt(c[cpResultKey])}</td><td>${bdg(c[cpPctKey])}</td></tr>`).join('')}</tbody></table></div>` : `<div class="dbg">Все связки клиент × продукт в текущем срезе остаются в плюсе.</div>`}
      </div>
    </div>`;
  }

  if(UI.tab==='charts'){
    html+=`<div class="cg fu">
      <div class="cc full"><h3>Waterfall P&L</h3><div style="height:320px"><canvas id="chWF"></canvas></div></div>
      <div class="cc"><h3>Группы: выручка vs рентабельность</h3><div style="height:300px"><canvas id="chBG"></canvas></div></div>
      <div class="cc"><h3>Клиенты: выручка vs рентабельность</h3><div style="height:300px"><canvas id="chBC"></canvas></div></div>
      <div class="cc"><h3>ABC клиентов (Парето)</h3><div style="height:300px"><canvas id="chP"></canvas></div></div>
      <div class="cc"><h3>Структура выручки</h3><div style="height:300px"><canvas id="chD"></canvas></div></div>
      <div class="cc"><h3>Участки: загрузка / фин.рез</h3><div style="height:300px"><canvas id="chAB"></canvas></div></div>
      <div class="cc"><h3>Затраты участков</h3><div style="height:300px"><canvas id="chAC"></canvas></div></div>
    </div>`;
  }

  if(UI.tab==='groups'){
    const gCols=salesMeta.hasSplitCosts
      ? [['name','Группа'],['areaName','Участок'],['cnt','Отгр.'],['rev','Выручка'],['raw','Сырьё'],['norm','Нормат.'],['trans','Трансп.'],['cm','Маржа 1'],['gDirect','Прямые уч.'],['gDistL','Логика'],['gDistNL','Без лог.'],['needNormUp','Норматив ↑'],[groupResultKey,holdingConfigured?'После затрат холд.':'После уч.'],[groupPctKey,holdingConfigured?'Итог %':'После уч.%']]
      : [['name','Группа'],['areaName','Участок'],['cnt','Строк'],['rev','Выручка'],['raw','Себест.'],['cm','Фин. доход'],['gDirect','Прямые уч.'],['gDistL','Логика'],['gDistNL','Без лог.'],['needNormUp','Норматив ↑'],[groupResultKey,holdingConfigured?'После затрат холд.':'После уч.'],[groupPctKey,holdingConfigured?'Итог %':'После уч.%']];
    const gView=UI.grpNegOnly?tabGStatsFiltered.filter(g=>g[groupResultKey]<0):tabGStatsFiltered;
    const gTotal=gView.length, gPages=Math.max(1,Math.ceil(gTotal/PAGE_SZ)), gPage=Math.min(UI.grpPage,gPages-1);
    const gSlice=gView.slice(gPage*PAGE_SZ,(gPage+1)*PAGE_SZ);
    html+=`<div class="cd fu"><div class="cdh"><h3>Товарные группы</h3><p>${gTotal} групп ${UI.grpNegOnly?`с отрицательным ${holdingConfigured?'итогом после затрат холдинга':'результатом после участков'}`:'в списке'}${disN?` · исключенные остаются зачеркнутыми`:''}</p><input class="sinp" placeholder="Фильтр вкладки: группа или участок…" id="sTabG" value="${esc(UI.tabSearchG)}" style="width:min(100%,420px);margin-bottom:8px"><button class="fbtn" id="gNegOnly" type="button">${UI.grpNegOnly?'Показать все':'Только минус'}</button></div><div class="cds"><table><thead><tr>${gCols.map(([k,l])=>`<th>${sortButton('data-gsort',k,l,UI.grpSort,UI.grpSortDir)}</th>`).join('')}</tr></thead><tbody>${gSlice.map(g=>`<tr class="${g.off?'dm ':''}${g[groupResultKey]<0?'neg':''}"><td style="font-weight:600;max-width:180px">${renderQuickEntity('group', g.id, g.name)}</td><td style="color:var(--tx3);font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.areaName)}</td><td class="mn" style="color:var(--tx3)">${g.cnt}</td><td class="mn">${fmt(g.rev)}</td><td class="mn" style="color:var(--red)">${fmt(g.raw)}</td>${salesMeta.hasSplitCosts?`<td class="mn" style="color:var(--amber)">${fmt(g.norm)}</td><td class="mn" style="color:var(--tx3)">${fmt(g.trans)}</td>`:''}<td class="mn" style="font-weight:600;color:${g.cm>=0?'var(--green)':'var(--red)'}">${fmt(g.cm)}</td><td class="mn" style="color:var(--red)">${fmt(g.gDirect)}</td><td class="mn" style="color:var(--purple)">${fmt(g.gDistL)}</td><td class="mn" style="color:var(--tx3)">${fmt(g.gDistNL)}</td><td class="mn" style="color:${g.needNormUp>0?'var(--amber)':'var(--tx3)'}">${fmt(g.needNormUp)}</td><td class="mn" style="font-weight:700;color:${g[groupResultKey]>=0?'var(--green)':'var(--red)'}">${fmt(g[groupResultKey])}${holdingConfigured?`<div style="font-size:10px;color:var(--tx3)">холд: ${fmt(g.holding)}</div>`:''}</td><td>${bdg(g[groupPctKey])}</td></tr>`).join('')}</tbody></table></div>${gPages>1?`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--brd2)"><button class="fbtn" data-gprev type="button" ${gPage<=0?'disabled':''}>← Назад</button><span class="pinfo">${gPage+1} / ${gPages}</span><button class="fbtn" data-gnext type="button" ${gPage>=gPages-1?'disabled':''}>Вперёд →</button></div>`:''}</div>`;
  }

  if(UI.tab==='clients'){
    const clCols=salesMeta.hasSplitCosts
      ? [['name','Клиент'],['groups','Групп'],['cnt','Отгр.'],['rev','Выручка'],['raw','Сырьё'],['norm','Нормат.'],['trans','Трансп.'],['cm','Маржа 1'],['margin','Рент.'],['allocDirect','Прямые уч.'],['allocDistL','С логикой'],['allocDistNL','Без лог.'],['areaResult','Финрез уч.'],['needNormUp','Норматив ↑'],['op','После уч.'],['mOp','После уч.%']]
      : [['name','Клиент'],['groups','Групп'],['cnt','Строк'],['rev','Выручка'],['raw','Себест.'],['cm','Фин. доход'],['margin','Фин. дох-ть'],['allocDirect','Прямые уч.'],['allocDistL','С логикой'],['allocDistNL','Без лог.'],['areaResult','Финрез уч.'],['needNormUp','Норматив ↑'],['op','После уч.'],['mOp','После уч.%']];
    if(holdingConfigured) { clCols.push(['finalResult','После затрат холд.'], ['mNet','Итог %']); }
    const clTotal=tabCStatsFiltered.length, clPages=Math.max(1,Math.ceil(clTotal/PAGE_SZ)), clPage=Math.min(UI.cliPage,clPages-1);
    const clSlice=tabCStatsFiltered.slice(clPage*PAGE_SZ,(clPage+1)*PAGE_SZ);
    html+=`<div class="cd fu"><div class="cdh"><h3>Клиенты</h3><p>${clTotal} клиентов${disN?` · исключенные остаются в списке`:''}</p><input class="sinp" placeholder="Фильтр вкладки: клиент…" id="sTabC" value="${esc(UI.tabSearchC)}" style="width:min(100%,420px);margin-bottom:8px"></div><div class="cds"><table><thead><tr>${clCols.map(([k,l])=>`<th>${sortButton('data-clsort',k,l,UI.cliSort,UI.cliSortDir)}</th>`).join('')}</tr></thead><tbody>${clSlice.map(c=>salesMeta.hasSplitCosts
      ? `<tr${c.off?' class="dm"':''}><td style="font-weight:600;max-width:200px">${renderQuickEntity('client', c.name, c.name)}</td><td style="color:var(--tx3);text-align:center">${c.groups}</td><td class="mn" style="color:var(--tx3)">${c.cnt}</td><td class="mn">${fmt(c.rev)}</td><td class="mn" style="color:var(--red)">${fmt(c.raw)}</td><td class="mn" style="color:var(--amber)">${fmt(c.norm)}</td><td class="mn" style="color:var(--tx3)">${fmt(c.trans)}</td><td class="mn" style="font-weight:600;color:${c.cm>=0?'var(--green)':'var(--red)'}">${fmt(c.cm)}</td><td>${bdg(c.margin)}</td><td class="mn" style="color:var(--red)">${fmt(c.allocDirect)}</td><td class="mn" style="color:var(--purple)">${fmt(c.allocDistL)}</td><td class="mn" style="color:var(--tx3)">${fmt(c.allocDistNL)}</td><td class="mn" style="font-weight:600;color:${c.areaResult>=0?'var(--green)':'var(--red)'}">${fmt(c.areaResult)}</td><td class="mn" style="color:${c.needNormUp>0?'var(--amber)':'var(--tx3)'}">${fmt(c.needNormUp)}</td><td class="mn" style="font-weight:700;color:${c.op>=0?'var(--green)':'var(--red)'}">${fmt(c.op)}</td><td>${bdg(c.mOp)}</td>${holdingConfigured?`<td class="mn" style="font-weight:700;color:${c.finalResult>=0?'var(--green)':'var(--red)'}">${fmt(c.finalResult)}<div style="font-size:10px;color:var(--tx3)">холд: ${fmt(c.holding)}</div></td><td>${bdg(c.mNet)}</td>`:''}</tr>`
      : `<tr${c.off?' class="dm"':''}><td style="font-weight:600;max-width:200px">${renderQuickEntity('client', c.name, c.name)}</td><td style="color:var(--tx3);text-align:center">${c.groups}</td><td class="mn" style="color:var(--tx3)">${c.cnt}</td><td class="mn">${fmt(c.rev)}</td><td class="mn" style="color:var(--red)">${fmt(c.raw)}</td><td class="mn" style="font-weight:600;color:${c.cm>=0?'var(--green)':'var(--red)'}">${fmt(c.cm)}</td><td>${bdg(c.margin)}</td><td class="mn" style="color:var(--red)">${fmt(c.allocDirect)}</td><td class="mn" style="color:var(--purple)">${fmt(c.allocDistL)}</td><td class="mn" style="color:var(--tx3)">${fmt(c.allocDistNL)}</td><td class="mn" style="font-weight:600;color:${c.areaResult>=0?'var(--green)':'var(--red)'}">${fmt(c.areaResult)}</td><td class="mn" style="color:${c.needNormUp>0?'var(--amber)':'var(--tx3)'}">${fmt(c.needNormUp)}</td><td class="mn" style="font-weight:700;color:${c.op>=0?'var(--green)':'var(--red)'}">${fmt(c.op)}</td><td>${bdg(c.mOp)}</td>${holdingConfigured?`<td class="mn" style="font-weight:700;color:${c.finalResult>=0?'var(--green)':'var(--red)'}">${fmt(c.finalResult)}<div style="font-size:10px;color:var(--tx3)">холд: ${fmt(c.holding)}</div></td><td>${bdg(c.mNet)}</td>`:''}</tr>`).join('')}</tbody></table></div>${clPages>1?`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--brd2)"><button class="fbtn" data-clprev type="button" ${clPage<=0?'disabled':''}>← Назад</button><span class="pinfo">${clPage+1} / ${clPages}</span><button class="fbtn" data-clnext type="button" ${clPage>=clPages-1?'disabled':''}>Вперёд →</button></div>`:''}</div>`;
  }

  if(UI.tab==='products'){
    const pCols=[['gpName','Продукция'],['group','Участок'],['rev','Выручка'],['clientCnt','Клиенты'],['sqlQty','Кг (продано)'],['qty','Кг (произв.)'],['direct','Прямые'],['distL','Распр.лог'],['marginInc','Марж.доход'],['fin','Рез. уч.'],['needNormUp','Норматив ↑'],['margin','Рент.']];
    if(holdingConfigured) pCols.push(['finalAfterHolding','После затрат холд.']);
    const pTotal=tabTpStatsFiltered.length, pPages=Math.max(1,Math.ceil(pTotal/PAGE_SZ)), pPage=Math.min(UI.prodPage,pPages-1);
    const pSlice=tabTpStatsFiltered.slice(pPage*PAGE_SZ,(pPage+1)*PAGE_SZ);
    html+=`<div class="cd fu"><div class="cdh"><h3>Продукция (Excel + продажи)</h3><p>${pTotal} позиций${disN?` · исключенные остаются зачеркнутыми`:''}</p><input class="sinp" placeholder="Фильтр вкладки: продукция, участок, ТГ, код…" id="sTP" value="${esc(UI.searchTP)}" style="width:min(100%,420px);margin-bottom:8px"></div><div class="cds"><table><thead><tr>${pCols.map(([k,l])=>`<th>${sortButton('data-psort',k,l,UI.prodSort,UI.prodSortDir)}</th>`).join('')}</tr></thead><tbody>${pSlice.map(t=>`<tr${t.off?' class="dm"':''}><td style="font-weight:500;min-width:260px;max-width:360px">${renderQuickEntity('product', t.productKey, t.gpName)}<div style="font-size:10px;color:var(--tx3)">${esc(t.matchLabel)}</div></td><td style="color:var(--tx3);font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.group||'—')}${t.salesGroup?`<div style="font-size:10px;color:var(--tx3)" title="${esc(t.salesGroup)}">${esc(t.salesGroup)}</div>`:''}</td><td class="mn">${t.rev?fmt(t.rev):'<span style="color:var(--tx3)">—</span>'}</td><td class="mn" style="color:var(--blue)" title="${esc(t.clientList)}">${t.clientCnt||'—'}</td><td class="mn">${t.sqlQty?fmt(t.sqlQty):'<span style="color:var(--tx3)">—</span>'}</td><td class="mn">${fmt(t.qty)}</td><td class="mn" style="color:var(--red)">${fmt(t.direct)}</td><td class="mn" style="color:var(--purple)">${fmt(t.distL)}</td><td class="mn" style="color:var(--green)">${fmt(t.marginInc)}</td><td class="mn" style="font-weight:600;color:${t.fin>=0?'var(--green)':'var(--red)'}">${fmt(t.fin)}</td><td class="mn" style="color:${t.needNormUp>0?'var(--amber)':'var(--tx3)'}">${fmt(t.needNormUp)}</td><td>${bdg(t.margin)}</td>${holdingConfigured?`<td class="mn" style="font-weight:700;color:${t.finalAfterHolding>=0?'var(--green)':'var(--red)'}">${fmt(t.finalAfterHolding)}<div style="font-size:10px;color:var(--tx3)">холд: ${fmt(t.holding)}</div></td>`:''}</tr>`).join('')}</tbody></table></div>${pPages>1?`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--brd2)"><button class="fbtn" data-pprev type="button" ${pPage<=0?'disabled':''}>← Назад</button><span class="pinfo">${pPage+1} / ${pPages}</span><button class="fbtn" data-pnext type="button" ${pPage>=pPages-1?'disabled':''}>Вперёд →</button></div>`:''}</div>`;
  }

  if(UI.tab==='clientprod'){
    const cCols=salesMeta.hasSplitCosts
      ? [['client','Клиент'],['gpName','Продукт'],['gpGroup','Группа'],['qty','Кг'],['revenue','Выручка'],['rawCost','Сырьё'],['normCost','Нормат.'],['transport','Трансп.'],['cm','Маржа 1'],['areaResult','Финрез уч.'],['needNormUp','Норматив ↑'],['op','После уч.'],['allocHolding','Холд.'],[cpResultKey,holdingConfigured?'После затрат холд.':'После уч.'],[cpPctKey,holdingConfigured?'Итог %':'После уч.%']]
      : [['client','Клиент'],['gpName','Продукт'],['gpGroup','Группа'],['qty','Кг'],['revenue','Выручка'],['rawCost','Себест.'],['cm','Фин. доход'],['areaResult','Финрез уч.'],['needNormUp','Норматив ↑'],['op','После уч.'],['allocHolding','Холд.'],[cpResultKey,holdingConfigured?'После затрат холд.':'После уч.'],[cpPctKey,holdingConfigured?'Итог %':'После уч.%']];
    const cpNegItems=cpStatsFiltered.filter(c=>c[cpResultKey]<0);
    const cpWorst10=cpNegItems.slice().sort((a,b)=>a[cpResultKey]-b[cpResultKey]).slice(0,10);
    const cpListNegItems=tabCpStatsFiltered.filter(c=>c[cpResultKey]<0);
    const cpNegTotal=cpListNegItems.reduce((a,c)=>a+c[cpResultKey],0);
    const cpView=UI.cpNegOnly?cpListNegItems:tabCpStatsFiltered;
    const cpTotal=cpView.length, cpPages=Math.max(1,Math.ceil(cpTotal/PAGE_SZ)), cpPage=Math.min(UI.cpPage,cpPages-1);
    const cpSlice=cpView.slice(cpPage*PAGE_SZ,(cpPage+1)*PAGE_SZ);
    html+=`<div class="cd fu" style="margin-bottom:14px"><div class="cdh"><h3>Топ-10 самых убыточных связок</h3><p>${cpNegItems.length?`Худшие клиент × продукт в текущем срезе по ${holdingConfigured?'итогу после затрат холдинга':'результату после участков'}`:`В текущем срезе нет связок с отрицательным ${holdingConfigured?'итогом после затрат холдинга':'результатом после участков'}.`}</p></div><div class="cds">${cpNegItems.length?`<table><thead><tr><th>Клиент</th><th>Продукт</th><th>Группа</th><th>Выручка</th><th>${holdingConfigured?'После затрат холд.':'После уч.'}</th><th>${holdingConfigured?'Итог %':'После уч.%'}</th></tr></thead><tbody>${cpWorst10.map(c=>`<tr class="neg"><td style="font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.client)}">${esc(c.client)}</td><td style="max-width:280px;white-space:normal;line-height:1.35;overflow-wrap:anywhere" title="${esc(c.gpName)}">${esc(c.gpName)}</td><td style="color:var(--tx3);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.gpGroup)}">${esc(c.gpGroup)}</td><td class="mn">${fmt(c.revenue)}</td><td class="mn" style="color:var(--red);font-weight:700">${fmt(c[cpResultKey])}</td><td>${bdg(c[cpPctKey])}</td></tr>`).join('')}</tbody></table>`:`<div class="dbg">Все связки клиент × продукт в текущем срезе остаются в плюсе.</div>`}</div></div>`;
    html+=`<div class="cd fu"><div class="cdh"><h3>Клиент × Продукт</h3><p>${cpTotal} комбинаций ${UI.cpNegOnly?`с отрицательным ${holdingConfigured?'итогом после затрат холдинга':'результатом после участков'}`:'в списке'}${UI.cpNegOnly?` · общий минусовой ${holdingConfigured?'итог':'результат после участков'}: <span class="mn" style="color:var(--red);font-weight:700">${fmtF(cpNegTotal)}</span>`:''} · исключенные строки остаются в списке зачеркнутыми</p>${holdingConfigured?`<div class="dbg" style="margin-bottom:10px">${salesMeta.profit1Label} + финрез участка - холдинг = после затрат холд. Холдинг распределяется только на строки с положительным ${salesMeta.profit1Label.toLowerCase()}.</div>`:`<div class="dbg" style="margin-bottom:10px">${salesMeta.profit1Label} + финрез участка = после уч.</div>`}<div class="dbg" style="margin-bottom:10px">В этой вкладке клик по названию продукта исключает именно текущую связку клиент × продукт. Для исключения клиента или продукта целиком используйте панель сценария.</div><input class="sinp" placeholder="Фильтр вкладки: клиент, продукт, группа, код…" id="sTabCP" value="${esc(UI.tabSearchCP)}" style="width:min(100%,420px);margin-bottom:8px"><button class="fbtn" id="cpNegOnly" type="button">${UI.cpNegOnly?'Показать все':'Только минус'}</button></div><div class="cds"><table><thead><tr>${cCols.map(([k,l])=>`<th>${sortButton('data-cpsort',k,l,UI.cpSort,UI.cpSortDir)}</th>`).join('')}</tr></thead><tbody>${cpSlice.map(c=>{const docHint=c.docs.length?`${c.docs.length} код(ов) заявки`:'Нет кодов заявок';const docHtml=c.docs.length?`<div style="display:flex;flex-wrap:wrap;gap:8px">${c.docs.map(d=>`<div style="padding:8px 10px;border:1px solid var(--brd);border-radius:10px;background:#fff;min-width:190px"><div style="margin-bottom:4px">${getOrderUrl(d.code)?`<a href="${getOrderUrl(d.code)}" target="_blank" rel="noopener noreferrer" style="font-weight:700;color:var(--blue);text-decoration:none" title="Открыть заявку ${esc(d.code)}">${esc(d.code)}</a>`:`<span style="font-weight:700;color:var(--tx2)">${esc(d.code)}</span>`}</div><div style="font-size:10px;color:var(--tx3);font-family:var(--mono)">${d.rows} стр. · ${fmt(d.qty)} кг · ${fmt(d.revenue)} ₽</div></div>`).join('')}</div>`:`<div class="dbg" style="margin-bottom:0">${salesMeta.mode==='sql'?'В исходном SQL-файле для этой связки не найден код заявки.':'Коды заявок доступны только из SQL-файла с сырьем.'}</div>`;const open=UI.cpOpen.has(c.rowKey);return`<tr class="${c.off?'dm ':''}cpm ${c[cpResultKey]<0?'neg':''}"><td style="font-weight:500;max-width:180px" title="${esc(c.client)}"><button type="button" class="row-exp" data-cptoggle="${esc(c.rowKey)}" aria-expanded="${open?'true':'false'}" aria-label="${open?'Свернуть коды заявок':'Развернуть коды заявок'}">${open?'▾':'▸'}</button>${renderQuickEntity('client', c.client, c.client)}</td><td style="min-width:240px;max-width:340px" title="${esc(c.gpName)}">${renderQuickEntity('clientProduct', c.rowKey, c.gpName)}</td><td style="color:var(--tx3);font-size:11px">${esc(c.gpGroup)}</td><td class="mn">${fmt(c.qty)}</td><td class="mn">${fmt(c.revenue)}</td><td class="mn" style="color:var(--red)">${fmt(c.rawCost)}</td>${salesMeta.hasSplitCosts?`<td class="mn" style="color:var(--amber)">${fmt(c.normCost)}</td><td class="mn" style="color:var(--tx3)">${fmt(c.transport)}</td>`:''}<td class="mn" style="font-weight:600;color:${c.cm>=0?'var(--green)':'var(--red)'}">${fmt(c.cm)}</td><td class="mn" style="font-weight:600;color:${c.areaResult>=0?'var(--green)':'var(--red)'}">${fmt(c.areaResult)}</td><td class="mn" style="color:${c.needNormUp>0?'var(--amber)':'var(--tx3)'}">${fmt(c.needNormUp)}</td><td class="mn" style="font-weight:600;color:${c.op>=0?'var(--green)':'var(--red)'}">${fmt(c.op)}</td><td class="mn" style="color:${c.allocHolding>0?'#c2410c':'var(--tx3)'}">${fmt(c.allocHolding)}</td><td class="mn" style="font-weight:700;color:${c[cpResultKey]>=0?'var(--green)':'var(--red)'}">${fmt(c[cpResultKey])}</td><td>${bdg(c[cpPctKey])}</td></tr><tr class="cpd${c.off?' dm':''}" data-cpdetail ${open?'':'hidden'}><td colspan="${cCols.length}" style="padding:12px 14px"><div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Коды заявок, из которых собрана строка: ${docHint}</div>${docHtml}</td></tr>`}).join('')}</tbody></table></div>${cpPages>1?`<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--brd2)"><button class="fbtn" data-cpprev type="button" ${cpPage<=0?'disabled':''}>← Назад</button><span class="pinfo">${cpPage+1} / ${cpPages}</span><button class="fbtn" data-cpnext type="button" ${cpPage>=cpPages-1?'disabled':''}>Вперёд →</button></div>`:''}</div>`;
  }

  if(UI.tab==='areas'){
    html+=`<div class="cd fu" style="margin-bottom:14px"><div class="cdh"><h3>Участки</h3><p>${tabAStats.length} карточек в списке</p><input class="sinp" placeholder="Фильтр вкладки: участок…" id="sTabA" value="${esc(UI.tabSearchA)}" style="width:min(100%,420px);margin-bottom:0"></div></div>`;
    html+=`<div class="ag fu">${tabAStats.map(a=>{const fin=a.opResult;const finalVal=holdingConfigured?a.finalAfterHolding:fin;const rows=[{l:'Марж.доход',v:a.marginInc},{l:'−Прямые',v:-a.direct},{l:'Маржа 2',v:a.cm2},{l:'−Распр.лог',v:-a.distL},{l:'Маржа 3',v:a.cm3},{l:'−Без логики',v:-a.myNL},{l:'Фин. рез.',v:fin}];if(holdingConfigured) rows.push({l:'−Холдинг',v:-a.holding},{l:'После затрат холд.',v:a.finalAfterHolding});return`<div class="ac${a.on?'':' off'}${finalVal<0&&a.on?' wb':''}"><div class="at"><div><h4>${esc(a.name)}</h4><span style="font-size:11px;color:var(--tx3);font-family:var(--mono)">${a.cnt} отгр. · ${a.months} мес</span></div></div>
    <div class="am"><span class="amt" style="background:${a.avgUtil>=80?'var(--green-bg)':a.avgUtil>=50?'var(--amber-bg)':'var(--red-bg)'};color:${utilC(a.avgUtil)}">Загр: ${a.avgUtil.toFixed(0)}%</span></div>
    <div class="gg"><div class="gf" style="width:${Math.min(a.avgUtil,100)}%;background:${utilC(a.avgUtil)}"></div></div>
    <div class="acg"><div class="aci"><div class="al">Прямые</div><div class="av" style="color:var(--red)">${fmt(a.direct)}</div></div><div class="aci"><div class="al">Распр.лог</div><div class="av" style="color:var(--purple)">${fmt(a.distL)}</div></div><div class="aci"><div class="al">Без лог.${changed&&a.on&&UI.offA.size>0?' ⚡':''}</div><div class="av" style="color:var(--tx3)">${fmt(a.myNL)}</div></div></div>
    ${rows.map(r=>`<div class="ar"><span style="font-size:11px;color:var(--tx2)">${r.l}</span><span class="mn" style="font-size:12px;font-weight:600;color:${r.v<0?'var(--red)':'var(--tx)'}">${fmtF(r.v)}</span></div>`).join('')}
    ${a.needNormUp>0&&a.on?`<div class="aw">Норматив нужно поднять на ${fmtF(a.needNormUp)}, чтобы участок вышел в ноль.</div>`:''}</div>`}).join('')}</div>`;
  }

  // Footer
  html+=`<div class="ft"><span>${D.sqlOk?'✓ Продажи ('+salesMeta.badgeLabel+', '+D.ships.length+')':'◦ Продажи не загружены'} · ${D.areaOk?'✓ Участки ('+D.tpRows.length+' ТП, '+D.areaRows.length+' агр.)':'◦ Участки не загружены'}</span><span>${holdingConfigured?`Холдинг: ${fmtF(holdingConfig.monthly)}/мес · `:''}Связь ГП→участок: ${matchCount}/${allGpIds.size}</span></div>`;

  document.getElementById('app').innerHTML = html;
  bindEvents();
  if(UI._mounted) document.body.dataset.uiMounted = '1';
  else {
    requestAnimationFrame(() => { document.body.dataset.uiMounted = '1'; });
    UI._mounted = true;
  }

  // === CHARTS ===
  if(UI.tab==='charts') {
    Chart.defaults.font.family="'IBM Plex Sans',sans-serif"; Chart.defaults.font.size=11;
    const fT=v=>fmt(v);

    // Waterfall
    const wf = buildWaterfallModel(curS, active, salesMeta);
    const wV=wf.values;
    const wL=wf.labels;
    const tot=wf.totalIdx;
    let rn=0;const wB=wV.map((v,i)=>{if(tot.has(i)){rn=v;return 0;}const b=rn;rn+=v;return Math.min(b,rn);});
    charts.wf=new Chart(document.getElementById('chWF'),{type:'bar',data:{labels:wL,datasets:[{label:'_',data:wB,backgroundColor:'transparent',borderWidth:0,barPercentage:.7},{label:'V',data:wV.map(Math.abs),backgroundColor:wV.map((v,i)=>tot.has(i)?(v>=0?'#3b82f6':'#ef4444'):(v<0?'rgba(239,68,68,.7)':'rgba(16,185,129,.7)')),borderRadius:4,borderSkipped:false,barPercentage:.7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>fmtF(wV[ctx.dataIndex])}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:fT},grid:{color:'#f3f4f6'}}}}});

    // Bubble groups
    const bg=gStats.filter(g=>!g.off&&g.rev>0).map(g=>({x:g.rev/1e6,y:(holdingConfigured?g.mNet:g.mOp)*100,r:Math.max(Math.sqrt(g.qty)/8,4),label:g.name}));
    if(bg.length) charts.bg=new Chart(document.getElementById('chBG'),{type:'bubble',data:{datasets:[{data:bg,backgroundColor:bg.map((_,i)=>COLORS[i%10]+'99'),borderColor:bg.map((_,i)=>COLORS[i%10]),borderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${bg[ctx.dataIndex].label}: ${ctx.parsed.x.toFixed(1)}М, ${ctx.parsed.y.toFixed(1)}%`}}},scales:{x:{title:{display:true,text:'Выручка, млн'},grid:{color:'#f3f4f6'}},y:{title:{display:true,text:'Рентаб. %'},grid:{color:'#f3f4f6'}}}}});

    // Bubble clients
    const bc=cStats.filter(c=>!c.off&&c.rev>0).slice(0,20).map(c=>({x:c.rev/1e6,y:(holdingConfigured?c.mNet:c.mOp)*100,r:Math.max(Math.sqrt(c.qty)/8,4),label:c.name}));
    if(bc.length) charts.bc=new Chart(document.getElementById('chBC'),{type:'bubble',data:{datasets:[{data:bc,backgroundColor:bc.map((_,i)=>COLORS[i%10]+'99'),borderColor:bc.map((_,i)=>COLORS[i%10]),borderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${bc[ctx.dataIndex].label}: ${ctx.parsed.x.toFixed(1)}М, ${ctx.parsed.y.toFixed(1)}%`}}},scales:{x:{title:{display:true,text:'Выручка, млн'},grid:{color:'#f3f4f6'}},y:{title:{display:true,text:'Рентаб. %'},grid:{color:'#f3f4f6'}}}}});

    // Pareto
    const ps=cStats.filter(c=>!c.off&&c.rev>0).sort((a,b)=>b.rev-a.rev).slice(0,20);const tR=ps.reduce((a,c)=>a+c.rev,0);let cm2=0;const cp=ps.map(c=>{cm2+=c.rev;return cm2/tR*100;});
    if(ps.length) charts.p=new Chart(document.getElementById('chP'),{type:'bar',data:{labels:ps.map(c=>c.name.length>12?c.name.slice(0,12)+'…':c.name),datasets:[{label:'Выручка',data:ps.map(c=>c.rev),backgroundColor:'#3b82f6',borderRadius:4,yAxisID:'y',order:2},{label:'Кумул. %',data:cp,type:'line',borderColor:'#ef4444',backgroundColor:'transparent',borderWidth:2,pointRadius:3,yAxisID:'y1',order:1}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false}},y:{position:'left',ticks:{callback:fT},grid:{color:'#f3f4f6'}},y1:{position:'right',min:0,max:100,ticks:{callback:v=>v+'%'},grid:{display:false}}}}});

    // Donut
    const dd=gStats.filter(g=>!g.off&&g.rev>0).slice(0,10);
    if(dd.length) charts.d=new Chart(document.getElementById('chD'),{type:'doughnut',data:{labels:dd.map(g=>g.name.length>20?g.name.slice(0,20)+'…':g.name),datasets:[{data:dd.map(g=>g.rev),backgroundColor:dd.map((_,i)=>COLORS[i%10]),borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'right',labels:{padding:6,boxWidth:10}}}}});

    // Area bars
    const aa=aStats.filter(a=>a.on);
    if(aa.length) charts.ab=new Chart(document.getElementById('chAB'),{type:'bar',data:{labels:aa.map(a=>a.name.length>16?a.name.slice(0,16)+'…':a.name),datasets:[{label:'Загрузка %',data:aa.map(a=>a.avgUtil),backgroundColor:aa.map(a=>a.avgUtil>=80?'#10b981':a.avgUtil>=50?'#f59e0b':'#ef4444'),borderRadius:4,yAxisID:'y'},{label:holdingConfigured?'После затрат холд.':'Рез. участка',data:aa.map(a=>holdingConfigured?a.finalAfterHolding:a.opResult),backgroundColor:aa.map(a=>(holdingConfigured?a.finalAfterHolding:a.opResult)>=0?'rgba(59,130,246,.6)':'rgba(239,68,68,.6)'),borderRadius:4,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{display:false}},y:{position:'left',min:0,max:120,ticks:{callback:v=>v+'%'},grid:{color:'#f3f4f6'}},y1:{position:'right',ticks:{callback:fT},grid:{display:false}}}}});

    if(aa.length) charts.ac=new Chart(document.getElementById('chAC'),{type:'bar',data:{labels:aa.map(a=>a.name.length>16?a.name.slice(0,16)+'…':a.name),datasets:[{label:'Прямые',data:aa.map(a=>a.direct),backgroundColor:'#ef4444',borderRadius:2},{label:'Распр.лог',data:aa.map(a=>a.distL),backgroundColor:'#8b5cf6',borderRadius:2},{label:'Без логики',data:aa.map(a=>a.myNL),backgroundColor:'#9ca3af',borderRadius:2},...(holdingConfigured?[{label:'Холдинг',data:aa.map(a=>a.holding),backgroundColor:'#fb923c',borderRadius:2}]:[])]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{boxWidth:10}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:fT},grid:{color:'#f3f4f6'}}}}});
  }
}
