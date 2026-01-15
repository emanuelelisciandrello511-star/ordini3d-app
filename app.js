/* =========================
   ORDINI 3D - LAB (FULL v5)
   - colori colonne
   - tabella "ordini attivi" aggiornata
   - pagina Vendite protetta (0000)
   - COMPLETATO: visibile in operativo solo 24h, poi sparisce da board+attivi
   - Vendite: memoria 365 giorni (retention)
   - Export Excel (CSV) giornaliero / mensile
   ========================= */

const LS_KEY = "ordini3d_orders_v5";

/* ====== RETENTION / TTL ====== */
const DONE_TTL_MS = 24 * 60 * 60 * 1000;        // 24 ore (sparisce dall'operativo)
const SALES_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 365 giorni vendite

/* ---------- LOAD/SAVE ---------- */
function loadOrders() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveOrders() {
  localStorage.setItem(LS_KEY, JSON.stringify(orders));
}

/* ---------- DATA ---------- */
let orders = loadOrders();

/* ---------- FLOW ---------- */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

/* ---------- COLONNE + COLORI ---------- */
const COLS = [
  { id: "PREP",        title: "🟡 Preparazione",      bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE",    title: "🔵 Stampa frontale",   bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE",  title: "🟠 Stampa posteriore", bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO",title: "🟣 Assemblaggio",      bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE",  title: "🟤 Spedizione",        bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO",  title: "🟢 Completato (24h)",  bg: "#dfffe6", border: "#33c26b" },
];

/* ---------- UTILS ---------- */
function $(id){ return document.getElementById(id); }

function pad(n){ return String(n).padStart(2,"0"); }
function fmtDT(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dateKey(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function euro(n){
  const x = Number(n);
  return Number.isNaN(x) ? "0.00" : x.toFixed(2);
}
function touch(o){
  o.updatedAt = new Date().toISOString();
}
function nowMs(){ return Date.now(); }

/* ====== REGOLE VISIBILITA / RETENTION ====== */

// COMPLETATO visibile in operativo solo 24h
function completedTsMs(o){
  const iso = o.completedAt || o.updatedAt || o.createdAt;
  return iso ? new Date(iso).getTime() : 0;
}
function isCompletedVisibleOperational(o){
  if(o.flow !== FLOW.COMPLETATO) return true;
  return (nowMs() - completedTsMs(o)) <= DONE_TTL_MS;
}

// Rimuove completati più vecchi di 365 giorni (per vendite)
function pruneOldCompleted(){
  const t = nowMs();
  const before = orders.length;
  orders = orders.filter(o => {
    if(o.flow !== FLOW.COMPLETATO) return true;
    return (t - completedTsMs(o)) <= SALES_RETENTION_MS;
  });
  if(orders.length !== before) saveOrders();
}

/* ---------- NAV / PAGES ---------- */
function hideAllPages(){
  ["page-new","page-prep","page-sales"].forEach(id=>{
    const el = $(id);
    if (el) el.classList.add("hide");
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
  render();
}

function showSales(){
  hideAllPages();
  $("page-sales")?.classList.remove("hide");
  refreshSales();
}

/* ---------- CREATE ORDER ---------- */
function addOrder(){
  const cliente  = $("cliente")?.value.trim();
  const sito     = $("sito")?.value.trim();
  const articolo = $("progetto")?.value.trim();
  const prezzo   = $("prezzo")?.value.trim();
  const note     = $("note")?.value.trim();

  // tu prima richiedevi tutti obbligatori
  if(!cliente || !sito || !articolo || !prezzo){
    alert("Compila Cliente, Sito vendita, Numero progetto e Prezzo.");
    return;
  }

  pruneOldCompleted();

  const now = new Date().toISOString();
  const id = `${articolo}__${Date.now()}`;

  orders.unshift({
    id, cliente, sito, articolo,
    prezzo: Number(prezzo),
    note,
    flow: FLOW.PREPARAZIONE,
    frontaleOK: false,
    posterioreOK: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null
  });

  saveOrders();

  ["cliente","sito","progetto","prezzo","note"].forEach(x=>{
    const el = $(x); if(el) el.value = "";
  });

  showPrep();
  refreshActiveTable();
}

/* ---------- LOGICA 2 STANZE STAMPA ---------- */
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
  render();
  refreshActiveTable();
}

function setPosterioreOK(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  o.posterioreOK = true;
  touch(o);
  autoToAssemblaggio(o);
  saveOrders();
  render();
  refreshActiveTable();
}

/* ---------- AVANZAMENTO ---------- */
function goPrev(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow === FLOW.SPEDIZIONE) o.flow = FLOW.ASSEMBLAGGIO;
  else if(o.flow === FLOW.COMPLETATO) {
    o.flow = FLOW.SPEDIZIONE;
    o.completedAt = null; // se torna indietro, non è più completato
  }
  else if(o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.PREPARAZIONE;

  touch(o);
  saveOrders();
  render();
  refreshActiveTable();
  refreshSales();
}

function goNext(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.SPEDIZIONE;
  else if(o.flow === FLOW.SPEDIZIONE){
    o.flow = FLOW.COMPLETATO;
    o.completedAt = new Date().toISOString(); // parte la regola 24h + vendite 365gg
  }

  touch(o);
  saveOrders();
  render();
  refreshActiveTable();
  refreshSales();
}

function removeOrder(id){
  if(!confirm("Eliminare questo ordine?")) return;
  orders = orders.filter(x=>x.id!==id);
  saveOrders();
  render();
  refreshActiveTable();
  refreshSales();
}

/* ---------- FILTRI COLONNE ---------- */
function inCol(o, colId){
  // NOTA: per l'operativo, i COMPLETATO oltre 24h non devono apparire da nessuna parte
  const visibleOp = isCompletedVisibleOperational(o);
  if(!visibleOp) return false;

  if(colId === "PREP") return o.flow === FLOW.PREPARAZIONE;
  if(colId === "FRONTALE") return o.flow === FLOW.PREPARAZIONE && !o.frontaleOK;
  if(colId === "POSTERIORE") return o.flow === FLOW.PREPARAZIONE && !o.posterioreOK;
  if(colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;
  if(colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
  if(colId === "COMPLETATO") return o.flow === FLOW.COMPLETATO; // già filtrato 24h sopra
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
function render(){
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

      card.innerHTML = `
        <div class="title">${o.articolo} — € ${euro(o.prezzo)}</div>
        <div class="meta">
          <b>Cliente:</b> ${o.cliente}<br>
          <b>Sito:</b> ${o.sito}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Creato:</b> ${fmtDT(o.createdAt)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAt)}
          ${o.note ? `<br><b>Note:</b> ${o.note}` : ""}
          ${completedInfo}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      // Bottoni "blindati"
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
        del.textContent = "Elimina";
        del.onclick = ()=>removeOrder(o.id);
        actions.appendChild(del);
      }

      card.appendChild(actions);
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

/* ---------- TABELLA "ORDINI ATTIVI" (NUOVO ORDINE) ---------- */
function refreshActiveTable(){
  pruneOldCompleted();

  const tbody = $("activeTbody");
  if(!tbody) return;

  // Attivi = tutti tranne completati "scaduti" (oltre 24h)
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

/* ---------- VENDITE (PASSWORD 0000) ---------- */
const SALES_UNLOCK_KEY = "ordini3d_sales_unlocked";

function openSales(){
  pruneOldCompleted();

  const unlocked = sessionStorage.getItem(SALES_UNLOCK_KEY) === "1";
  if(!unlocked){
    const pass = prompt("Password Vendite:");
    if(pass !== "0000"){
      alert("Password errata.");
      return;
    }
    sessionStorage.setItem(SALES_UNLOCK_KEY, "1");
  }
  showSales();
}

function lockSales(){
  sessionStorage.removeItem(SALES_UNLOCK_KEY);
  alert("Vendite bloccate.");
  showNew();
}

function getSalesCompleted365(){
  pruneOldCompleted();
  const t = nowMs();
  return orders
    .filter(o => o.flow === FLOW.COMPLETATO)
    .filter(o => (t - completedTsMs(o)) <= SALES_RETENTION_MS)
    .slice()
    .sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));
}

function refreshSales(){
  const wrap = $("salesWrap");
  if(!wrap) return;

  const completed = getSalesCompleted365();

  if(completed.length === 0){
    wrap.innerHTML = `<div class="muted">Nessuna vendita per ora.</div>`;
    return;
  }

  const map = new Map();
  completed.forEach(o=>{
    const k = dateKey(o.completedAt || o.updatedAt || o.createdAt);
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  });

  const days = Array.from(map.keys()).sort((a,b)=>b.localeCompare(a));
  wrap.innerHTML = "";

  days.forEach(day=>{
    const arr = map.get(day);
    const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

    const block = document.createElement("div");
    block.className = "panel";
    block.style.marginBottom = "12px";

    block.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${day}</b>
        <span class="pill ok">Totale € ${euro(total)} • Ordini ${arr.length}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Ora</th>
            <th>Articolo</th>
            <th>Cliente</th>
            <th>Sito</th>
            <th>€</th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(o=>`
            <tr>
              <td>${(fmtDT(o.completedAt).split(" ")[1] || "-")}</td>
              <td>${o.articolo}</td>
              <td>${o.cliente}</td>
              <td>${o.sito}</td>
              <td>€ ${euro(o.prezzo)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    wrap.appendChild(block);
  });
}

/* ---------- EXPORT EXCEL (CSV) ---------- */
// Ti scarica un CSV apribile in Excel

function csvCell(v){
  const s = String(v ?? "");
  if(/[",\n]/.test(s)){
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(ordersList){
  const header = ["Data","Ora","Articolo","Cliente","Sito","Prezzo_EUR","Note"];
  const lines = [header.join(",")];

  ordersList.forEach(o=>{
    const iso = o.completedAt || o.updatedAt || o.createdAt;
    const d = new Date(iso);
    const day = dateKey(iso);
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    lines.push([
      csvCell(day),
      csvCell(time),
      csvCell(o.articolo),
      csvCell(o.cliente),
      csvCell(o.sito),
      csvCell(euro(o.prezzo)),
      csvCell(o.note || "")
    ].join(","));
  });

  const total = ordersList.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);
  lines.push("");
  lines.push(`Totale,,,,,${euro(total)},`);

  return lines.join("\n");
}

// Export giorno: chiede data YYYY-MM-DD (vuoto = oggi)
function downloadSalesDaily(){
  const input = prompt("Data (YYYY-MM-DD). Vuoto = oggi:", "");
  const todayIso = new Date().toISOString();
  const todayKey = dateKey(todayIso);
  const target = (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) ? input : todayKey;

  const completed = getSalesCompleted365().filter(o => dateKey(o.completedAt || o.updatedAt || o.createdAt) === target);
  const csv = toCsv(completed);
  downloadBlob(`vendite_${target}.csv`, csv, "text/csv;charset=utf-8");
}

// Export mese: chiede YYYY-MM (vuoto = mese corrente)
function downloadSalesMonthly(){
  const input = prompt("Mese (YYYY-MM). Vuoto = mese corrente:", "");
  const d = new Date();
  const curr = `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const target = (input && /^\d{4}-\d{2}$/.test(input)) ? input : curr;

  const completed = getSalesCompleted365().filter(o => {
    const k = dateKey(o.completedAt || o.updatedAt || o.createdAt);
    return k.slice(0,7) === target;
  });

  const csv = toCsv(completed);
  downloadBlob(`vendite_${target}.csv`, csv, "text/csv;charset=utf-8");
}

/* ---------- START ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // pulizia retention 365gg all'avvio
  pruneOldCompleted();

  showNew();

  // Refresh: fa sparire i completati scaduti senza ricaricare pagina
  setInterval(() => {
    // Nuovo ordine: aggiorna tabella attivi
    const pageNew = $("page-new");
    if(pageNew && !pageNew.classList.contains("hide")){
      refreshActiveTable();
    }

    // Produzione: aggiorna board
    const pagePrep = $("page-prep");
    if(pagePrep && !pagePrep.classList.contains("hide")){
      render();
    }

    // Vendite: aggiorna se visibile
    const pageSales = $("page-sales");
    if(pageSales && !pageSales.classList.contains("hide")){
      refreshSales();
    }
  }, 60000); // ogni 60s
});
