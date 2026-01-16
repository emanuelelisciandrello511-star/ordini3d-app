/* =========================
   ORDINI 3D - LAB (FULL)
   - Multi-progetto (Nuovo ordine): lista progetti + invio crea più ordini
   - Inserimento veloce (frecce) gestito in index.html
   - Produzione:
     🟡 Ordini ricevuti: Elimina + Ritira dal magazzino (-1) -> va in Spedizione
     🔵 Frontale: OK Frontale
     🟠 Posteriore: OK Posteriore
     🟣 Assemblaggio / 🟤 Spedizione: avanti/indietro
     🟢 Completato: visibile SOLO 24h nella board (per non confondere)
   - Vendite:
     Calendario ultimi 365 giorni + click giorno = dettaglio
     Stampa report: giorno / mese / intervallo
     (Excel rimosso: usiamo solo print)
   - Magazzino:
     Articolo + Quantità, riga rossa se qty=0
   ========================= */

const LS_KEY_ORDERS = "ordini3d_orders_v4";
const LS_KEY_STOCK  = "ordini3d_stock_v1";
const SALES_UNLOCK_KEY = "ordini3d_sales_unlocked";

const MS_24H  = 24 * 60 * 60 * 1000;
const MS_365D = 365 * 24 * 60 * 60 * 1000;

const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

