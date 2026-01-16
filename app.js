/* =========================
   ORDINI 3D - LAB (FULL + MULTI-PROGETTO)
   - colori colonne
   - tabella "ordini attivi" aggiornata
   - pagina Vendite protetta (0000)
   - MULTI PROGETTO: + Aggiungi progetto (crea più ordini con stesso cliente/sito/note)
   - XSS safe (escape HTML)
   ========================= */

const LS_KEY = "ordini3d_orders_v4";

/* ---------- LOAD/SAVE ---------- */
function loadOrders() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
let orders = loadOrders();
function saveOrders() {
  localStorage.setItem(LS_KEY, JSON.stringify(orders));
}

/* ---------- FLOW ---------- */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

/* ---------- COLONNE + COLORI ---------- */
const COLS = [
  { id: "PREP",         title: "🟡 Preparazione",      bg: "#fff7cc", border: "#f1d36a" },
  { id: "FRONTALE",     title: "🔵 Stampa frontale",   bg: "#e8f2ff", border: "#7fb0ff" },
  { id: "POSTERIORE",   title: "🟠 Stampa posteriore", bg: "#ffe9dc", border: "#ffb184" },
  { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio",      bg: "#f3e8ff", border: "#b68cff" },
  { id: "SPEDIZIONE",   title: "🟤 Spedizione",        bg: "#f1efe9", border: "#cbbfa6" },
  { id: "COMPLETATO",   title: "🟢 Completato",        bg: "#dfffe6", border: "#33c26b" },
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
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ---------- TABS ---------- */
function setActive(which){
  $("tab-new")?.classList.toggle("active", which==="new");
  $("tab-prep")?.classList.toggle("active", which==="prep");
  $("tab-sales")?.classList.toggle("active", which==="sales");
}

/* ---------- NAV / PAGES ---------- */
function hideAllPages(){
  ["page-new","page-prep","page-sales"].forEach(id=>{
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
  render();
}

function showSales(){
  hideAllPages();
  $("page-sales")?.classList.remove("hide");
  setActive("sales");
  refreshSales();
}

/* =========================================================
   MULTI PROGETTO (lista temporanea in pagina Nuovo ordine)
   - Non cambia la struttura degli ordini: crea PIU ORDINI
     (uno per progetto) con stesso cliente/sito/note.
   ========================================================= */
let tempItems = []; // non salvata: se ricarichi pagina si azzera

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

  tempItems.push({
    id: `${articolo}__${Date.now()}`,
    articolo,
    prezzo
  });

  // pulisci i 2 campi per inserire altri progetti
  $("progetto").value = "";
  $("prezzo").value = "";

  renderTempItems();
}

function removeTempItem(id){
  tempItems = tempItems.filter(x => x.id !== id);
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
        <thead>
          <tr>
            <th>Articolo</th>
            <th>€</th>
            <th></th>
          </tr>
        </thead>
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

      <div class="muted" style="margin-top:6px">
        Nota: “Invia ordine” creerà un ordine per ogni riga (stesso cliente/sito/note).
      </div>
    </div>
  `;
}

/* ---------- CREATE ORDER (ORA MULTI) ---------- */
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

  // lista finale: tempItems + (eventuale progetto compilato nei campi)
  const finalItems = tempItems.slice();

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
    finalItems.push({ id: `${articolo}__${Date.now()}`, articolo, prezzo });
  }

  if(finalItems.length === 0){
    alert("Inserisci almeno un progetto (nei campi sopra o con + Aggiungi progetto).");
    return;
  }

  const now = new Date().toISOString();

  // crea un ordine per ogni progetto (così il resto dell'app resta identico)
  finalItems.forEach(it=>{
    const id = `${it.articolo}__${Date.now()}_${Math.random().toString(16).slice(2)}`;

    orders.unshift({
      id,
      cliente,
      sito,
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

  // pulisci campi
  ["cliente","sito","progetto","prezzo","note"].forEach(x=>{
    const el = $(x); if(el) el.value = "";
  });
  // svuota lista multi-progetto
  tempItems = [];
  renderTempItems();

  // vai in produzione e aggiorna tabella attivi
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
  else if(o.flow === FLOW.COMPLETATO){
    o.flow = FLOW.SPEDIZIONE;
    o.completedAt = null;
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
    o.completedAt = new Date().toISOString();
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

/* ---------- FILTRI COLONNE (NO DUPLICATI) ---------- */
function inCol(o, colId){
  // COMPLETATO / ASSEMBLAGGIO / SPEDIZIONE: diretti
  if(colId === "COMPLETATO") return o.flow === FLOW.COMPLETATO;
  if(colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
  if(colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;

  // PREPARAZIONE: smistamento esclusivo tra PREP / FRONTALE / POSTERIORE
  if(o.flow !== FLOW.PREPARAZIONE) return false;

  const f = !!o.frontaleOK;
  const p = !!o.posterioreOK;

  if(colId === "PREP") return (!f && !p);
  if(colId === "FRONTALE") return (!f && p);     // manca solo frontale
  if(colId === "POSTERIORE") return (f && !p);   // manca solo posteriore
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

      card.innerHTML = `
        <div class="title">${esc(o.articolo)} — € ${euro(o.prezzo)}</div>
        <div class="meta">
          <b>Cliente:</b> ${esc(o.cliente)}<br>
          <b>Sito:</b> ${esc(o.sito)}<br>
          <b>Frontale:</b> ${o.frontaleOK ? "OK ✅" : "NO ❌"} &nbsp;|&nbsp;
          <b>Posteriore:</b> ${o.posterioreOK ? "OK ✅" : "NO ❌"}<br>
          <b>Creato:</b> ${fmtDT(o.createdAt)}<br>
          <b>Agg.:</b> ${fmtDT(o.updatedAt)}
          ${o.note ? `<br><b>Note:</b> ${esc(o.note)}` : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.className = "actions";

      // PREP: ora puoi segnare OK frontale/posteriore direttamente
      if(colDef.id === "PREP"){
        const bf = document.createElement("button");
        bf.className = "small ok";
        bf.textContent = "OK Frontale ✔";
        bf.onclick = ()=>setFrontaleOK(o.id);

        const bp = document.createElement("button");
        bp.className = "small ok";
        bp.textContent = "OK Posteriore ✔";
        bp.onclick = ()=>setPosterioreOK(o.id);

        const del = document.createElement("button");
        del.className = "small danger";
        del.textContent = "Elimina";
        del.onclick = ()=>removeOrder(o.id);

        actions.appendChild(bf);
        actions.appendChild(bp);
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

/* ---------- TABELLA "ORDINI ATTIVI" ---------- */
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
      <td>${esc(o.articolo)}</td>
      <td>${esc(o.cliente)}</td>
      <td>${esc(o.sito)}</td>
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

function refreshSales(){
  const wrap = $("salesWrap");
  if(!wrap) return;

  const completed = orders
    .filter(o=>o.flow === FLOW.COMPLETATO)
    .slice()
    .sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));

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
              <td>${esc(o.articolo)}</td>
              <td>${esc(o.cliente)}</td>
              <td>${esc(o.sito)}</td>
              <td>€ ${euro(o.prezzo)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    wrap.appendChild(block);
  });
}

/* ---------- START ---------- */
document.addEventListener("DOMContentLoaded", () => {
  showNew();

  // aggiorna automaticamente tabella attivi quando sei su Nuovo ordine
  setInterval(() => {
    const pageNew = $("page-new");
    if(pageNew && !pageNew.classList.contains("hide")){
      refreshActiveTable();
    }
  }, 2000);
});

