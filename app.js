/* =========================
   CONFIG SUPABASE
   - Inserisci qui le tue credenziali
   - Se lasci vuote => usa localStorage (fallback)
========================= */

const SUPABASE_URL = "";      // es: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = ""; // es: eyJhbGciOi...

/* =========================
   COSTANTI / UTIL
========================= */
const LS_KEYS = {
  inventory: "gp3d_inventory_v1",
  orders: "gp3d_orders_v1",
  settings: "gp3d_settings_v1",
};

const ORDER_CLEANUP_HOURS = 24;

function nowISO() { return new Date().toISOString(); }
function fmtMoney(n){ return (Number(n || 0)).toFixed(2); }
function toDateInputValue(d){
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,"0");
  const dd = String(dt.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function sameDay(a, b){
  const da = new Date(a), db = new Date(b);
  return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
}
function monthKey(d){
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
}

/* =========================
   TOAST
========================= */
const toastEl = document.getElementById("toast");
const toastMsgEl = document.getElementById("toastMsg");
document.getElementById("toastClose").addEventListener("click", () => hideToast());

let toastTimer = null;
function showToast(msg){
  toastMsgEl.textContent = msg;
  toastEl.classList.remove("hidden");
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hideToast(), 2500);
}
function hideToast(){
  toastEl.classList.add("hidden");
}

/* =========================
   SUPABASE CLIENT
========================= */
let supabase = null;
let supabaseEnabled = false;

function initSupabase(){
  if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseEnabled = true;
  } else {
    supabase = null;
    supabaseEnabled = false;
  }
  updateSyncBadge();
}

function updateSyncBadge(){
  const badge = document.getElementById("syncBadge");
  badge.innerHTML = supabaseEnabled ? `Storage: <strong>Supabase</strong>` : `Storage: <strong>Local</strong>`;
}

/* =========================
   STORAGE LAYER (Local + Supabase)
========================= */
async function lsGet(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{
    return fallback;
  }
}
async function lsSet(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

async function dbInventoryList(){
  if(!supabaseEnabled) return await lsGet(LS_KEYS.inventory, []);
  const { data, error } = await supabase.from("inventory").select("*").order("code", { ascending:true });
  if(error){ showToast("Errore Supabase inventory"); return []; }
  return data.map(r => ({ id:r.id, code:r.code, qty:r.qty, updated_at:r.updated_at }));
}
async function dbInventoryUpsert(code, qty){
  if(!supabaseEnabled){
    const inv = await lsGet(LS_KEYS.inventory, []);
    const idx = inv.findIndex(x => x.code.toLowerCase() === code.toLowerCase());
    const item = { id: idx>=0 ? inv[idx].id : crypto.randomUUID(), code, qty:Number(qty), updated_at: nowISO() };
    if(idx>=0) inv[idx] = item; else inv.push(item);
    await lsSet(LS_KEYS.inventory, inv);
    return item;
  }
  const payload = { code, qty: Number(qty), updated_at: nowISO() };
  // upsert by unique (code)
  const { data, error } = await supabase.from("inventory").upsert(payload, { onConflict: "code" }).select("*").single();
  if(error){ showToast("Errore salvataggio Supabase"); return null; }
  return data;
}
async function dbInventoryDeleteById(id){
  if(!supabaseEnabled){
    const inv = await lsGet(LS_KEYS.inventory, []);
    const next = inv.filter(x => x.id !== id);
    await lsSet(LS_KEYS.inventory, next);
    return true;
  }
  const { error } = await supabase.from("inventory").delete().eq("id", id);
  if(error){ showToast("Errore eliminazione Supabase"); return false; }
  return true;
}

async function dbOrdersList(){
  if(!supabaseEnabled) return await lsGet(LS_KEYS.orders, []);
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending:false });
  if(error){ showToast("Errore Supabase orders"); return []; }
  return data.map(o => ({
    id:o.id,
    created_at:o.created_at,
    channel:o.channel,
    total:o.total,
    status:o.status,
    status_changed_at:o.status_changed_at,
    lines:o.lines || [],
  }));
}

async function dbOrderInsert(order){
  if(!supabaseEnabled){
    const orders = await lsGet(LS_KEYS.orders, []);
    const item = { ...order, id: crypto.randomUUID() };
    orders.unshift(item);
    await lsSet(LS_KEYS.orders, orders);
    return item;
  }
  const { data, error } = await supabase.from("orders").insert(order).select("*").single();
  if(error){ showToast("Errore inserimento ordine Supabase"); return null; }
  return data;
}

