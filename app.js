/* =========================================================
   Pianeta 3D – Laboratorio (Supabase Realtime)
   - Multi-utente (Realtime)
   - Password SOLO Vendite (0000)
   - Board a colonne colorate
   - Completati visibili in board solo 24h
   - Pagine: Magazzino, Completati, Completati semplice, Impostazioni
   ========================================================= */

console.log("APP.JS CARICATO ✅");

window.onerror = function(msg, url, line, col){
  alert("ERRORE JS: " + msg + "\nRiga: " + line + ":" + col);
};

(() => {
  "use strict";

  /* =========================
     SUPABASE SETUP (INSERITO)
  ========================= */
  const SUPABASE_URL = "https://ldisjlsnshxgasopupvn.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkaXNqbHNuc2h4Z2Fzb3B1cHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTI5NjMsImV4cCI6MjA4NDA4ODk2M30.n4zUsaL_VNA4pHMpxWa7hvUxrIrb17BIxJ03DXvzHOk";

  if (!window.supabase) {
    alert("❌ Supabase non caricato. Controlla lo script CDN in index.html");
    return;
  }

  const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  /* =========================
     TABELLE
  ========================= */
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
  const esc = (s)=>String(s??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

  const euro = (n)=>Number(n||0).toFixed(2);
  const pad = (n)=>String(n).padStart(2,"0");
  const fmtDT = (iso)=>{
    if(!iso) return "-";
    const d=new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  /* =========================
     STATE
  ========================= */
  let orders=[];
  let stock={};

  /* =========================
     FETCH
  ========================= */
  async function fetchOrders(){
    const {data,error}=await sb.from(TBL_ORDERS).select("*").order("created_at",{ascending:false});
    if(error){ alert("Errore lettura orders_app"); console.error(error); return; }
    orders=data||[];
    renderBoard();
    refreshActiveTable();
  }

  async function fetchStock(){
    const {data,error}=await sb.from(TBL_STOCK).select("*");
    if(error){ alert("Errore lettura stock_app"); console.error(error); return; }
    stock={};
    (data||[]).forEach(r=>stock[r.articolo]=r.qty);
    renderBoard();
  }

  /* =========================
     REALTIME
  ========================= */
  function startRealtime(){
    sb.channel("rt_orders_app")
      .on("postgres_changes",{event:"*",schema:"public",table:TBL_ORDERS},fetchOrders)
      .subscribe();

    sb.channel("rt_stock_app")
      .on("postgres_changes",{event:"*",schema:"public",table:TBL_STOCK},fetchStock)
      .subscribe();
  }

  /* =========================
     BOARD
  ========================= */
  function inCol(o,col){
    if(col==="COMPLETATO"){
      if(o.flow!==FLOW.COMPLETATO) return false;
      const t=new Date(o.completed_at||o.updated_at||o.created_at).getTime();
      return Date.now()-t<=MS_24H;
    }
    if(col==="PREP") return o.flow===FLOW.PREPARAZIONE;
    if(col==="ASSEMBLAGGIO") return o.flow===FLOW.ASSEMBLAGGIO;
    if(col==="SPEDIZIONE") return o.flow===FLOW.SPEDIZIONE;
    if(col==="FRONTALE") return o.flow===FLOW.PREPARAZIONE&&!o.frontale_ok;
    if(col==="POSTERIORE") return o.flow===FLOW.PREPARAZIONE&&!o.posteriore_ok;
    return false;
  }

  function renderBoard(){
    const board=$("board"); if(!board) return;
    board.innerHTML="";
    COLS.forEach(c=>{
      const col=document.createElement("div");
      col.className="col";
      col.innerHTML=`<h2>${c.title}</h2>`;
      orders.filter(o=>inCol(o,c.id)).forEach(o=>{
        const card=document.createElement("div");
        card.className="card";
        card.style.background=c.bg;
        card.style.borderColor=c.border;
        card.innerHTML=`<b>${esc(o.articolo)}</b><br>${esc(o.cliente)}<br>€ ${euro(o.prezzo)}`;
        col.appendChild(card);
      });
      board.appendChild(col);
    });
  }

  /* =========================
     ORDINI ATTIVI
  ========================= */
  function refreshActiveTable(){
    const tbody=$("activeTbody"); if(!tbody) return;
    const act=orders.filter(o=>o.flow!==FLOW.COMPLETATO);
    tbody.innerHTML="";
    if(!act.length){
      tbody.innerHTML=`<tr><td colspan="7" class="muted">Nessun ordine attivo</td></tr>`;
      return;
    }
    act.forEach(o=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${esc(o.articolo)}</td>
        <td>${esc(o.cliente)}</td>
        <td>${esc(o.sito)}</td>
        <td>€ ${euro(o.prezzo)}</td>
        <td>${esc(o.flow)}</td>
        <td>${fmtDT(o.created_at)}</td>
        <td>${fmtDT(o.updated_at)}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* =========================
     START
  ========================= */
  document.addEventListener("DOMContentLoaded", async ()=>{
    await fetchStock();
    await fetchOrders();
    startRealtime();
  });

})();
