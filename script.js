let allAgents = [];
let pendingImportAgents = [];
let selectedCoordinator = "All";
let selectedAgent = null;
let commandCurrentPage = 1;
const commandPageSize = 11;

let currentJourneyMode = "launch";
let activityLog = JSON.parse(localStorage.getItem("forgeActivityLog")) || {};
let checklistLog = JSON.parse(localStorage.getItem("forgeChecklistLog")) || {};

function saveChecklistLog() {
  localStorage.setItem("forgeChecklistLog", JSON.stringify(checklistLog));
}

const pipelineStages = [
  "Not Placed",
  "Not Started",
  "Quiz Sent",
  "Quiz Passed",
  "XCEL Completed",
  "Simulation Exams",
  "Exam Scheduled",
  "Exam Passed",
  "Fingerprints",
  "Applied For License",
];
const launchStages = ["Not Placed", "Quiz Sent", "Quiz Passed", "XCEL Completed"];
const activateStages = ["Exam Passed", "Continuing Education", "Licensed", "Contracted"];
const licensedStages = ["Licensed", "Compliance", "Contracted"];

const boardStages = {
  notStarted: "Not Started",
  quizSent: "Quiz Sent",
  xcel: "XCEL Completed",
  exam: "Exam Scheduled",
  licensed: "Licensed",
  contracted: "Contracted",
};

// ─── MERGE ────────────────────────────────────────────────────────────────────

function mergeCsvWithSavedPipeline(csvAgents, savedAgents) {
  const savedMap = new Map();
  savedAgents.forEach((saved) => {
    const key = saved.code || saved.email || saved.name;
    if (key) savedMap.set(key.trim().toLowerCase(), saved);
  });

  return csvAgents.map((csvAgent) => {
    const key = csvAgent.code || csvAgent.email || csvAgent.name;
    const savedAgent = savedMap.get(key.trim().toLowerCase());
    if (!savedAgent) return csvAgent;

    return {
      ...csvAgent,
      stage: savedAgent.stage || csvAgent.stage,
      pipelineStage: savedAgent.pipelineStage || savedAgent.stage || csvAgent.stage,
      notes: savedAgent.notes || "",
      lastAction: savedAgent.lastAction || "",
      followUpDate: savedAgent.followUpDate || "",
    };
  });
}

// ─── RENDER ALL ───────────────────────────────────────────────────────────────

function renderAllPages() {
  updateTime();
  renderDashboard("all");
  renderJourneyPage();
  renderAgentsPage();
  renderCommandCenter();
  renderGrowthPage();
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ? values[i].replace(/^"|"$/g, "").trim() : "";
    });
    return row;
  });
}

function normalizeAgent(row) {
  const status = String(row["Team Status"] || "").trim();
  const cleanStatus = status.toLowerCase();

  let stage = "Not Placed";
  if (cleanStatus.includes("contracted"))            stage = "Contracted";
  else if (cleanStatus.includes("continuing education")) stage = "Continuing Education";
  else if (cleanStatus.includes("exam passed"))      stage = "Exam Passed";
  else if (cleanStatus.includes("xcel"))             stage = "XCEL Completed";
  else if (cleanStatus.includes("quiz passed"))      stage = "Quiz Passed";
  else if (cleanStatus.includes("quiz sent"))        stage = "Quiz Sent";
  else if (cleanStatus.includes("licensed") || cleanStatus.includes("license")) stage = "Licensed";

  return {
    name: (row["Full name"] || "").trim(),
    email: (row["Email"] || "").trim(),
    phone: (row["Phone"] || "").trim(),
    code: (row["Agent Code"] || "").trim(),
    coordinator: (row["Upline Name"] || "").trim(),
    uplineCode: (row["Upline Code"] || "").trim(),
    teamStatus: status,
    status,
    stage,
    pipelineStage: stage,
  };
}

// ─── METRICS ─────────────────────────────────────────────────────────────────

function getMetrics(list) {
  const totalTeam = list.length;
  const pipeline    = list.filter((a) => pipelineStages.includes(a.stage)).length;
  const licensed    = list.filter((a) => a.stage === "Licensed" || a.stage === "Contracted").length;
  const contracted  = list.filter((a) => a.stage === "Contracted").length;

  const licensingRate    = totalTeam > 0 ? Math.round((licensed   / totalTeam) * 100) : 0;
  const contractingRate  = totalTeam > 0 ? Math.round((contracted  / totalTeam) * 100) : 0;
  const activationRate   = totalTeam > 0 ? Math.round(((licensed + contracted) / totalTeam) * 100) : 0;

  return { totalTeam, pipeline, licensed, contracted, licensingRate, contractingRate, activationRate };
}