async function dbOrderUpdateStatus(id, status){
  const status_changed_at = nowISO();
  if(!supabaseEnabled){
    const orders = await lsGet(LS_KEYS.orders, []);
    const idx = orders.findIndex(o => o.id === id);
    if(idx<0) return false;
    orders[idx].status = status;
    orders[idx].status_changed_at = status_changed_at;
    await lsSet(LS_KEYS.orders, orders);
    return true;
  }
  const { error } = await supabase.from("orders").update({ status, status_changed_at }).eq("id", id);
  if(error){ showToast("Errore update status Supabase"); return false; }
  return true;
}

async function settingsGet(){
  return await lsGet(LS_KEYS.settings, { deletePass: "1234" });
}
async function settingsSet(s){
  await lsSet(LS_KEYS.settings, s);
}

/* =========================
   UI: TAB
========================= */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const t = btn.dataset.tab;
    document.querySelectorAll("main section").forEach(sec => sec.classList.add("hidden"));
    document.getElementById(`tab-${t}`).classList.remove("hidden");
  });
});

document.getElementById("btnReload").addEventListener("click", async () => {
  await refreshAll();
  showToast("Ricaricato");
});

/* =========================
   MAGAZZINO UI
========================= */
const invTbody = document.getElementById("invTbody");
const invSearch = document.getElementById("invSearch");

let invSelectedId = null;

