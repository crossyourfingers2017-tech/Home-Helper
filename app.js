
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Your Firebase project
const firebaseConfig = {
  apiKey: "AIzaSyCP2U8qFuEJXrFtItiams-o2yS7Z8a2ILI",
  authDomain: "home-helper-770c9.firebaseapp.com",
  projectId: "home-helper-770c9",
  storageBucket: "home-helper-770c9.firebasestorage.app",
  messagingSenderId: "218281054551",
  appId: "1:218281054551:web:2d80f7f9f66b3e4e766e12"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const LOCAL_KEY = "homeHelperV2";
let state = loadLocal();
let currentView = "home";
let roomFilter = "all";
let currentUser = null;
let unsubscribeHome = null;
let saveTimer = null;
let cloudLoaded = false;

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function newId(){
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function defaultState(){
  return {
    version: 2,
    rooms: [
      {id:"kitchen", name:"Kitchen", emoji:"🍽️"},
      {id:"living", name:"Living Room", emoji:"🛋️"},
      {id:"bathroom", name:"Bathroom", emoji:"🛁"},
      {id:"mainbed", name:"Main Bedroom", emoji:"🛏️"},
      {id:"caseyroom", name:"Casey's Bedroom", emoji:"🧸"},
      {id:"rileyroom", name:"Riley's Bedroom", emoji:"🎮"},
      {id:"hall", name:"Hall & Stairs", emoji:"🪜"},
      {id:"other", name:"Other", emoji:"✨"}
    ],
    people: [
      {id:"parent", name:"Parent", role:"adult", emoji:"🧑"},
      {id:"casey", name:"Casey", role:"child", emoji:"👧"},
      {id:"riley", name:"Riley", role:"child", emoji:"👦"}
    ],
    tasks: []
  };
}
function loadLocal(){
  try{
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return parsed?.rooms && parsed?.people && parsed?.tasks ? parsed : defaultState();
  }catch{
    return defaultState();
  }
}
function saveLocal(){
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}
function homeRef(){
  return doc(db, "homes", currentUser.uid);
}

function setSync(text, cls=""){
  const b = document.getElementById("syncBadge");
  if(!b) return;
  b.textContent = text;
  b.className = `sync-badge ${cls}`.trim();
}

async function saveCloudNow(){
  if(!currentUser || !cloudLoaded) return;
  saveLocal();
  setSync("Saving…");
  try{
    await setDoc(homeRef(), {
      version: 2,
      rooms: state.rooms,
      people: state.people,
      tasks: state.tasks,
      updatedAt: serverTimestamp()
    });
    setSync("Synced","ok");
  }catch(err){
    console.error(err);
    setSync("Sync error","err");
  }
}
function save(){
  saveLocal();
  render();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCloudNow, 250);
}

async function beginCloudSync(user){
  currentUser = user;
  cloudLoaded = false;
  setSync("Connecting…");
  const ref = homeRef();

  try{
    const snap = await getDoc(ref);
    if(!snap.exists()){
      await setDoc(ref, {
        version: 2,
        rooms: state.rooms,
        people: state.people,
        tasks: state.tasks,
        updatedAt: serverTimestamp()
      });
    }else{
      const data = snap.data();
      if(data.rooms && data.people && data.tasks){
        state = {version:2, rooms:data.rooms, people:data.people, tasks:data.tasks};
        saveLocal();
      }
    }

    cloudLoaded = true;
    render();
    setSync("Synced","ok");

    if(unsubscribeHome) unsubscribeHome();
    unsubscribeHome = onSnapshot(ref, snap => {
      if(!snap.exists()) return;
      const data = snap.data();
      if(data.rooms && data.people && data.tasks){
        state = {version:2, rooms:data.rooms, people:data.people, tasks:data.tasks};
        saveLocal();
        render();
        setSync("Synced","ok");
      }
    }, err => {
      console.error(err);
      setSync("Sync error","err");
    });
  }catch(err){
    console.error(err);
    cloudLoaded = true;
    showApp();
    setSync("Setup needed","err");
    alert("Home Helper connected to Firebase, but Firestore is not ready yet. Finish the Firebase setup steps and reload the app.");
  }
}

function showLoading(){
  document.getElementById("loadingScreen").classList.remove("hidden");
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appShell").classList.add("hidden");
}
function showAuth(){
  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("authScreen").classList.remove("hidden");
}
function showApp(){
  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  document.getElementById("accountText").textContent = currentUser?.email ? `Signed in as ${currentUser.email}` : "Signed in";
  render();
}

onAuthStateChanged(auth, async user => {
  if(unsubscribeHome){ unsubscribeHome(); unsubscribeHome = null; }
  if(!user){
    currentUser = null;
    cloudLoaded = false;
    showAuth();
    return;
  }
  showLoading();
  currentUser = user;
  await beginCloudSync(user);
  showApp();
});

document.getElementById("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  setAuthMessage("");
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(err){
    setAuthMessage(authError(err.code));
  }
});
document.getElementById("createAccountBtn").addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if(!email || password.length < 6){
    setAuthMessage("Enter an email and a password of at least 6 characters.");
    return;
  }
  setAuthMessage("");
  try{
    await createUserWithEmailAndPassword(auth, email, password);
  }catch(err){
    setAuthMessage(authError(err.code));
  }
});
function setAuthMessage(msg){ document.getElementById("authMessage").textContent = msg; }
function authError(code){
  const map = {
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/email-already-in-use":"That email already has a family account. Use Sign in instead.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/weak-password":"Use a stronger password with at least 6 characters.",
    "auth/operation-not-allowed":"Email/password sign-in has not been enabled in Firebase yet."
  };
  return map[code] || `Sign-in problem: ${code || "unknown error"}`;
}

