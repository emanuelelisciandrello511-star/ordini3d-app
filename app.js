console.log("APP.JS CARICATO ✅");

/* =========================
   CONFIG PASSWORD VENDITE
========================= */
const SALES_PASS = "0000";
const SALES_UNLOCK_KEY = "p3d_sales_unlocked";

/* =========================
   STORAGE
========================= */
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

/* =========================
   FLOW
========================= */
const FLOW = {
  PREPARAZIONE: "PREPARAZIONE",
  ASSEMBLAGGIO: "ASSEMBLAGGIO",
  SPEDIZIONE: "SPEDIZIONE",
  COMPLETATO: "COMPLETATO",
};

const MS_24H = 24 * 60 * 60 * 1000;

/* =========================
   COLONNE
========================= */
const COLS = [
  { id:"PREP", title:"🟡 Ordini ricevuti" },
  { id:"FRONTALE", title:"🔵 Stampa frontale" },
  { id:"POSTERIORE", title:"🟠 Stampa posteriore" },
  { id:"ASSEMBLAGGIO", title:"🟣 Assemblaggio" },
  { id:"SPEDIZIONE", title:"🟤 Spedizione" },
  { id:"COMPLETATO", title:"🟢 Completato (24h)" },
];

/* =========================
   UTILS
========================= */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const euro = n => Number(n||0).toFixed(2);
const nowISO = () => new Date().toISOString();

