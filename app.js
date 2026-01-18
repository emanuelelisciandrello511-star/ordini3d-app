console.log("APP.JS CARICATO ✅");

/* =========================
   PASSWORD SOLO VENDITE
========================= */
const SALES_PASS = "0000";
const SALES_UNLOCK_KEY = "p3d_sales_unlocked";

/* =========================
   STORAGE
========================= */
const LS_KEY_ORDERS = "ordini3d_orders_v4";
const LS_KEY_STOCK  = "ordini3d_stock_v1";

function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

let orders = loadJSON(LS_KEY_ORDERS, []);
let stock  = loadJSON(LS_KEY_STOCK, {});

function saveOrders(){ saveJSON(LS_KEY_ORDERS, orders); }
function saveStock(){ saveJSON(LS_KEY_STOCK, stock); }

/* =========================
   FLOW
========================= */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

const MS_24H = 24 * 60 * 60 * 1000;

/* =========================
   COLONNE
========================= */
const COLS = [
  { id:"PREP", title:"🟡 Ordini ricevuti" },
  { id:"FRONTALE", title:"🔵 Stampa frontale" },
  { id:"POSTERIORE", title:"🟠 Stampa posteriore" },
  { id:"ASSEMBLAGGIO", title:"🟣 Assemblaggio" },
  { id:"SPEDIZIONE", title:"🟤 Spedizione" },
  { id:"COMPLETATO", title:"🟢 Completato (24h)" },
];

const COL_BG = {
  PREP: "#fff7cc",
  FRONTALE: "#e8f2ff",
  POSTERIORE: "#ffe9dc",
  ASSEMBLAGGIO: "#f3e8ff",
  SPEDIZIONE: "#f1efe9",
  COMPLETATO: "#dfffe6",
};

const COL_BORDER = {
  PREP: "#f1d36a",
  FRONTALE: "#7fb0ff",
  POSTERIORE: "#ffb184",
  ASSEMBLAGGIO: "#b68cff",
  SPEDIZIONE: "#cbbfa6",
  COMPLETATO: "#33c26b",
};

/* =========================
   UTILS
========================= */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const euro = n => Number(n||0).toFixed(2);
const nowISO = () => new Date().toISOString();