function invRowTemplate(item){
  const tr = document.createElement("tr");
  if(Number(item.qty) === 0) tr.classList.add("rowZero");

  const updated = item.updated_at ? new Date(item.updated_at).toLocaleString() : "-";

  tr.innerHTML = `
    <td class="center"><input type="radio" name="invSel"></td>
    <td>${escapeHtml(item.code)}</td>
    <td class="right">${Number(item.qty)}</td>
    <td>${updated}</td>
  `;

  tr.querySelector('input[type="radio"]').addEventListener("change", () => {
    invSelectedId = item.id;
  });

  return tr;
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function renderInventory(){
  const list = await dbInventoryList();
  const q = (invSearch.value || "").trim().toLowerCase();
  const filtered = q ? list.filter(x => (x.code||"").toLowerCase().includes(q)) : list;

  invTbody.innerHTML = "";
  invSelectedId = null;

  filtered.forEach(item => invTbody.appendChild(invRowTemplate(item)));
}

document.getElementById("btnInvRefresh").addEventListener("click", renderInventory);
invSearch.addEventListener("input", renderInventory);

document.getElementById("btnInvSave").addEventListener("click", async () => {
  const code = (document.getElementById("invCode").value || "").trim();
  const qty = Number(document.getElementById("invQty").value);

  if(!code){ showToast("Inserisci un codice"); return; }
  if(!Number.isFinite(qty) || qty < 0){ showToast("Quantità non valida"); return; }

  await dbInventoryUpsert(code, qty);
  document.getElementById("invCode").value = "";
  document.getElementById("invQty").value = "1";
  await renderInventory();
  showToast("Salvato");
});

document.getElementById("btnInvDeleteSelected").addEventListener("click", async () => {
  if(!invSelectedId){ showToast("Seleziona una riga"); return; }
  const s = await settingsGet();
  const pass = prompt("Password eliminazione:");
  if(pass === null) return;
  if(pass !== s.deletePass){ showToast("Password errata"); return; }

  const ok = await dbInventoryDeleteById(invSelectedId);
  if(ok){
    await renderInventory();
    showToast("Eliminato");
  }
});

document.getElementById("btnInvExport").addEventListener("click", async () => {
  const list = await dbInventoryList();
  const blob = new Blob([JSON.stringify(list, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "magazzino.json";
  a.click();
  URL.revokeObjectURL(url);
});

/* =========================
   ORDINI: INSERIMENTO VELOCE
========================= */
const orderLinesTbody = document.getElementById("orderLinesTbody");
const ordersTbody = document.getElementById("ordersTbody");

function addOrderLine(code="", qty=1){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="ol-code" placeholder="CODICE" autocomplete="off" value="${escapeHtml(code)}"></td>
    <td class="right"><input class="ol-qty" type="number" min="1" step="1" value="${Number(qty)}"></td>
    <td class="center"><button class="btn danger ol-del" type="button">X</button></td>
  `;
  tr.querySelector(".ol-del").addEventListener("click", () => tr.remove());
  orderLinesTbody.appendChild(tr);
  return tr;
}

function getOrderLines(){
  const rows = [...orderLinesTbody.querySelectorAll("tr")];
  const lines = [];
  for(const r of rows){
    const code = (r.querySelector(".ol-code").value || "").trim();
    const qty = Number(r.querySelector(".ol-qty").value);
    if(!code) continue;
    if(!Number.isFinite(qty) || qty <= 0) continue;
    lines.push({ code, qty });
  }
  return lines;
}

function setupOrderKeyboard(){
  orderLinesTbody.addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr");
    if(!tr) return;

    const rows = [...orderLinesTbody.querySelectorAll("tr")];
    const idx = rows.indexOf(tr);

    // Enter = nuova riga se sei sull'ultima (o comunque)
    if(e.key === "Enter" && !e.ctrlKey){
      e.preventDefault();
      const newRow = addOrderLine("", 1);
      newRow.querySelector(".ol-code").focus();
      return;
    }

    // Ctrl+Enter = salva ordine
    if(e.key === "Enter" && e.ctrlKey){
      e.preventDefault();
      document.getElementById("btnSaveOrder").click();
      return;
    }

    // Up/Down
    if(e.key === "ArrowUp"){
      e.preventDefault();
      const prev = rows[Math.max(0, idx-1)];
      if(prev) prev.querySelector(".ol-code").focus();
      return;
    }
    if(e.key === "ArrowDown"){
      e.preventDefault();
      const next = rows[Math.min(rows.length-1, idx+1)];
      if(next) next.querySelector(".ol-code").focus();
      return;
    }
  });
}

document.getElementById("btnAddLine").addEventListener("click", () => {
  const tr = addOrderLine("", 1);
  tr.querySelector(".ol-code").focus();
});

document.getElementById("btnClearOrder").addEventListener("click", () => {
  document.getElementById("ordTotal").value = "";
  orderLinesTbody.innerHTML = "";
  addOrderLine("", 1).querySelector(".ol-code").focus();
});

document.getElementById("btnSaveOrder").addEventListener("click", async () => {
  const channel = document.getElementById("ordChannel").value;
  const total = Number(document.getElementById("ordTotal").value || 0);
  const lines = getOrderLines();

  if(lines.length === 0){ showToast("Inserisci almeno 1 riga con codice"); return; }
  if(!Number.isFinite(total) || total < 0){ showToast("Incasso non valido"); return; }

  const order = {
    created_at: nowISO(),
    channel,
    total: Number(total),
    status: "open",
    status_changed_at: null,
    lines,
  };

  // salva ordine
  const saved = await dbOrderInsert(order);
  if(!saved) return;

  // scala magazzino (se prodotto esiste) oppure crea con negativo? -> per ora scala solo se esiste
  // (se vuoi, posso mettere "crea se non esiste" ma così eviti errori)
  const inv = await dbInventoryList();
  for(const l of lines){
    const found = inv.find(x => x.code.toLowerCase() === l.code.toLowerCase());
    if(found){
      const newQty = Math.max(0, Number(found.qty) - Number(l.qty));
      await dbInventoryUpsert(found.code, newQty);
    }
  }

  document.getElementById("btnClearOrder").click();
  await refreshOrders();
  await renderInventory();
  showToast("Ordine salvato");
});

document.getElementById("btnOrdersRefresh").addEventListener("click", refreshOrders);
document.getElementById("ordersFilter").addEventListener("change", refreshOrders);

function statusPill(status){
  if(status === "done") return `<span class="pill done">Completato</span>`;
  if(status === "cancelled") return `<span class="pill cancel">Annullato</span>`;
  return `<span class="pill open">Aperto</span>`;
}

async function cleanupOrders(orders){
  // rimuovi "done" più vecchi di 24 ore (solo da UI e storage)
  const limitMs = ORDER_CLEANUP_HOURS * 60 * 60 * 1000;
  const now = Date.now();

  if(supabaseEnabled){
    // su Supabase NON cancello automaticamente (eviti sorprese), li nascondo lato UI.
    // Se vuoi che li cancelli davvero anche dal DB, lo facciamo dopo.
    return orders;
  }

  const cleaned = orders.filter(o => {
    if(o.status !== "done") return true;
    if(!o.status_changed_at) return true;
    return (now - new Date(o.status_changed_at).getTime()) < limitMs;
  });

  if(cleaned.length !== orders.length){
    await lsSet(LS_KEYS.orders, cleaned);
  }
  return cleaned;
}

async function refreshOrders(){
  let orders = await dbOrdersList();
  orders = await cleanupOrders(orders);

  const filter = document.getElementById("ordersFilter").value;
  let view = orders;

  if(filter !== "all"){
    view = orders.filter(o => o.status === filter);
  }

  ordersTbody.innerHTML = "";
  view.forEach(o => {
    const tr = document.createElement("tr");
    const dt = new Date(o.created_at).toLocaleString();
    tr.innerHTML = `
      <td>${dt}</td>
      <td>${escapeHtml(o.channel)}</td>
      <td class="right">${fmtMoney(o.total)}</td>
      <td>${statusPill(o.status)}</td>
      <td class="center">
        <button class="btn okBtn" type="button">✓</button>
        <button class="btn danger cancelBtn" type="button">X</button>
      </td>
    `;
    tr.querySelector(".okBtn").addEventListener("click", async () => {
      await dbOrderUpdateStatus(o.id, "done");
      await refreshOrders();
      showToast("Ordine completato");
    });
    tr.querySelector(".cancelBtn").addEventListener("click", async () => {
      await dbOrderUpdateStatus(o.id, "cancelled");
      await refreshOrders();
      showToast("Ordine annullato");
    });
    ordersTbody.appendChild(tr);
  });
}

/* =========================
   REPORT INCASSI
========================= */
document.getElementById("repMode").addEventListener("change", () => {
  const mode = document.getElementById("repMode").value;
  const day = document.getElementById("repDay");
  day.classList.toggle("hidden", mode !== "daypick");
});

document.getElementById("btnRepRun").addEventListener("click", runReport);

async function runReport(){
  const mode = document.getElementById("repMode").value;
  const repDay = document.getElementById("repDay").value;

  const orders = (await dbOrdersList()).filter(o => o.status === "done");

  let filtered = orders;

  if(mode === "daily"){
    // oggi
    const today = new Date();
    filtered = orders.filter(o => sameDay(o.created_at, today));
  } else if(mode === "monthly"){
    const mk = monthKey(new Date());
    filtered = orders.filter(o => monthKey(o.created_at) === mk);
  } else if(mode === "daypick"){
    if(!repDay){ showToast("Seleziona un giorno"); return; }
    const pick = new Date(repDay + "T00:00:00");
    filtered = orders.filter(o => sameDay(o.created_at, pick));
  }

  const total = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
  document.getElementById("repTotal").textContent = fmtMoney(total);
  document.getElementById("repCount").textContent = String(filtered.length);

  // per canale
  const map = new Map();
  for(const o of filtered){
    const key = o.channel || "Sconosciuto";
    const prev = map.get(key) || { sum:0, count:0 };
    prev.sum += Number(o.total || 0);
    prev.count += 1;
    map.set(key, prev);
  }

  const repByChannel = document.getElementById("repByChannel");
  repByChannel.innerHTML = "";
  [...map.entries()].sort((a,b) => b[1].sum - a[1].sum).forEach(([ch, v]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(ch)}</td><td class="right">${fmtMoney(v.sum)}</td><td class="right">${v.count}</td>`;
    repByChannel.appendChild(tr);
  });

  // lista ordini inclusi
  const repOrders = document.getElementById("repOrders");
  repOrders.innerHTML = "";
  filtered
    .slice()
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach(o => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${new Date(o.created_at).toLocaleString()}</td><td>${escapeHtml(o.channel)}</td><td class="right">${fmtMoney(o.total)}</td>`;
      repOrders.appendChild(tr);
    });

  showToast("Report aggiornato");
}

/* =========================
   IMPOSTAZIONI
========================= */
document.getElementById("btnSavePass").addEventListener("click", async () => {
  const pass = document.getElementById("setDeletePass").value;
  if(!pass || pass.length < 2){ showToast("Password troppo corta"); return; }
  const s = await settingsGet();
  s.deletePass = pass;
  await settingsSet(s);
  document.getElementById("setDeletePass").value = "";
  showToast("Password salvata");
});

document.getElementById("btnResetPass").addEventListener("click", async () => {
  await settingsSet({ deletePass: "1234" });
  showToast("Password resettata a 1234");
});

document.getElementById("btnTestSupabase").addEventListener("click", async () => {
  if(!supabaseEnabled){ showToast("Supabase NON configurato (usa Local)"); return; }
  const { error } = await supabase.from("inventory").select("id").limit(1);
  if(error){ showToast("Connessione OK ma tabella manca / policy"); return; }
  showToast("Connessione Supabase OK");
});

/* =========================
   AVVIO
========================= */
async function refreshAll(){
  await renderInventory();
  await refreshOrders();
  // report default: oggi
  document.getElementById("repDay").value = toDateInputValue(new Date());
}

(function boot(){
  initSupabase();

  // setup ordine righe
  orderLinesTbody.innerHTML = "";
  addOrderLine("", 1);
  setupOrderKeyboard();

  // default date picker
  document.getElementById("repDay").value = toDateInputValue(new Date());

  refreshAll();
})();
