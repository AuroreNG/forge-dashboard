let allAgents = [];
let pendingImportAgents = [];
let selectedCoordinator = "All";
let selectedAgent = null;
let commandCurrentPage = 1;
const commandPageSize = 11;

let currentJourneyMode = "launch";
let activityLog = JSON.parse(localStorage.getItem("forgeActivityLog")) || {};
let checklistLog =
  JSON.parse(localStorage.getItem("forgeChecklistLog")) || {};

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
const launchStages = [
  "Not Placed",
  "Quiz Sent",
  "Quiz Passed",
  "XCEL Completed",
];

const activateStages = [
  "Exam Passed",
  "Continuing Education",
  "Licensed",
  "Contracted",
];

const licensedStages = ["Licensed", "Compliance", "Contracted"];

const boardStages = {
  notStarted: "Not Started",
  quizSent: "Quiz Sent",
  xcel: "XCEL Completed",
  exam: "Exam Scheduled",
  licensed: "Licensed",
  contracted: "Contracted",
};

async function loadCSV() {
  try {
    const savedAgents =
      JSON.parse(localStorage.getItem("forgeAgents")) || [];

    const response = await fetch("team.csv?v=" + Date.now());

    if (!response.ok) {
      throw new Error("team.csv not found");
    }

    const text = await response.text();
    const rows = parseCSV(text);

    const csvAgents = rows.map(normalizeAgent);

    allAgents = mergeCsvWithSavedPipeline(csvAgents, savedAgents);

    localStorage.setItem("forgeAgents", JSON.stringify(allAgents));

    console.log("Loaded CSV with saved pipeline stages:", allAgents.length);

    renderAllPages();

  } catch (error) {
    console.error("CSV load failed:", error);

    const savedAgents =
      JSON.parse(localStorage.getItem("forgeAgents")) || [];

    allAgents = savedAgents;
    renderAllPages();
  }
}

function mergeCsvWithSavedPipeline(csvAgents, savedAgents) {
  return csvAgents.map((csvAgent) => {
    const csvKey = csvAgent.code || csvAgent.email || csvAgent.name;

    const savedAgent = savedAgents.find((saved) => {
      const savedKey = saved.code || saved.email || saved.name;
      return savedKey === csvKey;
    });

    if (!savedAgent) return csvAgent;

    return {
      ...csvAgent,

      // Keep manual pipeline movement
      stage: savedAgent.stage || csvAgent.stage,
      pipelineStage: savedAgent.pipelineStage || savedAgent.stage || csvAgent.stage
    };
  });
}
function renderAllPages() {
  updateTime();
  renderDashboard("all");
  renderJourneyPage();
  renderAgentsPage();
  renderCommandCenter();
  renderGrowthPage();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index]
        ? values[index].replace(/^"|"$/g, "").trim()
        : "";
    });

    return row;
  });
}

function normalizeAgent(row) {
  const status = String(row["Team Status"] || "").trim();
  const cleanStatus = status.toLowerCase();

  let stage = "Not Placed";

  if (
    cleanStatus.includes("non-licensed") ||
    cleanStatus.includes("non licensed") ||
    cleanStatus.includes("unlicensed") ||
    cleanStatus.includes("not licensed")
  ) {
    stage = "Not Placed";
  } else if (cleanStatus.includes("contracted")) {
    stage = "Contracted";
  } else if (cleanStatus.includes("licensed")) {
    stage = "Licensed";
  }

  return {
    name: (row["Full name"] || "").trim(),
    email: (row["Email"] || "").trim(),
    phone: (row["Phone"] || "").trim(),
    code: (row["Agent Code"] || "").trim(),
    coordinator: (row["Upline Name"] || "").trim(),
    uplineCode: (row["Upline Code"] || "").trim(),
    teamStatus: status,
    status: status,
    stage,
    pipelineStage: stage
  };
}
function getMetrics(list) {
  const totalTeam = list.length;

  const pipeline = list.filter((agent) =>
    pipelineStages.includes(agent.stage)
  ).length;

  const licensed = list.filter((agent) =>
    licensedStages.includes(agent.stage)
  ).length;

  const contracted = list.filter((agent) => agent.stage === "Contracted").length;

  const contractingRate =
    licensed > 0 ? Math.round((contracted / licensed) * 100) : 0;

  return { totalTeam, pipeline, licensed, contracted, contractingRate };
}

function getVisibleAgents() {
  return allAgents;
}

function renderDashboard(filter) {
  const visibleAgents = getVisibleAgents();

  let filtered = visibleAgents;

  if (filter === "pipeline") {
    filtered = visibleAgents.filter((agent) =>
      pipelineStages.includes(agent.stage)
    );
  }

  if (filter === "licensed") {
    filtered = visibleAgents.filter((agent) =>
      licensedStages.includes(agent.stage)
    );
  }

  if (filter === "contracted") {
    filtered = visibleAgents.filter((agent) => agent.stage === "Contracted");
  }

  const filteredMetrics = getMetrics(filtered);
  const allMetrics = getMetrics(visibleAgents);

  setText("totalCount", filteredMetrics.totalTeam);
  setText("pipelineCount", filteredMetrics.pipeline);
  setText("licensedCount", filteredMetrics.licensed);
  setText("contractedCount", filteredMetrics.contracted);

  setText("momentumScore", allMetrics.contractingRate);
  setText("momentumPercent", allMetrics.contractingRate + "%");

  const ring = document.getElementById("momentumRing");
  if (ring) {
    ring.style.background = `conic-gradient(#12b94f 0 ${allMetrics.contractingRate}%, #315f90 ${allMetrics.contractingRate}% 100%)`;
  }

  setText("todayActive", allMetrics.totalTeam);
  setText("todayInactive", allMetrics.pipeline);
  setText("todayLicensed", allMetrics.licensed);
  setText("todayContracted", allMetrics.contracted);

  setText("journeyActive", allMetrics.totalTeam);
  setText("journeyNonLicensed", allMetrics.pipeline);
  setText("journeyLicensed", allMetrics.licensed);
  setText("journeyContracted", allMetrics.contracted);

  renderFocusList(visibleAgents);
  renderPipelineBoard(visibleAgents);
}

function renderFocusList(agents) {
  const focusAgents = agents
    .filter((agent) => pipelineStages.includes(agent.stage))
    .slice(0, 5);

  const focusList = document.getElementById("focusList");
  if (!focusList) return;

  focusList.innerHTML = "";

  focusAgents.forEach((agent) => {
    const row = document.createElement("div");
    row.className = "focus-row";

    row.innerHTML = `
      <div class="focus-avatar">${getInitials(agent.name)}</div>
      <div>
        <b>${agent.name}</b>
        <span>${agent.stage}</span>
      </div>
    `;

    focusList.appendChild(row);
  });
}

