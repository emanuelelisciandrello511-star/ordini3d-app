/* =========================================================
   Pianeta 3D – Laboratorio (Supabase Realtime)
   ========================================================= */

console.log("APP.JS CARICATO ✅");

window.onerror = function (msg, url, line, col) {
  alert("ERRORE JS: " + msg + "\nRiga: " + line + ":" + col);
};

(() => {
  "use strict";

  /* =========================
     SUPABASE
  ========================= */
  const SUPABASE_URL = "https://ldisjlsnshxgasopupvn.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkaXNqbHNuc2h4Z2Fzb3B1cHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTI5NjMsImV4cCI6MjA4NDA4ODk2M30.n4zUsaL_VNA4pHMpxWa7hvUxrIrb17BIxJ03DXvzHOk";

  const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  const TBL_ORDERS = "orders_app";
  const TBL_STOCK = "stock_app";

  /* =========================
     CONFIG
  ========================= */
  const FLOW = {
    PREPARAZIONE: "PREPARAZIONE",
    ASSEMBLAGGIO: "ASSEMBLAGGIO",
    SPEDIZIONE: "SPEDIZIONE",
    COMPLETATO: "COMPLETATO",
  };

  const COLS = [
    { id: "PREP", title: "🟡 Ordini ricevuti" },
    { id: "FRONTALE", title: "🔵 Stampa frontale" },
    { id: "POSTERIORE", title: "🟠 Stampa posteriore" },
    { id: "ASSEMBLAGGIO", title: "🟣 Assemblaggio" },
    { id: "SPEDIZIONE", title: "🟤 Spedizione" },
    { id: "COMPLETATO", title: "🟢 Completato" },
  ];

  /* =========================
     UTILS
  ========================= */
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  const euro = (n) => Number(n || 0).toFixed(2);

  /* =========================
     STATE
  ========================= */
  let orders = [];
  let stock = {};

  /* =========================
     NAVIGAZIONE PAGINE
  ========================= */
  function hideAll() {
    [
      "page-new",
      "page-prep",
      "page-sales",
      "page-stock",
      "page-done",
      "page-done-simple",
      "page-settings",
    ].forEach((id) => $(id)?.classList.add("hide"));
  }

  function showNew() {
    hideAll();
    $("page-new")?.classList.remove("hide");
    refreshActiveTable();
  }

  function showPrep() {
    hideAll();
    $("page-prep")?.classList.remove("hide");
    renderBoard();
  }

  function showSales() {
    hideAll();
    $("page-sales")?.classList.remove("hide");
  }

  function showStock() {
    hideAll();
    $("page-stock")?.classList.remove("hide");
    renderStock();
  }

  function showDone() {
    hideAll();
    $("page-done")?.classList.remove("hide");
    renderDone();
  }

  function showDoneSimple() {
    hideAll();
    $("page-done-simple")?.classList.remove("hide");
    renderDoneSimple();
  }

  function showSettings() {
    hideAll();
    $("page-settings")?.classList.remove("hide");
  }

  /* =========================
     FETCH
  ========================= */
  async function fetchOrders() {
    const { data } = await sb.from(TBL_ORDERS).select("*");
    orders = data || [];
    renderBoard();
    refreshActiveTable();
  }

  async function fetchStock() {
    const { data } = await sb.from(TBL_STOCK).select("*");
    stock = {};
    (data || []).forEach((r) => (stock[r.articolo] = r.qty));
    renderStock();
  }

  /* =========================
     REALTIME
  ========================= */
  function startRealtime() {
    sb.channel("rt_orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TBL_ORDERS },
        fetchOrders
      )
      .subscribe();

    sb.channel("rt_stock")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TBL_STOCK },
        fetchStock
      )
      .subscribe();
  }

  /* =========================
     BOARD
  ========================= */
  function renderBoard() {
    const board = $("board");
    if (!board) return;
    board.innerHTML = "";

    COLS.forEach((c) => {
      const col = document.createElement("div");
      col.className = "col";
      col.innerHTML = `<h2>${c.title}</h2>`;

      orders
        .filter((o) => o.flow === c.id)
        .forEach((o) => {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = `
            <b>${esc(o.articolo)}</b><br>
            Cliente: ${esc(o.cliente)}<br>
            € ${euro(o.prezzo)}
          `;
          col.appendChild(card);
        });

      board.appendChild(col);
    });
  }

  /* =========================
     TABELLE
  ========================= */
  function refreshActiveTable() {
    const tbody = $("activeTbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    orders
      .filter((o) => o.flow !== FLOW.COMPLETATO)
      .forEach((o) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(o.articolo)}</td>
          <td>${esc(o.cliente)}</td>
          <td>${esc(o.sito)}</td>
          <td>€ ${euro(o.prezzo)}</td>
          <td>${esc(o.flow)}</td>
        `;
        tbody.appendChild(tr);
      });
  }

  function renderStock() {
    const tbody = $("stockTbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    Object.keys(stock).forEach((k) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(k)}</td><td>${stock[k]}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderDone() {}
  function renderDoneSimple() {}

  /* =========================
     START
  ========================= */
  document.addEventListener("DOMContentLoaded", async () => {
    await fetchOrders();
    await fetchStock();
    startRealtime();
    showNew();
  });

  /* =========================
     EXPORT GLOBALI (IMPORTANTISSIMO)
  ========================= */
  Object.assign(window, {
    showNew,
    showPrep,
    showSales,
    showStock,
    showDone,
    showDoneSimple,
    showSettings,
  });
})();
