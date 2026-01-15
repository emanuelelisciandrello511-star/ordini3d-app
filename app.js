/* =========================
   PIANETA 3D LAB - app.js (BACK4APP / PARSE) FULL
   - Online multi-device (Parse DB)
   - Sync auto (polling) + LiveQuery opzionale
   - Board completo: PREP + FRONTALE + POSTERIORE + ASSEMBLAGGIO + SPEDIZIONE + COMPLETATO(24h)
   - Regola: in ASSEMBLAGGIO solo con frontaleOK + posterioreOK
   - Bottone: "Ritira in magazzino" (se qty>0) => scala 1 => va in SPEDIZIONE
   - MAGAZZINO: qty=0 riga intera rossa; qty>2 numero verde; delete con password
   - REPORT protetti (0000): daily / monthly / pickday / pickmonth + stampa
   - COMPLETATO sparisce dall'operativo dopo 24h, resta in report fino a 365gg
   - Inserimento veloce: TAB, ENTER salva, ArrowUp/Down cambia campo (tranne prezzo)
   ========================= */

/* ========= PARSE INIT ========= */
Parse.initialize(
  "INSERISCI_APP_ID",   // Application ID (Back4App)
  "INSERISCI_JS_KEY"    // JavaScript Key (Back4App)
);
Parse.serverURL = "https://parseapi.back4app.com/";

/* ========= LIVEQUERY (OPZIONALE) =========
   Se lo conosci, mettilo qui (es: wss://YOUR-APP.b4a.io)
   Se resta vuoto, usa polling ogni 5s (quasi realtime).
*/
const LIVEQUERY_WSS_URL = ""; // <-- opzionale

/* ========= PASSWORD ========= */
const PASS_REPORTS = "0000";
const PASS_STOCK_DELETE = "0000";

/* ========= TTL / RETENTION ========= */
const DONE_TTL_MS = 24 * 60 * 60 * 1000;               // COMPLETATO visibile operativo 24h
const SALES_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;  // REPORT ultimi 365 giorni

/* ========= SYNC ========= */
const POLL_MS = 5000; // sync automatico tra device (se LiveQuery non disponibile)

/* ========= FLOW ========= */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