function renderPipelineBoard(agents) {
  renderStage("Not Placed", "notStartedCount", "notStartedList", agents);
  renderStage("Quiz Sent", "quizSentCount", "quizSentList", agents);
  renderStage("XCEL Completed", "xcelCount", "xcelList", agents);
  renderStage("Exam Scheduled", "examCount", "examList", agents);
  renderStage("Licensed", "licensedPipelineCount", "licensedPipelineList", agents);
  renderStage("Contracted", "contractedPipelineCount", "contractedPipelineList", agents);
}

function renderStage(stageName, countId, listId, agents) {

  const stageAgents = agents.filter(
    agent => agent.stage === stageName
  );

  setText(countId, stageAgents.length);

  const list = document.getElementById(listId);

  if (!list) return;

  list.innerHTML = "";

  stageAgents.forEach(agent => {

    const card = document.createElement("div");

    card.className = "pipeline-agent-card";

    card.innerHTML = `
      <div class="pipeline-agent-name">
        ${agent.name}
      </div>

      <div class="pipeline-agent-coordinator">
        ${agent.coordinator}
      </div>

      <div class="pipeline-agent-stage">
        ${agent.stage}
      </div>
    `;

    list.appendChild(card);

  });
}

function getInitials(name) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "A"
  );
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateTime() {
  const now = new Date();
  const hour = now.getHours();

  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 17) greeting = "Good afternoon";

  const coordinatorName =
    selectedCoordinator === "All" ? "Team" : selectedCoordinator;

  setText("greeting", greeting + ", " + coordinatorName + ".");

  const date = document.getElementById("todayDate");
  if (date) {
    date.textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  const time = document.getElementById("todayTime");
  if (time) {
    time.textContent = now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) =>
      item.classList.remove("active")
    );

    button.classList.add("active");
    renderDashboard(button.dataset.filter);
  });
});

document.getElementById("viewJourney")?.addEventListener("click", () => {
  alert("Journey page will be built next.");
});

document
  .getElementById("coordinatorSelect")
  ?.addEventListener("change", (event) => {
    selectedCoordinator = event.target.value;
    updateTime();
    renderDashboard("all");
  });

loadCSV();
setInterval(updateTime, 30000);

