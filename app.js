/* =========================
   PIANETA 3D LAB - app.js (FULL v6)
   - Ordini: produzione con 2 stampe (frontale/posteriore) -> assemblaggio -> spedizione -> completato
   - COMPLETATO: sparisce da operativo dopo 24h (resta nei report)
   - Report: protetto (0000), giornaliero/mensile + stampa (window.print)
   - Magazzino: codice + quantità
       * qty == 0 => rosso
       * qty > 2  => verde
       * eliminazione solo con password (0000)
   - Se articolo in magazzino (qty > 0): in Produzione appare bottone "Ritira in magazzino"
       -> scala 1 dal magazzino
       -> manda ordine direttamente in SPEDIZIONE (salta stampa/assemblaggio)
   - Memoria vendite: ultimi 365 giorni (rolling retention sui completati)
   ========================= */

const ORDERS_KEY = "p3dlab_orders_v6";
const STOCK_KEY  = "p3dlab_stock_v6";

/* ====== PASSWORD ====== */
const PASS_REPORTS = "0000";
const PASS_STOCK_DELETE = "0000";

/* ====== RETENTION / TTL ====== */
const DONE_TTL_MS = 24 * 60 * 60 * 1000;               // 24h visibilità operativo
const SALES_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;  // 365 giorni report vendite

