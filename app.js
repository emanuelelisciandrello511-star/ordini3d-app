console.log("APP.JS CARICATO ✅");

window.onerror = function(msg, url, line, col){
  alert("ERRORE JS: " + msg + "\nRiga: " + line + ":" + col);
};

(() => {
  "use strict";

  /* =========================
     SUPABASE (ORDINI + STOCK)
  ========================= */
  const SUPABASE_URL = "https://ldisjlsnshxgasopupvn.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkaXNqbHNuc2h4Z2Fzb3B1cHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTI5NjMsImV4cCI6MjA4NDA4ODk2M30.n4zUsaL_VNA4pHMpxWa7hvUxrIrb17BIxJ03DXvzHOk";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const TBL_ORDERS = "orders_app";
  const TBL_STOCK  = "stock_app";

  /* =========================
     CONFIG
  ========================= */
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

  /* =========================
     DOM + UTILS
  ========================= */
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
  function uid(prefix="ord"){
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  function dayKey(iso){
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  /* =========================
     DATA IN MEMORIA (caricata da Supabase)
  ========================= */
  let orders = []; // array di ordini "normalizzati" lato app
  let stock  = {}; // { articolo: qty }

  function nowISO(){ return new Date().toISOString(); }

  /* =========================
     MAPPING DB <-> APP
  ========================= */
  function dbToOrder(r){
    return {
      id: r.id,
      cliente: r.cliente ?? "",
      sito: r.sito ?? "",
      articolo: r.articolo ?? "",
      prezzo: Number(r.prezzo ?? 0),
      note: r.note ?? "",
      flow: r.flow ?? FLOW.PREPARAZIONE,
      frontaleOK: Boolean(r.frontale_ok),
      posterioreOK: Boolean(r.posteriore_ok),
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? r.created_at ?? null,
      completedAt: r.completed_at ?? null,
    };
  }

  function orderToDb(o){
    return {
      id: o.id,
      cliente: o.cliente ?? "",
      sito: o.sito ?? "",
      articolo: o.articolo ?? "",
      prezzo: Number(o.prezzo ?? 0),
      note: o.note ?? "",
      flow: o.flow ?? FLOW.PREPARAZIONE,
      frontale_ok: Boolean(o.frontaleOK),
      posteriore_ok: Boolean(o.posterioreOK),
      created_at: o.createdAt ?? nowISO(),
      updated_at: o.updatedAt ?? nowISO(),
      completed_at: o.completedAt ?? null,
    };
  }

  /* =========================
     SUPABASE LOAD
  ========================= */
  async function loadOrdersFromDB(){
    const { data, error } = await sb
      .from(TBL_ORDERS)
      .select("*")
      .order("created_at", { ascending: false });

    if(error){
      console.error("loadOrdersFromDB error:", error);
      return;
    }
    orders = (data || []).map(dbToOrder);

    // refresh UI ovunque
    refreshActiveTable();
    renderBoard();
    renderDone();
    renderDoneSimple();
    refreshSalesUI();
  }

  async function loadStockFromDB(){
    const { data, error } = await sb
      .from(TBL_STOCK)
      .select("*");

    if(error){
      console.error("loadStockFromDB error:", error);
      return;
    }
    const map = {};
    (data || []).forEach(r => {
      map[String(r.articolo ?? "").trim()] = Number(r.qty ?? 0);
    });
    stock = map;

    renderStock();
    renderBoard();
  }

  async function upsertOrderDB(o){
    const payload = orderToDb(o);
    const { error } = await sb.from(TBL_ORDERS).upsert(payload);
    if(error) console.error("upsertOrderDB error:", error);
  }

  async function deleteOrderDB(id){
    const { error } = await sb.from(TBL_ORDERS).delete().eq("id", id);
    if(error) console.error("deleteOrderDB error:", error);
  }

  async function upsertStockDB(articolo, qty){
    const payload = { articolo, qty: Number(qty ?? 0) };
    const { error } = await sb.from(TBL_STOCK).upsert(payload);
    if(error) console.error("upsertStockDB error:", error);
  }

  async function deleteStockDB(articolo){
    const { error } = await sb.from(TBL_STOCK).delete().eq("articolo", articolo);
    if(error) console.error("deleteStockDB error:", error);
  }

  /* =========================
     REALTIME (aggiornamenti multi-device)
  ========================= */
  function startRealtime(){
    // ordini
    sb.channel("rt_orders_app")
      .on("postgres_changes", { event: "*", schema: "public", table: TBL_ORDERS }, () => {
        loadOrdersFromDB();
      })
      .subscribe();

    // stock
    sb.channel("rt_stock_app")
      .on("postgres_changes", { event: "*", schema: "public", table: TBL_STOCK }, () => {
        loadStockFromDB();
      })
      .subscribe();
  }

  /* =========================
     NAV / PAGES
  ========================= */
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

  /* =========================
     NUOVO ORDINE (multi-progetto)
  ========================= */
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

  async function addOrder(){
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

    const now = nowISO();

    // crea e salva su DB (una riga per progetto)
    for(const it of finalItems){
      const o = {
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
      };
      await upsertOrderDB(o);
    }

    // pulisci form
    ["cliente","sito","progetto","prezzo","note"].forEach(x=>{
      const el = $(x); if(el) el.value = "";
    });
    tempItems = [];
    renderTempItems();

    // ricarica e vai produzione
    await loadOrdersFromDB();
    showPrep();
  }

  /* =========================
     MAGAZZINO
  ========================= */
  async function upsertStock(){
    const art = ($("stkArticolo")?.value ?? "").trim();
    const qtyRaw = ($("stkQty")?.value ?? "").trim();

    if(!art){ alert("Inserisci Numero progetto."); return; }
    const qty = Number(qtyRaw);
    if(!Number.isFinite(qty) || qty < 0){ alert("Quantità non valida (>= 0)."); return; }

    await upsertStockDB(art, Math.floor(qty));
    $("stkArticolo").value = "";
    $("stkQty").value = "";

    await loadStockFromDB();
  }

  async function deleteStockEncoded(encodedKey){
    const art = decodeURIComponent(encodedKey);
    if(!confirm("Eliminare questo articolo dal magazzino?")) return;
    await deleteStockDB(art);
    await loadStockFromDB();
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

  /* =========================
     PRODUZIONE (LOGICA)
  ========================= */
  function touch(o){ o.updatedAt = nowISO(); }

  function autoToAssemblaggio(o){
    if(o.flow === FLOW.PREPARAZIONE && o.frontaleOK && o.posterioreOK){
      o.flow = FLOW.ASSEMBLAGGIO;
      touch(o);
    }
  }

  async function setFrontaleOK(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;
    o.frontaleOK = true;
    touch(o);
    autoToAssemblaggio(o);
    await upsertOrderDB(o);
    await loadOrdersFromDB();
  }

  async function setPosterioreOK(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;
    o.posterioreOK = true;
    touch(o);
    autoToAssemblaggio(o);
    await upsertOrderDB(o);
    await loadOrdersFromDB();
  }

  async function ritiraDaMagazzino(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;

    const art = String(o.articolo || "").trim();
    const qty = Number(stock[art] ?? 0);

    if(qty <= 0){
      alert("Magazzino: giacenza ZERO per questo progetto.");
      return;
    }

    // scala stock
    await upsertStockDB(art, qty - 1);

    // salta stampa -> spedizione
    o.flow = FLOW.SPEDIZIONE;
    o.frontaleOK = true;
    o.posterioreOK = true;
    touch(o);

    await upsertOrderDB(o);

    await loadStockFromDB();
    await loadOrdersFromDB();
  }

  async function goPrev(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;

    if(o.flow === FLOW.SPEDIZIONE){
      // FIX: torna in ordini ricevuti (PREPARAZIONE) con possibilità di eliminarlo
      o.flow = FLOW.PREPARAZIONE;
    } else if(o.flow === FLOW.COMPLETATO){
      o.flow = FLOW.SPEDIZIONE;
      o.completedAt = null;
    } else if(o.flow === FLOW.ASSEMBLAGGIO){
      o.flow = FLOW.PREPARAZIONE;
    }

    touch(o);
    await upsertOrderDB(o);
    await loadOrdersFromDB();
  }

  async function goNext(id){
    const o = orders.find(x=>x.id===id);
    if(!o) return;

    if(o.flow === FLOW.ASSEMBLAGGIO){
      o.flow = FLOW.SPEDIZIONE;
    } else if(o.flow === FLOW.SPEDIZIONE){
      o.flow = FLOW.COMPLETATO;
      o.completedAt = nowISO();
    }

    touch(o);
    await upsertOrderDB(o);
    await loadOrdersFromDB();
  }

  async function removeOrder(id){
    if(!confirm("Eliminare questo ordine?")) return;
    await deleteOrderDB(id);
    await loadOrdersFromDB();
  }

  function inCol(o, colId){
    if(colId === "COMPLETATO"){
      if(o.flow !== FLOW.COMPLETATO) return false;
      const t = new Date(o.completedAt || o.updatedAt || o.createdAt).getTime();
      return (Date.now() - t) <= MS_24H;
    }
    if(colId === "SPEDIZIONE") return o.flow === FLOW.SPEDIZIONE;
    if(colId === "ASSEMBLAGGIO") return o.flow === FLOW.ASSEMBLAGGIO;

    // Ordini ricevuti: tutti quelli in PREPARAZIONE
    if(colId === "PREP") return o.flow === FLOW.PREPARAZIONE;

    // Colonne stampa: solo se ancora in PREPARAZIONE
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

  /* =========================
     ORDINI ATTIVI (TAB NUUOVO ORDINE)
  ========================= */
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

  /* =========================
     VENDITE (PASSWORD SOLO QUI)
  ========================= */
  const SALES_UNLOCK_KEY = "p3d_sales_unlocked";
  const SALES_PASSWORD = "0000";

  let salesMonthCursor = new Date();
  let salesSelectedDayKey = null;

  function getCompletedAll(){
    return orders
      .filter(o=>o.flow === FLOW.COMPLETATO)
      .slice()
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

  function openSales(){
    const unlocked = sessionStorage.getItem(SALES_UNLOCK_KEY) === "1";
    if(!unlocked){
      const pass = prompt("Password Vendite:");
      if(pass !== SALES_PASSWORD){
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

    dow.innerHTML = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"]
      .map(x=>`<div class="muted" style="width:40px">${x}</div>`)
      .join("");

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

  // Se nel tuo index hai bottoni stampa, li lasciamo disponibili.
  function printSelectedDay(){
    alert("Stampa: funzione non attiva in questa versione (possiamo aggiungerla).");
  }
  function printCurrentMonth(){
    alert("Stampa: funzione non attiva in questa versione (possiamo aggiungerla).");
  }
  function printRange(){
    alert("Stampa: funzione non attiva in questa versione (possiamo aggiungerla).");
  }

  /* =========================
     COMPLETATI (liste + pulizia memoria)
  ========================= */
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

  async function deleteCompleted(id){
    const o = orders.find(x=>x.id===id);
    if(!o || o.flow !== FLOW.COMPLETATO) return;
    if(!confirm("Eliminare questo completato dalla memoria?")) return;
    await deleteOrderDB(id);
    await loadOrdersFromDB();
  }

  async function clearCompleted(){
    if(!confirm("Cancellare TUTTI gli ordini completati?")) return;
    const ids = orders.filter(o=>o.flow === FLOW.COMPLETATO).map(o=>o.id);
    if(ids.length === 0) return;

    // cancella in blocco
    const { error } = await sb.from(TBL_ORDERS).delete().in("id", ids);
    if(error) console.error("clearCompleted error:", error);

    await loadOrdersFromDB();
  }

  async function clearAllData(){
    if(!confirm("RESET TUTTO? (ordini + magazzino)")) return;

    const { error: e1 } = await sb.from(TBL_ORDERS).delete().neq("id", "___never___");
    if(e1) console.error("clearAllData orders error:", e1);

    const { error: e2 } = await sb.from(TBL_STOCK).delete().neq("articolo", "___never___");
    if(e2) console.error("clearAllData stock error:", e2);

    tempItems = [];
    await loadStockFromDB();
    await loadOrdersFromDB();
    alert("Reset completato.");
  }

  /* =========================
     START
  ========================= */
  document.addEventListener("DOMContentLoaded", async () => {
    showNew();

    // carica DB
    await loadStockFromDB();
    await loadOrdersFromDB();

    // realtime multi device
    startRealtime();

    // aggiorna tabella attivi se sei su Nuovo ordine
    setInterval(() => {
      const pageNew = $("page-new");
      if(pageNew && !pageNew.classList.contains("hide")){
        refreshActiveTable();
      }
    }, 2000);
  });

  /* =========================
     EXPORT (per onclick HTML)
  ========================= */
  Object.assign(window, {
    showNew, showPrep, showSales, showStock, showDone, showDoneSimple, showSettings,
    openSales, lockSales,
    salesPrevMonth, salesNextMonth,
    addTempItem, removeTempItem, clearTempItems, addOrder,
    upsertStock, deleteStockEncoded,
    clearCompleted, clearAllData,
    deleteCompleted,
    // bottoni creati nel render:
    removeOrder, setFrontaleOK, setPosterioreOK, ritiraDaMagazzino,
    goPrev, goNext,
    // stampa (se presenti)
    printSelectedDay, printCurrentMonth, printRange,
  });

})();