document.querySelectorAll(".nav-btn").forEach((button) => {

  button.addEventListener("click", () => {

    const pageName = button.textContent.trim();

    document.querySelectorAll(".nav-btn").forEach((item) => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    showPage(pageName);

  });

});
function renderJourneyPage() {
  const searchValue =
    document.getElementById("journeySearch")?.value.toLowerCase() || "";

  const filteredAgents = allAgents.filter((agent) =>
    agent.name.toLowerCase().includes(searchValue)
  );

  const stageConfig = {
    launch: [
      ["Not Placed", "journeyNotPlacedList", "journeyNotPlacedCount"],
      ["Quiz Sent", "journeyQuizSentList", "journeyQuizSentCount"],
      ["Quiz Passed", "journeyQuizPassedList", "journeyQuizPassedCount"],
      ["XCEL Completed", "journeyXCELList", "journeyXCELCount"],
    ],
    activate: [
      ["Exam Passed", "journeyExamPassedList", "journeyExamPassedCount"],
      ["Continuing Education", "journeyCEList", "journeyCECount"],
      ["Licensed", "journeyLicensedList", "journeyLicensedCount"],
      ["Contracted", "journeyContractedList", "journeyContractedCount"],
    ],
  };

  const currentStages = stageConfig[currentJourneyMode];
  const activeStageNames = currentStages.map((stage) => stage[0]);

const stageAgentsTotal = filteredAgents.filter((agent) =>
  activeStageNames.includes(agent.stage)
).length;

const completedCount = filteredAgents.filter((agent) =>
  currentJourneyMode === "launch"
    ? agent.stage === "XCEL Completed"
    : agent.stage === "Contracted"
).length;

const progress = stageAgentsTotal
  ? Math.round((completedCount / stageAgentsTotal) * 100)
  : 0;

setText("journeyStageAgents", stageAgentsTotal);
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

    const stageAgents = filteredAgents.filter(
      (agent) => agent.stage === stageName
    );

    setText(countId, stageAgents.length);
    list.innerHTML = "";

    if (stageAgents.length === 0) {
      list.innerHTML = `<div class="empty-stage">No agents yet</div>`;
      return;
    }

    stageAgents.forEach((agent) => {
      const key = agent.code || agent.email || agent.name;

      const card = document.createElement("div");
      card.className = "journey-agent-card";
      card.draggable = true;
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

          ${
currentJourneyMode === "launch"
? `<button class="move-to-activate"
     data-move-agent="${key}">
     Activate →
   </button>`
: `<button class="move-to-launch"
     data-back-agent="${key}">
     ← Launch
   </button>`
}

          <button class="delete-pipeline-agent" data-delete-agent="${key}">
            Delete
          </button>
        </div>
      `;

      list.appendChild(card);
    });
  });
}
document.addEventListener("click", (event) => {

  const btn = event.target.closest("[data-back-agent]");
  if (!btn) return;

  const key = btn.dataset.backAgent;

  const agent = allAgents.find(a =>
    (a.code || a.email || a.name) === key
  );

  if (!agent) return;

  agent.stage = "XCEL Completed";
  agent.pipelineStage = "XCEL Completed";

  saveAgentsToLocalStorage();

  currentJourneyMode = "launch";

  renderAllPages();

});

document.addEventListener("click", (event) => {
  const moveBtn = event.target.closest("[data-move-agent]");
  if (!moveBtn) return;

  event.preventDefault();
  event.stopPropagation();

  const key = moveBtn.dataset.moveAgent;

  const agent = allAgents.find((agent) => {
    const agentKey = agent.code || agent.email || agent.name;
    return agentKey === key;
  });

  if (!agent) return;

  agent.stage = "Exam Passed";
  agent.pipelineStage = "Exam Passed";

  saveAgentsToLocalStorage();

  currentJourneyMode = "activate";

  document.querySelectorAll(".journey-mode").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === "activate");
  });

  renderAllPages();
});

  saveAgentsToLocalStorage();
  renderAllPages();
});

document.getElementById("journeySearch")?.addEventListener("input", () => {
  renderJourneyPage();
});

const addAgentModal = document.getElementById("addAgentModal");

document.querySelector(".add-agent-btn")?.addEventListener("click", () => {
  addAgentModal.classList.remove("hidden");
});

document.getElementById("cancelAddAgent")?.addEventListener("click", () => {
  addAgentModal.classList.add("hidden");
});

document.getElementById("saveAddAgent")?.addEventListener("click", () => {
  const name = document.getElementById("newAgentName").value.trim();
  const email = document.getElementById("newAgentEmail").value.trim();
  const phone = document.getElementById("newAgentPhone").value.trim();
  const code = document.getElementById("newAgentCode").value.trim();
  const coordinator = document.getElementById("newAgentCoordinator").value;
  const stage = document.getElementById("newAgentStage").value;

  if (!name) {
    alert("Please enter the agent name.");
    return;
  }

  if (!coordinator) {
    alert("Please select the coordinator responsible.");
    return;
  }

  if (!stage) {
    alert("Please select the pipeline stage.");
    return;
  }

  const existingAgent =
    selectedAgent ||
    allAgents.find((agent) =>
      (code && agent.code === code) ||
      (email && agent.email === email) ||
      (phone && agent.phone === phone) ||
      agent.name.toLowerCase() === name.toLowerCase()
    );

  if (existingAgent) {
    existingAgent.name = name;
    existingAgent.email = email;
    existingAgent.phone = phone;
    existingAgent.code = code;
    existingAgent.coordinator = coordinator;
    existingAgent.stage = stage;
    existingAgent.pipelineStage = stage;

    selectedAgent = existingAgent;
  } else {
    selectedAgent = {
      name,
      email,
      phone,
      code,
      coordinator,
      teamStatus: "",
      stage,
      pipelineStage: stage,
    };

    allAgents.push(selectedAgent);
  }

  saveAgentsToLocalStorage();

  document.getElementById("addAgentModal").classList.add("hidden");

  renderDashboard("all");
  renderJourneyPage();
  renderAgentsPage();
  showAgentProfile(selectedAgent);
});
document.querySelector(".view-btn")?.addEventListener("click", () => {
  document.querySelector(".dashboard").style.display = "none";
  document.querySelector(".lower").style.display = "none";
  document.getElementById("journeyPage").classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((item) =>
    item.classList.remove("active")
  );

  document.querySelectorAll(".nav-btn")[1].classList.add("active");

  renderJourneyPage();
});

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".journey-agent-card");
  if (!card) return;

  event.dataTransfer.setData("text/plain", card.dataset.agentName);
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

function saveAgentsToLocalStorage() {
  localStorage.setItem("forgeAgents", JSON.stringify(allAgents));
}

document.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-command-page]");
  if (!btn) return;

  const searchValue =
    document.getElementById("commandSearch")?.value.toLowerCase() || "";

  const filteredAgents = allAgents.filter((agent) =>
    agent.name.toLowerCase().includes(searchValue)
  );

  const totalPages = Math.ceil(filteredAgents.length / commandPageSize) || 1;

  if (btn.dataset.commandPage === "next" && commandCurrentPage < totalPages) {
    commandCurrentPage++;
  }

  if (btn.dataset.commandPage === "prev" && commandCurrentPage > 1) {
    commandCurrentPage--;
  }

  renderCommandCenter();
});

document.getElementById("csvImportInput")?.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const rows = parseCSV(reader.result);

    allAgents = rows.map(normalizeAgent);

    saveAgentsToLocalStorage();

    renderDashboard("all");
    renderJourneyPage();
    renderAgentsPage();
    renderCommandCenter();
    renderGrowthPage();

    alert(`${allAgents.length} agents imported successfully.`);
  };

  reader.readAsText(file);

  event.target.value = "";
});

document
.getElementById("confirmImport")
?.addEventListener("click", () => {

  pendingImportAgents.forEach((row) => {

    const status =
      (row["Team Status"] || "").toLowerCase();

    let stage = "Not Placed";

    if (status.includes("contracted")) {
      stage = "Contracted";
    }
    else if (status.includes("licensed")) {
      stage = "Licensed";
    }

    allAgents.push({
      name: row["Full name"] || "",
      email: row["Email"] || "",
      phone: row["Phone"] || "",
      code: row["Agent Code"] || "",
      coordinator: row["Coordinator"] || "",
      teamStatus: row["Team Status"] || "",
      stage,
      pipelineStage: stage,
    });

  });

  saveAgentsToLocalStorage();

  renderDashboard("all");
  renderJourneyPage();

  document
    .getElementById("importReviewModal")
    .classList.add("hidden");

});

function showPage(pageName) {
  document.querySelector(".dashboard").style.display =
    pageName === "Home" ? "grid" : "none";

  document.querySelector(".lower").style.display =
    pageName === "Home" ? "grid" : "none";

  document.getElementById("journeyPage")?.classList.toggle(
    "hidden",
    pageName !== "Journey"
  );
  
  document.getElementById("agentsPage")?.classList.toggle(
    "hidden",
    pageName !== "Agents"
  );

  document.getElementById("commandPage")?.classList.toggle(
  "hidden",
  pageName !== "Command"
);
document.getElementById("growthPage")?.classList.toggle(
  "hidden",
  pageName !== "Growth"
);

  if (pageName === "Growth") renderGrowthPage();
  if (pageName === "Command") renderCommandCenter();
  if (pageName === "Journey") renderJourneyPage();
  if (pageName === "Agents") renderAgentsPage();

}


function showAgentProfile(agent) {
  selectedAgent = agent;

  document.getElementById("agentProfileEmpty")?.classList.add("hidden");
  document.getElementById("agentProfile")?.classList.remove("hidden");

  setText("profileAvatar", getInitials(agent.name));
  setText("profileName", agent.name);
  setText("profileMeta", agent.coordinator || "No coordinator");

  setText("profileCoordinator", agent.coordinator || "—");
  setText("profileStatus", agent.teamStatus || "—");
  setText("profileStage", agent.stage || "—");
  updateJourneyStatus(agent.stage);
  setText("profileCode", agent.code || "—");
  setText("profilePhone", agent.phone || "—");
  setText("profileEmail", agent.email || "—");
  setText("profileNextAction", getNextAction(agent.stage));
updateJourneyStatus(agent.stage);

}

document.addEventListener("click", (e) => {

  if (!e.target.closest(".edit-agent-btn")) return;

  document.getElementById("newAgentName").value =
    selectedAgent.name || "";

  document.getElementById("newAgentEmail").value =
    selectedAgent.email || "";

  document.getElementById("newAgentPhone").value =
    selectedAgent.phone || "";

  document.getElementById("newAgentCode").value =
    selectedAgent.code || "";

  document.getElementById("newAgentCoordinator").value =
    selectedAgent.coordinator || "";

  document.getElementById("newAgentStage").value =
    selectedAgent.stage || "";

  document.getElementById("addAgentModal")
    .classList.remove("hidden");

});

function updateJourneyStatus(stage) {

    const statusOne = document.getElementById("statusOne");
    const statusTwo = document.getElementById("statusTwo");
    const statusThree = document.getElementById("statusThree");

    statusOne.classList.remove("active");
    statusTwo.classList.remove("active");
    statusThree.classList.remove("active");

    // Everyone in the system has been launched
    statusOne.classList.add("active");

    if (
        [
            "Licensed",
            "Compliance",
            "Contracted",
            "Active"
        ].includes(stage)
    ) {
        statusTwo.classList.add("active");
    }

    if (
        [
            "Contracted",
            "Active"
        ].includes(stage)
    ) {
        statusThree.classList.add("active");
    }

}

document.getElementById("agentsSearch")?.addEventListener("input", () => {
  renderAgentsPage();
});

function getNextAction(stage) {
  const actions = {
    "Not Placed": "Assign the agent to the correct pipeline stage.",
    "Quiz Sent": "Follow up to complete the quiz.",
    "Quiz Passed": "Move agent to XCEL enrollment.",
    "XCEL Completed": "Confirm exam readiness.",
    "Exam Passed": "Start license application.",
    "Continuing Education": "Complete CE to continue.",
    "Licensed": "Confirm compliance and carrier contracting.",
    "Contracted": "Ready to write business."
  };

  return actions[stage] || "Review agent status.";
}



document.addEventListener("click", (event) => {
  const btn = event.target.closest(".journey-mode");
  if (!btn) return;

  currentJourneyMode = btn.dataset.mode;

  document.querySelectorAll(".journey-mode").forEach((item) =>
    item.classList.remove("active")
  );

  btn.classList.add("active");

  document.querySelectorAll(".launch-column").forEach((col) =>
    col.classList.toggle("hidden", currentJourneyMode !== "launch")
  );

  document.querySelectorAll(".activate-column").forEach((col) =>
    col.classList.toggle("hidden", currentJourneyMode !== "activate")
  );

  renderJourneyPage();
});



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

  const agent = allAgents.find((item) => item.name === draggedAgentName);
  if (!agent) return;

  agent.stage = zone.dataset.stage;
  agent.pipelineStage = zone.dataset.stage;

  saveAgentsToLocalStorage();

  renderDashboard("all");
  renderJourneyPage();
});

function renderAgentsPage() {
  const list = document.getElementById("agentsList");
  if (!list) return;

  const searchValue =
    document.getElementById("agentsSearch")?.value.toLowerCase() || "";

  const filteredAgents = allAgents.filter((agent) =>
    agent.name.toLowerCase().includes(searchValue)
  );

  list.innerHTML = "";

  filteredAgents.forEach((agent, index) => {
    const item = document.createElement("div");
    item.className = "agent-list-item";

    if (index === 0) {
      item.classList.add("active");
      showAgentProfile(agent);
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
      document.querySelectorAll(".agent-list-item").forEach((row) =>
        row.classList.remove("active")
      );

      item.classList.add("active");
      showAgentProfile(agent);
    };

    list.appendChild(item);
  });
}

document.getElementById("viewAgents")?.addEventListener("click", () => {
  showPage("Agents");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.textContent.trim() === "Agents"
    );
  });

  renderAgentsPage();
});
document.addEventListener("click", (event) => {
  const button = event.target.closest(".command-btn");
  if (!button) return;

  if (!selectedAgent) {
    alert("Please select an agent first.");
    return;
  }

  showPage("Command");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.textContent.trim() === "Command"
    );
  });

  renderCommandCenter(selectedAgent);
});

function renderCommandCenter(agent = selectedAgent) {
  const list = document.getElementById("commandAgentList");
  if (!list) return;

  const searchValue =
    document.getElementById("commandSearch")?.value.toLowerCase() || "";

  const filteredAgents = allAgents.filter((agent) =>
    agent.name.toLowerCase().includes(searchValue)
  );

  const totalPages = Math.ceil(filteredAgents.length / commandPageSize) || 1;

  if (commandCurrentPage > totalPages) {
    commandCurrentPage = 1;
  }

  const start = (commandCurrentPage - 1) * commandPageSize;
  const end = start + commandPageSize;

  const pageAgents = filteredAgents.slice(start, end);

  list.innerHTML = "";

  pageAgents.forEach((agent) => {
    const row = document.createElement("div");
    row.className = "command-agent-row";

    if (selectedAgent && selectedAgent.name === agent.name) {
      row.classList.add("active");
    }

    row.innerHTML = `
      <div class="command-avatar">${getInitials(agent.name)}</div>

      <div>
        <b>${agent.name}</b>
        <span>${agent.coordinator || "No coordinator"} • ${agent.stage}</span>
      </div>
    `;

    row.onclick = () => {
      selectedAgent = agent;
      renderCommandCenter(agent);
      showCommandProfile(agent);
    };

    list.appendChild(row);
  });

  renderCommandPagination(filteredAgents.length);

  if (agent) {
    showCommandProfile(agent);
  }
}


document.getElementById("commandSearch")?.addEventListener("input", () => {
  renderCommandCenter();
});
const coordinatorActionMap = {
  "Not Placed": [
    {
      icon: "👋",
      title: "Send Welcome",
      desc: "Introduce yourself as the licensing coordinator."
    },
    {
      icon: "📝",
      title: "Send Quiz Invitation",
      desc: "Send the readiness quiz to begin licensing."
    },
    {
      icon: "📅",
      title: "Schedule First Follow-Up",
      desc: "Book a check-in to keep momentum."
    }
  ],

  "Quiz Sent": [
    {
      icon: "⏰",
      title: "Send Quiz Reminder",
      desc: "Remind agent to complete the quiz."
    },
    {
      icon: "📞",
      title: "Call Agent",
      desc: "Check if they need help."
    },
    {
      icon: "🚨",
      title: "Inactive Re-Engagement",
      desc: "Restart conversation if inactive."
    }
  ],

  "Quiz Passed": [
    {
      icon: "📚",
      title: "Send XCEL Instructions",
      desc: "Guide agent to start XCEL."
    },
    {
      icon: "🔐",
      title: "Send XCEL Login",
      desc: "Send access details and password."
    },
    {
      icon: "✅",
      title: "Confirm Enrollment",
      desc: "Confirm agent is enrolled."
    }
  ],

  "Continuing Education": [
    {
      icon: "📘",
      title: "Complete CE Requirements",
      desc: "Help agent finish CE."
    },
    {
      icon: "⏰",
      title: "CE Reminder",
      desc: "Follow up on CE completion."
    },
    {
      icon: "📞",
      title: "Call Agent",
      desc: "Check progress directly."
    }
  ],

  "Licensed": [
    {
      icon: "🤝",
      title: "Send Contracting Instructions",
      desc: "Move agent into contracting."
    },
    {
      icon: "📄",
      title: "Request Required Documents",
      desc: "Collect needed contracting documents."
    },
    {
      icon: "✅",
      title: "Confirm Compliance",
      desc: "Verify compliance is completed."
    }
  ],

  "Contracted": [
    {
      icon: "🚀",
      title: "Welcome Contracted Agent",
      desc: "Prepare agent for production."
    },
    {
      icon: "📈",
      title: "Send Fast Start Steps",
      desc: "Give first production actions."
    },
    {
      icon: "🎥",
      title: "Schedule First Field Training",
      desc: "Book initial field training."
    }
  ]
};
const recommendedActionMap = {
  "Not Placed": {
    title: "Send Welcome",
    text: "Introduce yourself as the Licensing Coordinator."
  },
  "Quiz Sent": {
    title: "Send Quiz Reminder",
    text: "Remind agent to complete the licensing quiz."
  },
  "Quiz Passed": {
    title: "Send XCEL Login",
    text: "Send XCEL access and password."
  },
  "XCEL Completed": {
    title: "Confirm Exam Readiness",
    text: "Check if agent is ready to schedule the exam."
  },
  "Exam Passed": {
    title: "Send License Instructions",
    text: "Guide agent through fingerprints and application."
  },
  "Continuing Education": {
    title: "Complete CE Requirements",
    text: "Help agent finish CE."
  },
  "Licensed": {
    title: "Send Contracting Instructions",
    text: "Move agent toward carrier contracting."
  },
  "Contracted": {
    title: "Welcome Contracted Agent",
    text: "Prepare agent for production."
  }
};

function showCommandProfile(agent) {
  selectedAgent = agent;

  document.getElementById("commandEmpty")?.classList.add("hidden");
  document.getElementById("commandProfile")?.classList.remove("hidden");
  document.getElementById("messageComposer")?.classList.add("hidden");

  setText("commandAvatar", getInitials(agent.name));
  setText("commandName", agent.name);
  setText(
    "commandMeta",
    `${agent.coordinator || "No coordinator"} • ${agent.stage}`
  );
  setText("commandStageBadge", agent.stage || "Not Placed");

  const recommended =
    recommendedActionMap[agent.stage] || {
      title: "Review Agent",
      text: "Review this agent’s current licensing status.",
    };

  setText("recommendedTitle", recommended.title);
  setText("recommendedText", recommended.text);

  renderCoordinatorActions(agent);
  renderLicensingChecklist(agent);
  renderActivityTimeline(agent);
  updateCommandInsights(agent);
  renderTodayQueue();
}

function renderCoordinatorActions(agent) {
  const container = document.getElementById("coordinatorActions");
  if (!container) return;

  const actions = coordinatorActionMap[agent.stage] || [
    {
      icon: "🔎",
      title: "Review Agent",
      desc: "Review this agent’s current status."
    }
  ];

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

const actionMessages = {
  "Send Welcome": `Hi {agent}, welcome to the team!

My name is {coordinator}, and I will be your Licensing Coordinator working with, {upline}.

My goal is to help you get licensed and contracted as quickly as possible. Please let me know if you have any questions.`,

  "Send Quiz Invitation": `Hi {agent}, please complete your licensing readiness quiz today.

This helps us know where you are and how to support you through the licensing process.`,

  "Send Quiz Reminder": `Hi {agent}, quick reminder to complete your licensing quiz today so we can move you to the next step.`,

  "Send XCEL Login": `Hi {agent}, please use your email to log in and complete your XCEL licensing course.

Password: Blessed100%

Let me know once you are inside.`,

  "Complete CE Requirements": `Hi {agent}, please complete your CE requirements so we can move you forward to contracting.`,

  "Send Contracting Instructions": `Hi {agent}, congratulations on being licensed!

The next step is contracting. Please complete the contracting requirements so we can appoint you quickly.`
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !selectedAgent) return;

  const action = button.dataset.action;

  const template =
    actionMessages[action] || `Hi {agent}, following up on your licensing journey.`;

  const message = template
    .replaceAll("{agent}", selectedAgent.name)
    .replaceAll("{coordinator}", selectedCoordinator || "your coordinator")
    .replaceAll("{upline}", selectedAgent.coordinator || "your upline");

  alert(message);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-compose]");
  if (!button || !selectedAgent) return;

  openComposer(button.dataset.compose, selectedAgent);
});
document.getElementById("copyMessage")?.addEventListener("click", () => {
  const message = document.getElementById("composerMessage").value;

  navigator.clipboard.writeText(message);

  alert("Message copied.");
});

document.getElementById("makeShorter")?.addEventListener("click", () => {
  const box = document.getElementById("composerMessage");

  box.value = box.value
    .split(".")
    .slice(0, 3)
    .join(".")
    .trim() + ".";
});

document.getElementById("makeFriendly")?.addEventListener("click", () => {
  const box = document.getElementById("composerMessage");

  box.value =
    "Hi " +
    (selectedAgent?.name || "") +
    ", 😊\n\n" +
    box.value.replace(/^Hi .*?,\s*/i, "");
});

document.getElementById("saveActivity")?.addEventListener("click", () => {
  if (!selectedAgent) return;

  const message = document.getElementById("composerMessage").value;
  const method = document.getElementById("composerMethod").value;

  const key = selectedAgent.code || selectedAgent.email || selectedAgent.name;

  if (!activityLog[key]) {
    activityLog[key] = [];
  }

  activityLog[key].unshift({
    method,
    message,
    date: new Date().toLocaleString()
  });

  saveActivityLog();
  renderActivityTimeline(selectedAgent);

  alert("Activity saved.");
});
function saveActivityLog() {
  localStorage.setItem("forgeActivityLog", JSON.stringify(activityLog));
}
function renderActivityTimeline(agent) {
  const timeline = document.getElementById("activityTimeline");
  if (!timeline) return;

  const key = agent.code || agent.email || agent.name;
  const entries = activityLog[key] || [];

  if (entries.length === 0) {
    timeline.innerHTML = "No activity yet.";
    return;
  }

  timeline.innerHTML = "";

  entries.forEach((entry) => {
    const div = document.createElement("div");
    div.className = "timeline-entry";

    div.innerHTML = `
      <b>${entry.method}</b>
      <span>${entry.date}</span>
      <p>${entry.message}</p>
    `;

    timeline.appendChild(div);
  });
}

function saveChecklistLog() {
  localStorage.setItem("forgeChecklistLog", JSON.stringify(checklistLog));
}

function renderLicensingChecklist(agent) {
  const container = document.getElementById("licensingChecklist");
  if (!container) return;

  const key = agent.code || agent.email || agent.name;

  if (!checklistLog[key]) checklistLog[key] = {};

  const items = [
    "Welcome Sent",
    "Quiz Sent",
    "Quiz Reminder Sent",
    "XCEL Login Sent",
    "Exam Follow-Up",
    "License Approved",
    "Contracting Sent",
    "Contracted"
  ];

  container.innerHTML = "";

  items.forEach((item) => {
    const checked = checklistLog[key][item] === true;

    const row = document.createElement("label");
    row.className = "checklist-row";

    row.innerHTML = `
      <input 
        type="checkbox" 
        data-check="${item}" 
        ${checked ? "checked" : ""}
      >
      <span>${item}</span>
    `;

    container.appendChild(row);
  });

  const completed = items.filter((item) => checklistLog[key][item]).length;
  const total = items.length;
  const percent = Math.round((completed / total) * 100);

  setText("checklistProgress", `${completed} / ${total} completed`);

  const bar = document.getElementById("checklistProgressBar");
  if (bar) bar.style.width = percent + "%";
}

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-check]");
  if (!checkbox || !selectedAgent) return;

  const key =
    selectedAgent.code ||
    selectedAgent.email ||
    selectedAgent.name;

  const item = checkbox.dataset.check;

  if (!checklistLog[key]) checklistLog[key] = {};

  checklistLog[key][item] = checkbox.checked;

  saveChecklistLog();
  renderLicensingChecklist(selectedAgent);
  updateCommandInsights(selectedAgent);
});
function logCoordinatorActivity(agent, method, message) {
  const key = agent.code || agent.email || agent.name;

  if (!activityLog[key]) {
    activityLog[key] = [];
  }

  activityLog[key].unshift({
    method,
    message,
    date: new Date().toLocaleString()
  });

  saveActivityLog();
  renderActivityTimeline(agent);
}
function renderCommandPagination(total) {
  const pagination = document.getElementById("commandPagination");
  if (!pagination) return;

  const totalPages = Math.ceil(total / commandPageSize) || 1;
  const start = total === 0 ? 0 : (commandCurrentPage - 1) * commandPageSize + 1;
  const end = Math.min(commandCurrentPage * commandPageSize, total);

  pagination.innerHTML = `
    <span>Showing ${start} - ${end} of ${total} agents</span>

    <div class="page-buttons">
      <button data-command-page="prev">‹</button>
      <strong>${commandCurrentPage}</strong>
      <button data-command-page="next">›</button>
    </div>
  `;
}
function getStageColor(stage) {
  if (stage === "Contracted") return "green";
  if (stage === "Licensed") return "green";
  if (stage === "Quiz Sent") return "orange";
  if (stage === "Quiz Passed") return "green";
  if (stage === "XCEL Completed") return "blue";
  if (stage === "Continuing Education") return "orange";
  if (stage === "Not Placed") return "gray";

  return "gray";
}
function updateCommandInsights(agent) {
  const key = agent.code || agent.email || agent.name;

  const checklist = checklistLog[key] || {};
  const completed = Object.values(checklist).filter(Boolean).length;

  setText("actionsDone", completed);

  let risk = "Low";
  let coachText = "Agent is progressing normally.";

  if (agent.stage === "Not Placed") {
    risk = "High";
    coachText = "Start with a welcome message and quiz invitation.";
  }

  if (agent.stage === "Quiz Sent") {
    risk = "Medium";
    coachText = "Follow up to make sure the quiz is completed.";
  }

  if (agent.stage === "Continuing Education") {
    risk = "Medium";
    coachText = "Help agent complete CE requirements.";
  }

  if (agent.stage === "Contracted") {
    risk = "Low";
    coachText = "Agent is contracted. Prepare fast-start and field training.";
  }

  setText("riskLevel", risk);
  setText("daysInStage", "—");
  setText("nextFollowUp", risk === "High" ? "Today" : "Soon");
  setText("aiCoachText", coachText);
}
/* =====================================
Open AI Action
===================================== */

function openActionModal() {
  if(!selectedAgent){
        alert("Please select an agent first.");
        return; } 
  const recommended =
    recommendedActionMap[selectedAgent.stage] || {
      title: "Review Agent",
      text: "Review this agent’s current licensing status."
    };
    

  setText("actionTitle", recommended.title);
  setText("actionSubtitle", recommended.text);

  document.getElementById("actionMessage").value =
    getActionMessage(recommended.title, selectedAgent);

  document.getElementById("actionModal").classList.remove("hidden");
}
function openComposer(action, agent) {
  const template =
    actionMessages[action] ||
    `Hi {agent}, following up on your licensing journey.`;

  const message = template
    .replaceAll("{agent}", agent.name)
    .replaceAll("{coordinator}", selectedCoordinator || "your coordinator")
    .replaceAll("{upline}", agent.coordinator || "your upline");

  document.getElementById("messageComposer")?.classList.remove("hidden");
  document.getElementById("composerMessage").value = message;
}
document.getElementById("closeComposer")?.addEventListener("click", () => {
  document.getElementById("messageComposer")?.classList.add("hidden");
});

document.addEventListener("click", (event) => {
  const methodBtn = event.target.closest("[data-method]");
  if (!methodBtn || !selectedAgent) return;

  const method = methodBtn.dataset.method;

  logCoordinatorActivity(
    selectedAgent,
    method,
    `${method} action logged.`
  );
});

document.getElementById("saveActivity")?.addEventListener("click", () => {
  if (!selectedAgent) return;

  const message = document.getElementById("composerMessage").value;
  const method = document.getElementById("composerMethod").value;

  logCoordinatorActivity(selectedAgent, method, message);

  alert("Activity saved.");
});

document.addEventListener("click", (event) => {
  const noteBtn = event.target.closest("[data-note]");
  if (!noteBtn || !selectedAgent) return;

  document.getElementById("messageComposer")?.classList.remove("hidden");
  document.getElementById("composerMethod").value = "Note";
  document.getElementById("composerMessage").value = "";
});
function renderTodayQueue(){

const queue=document.getElementById("todayQueue");

queue.innerHTML="";

const priorities=[];

allAgents.forEach(agent=>{

switch(agent.stage){

case "Not Placed":

priorities.push({
icon:"👋",
priority:"High",
title:"Welcome "+agent.name,
agent
});

break;

case "Quiz Sent":

priorities.push({
icon:"📘",
priority:"Medium",
title:"Quiz Reminder",
agent
});

break;

case "Licensed":

priorities.push({
icon:"🤝",
priority:"High",
title:"Contract "+agent.name,
agent
});

break;

case "Continuing Education":
  priorities.push({
    icon: "📚",
    priority: "High",
    title: "CE Follow-Up",
    agent
  });
  break;

}

});

  priorities.forEach(task=>{

  const card=document.createElement("div");

  card.className="queue-card";

  card.innerHTML=`

  <div>

  <div class="queue-icon">

  ${task.icon}

  </div>

  <div>

  <strong>${task.title}</strong>

  <span>${task.priority} Priority</span>

  </div>

  </div>

  <button>Open</button>

  `;

  card.querySelector("button").onclick=()=>{

  selectedAgent=task.agent;

  showCommandProfile(task.agent);

  };

  queue.appendChild(card);

  });

setText("todayCount",priorities.length+" Tasks");

}
  document.addEventListener("click", function(e){

const expand=e.target.closest(".expand-btn");

    if(!expand) return;

    const body=expand
    .closest(".action-row")
    .querySelector(".action-body");

    body.classList.toggle("hidden");

    expand.textContent=
    body.classList.contains("hidden")
    ? "▼"
    : "▲";

});
function getActionMessage(actionTitle, agent) {
  const template =
    actionMessages[actionTitle] ||
    "Hi {agent}, following up on your licensing journey.";

  return template
    .replaceAll("{agent}", agent?.name || "")
    .replaceAll("{coordinator}", selectedCoordinator || "your coordinator")
    .replaceAll("{upline}", agent?.coordinator || "your upline");
}

const guideLibrary = {

  "Not Placed":{

  title:"Welcome Guide",

  goal:"Move the agent to Quiz Sent today.",

  steps:[
  "Introduce yourself.",
  "Explain your role as Licensing Coordinator.",
  "Build rapport.",
  "Send Quiz Invitation.",
  "Schedule tomorrow's follow-up."
  ],

  success:[
  "Welcome Sent",
  "Quiz Sent"
]

},

  "Quiz Sent":{

  title:"Quiz Follow-Up Guide",

  goal:"Help the agent complete the readiness quiz.",

  steps:[
  "Check if they received the link.",
  "Answer questions.",
  "Send reminder.",
  "Schedule next call."
  ],

  success:[
  "Quiz Passed"
]

},

    "Quiz Passed":{

    title:"XCEL Enrollment Guide",

    goal:"Enroll the agent into XCEL.",

    steps:[
    "Send purchase instructions.",
    "Provide login.",
    "Explain study schedule.",
    "Answer questions."
    ],

    success:[
    "XCEL Purchased"
    ]

},

  "XCEL Completed":{

  title:"Exam Guide",

  goal:"Schedule and pass the state exam.",

  steps:[
  "Verify course completion.",
  "Schedule exam.",
  "Prepare documents.",
  "Encourage confidence."
  ],

  success:[
  "Exam Passed"
]

},

  "Licensed":{

  title:"Contracting Guide",

  goal:"Complete contracting.",

  steps:[
  "Send contracting link.",
  "Collect documents.",
  "Verify compliance.",
  "Submit application."
  ],

  success:[
"Contracted"
  ]

  },

    "Contracted":{

    title:"Producer Guide",

    goal:"Launch the agent into production.",

    steps:[
    "Schedule Fast Start.",
    "Book first field training.",
    "Set first appointment.",
    "Complete first application."
    ],

    success:[
    "Active"
  ]

}

};


function openGuide(agent) {
  const guide = guideLibrary[agent.stage] || guideLibrary["Not Placed"];

  document.getElementById("guideModal").classList.remove("hidden");

  setText("guideTitle", guide.title);
  setText("guideStage", `${agent.name} • ${agent.stage}`);

  const script = getActionMessage(
    recommendedActionMap[agent.stage]?.title || "Send Welcome",
    agent
  );

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
    <ul>${guide.steps.map(step => `<li>${step}</li>`).join("")}</ul>
  </div>

  <div class="guide-card">
    <h3><span class="guide-icon success-icon"></span> Success Criteria</h3>
    <ul>${guide.success.map(item => `<li>${item}</li>`).join("")}</ul>
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
  document.addEventListener("click", (event) => {
  if (event.target.id !== "guideStartAction") return;

  event.preventDefault();
  event.stopPropagation();

  document.getElementById("guideModal")?.classList.add("hidden");

  openActionModal();
});

  document
  .getElementById("closeGuide")
  .onclick=()=>{

document
  .getElementById("guideModal")
  .classList.add("hidden");

};
   document.addEventListener("click", (event) => {
  const guideBtn = event.target.closest("#openGuideBtn");
  if (!guideBtn) return;

  event.preventDefault();
  event.stopPropagation();

  if (!selectedAgent) return;

  openGuide(selectedAgent);
});

document.addEventListener("click", (event) => {
  const actionBtn = event.target.closest("#takeActionBtn");
  if (!actionBtn) return;

  event.preventDefault();
  event.stopPropagation();

  if (!selectedAgent) return;

  openActionModal();
});

function getGuideCoachText(stage) {
  const tips = {
    "Not Placed": "Send a warm welcome first, then the quiz invitation. The goal is to create trust and movement today.",
    "Quiz Sent": "Follow up quickly. Agents usually need a reminder before completing the quiz.",
    "Quiz Passed": "Move fast into XCEL. Delay here causes most licensing momentum to slow down.",
    "XCEL Completed": "Encourage exam scheduling immediately while the course is fresh.",
    "Continuing Education": "Help the agent finish CE and remove any confusion blocking progress.",
    "Licensed": "Do not let the agent sit licensed but uncontracted. Send contracting instructions today.",
    "Contracted": "Move the agent into field training and production."
  };

  return tips[stage] || "Review the agent’s current stage and take the next best action.";
}

document.addEventListener("click", (event) => {
  if (event.target.id === "copyGuideScript") {
    const text = document.getElementById("guideScript")?.innerText || "";
    navigator.clipboard.writeText(text);
    alert("Guide script copied.");
  }
});

document.getElementById("sendAction")?.addEventListener("click", () => {
  if (!selectedAgent) return;

  const action = document.getElementById("actionTitle").innerText;
  const message = document.getElementById("actionMessage").value;

  logCoordinatorActivity(selectedAgent, "Action", message);

  document.getElementById("actionModal")?.classList.add("hidden");

  renderActivityTimeline(selectedAgent);
});

document.getElementById("closeActionModal")?.addEventListener("click", () => {
  document.getElementById("actionModal")?.classList.add("hidden");
});
/* =====================================
Generate Smart Message
===================================== */

function buildRecommendedMessage(agent,action){

  switch(action){

  case "Send Welcome":

  return `Hi ${agent.name},

  Welcome to Team ${agent.upline}. My name is ${currentCoordinator.name} and I will be your Licensing Coordinator.

  My goal is to help you become licensed and contracted as quickly as possible.

  If you ever need anything during your licensing journey, I'm here to help.

  Looking forward to working with you!`;

  case "Send Quiz Invitation":

  return `Hi ${agent.name},

  Your licensing readiness quiz is now available.

  Please complete it today so we can begin the next step.

  Thank you!`;

  default:

  return "";

    }

}
          /* =====================================
Complete Action
===================================== */


document.getElementById("closeActionModal")?.addEventListener("click", () => {
  document.getElementById("actionModal").classList.add("hidden");
});

document.getElementById("cancelAction")?.addEventListener("click", () => {
  document.getElementById("actionModal")?.classList.add("hidden");
});

document.getElementById("saveDraft")?.addEventListener("click", () => {
  const message = document.getElementById("actionMessage")?.value || "";

  if (selectedAgent) {
    logCoordinatorActivity(selectedAgent, "Draft", message);
  }

  alert("Draft saved.");
  document.getElementById("actionModal")?.classList.add("hidden");
});


document.addEventListener("click", (event) => {
  const methodBtn = event.target.closest("[data-method]");
  if (!methodBtn || !selectedAgent) return;

  const method = methodBtn.dataset.method;
  const message = getActionMessage(
    recommendedActionMap[selectedAgent.stage]?.title || "Send Welcome",
    selectedAgent
  );

  const phone = (selectedAgent.phone || "").replace(/\D/g, "");
  const email = selectedAgent.email || "";

  if (method === "Call") {
    if (!phone) return alert("No phone number for this agent.");
    window.location.href = `tel:${phone}`;
    logCoordinatorActivity(selectedAgent, "Call", "Call started.");
  }

  if (method === "Text") {
    if (!phone) return alert("No phone number for this agent.");
    window.location.href = `sms:${phone}?&body=${encodeURIComponent(message)}`;
    logCoordinatorActivity(selectedAgent, "Text", message);
  }

  if (method === "WhatsApp") {
    if (!phone) return alert("No phone number for this agent.");
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
    logCoordinatorActivity(selectedAgent, "WhatsApp", message);
  }

  if (method === "Email") {
    if (!email) return alert("No email for this agent.");
    window.location.href =
      `mailto:${email}?subject=${encodeURIComponent("Licensing Follow-Up")}&body=${encodeURIComponent(message)}`;
    logCoordinatorActivity(selectedAgent, "Email", message);
  }
});


function getDirectDownlineCount(leaderName, agents) {
  return agents.filter((agent) =>
    String(agent.coordinator || "").trim().toLowerCase() ===
    String(leaderName || "").trim().toLowerCase()
  ).length;
}

function isLeader(agent, agents) {
  return getDirectDownlineCount(agent.name, agents) > 0;
}

function getGrowthStatus(team) {
  if (team.progress >= 60) return "Strong";
  if (team.progress >= 35) return "Healthy";
  if (team.progress >= 20) return "At Risk";
  return "Needs Help";
}

function renderGrowthPage() {
  const sourceAgents = allAgents || [];
  const teams = {};

  sourceAgents.forEach((agent) => {
    const leader = String(agent.coordinator || "").trim();
    if (!leader) return;

    if (!teams[leader]) {
      teams[leader] = {
        name: `${leader}'s Team`,
        leader,
        total: 0,
        active: 0,
        licensed: 0,
        contracted: 0,
        inactive: 0,
        progress: 0
      };
    }

    const team = teams[leader];
    team.total++;

    const statusText = `${agent.teamStatus || ""} ${agent.status || ""} ${agent.stage || ""}`.toLowerCase();

    if (statusText.includes("inactive")) {
      team.inactive++;
    } else {
      team.active++;
    }

    if (agent.stage === "Licensed" || agent.stage === "Contracted") {
      team.licensed++;
    }

    if (agent.stage === "Contracted") {
      team.contracted++;
    }
  });

  const growthTeams = Object.values(teams)
    .map((team) => {
      const total = Math.max(team.total, 1);

      team.progress = Math.round(
        ((team.contracted * 3 + team.licensed * 2 + team.active) / (total * 6)) * 100
      );

      return team;
    })
    .sort((a, b) =>
      b.contracted - a.contracted ||
      b.licensed - a.licensed ||
      b.active - a.active ||
      a.inactive - b.inactive
    );

  renderGrowthRows(growthTeams);
  renderGrowthCards(growthTeams);
}

