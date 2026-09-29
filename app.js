import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateEmail, updatePassword
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  onSnapshot, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCP2U8qFuEJXrFtItiams-o2yS7Z8a2ILI",
  authDomain: "home-helper-770c9.firebaseapp.com",
  projectId: "home-helper-770c9",
  storageBucket: "home-helper-770c9.firebasestorage.app",
  messagingSenderId: "218281054551",
  appId: "1:218281054551:web:2d80f7f9f66b3e4e766e12"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const FAMILY_CODE_KEY = "homeHelperFamilyCodeV3";
const ACTIVE_MEMBER_KEY = "homeHelperActiveMemberV3";

let currentUser = null;
let profile = null;
let family = null;
let tasks = [];
let currentView = "home";
let personFilter = "all";
let typeFilter = "all";
let completedPersonFilter = "all";
let familyUnsub = null;
let tasksUnsub = null;
let switchingPerson = false;

function newId(prefix="id"){
  const raw = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${raw}`;
}
function makeFamilyCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for(let i=0;i<10;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function syntheticEmail(code, memberId){
  const safe = memberId.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,24);
  return `${code.toLowerCase()}.${safe}@login.homehelper.app`;
}
function money(n){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n||0));}
function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function friendlyDate(iso){
  if(!iso)return "";
  const d=new Date(iso+"T12:00:00");
  if(iso===todayISO())return "Today";
  const t=new Date();t.setDate(t.getDate()+1);
  const tom=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  if(iso===tom)return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short"}).format(d);
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function roleIsAdult(){return profile?.role==="adult";}
function meMember(){return family?.members?.find(m=>m.id===profile?.memberId);}
function member(id){return family?.members?.find(m=>m.id===id)||{id,name:"Unknown",emoji:"👤",role:"child"};}
function room(id){return family?.rooms?.find(r=>r.id===id)||{id,name:"Other",emoji:"✨"};}
function allMembers(){return family?.members||[];}

function defaultRooms(){
  return [
    {id:"kitchen",name:"Kitchen",emoji:"🍽️"},{id:"living",name:"Living Room",emoji:"🛋️"},
    {id:"bathroom",name:"Bathroom",emoji:"🛁"},{id:"mainbed",name:"Main Bedroom",emoji:"🛏️"},
    {id:"caseyroom",name:"Casey's Bedroom",emoji:"🧸"},{id:"rileyroom",name:"Riley's Bedroom",emoji:"🎮"},
    {id:"hall",name:"Hall & Stairs",emoji:"🪜"},{id:"other",name:"Other",emoji:"✨"}
  ];
}

function showLoading(){
  document.getElementById("loadingScreen").classList.remove("hidden");
  document.getElementById("gateScreen").classList.add("hidden");
  document.getElementById("appShell").classList.add("hidden");
}
function showGate(html){
  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("gateScreen").classList.remove("hidden");
  document.getElementById("gateCard").innerHTML=html;
}
function showApp(){
  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("gateScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  const m=meMember();
  document.getElementById("profileBtn").textContent=m?.emoji||(roleIsAdult()?"🧑":"🙂");
  render();
}
function setSync(text,cls=""){
  const b=document.getElementById("syncBadge"); if(!b)return;
  b.textContent=text;b.className=`sync-badge ${cls}`.trim();
}

function gateWelcome(){
  const remembered=localStorage.getItem(FAMILY_CODE_KEY);
  if(remembered){loadFamilyLogin(remembered).catch(()=>gateStart());return;}
  gateStart();
}
function gateStart(){
  showGate(`
    <div class="gate-logo">🏠</div><p class="eyebrow">Welcome</p><h1>Home Helper</h1>
    <p class="muted">Choose how you want to start on this phone.</p>
    <button class="primary full" id="joinFamilyBtn">Use my family code</button>
    <button class="secondary full" id="newFamilyBtn">Create a new family</button>`);
  document.getElementById("joinFamilyBtn").onclick=gateEnterCode;
  document.getElementById("newFamilyBtn").onclick=gateCreateFamily;
}
function gateEnterCode(){
  showGate(`
    <button class="back-btn" id="backGate">← Back</button><p class="eyebrow">Link this phone</p><h2>Enter family code</h2>
    <p class="muted">You only need to do this once on each new phone.</p>
    <form id="codeForm"><input class="code-box" id="familyCodeInput" autocomplete="off" autocapitalize="characters" maxlength="10" placeholder="XXXXXXXXXX" required>
    <div class="gate-error" id="codeError"></div><button class="primary full" type="submit">Continue</button></form>`);
  document.getElementById("backGate").onclick=gateStart;
  document.getElementById("codeForm").onsubmit=async e=>{
    e.preventDefault();
    const code=document.getElementById("familyCodeInput").value.trim().toUpperCase();
    try{await loadFamilyLogin(code);}catch{document.getElementById("codeError").textContent="That family code could not be found.";}
  };
}
function gateCreateFamily(){
  showGate(`
    <button class="back-btn" id="backGate">← Back</button><p class="eyebrow">New household</p><h2>Create Home Helper</h2>
    <form id="createFamilyForm">
      <label>Your name<input id="createParentName" required maxlength="40" placeholder="e.g. Mum"></label>
      <label>Choose your 6-digit PIN<input id="createParentPin" type="password" class="pin-input" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="••••••"></label>
      <div class="gate-error" id="createFamilyError"></div><button class="primary full" type="submit">Create family</button>
    </form>`);
  document.getElementById("backGate").onclick=gateStart;
  document.getElementById("createFamilyForm").onsubmit=createFamilyFromScratch;
}
async function createFamilyFromScratch(e){
  e.preventDefault();
  const name=document.getElementById("createParentName").value.trim();
  const pin=document.getElementById("createParentPin").value;
  const err=document.getElementById("createFamilyError");
  if(!/^\d{6}$/.test(pin)){err.textContent="Use a 6-digit PIN.";return;}
  err.textContent="Creating…";
  const code=makeFamilyCode(), familyId=newId("family"), memberId=newId("member"), email=syntheticEmail(code,memberId);
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pin), uid=cred.user.uid;
    const parentMember={id:memberId,name,role:"adult",emoji:"🧑",linked:true,uid,loginEmail:email};
    await setDoc(doc(db,"families",familyId),{name:"Our Home",code,ownerUid:uid,rooms:defaultRooms(),members:[parentMember],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await setDoc(doc(db,"users",uid),{familyId,memberId,role:"adult",name});
    await setDoc(doc(db,"familyCodes",code),{familyId,ownerUid:uid,members:[publicMember(parentMember)]});
    localStorage.setItem(FAMILY_CODE_KEY,code);localStorage.setItem(ACTIVE_MEMBER_KEY,memberId);
  }catch(ex){console.error(ex);err.textContent=humanAuthError(ex);}
}

async function loadFamilyLogin(code){
  showLoading();
  const snap=await getDoc(doc(db,"familyCodes",code));if(!snap.exists())throw new Error("Not found");
  const data=snap.data(), people=data.members||[];
  localStorage.setItem(FAMILY_CODE_KEY,code);
  showGate(`
    <div class="gate-logo">🏠</div><p class="eyebrow">Home Helper</p><h2>Who are you?</h2><p class="muted">Tap your name, then enter your PIN.</p>
    <div class="login-grid">${people.map(m=>`<button class="person-login" data-login-id="${escapeHtml(m.id)}"><span>${m.emoji||"👤"}</span>${escapeHtml(m.name)}</button>`).join("")}</div>
    <button class="secondary full" id="differentCodeBtn">Use a different family code</button>`);
  document.querySelectorAll("[data-login-id]").forEach(btn=>btn.onclick=()=>gatePin(code,data.familyId,people.find(m=>m.id===btn.dataset.loginId)));
  document.getElementById("differentCodeBtn").onclick=()=>{localStorage.removeItem(FAMILY_CODE_KEY);gateEnterCode();};
}
function gatePin(code,familyId,m){
  showGate(`
    <button class="back-btn" id="backPeople">← Back</button><div class="gate-logo">${m.emoji||"👤"}</div>
    <p class="eyebrow">${escapeHtml(m.role==="adult"?"Adult account":"Child account")}</p><h2>${escapeHtml(m.name)}</h2>
    <form id="pinForm"><label>Enter your 6-digit PIN<input id="loginPin" type="password" class="pin-input" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required autofocus placeholder="••••••"></label><p class="tiny-note">If this is your first sign-in, the PIN you enter now will become your PIN.</p>
    <div class="gate-error" id="pinError"></div><button class="primary full" type="submit">Open Home Helper</button></form>`);
  document.getElementById("backPeople").onclick=()=>loadFamilyLogin(code);
  document.getElementById("pinForm").onsubmit=async e=>{
    e.preventDefault();
    const pin=document.getElementById("loginPin").value,msg=document.getElementById("pinError");
    if(!/^\d{6}$/.test(pin)){msg.textContent="Use a 6-digit PIN.";return;}
    msg.textContent="Signing in…";
    const email=syntheticEmail(code,m.id);
    let secondApp=null;
    try{
      const secondaryName=`firstpin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      secondApp=initializeApp(firebaseConfig,secondaryName);
      const secondAuth=getAuth(secondApp);
      const secondDb=getFirestore(secondApp);
      try{
        const cred=await createUserWithEmailAndPassword(secondAuth,email,pin);
        await setDoc(doc(secondDb,"users",cred.user.uid),{familyId,memberId:m.id,role:m.role,name:m.name,familyCode:code});
        await signOut(secondAuth);
      }catch(ex){
        if(ex?.code!=="auth/email-already-in-use") throw ex;
      }finally{
        try{if(secondApp)await deleteApp(secondApp);}catch{}
      }
      switchingPerson=false;
      await signInWithEmailAndPassword(auth,email,pin);
      localStorage.setItem(ACTIVE_MEMBER_KEY,m.id);
    }catch(ex){
      console.error(ex);
      msg.textContent=ex?.code==="auth/invalid-credential"?"That PIN is not correct.":"Could not set or use that PIN. Try again.";
    }
  };
}

