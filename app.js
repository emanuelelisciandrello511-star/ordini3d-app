/* app.js — Pianeta 3D Lab (per il tuo index.html)
   - localStorage
   - Nuovo ordine -> Produzione (board)
   - Vendite protette password 1234
   - Tabella “Ordini attivi”: non completati + completati ultime 24h
   - Vendite: completati ultimi 365 giorni, raggruppati per giorno con totale €
   - Export “Excel” come CSV (apri con Excel)
*/
(() => {
  const LS_KEY = "pianeta3d_orders_v1";
  const SALES_UNLOCK_KEY = "pianeta3d_sales_unlock";
  const SALES_PASSWORD = "1234";

  const STATUSES = [
    "Ricevuto",
    "Stampa",
    "Post-Processing",
    "Controllo Qualità",
    "Assemblaggio",
    "Spedizione",
    "Completato",
  ];

  const $ = (id) => document.getElementById(id);
  const now = () => Date.now();

  // ---------------- Helpers ----------------
  function pad2(n) { return String(n).padStart(2, "0"); }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function euro(v) {
    const n = Number(v || 0);
    return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid() {
    return "ord_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function withinHours(ts, h) {
    return (now() - ts) <= h * 60 * 60 * 1000;
  }

  function withinDays(ts, d) {
    return (now() - ts) <= d * 24 * 60 * 60 * 1000;
  }

  function loadOrders() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveOrders(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  function updateOrder(id, patch) {
    const orders = loadOrders();
    const i = orders.findIndex((o) => o.id === id);
    if (i === -1) return;
    orders[i] = { ...orders[i], ...patch, updatedAt: now() };
    saveOrders(orders);
    rerenderAll();
  }

  function removeOrder(id) {
    const orders = loadOrders().filter((o) => o.id !== id);
    saveOrders(orders);
    rerenderAll();
  }

  // ---------------- Routing / Tabs ----------------
  window.showNew = function showNew() {
    $("page-new").classList.remove("hide");
    $("page-prep").classList.add("hide");
    $("page-sales").classList.add("hide");
    refreshActiveTable();
  };

  window.showPrep = function showPrep() {
    $("page-new").classList.add("hide");
    $("page-prep").classList.remove("hide");
    $("page-sales").classList.add("hide");
    renderBoard();
  };

  function showSales() {
    $("page-new").classList.add("hide");
    $("page-prep").classList.add("hide");
    $("page-sales").classList.remove("hide");
    refreshSales();
  }

  window.openSales = function openSales() {
    const unlocked = localStorage.getItem(SALES_UNLOCK_KEY) === "1";
    if (!unlocked) {
      const pw = prompt("Password Vendite:");
      if (pw !== SALES_PASSWORD) {
        alert("Password errata.");
        return;
      }
      localStorage.setItem(SALES_UNLOCK_KEY, "1");
    }
    if (typeof window.setActive === "function") window.setActive("sales");
    showSales();
  };

  window.lockSales = function lockSales() {
    localStorage.removeItem(SALES_UNLOCK_KEY);
    alert("Vendite bloccate.");
    if (typeof window.setActive === "function") window.setActive("new");
    window.showNew();
  };

  // ---------------- Nuovo ordine ----------------
  window.addOrder = function addOrder() {
    const cliente = ($("cliente").value || "").trim();
    const sito = ($("sito").value || "").trim();
    const articolo = ($("progetto").value || "").trim();
    const prezzo = Number($("prezzo").value || 0);
    const note = ($("note").value || "").trim();

    if (!cliente) { alert("Inserisci Cliente."); return; }
    if (!sito) { alert("Inserisci Sito vendita."); return; }
    if (!articolo) { alert("Inserisci Numero progetto (ARTICOLO)."); return; }

    const ts = now();
    const orders = loadOrders();

    const existsActive = orders.some((o) => o.articolo === articolo && o.status !== "Completato");
    if (existsActive) {
      const ok = confirm("Esiste già un ordine attivo con lo stesso ARTICOLO. Vuoi inserirlo lo stesso?");
      if (!ok) return;
    }

    orders.unshift({
      id: uid(),
      articolo,
      cliente,
      sito,
      prezzo: Number.isFinite(prezzo) ? prezzo : 0,
      note,
      status: "Ricevuto",
      createdAt: ts,
      updatedAt: ts,
      frontOk: false,
      backOk: false,
    });

    saveOrders(orders);

    $("cliente").value = "";
    $("sito").value = "";
    $("progetto").value = "";
    $("prezzo").value = "";
    $("note").value = "";

    alert("Ordine inserito in Produzione.");
    refreshActiveTable();
  };

  // ---------------- Tabella “Ordini attivi” ----------------
  window.refreshActiveTable = function refreshActiveTable() {
    const tbody = $("activeTbody");
    if (!tbody) return;

    const orders = loadOrders();

    // attivi = non completati + completati ultime 24h
    const list = orders.filter((o) => o.status !== "Completato" || withinHours(o.updatedAt || o.createdAt, 24));

    tbody.innerHTML = "";

    if (!list.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" class="muted">Nessun ordine.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const o of list) {
      const pillClass =
        o.status === "Completato" ? "ok" :
        o.status === "Assemblaggio" ? "info" :
        o.status === "Controllo Qualità" ? "warn" : "";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(o.articolo)}</b></td>
        <td>${escapeHtml(o.cliente)}</td>
        <td>${escapeHtml(o.sito)}</td>
        <td>${euro(o.prezzo)}</td>
        <td><span class="pill ${pillClass}">${escapeHtml(o.status)}</span></td>
        <td>${fmtDateTime(o.createdAt)}</td>
        <td>${fmtDateTime(o.updatedAt || o.createdAt)}</td>
      `;
      tbody.appendChild(tr);
    }
  };

  // ---------------- Board Produzione ----------------
  function canMoveToAssemblaggio(o) {
    return !!o.frontOk && !!o.backOk;
  }

  function nextStatus(st) {
    const i = STATUSES.indexOf(st);
    if (i === -1) return st;
    return STATUSES[Math.min(i + 1, STATUSES.length - 1)];
  }

  function prevStatus(st) {
    const i = STATUSES.indexOf(st);
    if (i === -1) return st;
    return STATUSES[Math.max(i - 1, 0)];
  }

  function cssSafe(s) {
    return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
  }

  function renderBoard() {
    const board = $("board");
    if (!board) return;

    const orders = loadOrders().filter((o) => o.status !== "Completato");
    const groups = {};
    for (const st of STATUSES) groups[st] = [];
    for (const o of orders) (groups[o.status] ||= []).push(o);

    board.innerHTML = "";

    for (const st of STATUSES) {
      if (st === "Completato") continue;

      const items = (groups[st] || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const col = document.createElement("div");
      col.className = "col";
      col.innerHTML = `
        <h2>
          <span>${st}</span>
          <span class="count">${items.length}</span>
        </h2>
        <div id="col-${cssSafe(st)}"></div>
      `;
      board.appendChild(col);

      const holder = col.querySelector(`#col-${cssSafe(st)}`);

      if (!items.length) {
        holder.innerHTML = `<div class="muted">Vuoto</div>`;
        continue;
      }

      for (const o of items) {
        const card = document.createElement("div");
        card.className = "card";

        const frontPill = o.frontOk
          ? `<span class="pill ok">Frontale OK</span>`
          : `<span class="pill warn">Frontale NO</span>`;

        const backPill = o.backOk
          ? `<span class="pill ok">Posteriore OK</span>`
          : `<span class="pill warn">Posteriore NO</span>`;

        const ruleHint =
          !canMoveToAssemblaggio(o)
            ? `<div class="muted" style="margin-top:8px">
                Per andare in <b>Assemblaggio</b> servono <b>Frontale OK</b> + <b>Posteriore OK</b>.
              </div>`
            : "";

        card.innerHTML = `
          <div class="title">${escapeHtml(o.articolo)} <span class="muted">• ${escapeHtml(o.sito)}</span></div>
          <div class="meta">
            <div><b>Cliente:</b> ${escapeHtml(o.cliente)}</div>
            <div><b>Prezzo:</b> ${euro(o.prezzo)} ${o.note ? `• <b>Note:</b> ${escapeHtml(o.note)}` : ""}</div>
            <div><b>Creato:</b> ${fmtDateTime(o.createdAt)} • <b>Agg:</b> ${fmtDateTime(o.updatedAt || o.createdAt)}</div>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${frontPill}${backPill}</div>
          </div>

          <div class="actions" style="margin-top:10px">
            <button class="small" data-a="front">Segna Frontale OK</button>
            <button class="small" data-a="back">Segna Posteriore OK</button>
            <button class="small" data-a="prev">← Indietro</button>
            <button class="small ok" data-a="next">Avanti →</button>
            <button class="small done" data-a="done">Completato ✅</button>
            <button class="small danger" data-a="del">Elimina</button>
          </div>

          ${ruleHint}
        `;

        card.querySelector(`[data-a="front"]`).onclick = () => updateOrder(o.id, { frontOk: true });
        card.querySelector(`[data-a="back"]`).onclick = () => updateOrder(o.id, { backOk: true });

        card.querySelector(`[data-a="prev"]`).onclick = () => {
          updateOrder(o.id, { status: prevStatus(o.status) });
        };

        card.querySelector(`[data-a="next"]`).onclick = () => {
          const target = nextStatus(o.status);
          if (target === "Assemblaggio" && !canMoveToAssemblaggio(o)) {
            alert("Non puoi spostare in Assemblaggio: servono Frontale OK + Posteriore OK.");
            return;
          }
          updateOrder(o.id, { status: target });
        };

        card.querySelector(`[data-a="done"]`).onclick = () => {
          if (!confirm("Segnare come COMPLETATO? Andrà nelle Vendite.")) return;
          updateOrder(o.id, { status: "Completato" });
        };

        card.querySelector(`[data-a="del"]`).onclick = () => {
          if (!confirm("Eliminare definitivamente questo ordine?")) return;
          removeOrder(o.id);
        };

        holder.appendChild(card);
      }
    }
  }

  // ---------------- Vendite ----------------
  window.refreshSales = function refreshSales() {
    const wrap = $("salesWrap");
    if (!wrap) return;

    const orders = loadOrders()
      .filter((o) => o.status === "Completato")
      .filter((o) => withinDays(o.updatedAt || o.createdAt, 365));

    // group by day
    const map = new Map();
    for (const o of orders) {
      const day = fmtDate(o.updatedAt || o.createdAt);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(o);
    }

    const days = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));

    if (!days.length) {
      wrap.innerHTML = `<div class="muted">Nessuna vendita completata negli ultimi 365 giorni.</div>`;
      return;
    }

    let html = "";
    for (const day of days) {
      const items = map.get(day).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const total = items.reduce((s, o) => s + Number(o.prezzo || 0), 0);

      html += `
        <div class="panel" style="margin-bottom:10px">
          <div class="row" style="justify-content:space-between;align-items:center">
            <b>${day}</b>
            <span class="pill ok">Totale: ${euro(total)}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Articolo</th><th>Cliente</th><th>Sito</th><th>€</th><th>Completato</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(o => `
                <tr>
                  <td><b>${escapeHtml(o.articolo)}</b></td>
                  <td>${escapeHtml(o.cliente)}</td>
                  <td>${escapeHtml(o.sito)}</td>
                  <td>${euro(o.prezzo)}</td>
                  <td>${fmtDateTime(o.updatedAt || o.createdAt)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    wrap.innerHTML = html;
  };

  // ---------------- Export CSV (Excel) ----------------
  function csvCell(v) {
    const s = String(v ?? "");
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function completedOrders365() {
    return loadOrders()
      .filter((o) => o.status === "Completato")
      .filter((o) => withinDays(o.updatedAt || o.createdAt, 365));
  }

  window.downloadSalesDaily = function downloadSalesDaily() {
    const today = fmtDate(now());
    const items = completedOrders365().filter((o) => fmtDate(o.updatedAt || o.createdAt) === today);

    if (!items.length) {
      alert("Nessuna vendita completata oggi.");
      return;
    }

    const rows = [
      ["Giorno", "Articolo", "Cliente", "Sito", "Prezzo", "Creato", "Completato", "Note"],
      ...items.map((o) => [
        today,
        o.articolo,
        o.cliente,
        o.sito,
        o.prezzo,
        fmtDateTime(o.createdAt),
        fmtDateTime(o.updatedAt || o.createdAt),
        o.note || "",
      ]),
    ];

    downloadCsv(`vendite_${today}.csv`, rows);
  };

  window.downloadSalesMonthly = function downloadSalesMonthly() {
    const d = new Date();
    const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

    const items = completedOrders365().filter((o) => fmtDate(o.updatedAt || o.createdAt).startsWith(ym));

    if (!items.length) {
      alert("Nessuna vendita completata in questo mese.");
      return;
    }

    const rows = [
      ["Giorno", "Articolo", "Cliente", "Sito", "Prezzo", "Creato", "Completato", "Note"],
      ...items.map((o) => [
        fmtDate(o.updatedAt || o.createdAt),
        o.articolo,
        o.cliente,
        o.sito,
        o.prezzo,
        fmtDateTime(o.createdAt),
        fmtDateTime(o.updatedAt || o.createdAt),
        o.note || "",
      ]),
    ];

    downloadCsv(`vendite_${ym}.csv`, rows);
  };

  // ---------------- Rerender ----------------
  function rerenderAll() {
    const isNewVisible = !$("page-new").classList.contains("hide");
    const isPrepVisible = !$("page-prep").classList.contains("hide");
    const isSalesVisible = !$("page-sales").classList.contains("hide");

    if (isNewVisible) refreshActiveTable();
    if (isPrepVisible) renderBoard();
    if (isSalesVisible) refreshSales();
  }

  // ---------------- Init ----------------
  function init() {
    // vista iniziale
    if (typeof window.setActive === "function") window.setActive("new");
    window.showNew();

    // refresh periodico (non invasivo)
    setInterval(() => {
      rerenderAll();
    }, 30_000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