function renderGrowthRows(growthTeams) {
  const list = document.getElementById("teamPerformanceList");
  if (!list) return;

  list.innerHTML = `
    <div class="growth-table-head">
      <span>Rank</span>
      <span>Team</span>
      <span>Progress</span>
      <span>Active</span>
      <span>Licensed</span>
      <span>Contracted</span>
      <span>Inactive</span>
      <span>Status</span>
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
          <span class="momentum-bar">
            <span class="momentum-fill" style="width:${team.progress}%"></span>
          </span>
        </div>

        <div>${team.active}</div>
        <div>${team.licensed}</div>
        <div>${team.contracted}</div>
        <div>${team.inactive}</div>

        <div>
          <span class="status-pill ${status.toLowerCase().replaceAll(" ", "-")}">
            ${status}
          </span>
        </div>
      </div>
    `;
  });
}

function renderGrowthCards(growthTeams) {
  const totalTeams = growthTeams.length;

  const avgProgress = totalTeams
    ? Math.round(growthTeams.reduce((sum, team) => sum + team.progress, 0) / totalTeams)
    : 0;

  const topTeam = growthTeams[0] || {
    name: "No Team",
    progress: 0,
    active: 0,
    licensed: 0,
    contracted: 0,
    inactive: 0
  };

  const needsAttention = growthTeams.filter(team =>
    team.contracted === 0 ||
    team.licensed === 0 ||
    team.progress < 25
  ).length;

  setText("growthTotalTeams", totalTeams);
  setText("growthAvgMomentum", avgProgress);
  setText("growthTopTeam", topTeam.name);
  setText("growthTopMomentum", `Progress ${topTeam.progress}%`);
  setText("growthNeedsAttention", needsAttention);

  setText("spotlightTeamName", topTeam.name);
  setText("spotlightMomentum", `${topTeam.progress}%`);
  setText("spotlightTrend", "#1 Ranked Team");
  setText("spotlightMessage", `${topTeam.contracted} contracted • ${topTeam.licensed} licensed • ${topTeam.active} active`);
  setText("spotlightReason1", `${topTeam.active} Active Agents`);
  setText("spotlightReason2", `${topTeam.licensed} Licensed Agents`);
  setText("spotlightReason3", `${topTeam.contracted} Contracted Agents`);
  setText("growthTrend", `${avgProgress}% average across all teams`);
}

document.addEventListener("click", (event) => {
  const deleteBtn = event.target.closest("[data-delete-agent]");
  if (!deleteBtn) return;

  event.preventDefault();
  event.stopPropagation();

  const key = deleteBtn.dataset.deleteAgent;

  if (!confirm("Delete this agent from the pipeline?")) return;

  allAgents = allAgents.filter((agent) => {
    const agentKey = agent.code || agent.email || agent.name;
    return agentKey !== key;
  });

  saveAgentsToLocalStorage();

  renderAllPages();
});
