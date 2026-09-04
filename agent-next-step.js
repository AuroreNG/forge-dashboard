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

/* ==========================================================
   FORGE LICENSED WORKSPACE + E&O CERTIFICATE REQUEST
========================================================== */
let forgePublicAgentData = null;

function forgeStageName(payload){
  return String(
    payload?.agent?.stage ||
    payload?.stage ||
    payload?.nextStep?.stage ||
    ""
  ).trim();
}

function forgeAgentCode(payload){
  return String(
    payload?.agent?.code ||
    payload?.agent?.agentCode ||
    payload?.agent?.agent_code ||
    ""
  ).trim();
}

function forgeFriendlyDate(value){
  if(!value) return "";
  const d=new Date(`${value}T12:00:00`);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
}

function forgeEoEmailText(){
  const name=$("eoAgentName")?.value?.trim() || forgePublicAgentData?.agent?.name || "Agent";
  const code=$("eoAgentCode")?.value?.trim() || forgeAgentCode(forgePublicAgentData) || "Pending";
  const date=forgeFriendlyDate($("eoPurchaseDate")?.value) || "[purchase date]";
  return `Hello,

${name} (Agent Code: ${code}) has purchased Errors & Omissions (E&O) coverage on ${date}.

Could you please send the E&O certificate so the agent can complete the remaining contracting requirements?

Agent Name: ${name}
Agent Code: ${code}
E&O Purchase Date: ${date}

Proof of payment is attached for reference.

Thank you.`;
}

function forgeRefreshEoPreview(){
  const name=$("eoAgentName")?.value?.trim() || forgePublicAgentData?.agent?.name || "Agent";
  const code=$("eoAgentCode")?.value?.trim() || forgeAgentCode(forgePublicAgentData) || "Pending";
  if($("eoSubjectPreview")) $("eoSubjectPreview").textContent=`E&O Certificate Request | ${name} | ${code}`;
  if($("eoBodyPreview")) $("eoBodyPreview").textContent=forgeEoEmailText();
}

function forgeApplyStageWorkspace(payload){
  forgePublicAgentData=payload;
  const stage=forgeStageName(payload);
  const licensed=stage.toLowerCase()==="licensed" ||
    String(payload?.nextStep?.title||"").toLowerCase().includes("complete contracting");
  const contracted=stage.toLowerCase()==="contracted" ||
    Number(payload?.nextStep?.progress)===100;

  $("licensedWorkspace")?.classList.toggle("hidden",!licensed);
  $("contractedExpansion")?.classList.toggle("hidden",!contracted);

  if(licensed){
    if($("nextStep")) $("nextStep").classList.add("hidden");
    const name=payload?.agent?.name || payload?.agent?.firstName || "Agent";
    const code=forgeAgentCode(payload);
    if($("eoAgentName")) $("eoAgentName").value=name;
    if($("eoAgentCode")) $("eoAgentCode").value=code || "Pending";
    forgeRefreshEoPreview();
  }
}

$("openEoRequestBtn")?.addEventListener("click",()=>{
  $("eoRequestPanel")?.classList.toggle("hidden");
  forgeRefreshEoPreview();
  setTimeout(()=>$("eoRequestPanel")?.scrollIntoView({behavior:"smooth",block:"nearest"}),50);
});

$("eoPurchaseDate")?.addEventListener("change",forgeRefreshEoPreview);
$("eoProof")?.addEventListener("change",(event)=>{
  const file=event.target.files?.[0];
  if($("eoFileName")) $("eoFileName").textContent=file ? file.name : "Choose screenshot or receipt";
});

async function forgeFileToBase64(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
    reader.onerror=()=>reject(reader.error||new Error("Could not read attachment."));
    reader.readAsDataURL(file);
  });
}

$("sendEoRequestBtn")?.addEventListener("click",async()=>{
  const btn=$("sendEoRequestBtn");
  const status=$("eoSendStatus");
  const date=$("eoPurchaseDate")?.value;
  const file=$("eoProof")?.files?.[0];

  if(!date){status.textContent="Please enter the date you purchased E&O.";return}
  if(!file){status.textContent="Please upload your E&O payment screenshot or receipt.";return}
  if(file.size>8*1024*1024){status.textContent="Please choose a file smaller than 8 MB.";return}

  try{
    btn.disabled=true;
    btn.textContent="SENDING REQUEST…";
    status.textContent="Securely sending your request…";

    const attachmentBase64=await forgeFileToBase64(file);
    const token=new URLSearchParams(location.search).get("t")||"";
    const name=$("eoAgentName")?.value?.trim()||"Agent";
    const code=$("eoAgentCode")?.value?.trim()||"Pending";

    const response=await fetch(`${FUNCTIONS_BASE}/send-eo-request`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        token,
        purchaseDate:date,
        attachmentBase64,
        attachmentName:file.name,
        attachmentType:file.type||"application/octet-stream",
        subject:`E&O Certificate Request | ${name} | ${code}`,
        message:forgeEoEmailText()
      })
    });

    const result=await response.json().catch(()=>({}));
    if(!response.ok || !result?.ok) throw new Error(result?.error||"Request could not be sent.");

    status.textContent="✓ E&O certificate request sent successfully.";
    btn.textContent="REQUEST SENT ✓";
  }catch(error){
    console.error("FORGE E&O SEND ERROR:",error);
    status.textContent=error?.message||"Request could not be sent.";
    btn.disabled=false;
    btn.textContent="SEND E&O CERTIFICATE REQUEST →";
  }
});
