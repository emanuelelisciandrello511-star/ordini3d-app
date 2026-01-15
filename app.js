/* =========================
   SUPABASE CONFIG (OK)
========================= */
const SUPABASE_URL = "https://ldisjlsnshxgasopupvn.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkaXNqbHNuc2h4Z2Fzb3B1cHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1MTI5NjMsImV4cCI6MjA4NDA4ODk2M30.n4zUsaL_VNA4pHMpxWa7hvUxrIrb17BIxJ03DXvzHOk";

let supabase = null;
let useSupabase = false;

if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  useSupabase = true;
}

/* =========================
   UI BADGE
========================= */
const badge = document.getElementById("syncBadge");
if (badge) {
  badge.innerHTML = useSupabase
    ? "Storage: <strong>Supabase</strong>"
    : "Storage: <strong>Local</strong>";
}

/* =========================
   UTILS
========================= */
const $ = (id) => document.getElementById(id);
const nowISO = () => new Date().toISOString();
const money = (n) => Number(n || 0).toFixed(2);

function toast(msg) {
  const t = $("toast");
  $("toastMsg").innerText = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2500);
}

/* =========================
   LOCAL STORAGE (fallback)
========================= */
const LS_INV = "inv_local_v1";
const LS_ORD = "ord_local_v1";
const LS_SET = "set_local_v1";

const getLS = (k, d = []) => {
  try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
};
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

/* =========================
   INVENTORY
========================= */
async function getInventory() {
  if (useSupabase) {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("code");
    if (error) { toast("Errore Supabase inventory"); return []; }
    return data || [];
  }
  return getLS(LS_INV, []);
}

async function saveInventory(code, qty) {
  if (useSupabase) {
    const { error } = await supabase.from("inventory").upsert({
      code,
      qty: Number(qty),
      updated_at: nowISO(),
    }, { onConflict: "code" });
    if (error) toast("Errore salvataggio inventory");
  } else {
    const inv = getLS(LS_INV, []);
    const i = inv.findIndex(x => x.code.toLowerCase() === code.toLowerCase());
    if (i >= 0) inv[i] = { ...inv[i], qty: Number(qty), updated_at: nowISO() };
    else inv.push({ id: crypto.randomUUID(), code, qty: Number(qty), updated_at: nowISO() });
    setLS(LS_INV, inv);
  }
}

async function deleteInventoryById(id) {
  if (useSupabase) {
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) toast("Errore eliminazione inventory");
  } else {
    const inv = getLS(LS_INV, []);
    setLS(LS_INV, inv.filter(x => x.id !== id));
  }
}

/* =========================
   ORDERS
========================= */
async function getOrders() {
  if (useSupabase) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast("Errore Supabase ordini"); return []; }
    return data || [];
  }
  return getLS(LS_ORD, []);
}

async function saveOrder(order) {
  if (useSupabase) {
    const { error } = await supabase.from("orders").insert(order);
    if (error) toast("Errore inserimento ordine");
  } else {
    const ord = getLS(LS_ORD, []);
    ord.unshift({ ...order, id: crypto.randomUUID() });
    setLS(LS_ORD, ord);
  }
}

async function updateOrderStatus(id, status) {
  if (useSupabase) {
    const { error } = await supabase
      .from("orders")
      .update({ status, status_changed_at: nowISO() })
      .eq("id", id);
    if (error) toast("Errore update ordine");
  } else {
    const ord = getLS(LS_ORD, []);
    const i = ord.findIndex(o => o.id === id);
    if (i >= 0) {
      ord[i].status = status;
      ord[i].status_changed_at = nowISO();
      setLS(LS_ORD, ord);
    }
  }
}

/* =========================
   TEST CONNESSIONE
========================= */
const btnTest = $("btnTestSupabase");
if (btnTest) {
  btnTest.addEventListener("click", async () => {
    if (!useSupabase) { toast("Supabase NON configurato"); return; }
    const { error } = await supabase.from("inventory").select("id").limit(1);
    if (error) toast("Connessione OK ma tabelle/policy errate");
    else toast("Connessione Supabase OK ✅");
  });
}

/* =========================
   BOOT
========================= */
(async function boot() {
  if (useSupabase) {
    await getInventory();
    await getOrders();
  }
})();