function getVisibleAgents() {
  return allAgents;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function renderDashboard(filter) {
  const visibleAgents = getVisibleAgents();
  let filtered = visibleAgents;

  if (filter === "pipeline") filtered = visibleAgents.filter((a) => pipelineStages.includes(a.stage));
  if (filter === "licensed") filtered = visibleAgents.filter((a) => licensedStages.includes(a.stage));
  if (filter === "contracted") filtered = visibleAgents.filter((a) => a.stage === "Contracted");

  const filteredMetrics = getMetrics(filtered);
  const allMetrics      = getMetrics(visibleAgents);

  setText("totalCount",     filteredMetrics.totalTeam);
  setText("pipelineCount",  filteredMetrics.pipeline);
  setText("licensedCount",  filteredMetrics.licensed);
  setText("contractedCount",filteredMetrics.contracted);

  setText("todayActive",    allMetrics.totalTeam);
  setText("todayInactive",  allMetrics.pipeline);
  setText("todayLicensed",  allMetrics.licensed);
  setText("todayContracted",allMetrics.contracted);

  setText("journeyActive",      allMetrics.totalTeam);
  setText("journeyNonLicensed", allMetrics.pipeline);
  setText("journeyLicensed",    allMetrics.licensed);
  setText("journeyContracted",  allMetrics.contracted);

  setText("licensingRate",    allMetrics.licensingRate   + "%");
  setText("contractingRate",  allMetrics.contractingRate + "%");
  setText("activationRate",   allMetrics.activationRate  + "%");

  setText("licensingFraction",   `${allMetrics.licensed} / ${allMetrics.totalTeam}`);
  setText("contractingFraction", `${allMetrics.contracted} / ${allMetrics.totalTeam}`);
  setText("activationFraction",  `${allMetrics.licensed + allMetrics.contracted} / ${allMetrics.totalTeam}`);

  setRing("licensingRing",   allMetrics.licensingRate,   "#2563eb");
  setRing("contractingRing", allMetrics.contractingRate, "#16a34a");
  setRing("activationRing",  allMetrics.activationRate,  "#7c3aed");

  renderFocusList(visibleAgents);
  renderPipelineBoard(visibleAgents);
}

function setRing(id, percent, color) {
  const ring = document.getElementById(id);
  if (!ring) return;
  ring.style.background = `conic-gradient(${color} 0 ${percent}%, #e8edf5 ${percent}% 100%)`;
}

function renderFocusList(agents) {
  const focusList = document.getElementById("focusList");
  if (!focusList) return;

  const focusAgents = agents.filter((a) => pipelineStages.includes(a.stage)).slice(0, 5);
  focusList.innerHTML = "";

  focusAgents.forEach((agent) => {
    const row = document.createElement("div");
    row.className = "focus-row";
    row.innerHTML = `
      <div class="focus-avatar">${getInitials(agent.name)}</div>
      <div><b>${agent.name}</b><span>${agent.stage}</span></div>
    `;
    focusList.appendChild(row);
  });
}

function renderPipelineBoard(agents) {
  renderStage("Not Placed",   "notStartedCount",         "notStartedList",         agents);
  renderStage("Quiz Sent",    "quizSentCount",            "quizSentList",            agents);
  renderStage("XCEL Completed","xcelCount",               "xcelList",                agents);
  renderStage("Exam Scheduled","examCount",               "examList",                agents);
  renderStage("Licensed",     "licensedPipelineCount",    "licensedPipelineList",    agents);
  renderStage("Contracted",   "contractedPipelineCount",  "contractedPipelineList",  agents);
}

function renderStage(stageName, countId, listId, agents) {
  const stageAgents = agents.filter((a) => a.stage === stageName);
  setText(countId, stageAgents.length);

  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = "";

  stageAgents.forEach((agent) => {
    const card = document.createElement("div");
    card.className = "pipeline-agent-card";
    card.innerHTML = `
      <div class="pipeline-agent-name">${agent.name}</div>
      <div class="pipeline-agent-coordinator">${agent.coordinator}</div>
      <div class="pipeline-agent-stage">${agent.stage}</div>
    `;
    list.appendChild(card);
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getInitials(name) {
  return (
    name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "A"
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateTime() {
  const now  = new Date();
  const hour = now.getHours();
  let greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const coordinatorName = selectedCoordinator === "All" ? "Team" : selectedCoordinator;
  setText("greeting", greeting + ", " + coordinatorName + ".");

  const date = document.getElementById("todayDate");
  if (date) date.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const time = document.getElementById("todayTime");
  if (time) time.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── FILTER BUTTONS ───────────────────────────────────────────────────────────

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderDashboard(button.dataset.filter);
  });
});

document.getElementById("coordinatorSelect")?.addEventListener("change", (event) => {
  selectedCoordinator = event.target.value;
  updateTime();
  renderDashboard("all");
});

// ─── LOAD CSV ─────────────────────────────────────────────────────────────────

async function loadCSV() {
  const saved = JSON.parse(localStorage.getItem("forgeAgents")) || [];

  if (saved.length > 0) {
    allAgents = saved;
    renderAllPages();
    return;
  }

  try {
    const response = await fetch("team.csv");
    if (!response.ok) throw new Error("CSV not found");
    const text = await response.text();
    allAgents = parseCSV(text).map(normalizeAgent);
    saveAgentsToLocalStorage();
  } catch (err) {
    console.warn("Could not load team.csv:", err.message);
    allAgents = [];
  }

  renderAllPages();
}

// ─── JOURNEY PAGE ─────────────────────────────────────────────────────────────

function renderJourneyPage() {
  const searchValue = document.getElementById("journeySearch")?.value.toLowerCase() || "";
  const filteredAgents = allAgents.filter((a) => a.name.toLowerCase().includes(searchValue));

  const stageConfig = {
    launch: [
      ["Not Placed",    "journeyNotPlacedList", "journeyNotPlacedCount"],
      ["Quiz Sent",     "journeyQuizSentList",  "journeyQuizSentCount"],
      ["Quiz Passed",   "journeyQuizPassedList","journeyQuizPassedCount"],
      ["XCEL Completed","journeyXCELList",      "journeyXCELCount"],
    ],
    activate: [
      ["Exam Passed",          "journeyExamPassedList","journeyExamPassedCount"],
      ["Continuing Education", "journeyCEList",        "journeyCECount"],
      ["Licensed",             "journeyLicensedList",  "journeyLicensedCount"],
      ["Contracted",           "journeyContractedList","journeyContractedCount"],
    ],
  };

  const currentStages    = stageConfig[currentJourneyMode];
  const activeStageNames = currentStages.map((s) => s[0]);

  const stageAgentsTotal = filteredAgents.filter((a) => activeStageNames.includes(a.stage)).length;
  const completedCount   = filteredAgents.filter((a) =>
    currentJourneyMode === "launch" ? a.stage === "XCEL Completed" : a.stage === "Contracted"
  ).length;
  const progress = stageAgentsTotal ? Math.round((completedCount / stageAgentsTotal) * 100) : 0;

  setText("journeyStageAgents",  stageAgentsTotal);
  setText("journeyStageProgress", progress + "%");

  document.querySelectorAll(".launch-column").forEach((col) =>
    col.classList.toggle("hidden", currentJourneyMode !== "launch")
  );
  document.querySelectorAll(".activate-column").forEach((col) =>
    col.classList.toggle("hidden", currentJourneyMode !== "activate")
  );

  currentStages.forEach(([stageName, listId, countId]) => {
    const list = document.getElementById(listId);
    if (!list) return;

    const stageAgents = filteredAgents.filter((a) => a.stage === stageName);
    setText(countId, stageAgents.length);
    list.innerHTML = "";

    if (stageAgents.length === 0) {
      list.innerHTML = `<div class="empty-stage">No agents yet</div>`;
      return;
    }

    stageAgents.forEach((agent) => {
      const key  = agent.code || agent.email || agent.name;
      const card = document.createElement("div");
      card.className    = "journey-agent-card";
      card.draggable    = true;
      card.dataset.agentName = agent.name;

      card.innerHTML = `
        <div class="journey-agent-top">
          <div class="journey-avatar">${getInitials(agent.name)}</div>
          <div>
            <div class="journey-agent-name">${agent.name}</div>
            <div class="journey-agent-coordinator">${agent.coordinator}</div>
          </div>
        </div>
        <div class="journey-agent-bottom">
          <div class="journey-agent-badge">${agent.stage}</div>
          ${currentJourneyMode === "launch"
            ? `<button class="move-to-activate" data-move-agent="${key}">Activate →</button>`
            : `<button class="move-to-launch"   data-back-agent="${key}">← Launch</button>`
          }
          <button class="delete-pipeline-agent" data-delete-agent="${key}">Delete</button>
        </div>
      `;

      list.appendChild(card);
    });
  });
}

document.getElementById("journeySearch")?.addEventListener("input", renderJourneyPage);

// ─── JOURNEY MODE TOGGLE ─────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  const btn = event.target.closest(".journey-mode");
  if (!btn) return;

  currentJourneyMode = btn.dataset.mode;

  document.querySelectorAll(".journey-mode").forEach((item) => item.classList.remove("active"));
  btn.classList.add("active");

  document.querySelectorAll(".launch-column").forEach((col) =>
    col.classList.toggle("hidden", currentJourneyMode !== "launch")
  );
  document.querySelectorAll(".activate-column").forEach((col) =>
    col.classList.toggle("hidden", currentJourneyMode !== "activate")
  );

  renderJourneyPage();
});

// ─── MOVE TO ACTIVATE ────────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  const moveBtn = event.target.closest("[data-move-agent]");
  if (!moveBtn) return;
  event.preventDefault();
  event.stopPropagation();

  const key   = moveBtn.dataset.moveAgent;
  const agent = allAgents.find((a) => (a.code || a.email || a.name) === key);
  if (!agent) return;

  agent.stage        = "Exam Passed";
  agent.pipelineStage = "Exam Passed";
  saveAgentsToLocalStorage();

  currentJourneyMode = "activate";
  document.querySelectorAll(".journey-mode").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.mode === "activate")
  );
  renderAllPages();
});

// ─── MOVE BACK TO LAUNCH ─────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-back-agent]");
  if (!btn) return;

  const key   = btn.dataset.backAgent;
  const agent = allAgents.find((a) => (a.code || a.email || a.name) === key);
  if (!agent) return;

  agent.stage        = "XCEL Completed";
  agent.pipelineStage = "XCEL Completed";
  saveAgentsToLocalStorage();

  currentJourneyMode = "launch";
  renderAllPages();
});

// ─── DELETE AGENT ────────────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-delete-agent]");
  if (!deleteBtn) return;
  event.preventDefault();
  event.stopPropagation();

  const key = deleteBtn.dataset.deleteAgent;
  if (!confirm("Delete this agent from the pipeline?")) return;

  allAgents = allAgents.filter((a) => (a.code || a.email || a.name) !== key);
  saveAgentsToLocalStorage();
  renderAllPages();
});

