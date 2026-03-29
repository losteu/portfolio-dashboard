"use strict";

/* ═══ EVENTS ═══ */
function bindEvents() {
  document.getElementById('fSQL')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadSales(f)});
  document.getElementById('fArea')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadAreas(f)});
  document.getElementById('salesMode')?.addEventListener('change',e=>{UI.salesInputMode=e.target.value;render()});
  document.getElementById('dFrom')?.addEventListener('change',e=>{UI.dateFrom=e.target.value;render()});
  document.getElementById('dTo')?.addEventListener('change',e=>{UI.dateTo=e.target.value;render()});
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{UI.tab=b.dataset.tab;UI.quickMenu=null;render()}));
  document.getElementById('toggleSc')?.addEventListener('click',()=>{UI.scOpen=!UI.scOpen;render()});
  document.querySelectorAll('[data-tA]').forEach(b=>b.addEventListener('click',()=>{tog(UI.offA,b.dataset.ta);render()}));
  document.querySelectorAll('[data-tG]').forEach(b=>b.addEventListener('click',()=>{tog(UI.offG,b.dataset.tg);render()}));
  document.querySelectorAll('[data-tC]').forEach(b=>b.addEventListener('click',()=>{tog(UI.offC,b.dataset.tc);render()}));
  document.querySelectorAll('[data-tP]').forEach(b=>b.addEventListener('click',()=>{tog(UI.offP,b.dataset.tp);render()}));
  bindDebouncedInput('sG', value=>{UI.searchG=value;});
  bindDebouncedInput('sC', value=>{UI.searchC=value;});
  bindDebouncedInput('sP', value=>{UI.searchP=value;});
  bindDebouncedInput('sTP', value=>{UI.searchTP=value;UI.prodPage=0;});
  bindDebouncedInput('holdingMonthly', value=>{UI.holdingMonthlyInput=value;}, 160);
  document.getElementById('holdingAllocMode')?.addEventListener('change',e=>{UI.holdingAllocMode=e.target.value;render()});
  document.getElementById('clearHolding')?.addEventListener('click',()=>{UI.holdingMonthlyInput='';UI.holdingAllocMode='revenue';render()});
  document.getElementById('enG')?.addEventListener('click',()=>{UI.offG=new Set();render()});
  document.getElementById('enC')?.addEventListener('click',()=>{UI.offC=new Set();render()});
  document.getElementById('enP')?.addEventListener('click',()=>{UI.offP=new Set();render()});
  document.getElementById('resetAll')?.addEventListener('click',()=>{UI.offA=new Set();UI.offG=new Set();UI.offC=new Set();UI.offP=new Set();UI.selA='';UI.selG='';UI.selC=new Set();UI._selCSearch='';UI._selCExpand=false;UI.searchG='';UI.searchC='';UI.searchP='';UI.searchTP='';UI.grpNegOnly=false;UI.cpNegOnly=false;UI.cpOpen=new Set();UI.holdingMonthlyInput='';UI.holdingAllocMode='revenue';UI.quickMenu=null;render()});
  // Selection filters
  document.getElementById('selA')?.addEventListener('change',e=>{UI.selA=e.target.value;render()});
  document.getElementById('selG')?.addEventListener('change',e=>{UI.selG=e.target.value;render()});
  bindDebouncedInput('sSelC', value=>{UI._selCSearch=value;});
  document.getElementById('selCBtn')?.addEventListener('click',()=>{if(UI.selC.size){UI.selC=new Set();UI._selCSearch='';UI._selCExpand=false;} else UI._selCExpand=!UI._selCExpand; render()});
  document.querySelectorAll('[data-selC]').forEach(b=>b.addEventListener('click',()=>{const c=b.dataset.selc;if(UI.selC.has(c))UI.selC.delete(c);else UI.selC.add(c);render();}));
  document.querySelectorAll('[data-qtoggle]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const {qkind,qkey,qlabel,qexcluded}=b.dataset; if(qexcluded==='1'){const set=getScenarioSet(qkind); if(!set) return; tog(set,qkey); UI.quickMenu=null; UI._exclOpen=true; render(); toast(`Возвращено: ${qlabel||qkey}`, 'ok'); return;} if(UI.quickMenu && UI.quickMenu.kind===qkind && UI.quickMenu.key===qkey) UI.quickMenu=null; else UI.quickMenu={kind:qkind,key:qkey,label:qlabel||''}; render();}));
  document.querySelectorAll('[data-qact]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const {qkind,qkey,qlabel}=b.dataset; const set=getScenarioSet(qkind); if(!set) return; const wasIncluded=!set.has(qkey); tog(set,qkey); UI.quickMenu=null; UI._exclOpen=true; render(); toast(`${wasIncluded?'Исключено':'Возвращено'}: ${qlabel||qkey}`, wasIncluded?'info':'ok');}));
  // Track exclusion details open state
  document.querySelectorAll('.scp details').forEach(d=>{d.addEventListener('toggle',()=>{const s=d.querySelector('summary')?.textContent||'';if(s.includes('Исключение')) UI._exclOpen=d.open;})});
  // Groups sort + pagination
  document.getElementById('gNegOnly')?.addEventListener('click',()=>{UI.grpNegOnly=!UI.grpNegOnly; UI.grpPage=0; render()});
  document.querySelectorAll('[data-gsort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.gsort; if(UI.grpSort===k) UI.grpSortDir*=-1; else{UI.grpSort=k;UI.grpSortDir=1;} UI.grpPage=0; render();}));
  document.querySelector('[data-gprev]')?.addEventListener('click',()=>{UI.grpPage=Math.max(0,UI.grpPage-1);render()});
  document.querySelector('[data-gnext]')?.addEventListener('click',()=>{UI.grpPage++;render()});
  // Clients sort + pagination
  document.querySelectorAll('[data-clsort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.clsort; if(UI.cliSort===k) UI.cliSortDir*=-1; else{UI.cliSort=k;UI.cliSortDir=1;} UI.cliPage=0; render();}));
  document.querySelector('[data-clprev]')?.addEventListener('click',()=>{UI.cliPage=Math.max(0,UI.cliPage-1);render()});
  document.querySelector('[data-clnext]')?.addEventListener('click',()=>{UI.cliPage++;render()});
  // Product sort + pagination
  document.querySelectorAll('[data-psort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.psort; if(UI.prodSort===k) UI.prodSortDir*=-1; else{UI.prodSort=k;UI.prodSortDir=1;} UI.prodPage=0; render();}));
  document.querySelector('[data-pprev]')?.addEventListener('click',()=>{UI.prodPage=Math.max(0,UI.prodPage-1);render()});
  document.querySelector('[data-pnext]')?.addEventListener('click',()=>{UI.prodPage++;render()});
  // ClientProd sort + pagination
  document.getElementById('cpNegOnly')?.addEventListener('click',()=>{UI.cpNegOnly=!UI.cpNegOnly; UI.cpPage=0; render()});
  document.querySelectorAll('[data-cpsort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.cpsort; if(UI.cpSort===k) UI.cpSortDir*=-1; else{UI.cpSort=k;UI.cpSortDir=1;} UI.cpPage=0; render();}));
  document.querySelector('[data-cpprev]')?.addEventListener('click',()=>{UI.cpPage=Math.max(0,UI.cpPage-1);render()});
  document.querySelector('[data-cpnext]')?.addEventListener('click',()=>{UI.cpPage++;render()});
  document.querySelectorAll('[data-cptoggle]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const key=btn.dataset.cptoggle; if(UI.cpOpen.has(key))UI.cpOpen.delete(key); else UI.cpOpen.add(key); render();}));
}

/* ═══ INIT ═══ */
autoLoad();