function fmtDT(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function uid(){
  return `ord_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function esc(s){
  return String(s||"").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

/* =========================
   NAV
========================= */
function hideAll(){
  ["page-new","page-prep","page-sales","page-stock","page-done","page-done-simple","page-settings"]
    .forEach(id => $(id)?.classList.add("hide"));
}

function setActive(tab){
  ["new","prep","sales","stock","done","done-simple","settings"].forEach(t=>{
    $(`tab-${t}`)?.classList.toggle("active", t===tab);
  });
}

function showNew(){ hideAll(); $("page-new")?.classList.remove("hide"); setActive("new"); refreshActiveTable(); renderTempItems(); }
function showPrep(){ hideAll(); $("page-prep")?.classList.remove("hide"); setActive("prep"); renderBoard(); }
function showStock(){ hideAll(); $("page-stock")?.classList.remove("hide"); setActive("stock"); renderStock(); }
function showDone(){ hideAll(); $("page-done")?.classList.remove("hide"); setActive("done"); renderDone(); }
function showDoneSimple(){ hideAll(); $("page-done-simple")?.classList.remove("hide"); setActive("done-simple"); renderDoneSimple(); }
function showSettings(){ hideAll(); $("page-settings")?.classList.remove("hide"); setActive("settings"); }

/* =========================
   PASSWORD SOLO VENDITE
========================= */
function openSales(){
  const unlocked = sessionStorage.getItem(SALES_UNLOCK_KEY)==="1";
  if(!unlocked){
    const pass = prompt("Password Vendite:");
    if((pass||"").trim() !== SALES_PASS){
      alert("Password errata");
      return;
    }
    sessionStorage.setItem(SALES_UNLOCK_KEY,"1");
  }
  hideAll();
  $("page-sales")?.classList.remove("hide");
  setActive("sales");
  refreshSalesUI();
}

function lockSales(){
  sessionStorage.removeItem(SALES_UNLOCK_KEY);
  alert("Vendite bloccate");
  showNew();
}

/* =========================
   NUOVO ORDINE (multi)
========================= */
let tempItems = [];

function addTempItem(){
  const art = ($("progetto")?.value || "").trim();
  const pr  = Number($("prezzo")?.value);

  if(!art || !Number.isFinite(pr) || pr <= 0){
    alert("Inserisci progetto e prezzo valido");
    return;
  }

  tempItems.push({id:uid(), articolo:art, prezzo:pr});
  $("progetto").value=""; $("prezzo").value="";
  renderTempItems();
}

function renderTempItems(){
  const w = $("tempItemsWrap");
  if(!w) return;

  if(tempItems.length===0){ w.innerHTML=""; return; }

  const total = tempItems.reduce((s,i)=>s+(Number(i.prezzo)||0),0);

  w.innerHTML = `
    <div class="panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>Progetti in lista</b>
        <span class="pill">Righe: ${tempItems.length} • Totale € ${euro(total)}</span>
      </div>
      <table>
        <thead><tr><th>Articolo</th><th>€</th><th></th></tr></thead>
        <tbody>
          ${tempItems.map(i=>`
            <tr>
              <td>${esc(i.articolo)}</td>
              <td>€ ${euro(i.prezzo)}</td>
              <td><button class="small danger" onclick="removeTempItem('${i.id}')">Rimuovi</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="row" style="justify-content:flex-end;margin-top:8px">
        <button class="small danger" onclick="clearTempItems()">Svuota lista</button>
      </div>
    </div>
  `;
}

function removeTempItem(id){
  tempItems = tempItems.filter(i=>i.id!==id);
  renderTempItems();
}

function clearTempItems(){
  tempItems = [];
  renderTempItems();
}

function addOrder(){
  const cliente=($("cliente")?.value||"").trim();
  const sito=($("sito")?.value||"").trim();
  const note=($("note")?.value||"").trim();

  if(!cliente||!sito){
    alert("Cliente e sito obbligatori");
    return;
  }

  // se non hai aggiunto in lista, usa il campo singolo
  if(tempItems.length===0){
    const art = ($("progetto")?.value || "").trim();
    const pr = Number($("prezzo")?.value);
    if(art && Number.isFinite(pr) && pr > 0){
      tempItems.push({id:uid(), articolo:art, prezzo:pr});
    } else {
      alert("Aggiungi almeno un progetto (progetto + prezzo).");
      return;
    }
  }

  const t = nowISO();

  tempItems.forEach(it=>{
    orders.unshift({
      id:uid(), cliente, sito,
      articolo:it.articolo,
      prezzo:it.prezzo,
      note,
      flow:FLOW.PREPARAZIONE,
      frontaleOK:false,
      posterioreOK:false,
      createdAt:t,
      updatedAt:t,
      completedAt:null
    });
  });

  tempItems=[];
  ["cliente","sito","progetto","prezzo","note"].forEach(id=>{
    const el = $(id); if(el) el.value="";
  });

  renderTempItems();
  saveOrders();
  showPrep();
}

/* =========================
   PRODUZIONE
========================= */
function inCol(o,col){
  if(col==="PREP") return o.flow===FLOW.PREPARAZIONE;
  if(col==="FRONTALE") return o.flow===FLOW.PREPARAZIONE && !o.frontaleOK;
  if(col==="POSTERIORE") return o.flow===FLOW.PREPARAZIONE && !o.posterioreOK;
  if(col==="ASSEMBLAGGIO") return o.flow===FLOW.ASSEMBLAGGIO;
  if(col==="SPEDIZIONE") return o.flow===FLOW.SPEDIZIONE;
  if(col==="COMPLETATO"){
    if(o.flow!==FLOW.COMPLETATO) return false;
    const t = new Date(o.completedAt || o.updatedAt || o.createdAt).getTime();
    return (Date.now()-t)<=MS_24H;
  }
  return false;
}

function renderBoard(){
  const b=$("board");
  if(!b) return;
  b.innerHTML="";

  COLS.forEach(c=>{
    const col=document.createElement("div");
    col.className="col";

    const items = orders.filter(o=>inCol(o,c.id));
    col.innerHTML=`<h2><span>${c.title}</span><span class="count">${items.length}</span></h2>`;

    items.forEach(o=>{
      const card=document.createElement("div");
      card.className="card";
      card.style.background = COL_BG[c.id] || "#fff";
      card.style.borderColor = COL_BORDER[c.id] || "#e6e7ee";

      const qty = Number(stock[o.articolo] ?? 0);

      card.innerHTML=`
        <div class="title">${esc(o.articolo)} – € ${euro(o.prezzo)}</div>
        <div class="meta">
          <b>Cliente:</b> ${esc(o.cliente)}<br>
          <b>Sito:</b> ${esc(o.sito)}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Creato:</b> ${fmtDT(o.createdAt)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAt)}
          ${o.note ? `<br><b>Note:</b> ${esc(o.note)}` : ""}
          <br><b>Magazzino:</b> ${qty}
        </div>
      `;

      const a=document.createElement("div");
      a.className="actions";

      if(c.id==="PREP"){
        const btnPick = document.createElement("button");
        btnPick.className="small ok";
        btnPick.textContent = qty>0 ? "Ritira magazzino (-1)" : "Magazzino 0";
        btnPick.disabled = qty<=0;
        btnPick.onclick = ()=>ritiraDaMagazzino(o.id);

        const btnDel = document.createElement("button");
        btnDel.className="small danger";
        btnDel.textContent="Elimina";
        btnDel.onclick = ()=>removeOrder(o.id);

        a.appendChild(btnPick);
        a.appendChild(btnDel);
      }
      else if(c.id==="FRONTALE"){
        const b1=document.createElement("button");
        b1.className="small ok";
        b1.textContent="OK Frontale ✔";
        b1.onclick=()=>setFrontaleOK(o.id);
        a.appendChild(b1);
      }
      else if(c.id==="POSTERIORE"){
        const b2=document.createElement("button");
        b2.className="small ok";
        b2.textContent="OK Posteriore ✔";
        b2.onclick=()=>setPosterioreOK(o.id);
        a.appendChild(b2);
      }
      else if(["ASSEMBLAGGIO","SPEDIZIONE"].includes(c.id)){
        const prev=document.createElement("button");
        prev.className="small";
        prev.textContent="← Indietro";
        prev.onclick=()=>goPrev(o.id);

        const next=document.createElement("button");
        next.className="small ok";
        next.textContent="Avanti →";
        next.onclick=()=>goNext(o.id);

        a.appendChild(prev);
        a.appendChild(next);
      }
      else if(c.id==="COMPLETATO"){
        const prev=document.createElement("button");
        prev.className="small";
        prev.textContent="← Indietro";
        prev.onclick=()=>goPrev(o.id);
        a.appendChild(prev);
      }

      card.appendChild(a);
      col.appendChild(card);
    });

    b.appendChild(col);
  });
}

/* =========================
   MAGAZZINO
========================= */
function upsertStock(){
  const a=($("stkArticolo")?.value||"").trim();
  const q=Number($("stkQty")?.value);
  if(!a){ alert("Inserisci Numero progetto"); return; }
  if(!Number.isFinite(q) || q<0){ alert("Quantità non valida"); return; }

  stock[a]=Math.floor(q);
  saveStock();
  $("stkArticolo").value=""; $("stkQty").value="";
  renderStock();
  renderBoard();
}

function renderStock(){
  const t=$("stockTbody");
  if(!t) return;
  t.innerHTML="";
  Object.keys(stock).sort((a,b)=>a.localeCompare(b)).forEach(a=>{
    const tr=document.createElement("tr");
    if(Number(stock[a])===0) tr.className="stockZero";
    tr.innerHTML=`
      <td>${esc(a)}</td>
      <td><b>${Number(stock[a])}</b></td>
      <td></td>
    `;
    t.appendChild(tr);
  });
}

function ritiraDaMagazzino(id){
  const o=orders.find(x=>x.id===id);
  if(!o)return;

  const qty = Number(stock[o.articolo] ?? 0);
  if(qty<=0){ alert("Magazzino vuoto"); return; }

  stock[o.articolo]=qty-1;
  saveStock();

  o.flow=FLOW.SPEDIZIONE;
  o.frontaleOK=true;
  o.posterioreOK=true;
  o.updatedAt=nowISO();

  saveOrders();
  renderBoard();
  renderStock();
  refreshActiveTable();
}

/* =========================
   AVANZAMENTO + CONFERME
========================= */
function setFrontaleOK(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  o.frontaleOK = true;
  o.updatedAt = nowISO();

  alert(`✅ Frontale OK per: ${o.articolo}`);

  if(o.posterioreOK) o.flow = FLOW.ASSEMBLAGGIO;

  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function setPosterioreOK(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  o.posterioreOK = true;
  o.updatedAt = nowISO();

  alert(`✅ Posteriore OK per: ${o.articolo}`);

  if(o.frontaleOK) o.flow = FLOW.ASSEMBLAGGIO;

  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function goPrev(id){
  const o=orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow===FLOW.SPEDIZIONE) o.flow=FLOW.PREPARAZIONE;
  else if(o.flow===FLOW.ASSEMBLAGGIO) o.flow=FLOW.PREPARAZIONE;
  else if(o.flow===FLOW.COMPLETATO){ o.flow=FLOW.SPEDIZIONE; o.completedAt=null; }

  o.updatedAt = nowISO();
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function goNext(id){
  const o=orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow===FLOW.ASSEMBLAGGIO) o.flow=FLOW.SPEDIZIONE;
  else if(o.flow===FLOW.SPEDIZIONE){ o.flow=FLOW.COMPLETATO; o.completedAt=nowISO(); }

  o.updatedAt = nowISO();
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function removeOrder(id){
  if(!confirm("Eliminare questo ordine?")) return;
  orders=orders.filter(o=>o.id!==id);
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

/* =========================
   ORDINI ATTIVI
========================= */
function statusLabel(o){
  if(o.flow===FLOW.SPEDIZIONE) return "SPEDIZIONE";
  if(o.flow===FLOW.ASSEMBLAGGIO) return "ASSEMBLAGGIO";
  if(!o.frontaleOK && !o.posterioreOK) return "IN STAMPA (front+post)";
  if(o.frontaleOK && !o.posterioreOK) return "ATTESA POSTERIORE";
  if(!o.frontaleOK && o.posterioreOK) return "ATTESA FRONTALE";
  return "ORDINI RICEVUTI";
}

function refreshActiveTable(){
  const t=$("activeTbody");
  if(!t) return;
  t.innerHTML="";

  const act = orders.filter(o=>o.flow!==FLOW.COMPLETATO);
  if(act.length===0){
    t.innerHTML=`<tr><td colspan="7" class="muted">Nessun ordine attivo.</td></tr>`;
    return;
  }

  act.forEach(o=>{
    t.innerHTML+=`
      <tr>
        <td>${esc(o.articolo)}</td>
        <td>${esc(o.cliente)}</td>
        <td>${esc(o.sito)}</td>
        <td>€ ${euro(o.prezzo)}</td>
        <td>${statusLabel(o)}</td>
        <td>${fmtDT(o.createdAt)}</td>
        <td>${fmtDT(o.updatedAt)}</td>
      </tr>`;
  });
}

/* =========================
   VENDITE (calendario)
   (se non hai ancora funzioni stampa, le lasciamo stub)
========================= */
let salesMonthCursor = new Date();
let salesSelectedDayKey = null;

function dayKey(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function getCompletedAll(){
  return orders.filter(o=>o.flow===FLOW.COMPLETATO).slice()
    .sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));
}

function groupByDay(arr){
  const map = new Map();
  arr.forEach(o=>{
    const k = dayKey(o.completedAt || o.updatedAt || o.createdAt);
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  });
  return map;
}

function salesPrevMonth(){
  salesMonthCursor = new Date(salesMonthCursor.getFullYear(), salesMonthCursor.getMonth()-1, 1);
  refreshSalesUI();
}
function salesNextMonth(){
  salesMonthCursor = new Date(salesMonthCursor.getFullYear(), salesMonthCursor.getMonth()+1, 1);
  refreshSalesUI();
}

function refreshSalesUI(){
  const page = $("page-sales");
  if(!page || page.classList.contains("hide")) return;

  const monthLabel = $("salesMonthLabel");
  const cal = $("salesCal");
  const dow = $("salesDow");
  const label = $("salesSelectedLabel");
  const details = $("salesDayDetails");
  if(!monthLabel || !cal || !dow || !label || !details) return;

  const monthNames = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
  monthLabel.textContent = `${monthNames[salesMonthCursor.getMonth()]} ${salesMonthCursor.getFullYear()}`;

  dow.innerHTML = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].map(x=>`<div class="muted" style="width:40px">${x}</div>`).join("");

  const all = getCompletedAll();
  const byDay = groupByDay(all);

  const y = salesMonthCursor.getFullYear();
  const m = salesMonthCursor.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m+1, 0);

  const firstJsDow = first.getDay();
  const firstIsoDow = firstJsDow === 0 ? 7 : firstJsDow;
  const padCells = firstIsoDow - 1;

  cal.innerHTML = "";
  for(let i=0;i<padCells;i++){
    const cell = document.createElement("div");
    cell.className = "card";
    cell.style.minHeight = "60px";
    cell.style.opacity = "0.3";
    cal.appendChild(cell);
  }

  if(!salesSelectedDayKey){
    const t = new Date();
    salesSelectedDayKey = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
  }

  for(let d=1; d<=last.getDate(); d++){
    const key = `${y}-${pad(m+1)}-${pad(d)}`;
    const arr = byDay.get(key) || [];
    const total = arr.reduce((s,o)=>s+(Number(o.prezzo)||0),0);

    const cell = document.createElement("div");
    cell.className = "card";
    cell.style.minHeight = "60px";
    cell.style.cursor = "pointer";
    cell.innerHTML = `<b>${d}</b><div class="muted">${arr.length ? `${arr.length} ord.<br>€ ${euro(total)}` : ""}</div>`;
    cell.onclick = ()=>{
      salesSelectedDayKey = key;
      refreshSalesUI();
    };
    cal.appendChild(cell);
  }

  label.textContent = `Dettaglio giorno: ${salesSelectedDayKey}`;
  const dayArr = byDay.get(salesSelectedDayKey) || [];
  if(dayArr.length === 0){
    details.innerHTML = `<div class="muted">Nessuna vendita in questo giorno.</div>`;
    return;
  }
  const tot = dayArr.reduce((s,o)=>s+(Number(o.prezzo)||0),0);
  details.innerHTML = `
    <div class="muted">Ordini: ${dayArr.length} • Totale: € ${euro(tot)}</div>
    <table>
      <thead><tr><th>Ora</th><th>Articolo</th><th>Cliente</th><th>Sito</th><th>€</th></tr></thead>
      <tbody>
        ${dayArr.map(o=>{
          const time = (fmtDT(o.completedAt).split(" ")[1] || "-");
          return `<tr>
            <td>${time}</td>
            <td>${esc(o.articolo)}</td>
            <td>${esc(o.cliente)}</td>
            <td>${esc(o.sito)}</td>
            <td>€ ${euro(o.prezzo)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* stub stampa (se vuoi la stampa vera te la faccio dopo) */
function printSelectedDay(){ window.print(); }
function printCurrentMonth(){ window.print(); }
function printRange(){ window.print(); }

/* =========================
   COMPLETATI
========================= */
function renderDone(){
  const t=$("doneTbody");
  if(!t) return;
  t.innerHTML="";
  orders.filter(o=>o.flow===FLOW.COMPLETATO).forEach(o=>{
    t.innerHTML+=`
      <tr>
        <td>${fmtDT(o.completedAt)}</td>
        <td>${esc(o.articolo)}</td>
        <td>${esc(o.cliente)}</td>
        <td>${esc(o.sito)}</td>
        <td>€ ${euro(o.prezzo)}</td>
        <td><button class="small danger" onclick="deleteCompleted('${o.id}')">Elimina</button></td>
      </tr>`;
  });
}

function renderDoneSimple(){
  const t=$("doneSimpleTbody");
  if(!t) return;
  t.innerHTML="";
  orders.filter(o=>o.flow===FLOW.COMPLETATO).forEach(o=>{
    t.innerHTML+=`
      <tr>
        <td>${fmtDT(o.completedAt)}</td>
        <td>${esc(o.articolo)}</td>
        <td>€ ${euro(o.prezzo)}</td>
      </tr>`;
  });
}

function deleteCompleted(id){
  if(!confirm("Eliminare questo completato dalla memoria?")) return;
  orders = orders.filter(o=>o.id!==id);
  saveOrders();
  renderDone();
  renderDoneSimple();
  refreshSalesUI();
}

function clearCompleted(){
  if(!confirm("Cancellare TUTTI gli ordini completati?")) return;
  orders = orders.filter(o=>o.flow!==FLOW.COMPLETATO);
  saveOrders();
  renderDone();
  renderDoneSimple();
  refreshSalesUI();
  renderBoard();
  refreshActiveTable();
}

function clearAllData(){
  if(!confirm("RESET TOTALE?")) return;
  orders=[]; stock={}; tempItems=[];
  saveOrders(); saveStock();
  showNew();
}

/* =========================
   START
========================= */
document.addEventListener("DOMContentLoaded", ()=>{
  showNew();
});

/* =========================
   EXPORT
========================= */
Object.assign(window,{
  showNew,showPrep,openSales,lockSales,showStock,showDone,showDoneSimple,showSettings,
  addTempItem,removeTempItem,clearTempItems,addOrder,
  upsertStock,ritiraDaMagazzino,
  setFrontaleOK,setPosterioreOK,goPrev,goNext,removeOrder,
  refreshActiveTable, salesPrevMonth, salesNextMonth, printSelectedDay, printCurrentMonth, printRange
});