// ─── ADD / EDIT AGENT MODAL ──────────────────────────────────────────────────

const addAgentModal = document.getElementById("addAgentModal");

document.querySelector(".add-agent-btn")?.addEventListener("click", () => {
  addAgentModal.classList.remove("hidden");
});

document.getElementById("cancelAddAgent")?.addEventListener("click", () => {
  addAgentModal.classList.add("hidden");
});

// FIX 1: broken upline read + crash when selectedAgent is null
document.getElementById("saveAddAgent")?.addEventListener("click", () => {
  const name        = document.getElementById("newAgentName").value.trim();
  const email       = document.getElementById("newAgentEmail").value.trim();
  const phone       = document.getElementById("newAgentPhone").value.trim();
  const code        = document.getElementById("newAgentCode").value.trim();
  const coordinator = document.getElementById("newAgentCoordinator").value;
  // FIX: read the upline field value properly (was using assignment `=` instead of just reading)
  const upline      = document.getElementById("newAgentUpline")?.value || (selectedAgent?.upline || "");
  const stage       = document.getElementById("newAgentStage").value;

  if (!name)        { alert("Please enter the agent name.");                      return; }
  if (!coordinator) { alert("Please select the coordinator responsible.");        return; }
  if (!stage)       { alert("Please select the pipeline stage.");                 return; }

  const existingAgent =
    selectedAgent ||
    allAgents.find((agent) =>
      (code  && agent.code  === code)  ||
      (email && agent.email === email) ||
      (phone && agent.phone === phone) ||
      agent.name.toLowerCase() === name.toLowerCase()
    );

  if (existingAgent) {
    existingAgent.name        = name;
    existingAgent.email       = email;
    existingAgent.phone       = phone;
    existingAgent.code        = code;
    existingAgent.coordinator = coordinator;
    existingAgent.upline      = upline;
    existingAgent.stage       = stage;
    existingAgent.pipelineStage = stage;
    selectedAgent = existingAgent;
  } else {
    selectedAgent = { name, email, phone, code, coordinator, upline, teamStatus: "", stage, pipelineStage: stage };
    allAgents.push(selectedAgent);
  }

  saveAgentsToLocalStorage();
  document.getElementById("addAgentModal").classList.add("hidden");

  renderDashboard("all");
  renderJourneyPage();
  renderAgentsPage();
  showAgentProfile(selectedAgent);
});

// Pre-fill edit modal
document.addEventListener("click", (e) => {
  if (!e.target.closest(".edit-agent-btn") || !selectedAgent) return;

  document.getElementById("newAgentName").value        = selectedAgent.name        || "";
  document.getElementById("newAgentEmail").value       = selectedAgent.email       || "";
  document.getElementById("newAgentPhone").value       = selectedAgent.phone       || "";
  document.getElementById("newAgentCode").value        = selectedAgent.code        || "";
  document.getElementById("newAgentCoordinator").value = selectedAgent.coordinator || "";
  if (document.getElementById("newAgentUpline"))
    document.getElementById("newAgentUpline").value    = selectedAgent.upline      || "";
  document.getElementById("newAgentStage").value       = selectedAgent.stage       || "";

  document.getElementById("addAgentModal").classList.remove("hidden");
});

// ─── PAGE NAVIGATION ─────────────────────────────────────────────────────────

function showPage(pageName) {
  document.querySelector(".dashboard").style.display  = pageName === "Home" ? "grid" : "none";
  document.querySelector(".lower").style.display      = pageName === "Home" ? "grid" : "none";

  document.getElementById("journeyPage")?.classList.toggle("hidden", pageName !== "Journey");
  document.getElementById("agentsPage")?.classList.toggle("hidden",  pageName !== "Agents");
  document.getElementById("commandPage")?.classList.toggle("hidden", pageName !== "Command");
  document.getElementById("growthPage")?.classList.toggle("hidden",  pageName !== "Growth");

  if (pageName === "Growth")  renderGrowthPage();
  if (pageName === "Command") renderCommandCenter();
  if (pageName === "Journey") renderJourneyPage();
  if (pageName === "Agents")  renderAgentsPage();
}

document.querySelector(".view-btn")?.addEventListener("click", () => {
  showPage("Journey");
  document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
  document.querySelectorAll(".nav-btn")[1]?.classList.add("active");
  renderJourneyPage();
});

// ─── DRAG AND DROP ────────────────────────────────────────────────────────────

let draggedAgentName = null;

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".journey-agent-card");
  if (!card) return;
  draggedAgentName = card.dataset.agentName;
  card.classList.add("dragging");
});

document.addEventListener("dragend", (event) => {
  const card = event.target.closest(".journey-agent-card");
  if (card) card.classList.remove("dragging");
  draggedAgentName = null;
});

document.addEventListener("dragover", (event) => {
  const zone = event.target.closest(".drop-zone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.add("drag-over");
});

document.addEventListener("dragleave", (event) => {
  const zone = event.target.closest(".drop-zone");
  if (!zone) return;
  zone.classList.remove("drag-over");
});

document.addEventListener("drop", (event) => {
  const zone = event.target.closest(".drop-zone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("drag-over");
  if (!draggedAgentName) return;

  const agent = allAgents.find((a) => a.name === draggedAgentName);
  if (!agent) return;

  agent.stage        = zone.dataset.stage;
  agent.pipelineStage = zone.dataset.stage;
  saveAgentsToLocalStorage();

  renderDashboard("all");
  renderJourneyPage();
});

// ─── AGENTS PAGE ─────────────────────────────────────────────────────────────

function renderAgentsPage() {
  const list = document.getElementById("agentsList");
  if (!list) return;

  const searchValue   = document.getElementById("agentsSearch")?.value.toLowerCase() || "";
  const filteredAgents = allAgents.filter((a) => a.name.toLowerCase().includes(searchValue));

  list.innerHTML = "";

  filteredAgents.forEach((agent, index) => {
    const item = document.createElement("div");
    item.className = "agent-list-item";

    // FIX 2: only auto-select the first agent when no agent is currently selected
    const isSelected = selectedAgent
      ? selectedAgent.name === agent.name
      : index === 0;

    if (isSelected) {
      item.classList.add("active");
      if (!selectedAgent || index === 0) showAgentProfile(agent);
    }

    item.innerHTML = `
      <b>${agent.name}</b>
      <span>
        ${agent.coordinator || "No coordinator"}
        <small class="stage-dot ${getStageColor(agent.stage)}"></small>
        ${agent.stage}
      </span>
    `;

    item.onclick = () => {
      document.querySelectorAll(".agent-list-item").forEach((row) => row.classList.remove("active"));
      item.classList.add("active");
      showAgentProfile(agent);
    };

    list.appendChild(item);
  });
}

document.getElementById("agentsSearch")?.addEventListener("input", renderAgentsPage);

document.getElementById("viewAgents")?.addEventListener("click", () => {
  showPage("Agents");
  document.querySelectorAll(".nav-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.textContent.trim() === "Agents")
  );
  renderAgentsPage();
});

// ─── AGENT PROFILE ───────────────────────────────────────────────────────────

function showAgentProfile(agent) {
  selectedAgent = agent;

  document.getElementById("agentProfileEmpty")?.classList.add("hidden");
  document.getElementById("agentProfile")?.classList.remove("hidden");

  setText("profileAvatar",     getInitials(agent.name));
  setText("profileName",       agent.name);
  setText("profileMeta",       agent.coordinator || "No coordinator");
  setText("profileCoordinator",agent.coordinator || "—");
  setText("profileStatus",     agent.teamStatus  || "—");
  setText("profileStage",      agent.stage       || "—");
  setText("profileCode",       agent.code        || "—");
  setText("profilePhone",      agent.phone       || "—");
  setText("profileEmail",      agent.email       || "—");
  setText("profileNextAction", getNextAction(agent.stage));
  updateJourneyStatus(agent.stage);
}

function updateJourneyStatus(stage) {
  const statusOne   = document.getElementById("statusOne");
  const statusTwo   = document.getElementById("statusTwo");
  const statusThree = document.getElementById("statusThree");
  if (!statusOne || !statusTwo || !statusThree) return;

  statusOne.classList.remove("active");
  statusTwo.classList.remove("active");
  statusThree.classList.remove("active");

  // Everyone in the system has been launched
  statusOne.classList.add("active");

  if (["Licensed", "Compliance", "Contracted", "Active"].includes(stage)) {
    statusTwo.classList.add("active");
  }
  if (["Contracted", "Active"].includes(stage)) {
    statusThree.classList.add("active");
  }
}

function getNextAction(stage) {
  const actions = {
    "Not Placed":          "Assign the agent to the correct pipeline stage.",
    "Quiz Sent":           "Follow up to complete the quiz.",
    "Quiz Passed":         "Move agent to XCEL enrollment.",
    "XCEL Completed":      "Confirm exam readiness.",
    "Exam Passed":         "Start license application.",
    "Continuing Education":"Complete CE to continue.",
    "Licensed":            "Confirm compliance and carrier contracting.",
    "Contracted":          "Ready to write business.",
  };
  return actions[stage] || "Review agent status.";
}

// ─── COMMAND CENTER ───────────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  const button = event.target.closest(".command-btn");
  if (!button) return;

  if (!selectedAgent) { alert("Please select an agent first."); return; }

  showPage("Command");
  document.querySelectorAll(".nav-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.textContent.trim() === "Command")
  );
  renderCommandCenter(selectedAgent);
});