/* ---------- UTILS ---------- */
function $(id){ return document.getElementById(id); }
function pad(n){ return String(n).padStart(2,"0"); }
function euro(n){
  const x = Number(n);
  return Number.isNaN(x) ? "0.00" : x.toFixed(2);
}
function fmtDT(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dateKey(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function monthKey(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function nowIso(){ return new Date().toISOString(); }
function nowMs(){ return Date.now(); }

/* ---------- LOAD / SAVE ---------- */
function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function saveJSON(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

/* ---------- DATA ---------- */
let orders = loadJSON(ORDERS_KEY, []);
let stock  = loadJSON(STOCK_KEY, {}); // { "PRJ-...": number }

/* ---------- FLOW ---------- */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

/* ---------- COLONNE BOARD ---------- */
const COLS = [
  { id: "PREP",        title: "🟡 Preparazione",       bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE",    title: "🔵 Stampa frontale",    bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE",  title: "🟠 Stampa posteriore",  bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO",title: "🟣 Assemblaggio",       bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE",  title: "🟤 Spedizione",         bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO",  title: "🟢 Completato (24h)",   bg: "#dfffe6", border: "#33c26b" },
];

/* ---------- HELPERS (orders) ---------- */
function saveOrders(){ saveJSON(ORDERS_KEY, orders); }
function saveStock(){ saveJSON(STOCK_KEY, stock); }

function touch(o){ o.updatedAt = nowIso(); }

function completedTsMs(o){
  const iso = o.completedAt || o.updatedAt || o.createdAt;
  return iso ? new Date(iso).getTime() : 0;
}

/* COMPLETATO visibile nell'operativo solo 24h */
function isCompletedVisibleOperational(o){
  if(o.flow !== FLOW.COMPLETATO) return true;
  return (nowMs() - completedTsMs(o)) <= DONE_TTL_MS;
}

/* retention: rimuove completati più vecchi di 365 giorni */
function pruneOldCompleted(){
  const t = nowMs();
  const before = orders.length;
  orders = orders.filter(o=>{
    if(o.flow !== FLOW.COMPLETATO) return true;
    return (t - completedTsMs(o)) <= SALES_RETENTION_MS;
  });
  if(orders.length !== before) saveOrders();
}

/* ---------- NAV / PAGES ---------- */
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

/* Reports protetti */
const REPORTS_UNLOCK_KEY = "p3dlab_reports_unlocked";

function openReports(){
  pruneOldCompleted();
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
  refreshReports();
}

function lockReports(){
  sessionStorage.removeItem(REPORTS_UNLOCK_KEY);
  alert("Report bloccati.");
  showNew();
}

/* ---------- MAGAZZINO ---------- */
function normCode(code){
  return String(code || "").trim();
}
function getStockQty(code){
  const k = normCode(code);
  return Number(stock[k] || 0);
}
function setStockQty(code, qty){
  const k = normCode(code);
  stock[k] = Math.max(0, Math.floor(Number(qty) || 0));
  saveStock();
}
function deleteStockItem(code){
  const k = normCode(code);
  delete stock[k];
  saveStock();
}

function addOrUpdateStock(){
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

  setStockQty(code, qty);

  if($("stockCode")) $("stockCode").value = "";
  if($("stockQty")) $("stockQty").value = "";

  refreshStock();
  // aggiorna anche board per mostrare/occondere "Ritira in magazzino"
  renderBoard();
}

function askDeleteStock(code){
  const pass = prompt("Password eliminazione prodotto magazzino:");
  if(pass !== PASS_STOCK_DELETE){
    alert("Password errata.");
    return;
  }
  if(!confirm(`Eliminare dal magazzino: ${code} ?`)) return;
  deleteStockItem(code);
  refreshStock();
  renderBoard();
}

function qtyClass(q){
  if(q === 0) return "qty red";
  if(q > 2) return "qty green";
  return "qty";
}

function refreshStock(){
  const tbody = $("stockTbody");
  if(!tbody) return;

  const entries = Object.keys(stock)
    .sort((a,b)=>a.localeCompare(b))
    .map(k=>({ code:k, qty:Number(stock[k]||0) }));

  tbody.innerHTML = "";

  if(entries.length === 0){
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Magazzino vuoto.</td></tr>`;
    return;
  }

  entries.forEach(item=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.code}</td>
      <td><span class="${qtyClass(item.qty)}">${item.qty}</span></td>
      <td class="no-print">
        <button class="small danger" onclick="askDeleteStock('${item.code.replace(/'/g,"\\'")}')">Elimina</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- ORDINI ---------- */
function addOrder(){
  const cliente  = $("cliente")?.value.trim();
  const sito     = $("sito")?.value.trim();
  const articolo = $("progetto")?.value.trim();
  const prezzo   = $("prezzo")?.value.trim();
  const note     = $("note")?.value.trim();

  if(!cliente || !sito || !articolo || !prezzo){
    alert("Compila Cliente, Sito vendita, Numero progetto e Prezzo.");
    return;
  }

  pruneOldCompleted();

  const now = nowIso();
  const id = `${articolo}__${Date.now()}`;

  orders.unshift({
    id,
    cliente,
    sito,
    articolo,
    prezzo: Number(prezzo),
    note,
    flow: FLOW.PREPARAZIONE,
    frontaleOK: false,
    posterioreOK: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    fromStock: false
  });

  saveOrders();

  ["cliente","sito","progetto","prezzo","note"].forEach(x=>{
    const el = $(x); if(el) el.value = "";
  });

  showPrep();
  refreshActiveTable();
}

function autoToAssemblaggio(o){
  if(o.flow === FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK){
    o.flow = FLOW.ASSEMBLAGGIO;
    touch(o);
  }
}

function setFrontaleOK(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  o.frontaleOK = true;
  touch(o);
  autoToAssemblaggio(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

function setPosterioreOK(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  o.posterioreOK = true;
  touch(o);
  autoToAssemblaggio(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
}

/* Ritira dal magazzino:
   - solo se qty > 0
   - scala 1
   - manda in SPEDIZIONE
   - segna fromStock=true
*/
function pickFromStock(orderId){
  const o = orders.find(x=>x.id===orderId);
  if(!o) return;

  const code = normCode(o.articolo);
  const q = getStockQty(code);

  if(q <= 0){
    alert("Quantità magazzino = 0. Non puoi ritirare.");
    return;
  }

  if(!confirm(`Ritira 1 pezzo dal magazzino per ${code}?`)) return;

  setStockQty(code, q - 1);

  o.fromStock = true;
  o.flow = FLOW.SPEDIZIONE;      // salta stampa/assemblaggio
  o.frontaleOK = true;
  o.posterioreOK = true;
  touch(o);

  saveOrders();
  refreshStock();
  renderBoard();
  refreshActiveTable();
}

function goPrev(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.ASSEMBLAGGIO;
  else if(o.flow === FLOW.COMPLETATO){
    o.flow = FLOW.SPEDIZIONE;
    o.completedAt = null;
  }
  else if(o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.PREPARAZIONE;

  touch(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
  refreshReports();
}

function goNext(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.SPEDIZIONE;
  else if(o.flow === FLOW.SPEDIZIONE){
    o.flow = FLOW.COMPLETATO;
    o.completedAt = nowIso();
  }

  touch(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
  refreshReports();
}

function removeOrder(id){
  if(!confirm("Eliminare questo ordine?")) return;
  orders = orders.filter(x=>x.id!==id);
  saveOrders();
  renderBoard();
  refreshActiveTable();
  refreshReports();
}

/* colonne */
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

/* ---------- RENDER BOARD ---------- */
function renderBoard(){
  pruneOldCompleted();

  const board = $("board");
  if(!board) return;

  board.innerHTML = "";

  COLS.forEach(colDef=>{
    const col = document.createElement("div");
    col.className = "col";

    const items = orders.filter(o=>inCol(o,colDef.id));

    const h2 = document.createElement("h2");
    h2.innerHTML = `<span>${colDef.title}</span><span class="count">${items.length}</span>`;
    col.appendChild(h2);

    items.forEach(o=>{
      const card = document.createElement("div");
      card.className = "card" + (o.flow === FLOW.COMPLETATO ? " done" : "");
      card.style.background = colDef.bg;
      card.style.borderColor = colDef.border;

      const completedInfo = (o.flow === FLOW.COMPLETATO)
        ? `<br><b>Completato:</b> ${fmtDT(o.completedAt)} <span class="muted">(sparisce dall’operativo dopo 24h)</span>`
        : "";

      const stockQty = getStockQty(o.articolo);
      const canPick = (o.flow === FLOW.PREPARAZIONE) && (stockQty > 0);

      card.innerHTML = `
        <div class="title">${o.articolo} — € ${euro(o.prezzo)}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Magazzino:</b> ${stockQty} pz ${o.fromStock ? `<span class="pill ok">RITIRATO</span>` : ""}<br>
          <b>Creato:</b> ${fmtDT(o.createdAt)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAt)}
          ${o.note ? `<br><b>Note:</b> ${o.note}` : ""}
          ${completedInfo}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      // Ritira in magazzino (salta stampa)
      if(canPick){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "Ritira in magazzino → Spedizione";
        b.onclick = ()=>pickFromStock(o.id);
        actions.appendChild(b);
      }

      if(colDef.id === "FRONTALE"){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Frontale ✔";
        b.onclick = ()=>setFrontaleOK(o.id);
        actions.appendChild(b);
      }
      else if(colDef.id === "POSTERIORE"){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = "OK Posteriore ✔";
        b.onclick = ()=>setPosterioreOK(o.id);
        actions.appendChild(b);
      }
      else if(colDef.id === "ASSEMBLAGGIO" || colDef.id === "SPEDIZIONE"){
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = ()=>goPrev(o.id);

        const next = document.createElement("button");
        next.className = "small ok";
        next.textContent = "Avanti →";
        next.onclick = ()=>goNext(o.id);

        actions.appendChild(prev);
        actions.appendChild(next);
      }
      else if(colDef.id === "COMPLETATO"){
        const prev = document.createElement("button");
        prev.className = "small";
        prev.textContent = "← Indietro";
        prev.onclick = ()=>goPrev(o.id);
        actions.appendChild(prev);
      }
      else if(colDef.id === "PREP"){
        const del = document.createElement("button");
        del.className = "small danger";
        del.textContent = "Elimina ordine";
        del.onclick = ()=>removeOrder(o.id);
        actions.appendChild(del);
      }

      card.appendChild(actions);
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

/* ---------- TABELLA ORDINI ATTIVI ---------- */
function refreshActiveTable(){
  pruneOldCompleted();

  const tbody = $("activeTbody");
  if(!tbody) return;

  const actives = orders.filter(o => isCompletedVisibleOperational(o));

  tbody.innerHTML = "";

  if(actives.length === 0){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nessun ordine attivo.</td></tr>`;
    return;
  }

  actives.forEach(o=>{
    const st = statusLabel(o);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.articolo}</td>
      <td>${o.cliente}</td>
      <td>${o.sito}</td>
      <td>€ ${euro(o.prezzo)}</td>
      <td><span class="${st.cls}">${st.text}</span></td>
      <td>${fmtDT(o.createdAt)}</td>
      <td>${fmtDT(o.updatedAt)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- REPORT ---------- */
function getCompleted365(){
  pruneOldCompleted();
  const t = nowMs();
  return orders
    .filter(o => o.flow === FLOW.COMPLETATO)
    .filter(o => (t - completedTsMs(o)) <= SALES_RETENTION_MS)
    .slice()
    .sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));
}

function refreshReports(){
  const wrap = $("reportsWrap");
  if(!wrap) return;

  const mode = $("reportMode")?.value || "daily";
  const completed = getCompleted365();

  if(completed.length === 0){
    wrap.innerHTML = `<div class="muted">Nessun completato negli ultimi 365 giorni.</div>`;
    return;
  }

  const map = new Map();

  completed.forEach(o=>{
    const iso = o.completedAt || o.updatedAt || o.createdAt;
    const k = (mode === "monthly") ? monthKey(iso) : dateKey(iso);
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  });

  const keys = Array.from(map.keys()).sort((a,b)=>b.localeCompare(a));
  wrap.innerHTML = "";

  keys.forEach(k=>{
    const arr = map.get(k);
    const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

    const block = document.createElement("div");
    block className = "panel";
    block.style.marginBottom = "12px";

    block.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${mode === "monthly" ? ("Mese " + k) : ("Giorno " + k)}</b>
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
            const time = (fmtDT(o.completedAt).split(" ")[1] || "-");
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

/* ---------- START ---------- */
document.addEventListener("DOMContentLoaded", () => {
  pruneOldCompleted();
  showNew();

  // refresh "soft" per:
  // - sparizione completati scaduti
  // - aggiornamento board/tabelle
  setInterval(() => {
    const pageNew = $("page-new");
    if(pageNew && !pageNew.classList.contains("hide")){
      refreshActiveTable();
    }

    const pagePrep = $("page-prep");
    if(pagePrep && !pagePrep.classList.contains("hide")){
      renderBoard();
    }

    const pageStock = $("page-stock");
    if(pageStock && !pageStock.classList.contains("hide")){
      refreshStock();
    }

    const pageReports = $("page-reports");
    if(pageReports && !pageReports.classList.contains("hide")){
      refreshReports();
    }
  }, 60000);
});