const COLS = [
  { id: "PREP",         title: "🟡 Ordini ricevuti",    bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE",     title: "🔵 Stampa frontale",    bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE",   title: "🟠 Stampa posteriore",  bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio",       bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE",   title: "🟤 Spedizione",         bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO",   title: "🟢 Completato (24h)",   bg: "#dfffe6", border: "#33c26b" },
];

/* ---------- UTILS ---------- */
function $(id){ return document.getElementById(id); }

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
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
function dateKeyFromISO(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function keyToDate(key){
  // key = YYYY-MM-DD
  return new Date(key + "T00:00:00");
}
function uid(prefix="id"){
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function touch(o){ o.updatedAt = new Date().toISOString(); }

/* ---------- LOAD/SAVE ORDERS ---------- */
function loadOrders(){
  try { return JSON.parse(localStorage.getItem(LS_KEY_ORDERS) || "[]"); }
  catch { return []; }
}
let orders = loadOrders();
function saveOrders(){
  localStorage.setItem(LS_KEY_ORDERS, JSON.stringify(orders));
}

/* ---------- LOAD/SAVE STOCK ---------- */
function loadStock(){
  try { return JSON.parse(localStorage.getItem(LS_KEY_STOCK) || "{}"); }
  catch { return {}; }
}
let stock = loadStock();
function saveStock(){
  localStorage.setItem(LS_KEY_STOCK, JSON.stringify(stock));
}

/* ---------- NORMALIZE (per ordini vecchi) ---------- */
(function normalize(){
  let changed = false;

  orders = (orders || []).map(o=>{
    if(!o || typeof o !== "object"){ changed = true; return null; }

    if(o.articolo == null && o.progetto != null){ o.articolo = o.progetto; changed = true; }
    if(o.sito == null && o.site != null){ o.sito = o.site; changed = true; }

    if(o.prezzo != null && typeof o.prezzo === "string"){
      const p = Number(o.prezzo.replace(",", "."));
      if(Number.isFinite(p)){ o.prezzo = p; changed = true; }
    }

    if(!o.createdAt){ o.createdAt = new Date().toISOString(); changed = true; }
    if(!o.updatedAt){ o.updatedAt = o.createdAt; changed = true; }
    if(!o.flow){ o.flow = FLOW.PREPARAZIONE; changed = true; }

    if(typeof o.frontaleOK !== "boolean"){ o.frontaleOK = false; changed = true; }
    if(typeof o.posterioreOK !== "boolean"){ o.posterioreOK = false; changed = true; }

    if(o.flow === FLOW.COMPLETATO && !o.completedAt){
      o.completedAt = o.updatedAt || o.createdAt;
      changed = true;
    }

    return o;
  }).filter(Boolean);

  if(changed) saveOrders();
})();

/* ---------- AUTO MOVE ---------- */
function autoToAssemblaggio(o){
  if(o.flow === FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK){
    o.flow = FLOW.ASSEMBLAGGIO;
    touch(o);
  }
}

/* ---------- NAV / PAGES ---------- */
function setActive(which){
  $("tab-new")?.classList.toggle("active", which==="new");
  $("tab-prep")?.classList.toggle("active", which==="prep");
  $("tab-sales")?.classList.toggle("active", which==="sales");
  $("tab-stock")?.classList.toggle("active", which==="stock");
}

function hideAllPages(){
  ["page-new","page-prep","page-sales","page-stock"].forEach(id=>{
    const el = $(id);
    if(el) el.classList.add("hide");
  });
}

function showNew(){
  hideAllPages();
  $("page-new")?.classList.remove("hide");
  setActive("new");
  refreshActiveTable();
  renderTempItems();
}

function showPrep(){
  hideAllPages();
  $("page-prep")?.classList.remove("hide");
  setActive("prep");
  renderBoard();
}

function showStock(){
  hideAllPages();
  $("page-stock")?.classList.remove("hide");
  setActive("stock");
  renderStock();
}

function showSales(){
  hideAllPages();
  $("page-sales")?.classList.remove("hide");
  setActive("sales");
  refreshSalesUI();
}

/* ---------- VENDITE (PASSWORD 0000) ---------- */
function openSales(){
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

/* =========================================================
   MULTI-PROGETTO (Nuovo ordine)
   ========================================================= */
let tempItems = []; // non salvata

function addTempItem(){
  const articolo = $("progetto")?.value.trim();
  const prezzoRaw = $("prezzo")?.value.trim();

  if(!articolo || !prezzoRaw){
    alert("Compila Numero progetto e Prezzo, poi premi + Aggiungi progetto.");
    return;
  }
  const prezzo = Number(prezzoRaw);
  if(!Number.isFinite(prezzo)){
    alert("Prezzo non valido.");
    return;
  }

  tempItems.push({ id: uid("tmp"), articolo, prezzo });

  $("progetto").value = "";
  $("prezzo").value = "";

  renderTempItems();
}

function removeTempItem(id){
  tempItems = tempItems.filter(x=>x.id !== id);
  renderTempItems();
}

function clearTempItems(){
  tempItems = [];
  renderTempItems();
}

function renderTempItems(){
  const wrap = $("tempItemsWrap");
  if(!wrap) return;

  if(tempItems.length === 0){
    wrap.innerHTML = `<div class="muted">Nessun progetto aggiunto in lista (puoi inviare anche solo quello nei campi sopra).</div>`;
    return;
  }

  const total = tempItems.reduce((s,x)=>s + (Number(x.prezzo)||0), 0);

  wrap.innerHTML = `
    <div class="panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>Progetti in lista</b>
        <span class="pill info">Righe: ${tempItems.length} • Totale € ${euro(total)}</span>
      </div>
      <table>
        <thead><tr><th>Articolo</th><th>€</th><th></th></tr></thead>
        <tbody>
          ${tempItems.map(it=>`
            <tr>
              <td>${esc(it.articolo)}</td>
              <td>€ ${euro(it.prezzo)}</td>
              <td><button class="small danger" onclick="removeTempItem('${it.id}')">Rimuovi</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="row" style="margin-top:8px;justify-content:flex-end">
        <button class="small danger" onclick="clearTempItems()">Svuota lista</button>
      </div>
    </div>
  `;
}

function addOrder(){
  const cliente  = $("cliente")?.value.trim();
  const sito     = $("sito")?.value.trim();
  const articolo = $("progetto")?.value.trim();
  const prezzoRaw= $("prezzo")?.value.trim();
  const note     = $("note")?.value.trim();

  if(!cliente || !sito){
    alert("Compila Cliente e Sito vendita.");
    return;
  }

  const finalItems = tempItems.slice();

  // Permetti invio anche se non hai cliccato +Aggiungi progetto
  if(articolo || prezzoRaw){
    if(!articolo || !prezzoRaw){
      alert("Hai compilato solo in parte Progetto/Prezzo. Completa entrambi oppure svuota i campi.");
      return;
    }
    const prezzo = Number(prezzoRaw);
    if(!Number.isFinite(prezzo)){
      alert("Prezzo non valido.");
      return;
    }
    finalItems.push({ id: uid("tmp"), articolo, prezzo });
  }

  if(finalItems.length === 0){
    alert("Inserisci almeno un progetto.");
    return;
  }

  const now = new Date().toISOString();

  finalItems.forEach(it=>{
    orders.unshift({
      id: uid("ord"),
      cliente, sito,
      articolo: it.articolo,
      prezzo: Number(it.prezzo),
      note,
      flow: FLOW.PREPARAZIONE,
      frontaleOK: false,
      posterioreOK: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null
    });
  });

  saveOrders();

  ["cliente","sito","progetto","prezzo","note"].forEach(x=>{
    const el = $(x); if(el) el.value = "";
  });
  tempItems = [];
  renderTempItems();

  showPrep();
  refreshActiveTable();
  refreshSalesUI();
}

/* =========================================================
   MAGAZZINO
   ========================================================= */
function upsertStock(){
  const art = $("stkArticolo")?.value.trim();
  const qtyRaw = $("stkQty")?.value.trim();

  if(!art){
    alert("Inserisci Numero progetto.");
    return;
  }
  const qty = Number(qtyRaw);
  if(!Number.isFinite(qty) || qty < 0){
    alert("Quantità non valida (>= 0).");
    return;
  }

  stock[art] = Math.floor(qty);
  saveStock();

  $("stkArticolo").value = "";
  $("stkQty").value = "";

  renderStock();
  renderBoard();
}

function deleteStock(art){
  if(!confirm("Eliminare questo articolo dal magazzino?")) return;
  delete stock[art];
  saveStock();
  renderStock();
  renderBoard();
}

function renderStock(){
  const tbody = $("stockTbody");
  if(!tbody) return;

  const keys = Object.keys(stock).sort((a,b)=>a.localeCompare(b));
  tbody.innerHTML = "";

  if(keys.length === 0){
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Nessun articolo in magazzino.</td></tr>`;
    return;
  }

  keys.forEach(k=>{
    const qty = Number(stock[k] ?? 0);
    const tr = document.createElement("tr");
    if(qty === 0) tr.classList.add("stockZero");

    tr.innerHTML = `
      <td>${esc(k)}</td>
      <td><b>${qty}</b></td>
      <td><button class="small danger" onclick="deleteStock('${esc(k).replaceAll("&#039;","\\'")}')">Elimina</button></td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================================================
   PRODUZIONE: RITIRO MAGAZZINO + OK front/post
   ========================================================= */
function setFrontaleOK(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  o.frontaleOK = true;
  touch(o);
  autoToAssemblaggio(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
  refreshSalesUI();
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
  refreshSalesUI();
}

function ritiraDaMagazzino(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  const art = String(o.articolo || "").trim();
  const qty = Number(stock[art] ?? 0);

  if(qty <= 0){
    alert("Magazzino: giacenza ZERO per questo progetto.");
    return;
  }

  stock[art] = qty - 1;
  saveStock();

  // va direttamente in SPEDIZIONE, e segniamo stampe ok (non si stampa)
  o.flow = FLOW.SPEDIZIONE;
  o.frontaleOK = true;
  o.posterioreOK = true;
  touch(o);

  saveOrders();

  renderBoard();
  renderStock();
  refreshActiveTable();
  refreshSalesUI();
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
  refreshSalesUI();
}

function goNext(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;

  if(o.flow === FLOW.ASSEMBLAGGIO) o.flow = FLOW.SPEDIZIONE;
  else if(o.flow === FLOW.SPEDIZIONE){
    o.flow = FLOW.COMPLETATO;
    o.completedAt = new Date().toISOString();
  }

  touch(o);
  saveOrders();
  renderBoard();
  refreshActiveTable();
  refreshSalesUI();
}

function removeOrder(id){
  if(!confirm("Eliminare questo ordine?")) return;
  orders = orders.filter(x=>x.id!==id);
  saveOrders();
  renderBoard();
  refreshActiveTable();
  refreshSalesUI();
}

function inCol(o, colId){
  // Completato: solo 24h in board
  if(colId === "COMPLETATO"){
    if(o.flow !== FLOW.COMPLETATO) return false;
    const t = new Date(o.completedAt || o.updatedAt || o.createdAt).getTime();
    return (Date.now() - t) <= MS_24H;
  }

  if(colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
  if(colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;

  if(o.flow !== FLOW.PREPARAZIONE) return false;

  if(colId === "PREP") return (!o.frontaleOK || !o.posterioreOK);
  if(colId === "FRONTALE") return !o.frontaleOK;
  if(colId === "POSTERIORE") return !o.posterioreOK;

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

function renderBoard(){
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

      const art = String(o.articolo || "").trim();
      const qty = Number(stock[art] ?? 0);

      card.innerHTML = `
        <div class="title">${esc(o.articolo ?? "-")} — € ${euro(o.prezzo ?? 0)}</div>
        <div class="meta">
          <b>Cliente:</b> ${esc(o.cliente ?? "-")}<br>
          <b>Sito:</b> ${esc(o.sito ?? "-")}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Creato:</b> ${fmtDT(o.createdAt)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAt)}
          ${o.flow === FLOW.COMPLETATO ? `<br><b>Completato:</b> ${fmtDT(o.completedAt)}` : ""}
          ${o.note ? `<br><b>Note:</b> ${esc(o.note)}` : ""}
          ${art ? `<br><b>Magazzino:</b> ${qty}` : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      if(colDef.id === "PREP"){
        const b = document.createElement("button");
        b.className = "small ok";
        b.textContent = qty > 0 ? `Ritira dal magazzino (-1)` : `Magazzino 0`;
        b.disabled = qty <= 0;
        b.onclick = ()=>ritiraDaMagazzino(o.id);

        const del = document.createElement("button");
        del.className = "small danger";
        del.textContent = "Elimina";
        del.onclick = ()=>removeOrder(o.id);

        actions.appendChild(b);
        actions.appendChild(del);
      }
      else if(colDef.id === "FRONTALE"){
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

      card.appendChild(actions);
      col.appendChild(card);
    });

    board.appendChild(col);
  });
}

/* =========================================================
   ORDINI ATTIVI (tabella Nuovo ordine)
   ========================================================= */
function refreshActiveTable(){
  const tbody = $("activeTbody");
  if(!tbody) return;

  const actives = orders.filter(o=>o.flow !== FLOW.COMPLETATO);
  tbody.innerHTML = "";

  if(actives.length === 0){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Nessun ordine attivo.</td></tr>`;
    return;
  }

  actives.forEach(o=>{
    const st = statusLabel(o);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(o.articolo ?? "-")}</td>
      <td>${esc(o.cliente ?? "-")}</td>
      <td>${esc(o.sito ?? "-")}</td>
      <td>€ ${euro(o.prezzo ?? 0)}</td>
      <td><span class="${st.cls}">${st.text}</span></td>
      <td>${fmtDT(o.createdAt)}</td>
      <td>${fmtDT(o.updatedAt)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* =========================================================
   VENDITE (Calendario 365gg + Stampa)
   ========================================================= */
let salesMonthCursor = new Date(); // punta al mese corrente
let salesSelectedDayKey = null;    // YYYY-MM-DD

function getCompletedOrdersAll(){
  // Non filtriamo 24h: qui serve storico completo
  return orders
    .filter(o=>o.flow === FLOW.COMPLETATO)
    .slice()
    .sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));
}

function groupSalesByDayKey(arr){
  const map = new Map();
  arr.forEach(o=>{
    const k = dateKeyFromISO(o.completedAt || o.updatedAt || o.createdAt);
    if(!map.has(k)) map.set(k, []);
    map.get(k).push(o);
  });
  return map;
}

function salesPrevMonth(){
  salesMonthCursor = new Date(salesMonthCursor.getFullYear(), salesMonthCursor.getMonth()-1, 1);
  renderSalesCalendar();
}
function salesNextMonth(){
  salesMonthCursor = new Date(salesMonthCursor.getFullYear(), salesMonthCursor.getMonth()+1, 1);
  renderSalesCalendar();
}

function refreshSalesUI(){
  const page = $("page-sales");
  if(!page || page.classList.contains("hide")) return;
  renderSalesCalendar();
  renderSalesDayDetails();
}

function renderSalesCalendar(){
  const monthLabel = $("salesMonthLabel");
  const cal = $("salesCal");
  const dow = $("salesDow");
  if(!cal || !dow || !monthLabel) return;

  const monthNames = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  monthLabel.textContent = `${monthNames[salesMonthCursor.getMonth()]} ${salesMonthCursor.getFullYear()}`;

  dow.innerHTML = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"]
    .map(x=>`<div class="calDow">${x}</div>`).join("");

  const all = getCompletedOrdersAll();
  const byDay = groupSalesByDayKey(all);

  const start = new Date(salesMonthCursor.getFullYear(), salesMonthCursor.getMonth(), 1);
  const end = new Date(salesMonthCursor.getFullYear(), salesMonthCursor.getMonth()+1, 0); // ultimo giorno mese

  // Limite 365 giorni: dal (oggi-365) a oggi
  const minDate = new Date(Date.now() - MS_365D);
  const maxDate = new Date();

  // ISO weekday: lun=1..dom=7. JS: dom=0..sab=6
  const firstJsDow = start.getDay(); // 0 dom ... 6 sab
  const firstIsoDow = firstJsDow === 0 ? 7 : firstJsDow; // 1..7
  const padCells = firstIsoDow - 1; // celle vuote prima del 1 del mese

  cal.innerHTML = "";

  // celle padding
  for(let i=0;i<padCells;i++){
    const c = document.createElement("div");
    c.className = "dayCell dayOff";
    c.innerHTML = `<div class="dayNum"></div>`;
    cal.appendChild(c);
  }

  // giorni del mese
  for(let d=1; d<=end.getDate(); d++){
    const cur = new Date(start.getFullYear(), start.getMonth(), d);
    const key = `${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(d)}`;

    const inWindow = (cur >= new Date(minDate.getFullYear(),minDate.getMonth(),minDate.getDate()))
                  && (cur <= new Date(maxDate.getFullYear(),maxDate.getMonth(),maxDate.getDate()));

    const dayOrders = byDay.get(key) || [];
    const count = dayOrders.length;
    const total = dayOrders.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

    const cell = document.createElement("div");
    cell.className = "dayCell" + (salesSelectedDayKey===key ? " daySelected" : "") + (!inWindow ? " dayOff" : "");
    cell.innerHTML = `
      <div class="dayNum">${d}</div>
      <div class="dayMeta">
        ${count ? `<b>${count}</b> ordini` : `&nbsp;`}
        ${count ? `<br>€ ${euro(total)}` : ``}
      </div>
    `;

    if(inWindow){
      cell.onclick = ()=>{ salesSelectedDayKey = key; renderSalesCalendar(); renderSalesDayDetails(); };
    }

    cal.appendChild(cell);
  }

  // se non selezionato, seleziona oggi (se nel mese) o primo giorno mese
  if(!salesSelectedDayKey){
    const today = new Date();
    const tKey = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    salesSelectedDayKey = tKey;
  }

  $("salesSelectedLabel").textContent = `Dettaglio giorno: ${salesSelectedDayKey}`;
}

function renderSalesDayDetails(){
  const wrap = $("salesDayDetails");
  const label = $("salesSelectedLabel");
  if(!wrap || !label) return;

  const all = getCompletedOrdersAll();
  const byDay = groupSalesByDayKey(all);

  const key = salesSelectedDayKey;
  label.textContent = `Dettaglio giorno: ${key}`;

  const arr = byDay.get(key) || [];
  if(arr.length === 0){
    wrap.innerHTML = `<div class="muted">Nessuna vendita in questo giorno.</div>`;
    return;
  }

  const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

  wrap.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <span class="pill ok">Ordini: ${arr.length}</span>
      <span class="pill ok">Totale: € ${euro(total)}</span>
    </div>

    <table>
      <thead><tr><th>Ora</th><th>Articolo</th><th>Cliente</th><th>Sito</th><th>€</th></tr></thead>
      <tbody>
        ${arr.map(o=>{
          const time = (fmtDT(o.completedAt).split(" ")[1] || "-");
          return `
            <tr>
              <td>${time}</td>
              <td>${esc(o.articolo ?? "-")}</td>
              <td>${esc(o.cliente ?? "-")}</td>
              <td>${esc(o.sito ?? "-")}</td>
              <td>€ ${euro(o.prezzo ?? 0)}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* --- Stampa report --- */
function printHTML(title, inner){
  const w = window.open("", "_blank");
  if(!w){
    alert("Popup bloccato: consenti popup per stampare.");
    return;
  }
  w.document.open();
  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px;color:#111}
  h1{font-size:18px;margin:0 0 10px 0}
  .muted{color:#666;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{font-size:12px;text-align:left;padding:8px;border-bottom:1px solid #eee}
  .pill{display:inline-block;font-size:11px;padding:3px 8px;border-radius:999px;border:1px solid #ddd}
</style>
</head><body>
${inner}
<script>window.onload=()=>window.print();</script>
</body></html>`);
  w.document.close();
}

function printSelectedDay(){
  const key = salesSelectedDayKey;
  const all = getCompletedOrdersAll();
  const byDay = groupSalesByDayKey(all);
  const arr = byDay.get(key) || [];
  const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

  const html = `
    <h1>Report vendite - Giorno ${esc(key)}</h1>
    <div class="muted">Ordini: ${arr.length} • Totale: € ${euro(total)}</div>
    <table>
      <thead><tr><th>Ora</th><th>Articolo</th><th>Cliente</th><th>Sito</th><th>€</th></tr></thead>
      <tbody>
        ${arr.map(o=>{
          const time = (fmtDT(o.completedAt).split(" ")[1] || "-");
          return `<tr>
            <td>${time}</td>
            <td>${esc(o.articolo ?? "-")}</td>
            <td>${esc(o.cliente ?? "-")}</td>
            <td>${esc(o.sito ?? "-")}</td>
            <td>€ ${euro(o.prezzo ?? 0)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  printHTML(`Report giorno ${key}`, html);
}

function printCurrentMonth(){
  const y = salesMonthCursor.getFullYear();
  const m = salesMonthCursor.getMonth(); // 0..11
  const monthNames = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  const start = new Date(y, m, 1);
  const end = new Date(y, m+1, 0);

  const all = getCompletedOrdersAll();
  const arr = all.filter(o=>{
    const d = new Date(o.completedAt || o.updatedAt || o.createdAt);
    return d >= start && d <= new Date(y, m, end.getDate(), 23, 59, 59);
  });

  const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

  const html = `
    <h1>Report vendite - ${monthNames[m]} ${y}</h1>
    <div class="muted">Ordini: ${arr.length} • Totale: € ${euro(total)}</div>
    <table>
      <thead><tr><th>Data/Ora</th><th>Articolo</th><th>Cliente</th><th>Sito</th><th>€</th></tr></thead>
      <tbody>
        ${arr.map(o=>{
          return `<tr>
            <td>${esc(fmtDT(o.completedAt || o.updatedAt || o.createdAt))}</td>
            <td>${esc(o.articolo ?? "-")}</td>
            <td>${esc(o.cliente ?? "-")}</td>
            <td>${esc(o.sito ?? "-")}</td>
            <td>€ ${euro(o.prezzo ?? 0)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  printHTML(`Report mese ${monthNames[m]} ${y}`, html);
}

function printRange(){
  const from = $("rangeFrom")?.value;
  const to = $("rangeTo")?.value;

  if(!from || !to){
    alert("Seleziona Dal e Al.");
    return;
  }

  const dFrom = keyToDate(from);
  const dTo = keyToDate(to);
  const endTo = new Date(dTo.getFullYear(), dTo.getMonth(), dTo.getDate(), 23, 59, 59);

  if(endTo < dFrom){
    alert("Intervallo non valido (Al deve essere >= Dal).");
    return;
  }

  const all = getCompletedOrdersAll();
  const arr = all.filter(o=>{
    const d = new Date(o.completedAt || o.updatedAt || o.createdAt);
    return d >= dFrom && d <= endTo;
  });

  const total = arr.reduce((s,o)=>s + (Number(o.prezzo)||0), 0);

  const html = `
    <h1>Report vendite - Intervallo ${esc(from)} → ${esc(to)}</h1>
    <div class="muted">Ordini: ${arr.length} • Totale: € ${euro(total)}</div>
    <table>
      <thead><tr><th>Data/Ora</th><th>Articolo</th><th>Cliente</th><th>Sito
</th><th>€</th></tr></thead>
      <tbody>
        ${arr.map(o=>{
          return `<tr>
            <td>${esc(fmtDT(o.completedAt || o.updatedAt || o.createdAt))}</td>
            <td>${esc(o.articolo ?? "-")}</td>
            <td>${esc(o.cliente ?? "-")}</td>
            <td>${esc(o.sito ?? "-")}</td>
            <td>€ ${euro(o.prezzo ?? 0)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  printHTML(`Report intervallo ${from}-${to}`, html);
}

/* =========================================================
   START
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  showNew();

  // refresh leggero tabella attivi se sei su Nuovo ordine
  setInterval(() => {
    const pageNew = $("page-new");
    if(pageNew && !pageNew.classList.contains("hide")){
      refreshActiveTable();
    }
  }, 2000);
});