function renderCommandCenter(agent = selectedAgent) {
  const list = document.getElementById("commandAgentList");
  if (!list) return;

  const searchValue    = document.getElementById("commandSearch")?.value.toLowerCase() || "";
  const filteredAgents = allAgents.filter((a) => a.name.toLowerCase().includes(searchValue));
  const totalPages     = Math.ceil(filteredAgents.length / commandPageSize) || 1;

  if (commandCurrentPage > totalPages) commandCurrentPage = 1;

  const start      = (commandCurrentPage - 1) * commandPageSize;
  const pageAgents = filteredAgents.slice(start, start + commandPageSize);

  list.innerHTML = "";

  pageAgents.forEach((a) => {
    const row = document.createElement("div");
    row.className = "command-agent-row";
    if (selectedAgent && selectedAgent.name === a.name) row.classList.add("active");

    row.innerHTML = `
      <div class="command-avatar">${getInitials(a.name)}</div>
      <div>
        <b>${a.name}</b>
        <span>${a.coordinator || "No coordinator"} • ${a.stage}</span>
      </div>
    `;

    row.onclick = () => {
      selectedAgent = a;
      renderCommandCenter(a);
      showCommandProfile(a);
    };

    list.appendChild(row);
  });

  renderCommandPagination(filteredAgents.length);
  if (agent) showCommandProfile(agent);
}

document.getElementById("commandSearch")?.addEventListener("input", () => {
  commandCurrentPage = 1;
  renderCommandCenter();
});

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-command-page]");
  if (!btn) return;

  const searchValue    = document.getElementById("commandSearch")?.value.toLowerCase() || "";
  const filteredAgents = allAgents.filter((a) => a.name.toLowerCase().includes(searchValue));
  const totalPages     = Math.ceil(filteredAgents.length / commandPageSize) || 1;

  if (btn.dataset.commandPage === "next" && commandCurrentPage < totalPages) commandCurrentPage++;
  if (btn.dataset.commandPage === "prev" && commandCurrentPage > 1)          commandCurrentPage--;

  renderCommandCenter();
});

function renderCommandPagination(total) {
  const pagination = document.getElementById("commandPagination");
  if (!pagination) return;

  const totalPages = Math.ceil(total / commandPageSize) || 1;
  const start = total === 0 ? 0 : (commandCurrentPage - 1) * commandPageSize + 1;
  const end   = Math.min(commandCurrentPage * commandPageSize, total);

  pagination.innerHTML = `
    <span>Showing ${start} - ${end} of ${total} agents</span>
    <div class="page-buttons">
      <button data-command-page="prev">‹</button>
      <strong>${commandCurrentPage}</strong>
      <button data-command-page="next">›</button>
    </div>
  `;
}

// ─── COMMAND PROFILE ─────────────────────────────────────────────────────────

const coordinatorActionMap = {
  "Not Placed": [
    { icon: "👋", title: "Send Welcome",          desc: "Introduce yourself as the licensing coordinator." },
    { icon: "📝", title: "Send Quiz Invitation",  desc: "Send the readiness quiz to begin licensing." },
    { icon: "📅", title: "Schedule First Follow-Up", desc: "Book a check-in to keep momentum." },
  ],
  "Quiz Sent": [
    { icon: "⏰", title: "Send Quiz Reminder",    desc: "Remind agent to complete the quiz." },
    { icon: "📞", title: "Call Agent",            desc: "Check if they need help." },
    { icon: "🚨", title: "Inactive Re-Engagement",desc: "Restart conversation if inactive." },
  ],
  "Quiz Passed": [
    { icon: "📚", title: "Send XCEL Instructions",desc: "Guide agent to start XCEL." },
    { icon: "🔐", title: "Send XCEL Login",       desc: "Send access details and password." },
    { icon: "✅", title: "Confirm Enrollment",    desc: "Confirm agent is enrolled." },
  ],
  "Continuing Education": [
    { icon: "📘", title: "Complete CE Requirements",desc: "Help agent finish CE." },
    { icon: "⏰", title: "CE Reminder",            desc: "Follow up on CE completion." },
    { icon: "📞", title: "Call Agent",             desc: "Check progress directly." },
  ],
  "Licensed": [
    { icon: "🤝", title: "Send Contracting Instructions", desc: "Move agent into contracting." },
    { icon: "📄", title: "Request Required Documents",    desc: "Collect needed contracting documents." },
    { icon: "✅", title: "Confirm Compliance",            desc: "Verify compliance is completed." },
  ],
  "Contracted": [
    { icon: "🚀", title: "Welcome Contracted Agent", desc: "Prepare agent for production." },
    { icon: "📈", title: "Send Fast Start Steps",    desc: "Give first production actions." },
    { icon: "🎥", title: "Schedule First Field Training", desc: "Book initial field training." },
  ],
};

const recommendedActionMap = {
  "Not Placed":          { title: "Send Welcome",               text: "Introduce yourself as the Licensing Coordinator." },
  "Quiz Sent":           { title: "Send Quiz Reminder",         text: "Remind agent to complete the licensing quiz." },
  "Quiz Passed":         { title: "Send XCEL Login",            text: "Send XCEL access and password." },
  "XCEL Completed":      { title: "Confirm Exam Readiness",     text: "Check if agent is ready to schedule the exam." },
  "Exam Passed":         { title: "Send License Instructions",  text: "Guide agent through fingerprints and application." },
  "Continuing Education":{ title: "Complete CE Requirements",   text: "Help agent finish CE." },
  "Licensed":            { title: "Send Contracting Instructions", text: "Move agent toward carrier contracting." },
  "Contracted":          { title: "Welcome Contracted Agent",   text: "Prepare agent for production." },
};