/* ========= BOARD COLS ========= */
const COLS = [
  { id: "PREP",         title: "🟡 Preparazione",        bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE",     title: "🔵 Stampa frontale",     bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE",   title: "🟠 Stampa posteriore",   bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio",        bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE",   title: "🟤 Spedizione",          bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO",   title: "🟢 Completato (24h)",    bg: "#dfffe6", border: "#33c26b" },
];

/* ========= STATE ========= */
let orders = [];     // array oggetti "puliti" (JSON)
let stock = {};      // { code: qty }
let quickEntryBound = false;
let reportsUnlocked = false;
let lastSyncAt = 0;

/* ========= UTILS ========= */
function $(id){ return document.getElementById(id); }
function pad(n){ return String(n).padStart(2, "0"); }
function euro(n){
  const x = Number(n);
  return Number.isNaN(x) ? "0.00" : x.toFixed(2);
}
function nowIso(){ return new Date().toISOString(); }
function nowMs(){ return Date.now(); }

function fmtDT(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dateKey(iso){
  if(!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function monthKey(iso){
  if(!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}

function normCode(s){ return String(s || "").trim(); }

function completedTsMs(o){
  const iso = o.completedAtISO || o.updatedAtISO || o.createdAtISO;
  return iso ? new Date(iso).getTime() : 0;
}

function isCompletedVisibleOperational(o){
  if(o.flow !== FLOW.COMPLETATO) return true;
  return (nowMs() - completedTsMs(o)) <= DONE_TTL_MS;
}

function qtyClass(q){
  if(q === 0) return "qty red";
  if(q > 2) return "qty green";
  return "qty";
}

/* ========= PARSE MAPPING =========
   Classi DB:
   - Orders: orderId(string), cliente, sito, articolo, prezzo(number), note,
             flow, frontaleOK(bool), posterioreOK(bool), fromStock(bool),
             createdAtISO, updatedAtISO, completedAtISO
   - Stock:  code(string), qty(number)
*/
function parseOrderToPlain(po){
  const j = po.toJSON();
  // objectId sempre presente
  return {
    objectId: j.objectId,
    orderId: j.orderId || j.objectId,
    cliente: j.cliente || "",
    sito: j.sito || "",
    articolo: j.articolo || "",
    prezzo: Number(j.prezzo || 0),
    note: j.note || "",
    flow: j.flow || FLOW.PREPARAZIONE,
    frontaleOK: !!j.frontaleOK,
    posterioreOK: !!j.posterioreOK,
    fromStock: !!j.fromStock,
    createdAtISO: j.createdAtISO || j.createdAt || nowIso(),
    updatedAtISO: j.updatedAtISO || j.updatedAt || nowIso(),
    completedAtISO: j.completedAtISO || null,
  };
}

async function fetchOrdersFromDB(){
  const q = new Parse.Query("Orders");
  q.descending("createdAt");
  q.limit(1000);
  const res = await q.find();
  orders = res.map(parseOrderToPlain);
}

async function fetchStockFromDB(){
  const q = new Parse.Query("Stock");
  q.limit(2000);
  const res = await q.find();
  const obj = {};
  res.forEach(s=>{
    const code = s.get("code");
    const qty = Number(s.get("qty") || 0);
    obj[code] = qty;
  });
  stock = obj;
}

/* ========= PRUNE (solo lato UI / report) =========
   Non cancelliamo dal DB automaticamente (per sicurezza).
   Applichiamo filtro “ultimi 365 giorni” nei report.
*/
function getCompleted365(){
  const t = nowMs();
  return orders
    .filter(o => o.flow === FLOW.COMPLETATO)
    .filter(o => (t - completedTsMs(o)) <= SALES_RETENTION_MS)
    .slice()
    .sort((a,b)=>(b.completedAtISO||"").localeCompare(a.completedAtISO||""));
}

/* ========= NAV / PAGES ========= */
function hideAllPages(){
  ["page-new","page-prep","page-stock","page-reports"].forEach(id=>{
    const el = $(id);
    if(el) el.classList.add("hide");
  });
}

function showNew(){
  hideAllPages();
  $("page-new")?.classList.remove("hide");
  refreshActiveTable();
  setupQuickOrderEntry();
}

function showPrep(){
  hideAllPages();
  $("page-prep")?.classList.remove("hide");
  renderBoard();
}

function showStock(){
  hideAllPages();
  $("page-stock")?.classList.remove("hide");
  refreshStock();
}

const REPORTS_UNLOCK_KEY = "p3dlab_reports_unlocked_session";

function openReports(){
  const unlocked = sessionStorage.getItem(REPORTS_UNLOCK_KEY) === "1";
  if(!unlocked){
    const pass = prompt("Password Report:");
    if(pass !== PASS_REPORTS){
      alert("Password errata.");
      return;
    }
    sessionStorage.setItem(REPORTS_UNLOCK_KEY, "1");
  }
  hideAllPages();
  $("page-reports")?.classList.remove("hide");
  if(typeof window.syncReportFilters === "function") window.syncReportFilters();
  refreshReports();
}

function lockReports(){
  sessionStorage.removeItem(REPORTS_UNLOCK_KEY);
  alert("Report bloccati.");
  showNew();
}

/* ========= ORDERS: CREATE ========= */
async function addOrder(){
  const cliente  = $("cliente")?.value.trim();
  const sito     = $("sito")?.value.trim();
  const articolo = $("progetto")?.value.trim();
  const prezzoV  = $("prezzo")?.value.trim();
  const note     = $("note")?.value.trim();

  if(!cliente || !sito || !articolo || !prezzoV){
    alert("Compila Cliente, Sito vendita, Codice prodotto e Prezzo.");
    return;
  }

  const prezzo = Number(prezzoV);
  if(Number.isNaN(prezzo) || prezzo <= 0){
    alert("Prezzo non valido.");
    return;
  }

  const now = nowIso();
  const orderId = `${articolo}__${Date.now()}`;

  const o = new Parse.Object("Orders");
  o.set("orderId", orderId);
  o.set("cliente", cliente);
  o.set("sito", sito);
  o.set("articolo", articolo);
  o.set("prezzo", prezzo);
  o.set("note", note || "");
  o.set("flow", FLOW.PREPARAZIONE);
  o.set("frontaleOK", false);
  o.set("posterioreOK", false);
  o.set("fromStock", false);
  o.set("createdAtISO", now);
  o.set("updatedAtISO", now);
  o.set("completedAtISO", null);

  await o.save();

  ["cliente","sito","progetto","prezzo","note"].forEach(x=>{
    const el = $(x); if(el) el.value = "";
  });

  // aggiorna stato locale e UI
  await syncNow();
  showNew();
}

/* ========= ORDERS: UPDATE HELPERS ========= */
async function getOrderByObjectId(objectId){
  const q = new Parse.Query("Orders");
  return await q.get(objectId);
}

async function updateOrderFields(objectId, fields){
  const po = await getOrderByObjectId(objectId);
  Object.entries(fields).forEach(([k,v])=>po.set(k,v));
  po.set("updatedAtISO", nowIso());
  await po.save();
}

function autoToAssemblaggioLocal(o){
  if(o.flow === FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK){
    o.flow = FLOW.ASSEMBLAGGIO;
    o.updatedAtISO = nowIso();
  }
}

/* ========= STAMPE OK ========= */
async function setFrontaleOK(objectId){
  const o = orders.find(x=>x.objectId===objectId);
  if(!o) return;

  // update local
  o.frontaleOK = true;
  o.updatedAtISO = nowIso();
  autoToAssemblaggioLocal(o);

  // update DB
  const fields = { frontaleOK: true };
  // se entra in assemblaggio, salva anche flow
  if(o.flow === FLOW.ASSEMBLAGGIO) fields.flow = FLOW.ASSEMBLAGGIO;

  await updateOrderFields(objectId, fields);
  await syncNow();
  renderBoard();
  refreshActiveTable();
}

async function setPosterioreOK(objectId){
  const o = orders.find(x=>x.objectId===objectId);
  if(!o) return;

  o.posterioreOK = true;
  o.updatedAtISO = nowIso();
  autoToAssemblaggioLocal(o);

  const fields = { posterioreOK: true };
  if(o.flow === FLOW.ASSEMBLAGGIO) fields.flow = FLOW.ASSEMBLAGGIO;

  await updateOrderFields(objectId, fields);
  await syncNow();
  renderBoard();
  refreshActiveTable();
}

/* ========= AVANTI / INDIETRO ========= */
async function goPrev(objectId){
  const o = orders.find(x=>x.objectId===objectId);
  if(!o) return;

  let newFlow = o.flow;
  let completedAtISO = o.completedAtISO;

  if(o.flow === FLOW.SPEDIZIONE) newFlow = FLOW.ASSEMBLAGGIO;
  else if(o.flow === FLOW.COMPLETATO){ newFlow = FLOW.SPEDIZIONE; completedAtISO = null; }
  else if(o.flow === FLOW.ASSEMBLAGGIO) newFlow = FLOW.PREPARAZIONE;

  await updateOrderFields(objectId, { flow: newFlow, completedAtISO });
  await syncNow();
  renderBoard();
  refreshActiveTable();
  refreshReports();
}

async function goNext(objectId){
  const o = orders.find(x=>x.objectId===objectId);
  if(!o) return;

  let newFlow = o.flow;
  let completedAtISO = o.completedAtISO;

  if(o.flow === FLOW.ASSEMBLAGGIO) newFlow = FLOW.SPEDIZIONE;
  else if(o.flow === FLOW.SPEDIZIONE){
    newFlow = FLOW.COMPLETATO;
    completedAtISO = nowIso();
  }

  await updateOrderFields(objectId, { flow: newFlow, completedAtISO });
  await syncNow();
  renderBoard();
  refreshActiveTable();
  refreshReports();
}

async function removeOrder(objectId){
  if(!confirm("Eliminare questo ordine?")) return;
  const po = await getOrderByObjectId(objectId);
  await po.destroy();
  await syncNow();
  renderBoard();
  refreshActiveTable();
  refreshReports();
}

/* ========= MAGAZZINO ========= */
async function upsertStock(code, qty){
  const c = normCode(code);
  const q = Math.max(0, Math.floor(Number(qty)||0));

  const query = new Parse.Query("Stock");
  query.equalTo("code", c);
  let s = await query.first();

  if(!s){
    s = new Parse.Object("Stock");
    s.set("code", c);
  }
  s.set("qty", q);
  await s.save();
}

async function addOrUpdateStock(){
  const code = normCode($("stockCode")?.value);
  const qty = Number($("stockQty")?.value);

  if(!code){
    alert("Inserisci il Codice prodotto.");
    return;
  }
  if(Number.isNaN(qty) || qty < 0){
    alert("Quantità non valida.");
    return;
  }

  await upsertStock(code, qty);

  if($("stockCode")) $("stockCode").value = "";
  if($("stockQty")) $("stockQty").value = "";

  await syncNow();
  refreshStock();
  renderBoard();
}

async function askDeleteStock(code){
  const pass = prompt("Password eliminazione prodotto magazzino:");
  if(pass !== PASS_STOCK_DELETE){
    alert("Password errata.");
    return;
  }
  if(!confirm(`Eliminare dal magazzino: ${code} ?`)) return;

  const query = new Parse.Query("Stock");
  query.equalTo("code", code);
  const s = await query.first();
  if(s) await s.destroy();

  await syncNow();
  refreshStock();
  renderBoard();
}

function getStockQty(code){
  const k = normCode(code);
  return Number(stock[k] || 0);
}

/* Ritira -> scala 1 -> spedizione */
async function pickFromStock(objectId){
  const o = orders.find(x=>x.objectId===objectId);
  if(!o) return;

  const code = normCode(o.articolo);

  // leggo stock da DB (per evitare conflitti)
  const query = new Parse.Query("Stock");
  query.equalTo("code", code);
  let s = await query.first();

  const current = s ? Number(s.get("qty")||0) : 0;
  if(current <= 0){
    alert("Quantità magazzino = 0. Non puoi ritirare.");
    return;
  }
  if(!confirm(`Ritira 1 pezzo dal magazzino per ${code}?`)) return;

  // decrement
  if(!s){
    // in teoria non ci arrivi perché current=0, ma sicurezza
    s = new Parse.Object("Stock");
    s.set("code", code);
    s.set("qty", 0);
  } else {
    s.set("qty", current - 1);
  }
  await s.save();

  // aggiorno ordine: va in spedizione, salta tutto
  await updateOrderFields(objectId, {
    fromStock: true,
    flow: FLOW.SPEDIZIONE,
    frontaleOK: true,
    posterioreOK: true
  });

  await syncNow();
  refreshStock();
  renderBoard();
  refreshActiveTable();
}

/* ========= FILTER COLS ========= */
function inCol(o, colId){
  if(!isCompletedVisibleOperational(o)) return false;

  if(colId === "PREP") return o.flow === FLOW.PREPARAZIONE;
  if(colId === "FRONTALE") return o.flow === FLOW.PREPARAZIONE && !o.frontaleOK;
  if(colId === "POSTERIORE") return o.flow === FLOW.PREPARAZIONE && !o.posterioreOK;
  if(colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;
  if(colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
  if(colId === "COMPLETATO") return o.flow === FLOW.COMPLETATO;
  return false;
}

function statusLabel(o){
  if(o.flow === FLOW.COMPLETATO) return {text:"COMPLETATO", cls:"pill ok"};
  if(o.flow === FLOW.SPEDIZIONE) return {text:"SPEDIZIONE", cls:"pill info"};
  if(o.flow === FLOW.ASSEMBLAGGIO) return {text:"ASSEMBLAGGIO", cls:"pill info"};

  if(!o.frontaleOK && !o.posterioreOK) return {text:"IN STAMPA (front+post)", cls:"pill warn"};
  if(o.frontaleOK && !o.posterioreOK) return {text:"ATTESA POSTERIORE", cls:"pill warn"};
  if(!o.frontaleOK && o.posterioreOK) return {text:"ATTESA FRONTALE", cls:"pill warn"};
  return {text:"PREPARAZIONE", cls:"pill warn"};
}

/* ========= RENDER BOARD ========= */
function renderBoard(){
  const board = $("board");
  if(!board) return;

  // se nel tuo index "sano" board è semplice, qui disegniamo colonne stile kanban
  board.innerHTML = "";

  // se vuoi il layout a colonne come prima, creiamo la griglia qui
  // (il CSS del tuo index “sano” non ha .board/.col/.card, ma funziona lo stesso)
  // Se vuoi estetica identica, reinserisci CSS del board nel tuo index.
  const wrap = document.createElement("div");
  wrap.className = "board";
  wrap.id = "board-inner";
  board.appendChild(wrap);

  COLS.forEach(colDef=>{
    const col = document.createElement("div");
    col.className = "col";

    const items = orders.filter(o=>inCol(o,colDef.id));

    const h2 = document.createElement("h2");
    h2.innerHTML = `<span>${colDef.title}</span><span class="count">${items.length}</span>`;
    col.appendChild(h2);

    items.forEach(o=>{
      const card = document.createElement("div");
      card.className = "card";
      card.style.background = colDef.bg;
      card.style.borderColor = colDef.border;

      const stockQty = getStockQty(o.articolo);
      const canPick = (o.flow === FLOW.PREPARAZIONE) && (stockQty > 0);

      const completedInfo = (o.flow === FLOW.COMPLETATO)
        ? `<br><b>Completato:</b> ${fmtDT(o.completedAtISO)} <span class="muted">(sparisce dopo 24h)</span>`
        : "";

      card.innerHTML = `
        <div class="title">${o.articolo} — € ${euro(o.prezzo)}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Magazzino:</b> ${stockQty} pz ${o.fromStock ? `<span class="pill ok">RITIRATO</span>` : ""}<br>
          <b>Creato:</b> ${fmtDT(o.createdAtISO)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAtISO)}
          ${o.note ? `<br><b>Note:</b> ${o.note}` : ""}
          ${completedInfo}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      if(canPick){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "Ritira in magazzino → Spedizione";
        b.onclick = ()=>pickFromStock(o.objectId);
        actions.appendChild(b);
      }

      if(colDef.id === "FRONTALE"){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Frontale ✔";
        b.onclick = ()=>setFrontaleOK(o.objectId);
        actions.appendChild(b);
      }
      else if(colDef.id === "POSTERIORE"){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Posteriore ✔";
        b.onclick = ()=>setPosterioreOK(o.objectId);
        actions.appendChild(b);
      }
      else if(colDef.id === "ASSEMBLAGGIO" || colDef.id === "SPEDIZIONE"){
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = ()=>goPrev(o.objectId);

        const next = document.createElement("button");
        next.className = "small ok";
        next.textContent = "Avanti →";
        next.onclick = ()=>goNext(o.objectId);

        actions.appendChild(prev);
        actions.appendChild(next);
      }
      else if(colDef.id === "COMPLETATO"){
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = ()=>goPrev(o.objectId);
        actions.appendChild(prev);
      }
      else if(colDef.id === "PREP"){
        const del = document.createElement("button");
        del.className = "small danger";
        del.textContent = "Elimina ordine";
        del.onclick = ()=>removeOrder(o.objectId);
        actions.appendChild(del);
      }

      card.appendChild(actions);
      col.appendChild(card);
    });

    wrap.appendChild(col);
  });
}

/* ========= ACTIVE TABLE ========= */
function refreshActiveTable(){
  const tbody = $("activeTbody");
  if(!tbody) return;

  const actives = orders.filter(o=>isCompletedVisibleOperational(o));
  tbody.innerHTML = "";

  if(actives.length === 0){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nessun ordine attivo.</td></tr>`;
    return;
  }

  // Nel tuo index “sano” la tabella ha 5 colonne
  actives
    .filter(o => o.flow !== FLOW.COMPLETATO)
    .forEach(o=>{
      const st = statusLabel(o);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${o.articolo}</td>
        <td>${o.cliente}</td>
        <td>${o.sito}</td>
        <td>${euro(o.prezzo)}</td>
        <td>${st.text}</td>
      `;
      tbody.appendChild(tr);
    });
}

/* ========= STOCK TABLE ========= */
function refreshStock(){
  const tbody = $("stockTbody");
  if(!tbody) return;

  const entries = Object.keys(stock)
    .sort((a,b)=>a.localeCompare(b))
    .map(code=>({ code, qty:Number(stock[code]||0) }));

  tbody.innerHTML = "";

  if(entries.length === 0){
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Magazzino vuoto.</td></tr>`;
    return;
  }

  entries.forEach(item=>{
    const safeCode = item.code.replace(/'/g,"\\'");
    const tr = document.createElement("tr");

    if(item.qty === 0) tr.classList.add("row-red");

    tr.innerHTML = `
      <td>${item.code}</td>
      <td><span class="${qtyClass(item.qty)}">${item.qty}</span></td>
      <td class="no-print">
        <button class="small danger" onclick="askDeleteStock('${safeCode}')">Elimina</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ========= REPORTS ========= */
function refreshReports(){
  const wrap = $("reportsWrap");
  if(!wrap) return;

  const mode = $("reportMode")?.value || "daily";
  const pickedDay = $("reportDay")?.value || "";
  const pickedMonth = $("reportMonth")?.value || "";

  const completed = getCompleted365();
  if(completed.length === 0){
    wrap.innerHTML = `<div class="muted">Nessun completato negli ultimi 365 giorni.</div>`;
    return;
  }

  let list = completed;

  if(mode === "pickday"){
    if(!pickedDay){
      wrap.innerHTML = `<div class="muted">Seleziona un giorno e premi Aggiorna.</div>`;
      return;
    }
    list = list.filter(o => dateKey(o.completedAtISO || o.updatedAtISO || o.createdAtISO) === pickedDay);
  }

  if(mode === "pickmonth"){
    if(!pickedMonth){
      wrap.innerHTML = `<div class="muted">Seleziona un mese e premi Aggiorna.</div>`;
      return;
    }
    list = list.filter(o => monthKey(o.completedAtISO || o.updatedAtISO || o.createdAtISO) === pickedMonth);
  }

  if(list.length === 0){
    wrap.innerHTML = `<div class="muted">Nessun incasso trovato per il filtro selezionato.</div>`;
    return;
  }

  // raggruppo
  const map = new Map();
  list.forEach(o=>{
    const iso = o.completedAtISO || o.updatedAtISO || o.createdAtISO;
    const k = (mode === "monthly") ? monthKey(iso)
            : (mode === "pickmonth") ? monthKey(iso)
            : dateKey(iso);

    if(!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  });

  const keys = Array.from(map.keys()).sort((a,b)=>b.localeCompare(a));
  wrap.innerHTML = "";

  keys.forEach(k=>{
    const arr = map.get(k);
    const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

    const block = document.createElement("div");
    block.className = "panel";
    block.style.marginBottom = "12px";

    const title =
      (mode === "monthly" || mode === "pickmonth") ? ("Mese " + k) : ("Giorno " + k);

    block.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${title}</b>
        <span class="pill ok">Totale € ${euro(total)} • Ordini ${arr.length}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Ora</th>
            <th>Codice prodotto</th>
            <th>€</th>
            <th>Da magazzino</th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(o=>{
            const time = (fmtDT(o.completedAtISO).split(" ")[1] || "-");
            return `
              <tr>
                <td>${time}</td>
                <td>${o.articolo}</td>
                <td>€ ${euro(o.prezzo)}</td>
                <td>${o.fromStock ? "SI" : "NO"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
    wrap.appendChild(block);
  });
}

/* ========= QUICK ENTRY (TASTIERA) ========= */
function setupQuickOrderEntry(){
  const cliente = $("cliente");
  const sito = $("sito");
  const progetto = $("progetto");
  const prezzo = $("prezzo");
  const note = $("note");

  const fields = [cliente, sito, progetto, prezzo, note].filter(Boolean);
  if(fields.length === 0) return;

  if(quickEntryBound){
    cliente?.focus();
    return;
  }
  quickEntryBound = true;

  function focusIndex(i){
    const el = fields[i];
    if(!el) return;
    el.focus();
    if(el.tagName === "INPUT") el.select?.();
  }

  fields.forEach((el, idx)=>{
    el.addEventListener("keydown", (e)=>{
      const isTextarea = el.tagName === "TEXTAREA";

      // ENTER salva (tranne note)
      if(e.key === "Enter" && !isTextarea){
        e.preventDefault();
        addOrder();
        return;
      }

      // ArrowDown/Up cambiano campo (tranne prezzo)
      if(e.key === "ArrowDown"){
        if(el.id === "prezzo") return;
        e.preventDefault();
        focusIndex(Math.min(idx+1, fields.length-1));
        return;
      }
      if(e.key === "ArrowUp"){
        if(el.id === "prezzo") return;
        e.preventDefault();
        focusIndex(Math.max(idx-1, 0));
        return;
      }
    });
  });

  focusIndex(0);
}

/* ========= SYNC ========= */
async function syncNow(){
  await Promise.all([fetchOrdersFromDB(), fetchStockFromDB()]);
  lastSyncAt = nowMs();
}

async function safeRefreshUI(){
  // aggiorno solo ciò che serve in base alla pagina visibile
  if($("page-new") && !$("page-new").classList.contains("hide")) refreshActiveTable();
  if($("page-prep") && !$("page-prep").classList.contains("hide")) renderBoard();
  if($("page-stock") && !$("page-stock").classList.contains("hide")) refreshStock();
  if($("page-reports") && !$("page-reports").classList.contains("hide")) refreshReports();
}

/* ========= LIVEQUERY (SE DISPONIBILE) ========= */
let liveQueryClient = null;
let liveEnabled = false;

async function enableLiveQueryIfPossible(){
  if(!LIVEQUERY_WSS_URL) return;

  try{
    liveQueryClient = new Parse.LiveQueryClient({
      applicationId: Parse.applicationId,
      serverURL: LIVEQUERY_WSS_URL,
      javascriptKey: Parse.javaScriptKey,
      masterKey: undefined
    });

    liveQueryClient.open();

    // Orders subscription
    const qOrders = new Parse.Query("Orders");
    const subOrders = await liveQueryClient.subscribe(qOrders);

    subOrders.on("create", async ()=>{ await syncNow(); await safeRefreshUI(); });
    subOrders.on("update", async ()=>{ await syncNow(); await safeRefreshUI(); });
    subOrders.on("delete", async ()=>{ await syncNow(); await safeRefreshUI(); });

    // Stock subscription
    const qStock = new Parse.Query("Stock");
    const subStock = await liveQueryClient.subscribe(qStock);

    subStock.on("create", async ()=>{ await syncNow(); await safeRefreshUI(); });
    subStock.on("update", async ()=>{ await syncNow(); await safeRefreshUI(); });
    subStock.on("delete", async ()=>{ await syncNow(); await safeRefreshUI(); });

    liveEnabled = true;
  }catch(e){
    console.warn("LiveQuery non disponibile, uso polling.", e);
    liveEnabled = false;
  }
}

/* ========= POLLING FALLBACK ========= */
function startPolling(){
  setInterval(async ()=>{
    // se live funziona, non serve polling
    if(liveEnabled) return;

    try{
      await syncNow();
      await safeRefreshUI();
    }catch(e){
      console.warn("Polling sync error:", e);
    }
  }, POLL_MS);
}

/* ========= START ========= */
document.addEventListener("DOMContentLoaded", async ()=>{
  // Primo sync
  await syncNow();

  // Prova LiveQuery (se hai inserito LIVEQUERY_WSS_URL), altrimenti polling
  await enableLiveQueryIfPossible();
  startPolling();

  // Pagina iniziale
  showNew();
});