function money(n){ return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n||0)); }
function room(id){ return state.rooms.find(r=>r.id===id) || {name:"Other",emoji:"✨"}; }
function person(id){ return state.people.find(p=>p.id===id) || {name:"Unassigned",emoji:"👤"}; }
function weekStart(date=new Date()){
  const d=new Date(date); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d;
}
function earnedThisWeek(personId){
  const start=weekStart().getTime();
  return state.tasks.filter(t=>t.assigneeId===personId && t.status==="approved" && !t.paid && (t.approvedAt||0)>=start)
    .reduce((s,t)=>s+Number(t.reward||0),0);
}
function approvedUnpaid(personId){
  return state.tasks.filter(t=>t.assigneeId===personId && t.status==="approved" && !t.paid)
    .reduce((s,t)=>s+Number(t.reward||0),0);
}
function openCount(personId){
  return state.tasks.filter(t=>t.assigneeId===personId && ["open","pending"].includes(t.status)).length;
}

function render(){
  if(!document.getElementById("app") || document.getElementById("appShell").classList.contains("hidden")) return;
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active", b.dataset.view===currentView));
  const app=document.getElementById("app");
  if(currentView==="home") app.innerHTML=renderHome();
  if(currentView==="rooms") app.innerHTML=renderRooms();
  if(currentView==="family") app.innerHTML=renderFamily();
  if(currentView==="pay") app.innerHTML=renderPay();
  wireDynamic();
  populateTaskSelects();
}

function renderHome(){
  const today=todayISO();
  const todayTasks=state.tasks.filter(t=>t.due===today && t.status!=="approved");
  const pending=state.tasks.filter(t=>t.status==="pending").length;
  const weekTotal=state.people.filter(p=>p.role==="child").reduce((s,p)=>s+approvedUnpaid(p.id),0);
  const visible = state.tasks
    .filter(t=>t.status!=="approved" || !t.paid)
    .sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999"));

  return `
    <section class="hero">
      <p class="eyebrow" style="color:#cbd5e1">Today</p>
      <h2>${todayTasks.length ? `${todayTasks.length} job${todayTasks.length===1?"":"s"} to keep on top of` : "You're all caught up"}</h2>
      <div class="hero-stats">
        <div class="stat"><strong>${todayTasks.length}</strong><span>Due today</span></div>
        <div class="stat"><strong>${pending}</strong><span>Need approval</span></div>
        <div class="stat"><strong>${money(weekTotal)}</strong><span>To pay</span></div>
      </div>
    </section>
    <div class="section-head"><h2>Jobs</h2><button class="link-btn" data-action="openTask">+ Add</button></div>
    <div class="cards">
      ${visible.length ? visible.map(renderTaskCard).join("") : `<div class="empty">No jobs yet. Tap + to add one.</div>`}
    </div>`;
}

