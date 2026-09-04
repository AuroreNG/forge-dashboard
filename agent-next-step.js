const SUPABASE_FUNCTION_BASE = "https://czqdmrkjqdnzjmvjslmr.supabase.co/functions/v1";
const STATES = {
AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};
const $=id=>document.getElementById(id);
const views=["loadingView","errorView","stateView","nextView"];
let token="", payload=null;
function show(id){views.forEach(v=>$(v).classList.toggle("hidden",v!==id))}
function applyBrand(b={}){
  const card=$("appCard");
  const name=String(b.name||"FORGE");
  const lower=name.toLowerCase();
  const isApex=lower.includes("apex");
  const isBizzall=lower.includes("bizzall");

  const palette=isApex
    ? {primary:"#067647",deep:"#034d32",accent:"#18a566",soft:"#eefbf4"}
    : isBizzall
      ? {primary:"#062d6f",deep:"#031c48",accent:"#2e7df6",soft:"#eef5ff"}
      : {primary:b.primary||"#0a2b59",deep:b.deep||b.primary||"#061a38",accent:b.accent||"#3f8cff",soft:b.soft||"#eef5ff"};

  card.style.setProperty("--primary",palette.primary);
  card.style.setProperty("--deep",palette.deep);
  card.style.setProperty("--accent",palette.accent);
  card.style.setProperty("--soft",palette.soft);

  document.body.dataset.org=isApex?"apex":isBizzall?"bizzall":"default";

  $("orgName").textContent=name;
  $("orgTagline").textContent=isApex
    ? "BUILD • PROTECT • CREATE LEGACY"
    : isBizzall
      ? "PEOPLE • OPPORTUNITY • REAL RESULTS"
      : "";

  $("footerOrg").textContent=name;
}
async function api(action,body={}){
  const r=await fetch(`${SUPABASE_FUNCTION_BASE}/agent-next-step`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,token,...body})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.ok===false) throw new Error(data.error||"Unable to continue.");
  return data;
}
function render(data){
  payload=data; applyBrand(data.brand||{});
  $("agentName").textContent=data.agent?.firstName||data.agent?.name||"Agent";
  $("agentState").textContent=STATES[data.agent?.residentState]||data.agent?.residentState||"—";
  if(data.needsState){show("stateView");return}
  const n=data.nextStep||{};
  $("nextEyebrow").textContent=n.eyebrow||"YOUR NEXT STEP";
  $("nextTitle").textContent=n.title||"Keep moving forward";
  $("nextText").textContent=n.text||"Complete your next licensing step.";
  $("nextActionBtn").textContent="";
  $("nextActionBtn").append(document.createTextNode(n.button||"CONTINUE"));
  const arrow=document.createElement("span");arrow.textContent="→";$("nextActionBtn").append(arrow);
  $("nextActionBtn").href=n.url||"#";
  $("progressLabel").textContent=n.progressLabel||"In progress";
  $("progressBar").style.width=`${Math.max(0,Math.min(100,n.progress||0))}%`;
  show("nextView");
}
async function init(){
  const params=new URLSearchParams(location.search); token=params.get("t")||"";
  if(!token){$("errorText").textContent="This secure link is missing its access token. Please use the link from your latest FORGE message.";show("errorView");return}
  try{render(await api("get"))}catch(e){$("errorText").textContent=e.message;show("errorView")}
}
Object.entries(STATES).forEach(([v,n])=>{const o=document.createElement("option");o.value=v;o.textContent=n;$("residentState").append(o)});
$("residentState").addEventListener("change",e=>$("saveStateBtn").disabled=!e.target.value);
$("saveStateBtn").addEventListener("click",async()=>{
  const state=$("residentState").value;if(!state)return;
  $("saveStateBtn").disabled=true;$("saveStateBtn").textContent="SAVING…";
  try{render(await api("set_state",{residentState:state}))}catch(e){$("errorText").textContent=e.message;show("errorView")}
});
init();