function showCommandProfile(agent) {
  selectedAgent = agent;

  document.getElementById("commandEmpty")?.classList.add("hidden");
  document.getElementById("commandProfile")?.classList.remove("hidden");
  document.getElementById("messageComposer")?.classList.add("hidden");

  setText("commandAvatar",    getInitials(agent.name));
  setText("commandName",      agent.name);
  setText("commandMeta",      `${agent.coordinator || "No coordinator"} • ${agent.stage}`);
  setText("commandStageBadge",agent.stage || "Not Placed");

  const recommended = recommendedActionMap[agent.stage] || { title: "Review Agent", text: "Review this agent's current licensing status." };
  setText("recommendedTitle", recommended.title);
  setText("recommendedText",  recommended.text);

  renderCoordinatorActions(agent);
  renderLicensingChecklist(agent);
  renderActivityTimeline(agent);
  updateCommandInsights(agent);
  renderTodayQueue();
}

function renderCoordinatorActions(agent) {
  const container = document.getElementById("coordinatorActions");
  if (!container) return;

  const actions = coordinatorActionMap[agent.stage] || [{ icon: "🔎", title: "Review Agent", desc: "Review this agent's current status." }];

  container.innerHTML = "";

  actions.forEach((action) => {
    const row = document.createElement("div");
    row.className = "action-row";
    row.innerHTML = `
      <div class="action-header">
        <div class="action-left">
          <div class="action-icon">${action.icon}</div>
          <div>
            <strong>${action.title}</strong>
            <p>${action.desc || ""}</p>
          </div>
        </div>
        <div class="action-buttons">
          <button data-compose="${action.title}">Send</button>
          <button class="expand-btn">Customize</button>
        </div>
      </div>
      <div class="action-body hidden">
        <textarea class="custom-message">${getActionMessage(action.title, selectedAgent)}</textarea>
        <div class="message-actions">
          <button>✨ AI Rewrite</button>
          <button>Shorter</button>
          <button>Friendlier</button>
          <button>Save Template</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}

// FIX 3: expand button toggle
document.addEventListener("click", (e) => {
  const expand = e.target.closest(".expand-btn");
  if (!expand) return;

  const body = expand.closest(".action-row").querySelector(".action-body");
  body.classList.toggle("hidden");
  expand.textContent = body.classList.contains("hidden") ? "Customize" : "▲";
});

// ─── ACTION MESSAGES ─────────────────────────────────────────────────────────

const actionMessages = {
  "Send Welcome": `Hi {agent}, welcome to the team!

My name is {coordinator}, and I will be your Licensing Coordinator working with {upline}.

My goal is to help you get licensed and contracted as quickly as possible. Please let me know if you have any questions.`,

  "Send Quiz Invitation": `Hi {agent}, please complete your licensing readiness quiz today.

This helps us know where you are and how to support you through the licensing process.`,

  "Send Quiz Reminder": `Hi {agent}, quick reminder to complete your licensing quiz today so we can move you to the next step.`,

  "Send XCEL Login": `Hi {agent}, please use your email to log in and complete your XCEL licensing course.

Password: Blessed100%

Let me know once you are inside.`,

  "Complete CE Requirements": `Hi {agent}, please complete your CE requirements so we can move you forward to contracting.`,

  "Send Contracting Instructions": `Hi {agent}, congratulations on being licensed!

The next step is contracting. Please complete the contracting requirements so we can appoint you quickly.`,
};

function getActionMessage(actionTitle, agent) {
  const template = actionMessages[actionTitle] || "Hi {agent}, following up on your licensing journey.";
  return template
    .replaceAll("{agent}",      agent?.name        || "")
    .replaceAll("{coordinator}", selectedCoordinator === "All" ? "your coordinator" : selectedCoordinator)
    .replaceAll("{upline}",     agent?.coordinator || "your upline");
}

// ─── SMART COMPOSER ───────────────────────────────────────────────────────────

// FIX 4: buildRecommendedMessage referenced undefined `currentCoordinator`; now uses selectedCoordinator
function buildRecommendedMessage(agent, action) {
  const coordinatorName = selectedCoordinator === "All" ? "your coordinator" : selectedCoordinator;

  switch (action) {
    case "Send Welcome":
      return `Hi ${agent.name},

Welcome to Team ${agent.coordinator || ""}. My name is ${coordinatorName} and I will be your Licensing Coordinator.

My goal is to help you become licensed and contracted as quickly as possible.

If you ever need anything during your licensing journey, I'm here to help.

Looking forward to working with you!`;

    case "Send Quiz Invitation":
      return `Hi ${agent.name},

Your licensing readiness quiz is now available.

Please complete it today so we can begin the next step.

Thank you!`;

    default:
      return getActionMessage(action, agent);
  }
}

function openSmartComposer(method = "Text") {
  if (!selectedAgent) {
    alert("Please select an agent first.");
    return;
  }

  const modal = document.getElementById("actionModal");
  if (!modal) return;

  modal.classList.remove("hidden");

  const stage = selectedAgent.stage || "Not Placed";
  const template = getStageMessageTemplate(stage, method, selectedAgent);

  setText("actionTitle", `${method} • ${selectedAgent.name}`);
  setText("actionSubtitle", `Stage: ${stage}`);

  const messageEl = document.getElementById("actionMessage");
  if (messageEl) messageEl.value = template.body;

  const deliveryButtons = document.querySelectorAll(".delivery");
  deliveryButtons.forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.textContent.toLowerCase().includes(method.toLowerCase())
    );
  });
}

function openActionModal() {
  if (!selectedAgent) { alert("Please select an agent first."); return; }
  openSmartComposer("Text");
}

document.getElementById("closeActionModal")?.addEventListener("click", () => {
  document.getElementById("actionModal")?.classList.add("hidden");
});

document.getElementById("cancelAction")?.addEventListener("click", () => {
  document.getElementById("actionModal")?.classList.add("hidden");
});

document.getElementById("sendAction")?.addEventListener("click", () => {
  if (!selectedAgent) return;

  const title = document.getElementById("actionTitle")?.innerText || "Action";
  const method = title.split("•")[0].trim();
  const message = document.getElementById("actionMessage")?.value || "";

  logCoordinatorActivity(selectedAgent, method, message);

  markChecklistFromMethod(method, selectedAgent.stage);

  document.getElementById("actionModal")?.classList.add("hidden");

  renderLicensingChecklist(selectedAgent);
  renderActivityTimeline(selectedAgent);
  renderTodayQueue();

  alert(`${method} completed and logged.`);
});
function markChecklistFromMethod(method, stage) {
  if (!selectedAgent) return;

  const key = selectedAgent.code || selectedAgent.email || selectedAgent.name;
  if (!checklistLog[key]) checklistLog[key] = {};

  if (stage === "Not Placed") checklistLog[key]["Welcome Sent"] = true;
  if (stage === "Quiz Sent") checklistLog[key]["Quiz Reminder Sent"] = true;
  if (stage === "Quiz Passed") checklistLog[key]["XCEL Login Sent"] = true;
  if (stage === "XCEL Completed") checklistLog[key]["Exam Follow-Up"] = true;
  if (stage === "Licensed") checklistLog[key]["Contracting Sent"] = true;
  if (stage === "Contracted") checklistLog[key]["Contracted"] = true;

  saveChecklistLog();
}

document.getElementById("copyMessage")?.addEventListener("click", () => {
  const message = document.getElementById("actionMessage")?.value || "";
  navigator.clipboard.writeText(message);
  alert("Message copied.");
});

document.getElementById("makeShorter")?.addEventListener("click", () => {
  const box = document.getElementById("actionMessage");
  if (!box) return;
  box.value = box.value.split(".").filter(Boolean).slice(0, 3).join(".").trim() + ".";
});

document.getElementById("makeFriendly")?.addEventListener("click", () => {
  const box = document.getElementById("actionMessage");
  if (!box || !selectedAgent) return;
  box.value = `Hi ${selectedAgent.name}, 😊\n\n` + box.value.replace(/^Hi .*?,\s*/i, "");
});

document.getElementById("closeComposer")?.addEventListener("click", () => {
  document.getElementById("messageComposer")?.classList.add("hidden");
});

document.addEventListener("click", (event) => {
  const noteBtn = event.target.closest("[data-note]");
  if (!noteBtn || !selectedAgent) return;
  document.getElementById("messageComposer")?.classList.remove("hidden");
  const methodEl = document.getElementById("composerMethod");
  const msgEl    = document.getElementById("composerMessage");
  if (methodEl) methodEl.value = "Note";
  if (msgEl)    msgEl.value    = "";
});

document.addEventListener("click", (event) => {
  const actionBtn = event.target.closest(
    ".quick-actions button, #takeActionBtn, .take-action-btn, [data-compose]"
  );

  if (!actionBtn) return;

  event.preventDefault();
  event.stopPropagation();

  const method =
    actionBtn.dataset.method ||
    (actionBtn.dataset.compose ? "Text" : "Text");

  openSmartComposer(method);
});

document.addEventListener("click", (event) => {
  const btn = event.target.closest(
    ".quick-actions button, #takeActionBtn, [data-compose], [data-note]"
  );

  if (!btn || !selectedAgent) return;

  event.preventDefault();

  const method =
    btn.dataset.method ||
    (btn.dataset.note ? "Note" : "Text");

  openSmartComposer(method);
});

//---make the delivery buttons inside the modal switch the message type.
document.addEventListener("click", (event) => {
  const deliveryBtn = event.target.closest(".delivery");
  if (!deliveryBtn || !selectedAgent) return;

  event.preventDefault();

  document.querySelectorAll(".delivery").forEach((btn) =>
    btn.classList.remove("active")
  );

  deliveryBtn.classList.add("active");

  const text = deliveryBtn.textContent.toLowerCase();

  let method = "Text";
  if (text.includes("email")) method = "Email";
  if (text.includes("whatsapp")) method = "WhatsApp";
  if (text.includes("call")) method = "Call";
  if (text.includes("zoom")) method = "Zoom";

  const template = getStageMessageTemplate(
    selectedAgent.stage || "Not Placed",
    method,
    selectedAgent
  );

  setText("actionTitle", `${method} • ${selectedAgent.name}`);
  setText("actionSubtitle", `Stage: ${selectedAgent.stage || "Not Placed"}`);

  const messageEl = document.getElementById("actionMessage");
  if (messageEl) messageEl.value = template.body;
});
// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────

function saveActivityLog() {
  localStorage.setItem("forgeActivityLog", JSON.stringify(activityLog));
}

function logCoordinatorActivity(agent, method, message) {
  const key = agent.code || agent.email || agent.name;
  if (!activityLog[key]) activityLog[key] = [];

  activityLog[key].unshift({ method, message, date: new Date().toLocaleString() });
  saveActivityLog();
  renderActivityTimeline(agent);
}

function renderActivityTimeline(agent) {
  const timeline = document.getElementById("activityTimeline");
  if (!timeline) return;

  const key     = agent.code || agent.email || agent.name;
  const entries = activityLog[key] || [];

  if (entries.length === 0) { timeline.innerHTML = "No activity yet."; return; }

  timeline.innerHTML = "";
  entries.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "timeline-entry";
    div.innerHTML = `<b>${entry.method}</b><span>${entry.date}</span><p>${entry.message}</p>`;
    timeline.appendChild(div);
  });
}

// ─── CHECKLIST ────────────────────────────────────────────────────────────────

function renderLicensingChecklist(agent) {
  const container = document.getElementById("licensingChecklist");
  if (!container) return;

  const key = agent.code || agent.email || agent.name;
  if (!checklistLog[key]) checklistLog[key] = {};

  const items = [
    "Welcome Sent","Quiz Sent","Quiz Reminder Sent","XCEL Login Sent",
    "Exam Follow-Up","License Approved","Contracting Sent","Contracted",
  ];

  container.innerHTML = "";

  items.forEach((item) => {
    const checked = checklistLog[key][item] === true;
    const row     = document.createElement("label");
    row.className = "checklist-row";
    row.innerHTML = `<input type="checkbox" data-check="${item}" ${checked ? "checked" : ""}><span>${item}</span>`;
    container.appendChild(row);
  });

  const completed = items.filter((item) => checklistLog[key][item]).length;
  const percent   = Math.round((completed / items.length) * 100);

  setText("checklistProgress", `${completed} / ${items.length} completed`);
  const bar = document.getElementById("checklistProgressBar");
  if (bar) bar.style.width = percent + "%";
}

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-check]");
  if (!checkbox || !selectedAgent) return;

  const key  = selectedAgent.code || selectedAgent.email || selectedAgent.name;
  const item = checkbox.dataset.check;

  if (!checklistLog[key]) checklistLog[key] = {};
  checklistLog[key][item] = checkbox.checked;

  saveChecklistLog();
  renderLicensingChecklist(selectedAgent);
  updateCommandInsights(selectedAgent);
});

// ─── INSIGHTS ────────────────────────────────────────────────────────────────

function updateCommandInsights(agent) {
  const key       = agent.code || agent.email || agent.name;
  const checklist = checklistLog[key] || {};
  const completed = Object.values(checklist).filter(Boolean).length;

  setText("actionsDone", completed);

  let risk      = "Low";
  let coachText = "Agent is progressing normally.";

  if (agent.stage === "Not Placed")          { risk = "High";   coachText = "Start with a welcome message and quiz invitation."; }
  if (agent.stage === "Quiz Sent")           { risk = "Medium"; coachText = "Follow up to make sure the quiz is completed."; }
  if (agent.stage === "Continuing Education"){ risk = "Medium"; coachText = "Help agent complete CE requirements."; }
  if (agent.stage === "Contracted")          { risk = "Low";    coachText = "Agent is contracted. Prepare fast-start and field training."; }

  setText("riskLevel",    risk);
  setText("daysInStage",  "—");
  setText("nextFollowUp", risk === "High" ? "Today" : "Soon");
  setText("aiCoachText",  coachText);
}

// ─── TODAY QUEUE ─────────────────────────────────────────────────────────────

function renderTodayQueue() {
  const queue = document.getElementById("todayQueue");
  if (!queue) return;

  queue.innerHTML = "";
  const priorities = [];

  allAgents.forEach((agent) => {
    switch (agent.stage) {
      case "Not Placed":
        priorities.push({ icon: "👋", priority: "High",   title: "Welcome " + agent.name, agent }); break;
      case "Quiz Sent":
        priorities.push({ icon: "📘", priority: "Medium", title: "Quiz Reminder",          agent }); break;
      case "Licensed":
        priorities.push({ icon: "🤝", priority: "High",   title: "Contract " + agent.name, agent }); break;
      case "Continuing Education":
        priorities.push({ icon: "📚", priority: "High",   title: "CE Follow-Up",           agent }); break;
    }
  });

  priorities.forEach((task) => {
    const card = document.createElement("div");
    card.className = "queue-card";
    card.innerHTML = `
      <div>
        <div class="queue-icon">${task.icon}</div>
        <div><strong>${task.title}</strong><span>${task.priority} Priority</span></div>
      </div>
      <button>Open</button>
    `;
    card.querySelector("button").onclick = () => {
      selectedAgent = task.agent;
      showCommandProfile(task.agent);
    };
    queue.appendChild(card);
  });

  setText("todayCount", priorities.length + " Tasks");
}

// ─── GUIDE MODAL ─────────────────────────────────────────────────────────────

const guideLibrary = {
  "Not Placed":     { title: "Welcome Guide",     goal: "Move the agent to Quiz Sent today.",         steps: ["Introduce yourself.","Explain your role as Licensing Coordinator.","Build rapport.","Send Quiz Invitation.","Schedule tomorrow's follow-up."],          success: ["Welcome Sent","Quiz Sent"] },
  "Quiz Sent":      { title: "Quiz Follow-Up Guide", goal: "Help the agent complete the readiness quiz.", steps: ["Check if they received the link.","Answer questions.","Send reminder.","Schedule next call."],                                                   success: ["Quiz Passed"] },
  "Quiz Passed":    { title: "XCEL Enrollment Guide", goal: "Enroll the agent into XCEL.",             steps: ["Send purchase instructions.","Provide login.","Explain study schedule.","Answer questions."],                                                        success: ["XCEL Purchased"] },
  "XCEL Completed": { title: "Exam Guide",         goal: "Schedule and pass the state exam.",          steps: ["Verify course completion.","Schedule exam.","Prepare documents.","Encourage confidence."],                                                           success: ["Exam Passed"] },
  "Licensed":       { title: "Contracting Guide",  goal: "Complete contracting.",                      steps: ["Send contracting link.","Collect documents.","Verify compliance.","Submit application."],                                                            success: ["Contracted"] },
  "Contracted":     { title: "Producer Guide",     goal: "Launch the agent into production.",          steps: ["Schedule Fast Start.","Book first field training.","Set first appointment.","Complete first application."],                                          success: ["Active"] },
};

function openGuide(agent) {
  const guide  = guideLibrary[agent.stage] || guideLibrary["Not Placed"];
  const script = getActionMessage(recommendedActionMap[agent.stage]?.title || "Send Welcome", agent);

  document.getElementById("guideModal")?.classList.remove("hidden");
  setText("guideTitle", guide.title);
  setText("guideStage", `${agent.name} • ${agent.stage}`);

  document.getElementById("guideBody").innerHTML = `
    <div class="guide-card">
      <h3><span class="guide-icon mission-icon"></span> Mission</h3>
      <p>${guide.goal}</p>
    </div>
    <div class="guide-card">
      <h3><span class="guide-icon script-icon"></span> Coordinator Script</h3>
      <div class="guide-script" id="guideScript">${script}</div>
    </div>
    <div class="guide-card">
      <h3><span class="guide-icon steps-icon"></span> Steps</h3>
      <ul>${guide.steps.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>
    <div class="guide-card">
      <h3><span class="guide-icon success-icon"></span> Success Criteria</h3>
      <ul>${guide.success.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>
    <div class="guide-card">
      <h3><span class="guide-icon coach-icon"></span> AI Coach</h3>
      <p>${getGuideCoachText(agent.stage)}</p>
    </div>
    <div class="guide-footer">
      <button id="copyGuideScript">Copy Script</button>
      <button class="guide-start" id="guideStartAction">Start Action</button>
    </div>
  `;
}

function getGuideCoachText(stage) {
  const tips = {
    "Not Placed":          "Send a warm welcome first, then the quiz invitation. The goal is to create trust and movement today.",
    "Quiz Sent":           "Follow up quickly. Agents usually need a reminder before completing the quiz.",
    "Quiz Passed":         "Move fast into XCEL. Delay here causes most licensing momentum to slow down.",
    "XCEL Completed":      "Encourage exam scheduling immediately while the course is fresh.",
    "Continuing Education":"Help the agent finish CE and remove any confusion blocking progress.",
    "Licensed":            "Do not let the agent sit licensed but uncontracted. Send contracting instructions today.",
    "Contracted":          "Move the agent into field training and production.",
  };
  return tips[stage] || "Review the agent's current stage and take the next best action.";
}

document.addEventListener("click", (event) => {
  const guideBtn = event.target.closest("#openGuideBtn");
  if (!guideBtn || !selectedAgent) return;
  event.preventDefault();
  event.stopPropagation();
  openGuide(selectedAgent);
});

document.getElementById("closeGuide")?.addEventListener("click", () => {
  document.getElementById("guideModal")?.classList.add("hidden");
});

document.addEventListener("click", (event) => {
  if (event.target.id !== "guideStartAction") return;
  event.preventDefault();
  event.stopPropagation();
  document.getElementById("guideModal")?.classList.add("hidden");
  openActionModal();
});

document.addEventListener("click", (event) => {
  if (event.target.id !== "copyGuideScript") return;
  const text = document.getElementById("guideScript")?.innerText || "";
  navigator.clipboard.writeText(text);
  alert("Guide script copied.");
});

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────

document.getElementById("csvImportInput")?.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const csvAgents = parseCSV(reader.result).map(normalizeAgent);
    const saved     = JSON.parse(localStorage.getItem("forgeAgents")) || [];
    allAgents       = mergeCsvWithSavedPipeline(csvAgents, saved);
    saveAgentsToLocalStorage();
    renderAllPages();
    alert(`${allAgents.length} agents imported successfully.`);
  };
  reader.readAsText(file);
  event.target.value = "";
});

document.addEventListener("click", (event) => {
  const btn = event.target.closest(".import-csv-btn");
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  document.getElementById("importGuideModal")?.classList.remove("hidden");
});

document.addEventListener("click", (event) => {
  if (event.target.id === "closeImportGuide" || event.target.id === "cancelImportGuide") {
    document.getElementById("importGuideModal")?.classList.add("hidden");
  }
});

document.addEventListener("click", (event) => {
  if (event.target.id !== "startCSVImport") return;
  event.preventDefault();
  event.stopPropagation();
  document.getElementById("importGuideModal")?.classList.add("hidden");
  document.getElementById("csvImportInput")?.click();
});

// ─── STORAGE ─────────────────────────────────────────────────────────────────

function saveAgentsToLocalStorage() {
  localStorage.setItem("forgeAgents", JSON.stringify(allAgents));
}

// ─── GROWTH PAGE ─────────────────────────────────────────────────────────────

function getGrowthStatus(team) {
  if (team.progress >= 60) return "Strong";
  if (team.progress >= 35) return "Healthy";
  if (team.progress >= 20) return "At Risk";
  return "Needs Help";
}

function renderGrowthPage() {
  const teams = {};

  allAgents.forEach((agent) => {
    const leader = String(agent.coordinator || "").trim();
    if (!leader) return;

    if (!teams[leader]) {
      teams[leader] = { name: `${leader}'s Team`, leader, total: 0, active: 0, licensed: 0, contracted: 0, inactive: 0, progress: 0 };
    }

    const team       = teams[leader];
    const statusText = `${agent.teamStatus || ""} ${agent.status || ""} ${agent.stage || ""}`.toLowerCase();

    team.total++;
    if (statusText.includes("inactive")) team.inactive++;
    else team.active++;
    if (agent.stage === "Licensed"   || agent.stage === "Contracted") team.licensed++;
    if (agent.stage === "Contracted") team.contracted++;
  });

  const growthTeams = Object.values(teams)
    .map((team) => {
      const total   = Math.max(team.total, 1);
      team.progress = Math.round(((team.contracted * 3 + team.licensed * 2 + team.active) / (total * 6)) * 100);
      return team;
    })
    .sort((a, b) =>
      b.contracted - a.contracted ||
      b.licensed   - a.licensed   ||
      b.active     - a.active     ||
      a.inactive   - b.inactive
    );

  renderGrowthRows(growthTeams);
  renderGrowthCards(growthTeams);
}

function renderGrowthRows(growthTeams) {
  const list = document.getElementById("teamPerformanceList");
  if (!list) return;

  list.innerHTML = `
    <div class="growth-table-head">
      <span>Rank</span><span>Team</span><span>Progress</span>
      <span>Active</span><span>Licensed</span><span>Contracted</span>
      <span>Inactive</span><span>Status</span>
    </div>
  `;

  growthTeams.forEach((team, index) => {
    const status = getGrowthStatus(team);
    list.innerHTML += `
      <div class="growth-table-row">
        <div class="rank">${index + 1}</div>
        <div class="team-name">${team.name}</div>
        <div class="momentum-cell">
          <strong>${team.progress}%</strong>
          <span class="momentum-bar"><span class="momentum-fill" style="width:${team.progress}%"></span></span>
        </div>
        <div>${team.active}</div>
        <div>${team.licensed}</div>
        <div>${team.contracted}</div>
        <div>${team.inactive}</div>
        <div><span class="status-pill ${status.toLowerCase().replaceAll(" ", "-")}">${status}</span></div>
      </div>
    `;
  });
}

function renderGrowthCards(growthTeams) {
  const totalTeams  = growthTeams.length;
  const avgProgress = totalTeams
    ? Math.round(growthTeams.reduce((sum, t) => sum + t.progress, 0) / totalTeams)
    : 0;

  const topTeam = growthTeams[0] || { name: "No Team", progress: 0, active: 0, licensed: 0, contracted: 0, inactive: 0 };

  const needsAttention = growthTeams.filter((t) => t.contracted === 0 || t.licensed === 0 || t.progress < 25).length;

  setText("growthTotalTeams",   totalTeams);
  setText("growthAvgMomentum",  avgProgress);
  setText("growthTopTeam",      topTeam.name);
  setText("growthTopMomentum",  `Progress ${topTeam.progress}%`);
  setText("growthNeedsAttention", needsAttention);

  setText("spotlightTeamName",  topTeam.name);
  setText("spotlightMomentum",  `${topTeam.progress}%`);
  setText("spotlightTrend",     "#1 Ranked Team");
  setText("spotlightMessage",   `${topTeam.contracted} contracted • ${topTeam.licensed} licensed • ${topTeam.active} active`);
  setText("spotlightReason1",   `${topTeam.active} Active Agents`);
  setText("spotlightReason2",   `${topTeam.licensed} Licensed Agents`);
  setText("spotlightReason3",   `${topTeam.contracted} Contracted Agents`);
  setText("growthTrend",        `${avgProgress}% average across all teams`);
}

// ─── STAGE MESSAGE TEMPLATES ─────────────────────────────────────────────────

function getStageMessageTemplate(stage, method, agent) {
  const name            = agent?.name || "there";
  const coordinatorName = selectedCoordinator === "All" ? "your licensing coordinator" : selectedCoordinator;

  const templates = {
    "Not Placed": {
      subject: "Welcome — Let's Get You Started",
      body: `Hi ${name},

Welcome to the team. My name is ${coordinatorName}, and I will help guide you through your licensing journey.

The first step is simple: we need to confirm where you are so we can place you on the right path.

Please reply and let me know if you have already started your licensing process, completed any course, or taken any exam.

Once I know where you are, I can help you move to the next step quickly.`,
    },
    "Quiz Sent": {
      subject: "Your Licensing Quiz Is Ready",
      body: `Hi ${name},

Your licensing quiz has been sent.

This quiz helps us understand where you are in the licensing process and what support you need next.

Please complete it today so we can move you forward without delay.

Once you finish, reply "Done" so I can update your status and help you get to the next step.`,
    },
    "Quiz Passed": {
      subject: "Great Job — Let's Move You to XCEL",
      body: `Hi ${name},

Congratulations on passing your quiz.

This means you are ready to move into the next important step: starting your XCEL pre-licensing course and preparing to schedule your state exam.

Please confirm once you have access to XCEL, and let me know if you need help getting started.`,
    },
    "XCEL Completed": {
      subject: "XCEL Completed — Time to Schedule Your Exam",
      body: `Hi ${name},

Congratulations on completing XCEL.

That is a major milestone. The next step is to schedule your state exam while the information is still fresh.

Please schedule your exam as soon as possible and send me the date once it is confirmed.

You are very close. Let's keep the momentum going.`,
    },
    "Exam Passed": {
      subject: "Congratulations on Passing Your Life Exam",
      body: `Hi ${name},

Congratulations on passing your Life Exam.

This is a big accomplishment and a major step toward becoming fully active in the business.

The next step is to complete the remaining licensing requirements, including your license application, fingerprints or state requirements if applicable, and any required follow-up items.

Please send me a quick update on what you have completed so far so I can help you move to the next stage.`,
    },
    "Continuing Education": {
      subject: "Let's Get Your CE Completed",
      body: `Hi ${name},

You are currently at the Continuing Education step.

This step is important because it keeps your licensing progress moving and helps you stay compliant with the requirements.

Please complete your CE as soon as possible and send me confirmation once it is done.

If you are stuck, unsure where to log in, or not sure what is missing, reply to this message and I will help you figure it out.`,
    },
    "Licensed": {
      subject: "Congratulations on Becoming Licensed",
      body: `Hi ${name},

Congratulations on becoming licensed.

This is a major achievement. Now we need to help you move from licensed to fully contracted and ready to write business.

The next step is to complete your contracting requirements and submit everything needed for appointment.

Please check your email for contracting instructions and let me know once you have started.`,
    },
    "Contracted": {
      subject: "Let's Get You Appointed Through Tevah",
      body: `Hi ${name},

Congratulations on reaching the contracting stage.

You are now very close to being fully ready to write business. The next step is to complete your appointment process through Tevah.

Please log in, complete the appointment steps, and confirm once submitted.

Let's get you fully appointed and ready for production.`,
    },
  };

  const selected = templates[stage] || templates["Not Placed"];

  if (method === "Text" || method === "WhatsApp") {
    return { subject: "", body: selected.body.replace(/\n+/g, " ").replace(/\s+/g, " ").slice(0, 420) };
  }
  if (method === "Call") {
    return { subject: "", body: `Call ${name}. Goal: help them move forward from ${stage}. Ask what is blocking them, confirm the next step, and update their stage after the call.` };
  }
  if (method === "Zoom") {
    return {
      subject: "Quick Licensing Support Zoom",
      body: `Hi ${name},\n\nLet's schedule a quick Zoom to help you move forward from your current stage: ${stage}.\n\nWe will review where you are, what is missing, and the exact next step to complete.\n\nPlease reply with a good time today or tomorrow.`,
    };
  }
  if (method === "Note") {
    return { subject: "", body: `${name} is currently in ${stage}. Add coordinator notes here.` };
  }

  return selected;
}

// ─── STAGE COLOR ─────────────────────────────────────────────────────────────

function getStageColor(stage) {
  if (stage === "Contracted")          return "green";
  if (stage === "Licensed")            return "green";
  if (stage === "Quiz Passed")         return "green";
  if (stage === "Quiz Sent")           return "orange";
  if (stage === "Continuing Education")return "orange";
  if (stage === "XCEL Completed")      return "blue";
  if (stage === "Not Placed")          return "gray";
  return "gray";
}

// ─── GROWTH HELPERS ───────────────────────────────────────────────────────────

function getDirectDownlineCount(leaderName, agents) {
  return agents.filter((a) =>
    String(a.coordinator || "").trim().toLowerCase() === String(leaderName || "").trim().toLowerCase()
  ).length;
}

function isLeader(agent, agents) {
  return getDirectDownlineCount(agent.name, agents) > 0;
}

// ─── DOM READY ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (event) => {
    const navBtn = event.target.closest(".nav-btn");
    if (!navBtn) return;

    document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));
    navBtn.classList.add("active");
    showPage(navBtn.textContent.trim());
  });

  document.addEventListener("click", (event) => {
    const filterBtn = event.target.closest(".filter");
    if (!filterBtn) return;

    document.querySelectorAll(".filter").forEach((btn) => btn.classList.remove("active"));
    filterBtn.classList.add("active");
    renderDashboard(filterBtn.dataset.filter || "all");
  });

  loadCSV();
  setInterval(updateTime, 30000);
});
