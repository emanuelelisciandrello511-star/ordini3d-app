console.log("APP.JS CARICATO ✅");

// =========================
// SUPABASE (pronto, non ancora usato per sync)
// =========================
const SUPABASE_URL = "https://ldisjlsnshxgasopupvn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkaXNqbHNuc2h4Z2Fzb3B1cHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTI5NjMsImV4cCI6MjA4NDA4ODk2M30.n4zUsaL_VNA4pHMpxWa7hvUxrIrb17BIxJ03DXvzHOk";
const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// =========================
// PASSWORD SOLO VENDITE
// =========================
const SALES_PASS = "0000";
const SALES_UNLOCK_KEY = "p3d_sales_unlocked";

window.onerror = function(msg, url, line, col){
  alert("ERRORE JS: " + msg + "\nRiga: " + line + ":" + col);
};

(() => {
  "use strict";

  // =========================
  // STORAGE LOCALE (per ora)
  // =========================
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

  // =========================
  // CONFIG
  // =========================
  const MS_24H = 24 * 60 * 60 * 1000;

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

  // =========================
  // DOM + UTILS
  // =========================
  const $ = (id) => document.getElementById(id);

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
  function touch(o){ o.updatedAt = new Date().toISOString(); }
  function uid(prefix="ord"){
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  function dayKey(iso){
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  // =========================
  // NORMALIZE
  // =========================
  (function normalize(){
    let changed = false;

    orders = (orders || []).map(o=>{
      if(!o || typeof o !== "object"){ changed = true; return null; }

      if(!Object.values(FLOW).includes(o.flow)){
        o.flow = FLOW.PREPARAZIONE;
        changed = true;
      }
      if(typeof o.frontaleOK !== "boolean"){ o.frontaleOK = false; changed = true; }
      if(typeof o.posterioreOK !== "boolean"){ o.posterioreOK = false; changed = true; }
      if(!o.createdAt){ o.createdAt = new Date().toISOString(); changed = true; }
      if(!o.updatedAt){ o.updatedAt = o.createdAt; changed = true; }

      if(o.flow === FLOW.COMPLETATO && !o.completedAt){
        o.completedAt = o.updatedAt;
        changed = true;
      }

      return o;
    }).filter(Boolean);

    if(changed) saveOrders();
  })();

  // =========================
  // NAV
  // =========================
  function setActive(which){
    $("tab-new")?.classList.toggle("active", which==="new");
    $("tab-prep")?.classList.toggle("active", which==="prep");
    $("tab-sales")?.classList.toggle("active", which==="sales");
    $("tab-stock")?.classList.toggle("active", which==="stock");
    $("tab-done")?.classList.toggle("active", which==="done");
    $("tab-done-simple")?.classList.toggle("active", which==="doneSimple");
    $("tab-settings")?.classList.toggle("active", which==="settings");
  }

  function hideAllPages(){
    ["page-new","page-prep","page-sales","page-stock","page-done","page-done-simple","page-settings"]
      .forEach(id => $(id)?.classList.add("hide"));
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
  function showSales(){
    hideAllPages();
    $("page-sales")?.classList.remove("hide");
    setActive("sales");
    refreshSalesUI();
  }
  function showStock(){
    hideAllPages();
    $("page-stock")?.classList.remove("hide");
    setActive("stock");
    renderStock();
  }
  function showDone(){
    hideAllPages();
    $("page-done")?.classList.remove("hide");
    setActive("done");
    renderDone();
  }
  function showDoneSimple(){
    hideAllPages();
    $("page-done-simple")?.classList.remove("hide");
    setActive("doneSimple");
    renderDoneSimple();
  }
  function showSettings(){
    hideAllPages();
    $("page-settings")?.classList.remove("hide");
    setActive("settings");
  }

  // =========================
  // PASSWORD SOLO VENDITE
  // =========================
  function openSales(){
    const unlocked = sessionStorage.getItem(SALES_UNLOCK_KEY) === "1";
    if(!unlocked){
      const pass = prompt("Password Vendite:");
      if((pass ?? "").trim() !== SALES_PASS){
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

  // =========================
  // NUOVO ORDINE (multi-progetto)
  // =========================
  let tempItems = [];

  function addTempItem(){
    const articolo = ($("progetto")?.value ?? "").trim();
    const prezzoRaw = ($("prezzo")?.value ?? "").trim();

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
      wrap.innerHTML = `<div class="muted">Nessun progetto in lista (puoi inviare anche solo quello nei campi sopra).</div>`;
      return;
    }

    const total = tempItems.reduce((s,x)=>s + (Number(x.prezzo)||0), 0);

    wrap.innerHTML = `
      <div class="panel">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b>Progetti in lista</b>
          <span class="pill">Righe: ${tempItems.length} • Totale € ${euro(total)}</span>
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
    const cliente  = ($("cliente")?.value ?? "").trim();
    const sito     = ($("sito")?.value ?? "").trim();
    const articolo = ($("progetto")?.value ?? "").trim();
    const prezzoRaw= ($("prezzo")?.value ?? "").trim();
    const note     = ($("note")?.value ?? "").trim();

    if(!cliente || !sito){
      alert("Compila Cliente e Sito vendita.");
      return;
    }

    const finalItems = tempItems.slice();

    if(articolo || prezzoRaw){
      if(!articolo || !prezzoRaw){
        alert("Completa Progetto e Prezzo oppure svuota i campi.");
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

  // =========================
  // MAGAZZINO
  // =========================
  function upsertStock(){
    const art = ($("stkArticolo")?.value ?? "").trim();
    const qtyRaw = ($("stkQty")?.value ?? "").trim();

    if(!art){ alert("Inserisci Numero progetto."); return; }
    const qty = Number(qtyRaw);
    if(!Number.isFinite(qty) || qty < 0){ alert("Quantità non valida (>= 0)."); return; }

    stock[art] = Math.floor(qty);
    saveStock();
    $("stkArticolo").value = "";
    $("stkQty").value = "";
    renderStock();
    renderBoard();
  }

  function deleteStockEncoded(encodedKey){
    const art = decodeURIComponent(encodedKey);
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

    keys.forEach(art=>{
      const qty = Number(stock[art] ?? 0);
      const tr = document.createElement("tr");
      if(qty === 0) tr.classList.add("stockZero");

      tr.innerHTML = `
        <td>${esc(art)}</td>
        <td><b>${qty}</b></td>
        <td><button class="small danger" onclick="deleteStockEncoded('${encodeURIComponent(art)}')">Elimina</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // =========================
  // PRODUZIONE
  // =========================
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

    o.flow = FLOW.SPEDIZIONE;
    o.frontaleOK = true;
    o.posterioreOK = true;
    touch(o);

    saveOrders();
    renderBoard();
    renderStock();
    refreshActiveTable();
  }

  function goPrev(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;

    if(o.flow === FLOW.SPEDIZIONE){
      o.flow = FLOW.PREPARAZIONE;
    } else if(o.flow === FLOW.COMPLETATO){
      o.flow = FLOW.SPEDIZIONE;
      o.completedAt = null;
    } else if(o.flow === FLOW.ASSEMBLAGGIO){
      o.flow = FLOW.PREPARAZIONE;
    }

    touch(o);
    saveOrders();
    renderBoard();
    refreshActiveTable();
    refreshSalesUI();
  }

  function goNext(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;

    if(o.flow === FLOW.ASSEMBLAGGIO){
      o.flow = FLOW.SPEDIZIONE;
    } else if(o.flow === FLOW.SPEDIZIONE){
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
    if(colId === "COMPLETATO"){
      if(o.flow !== FLOW.COMPLETATO) return false;
      const t = new Date(o.completedAt || o.updatedAt || o.createdAt).getTime();
      return (Date.now() - t) <= MS_24H;
    }
    if(colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
    if(colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;

    if(colId === "PREP") return o.flow === FLOW.PREPARAZIONE;

    if(o.flow !== FLOW.PREPARAZIONE) return false;
    if(colId === "FRONTALE") return !o.frontaleOK;
    if(colId === "POSTERIORE") return !o.posterioreOK;

    return false;
  }

  function renderBoard(){
    const board = $("board");
    if(!board) return;
    board.innerHTML = "";

    COLS.forEach(colDef=>{
      const col = document.createElement("div");
      col.className = "col";

      const items = orders.filter(o=>inCol(o, colDef.id));

      const h2 = document.createElement("h2");
      h2.innerHTML = `<span>${colDef.title}</span><span class="count">${items.length}</span>`;
      col.appendChild(h2);

      items.forEach(o=>{
        const card = document.createElement("div");
        card.className = "card";
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
            ${o.note ? `<br><b>Note:</b> ${esc(o.note)}` : ""}
            ${art ? `<br><b>Magazzino:</b> ${qty}` : ""}
          </div>
        `;

        const actions = document.createElement("div");
        actions.className = "actions";

        if(colDef.id === "PREP"){
          const b = document.createElement("button");
          b.className = "small ok";
          b.textContent = qty > 0 ? "Ritira dal magazzino (-1)" : "Magazzino 0";
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

  // =========================
  // ORDINI ATTIVI
  // =========================
  function statusLabel(o){
    if(o.flow === FLOW.COMPLETATO) return {text:"COMPLETATO", cls:"pill"};
    if(o.flow === FLOW.SPEDIZIONE) return {text:"SPEDIZIONE", cls:"pill"};
    if(o.flow === FLOW.ASSEMBLAGGIO) return {text:"ASSEMBLAGGIO", cls:"pill"};

    if(!o.frontaleOK && !o.posterioreOK) return {text:"IN STAMPA (front+post)", cls:"pill"};
    if(o.frontaleOK && !o.posterioreOK) return {text:"ATTESA POSTERIORE", cls:"pill"};
    if(!o.frontaleOK && o.posterioreOK) return {text:"ATTESA FRONTALE", cls:"pill"};
    return {text:"ORDINI RICEVUTI", cls:"pill"};
  }

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
        <td>${esc(st.text)}</td>
        <td>${fmtDT(o.createdAt)}</td>
        <td>${fmtDT(o.updatedAt)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // =========================
  // VENDITE (CALENDARIO) - BASE
  // =========================
  let salesMonthCursor = new Date();
  let salesSelectedDayKey = null;

  function getCompletedAll(){
    return orders.filter(o=>o.flow === FLOW.COMPLETATO).slice()
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

    const firstJsDow = first.getDay(); // 0..6
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

  function printSelectedDay(){ window.print(); }
  function printCurrentMonth(){ window.print(); }
  function printRange(){ window.print(); }

  // =========================
  // COMPLETATI LISTE
  // =========================
  function renderDone(){
    const tbody = $("doneTbody");
    if(!tbody) return;

    const completed = getCompletedAll();
    tbody.innerHTML = "";

    if(completed.length === 0){
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Nessun completato.</td></tr>`;
      return;
    }

    completed.forEach(o=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(fmtDT(o.completedAt || o.updatedAt || o.createdAt))}</td>
        <td>${esc(o.articolo)}</td>
        <td>${esc(o.cliente)}</td>
        <td>${esc(o.sito)}</td>
        <td>€ ${euro(o.prezzo)}</td>
        <td><button class="small danger" onclick="deleteCompleted('${o.id}')">Elimina</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderDoneSimple(){
    const tbody = $("doneSimpleTbody");
    if(!tbody) return;

    const completed = getCompletedAll();
    tbody.innerHTML = "";

    if(completed.length === 0){
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Nessun completato.</td></tr>`;
      return;
    }

    completed.forEach(o=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(fmtDT(o.completedAt || o.updatedAt || o.createdAt))}</td>
        <td>${esc(o.articolo)}</td>
        <td>€ ${euro(o.prezzo)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function deleteCompleted(id){
    const o = orders.find(x=>x.id===id);
    if(!o || o.flow !== FLOW.COMPLETATO) return;
    if(!confirm("Eliminare questo completato dalla memoria?")) return;
    orders = orders.filter(x=>x.id !== id);
    saveOrders();
    renderDone();
    renderDoneSimple();
    refreshSalesUI();
  }

  function clearCompleted(){
    if(!confirm("Cancellare TUTTI gli ordini completati?")) return;
    orders = orders.filter(o=>o.flow !== FLOW.COMPLETATO);
    saveOrders();
    renderDone();
    renderDoneSimple();
    refreshSalesUI();
    renderBoard();
    refreshActiveTable();
  }

  function clearAllData(){
    if(!confirm("RESET TUTTO? (ordini + magazzino)")) return;
    orders = [];
    stock = {};
    tempItems = [];
    saveOrders();
    saveStock();
    renderTempItems();
    renderStock();
    renderBoard();
    refreshActiveTable();
    refreshSalesUI();
    renderDone();
    renderDoneSimple();
    alert("Reset completato.");
  }

  // =========================
  // START
  // =========================
  document.addEventListener("DOMContentLoaded", () => {
    showNew();
    setInterval(() => {
      const pageNew = $("page-new");
      if(pageNew && !pageNew.classList.contains("hide")){
        refreshActiveTable();
      }
    }, 2000);
  });

  // =========================
  // EXPORT
  // =========================
  Object.assign(window, {
    // nav
    showNew, showPrep, openSales, lockSales, showStock, showDone, showDoneSimple, showSettings,
    // new order
    addTempItem, removeTempItem, clearTempItems, addOrder,
    // stock
    upsertStock, deleteStockEncoded,
    // settings
    clearCompleted, clearAllData,
    // board actions
    removeOrder, setFrontaleOK, setPosterioreOK, ritiraDaMagazzino, goPrev, goNext,
    // sales
    salesPrevMonth, salesNextMonth, printSelectedDay, printCurrentMonth, printRange,
  });

})();