function renderTaskCard(t){
  const p=person(t.assigneeId), r=room(t.roomId);
  const statusText = t.status==="pending" ? "Waiting for approval" : t.status==="approved" ? (t.paid?"Paid":"Approved") : "To do";
  return `<article class="card task-card">
    <div>
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="meta">${r.emoji} ${escapeHtml(r.name)} · ${p.emoji} ${escapeHtml(p.name)}${t.due?` · Due ${friendlyDate(t.due)}`:""}</div>
      <div class="badges">
        <span class="badge">${statusText}</span>
        ${Number(t.reward)>0?`<span class="badge reward">${money(t.reward)}</span>`:""}
      </div>
      ${t.notes?`<p class="meta" style="margin:10px 0 0">${escapeHtml(t.notes)}</p>`:""}
      <div class="task-actions">
        ${t.status==="open" ? `<button class="small-btn done" data-action="done" data-id="${t.id}">✓ Done</button>`:""}
        ${t.status==="pending" ? `<button class="small-btn approve" data-action="approve" data-id="${t.id}">Approve</button>`:""}
        ${t.status==="approved" && !t.paid ? `<button class="small-btn done" data-action="undoApproval" data-id="${t.id}">Undo</button>`:""}
        <button class="small-btn delete" data-action="deleteTask" data-id="${t.id}">Delete</button>
      </div>
    </div>
    <div style="font-size:26px">${r.emoji}</div>
  </article>`;
}

function renderRooms(){
  const tasksFor = id => state.tasks.filter(t=>t.roomId===id && t.status!=="approved").length;
  return `
    <div class="section-head"><h2>Rooms</h2><button class="link-btn" data-action="openRoom">+ Add room</button></div>
    <div class="room-grid">
      ${state.rooms.map(r=>`<button class="card room-card" data-action="filterRoom" data-id="${r.id}" style="text-align:left;border:1px solid var(--line)">
        <span class="room-emoji">${r.emoji}</span>
        <span><strong>${escapeHtml(r.name)}</strong><br><span class="meta">${tasksFor(r.id)} open job${tasksFor(r.id)===1?"":"s"}</span></span>
      </button>`).join("")}
    </div>
    ${roomFilter!=="all" ? `
      <div class="section-head"><h2>${escapeHtml(room(roomFilter).name)}</h2><button class="link-btn" data-action="clearRoomFilter">Show all</button></div>
      <div class="cards">${state.tasks.filter(t=>t.roomId===roomFilter).map(renderTaskCard).join("") || `<div class="empty">No jobs in this room yet.</div>`}</div>`:""}`;
}

function renderFamily(){
  return `
    <div class="section-head"><h2>Family</h2><button class="link-btn" data-action="openPerson">+ Add person</button></div>
    <div class="cards">
      ${state.people.map(p=>`<article class="card person-row">
        <div class="avatar">${p.emoji||"👤"}</div>
        <div class="person-main">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="meta">${p.role==="child"?"Child":"Adult"} · ${openCount(p.id)} open</span>
        </div>
        <div style="text-align:right"><div class="money">${p.role==="child"?money(approvedUnpaid(p.id)):"—"}</div><span class="meta">${p.role==="child"?"unpaid":" "}</span></div>
      </article>`).join("")}
    </div>`;
}

function renderPay(){
  const kids=state.people.filter(p=>p.role==="child");
  return `
    <section class="hero">
      <p class="eyebrow" style="color:#cbd5e1">Weekly rewards</p>
      <h2>${money(kids.reduce((s,p)=>s+approvedUnpaid(p.id),0))} currently owed</h2>
      <p style="opacity:.85;margin-bottom:0">Only approved jobs count towards payment.</p>
    </section>
    <div class="cards">
      ${kids.map(p=>{
        const total=approvedUnpaid(p.id);
        const week=earnedThisWeek(p.id);
        const approvedTasks=state.tasks.filter(t=>t.assigneeId===p.id && t.status==="approved" && !t.paid);
        return `<article class="card">
          <div class="paid-row"><div><strong style="font-size:18px">${p.emoji} ${escapeHtml(p.name)}</strong><div class="meta">${approvedTasks.length} approved job${approvedTasks.length===1?"":"s"}</div></div><div class="money">${money(total)}</div></div>
          <div class="badges"><span class="badge">This week: ${money(week)}</span></div>
          ${total>0?`<button class="primary full" data-action="markPaid" data-id="${p.id}">Mark ${money(total)} as paid</button>`:`<div class="meta" style="margin-top:12px">Nothing to pay yet.</div>`}
        </article>`;
      }).join("")}
    </div>`;
}

function populateTaskSelects(){
  const roomSel=document.getElementById("taskRoom");
  const personSel=document.getElementById("taskAssignee");
  if(roomSel) roomSel.innerHTML=state.rooms.map(r=>`<option value="${r.id}">${r.emoji} ${escapeHtml(r.name)}</option>`).join("");
  if(personSel) personSel.innerHTML=state.people.map(p=>`<option value="${p.id}">${p.emoji||"👤"} ${escapeHtml(p.name)}</option>`).join("");
  const due=document.getElementById("taskDue");
  if(due && !due.value) due.value=todayISO();
}