async function upgradeExistingV2(user){
  showGate(`
    <div class="gate-logo">✨</div><p class="eyebrow">One-time upgrade</p><h2>Set up your family login</h2>
    <p class="muted">Your old Home Helper account is signed in. We can convert it to the new pick-your-name + PIN system.</p>
    <form id="upgradeForm"><label>Your name<input id="upgradeName" required maxlength="40" placeholder="e.g. Mum"></label>
    <label>Choose a 6-digit PIN<input id="upgradePin" type="password" class="pin-input" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="••••••"></label>
    <div class="gate-error" id="upgradeError"></div><button class="primary full" type="submit">Upgrade Home Helper</button></form>`);
  document.getElementById("upgradeForm").onsubmit=async e=>{
    e.preventDefault();const name=document.getElementById("upgradeName").value.trim(),pin=document.getElementById("upgradePin").value,msg=document.getElementById("upgradeError");
    if(!/^\d{6}$/.test(pin)){msg.textContent="Use a 6-digit PIN.";return;}msg.textContent="Upgrading…";
    try{await migrateV2(user,name,pin);}catch(ex){console.error(ex);msg.textContent=ex?.code==="auth/requires-recent-login"?"Firebase needs a fresh sign-in before changing this account. Sign out, sign back into the old version once, then reopen this page.":`Upgrade stopped: ${ex.message||ex.code||"unknown error"}`;}
  };
}
async function migrateV2(user,parentName,pin){
  const code=makeFamilyCode(),familyId=newId("family");
  const oldSnap=await getDoc(doc(db,"homes",user.uid)),old=oldSnap.exists()?oldSnap.data():{};
  const oldPeople=Array.isArray(old.people)?old.people:[],oldRooms=Array.isArray(old.rooms)&&old.rooms.length?old.rooms:defaultRooms(),oldTasks=Array.isArray(old.tasks)?old.tasks:[];
  const parentOld=oldPeople.find(p=>p.role==="adult")||oldPeople.find(p=>p.id==="parent"),parentId=parentOld?.id||newId("member"),email=syntheticEmail(code,parentId);

  // Create a brand-new PIN login instead of changing the legacy account.
  // This avoids Firebase's recent-login requirement for changing passwords/emails.
  const secondaryName=`migration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secondApp=initializeApp(firebaseConfig,secondaryName);
  const secondAuth=getAuth(secondApp);
  let newUid;
  try{
    const cred=await createUserWithEmailAndPassword(secondAuth,email,pin);
    newUid=cred.user.uid;
    await signOut(secondAuth);
  }finally{
    try{await deleteApp(secondApp);}catch{}
  }

  const members=[{id:parentId,name:parentName,role:"adult",emoji:"🧑",linked:true,uid:newUid,loginEmail:email}];
  for(const p of oldPeople){
    if(p.id===parentId)continue;
    members.push({id:p.id||newId("member"),name:p.name||"Family member",role:p.role==="adult"?"adult":"child",emoji:p.emoji||"👤",linked:false,uid:null,loginEmail:null});
  }

  // Create the family under the legacy signed-in user, temporarily make it an adult,
  // then create the real PIN profile and remove the legacy user's Firestore access.
  await setDoc(doc(db,"families",familyId),{name:"Our Home",code,ownerUid:user.uid,rooms:oldRooms,members,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await setDoc(doc(db,"users",user.uid),{familyId,memberId:parentId,role:"adult",name:parentName});
  await setDoc(doc(db,"familyCodes",code),{familyId,ownerUid:user.uid,members:[publicMember(members[0])]});
  await setDoc(doc(db,"users",newUid),{familyId,memberId:parentId,role:"adult",name:parentName});

  if(oldTasks.length){
    const batch=writeBatch(db);
    for(const t of oldTasks){
      const id=t.id||newId("task");
      batch.set(doc(db,"families",familyId,"tasks",id),{
        id,title:t.title||"Job",taskType:"cleaning",roomId:t.roomId||"other",
        assigneeMemberId:t.assigneeId||parentId,
        createdByUid:user.uid,createdByMemberId:parentId,createdByName:parentName,
        dueDate:t.due||"",dueTime:"",reward:Number(t.reward||0),notes:t.notes||"",
        status:t.status==="pending"?"pending":t.status==="approved"?"approved":"open",
        completedAt:t.status==="pending"||t.status==="approved"?(t.approvedAt||Date.now()):null,
        approvedAt:t.status==="approved"?(t.approvedAt||Date.now()):null,
        paid:Boolean(t.paid),
        notifyAssigned:true,notifyDueDay:true,notifyOneHour:true,
        notificationAssignedSent:false,notificationDueDaySent:false,notificationOneHourSent:false,
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
    }
    await batch.commit();
  }

  await updateDoc(doc(db,"families",familyId),{ownerUid:newUid,updatedAt:serverTimestamp()});
  await updateDoc(doc(db,"familyCodes",code),{ownerUid:newUid,members:[publicMember(members[0])]});

  localStorage.setItem(FAMILY_CODE_KEY,code);
  localStorage.setItem(ACTIVE_MEMBER_KEY,parentId);

  // Remove legacy Firestore privileges, then switch the browser to the new PIN login.
  await deleteDoc(doc(db,"users",user.uid));
  switchingPerson=false;
  await signOut(auth);
  await signInWithEmailAndPassword(auth,email,pin);
}
function publicMember(m){return{id:m.id,name:m.name,role:m.role,emoji:m.emoji||"👤"};}
function humanAuthError(ex){const map={"auth/email-already-in-use":"That login already exists. Try again.","auth/weak-password":"Use a 6-digit PIN.","auth/operation-not-allowed":"Email/password sign-in needs enabling in Firebase Authentication.","auth/network-request-failed":"There is a network problem. Try again."};return map[ex?.code]||ex?.message||"Something went wrong.";}

onAuthStateChanged(auth,async user=>{
  stopRealtime();currentUser=user;profile=null;family=null;tasks=[];
  if(!user){if(switchingPerson){switchingPerson=false;const c=localStorage.getItem(FAMILY_CODE_KEY);if(c)return loadFamilyLogin(c);}gateWelcome();return;}
  showLoading();
  try{
    const pSnap=await getDoc(doc(db,"users",user.uid));
    if(!pSnap.exists()){await upgradeExistingV2(user);return;}
    profile=pSnap.data();localStorage.setItem(ACTIVE_MEMBER_KEY,profile.memberId);await startRealtime();
  }catch(ex){console.error(ex);showGate(`<div class="gate-logo">⚠️</div><h2>Home Helper could not open</h2><p class="muted">${escapeHtml(ex.message||"Unknown error")}</p><button class="secondary full" id="retryBtn">Try again</button>`);document.getElementById("retryBtn").onclick=()=>location.reload();}
});

async function startRealtime(){
  const famRef=doc(db,"families",profile.familyId),initial=await getDoc(famRef);if(!initial.exists())throw new Error("Family data is missing.");
  family={id:initial.id,...initial.data()};
  familyUnsub=onSnapshot(famRef,snap=>{if(!snap.exists())return;family={id:snap.id,...snap.data()};setSync("Synced","ok");if(!document.getElementById("appShell").classList.contains("hidden"))render();},()=>setSync("Sync error","err"));
  tasksUnsub=onSnapshot(collection(db,"families",profile.familyId,"tasks"),snap=>{tasks=snap.docs.map(d=>({id:d.id,...d.data()}));tasks.sort((a,b)=>`${a.dueDate||"9999"} ${a.dueTime||"23:59"}`.localeCompare(`${b.dueDate||"9999"} ${b.dueTime||"23:59"}`));setSync("Synced","ok");showApp();},()=>{setSync("Sync error","err");showApp();});
}
function stopRealtime(){if(familyUnsub){familyUnsub();familyUnsub=null;}if(tasksUnsub){tasksUnsub();tasksUnsub=null;}}

function render(){
  if(!family||!profile)return;
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===currentView));
  const app=document.getElementById("app");
  if(currentView==="home")app.innerHTML=renderHome();
  if(currentView==="jobs")app.innerHTML=renderJobs();
  if(currentView==="completed")app.innerHTML=renderCompleted();
  if(currentView==="family")app.innerHTML=renderFamily();
  if(currentView==="rewards")app.innerHTML=renderRewards();
  wireDynamic();populateTaskForm();
}
function myOpenTasks(){return tasks.filter(t=>t.assigneeMemberId===profile.memberId&&t.status==="open");}
function pendingTasks(){return tasks.filter(t=>t.status==="pending");}
function unpaidTotal(memberId){return tasks.filter(t=>t.assigneeMemberId===memberId&&t.status==="approved"&&!t.paid).reduce((s,t)=>s+Number(t.reward||0),0);}
function renderHome(){
  const my=meMember(),myOpen=myOpenTasks().length,waiting=roleIsAdult()?pendingTasks().length:tasks.filter(t=>t.assigneeMemberId===profile.memberId&&t.status==="pending").length;
  const reward=roleIsAdult()?allMembers().filter(m=>m.role==="child").reduce((s,m)=>s+unpaidTotal(m.id),0):unpaidTotal(profile.memberId);
  const recent=roleIsAdult()?tasks.filter(t=>t.status==="open").slice(0,5):tasks.filter(t=>t.assigneeMemberId===profile.memberId&&t.status==="open").slice(0,5);
  return `<section class="hero"><p class="eyebrow" style="color:#cbd5e1">${roleIsAdult()?"Adult account":"My account"}</p><h2>Hi ${escapeHtml(my?.name||profile.name||"there")}</h2><p>${roleIsAdult()?"See everyone's jobs without digging through one long list.":"Your jobs and requests are all in one place."}</p><div class="hero-stats"><div class="stat"><strong>${myOpen}</strong><span>My open jobs</span></div><div class="stat"><strong>${waiting}</strong><span>${roleIsAdult()?"Need approval":"Waiting approval"}</span></div><div class="stat"><strong>${money(reward)}</strong><span>${roleIsAdult()?"To pay":"My rewards"}</span></div></div></section>${roleIsAdult()?renderQuickPeople():""}<div class="section-head"><h2>${roleIsAdult()?"Next household jobs":"My next jobs"}</h2><button class="link-btn" data-action="openTask">+ Add</button></div><div class="cards">${recent.length?recent.map(renderTaskCard).join(""):`<div class="empty">Nothing waiting here.</div>`}</div>`;
}
function renderQuickPeople(){return `<div class="section-head"><h2>Jump to a person</h2></div><div class="person-tabs">${allMembers().map(m=>`<button class="chip" data-action="jumpPerson" data-id="${m.id}">${m.emoji||"👤"} ${escapeHtml(m.name)} (${tasks.filter(t=>t.assigneeMemberId===m.id&&t.status==="open").length})</button>`).join("")}</div>`;}
function personTabs(active,action){
  const all=`<button class="chip ${active==="all"?"active":""}" data-action="${action}" data-id="all">Everyone</button>`;
  return `<div class="person-tabs">${roleIsAdult()?all:""}${allMembers().map(m=>`<button class="chip ${active===m.id?"active":""}" data-action="${action}" data-id="${m.id}">${m.emoji||"👤"} ${escapeHtml(m.name)}</button>`).join("")}</div>`;
}
function typeTabs(){return `<div class="filter-row"><button class="chip ${typeFilter==="all"?"active":""}" data-action="filterType" data-id="all">All</button><button class="chip ${typeFilter==="cleaning"?"active":""}" data-action="filterType" data-id="cleaning">🧹 Cleaning</button><button class="chip ${typeFilter==="general"?"active":""}" data-action="filterType" data-id="general">🔧 General</button></div>`;}
function renderJobs(){
  if(!roleIsAdult()&&personFilter==="all")personFilter=profile.memberId;
  let list=tasks.filter(t=>t.status==="open");if(personFilter!=="all")list=list.filter(t=>t.assigneeMemberId===personFilter);if(typeFilter!=="all")list=list.filter(t=>t.taskType===typeFilter);
  return `<div class="section-head"><h2>Active jobs</h2><button class="link-btn" data-action="openTask">+ Add</button></div>${personTabs(personFilter,"filterPerson")}${typeTabs()}<div class="cards">${list.length?list.map(renderTaskCard).join(""):`<div class="empty">No active jobs in this view.</div>`}</div>`;
}
function renderCompleted(){
  if(!roleIsAdult())completedPersonFilter=profile.memberId;
  let list=tasks.filter(t=>t.status==="pending");if(completedPersonFilter!=="all")list=list.filter(t=>t.assigneeMemberId===completedPersonFilter);
  return `<div class="section-head"><h2>${roleIsAdult()?"Completed – needs approval":"Waiting for approval"}</h2></div><p class="muted">${roleIsAdult()?"Work down this list and approve each finished job.":"Jobs you finish stay here until an adult approves them."}</p>${personTabs(completedPersonFilter,"filterCompletedPerson")}<div class="cards">${list.length?list.map(renderTaskCard).join(""):`<div class="empty">Nothing waiting for approval.</div>`}</div>`;
}
function renderFamily(){
  const memberCards=allMembers().map(m=>`<article class="card member-row"><div class="member-avatar">${m.emoji||"👤"}</div><div class="member-main"><strong>${escapeHtml(m.name)}</strong><div class="meta">${m.role==="adult"?"Adult":"Child"} · PIN chosen on first sign-in</div></div></article>`).join("");
  return `<div class="section-head"><h2>Family</h2>${roleIsAdult()?`<button class="link-btn" data-action="newMember">+ Add person</button>`:""}</div><div class="cards">${memberCards}</div><div class="section-head"><h2>Rooms</h2>${roleIsAdult()?`<button class="link-btn" data-action="newRoom">+ Add room</button>`:""}</div><div class="room-grid">${(family.rooms||[]).map(r=>`<div class="card room-tile"><span class="room-emoji">${r.emoji||"🚪"}</span><strong>${escapeHtml(r.name)}</strong></div>`).join("")}</div>`;
}
function renderRewards(){
  if(!roleIsAdult()){
    const mine=tasks.filter(t=>t.assigneeMemberId===profile.memberId&&t.status==="approved"&&!t.paid);
    return `<section class="hero"><p class="eyebrow" style="color:#cbd5e1">My rewards</p><h2>${money(unpaidTotal(profile.memberId))}</h2><p>Approved and waiting to be paid.</p></section><div class="cards">${mine.length?mine.map(renderTaskCard).join(""):`<div class="empty">No unpaid rewards yet.</div>`}</div>`;
  }
  const kids=allMembers().filter(m=>m.role==="child");
  return `<section class="hero"><p class="eyebrow" style="color:#cbd5e1">Rewards</p><h2>${money(kids.reduce((s,m)=>s+unpaidTotal(m.id),0))} to pay</h2><p>Only adult-approved jobs count.</p></section><div class="cards">${kids.map(m=>{const total=unpaidTotal(m.id),count=tasks.filter(t=>t.assigneeMemberId===m.id&&t.status==="approved"&&!t.paid).length;return `<article class="card"><div class="paid-row"><div><strong>${m.emoji||"👤"} ${escapeHtml(m.name)}</strong><div class="meta">${count} approved job${count===1?"":"s"}</div></div><div class="money">${money(total)}</div></div>${total>0?`<button class="primary full" data-action="markPaid" data-id="${m.id}">Mark ${money(total)} as paid</button>`:`<div class="meta" style="margin-top:10px">Nothing to pay.</div>`}</article>`;}).join("")}</div>`;
}
function renderTaskCard(t){
  const assignee=member(t.assigneeMemberId),req=member(t.createdByMemberId),r=t.taskType==="cleaning"?room(t.roomId):null,canComplete=t.status==="open"&&(roleIsAdult()||t.assigneeMemberId===profile.memberId);
  return `<article class="card task-card"><div><div class="task-title">${escapeHtml(t.title)}</div><div class="meta">${assignee.emoji||"👤"} ${escapeHtml(assignee.name)}${r?` · ${r.emoji||"🚪"} ${escapeHtml(r.name)}`:""}</div><div class="meta">Requested by ${escapeHtml(t.createdByName||req.name||"Family")}${t.dueDate?` · Due ${friendlyDate(t.dueDate)}${t.dueTime?` at ${t.dueTime}`:""}`:""}</div><div class="badges"><span class="badge ${t.taskType==="general"?"general":"cleaning"}">${t.taskType==="general"?"🔧 General":"🧹 Cleaning"}</span>${Number(t.reward)>0?`<span class="badge reward">${money(t.reward)}</span>`:""}${t.status==="pending"?`<span class="badge">Waiting approval</span>`:""}${t.status==="approved"?`<span class="badge">${t.paid?"Paid":"Approved"}</span>`:""}</div>${t.notes?`<p class="meta" style="margin:9px 0 0">${escapeHtml(t.notes)}</p>`:""}<div class="task-actions">${canComplete?`<button class="small-btn done-btn" data-action="completeTask" data-id="${t.id}">✓ Done</button>`:""}${roleIsAdult()&&t.status==="pending"?`<button class="small-btn approve-btn" data-action="approveTask" data-id="${t.id}">Approve</button><button class="small-btn reopen-btn" data-action="reopenTask" data-id="${t.id}">Return to do</button>`:""}${roleIsAdult()?`<button class="small-btn delete-btn" data-action="deleteTask" data-id="${t.id}">Delete</button>`:""}</div></div><div style="font-size:26px">${t.taskType==="general"?"🔧":"🧹"}</div></article>`;
}

function populateTaskForm(){
  const roomSel=document.getElementById("taskRoom"),assigneeSel=document.getElementById("taskAssignee");
  if(roomSel)roomSel.innerHTML=(family.rooms||[]).map(r=>`<option value="${r.id}">${r.emoji||"🚪"} ${escapeHtml(r.name)}</option>`).join("");
  if(assigneeSel)assigneeSel.innerHTML=allMembers().map(m=>`<option value="${m.id}">${m.emoji||"👤"} ${escapeHtml(m.name)}</option>`).join("");
  const due=document.getElementById("taskDue");if(due&&!due.value)due.value=todayISO();
  document.getElementById("rewardField")?.classList.toggle("hidden",!roleIsAdult());
}
function wireDynamic(){
  document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",async()=>{
    const a=el.dataset.action,id=el.dataset.id;
    if(a==="openTask")openTaskDialog();if(a==="jumpPerson"){personFilter=id;currentView="jobs";render();}if(a==="filterPerson"){personFilter=id;render();}if(a==="filterCompletedPerson"){completedPersonFilter=id;render();}if(a==="filterType"){typeFilter=id;render();}
    if(a==="completeTask")await completeTask(id);if(a==="approveTask")await approveTask(id);if(a==="reopenTask")await reopenTask(id);if(a==="deleteTask")await deleteTaskAction(id);if(a==="markPaid")await markPaid(id);if(a==="newMember")openMemberDialog();if(a==="newRoom")document.getElementById("roomDialog").showModal();
  }));
}
async function completeTask(id){await updateDoc(doc(db,"families",profile.familyId,"tasks",id),{status:"pending",completedAt:Date.now(),updatedAt:serverTimestamp()});}
async function approveTask(id){await updateDoc(doc(db,"families",profile.familyId,"tasks",id),{status:"approved",approvedAt:Date.now(),updatedAt:serverTimestamp()});}
async function reopenTask(id){await updateDoc(doc(db,"families",profile.familyId,"tasks",id),{status:"open",completedAt:null,approvedAt:null,updatedAt:serverTimestamp()});}
async function deleteTaskAction(id){if(confirm("Delete this job?"))await deleteDoc(doc(db,"families",profile.familyId,"tasks",id));}
async function markPaid(memberId){
  const toPay=tasks.filter(t=>t.assigneeMemberId===memberId&&t.status==="approved"&&!t.paid);if(!toPay.length)return;
  if(!confirm(`Mark ${money(toPay.reduce((s,t)=>s+Number(t.reward||0),0))} as paid?`))return;
  const batch=writeBatch(db);toPay.forEach(t=>batch.update(doc(db,"families",profile.familyId,"tasks",t.id),{paid:true,paidAt:Date.now(),updatedAt:serverTimestamp()}));await batch.commit();
}
function openTaskDialog(){
  populateTaskForm();document.getElementById("taskForm").reset();document.querySelector('input[name="taskType"][value="cleaning"]').checked=true;document.getElementById("roomField").classList.remove("hidden");document.getElementById("taskDue").value=todayISO();document.getElementById("notifyAssigned").checked=true;document.getElementById("notifyDueDay").checked=true;document.getElementById("notifyOneHour").checked=true;document.getElementById("rewardField").classList.toggle("hidden",!roleIsAdult());document.getElementById("taskDialog").showModal();
}
document.querySelectorAll('input[name="taskType"]').forEach(r=>r.addEventListener("change",()=>document.getElementById("roomField").classList.toggle("hidden",document.querySelector('input[name="taskType"]:checked').value!=="cleaning")));
document.getElementById("taskForm").addEventListener("submit",async e=>{
  e.preventDefault();const type=document.querySelector('input[name="taskType"]:checked').value,id=newId("task");
  const payload={id,title:document.getElementById("taskTitle").value.trim(),taskType:type,roomId:type==="cleaning"?document.getElementById("taskRoom").value:"",assigneeMemberId:document.getElementById("taskAssignee").value,createdByUid:currentUser.uid,createdByMemberId:profile.memberId,createdByName:meMember()?.name||profile.name||"Family",dueDate:document.getElementById("taskDue").value||"",dueTime:document.getElementById("taskTime").value||"",reward:roleIsAdult()?Number(document.getElementById("taskReward").value||0):0,notes:document.getElementById("taskNotes").value.trim(),status:"open",completedAt:null,approvedAt:null,paid:false,notifyAssigned:document.getElementById("notifyAssigned").checked,notifyDueDay:document.getElementById("notifyDueDay").checked,notifyOneHour:document.getElementById("notifyOneHour").checked,notificationAssignedSent:false,notificationDueDaySent:false,notificationOneHourSent:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  try{await setDoc(doc(db,"families",profile.familyId,"tasks",id),payload);document.getElementById("taskDialog").close();}catch(ex){alert(`Could not add job: ${ex.message}`);}
});

function openMemberDialog(){
  if(!roleIsAdult())return;
  document.getElementById("memberName").value="";
  document.getElementById("memberRole").value="child";
  document.getElementById("memberDialogTitle").textContent="Add a person";
  document.getElementById("memberSaveBtn").textContent="Add person";
  document.getElementById("memberDialog").showModal();
}
document.getElementById("memberForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!roleIsAdult())return;
  const name=document.getElementById("memberName").value.trim();
  const role=document.getElementById("memberRole").value;
  if(!name)return;
  if(allMembers().some(m=>m.name.toLowerCase()===name.toLowerCase())){alert("That name is already in the family.");return;}
  const newMember={id:newId("member"),name,role,emoji:role==="adult"?"🧑":"🙂",linked:false,uid:null,loginEmail:null};
  const newMembers=[...allMembers(),newMember];
  try{
    await updateDoc(doc(db,"families",profile.familyId),{members:newMembers,updatedAt:serverTimestamp()});
    await updateDoc(doc(db,"familyCodes",family.code),{members:newMembers.map(publicMember)});
    document.getElementById("memberForm").reset();
    document.getElementById("memberDialog").close();
  }catch(ex){
    console.error(ex);
    alert("Could not add that person. Try again.");
  }
});
document.getElementById("roomForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!roleIsAdult())return;const name=document.getElementById("roomName").value.trim();if(!name)return;if((family.rooms||[]).some(r=>r.name.toLowerCase()===name.toLowerCase())){alert("That room already exists.");return;}
  const rooms=[...(family.rooms||[]),{id:newId("room"),name,emoji:"🚪"}];await updateDoc(doc(db,"families",profile.familyId),{rooms,updatedAt:serverTimestamp()});document.getElementById("roomForm").reset();document.getElementById("roomDialog").close();
});

document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>{currentView=b.dataset.view;render();}));
document.getElementById("quickAddBtn").addEventListener("click",openTaskDialog);
document.getElementById("profileBtn").addEventListener("click",()=>{const m=meMember();document.getElementById("profileName").textContent=m?.name||profile.name||"Home Helper";document.getElementById("profileRole").textContent=roleIsAdult()?"Adult account":"Child account";document.getElementById("familyCodeText").textContent=`Family code: ${family.code}`;document.getElementById("profileDialog").showModal();});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).close()));
document.getElementById("copyFamilyCodeBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(family.code);alert("Family code copied.");}catch{prompt("Copy this family code:",family.code);}});
document.getElementById("switchPersonBtn").addEventListener("click",async()=>{document.getElementById("profileDialog").close();switchingPerson=true;await signOut(auth);});
document.getElementById("signOutBtn").addEventListener("click",async()=>{document.getElementById("profileDialog").close();localStorage.removeItem(ACTIVE_MEMBER_KEY);switchingPerson=false;await signOut(auth);});

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