function fmtDT(iso){
  if(!iso) return "-";
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function uid(){
  return `ord_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function esc(s){
  return String(s||"").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

/* =========================
   NAV
========================= */
function hideAll(){
  ["page-new","page-prep","page-sales","page-stock","page-done","page-done-simple","page-settings"]
    .forEach(id => $(id)?.classList.add("hide"));
}

function setActive(tab){
  ["new","prep","sales","stock","done","done-simple","settings"].forEach(t=>{
    $(`tab-${t}`)?.classList.toggle("active", t===tab);
  });
}

function showNew(){ hideAll(); $("page-new").classList.remove("hide"); setActive("new"); refreshActiveTable(); }
function showPrep(){ hideAll(); $("page-prep").classList.remove("hide"); setActive("prep"); renderBoard(); }
function showStock(){ hideAll(); $("page-stock").classList.remove("hide"); setActive("stock"); renderStock(); }
function showDone(){ hideAll(); $("page-done").classList.remove("hide"); setActive("done"); renderDone(); }
function showDoneSimple(){ hideAll(); $("page-done-simple").classList.remove("hide"); setActive("done-simple"); renderDoneSimple(); }
function showSettings(){ hideAll(); $("page-settings").classList.remove("hide"); setActive("settings"); }

/* =========================
   PASSWORD SOLO VENDITE
========================= */
function openSales(){
  const unlocked = sessionStorage.getItem(SALES_UNLOCK_KEY)==="1";
  if(!unlocked){
    const pass = prompt("Password Vendite:");
    if((pass||"").trim() !== SALES_PASS){
      alert("Password errata");
      return;
    }
    sessionStorage.setItem(SALES_UNLOCK_KEY,"1");
  }
  hideAll();
  $("page-sales").classList.remove("hide");
  setActive("sales");
  refreshSalesUI();
}

function lockSales(){
  sessionStorage.removeItem(SALES_UNLOCK_KEY);
  alert("Vendite bloccate");
  showNew();
}

/* =========================
   NUOVO ORDINE (multi)
========================= */
let tempItems = [];

function addTempItem(){
  const art = $("progetto").value.trim();
  const pr  = Number($("prezzo").value);
  if(!art || !pr){ alert("Inserisci progetto e prezzo"); return; }
  tempItems.push({id:uid(), articolo:art, prezzo:pr});
  $("progetto").value=""; $("prezzo").value="";
  renderTempItems();
}

function renderTempItems(){
  const w = $("tempItemsWrap");
  if(tempItems.length===0){ w.innerHTML=""; return; }
  w.innerHTML = `
    <table>
      ${tempItems.map(i=>`
        <tr>
          <td>${esc(i.articolo)}</td>
          <td>€ ${euro(i.prezzo)}</td>
          <td><button onclick="removeTempItem('${i.id}')">x</button></td>
        </tr>
      `).join("")}
    </table>
  `;
}

function removeTempItem(id){
  tempItems = tempItems.filter(i=>i.id!==id);
  renderTempItems();
}

function addOrder(){
  const cliente=$("cliente").value.trim();
  const sito=$("sito").value.trim();
  const note=$("note").value.trim();
  if(!cliente||!sito){ alert("Cliente e sito obbligatori"); return; }

  if(tempItems.length===0) addTempItem();

  const t = nowISO();
  tempItems.forEach(it=>{
    orders.unshift({
      id:uid(), cliente, sito,
      articolo:it.articolo,
      prezzo:it.prezzo,
      note,
      flow:FLOW.PREPARAZIONE,
      frontaleOK:false,
      posterioreOK:false,
      createdAt:t,
      updatedAt:t,
      completedAt:null
    });
  });

  tempItems=[];
  $("cliente").value=$("sito").value=$("note").value="";
  renderTempItems();
  saveOrders();
  showPrep();
}

/* =========================
   PRODUZIONE
========================= */
function inCol(o,col){
  if(col==="PREP") return o.flow===FLOW.PREPARAZIONE;
  if(col==="FRONTALE") return o.flow===FLOW.PREPARAZIONE && !o.frontaleOK;
  if(col==="POSTERIORE") return o.flow===FLOW.PREPARAZIONE && !o.posterioreOK;
  if(col==="ASSEMBLAGGIO") return o.flow===FLOW.ASSEMBLAGGIO;
  if(col==="SPEDIZIONE") return o.flow===FLOW.SPEDIZIONE;
  if(col==="COMPLETATO"){
    if(o.flow!==FLOW.COMPLETATO) return false;
    return (Date.now()-new Date(o.completedAt).getTime())<=MS_24H;
  }
}

function renderBoard(){
  const b=$("board"); b.innerHTML="";
  COLS.forEach(c=>{
    const col=document.createElement("div");
    col.className="col";
    col.innerHTML=`<h2>${c.title}</h2>`;
    orders.filter(o=>inCol(o,c.id)).forEach(o=>{
      const card=document.createElement("div");
      card.className="card";
      card.innerHTML=`
        <b>${esc(o.articolo)}</b> – € ${euro(o.prezzo)}<br>
        ${esc(o.cliente)}<br>
        <small>${fmtDT(o.createdAt)}</small>
      `;
      const a=document.createElement("div"); a.className="actions";

      if(c.id==="PREP"){
        a.innerHTML=`
          <button onclick="ritiraDaMagazzino('${o.id}')">Ritira magazzino</button>
          <button onclick="removeOrder('${o.id}')">Elimina</button>`;
      }
      if(c.id==="FRONTALE") a.innerHTML=`<button onclick="setFrontaleOK('${o.id}')">OK Frontale</button>`;
      if(c.id==="POSTERIORE") a.innerHTML=`<button onclick="setPosterioreOK('${o.id}')">OK Posteriore</button>`;
      if(["ASSEMBLAGGIO","SPEDIZIONE"].includes(c.id))
        a.innerHTML=`<button onclick="goPrev('${o.id}')">←</button><button onclick="goNext('${o.id}')">→</button>`;

      card.appendChild(a);
      col.appendChild(card);
    });
    b.appendChild(col);
  });
}

/* =========================
   MAGAZZINO
========================= */
function upsertStock(){
  const a=$("stkArticolo").value.trim();
  const q=Number($("stkQty").value);
  if(!a||q<0)return;
  stock[a]=q; saveStock(); renderStock();
}

function renderStock(){
  const t=$("stockTbody"); t.innerHTML="";
  Object.keys(stock).forEach(a=>{
    const tr=document.createElement("tr");
    if(stock[a]===0) tr.className="stockZero";
    tr.innerHTML=`<td>${esc(a)}</td><td>${stock[a]}</td>`;
    t.appendChild(tr);
  });
}

function ritiraDaMagazzino(id){
  const o=orders.find(x=>x.id===id);
  if(!o)return;
  if((stock[o.articolo]||0)<=0){ alert("Magazzino vuoto"); return; }
  stock[o.articolo]--; saveStock();
  o.flow=FLOW.SPEDIZIONE;
  o.frontaleOK=o.posterioreOK=true;
  o.updatedAt=nowISO();
  saveOrders();
  renderBoard();
}

/* =========================
   AVANZAMENTO
========================= */
function setFrontaleOK(id){ const o=orders.find(x=>x.id===id); o.frontaleOK=true; if(o.posterioreOK)o.flow=FLOW.ASSEMBLAGGIO; saveOrders(); renderBoard(); }
function setPosterioreOK(id){ const o=orders.find(x=>x.id===id); o.posterioreOK=true; if(o.frontaleOK)o.flow=FLOW.ASSEMBLAGGIO; saveOrders(); renderBoard(); }

function goPrev(id){
  const o=orders.find(x=>x.id===id);
  if(o.flow===FLOW.SPEDIZIONE) o.flow=FLOW.PREPARAZIONE;
  else if(o.flow===FLOW.ASSEMBLAGGIO) o.flow=FLOW.PREPARAZIONE;
  saveOrders(); renderBoard();
}

function goNext(id){
  const o=orders.find(x=>x.id===id);
  if(o.flow===FLOW.ASSEMBLAGGIO) o.flow=FLOW.SPEDIZIONE;
  else if(o.flow===FLOW.SPEDIZIONE){ o.flow=FLOW.COMPLETATO; o.completedAt=nowISO(); }
  saveOrders(); renderBoard();
}

function removeOrder(id){
  orders=orders.filter(o=>o.id!==id);
  saveOrders(); renderBoard(); refreshActiveTable();
}

/* =========================
   ORDINI ATTIVI
========================= */
function refreshActiveTable(){
  const t=$("activeTbody"); t.innerHTML="";
  orders.filter(o=>o.flow!==FLOW.COMPLETATO).forEach(o=>{
    t.innerHTML+=`
      <tr>
        <td>${esc(o.articolo)}</td>
        <td>${esc(o.cliente)}</td>
        <td>${esc(o.sito)}</td>
        <td>€ ${euro(o.prezzo)}</td>
        <td>${o.flow}</td>
        <td>${fmtDT(o.createdAt)}</td>
        <td>${fmtDT(o.updatedAt)}</td>
      </tr>`;
  });
}

/* =========================
   COMPLETATI
========================= */
function renderDone(){
  const t=$("doneTbody"); t.innerHTML="";
  orders.filter(o=>o.flow===FLOW.COMPLETATO).forEach(o=>{
    t.innerHTML+=`
      <tr>
        <td>${fmtDT(o.completedAt)}</td>
        <td>${esc(o.articolo)}</td>
        <td>${esc(o.cliente)}</td>
        <td>${esc(o.sito)}</td>
        <td>€ ${euro(o.prezzo)}</td>
        <td><button onclick="deleteCompleted('${o.id}')">X</button></td>
      </tr>`;
  });
}

function renderDoneSimple(){
  const t=$("doneSimpleTbody"); t.innerHTML="";
  orders.filter(o=>o.flow===FLOW.COMPLETATO).forEach(o=>{
    t.innerHTML+=`<tr><td>${fmtDT(o.completedAt)}</td><td>${esc(o.articolo)}</td><td>€ ${euro(o.prezzo)}</td></tr>`;
  });
}

function deleteCompleted(id){
  orders=orders.filter(o=>o.id!==id);
  saveOrders(); renderDone(); renderDoneSimple();
}

function clearCompleted(){
  orders=orders.filter(o=>o.flow!==FLOW.COMPLETATO);
  saveOrders(); renderDone(); renderDoneSimple(); renderBoard();
}

function clearAllData(){
  if(!confirm("RESET TOTALE?"))return;
  orders=[]; stock={}; tempItems=[];
  saveOrders(); saveStock();
  showNew();
}

/* =========================
   START
========================= */
document.addEventListener("DOMContentLoaded", ()=>{
  showNew();
});

/* =========================
   EXPORT
========================= */
Object.assign(window,{
  showNew,showPrep,openSales,lockSales,showStock,showDone,showDoneSimple,showSettings,
  addTempItem,removeTempItem,addOrder,
  upsertStock,ritiraDaMagazzino,
  setFrontaleOK,setPosterioreOK,goPrev,goNext,removeOrder,
  refreshActiveTable,clearCompleted,clearAllData
});