function wireDynamic(){
  document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click", ()=>{
    const a=el.dataset.action, id=el.dataset.id;
    if(a==="openTask") openDialog("taskDialog");
    if(a==="openRoom") openDialog("roomDialog");
    if(a==="openPerson") openDialog("personDialog");
    if(a==="done") completeTask(id);
    if(a==="approve") approveTask(id);
    if(a==="undoApproval"){const t=state.tasks.find(x=>x.id===id); if(t){t.status="pending";t.approvedAt=null;save();}}
    if(a==="deleteTask"){ if(confirm("Delete this job?")){state.tasks=state.tasks.filter(x=>x.id!==id);save();}}
    if(a==="filterRoom"){roomFilter=id;render();}
    if(a==="clearRoomFilter"){roomFilter="all";render();}
    if(a==="markPaid"){
      if(confirm(`Mark all approved rewards for ${person(id).name} as paid?`)){
        state.tasks.forEach(t=>{if(t.assigneeId===id&&t.status==="approved"&&!t.paid)t.paid=true});
        save();
      }
    }
  }));
}
function completeTask(id){
  const t=state.tasks.find(x=>x.id===id); if(!t)return;
  if(t.requiresApproval){t.status="pending"} else {t.status="approved";t.approvedAt=Date.now()}
  save();
}
function approveTask(id){
  const t=state.tasks.find(x=>x.id===id); if(!t)return;
  t.status="approved";t.approvedAt=Date.now();save();
}

document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>{currentView=b.dataset.view;roomFilter="all";render()}));
document.getElementById("quickAddBtn").addEventListener("click",()=>openDialog("taskDialog"));
document.getElementById("settingsBtn").addEventListener("click",()=>openDialog("settingsDialog"));
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).close()));

document.getElementById("taskForm").addEventListener("submit", e=>{
  e.preventDefault();
  state.tasks.push({
    id:newId(),
    title:document.getElementById("taskTitle").value.trim(),
    roomId:document.getElementById("taskRoom").value,
    assigneeId:document.getElementById("taskAssignee").value,
    due:document.getElementById("taskDue").value,
    reward:Number(document.getElementById("taskReward").value||0),
    notes:document.getElementById("taskNotes").value.trim(),
    requiresApproval:document.getElementById("taskRequiresApproval").checked,
    status:"open",approvedAt:null,paid:false,createdAt:Date.now()
  });
  document.getElementById("taskForm").reset();
  document.getElementById("taskRequiresApproval").checked=true;
  document.getElementById("taskDialog").close();
  save();
});

document.getElementById("roomForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=document.getElementById("roomName").value.trim();
  if(!name)return;
  state.rooms.push({id:newId(),name,emoji:"🚪"});
  document.getElementById("roomForm").reset();
  document.getElementById("roomDialog").close();
  save();
});

document.getElementById("personForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=document.getElementById("personName").value.trim();
  if(!name)return;
  state.people.push({id:newId(),name,role:document.getElementById("personRole").value,emoji:"👤"});
  document.getElementById("personForm").reset();
  document.getElementById("personDialog").close();
  save();
});

document.getElementById("exportBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`home-helper-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("importInput").addEventListener("change",async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const imported=JSON.parse(await f.text());
    if(!imported.rooms||!imported.people||!imported.tasks)throw new Error();
    state={version:2,rooms:imported.rooms,people:imported.people,tasks:imported.tasks};
    document.getElementById("settingsDialog").close();
    save();
    alert("Backup imported and synced.");
  }catch{
    alert("That backup file could not be read.");
  }
});

document.getElementById("resetBtn").addEventListener("click",()=>{
  if(confirm("Reset ALL Home Helper data for this family? This change will sync to every phone.")){
    state=defaultState();
    document.getElementById("settingsDialog").close();
    save();
  }
});

document.getElementById("signOutBtn").addEventListener("click",async()=>{
  document.getElementById("settingsDialog").close();
  await signOut(auth);
});

function openDialog(id){
  populateTaskSelects();
  if(id==="settingsDialog"){
    document.getElementById("accountText").textContent=currentUser?.email?`Signed in as ${currentUser.email}`:"Signed in";
  }
  document.getElementById(id).showModal();
}
function friendlyDate(iso){
  if(!iso)return "";
  const d=new Date(iso+"T12:00:00");
  if(iso===todayISO())return "Today";
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const tom=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,"0")}-${String(tomorrow.getDate()).padStart(2,"0")}`;
  if(iso===tom)return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short"}).format(d);
}
function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
