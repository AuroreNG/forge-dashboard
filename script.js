console.log("FORGE SCRIPT LOADED - VISUAL SAFE VERSION");

function forgeSymbol(codePoint) {
  return String.fromCodePoint(codePoint);
}
let allAgents = [];
let pendingImportAgents = [];
let selectedCoordinator = "All";
let selectedAgent = null;
let commandCurrentPage = 1;
let commandListFilter = "all";
let selectedGrowthTeam = null;
let currentMessageVariant = "default";
let currentDeliveryMethod = "Text";
let currentForgeMission = [];
let availableOrganizations = [];
let currentOrganization = null;
let isPlatformAdmin = false;
const commandPageSize = 18;
const journeyPreviewLimit = 5;

const expandedJourneyStages = new Set();
let currentJourneyMode = "launch";

let activityLog =
  JSON.parse(localStorage.getItem("forgeActivityLog")) || {};

let checklistLog =
  JSON.parse(localStorage.getItem("forgeChecklistLog")) || {};

function saveChecklistLog() {
  localStorage.setItem(
    "forgeChecklistLog",
    JSON.stringify(checklistLog)
  );
}
function getActiveOrganizationId() {
  return (
    currentOrganization?.id ||
    currentUserProfile?.organization_id ||
    null
  );
}
document.addEventListener(
  "click",
  (event) => {
    const tab =
      event.target.closest(
        "[data-command-tab]"
      );

    if (!tab) return;

    const selectedTab =
      tab.dataset.commandTab;

    document
      .querySelectorAll(
        ".command-tab"
      )
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button === tab
        );
      });

    document
      .getElementById(
        "commandActivityPanel"
      )
      ?.classList.toggle(
        "hidden",
        selectedTab !== "activity"
      );

    document
      .getElementById(
        "commandActionsPanel"
      )
      ?.classList.toggle(
        "hidden",
        selectedTab !== "actions"
      );
  }
);
// ==========================================================
// FORGE JOURNEY STAGES
// Journey tracks only the major licensing milestones.
// Compliance items such as E&O, AML, and Tevah Fee
// are shown separately on Agent + Command Center.
// ==========================================================

// All official Journey stages
const pipelineStages = [
  "Not Placed",
  "Quiz Sent",
  "XCEL Completed",
  "Exam Passed",
  "Licensed",
  "Contracted"
];
const homePipelineStages = [
  "Not Placed",
  "Quiz Sent",
  "XCEL Completed",
  "Exam Passed"
];
// Launch side of Journey
const launchStages = [
  "Not Placed",
  "Quiz Sent",
  "XCEL Completed"
];

// Activate side of Journey
const activateStages = [
  "Exam Passed",
  "Licensed",
  "Contracted"
];

// Used when FORGE needs to identify licensed/activated agents
const licensedStages = [
  "Licensed",
  "Contracted"
];

// Home dashboard stage references
const boardStages = {
  notStarted: "Not Placed",
  quizSent: "Quiz Sent",
  xcel: "XCEL Completed",
  exam: "Exam Passed",
  licensed: "Licensed",
  contracted: "Contracted"
};
/* ==========================================================
   FORGE AUTH GUARD
   Do not allow dashboard access without login
========================================================== */

async function protectForge() {

  try {

    const {
      data: { session },
      error
    } = await forgeSupabase.auth.getSession();

    if (error) {
      console.error(
        "FORGE AUTH CHECK ERROR:",
        error
      );
    }

    if (!session) {

      window.location.replace(
        "./login.html"
      );

      return false;
    }

    console.log(
      "FORGE authenticated:",
      session.user.email
    );

    return true;

  } catch (error) {

    console.error(
      "FORGE AUTH GUARD ERROR:",
      error
    );

    window.location.replace(
      "./login.html"
    );

    return false;
  }
}

async function loadPlatformAdminStatus() {

  const {
    data: { user },
    error: authError
  } = await forgeSupabase.auth.getUser();

  if (authError || !user?.id) {

    console.error(
      "FORGE: Could not determine authenticated user for platform admin check.",
      authError
    );

    isPlatformAdmin = false;
    return;
  }


  const {
    data,
    error
  } = await forgeSupabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();


  if (error) {

    console.error(
      "FORGE PLATFORM ADMIN CHECK ERROR:",
      error
    );

    isPlatformAdmin = false;
    return;
  }


  isPlatformAdmin = !!data;


  console.log(
    "FORGE Platform Admin:",
    isPlatformAdmin
  );
}

//Add org loading 
async function loadAvailableOrganizations() {
  if (!currentUserProfile?.id) return;

  let query = forgeSupabase
    .from("organizations")
    .select(`
      id,
      name,
      slug,
      status
    `)
    .eq("status", "active")
    .order("name");

  const { data, error } = await query;

  if (error) {
    console.error(
      "Could not load organizations:",
      error
    );

    availableOrganizations = [];
    return;
  }

  availableOrganizations = data || [];

  console.log(
    "FORGE organizations:",
    availableOrganizations
  );
}
//set initial org
function setInitialOrganization() {
  if (!availableOrganizations.length) {
    currentOrganization = null;
    return;
  }

  // Prefer the organization already attached
  // to the profile when FORGE first loads.
  const profileOrg =
    availableOrganizations.find(
      (org) =>
        org.id ===
        currentUserProfile?.organization_id
    );

  currentOrganization =
    profileOrg ||
    availableOrganizations[0];

  console.log(
    "Active FORGE organization:",
    currentOrganization
  );
}
function getActiveOrganizationId() {
  return (
    currentOrganization?.id ||
    currentUserProfile?.organization_id ||
    null
  );
}

function renderOrganizationSwitcher() {

  const switcher =
    document.getElementById(
      "platformOrgSwitcher"
    );

  const list =
    document.getElementById(
      "organizationList"
    );

  if (!switcher || !list) return;
    setText(
    "dashboardOrgName",
    currentOrganization?.name ||
      "No Organization"
  );


  // Only Platform Admin gets organization switching
  if (!isPlatformAdmin) {
    switcher.classList.add("hidden");
    return;
  }


  switcher.classList.remove("hidden");


  // Current organization
  setText(
    "currentOrgName",
    currentOrganization?.name ||
      "Select organization"
  );


  setText(
    "currentOrgMeta",
    `${allAgents.length} people`
  );


  // Build organization options
  list.innerHTML = "";


  availableOrganizations.forEach(
    (organization) => {

      const option =
        document.createElement("button");

      option.type = "button";

      option.className =
        "organization-option";


      const active =
        organization.id ===
        currentOrganization?.id;


      if (active) {
        option.classList.add("active");
      }


      option.innerHTML = `

        <div class="organization-option-copy">

          <strong>
            ${organization.name}
          </strong>

          <span>
            ${
              active
                ? `${allAgents.length} people`
                : "Switch workspace"
            }
          </span>

        </div>

        <span class="organization-option-state">
          ${active ? "&#10003;" : "&#8594;"}
        </span>

      `;


      option.addEventListener(
        "click",
        async (event) => {

          event.preventDefault();
          event.stopPropagation();

          await switchForgeOrganization(
            organization.id
          );

        }
      );


      list.appendChild(option);
    }
  );
}
document
  .getElementById("currentOrgButton")
  ?.addEventListener("click", (event) => {

    event.preventDefault();
    event.stopPropagation();

    document
      .getElementById("organizationList")
      ?.classList.toggle("hidden");

  });

async function switchForgeOrganization(
  organizationId
) {

  if (!isPlatformAdmin) {
    console.warn(
      "Organization switching denied."
    );

    return;
  }


  const organization =
    availableOrganizations.find(
      (org) =>
        org.id === organizationId
    );


  if (!organization) {
    console.error(
      "FORGE organization not found:",
      organizationId
    );

    return;
  }


  // Already viewing this organization
  if (
    currentOrganization?.id ===
    organization.id
  ) {
    document
      .getElementById("organizationList")
      ?.classList.add("hidden");

    return;
  }


  console.log(
    "Switching FORGE organization:",
    organization.name
  );


  // Change active tenant
  currentOrganization =
    organization;


  // Clear anything belonging to previous organization
  selectedAgent = null;
  selectedGrowthTeam = null;
  commandCurrentPage = 1;

  expandedJourneyStages.clear();


  // Close menu
  document
    .getElementById("organizationList")
    ?.classList.add("hidden");


  // Show temporary loading state
  setText(
    "currentOrgName",
    organization.name
  );

  setText(
    "currentOrgMeta",
    "Loading..."
  );


  // Reload ONLY this organization's agents
  await loadCSV();


  console.log(
    "FORGE organization switched:",
    organization.name,
    allAgents.length
  );
}
document
  .getElementById("addOrganizationBtn")
  ?.addEventListener("click", () => {

    if (!isPlatformAdmin) {
      return;
    }

    openCreateOrganizationModal();

  });

function openCreateOrganizationModal() {
  alert(
    "Create Organization modal coming next."
  );
}


function openCreateOrganizationModal() {

  if (!isPlatformAdmin) {
    return;
  }

  document
    .getElementById("createOrganizationModal")
    ?.classList.remove("hidden");

  const nameInput =
    document.getElementById("newOrganizationName");

  if (nameInput) {
    nameInput.value = "";
    nameInput.focus();
  }

  document.getElementById(
    "newOrganizationAdminName"
  ).value = "";

  document.getElementById(
    "newOrganizationAdminEmail"
  ).value = "";

  document
    .getElementById("createOrganizationStatus")
    ?.classList.add("hidden");
}


function closeCreateOrganizationModal() {

  document
    .getElementById("createOrganizationModal")
    ?.classList.add("hidden");

}

document
  .getElementById("addOrganizationBtn")
  ?.addEventListener("click", () => {

    if (!isPlatformAdmin) return;

    openCreateOrganizationModal();

  });


document
  .getElementById("closeCreateOrganizationModal")
  ?.addEventListener(
    "click",
    closeCreateOrganizationModal
  );


document
  .getElementById("cancelCreateOrganization")
  ?.addEventListener(
    "click",
    closeCreateOrganizationModal
  );

document.addEventListener("click", (event) => {

  if (
    event.target.classList.contains(
      "modal-backdrop"
    )
  ) {
    closeCreateOrganizationModal();
  }

});

function openCreateOrganizationModal() {
  document
    .getElementById("createOrganizationModal")
    ?.classList.remove("hidden");
}

function closeCreateOrganizationModal() {
  document
    .getElementById("createOrganizationModal")
    ?.classList.add("hidden");
}


// ==========================================================
// CREATE ORGANIZATION
// ==========================================================

function setCreateOrganizationStatus(message, type = "info") {
  const status =
    document.getElementById("createOrganizationStatus");

  if (!status) return;

  status.textContent = message;
  status.dataset.type = type;
  status.classList.remove("hidden");
}


function openCreateOrganizationModal() {
  if (!isPlatformAdmin) return;

  const modal =
    document.getElementById("createOrganizationModal");

  modal?.classList.remove("hidden");

  const organizationNameInput =
    document.getElementById("newOrganizationName");

  const adminNameInput =
    document.getElementById("newOrganizationAdminName");

  const adminEmailInput =
    document.getElementById("newOrganizationAdminEmail");

  const status =
    document.getElementById("createOrganizationStatus");

  if (organizationNameInput) {
    organizationNameInput.value = "";
  }

  if (adminNameInput) {
    adminNameInput.value = "";
  }

  if (adminEmailInput) {
    adminEmailInput.value = "";
  }

  status?.classList.add("hidden");

  setTimeout(() => {
    organizationNameInput?.focus();
  }, 50);
}


function closeCreateOrganizationModal() {
  document
    .getElementById("createOrganizationModal")
    ?.classList.add("hidden");
}


document
  .getElementById("addOrganizationBtn")
  ?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    openCreateOrganizationModal();
  });


document
  .getElementById("closeCreateOrganizationModal")
  ?.addEventListener("click", () => {
    closeCreateOrganizationModal();
  });


document
  .getElementById("cancelCreateOrganization")
  ?.addEventListener("click", () => {
    closeCreateOrganizationModal();
  });


document
  .getElementById("createOrganizationModal")
  ?.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) {
      closeCreateOrganizationModal();
    }
  });


document
  .getElementById("saveCreateOrganization")
  ?.addEventListener("click", async () => {
    if (!isPlatformAdmin) {
      setCreateOrganizationStatus(
        "Only a Platform Admin can create organizations.",
        "error"
      );

      return;
    }

    const organizationName =
      document
        .getElementById("newOrganizationName")
        ?.value.trim();

    const adminName =
      document
        .getElementById("newOrganizationAdminName")
        ?.value.trim();

    const adminEmail =
      document
        .getElementById("newOrganizationAdminEmail")
        ?.value.trim()
        .toLowerCase();

    if (!organizationName) {
      setCreateOrganizationStatus(
        "Enter the organization name.",
        "error"
      );

      return;
    }

    if (!adminName) {
      setCreateOrganizationStatus(
        "Enter the administrators name.",
        "error"
      );

      return;
    }

    if (!adminEmail) {
      setCreateOrganizationStatus(
        "Enter the administrators email.",
        "error"
      );

      return;
    }

    const emailIsValid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail);

    if (!emailIsValid) {
      setCreateOrganizationStatus(
        "Enter a valid administrator email.",
        "error"
      );

      return;
    }

    const saveButton =
      document.getElementById("saveCreateOrganization");

    const originalButtonText =
      saveButton?.textContent || "Create Organization";

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Creating...";
    }

    setCreateOrganizationStatus(
      "Creating the organization...",
      "info"
    );

        try {
      // Refresh the authenticated session before
      // calling the protected Edge Function.
      const {
        data: refreshedSession,
        error: refreshError
      } =
        await forgeSupabase.auth
          .refreshSession();

      const accessToken =
        refreshedSession?.session
          ?.access_token;

      if (refreshError || !accessToken) {
        throw new Error(
          "Your FORGE session has expired. Please log out and log in again."
        );
      }

      const { data, error } =
        await forgeSupabase.functions.invoke(
          "create-organization-invite",
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`
            },

            body: {
              organizationName,
              adminName,
              adminEmail
            }
          }
        );

      if (error) {
        let errorMessage =
          error.message ||
          "FORGE could not create the organization.";

        try {
          const errorBody =
            await error.context?.json();

          if (errorBody?.error) {
            errorMessage =
              errorBody.error;
          }
        } catch (responseError) {
          console.warn(
            "Could not read function error response:",
            responseError
          );
        }

        throw new Error(errorMessage);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const createdOrganization =
        data?.organization;

      if (!createdOrganization?.id) {
        throw new Error(
          "The organization was created, but FORGE did not receive its information."
        );
      }

           setCreateOrganizationStatus(
        data?.message ||
          `${createdOrganization.name} was created successfully.`,
        "success"
      );

      await loadAvailableOrganizations();

      currentOrganization =
        availableOrganizations.find(
          (organization) =>
            organization.id === createdOrganization.id
        ) || createdOrganization;

      selectedAgent = null;
      selectedGrowthTeam = null;
      commandCurrentPage = 1;
      expandedJourneyStages.clear();

      await loadCSV();
      renderOrganizationSwitcher();

      setTimeout(() => {
        closeCreateOrganizationModal();
      }, 800);

    } catch (error) {
      console.error(
        "FORGE CREATE ORGANIZATION ERROR:",
        error
      );

      setCreateOrganizationStatus(
        error?.message ||
          "FORGE could not create the organization.",
        "error"
      );

    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = originalButtonText;
      }
    }
  });
//  MERGE 

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

//  RENDER ALL 

function renderAllPages() {
  updateTime();
  renderDashboard("all");
  renderJourneyPage();
  renderAgentsPage();
  renderCommandCenter();
  renderGrowthPage();
}

// ==========================================================
// HOME - TODAY'S WORK QUEUE
// ==========================================================

function renderHomeWorkQueue(agents) {
  const container =
    document.getElementById("workQueueList");

  if (!container) return;

  const queue = [];

  agents.forEach((agent) => {
    const stage =
      agent.stage || "Not Placed";

    const recruitDate =
      agent.recruitDate
        ? new Date(agent.recruitDate)
        : null;

    let daysSinceRecruit = null;

    if (
      recruitDate &&
      !Number.isNaN(recruitDate.getTime())
    ) {
      daysSinceRecruit =
        Math.floor(
          (Date.now() - recruitDate.getTime()) /
          (1000 * 60 * 60 * 24)
        );
    }


    // =====================================================
    // LICENSED - READY FOR CONTRACTING
    // =====================================================

    if (stage === "Licensed") {
      queue.push({
        agent,
        priority: "High",
        score: 100,

        reason:
          "Ready for contracting",

        detail:
          "Licensed",

        action:
          "Start contracting"
      });

      return;
    }


    // =====================================================
    // NOT PLACED - STALLED / NOT STARTED
    // =====================================================

    if (stage === "Not Placed") {

      let score = 70;

      let reason =
        "Licensing not started";

      let detail =
        "Needs follow-up";


      if (
        daysSinceRecruit !== null &&
        daysSinceRecruit >= 14
      ) {
        score = 95;

        reason =
          "No licensing movement";

        detail =
          `${daysSinceRecruit} days`;
      }

      else if (
        daysSinceRecruit !== null &&
        daysSinceRecruit >= 7
      ) {
        score = 85;

        reason =
          "Still not started";

        detail =
          `${daysSinceRecruit} days`;
      }


      queue.push({
        agent,
        priority:
          score >= 90
            ? "High"
            : "Medium",

        score,

        reason,
        detail,

        action:
          "Follow up"
      });

      return;
    }


    // =====================================================
    // QUIZ SENT
    // =====================================================

    if (stage === "Quiz Sent") {

      queue.push({
        agent,

        priority: "Medium",
        score: 80,

        reason:
          "Quiz awaiting completion",

        detail:
          "Quiz Sent",

        action:
          "Check in"
      });

      return;
    }


    // =====================================================
    // XCEL
    // =====================================================

    if (stage === "XCEL Completed") {

      queue.push({
        agent,

        priority: "Medium",
        score: 65,

        reason:
          "Ready for next step",

        detail:
          "XCEL completed",

        action:
          "Prepare exam"
      });

      return;
    }


    // =====================================================
    // EXAM PASSED
    // =====================================================

    if (stage === "Exam Passed") {

      queue.push({
        agent,

        priority: "High",
        score: 92,

        reason:
          "Exam completed",

        detail:
          "Ready to advance",

        action:
          "Move forward"
      });
    }
  });


  // ========================================================
  // SORT
  // ========================================================

    queue.sort(
    (a, b) =>
      b.score - a.score
  );

  currentForgeMission = queue;

  const visibleQueue =
    queue.slice(0, 5);


  setText(
    "workQueueAttentionCount",
    `${visibleQueue.length} ${
      visibleQueue.length === 1
        ? "needs"
        : "need"
    } your attention`
  );

  // ==========================================================
// HOME WORK QUEUE -> INTELLIGENCE DRAWER
// ==========================================================

[
  "startFollowUpsBtn",
  "viewAllWorkQueueBtn"
].forEach((buttonId) => {
  document
    .getElementById(buttonId)
    ?.addEventListener(
      "click",
      () => {
        openForgeIntelligenceDrawer(
          "work-queue"
        );
      }
    );
});

  
  container.innerHTML = "";


  if (!visibleQueue.length) {

    container.innerHTML = `
      <div class="work-queue-empty">
        <strong>
          You're all caught up.
        </strong>

        <span>
          No priority follow-ups right now.
        </span>
      </div>
    `;

    return;
  }


  visibleQueue.forEach((item) => {

    const agent =
      item.agent;

    const priorityClass =
      item.priority === "High"
        ? "priority-high"
        : item.priority === "Medium"
        ? "priority-medium"
        : "priority-low";


    const row =
      document.createElement("div");

    row.className =
      "work-queue-row";


    row.innerHTML = `

      <div class="work-person">

        <div class="work-avatar">
          ${getInitials(
            getAgentDisplayName(agent)
          )}
        </div>

        <div class="work-person-copy">

          <strong>
            ${getAgentDisplayName(agent)}
          </strong>

          <span>
            ${agent.stage || "Not Placed"}
          </span>

        </div>

      </div>


      <div class="work-reason">

        <div class="work-reason-icon">
          ${getWorkReasonIcon(
            item.reason
          )}
        </div>

        <div class="work-reason-copy">

          <strong>
            ${item.reason}
          </strong>

          <span>
            ${item.detail}
          </span>

        </div>

      </div>


      <div>

        <button
          type="button"
          class="work-action-btn"
        >
          ${item.action}
        </button>

      </div>


      <div
        class="work-priority ${priorityClass}"
      >
        <span class="priority-dot"></span>

        ${item.priority}
      </div>


      <div class="work-last-activity">
        ${
          agent.recruitDate
            ? formatHomeDate(
                agent.recruitDate
              )
            : "-"
        }
      </div>

    `;


   row
  .querySelector(
    ".work-action-btn"
  )
  ?.addEventListener(
    "click",
    () => {

      const relatedAgents =
        currentForgeMission
          .map(
            (item) =>
              item.agent
          );


      launchForgeContext({
        type:
          agent.stage === "Licensed"
            ? "contracting"
            : "follow-up",

        title:
          item.action,

        reason:
          item.reason,

        agents: [
          agent,
          ...relatedAgents.filter(
            (a) =>
              a.id !== agent.id
          )
        ]
      });

    }
  );


    container.appendChild(
      row
    );

  });
}

// ==========================================================
// FORGE CONTEXT ENGINE
// ==========================================================

let forgeContext = null;

function launchForgeContext(config = {}) {
  forgeContext = {
    type: config.type || "view",
    stage: config.stage || null,
    agents: config.agents || [],
    title: config.title || "",
    reason: config.reason || "",
    index: 0
  };

  // ========================================================
  // EXPLORATION
  // ========================================================

  if (config.type === "journey") {
    window.journeyFocusStage =
      config.stage || null;

    showPage("Journey");

    renderJourneyPage?.();

    setActiveForgeNav("Journey");

    return;
  }


  if (config.type === "agents") {
    window.agentViewFilter =
      config.stage || "all";

    showPage("Agents");

    renderAgentsPage?.();

    setActiveForgeNav("Agents");

    return;
  }


  if (config.type === "growth") {
    showPage("Growth");

    renderGrowthPage?.();

    setActiveForgeNav("Growth");

    return;
  }


  // ========================================================
  // ACTION WORKFLOW
  // ========================================================

  if (
    config.type === "mission" ||
    config.type === "contracting" ||
    config.type === "follow-up"
  ) {
    startForgeWorkSession(
      forgeContext
    );

    return;
  }
}


function setActiveForgeNav(page) {
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.textContent.trim() === page
      );
    });
}

function startForgeWorkSession(context) {
  if (!context?.agents?.length) {
    console.warn(
      "FORGE session has no agents:",
      context
    );
    return;
  }

  forgeContext = {
    ...context,
    index: 0
  };

  const firstAgent =
    context.agents[0];

  selectedAgent =
    firstAgent;

  // Save session state
  window.commandSessionMode =
    context.type || "mission";

  window.commandSessionTitle =
    context.title || "FORGE Mission";

  window.commandSessionAgents =
    context.agents;

  window.commandSessionIndex = 0;


  // Go to Command page
  showPage("Command");

  setActiveForgeNav("Command");


  // Only call this if it actually exists
  if (
    typeof renderCommandAgentList ===
    "function"
  ) {
    renderCommandAgentList();
  }


  // Open the first person's Command profile
  if (
    typeof showCommandProfile ===
    "function"
  ) {
    showCommandProfile(
      firstAgent
    );
  } else {
    console.error(
      "showCommandProfile() is not available."
    );
  }
}

function getWorkReasonIcon(reason) {
  const text =
    String(reason || "")
      .toLowerCase();

  if (
    text.includes("contract")
  ) {
    return "&#10003;";
  }

  if (
    text.includes("exam")
  ) {
    return "&#9671;";
  }

  if (
    text.includes("quiz")
  ) {
    return "&#8594;";
  }

  if (
    text.includes("movement") ||
    text.includes("started")
  ) {
    return "&#9687;";
  }

  return "&#8226;";
}


function formatHomeDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );
}

//  CSV 

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    }

    else if (char === "," && !insideQuotes) {
      row.push(field.trim());
      field = "";
    }

    else if ((char === "\n" || char === "\r") && !insideQuotes) {
      // Handle CRLF
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(field.trim());
      field = "";

      if (row.some(value => value !== "")) {
        rows.push(row);
      }

      row = [];
    }

    else {
      field += char;
    }
  }

  // Final field/row
  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map(header =>
    header.replace(/^"|"$/g, "").trim()
  );

  return rows.slice(1).map(values => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] ?? "";
    });

    return obj;
  });
}



// ==========================================================
// NORMALIZE TEAM CSV
// This is for the main FORGE team.csv format.
//
// Journey stage comes from Team Status:
// Contracted  -> Contracted
// License     -> Licensed
// Non-Licensed Active -> XCEL
// Everything else -> Not Placed
// ==========================================================

// ==========================================================
// NORMALIZE MAIN TEAM CSV
// This decides where each person belongs in the Journey.
//
// Examples:
// Active, License, Contracted  -> Contracted
// Active, Contracted, License  -> Contracted
// Active, License              -> Licensed
// Inactive, License            -> Licensed
// Active, Non-Licensed         -> XCEL
// Inactive, Non-Licensed       -> Not Placed
// ==========================================================

function normalizeTeamStage(teamStatus) {
  const s = String(teamStatus || "")
    .trim()
    .toLowerCase();

  if (s.includes("contracted")) return "Contracted";
  if (s.includes("license")) return "Licensed";
  if (s.includes("exam passed")) return "Exam Passed";
  if (s.includes("xcel")) return "XCEL Completed";
  if (s.includes("quiz passed")) return "Quiz Passed";
  if (s.includes("quiz sent")) return "Quiz Sent";

  return "Not Placed";
}

function cleanAgentName(name) {
  return String(name || "")
    .trim()

    // Remove titles
    .replace(
      /^(mr|mrs|ms|miss|dr|doctor|prof|professor)\.?\s+/i,
      ""
    )

    // Remove & everywhere in names
    .replace(/\s*&\s*/g, " ")

    // Clean extra spaces
    .replace(/\s+/g, " ")

    .trim();
}

function normalizeAgent(row) {
  const teamStatus = String(
    row["Team Status"] || ""
  ).trim();

  return {
    code: String(
      row["Agent Code"] || ""
    ).trim(),

    phone: String(
      row["Phone"] || ""
    ).trim(),

    name: cleanAgentName(
      row["Full name"] || ""
    ),

    email: String(
      row["Email"] || ""
    ).trim().toLowerCase(),

    recruitDate: String(
      row["Recruit Date ( CST )"] || ""
    ).trim(),

    uplineCode: String(
      row["Upline Code"] || ""
    ).trim(),

    upline: cleanAgentName(
      row["Upline Name"] || ""
    ),

    teamStatus: teamStatus,

    stage: normalizeTeamStage(teamStatus)
  };
}

function normalizeRecruitAgent(row) {
  return {
    name: cleanAgentName(
      row["RECRUIT NAME"] || ""
    ),

    code: String(
      row["RECRUIT CODE"] || ""
    ).trim(),

    phone: String(
      row["PHONE"] || ""
    ).trim(),

    email: String(
      row["EMAIL"] || ""
    ).trim().toLowerCase(),

    recruitDate: String(
      row["RECRUIT DATE"] || ""
    ).trim()
  };
}
//For every Compliance record, find the matching Team member:
function normalizeMatchName(name) {
  return cleanAgentName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
//For the recruit export, we also need to determine 
//the recruiter/upline from the filename, like: Nkem Nwabufo_byRecruit_details.csv
function getRecruiterNameFromFilename(filename) {
  return cleanAgentName(
    String(filename || "")
      .replace(/\.[^.]+$/, "")
      .replace(/_byRecruit.*$/i, "")
      .replace(/_/g, " ")
      .trim()
  );
}
//Then find that recruiter already in FORGE:
function findAgentBySmartMatch({ code, email, name }) {

  const cleanCode =
    String(code || "").trim().toLowerCase();

  const cleanEmail =
    String(email || "").trim().toLowerCase();

  const cleanName =
    normalizeMatchName(name);

  if (cleanCode) {
    const match = allAgents.find(
      agent =>
        String(agent.code || "")
          .trim()
          .toLowerCase() === cleanCode
    );

    if (match) return match;
  }

  if (cleanEmail) {
    const match = allAgents.find(
      agent =>
        String(agent.email || "")
          .trim()
          .toLowerCase() === cleanEmail
    );

    if (match) return match;
  }

  if (cleanName) {
    const match = allAgents.find(
      agent =>
        normalizeMatchName(agent.name) === cleanName
    );

    if (match) return match;
  }

  return null;
}

//Now comes the Recruit importer.
async function importRecruitFile(parsedRows, file) {

  const recruiterName =
    getRecruiterNameFromFilename(file.name);

  console.log(
    "Recruit export recruiter:",
    recruiterName
  );

  const recruiter =
    findAgentBySmartMatch({
      name: recruiterName
    });

  if (!recruiter) {
    throw new Error(
      `FORGE could not find recruiter "${recruiterName}" in the existing team.`
    );
  }

  const recruits =
    parsedRows
      .map(normalizeRecruitAgent)
      .filter(agent =>
        agent.code &&
        agent.code.trim() !== ""
      );

  let created = 0;
  let updated = 0;

  for (const recruit of recruits) {

    const existing =
      findAgentBySmartMatch(recruit);

    const row = {
      organization_id:
        currentUserProfile.organization_id,

      agent_code:
        recruit.code,

      name:
        cleanAgentName(recruit.name),

      phone:
        recruit.phone || null,

      email:
        recruit.email || null,

      recruit_date:
        recruit.recruitDate || null,

      upline_name:
        cleanAgentName(recruiter.name),

      upline_code:
        recruiter.code || null,

      // Preserve existing Journey stage
      // otherwise brand-new recruits begin here.
      stage:
        existing?.stage || "Not Placed",

      team_status:
        existing?.teamStatus || null,

      import_source:
        "Tevah Recruit"
    };

    const { error } = await forgeSupabase
      .from("agents")
      .upsert(row, {
        onConflict:
          "organization_id,agent_code",
        ignoreDuplicates: false
      });

    if (error) {
      console.error(
        "Recruit import error:",
        recruit.code,
        error
      );
      continue;
    }

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  await loadCSV();

  alert(
    `Recruit import complete. ${created} new recruits added. ${updated} existing agents updated.`
  );
}


function findExistingTeamAgent(complianceAgent) {
  const code =
    String(complianceAgent.code || "")
      .trim()
      .toLowerCase();

  const email =
    String(complianceAgent.email || "")
      .trim()
      .toLowerCase();

  const name =
    normalizeMatchName(complianceAgent.name);

  // 1. Agent Code - strongest match
  if (code) {
    const byCode = allAgents.find(
      a =>
        String(a.code || "")
          .trim()
          .toLowerCase() === code
    );

    if (byCode) return byCode;
  }

  // 2. Email
  if (email) {
    const byEmail = allAgents.find(
      a =>
        String(a.email || "")
          .trim()
          .toLowerCase() === email
    );

    if (byEmail) return byEmail;
  }

  // 3. Cleaned name
  if (name) {
    return allAgents.find(
      a =>
        normalizeMatchName(a.name) === name
    ) || null;
  }

  return null;
}

// ==========================================================
// COMPLIANCE CSV NORMALIZER
// Resident License determines whether the person is licensed.
// E&O / AML are compliance checks, not licensing stages.
// ==========================================================

function normalizeComplianceAgent(row) {
  const residentLicense =
    String(row["RESI. LICENSE"] || "").trim();

  const eoStatus =
    String(row["E&O"] || "").trim();

  const amlStatus =
    String(row["AML"] || "").trim();

  const tevahFee =
    String(row["TEVAH PLATFORM FEE"] || "").trim();

  return {
    name: cleanAgentName(row["AGENT NAME"]),

    code: String(row["CODE"] || "").trim(),

    email: String(row["EMAIL"] || "").trim(),

    level: String(row["LEVEL"] || "").trim(),

    upline: cleanAgentName(row["UPLINE AGENT"]),

    uplineLeader: cleanAgentName(row["UPLINE LEADER"]),

    residentState:
      String(row["RESI. STATE"] || "").trim(),

    residentLicense,

    eoStatus,

    amlStatus,

    tevahPlatformFee: tevahFee,

    teamStatus:
      String(row["STATUS"] || "").trim(),

    npn:
      String(row["NPN"] || "").trim()
  };
}
//Now add a detector. This is the intelligence that looks at 
//the headers and decides which Tevah export you gave FORGE:
function detectTevahFileType(rows) {
  if (!rows?.length) return "unknown";

  const headers = Object.keys(rows[0]);

  if (
    headers.includes("Agent Code") &&
    headers.includes("Full name") &&
    headers.includes("Team Status")
  ) {
    return "team";
  }

  if (
    headers.includes("AGENT NAME") &&
    headers.includes("CODE") &&
    headers.includes("RESI. LICENSE")
  ) {
    return "compliance";
  }

  if (
    headers.includes("RECRUIT NAME") &&
    headers.includes("RECRUIT CODE")
  ) {
    return "recruit";
  }

  return "unknown";
}

function getMetrics(list) {
  const totalTeam = list.length;

  const pipeline =
    list.filter((a) =>
      homePipelineStages.includes(a.stage)
    ).length;

  const licensed =
    list.filter(
      (a) =>
        a.stage === "Licensed" ||
        a.stage === "Contracted"
    ).length;

  const contracted =
    list.filter(
      (a) => a.stage === "Contracted"
    ).length;

  const licensingRate =
    totalTeam > 0
      ? Math.round((licensed / totalTeam) * 100)
      : 0;

  const contractingRate =
    licensed > 0
      ? Math.round((contracted / licensed) * 100)
      : 0;

  const activationRate =
    totalTeam > 0
      ? Math.round((contracted / totalTeam) * 100)
      : 0;

  return {
    totalTeam,
    pipeline,
    licensed,
    contracted,
    licensingRate,
    contractingRate,
    activationRate
  };
}

function getVisibleAgents() {
  return allAgents;
}

function renderDashboard(filter = "all") {
  const visibleAgents = getVisibleAgents();

  let filtered = visibleAgents;

  if (filter === "pipeline") {
    filtered = visibleAgents.filter((agent) =>
      homePipelineStages.includes(agent.stage)
    );
  }

  if (filter === "licensed") {
    filtered = visibleAgents.filter(
      (agent) =>
        agent.stage === "Licensed" ||
        agent.stage === "Contracted"
    );
  }

  if (filter === "contracted") {
    filtered = visibleAgents.filter(
      (agent) => agent.stage === "Contracted"
    );
  }

  const filteredMetrics = getMetrics(filtered);
  const allMetrics = getMetrics(visibleAgents);

  setText("totalCount", filteredMetrics.totalTeam);
  setText("pipelineCount", filteredMetrics.pipeline);
  setText("licensedCount", filteredMetrics.licensed);
  setText("contractedCount", filteredMetrics.contracted);

  setText("journeyActive", allMetrics.totalTeam);
  setText("journeyNonLicensed", allMetrics.pipeline);
  setText("journeyLicensed", allMetrics.licensed);
  setText("journeyContracted", allMetrics.contracted);

  setText(
    "licensingRate",
    allMetrics.licensingRate + "%"
  );

  setText(
    "contractingRate",
    allMetrics.contractingRate + "%"
  );

  setText(
    "licensingFraction",
    `${allMetrics.licensed} / ${allMetrics.totalTeam}`
  );

  setText(
    "contractingFraction",
    `${allMetrics.contracted} / ${allMetrics.licensed}`
  );

  setRing(
    "licensingRing",
    allMetrics.licensingRate,
    "#2563eb"
  );

  setRing(
    "contractingRing",
    allMetrics.contractingRate,
    "#16a34a"
  );

  renderFocusList(visibleAgents);
renderPipelineBoard(visibleAgents);

updateHomeIntelligence(visibleAgents);

renderHomeWorkQueue(visibleAgents);

renderHomePipelineOverview(visibleAgents);
}

function setRing(id, percent, color) {
  const ring = document.getElementById(id);
  if (!ring) return;
  ring.style.background = `conic-gradient(${color} 0 ${percent}%, #e8edf5 ${percent}% 100%)`;
}

function renderFocusList(agents) {
  const focusList =
    document.getElementById("focusList");

  if (!focusList) return;

  const focusAgents = agents
    .filter((a) =>
      homePipelineStages.includes(a.stage)
    )
    .slice(0, 5);

  focusList.innerHTML = "";

  focusAgents.forEach((agent) => {
    const row = document.createElement("div");

    row.className = "focus-row";

    row.innerHTML = `
      <div class="focus-avatar">
        ${getInitials(agent.name)}
      </div>

      <div>
        <b>${agent.name}</b>
        <span>${agent.stage}</span>
      </div>
    `;

    focusList.appendChild(row);
  });
}

document.addEventListener(
  "click",
  (event) => {

    const button =
      event.target.closest(
        ".home-kpi-link"
      );

    if (!button) return;

    const action =
      button.dataset.kpiAction;

    switch (action) {

      case "all":

        launchForgeContext({
          type: "agents",
          title: "Organization"
        });

        break;


      case "pipeline":

        launchForgeContext({
          type: "journey",
          title: "Licensing Pipeline"
        });

        break;


      case "licensed":

        launchForgeContext({
          type: "journey",
          stage: "Licensed",
          title: "Licensed Agents"
        });

        break;


      case "contracted":

        launchForgeContext({
          type: "journey",
          stage: "Contracted",
          title: "Contracted Agents"
        });

        break;

    }

  }
);

function getPrimaryForgeOpportunity(
  agents
) {

  const licensed =
    agents.filter(
      (a) =>
        a.stage === "Licensed"
    );


  const notPlaced =
    agents.filter(
      (a) =>
        a.stage === "Not Placed"
    );


  const quizSent =
    agents.filter(
      (a) =>
        a.stage === "Quiz Sent"
    );


  // Contracting has immediate downstream value
  if (licensed.length) {
    return {
      type: "contracting",
      title: "Complete Contracting",
      agents: licensed
    };
  }


  // Then activation
  if (notPlaced.length) {
    return {
      type: "follow-up",
      title: "Activate Not Placed Agents",
      agents: notPlaced
    };
  }


  // Then quiz follow-up
  if (quizSent.length) {
    return {
      type: "follow-up",
      title: "Quiz Follow-Ups",
      agents: quizSent
    };
  }


  return null;
}
document
  .getElementById(
    "forgeInsightBtn"
  )
  ?.addEventListener(
    "click",
    () => {

      const opportunity =
        getPrimaryForgeOpportunity(
          allAgents
        );

      if (!opportunity) {
        launchForgeContext({
          type: "journey"
        });

        return;
      }

      launchForgeContext(
        opportunity
      );

    }
  );

// ==========================================================
// FORGE INTELLIGENCE DRAWER ENGINE
// ==========================================================

let forgeDrawerPriorityAgents = [];
let forgeDrawerMode = "all";


function escapeForgeText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function getForgeAgentAge(agent) {
  const value =
    agent.recruitDate ||
    agent.recruit_date ||
    null;

  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - date.getTime()) /
      (1000 * 60 * 60 * 24)
    )
  );
}


function getForgeStallLimit(stage) {
  const limits = {
    "Not Placed": 7,
    "Quiz Sent": 10,
    "XCEL Completed": 21,
    "Exam Passed": 30,
    "Licensed": 45
  };

  return limits[stage] ?? null;
}


function analyzeForgePriority(agent) {
  const stage =
    agent.stage || "Not Placed";

  if (stage === "Contracted") {
    return null;
  }

  const age =
    getForgeAgentAge(agent);

  const stallLimit =
    getForgeStallLimit(stage);

  const stalled =
    age !== null &&
    stallLimit !== null &&
    age >= stallLimit;

  let score = 0;
  let reason = "";
  let detail = "";
  let action = "";
  let level = "medium";

  switch (stage) {
    case "Licensed":
      score = 100;
      reason = "Ready for contracting";
      detail =
        "License approved-convert this agent into production.";
      action = "Start Contracting";
      level = "ready";
      break;

    case "Exam Passed":
      score = 92;
      reason = "License activation required";
      detail =
        "Exam passed-complete the state licensing step.";
      action = "Activate License";
      level = "ready";
      break;

    case "Not Placed":
      score = 78;
      reason = "Licensing not started";
      detail =
        "Begin onboarding and send the readiness quiz.";
      action = "Start Follow-Up";
      level = "high";
      break;

    case "Quiz Sent":
      score = 70;
      reason = "Quiz awaiting completion";
      detail =
        "Follow up and remove the completion barrier.";
      action = "Send Reminder";
      level = "medium";
      break;

    case "XCEL Completed":
      score = 62;
      reason = "Exam preparation";
      detail =
        "Confirm exam readiness and scheduling.";
      action = "Prepare Exam";
      level = "medium";
      break;

    default:
      score = 40;
      reason = "Journey review needed";
      detail =
        "Review the agents licensing progress.";
      action = "Review Agent";
      level = "medium";
  }

  if (stalled) {
    score += 28;
    level = "high";

    detail =
      age !== null
        ? `${age} days since recruitment-follow-up is overdue.`
        : "Follow-up is overdue.";
  }

  return {
    agent,
    stage,
    score,
    reason,
    detail,
    action,
    level,
    stalled,
    age
  };
}


function getForgePriorityAnalysis(agents) {
  return (agents || [])
    .map(analyzeForgePriority)
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score
    );
}


function renderForgeIntelligenceDrawer() {
    const completeAnalysis =
    getForgePriorityAnalysis(allAgents);

  const analysis =
    forgeDrawerMode === "contracting"
      ? completeAnalysis.filter(
          (item) =>
            item.stage === "Licensed"
        )
      : completeAnalysis;

  forgeDrawerPriorityAgents =
    analysis.map(
      (item) => item.agent
    );

    const licensed =
    completeAnalysis.filter(
      (item) =>
        item.stage === "Licensed"
    );

  const activation =
    completeAnalysis.filter(
      (item) =>
        item.stage === "Not Placed"
    );

  const stalled =
    completeAnalysis.filter(
      (item) => item.stalled
    );

  setText(
    "forgeDrawerOrganization",
    `${currentOrganization?.name || "Organization"} Workspace`
  );

  setText(
    "drawerContractingCount",
    licensed.length
  );

  setText(
    "drawerActivationCount",
    activation.length
  );

  setText(
    "drawerStalledCount",
    stalled.length
  );

  setText(
    "forgePriorityCount",
    `${analysis.length} ${
      analysis.length === 1
        ? "person"
        : "people"
    }`
  );


  // ========================================================
  // INTELLIGENT RECOMMENDATION
  // ========================================================

  let recommendationTitle =
    "Your organization is moving forward";

  let recommendationText =
    "No urgent licensing bottleneck was detected.";

  if (licensed.length > 0) {
    recommendationTitle =
      `Convert ${licensed.length} licensed ${
        licensed.length === 1
          ? "agent"
          : "agents"
      } into production`;

    recommendationText =
      "Contracting is the highest-impact opportunity because these agents are already licensed and closest to writing business.";
  }

  else if (stalled.length > 0) {
    recommendationTitle =
      `Recover ${stalled.length} stalled ${
        stalled.length === 1
          ? "agent"
          : "agents"
      }`;

    recommendationText =
      "These agents have exceeded their expected follow-up window. Start with the longest-delayed cases.";
  }

  else if (activation.length > 0) {
    recommendationTitle =
      `Activate ${activation.length} new ${
        activation.length === 1
          ? "recruit"
          : "recruits"
      }`;

    recommendationText =
      "Move these recruits from Not Placed by sending the welcome message and licensing readiness quiz.";
  }

  setText(
    "forgeRecommendationTitle",
    recommendationTitle
  );

  setText(
    "forgeRecommendationText",
    recommendationText
  );


  // ========================================================
  // PRIORITY LIST
  // ========================================================

  const list =
    document.getElementById(
      "forgePriorityList"
    );

  if (!list) return;

  list.innerHTML = "";

  if (!analysis.length) {
    list.innerHTML = `
      <div class="forge-priority-empty">
         No priority actions right now.
      </div>
    `;

    document
      .getElementById("startForgePrioritySession")
      ?.setAttribute("disabled", "true");

    return;
  }

  document
    .getElementById("startForgePrioritySession")
    ?.removeAttribute("disabled");


  analysis
    .slice(0, 12)
    .forEach((item) => {
      const agent = item.agent;

      const row =
        document.createElement("article");

      row.className =
        "forge-priority-item";

      row.innerHTML = `
        <div class="forge-priority-avatar">
          ${getInitials(agent.name || "Agent")}
        </div>

        <div class="forge-priority-copy">
          <strong>
            ${escapeForgeText(agent.name || "Unnamed Agent")}
          </strong>

          <span>
            ${escapeForgeText(item.stage)}
            -
            ${escapeForgeText(
              agent.upline ||
              agent.coordinator ||
              "No upline"
            )}
          </span>

          <span class="forge-priority-reason ${item.level}">
            ${
              item.stalled
                ? ""
                : item.level === "ready"
                ? "&#8594;"
                : "&#9679;"
            }

            ${escapeForgeText(item.reason)}
          </span>

          <span>
            ${escapeForgeText(item.detail)}
          </span>
        </div>

        <button
          type="button"
          class="forge-priority-open"
          data-forge-priority-agent="${escapeForgeText(agent.id)}"
        >
          ${escapeForgeText(item.action)}
        </button>
      `;

      list.appendChild(row);
    });
}


function openForgeIntelligenceDrawer(
  mode = "all"
) {
  forgeDrawerMode =
    typeof mode === "string"
      ? mode
      : "all";

  renderForgeIntelligenceDrawer();

  document
    .getElementById("forgeIntelligenceOverlay")
    ?.classList.remove("hidden");

  const drawer =
    document.getElementById(
      "forgeIntelligenceDrawer"
    );

  drawer?.classList.add("open");

  drawer?.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "forge-drawer-open"
  );
}


function closeForgeIntelligenceDrawer() {
  document
    .getElementById("forgeIntelligenceOverlay")
    ?.classList.add("hidden");

  const drawer =
    document.getElementById(
      "forgeIntelligenceDrawer"
    );

  drawer?.classList.remove("open");

  drawer?.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "forge-drawer-open"
  );
}


// OPEN DRAWER
document
  .getElementById("forgeInsightBtn")
  ?.addEventListener(
    "click",
    () => {
      openForgeIntelligenceDrawer(
        "all"
      );
    }
  );


// CLOSE DRAWER
document
  .getElementById("closeForgeIntelligence")
  ?.addEventListener(
    "click",
    closeForgeIntelligenceDrawer
  );


document
  .getElementById("forgeIntelligenceOverlay")
  ?.addEventListener(
    "click",
    closeForgeIntelligenceDrawer
  );


document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeForgeIntelligenceDrawer();
    }
  }
);


// START THE COMPLETE PRIORITY SESSION
document
  .getElementById("startForgePrioritySession")
  ?.addEventListener(
    "click",
    () => {
      if (!forgeDrawerPriorityAgents.length) {
        return;
      }

      closeForgeIntelligenceDrawer();

      launchForgeContext({
        type: "mission",
        title: "FORGE Priority Session",
        reason:
          "Highest-impact licensing actions for the active organization",
        agents:
          forgeDrawerPriorityAgents
      });
    }
  );


// OPEN ONE PRIORITY AGENT
document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-forge-priority-agent]"
      );

    if (!button) return;

    const agent =
      allAgents.find(
        (item) =>
          String(item.id) ===
          String(
            button.dataset
              .forgePriorityAgent
          )
      );

    if (!agent) return;

    closeForgeIntelligenceDrawer();

    launchForgeContext({
      type: "mission",
      title:
        `Priority: ${agent.name}`,
      reason:
        "FORGE Intelligence recommended action",
      agents: [agent]
    });
  }
);


function renderPipelineBoard(agents) {
  renderStage("Not Placed",   "notStartedCount",         "notStartedList",         agents);
  renderStage("Quiz Sent",    "quizSentCount",            "quizSentList",            agents);
  renderStage("XCEL Completed","xcelCount",               "xcelList",                agents);
renderStage(
  "Exam Passed",
  "examCount",
  "examList",
  agents
);
  renderStage("Licensed",     "licensedPipelineCount",    "licensedPipelineList",    agents);
  renderStage("Contracted",   "contractedPipelineCount",  "contractedPipelineList",  agents);
}
document
  .getElementById("pulseActionBtn")
  ?.addEventListener(
    "click",
    () => {
      openForgeIntelligenceDrawer(
        "contracting"
      );
    }
  );


// ==========================================================
// HOME - PIPELINE OVERVIEW
// ==========================================================

function renderHomePipelineOverview(agents) {
  const container =
    document.getElementById("pipelineOverviewList");

  if (!container) return;

  container.innerHTML = "";

  const total = agents.length;

  const stages = [
    ...new Set([
      ...pipelineStages,
      "Licensed",
      "Contracted"
    ])
  ];

  stages.forEach((stage) => {

    const count = agents.filter(
      (agent) => agent.stage === stage
    ).length;

    const percent =
      total > 0
        ? Math.round((count / total) * 100)
        : 0;

    const row =
      document.createElement("div");

    row.className =
      "pipeline-overview-row";

    row.innerHTML = `
      <div class="pipeline-overview-label">
        <span class="pipeline-mini-icon">
          ${getPipelineStageIcon(stage)}
        </span>

        <strong>
          ${getPipelineStageLabel(stage)}
        </strong>
      </div>

      <div class="pipeline-overview-track">
        <span
          class="pipeline-overview-fill"
          style="width: ${percent}%"
        ></span>
      </div>

      <strong class="pipeline-overview-count">
        ${count}
      </strong>

      <span class="pipeline-overview-percent">
        ${percent}%
      </span>
    `;

    container.appendChild(row);
  });
}
function getPipelineStageLabel(stage) {
  const labels = {
    "Not Placed": "Not Placed",
    "Quiz Sent": "Quiz Sent",
    "XCEL Completed": "XCEL",
    "Exam Passed": "Exam",
    "Licensed": "Licensed",
    "Contracted": "Contracted"
  };

  return labels[stage] || stage;
}


function getPipelineStageIcon(stage) {
  const icons = {
    "Not Placed": "&#9675;",
    "Quiz Sent": "&#8594;",
    "XCEL Completed": "&#9671;",
    "Exam Passed": "&#10003;",
    "Licensed": "&#9734;",
    "Contracted": "&#10003;"
  };

  return icons[stage] || "&#8226;";
}

function renderStage(stageName, countId, listId, agents) {

  const stageAgents =
    agents.filter(
      (agent) => agent.stage === stageName
    );

  setText(
    countId,
    stageAgents.length
  );

  const list =
    document.getElementById(listId);

  if (!list) return;

  list.innerHTML = "";

  if (stageAgents.length === 0) {

    list.innerHTML = `
      <div class="empty-stage">
        No agents yet
      </div>
    `;

    return;
  }

  stageAgents.forEach((agent) => {

    const card =
      document.createElement("div");

    card.className =
      "pipeline-agent-card";

    card.innerHTML = `
      <div class="pipeline-agent-name">
        ${getAgentDisplayName(agent)}
      </div>

      <div class="pipeline-agent-coordinator">
        ${agent.upline || agent.coordinator || "No upline"}
      </div>

      <div class="pipeline-agent-stage">
        ${agent.stage}
      </div>
    `;

    list.appendChild(card);

  });

}

//  HELPERS 

function getInitials(name) {
  return (
    name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "A"
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ==========================================================
// ==========================================================
// LOGGED-IN USER MENU
// ==========================================================

function renderLoggedInUser() {
  if (!currentUserProfile) return;

  const fullName =
    currentUserProfile.full_name ||
    currentUserProfile.name ||
    "User";

  const email =
    currentUserProfile.email || "";

  const role =
    currentUserProfile.role || "user";

  setText(
    "headerUserAvatar",
    getInitials(fullName)
  );

  setText(
    "headerUserName",
    fullName
  );

  setText(
    "headerUserRole",
    formatUserRole(role)
  );

  setText(
    "dropdownUserName",
    fullName
  );

  setText(
    "dropdownUserEmail",
    email
  );

  // always start closed
  document
    .getElementById("userDropdown")
    ?.classList.add("hidden");


  // NEW: render org switcher for platform admin
  renderOrganizationSwitcher();
}

function formatUserRole(role) {
  return String(role || "user")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}
function updateTime() {
  const now = new Date();
  const hour = now.getHours();

  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 17
      ? "Good afternoon"
      : "Good evening";

  // Use the authenticated user's first name
  const fullName =
    currentUserProfile?.full_name ||
    currentUserProfile?.name ||
    "";

  const firstName =
    fullName.trim().split(/\s+/)[0];

  setText(
    "greeting",
    firstName
      ? `${greeting}, ${firstName}.`
      : `${greeting}.`
  );

  const date =
    document.getElementById("todayDate");

  if (date) {
    date.textContent =
      now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
      });
  }

  const time =
    document.getElementById("todayTime");

  if (time) {
    time.textContent =
      now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      });
  }
}
// ==========================================================
// USER MENU INTERACTIONS
// ==========================================================

const userMenuBtn =
  document.getElementById("userMenuBtn");

const userDropdown =
  document.getElementById("userDropdown");

const logoutBtn =
  document.getElementById("logoutBtn");


userMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();

  userDropdown?.classList.toggle("hidden");
});


document.addEventListener("click", (event) => {
  const menu =
    event.target.closest(".user-menu-wrap");

  if (!menu) {
    userDropdown?.classList.add("hidden");
  }
});


document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    userDropdown?.classList.add("hidden");
  }
});


logoutBtn?.addEventListener("click", async () => {
  try {

    const { error } =
      await forgeSupabase.auth.signOut();

    if (error) {
      console.error(
        "FORGE logout failed:",
        error
      );

      return;
    }

    window.location.reload();

  } catch (error) {
    console.error(
      "FORGE logout error:",
      error
    );
  }
});

function updateHomeIntelligence(agents) {
  if (!Array.isArray(agents)) return;

  const total = agents.length;

  const notPlaced = agents.filter(
    (a) => a.stage === "Not Placed"
  ).length;

  const quizSent = agents.filter(
    (a) => a.stage === "Quiz Sent"
  ).length;

  const xcel = agents.filter(
    (a) => a.stage === "XCEL Completed"
  ).length;

  const exam = agents.filter(
    (a) => a.stage === "Exam Passed"
  ).length;

  const licensedOnly = agents.filter(
    (a) => a.stage === "Licensed"
  ).length;

  const contracted = agents.filter(
    (a) => a.stage === "Contracted"
  ).length;

  const licensedIncludingContracted =
    licensedOnly + contracted;


  // ========================================================
  // FORGE INSIGHT
  // ========================================================

  let primaryInsight = "";
  let secondaryInsight = "";

  if (licensedOnly > 0) {
    primaryInsight =
      `${licensedOnly} licensed ${
        licensedOnly === 1 ? "agent is" : "agents are"
      } not yet contracted.`;
  } else {
    primaryInsight =
      "All licensed agents are currently contracted.";
  }


  if (notPlaced > 0) {
    secondaryInsight =
      `${notPlaced} ${
        notPlaced === 1 ? "agent has" : "agents have"
      } not started the licensing journey.`;
  } else if (quizSent > 0) {
    secondaryInsight =
      `${quizSent} ${
        quizSent === 1 ? "quiz is" : "quizzes are"
      } currently awaiting completion.`;
  } else if (xcel > 0) {
    secondaryInsight =
      `${xcel} ${
        xcel === 1 ? "agent is" : "agents are"
      } currently progressing through XCEL.`;
  } else {
    secondaryInsight =
      "Your licensing pipeline is moving forward.";
  }


  setText(
    "forgeInsightPrimary",
    primaryInsight
  );

  setText(
    "forgeInsightSecondary",
    secondaryInsight
  );


  // ========================================================
  // ORGANIZATION PULSE ACTION
  // ========================================================

  if (licensedOnly > 0) {

    setText(
      "pulseActionTitle",
      `${licensedOnly} licensed ${
        licensedOnly === 1 ? "agent needs" : "agents need"
      } contracting`
    );

    setText(
      "pulseActionText",
      "They are approved and ready for the next step."
    );

  } else if (notPlaced > 0) {

    setText(
      "pulseActionTitle",
      `${notPlaced} ${
        notPlaced === 1 ? "agent has" : "agents have"
      } not started`
    );

    setText(
      "pulseActionText",
      "Follow up to move them into the licensing journey."
    );

  } else if (quizSent > 0) {

    setText(
      "pulseActionTitle",
      `${quizSent} ${
        quizSent === 1 ? "quiz is" : "quizzes are"
      } outstanding`
    );

    setText(
      "pulseActionText",
      "Follow up with agents who have not completed their quiz."
    );

  } else {

    setText(
      "pulseActionTitle",
      "Organization is progressing"
    );

    setText(
      "pulseActionText",
      `${contracted} of ${total} agents are contracted.`
    );

  }
}
//  FILTER BUTTONS 

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderDashboard(button.dataset.filter);
  });
});
// ==========================================================
// HOME PAGE INTELLIGENT NAVIGATION
// ==========================================================

// Pipeline Overview -> Journey
[
  "openJourneyBtn",
  "viewFullJourneyBtn"
].forEach((id) => {

  document
    .getElementById(id)
    ?.addEventListener("click", () => {

      launchForgeContext({
        type: "journey"
      });

    });

});


// Organization Pulse -> Growth
document
  .getElementById("pulseDetailsBtn")
  ?.addEventListener("click", () => {

    launchForgeContext({
      type: "growth",
      title: "Organization Performance"
    });

  });
// ==========================================================
// HOME KPI SMART NAVIGATION
// ==========================================================

document.addEventListener("click", (event) => {
  const button =
    event.target.closest(".home-kpi-link");

  if (!button) return;

  const action =
    button.dataset.kpiAction;

  switch (action) {

    // ------------------------------------------------------
    // ENTIRE ORGANIZATION
    // ------------------------------------------------------

    case "all":
      showPage("Agents");
      setActiveForgeNavSafe("Agents");
      break;


    // ------------------------------------------------------
    // LICENSING PIPELINE
    // ------------------------------------------------------

    case "pipeline":
      window.journeyFocusStage = null;

      showPage("Journey");
      setActiveForgeNavSafe("Journey");

      break;


    // ------------------------------------------------------
    // LICENSED
    // ------------------------------------------------------

    case "licensed":
      window.journeyFocusStage =
        "Licensed";

      showPage("Journey");
      setActiveForgeNavSafe("Journey");

      setTimeout(() => {
        focusJourneyStageSafe(
          "Licensed"
        );
      }, 100);

      break;


    // ------------------------------------------------------
    // CONTRACTED
    // ------------------------------------------------------

    case "contracted":
      window.journeyFocusStage =
        "Contracted";

      showPage("Journey");
      setActiveForgeNavSafe("Journey");

      setTimeout(() => {
        focusJourneyStageSafe(
          "Contracted"
        );
      }, 100);

      break;
  }
});
function setActiveForgeNavSafe(page) {
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => {

      btn.classList.toggle(
        "active",
        btn.textContent
          .trim()
          .toLowerCase() ===
          page.toLowerCase()
      );

    });
}


function focusJourneyStageSafe(stage) {

  const possibleTargets = [
    `[data-stage="${stage}"]`,
    `[data-pipeline-stage="${stage}"]`,
    `[data-journey-stage="${stage}"]`
  ];

  let target = null;

  for (const selector of possibleTargets) {

    target =
      document.querySelector(selector);

    if (target) break;
  }


  if (target) {

    target.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    target.classList.add(
      "forge-stage-highlight"
    );

    setTimeout(() => {
      target.classList.remove(
        "forge-stage-highlight"
      );
    }, 1800);
  }
}

//  LOAD AGENTS FROM SUPABASE 

async function loadCSV() {
  try {
   if (!getActiveOrganizationId()) {
      console.error("Current user has no organization assigned.");
      allAgents = [];
      renderAllPages();
      return;
    }

    const { data, error } = await forgeSupabase
      .from("agents")
      .select("*")
      .eq(
  "organization_id",
  getActiveOrganizationId()
);

    if (error) {
      console.error("Supabase agent load error:", error);
      allAgents = [];
      renderAllPages();
      return;
    }

  // ==========================================================
// SUPABASE -> FORGE AGENT OBJECT
// Converts database column names into the names used
// throughout the FORGE interface.
// ==========================================================

allAgents = (data || []).map((agent) => ({

  // Database identity
  id: agent.id,
  organizationId: agent.organization_id,

  // Core agent information
  name: agent.name || "",
  email: agent.email || "",
  phone: agent.phone || "",
  code: agent.agent_code || "",

  // Team hierarchy
  upline: agent.upline_name || "",
  uplineCode: agent.upline_code || "",

  coordinatorId: agent.coordinator_id || null,

  // Journey
  stage: agent.stage || "Not Placed",
  pipelineStage: agent.stage || "Not Placed",

  // Team status
  teamStatus: agent.team_status || "",
  status: agent.team_status || "",

  // Compliance information
  level: agent.agent_level || "",
  residentState: agent.resident_state || "",
  residentLicense: agent.resident_license || "",
  eoStatus: agent.eo_status || "",
  amlStatus: agent.aml_status || "",
  tevahPlatformFee: agent.tevah_platform_fee || "",
  npn: agent.npn || "",

  // Recruit information
  recruitDate: agent.recruit_date || "",

  // Import information
  importSource: agent.import_source || "",

  notes: agent.notes || ""
}));

console.log(
  "Agents loaded from Supabase:",
  allAgents.length
);

renderAllPages();

// Refresh organization switcher after agents load
renderOrganizationSwitcher();

} catch (error) {
  console.error(
    "Could not load agents from Supabase:",
    error
  );

  allAgents = [];
  renderAllPages();
}

}
//Add the intelligent next-stage rules
const journeyNextStage = {
  "Not Placed": "Quiz Sent",
  "Quiz Sent": "XCEL Completed",
  "XCEL Completed": "Exam Passed",
  "Exam Passed": "Licensed",
  "Licensed": "Contracted",
  "Contracted": null
};

function getJourneyActionLabel(stage) {
  const labels = {
    "Not Placed": "Mark Quiz Sent",
    "Quiz Sent": "Move to XCEL",
    "XCEL Completed": "Passed Exam",
    "Exam Passed": "Licensed",
    "Licensed": "Contracted",
    "Contracted": ""
  };

  return labels[stage] || "";
}

// ==========================================================
// JOURNEY - FORGE INTELLIGENCE
// ==========================================================

let journeyPriorityAgents = [];


function getJourneyDaysSinceRecruit(agent) {
  const value =
    agent.recruitDate ||
    agent.recruit_date ||
    null;

  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - date.getTime()) /
      (1000 * 60 * 60 * 24)
    )
  );
}


function isJourneyAgentStalled(agent) {
  const stage =
    agent.stage || "Not Placed";

  if (stage === "Contracted") {
    return false;
  }

  const days =
    getJourneyDaysSinceRecruit(agent);

  if (days === null) {
    return false;
  }

  const stageLimits = {
    "Not Placed": 7,
    "Quiz Sent": 10,
    "XCEL Completed": 21,
    "Exam Passed": 30,
    "Licensed": 45
  };

  const limit =
    stageLimits[stage];

  return (
    typeof limit === "number" &&
    days >= limit
  );
}


function getJourneyPriorityScore(agent) {
  let score = 0;

  if (isJourneyAgentStalled(agent)) {
    score += 100;
  }

  if (agent.stage === "Licensed") {
    score += 90;
  }

  if (agent.stage === "Exam Passed") {
    score += 80;
  }

  if (agent.stage === "Not Placed") {
    score += 70;
  }

  if (agent.stage === "Quiz Sent") {
    score += 60;
  }

  const days =
    getJourneyDaysSinceRecruit(agent);

  if (days !== null) {
    score += Math.min(days, 50);
  }

  return score;
}


function updateJourneyIntelligence(agents) {
  const organizationAgents =
    Array.isArray(agents)
      ? agents
      : [];

  const needAttentionStages = [
    "Not Placed",
    "Quiz Sent",
    "Exam Passed",
    "Licensed"
  ];

  const readyStages = [
    "Exam Passed",
    "Licensed"
  ];

  const needAttention =
    organizationAgents.filter(
      (agent) =>
        needAttentionStages.includes(
          agent.stage
        )
    );

  const readyToAdvance =
    organizationAgents.filter(
      (agent) =>
        readyStages.includes(
          agent.stage
        )
    );

  const stalled =
    organizationAgents.filter(
      isJourneyAgentStalled
    );

  setText(
    "journeyNeedAttention",
    needAttention.length
  );

  setText(
    "journeyReadyAdvance",
    readyToAdvance.length
  );

  setText(
    "journeyStalled",
    stalled.length
  );

  // Combine all priority groups without duplicates.
  const priorityMap =
    new Map();

  [
    ...stalled,
    ...readyToAdvance,
    ...needAttention
  ].forEach((agent) => {
    const key =
      agent.id ||
      agent.code ||
      agent.email ||
      agent.name;

    if (!key) return;

    priorityMap.set(
      String(key),
      agent
    );
  });

  journeyPriorityAgents =
    [...priorityMap.values()]
      .sort(
        (a, b) =>
          getJourneyPriorityScore(b) -
          getJourneyPriorityScore(a)
      );

  const priorityButton =
    document.getElementById(
      "viewJourneyPriorities"
    );

  if (priorityButton) {
    priorityButton.disabled =
      journeyPriorityAgents.length === 0;

    priorityButton.title =
      journeyPriorityAgents.length
        ? `Open ${journeyPriorityAgents.length} priority agents`
        : "No priority agents right now";
  }
}


document
  .getElementById("viewJourneyPriorities")
  ?.addEventListener("click", () => {
    if (!journeyPriorityAgents.length) {
      return;
    }

    launchForgeContext({
      type: "mission",
      title: "Journey Priorities",
      reason:
        "Agents requiring immediate licensing follow-up",
      agents: journeyPriorityAgents
    });
  });

//  JOURNEY PAGE 

function renderJourneyPage() {
    updateJourneyIntelligence(allAgents);
const searchInput =
  document.getElementById("journeySearch");

const searchValue =
  String(searchInput?.value || "")
    .trim()
    .toLowerCase();

const filteredAgents =
  !searchValue
    ? [...allAgents]
    : allAgents.filter((agent) => {

        const searchableText = [
          agent.name,
          agent.code,
          agent.email,
          agent.phone,
          agent.upline
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(searchValue);
      });
  
  const stageConfig = {
  launch: [
    ["Not Placed", "journeyNotPlacedList", "journeyNotPlacedCount"],
    ["Quiz Sent", "journeyQuizSentList", "journeyQuizSentCount"],
    ["XCEL Completed", "journeyXCELList", "journeyXCELCount"]
  ],

  activate: [
    ["Exam Passed", "journeyExamPassedList", "journeyExamPassedCount"],
    ["Licensed", "journeyLicensedList", "journeyLicensedCount"],
    ["Contracted", "journeyContractedList", "journeyContractedCount"]
  ]
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


  const stageAgents =
    filteredAgents.filter(
      (agent) => agent.stage === stageName
    );


  setText(
    countId,
    stageAgents.length
  );


  list.innerHTML = "";


  // ------------------------------------------------------
  // EMPTY STAGE
  // ------------------------------------------------------

  if (stageAgents.length === 0) {

    list.innerHTML = `
      <div class="empty-stage">
        No agents yet
      </div>
    `;

    return;
  }


  // ------------------------------------------------------
  // PREVIEW / VIEW ALL
  // ------------------------------------------------------

  const stageKey = stageName;

  const isExpanded =
    expandedJourneyStages.has(stageKey);

  const visibleAgents =
    isExpanded
      ? stageAgents
      : stageAgents.slice(
          0,
          journeyPreviewLimit
        );


  // ------------------------------------------------------
  // RENDER AGENTS
  // ------------------------------------------------------

 visibleAgents.forEach((agent) => {

  const displayName =
    cleanAgentName(
      agent.name || "Unnamed Agent"
    );

  const card =
    document.createElement("div");

  card.className =
    "pipeline-agent-card journey-agent-card";

  card.dataset.agentId =
    agent.id;

  card.dataset.agentName =
    agent.name;

  card.setAttribute(
    "draggable",
    "true"
  );

  card.innerHTML = `

    <div class="journey-avatar">
      ${getInitials(displayName)}
    </div>

    <div class="pipeline-agent-info">

      <div class="journey-agent-name">
        ${displayName}
      </div>

      <div class="journey-agent-coordinator">
        ${agent.upline || "No upline"}
      </div>

      <div class="journey-agent-badge">
        ${
          agent.stage === "XCEL Completed"
            ? "XCEL"
            : agent.stage
        }
      </div>

    </div>

    <div class="journey-card-actions">

      ${
        journeyNextStage[agent.stage]
          ? `
            <button
              class="journey-next-action"
              data-advance-agent="${agent.id}"
            >
              ${getJourneyActionLabel(agent.stage)}
              <span aria-hidden="true">&#8594;</span>
            </button>
          `
          : `
            <span class="journey-complete">
              <span aria-hidden="true">&#10003;</span> Complete
            </span>
          `
      }

      <button
        class="journey-more-btn"
        data-agent-menu="${agent.id}"
        aria-label="Agent options"
      >
        ---
      </button>

    </div>
  `;

  list.appendChild(card);

});


      // ------------------------------------------------------
  // VIEW ALL / SHOW LESS
  // ------------------------------------------------------

const viewButton =
  document.querySelector(
    `.journey-view-all[data-view-stage="${stageName}"]`
  );

const column =
  list.closest(".journey-column");

if (viewButton) {

  if (stageAgents.length <= journeyPreviewLimit) {

    viewButton.hidden = true;

    column?.classList.remove(
      "stage-expanded"
    );

  } else {

    viewButton.hidden = false;

    viewButton.textContent =
      isExpanded
        ? "Show less"
        : `View all ${stageAgents.length} agents ${forgeSymbol(8594)}`;

    column?.classList.toggle(
      "stage-expanded",
      isExpanded
    );
  }
}

}); // closes currentStages.forEach

} // closes renderJourneyPage
// ==========================================================
// JOURNEY AGENT MENU
// ==========================================================

document.addEventListener("click", (event) => {

  const menuButton =
    event.target.closest("[data-agent-menu]");

  // Clicking somewhere else closes menus
  if (!menuButton) {
    document
      .querySelectorAll(".journey-agent-menu")
      .forEach((menu) => menu.remove());

    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const agentId =
    menuButton.dataset.agentMenu;

  const agent =
    allAgents.find(
      (item) =>
        String(item.id) ===
        String(agentId)
    );

  if (!agent) return;

  document
    .querySelectorAll(".journey-agent-menu")
    .forEach((menu) => menu.remove());

  const menu =
    document.createElement("div");

  menu.className =
    "journey-agent-menu";

  menu.innerHTML = `
    <button data-menu-profile>
      Open profile
    </button>

    <button data-menu-edit>
      Edit agent
    </button>

    ${
      agent.stage !== "Not Placed"
        ? `
          <button data-menu-back>
            Move back
          </button>
        `
        : ""
    }

    <button
      class="danger"
      data-menu-delete
    >
      Delete
    </button>
  `;

  menuButton
    .closest(".journey-card-actions")
    ?.appendChild(menu);


  // OPEN PROFILE
  menu
    .querySelector("[data-menu-profile]")
    ?.addEventListener("click", () => {

      selectedAgent = agent;

      showPage("Agents");

      document
        .querySelectorAll(".nav-btn")
        .forEach((btn) =>
          btn.classList.toggle(
            "active",
            btn.textContent.trim() === "Agents"
          )
        );

      renderAgentsPage();

      showAgentProfile(agent);
    });


  // EDIT
  menu
    .querySelector("[data-menu-edit]")
    ?.addEventListener("click", () => {

      selectedAgent = agent;

      document
        .querySelector(".edit-agent-btn")
        ?.click();
    });


  // MOVE BACK
  menu
    .querySelector("[data-menu-back]")
    ?.addEventListener(
      "click",
      async () => {

        const stages = [
          "Not Placed",
          "Quiz Sent",
          "XCEL Completed",
          "Exam Passed",
          "Licensed",
          "Contracted"
        ];

        const index =
          stages.indexOf(agent.stage);

        if (index <= 0) return;

        await updateJourneyStage(
          agent,
          stages[index - 1]
        );
      }
    );


  // DELETE FROM SUPABASE
  menu
    .querySelector("[data-menu-delete]")
    ?.addEventListener(
      "click",
      async () => {

        if (
          !confirm(
            `Delete ${agent.name} from FORGE?`
          )
        ) {
          return;
        }

        const { error } =
          await forgeSupabase
            .from("agents")
            .delete()
            .eq(
              "organization_id",
              currentUserProfile.organization_id
            )
            .eq(
              "id",
              agent.id
            );

        if (error) {
          console.error(
            "DELETE AGENT ERROR:",
            error
          );

          alert(
            "FORGE could not delete this agent."
          );

          return;
        }

        await loadCurrentUserProfile();

await loadPlatformAdminStatus();

await loadAvailableOrganizations();

setInitialOrganization();

await loadCSV();
      }
    );

});

function renderLoggedInUser() {
  if (!currentUserProfile) return;

  const fullName =
    currentUserProfile.full_name ||
    currentUserProfile.name ||
    currentUserProfile.email ||
    "User";

  const email =
    currentUserProfile.email ||
    "";

  const role =
    isPlatformAdmin
      ? "Platform Admin"
      : currentUserProfile.role || "Coordinator";


  setText(
    "headerUserName",
    fullName
  );

  setText(
    "headerUserRole",
    formatUserRole(role)
  );

  setText(
    "dropdownUserName",
    fullName
  );

  setText(
    "dropdownUserEmail",
    email
  );

  setText(
    "headerUserAvatar",
    getInitials(fullName)
  );


  // PLATFORM ADMIN ORGANIZATION SWITCHER
  renderOrganizationSwitcher();
}

function formatUserRole(role) {
  return String(role || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}
// ==========================================================
// JOURNEY SEARCH
// ==========================================================

const journeySearch =
  document.getElementById("journeySearch");


journeySearch?.addEventListener(
  "input",
  () => {

    // When search is completely cleared,
    // restore the normal five-agent previews.
    if (!journeySearch.value.trim()) {
      expandedJourneyStages.clear();
    }

    renderJourneyPage();
  }
);


journeySearch?.addEventListener(
  "keydown",
  (event) => {

    // Enter should only run the search.
    if (event.key === "Enter") {

      event.preventDefault();

      renderJourneyPage();
    }


    // Escape clears search and restores everything.
    if (event.key === "Escape") {

      event.preventDefault();

      journeySearch.value = "";

      expandedJourneyStages.clear();

      renderJourneyPage();
    }

  }
);


document.addEventListener("click", (event) => {

  const btn =
    event.target.closest(
      "[data-agent-menu]"
    );

  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();

  const agent =
    allAgents.find(
      (item) =>
        String(item.id) ===
        String(btn.dataset.agentMenu)
    );

  if (!agent) return;

  document
    .querySelectorAll(".journey-agent-menu")
    .forEach((menu) =>
      menu.remove()
    );

  const menu =
    document.createElement("div");

  menu.className =
    "journey-agent-menu";

  menu.innerHTML = `
    <button data-menu-open>
      Open profile
    </button>

    <button data-menu-edit>
      Edit agent
    </button>

    ${
      agent.stage !== "Not Placed"
        ? `
          <button data-menu-back>
            Move back one stage
          </button>
        `
        : ""
    }

    <button
      class="danger"
      data-menu-delete
    >
      Delete agent
    </button>
  `;

  btn.closest(".journey-card-actions")
    ?.appendChild(menu);

  menu
    .querySelector("[data-menu-open]")
    ?.addEventListener("click", () => {

      showPage("Agents");
      showAgentProfile(agent);

      document
        .querySelectorAll(".nav-btn")
        .forEach((nav) =>
          nav.classList.toggle(
            "active",
            nav.textContent.trim() === "Agents"
          )
        );

    });

  menu
    .querySelector("[data-menu-edit]")
    ?.addEventListener("click", () => {

      selectedAgent = agent;

      document
        .querySelector(".edit-agent-btn")
        ?.click();

    });

  menu
    .querySelector("[data-menu-back]")
    ?.addEventListener("click", async () => {

      const stageOrder = [
        "Not Placed",
        "Quiz Sent",
        "XCEL Completed",
        "Exam Passed",
        "Licensed",
        "Contracted"
      ];

      const currentIndex =
        stageOrder.indexOf(agent.stage);

      if (currentIndex <= 0) return;

      await updateJourneyStage(
        agent,
        stageOrder[currentIndex - 1]
      );

    });

  menu
    .querySelector("[data-menu-delete]")
    ?.addEventListener("click", () => {

      alert(
        "Use your database delete action here."
      );

    });

});
document.addEventListener("click", (event) => {

  const btn =
    event.target.closest(
      ".journey-view-all[data-view-stage]"
    );

  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();

  const stage =
    btn.dataset.viewStage;

  if (expandedJourneyStages.has(stage)) {

    expandedJourneyStages.delete(stage);

  } else {

    expandedJourneyStages.add(stage);

  }

  renderJourneyPage();

});

//---Clear form after saving-------------
function clearAgentForm() {
  document.getElementById("newAgentName").value = "";
  document.getElementById("newAgentEmail").value = "";
  document.getElementById("newAgentPhone").value = "";
  document.getElementById("newAgentCode").value = "";
  document.getElementById("newAgentUpline").value = "";
  document.getElementById("newAgentCoordinator").value = "";
  document.getElementById("newAgentStage").value = "";
}

// Make the button actually update Supabase
async function updateJourneyStage(agent, newStage) {
  if (!agent?.id || !newStage) return;

  const oldStage = agent.stage;

  // Update UI immediately
  agent.stage = newStage;
  agent.pipelineStage = newStage;

  try {
    const { error } = await forgeSupabase
      .from("agents")
      .update({
        stage: newStage
      })
      .eq(
        "organization_id",
        currentUserProfile.organization_id
      )
      .eq(
        "id",
        agent.id
      );

    if (error) {
      throw error;
    }

    // XCEL -> Exam Passed crosses into Activate
    if (
      oldStage === "XCEL Completed" &&
      newStage === "Exam Passed"
    ) {
      currentJourneyMode = "activate";

      document
        .querySelectorAll(".journey-mode")
        .forEach((btn) => {
          btn.classList.toggle(
            "active",
            btn.dataset.mode === "activate"
          );
        });
    }

    await loadCSV();

  } catch (error) {
    // Put person back if database update failed
    agent.stage = oldStage;
    agent.pipelineStage = oldStage;

    console.error(
      "Journey stage update failed:",
      error
    );

    alert(
      "FORGE could not update this agent. Please try again."
    );

    renderJourneyPage();
  }
}
//click listener
document.addEventListener("click", async (event) => {

  const btn =
    event.target.closest("[data-advance-agent]");

  if (!btn) return;

  event.preventDefault();
  event.stopPropagation();

  const agent =
    allAgents.find(
      (item) =>
        String(item.id) ===
        String(btn.dataset.advanceAgent)
    );

  if (!agent) return;

  const nextStage =
    journeyNextStage[agent.stage];

  if (!nextStage) return;

  await updateJourneyStage(
    agent,
    nextStage
  );
});
//  JOURNEY MODE TOGGLE 

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

// ==========================================================
// OPEN AGENT PROFILE FROM JOURNEY CARD
// Clicking an agent in Journey opens their full Agent page.
// ==========================================================

document.addEventListener("click", (event) => {

  const card =
    event.target.closest(
      ".journey-agent-card[data-agent-id]"
    );

  if (!card) return;

  // Do not open profile when clicking a control
  // inside the card such as Delete or movement buttons.
  if (
    event.target.closest(
      "button, select, input, a"
    )
  ) {
    return;
  }

  const agentId =
    card.dataset.agentId;

  const agent =
    allAgents.find(
      (item) =>
        String(item.id) === String(agentId)
    );

  if (!agent) return;

  // Change navigation highlight
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) =>
      btn.classList.remove("active")
    );

  const agentsButton =
    [...document.querySelectorAll(".nav-btn")]
      .find(
        (btn) =>
          btn.textContent.trim() === "Agents"
      );

  agentsButton?.classList.add("active");

  // Open Agents screen
  showPage("Agents");

  // Open this exact person's profile
  showAgentProfile(agent);
});

//  DELETE AGENT 

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

//  ADD / EDIT AGENT MODAL 

const addAgentModal = document.getElementById("addAgentModal");

document.querySelector(".add-agent-btn")?.addEventListener("click", () => {
  selectedAgent = null;
  clearAgentForm();
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
  clearAgentForm();
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

//  PAGE NAVIGATION 

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

//  DRAG AND DROP 

let draggedAgentId = null;

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(
    ".journey-agent-card[data-agent-id]"
  );

  if (!card) return;

  draggedAgentId = card.dataset.agentId;

  card.classList.add("dragging");

  event.dataTransfer.effectAllowed = "move";
});


document.addEventListener("dragend", (event) => {
  const card = event.target.closest(
    ".journey-agent-card"
  );

  card?.classList.remove("dragging");

  draggedAgentId = null;

  document
    .querySelectorAll(".drop-zone")
    .forEach((zone) =>
      zone.classList.remove("drag-over")
    );
});


document.addEventListener("dragover", (event) => {
  const zone = event.target.closest(".drop-zone");

  if (!zone) return;

  event.preventDefault();

  event.dataTransfer.dropEffect = "move";

  zone.classList.add("drag-over");
});


document.addEventListener("dragleave", (event) => {
  const zone = event.target.closest(".drop-zone");

  if (!zone) return;

  if (!zone.contains(event.relatedTarget)) {
    zone.classList.remove("drag-over");
  }
});


document.addEventListener("drop", async (event) => {
  const zone = event.target.closest(".drop-zone");

  if (!zone) return;

  event.preventDefault();

  zone.classList.remove("drag-over");

  if (!draggedAgentId) return;

  const agent = allAgents.find(
    (item) =>
      String(item.id) ===
      String(draggedAgentId)
  );

  if (!agent) return;

  const newStage = zone.dataset.stage;

  if (!newStage) return;

  if (agent.stage === newStage) return;

  await updateJourneyStage(
    agent,
    newStage
  );

  draggedAgentId = null;
});
// ==========================================================
// AGENT PROFILE
// KEEP THIS AT TOP LEVEL - NOT INSIDE ANOTHER FUNCTION
// ==========================================================

function showAgentProfile(agent) {
  if (!agent) return;

  selectedAgent = agent;

  document
    .getElementById("agentProfileEmpty")
    ?.classList.add("hidden");

  document
    .getElementById("agentProfile")
    ?.classList.remove("hidden");


  // BASIC PROFILE
  setText(
    "profileAvatar",
    getInitials(getAgentDisplayName(agent))
  );

  setText(
    "profileName",
    getAgentDisplayName(agent)
  );

  setText(
    "profileCoordinator",
    agent.upline ||
    agent.coordinator ||
    "-"
  );

  setText(
    "profileStatus",
    agent.teamStatus ||
    agent.status ||
    "-"
  );

  setText(
    "profileStage",
    agent.stage || "-"
  );

  setText(
    "profileCode",
    agent.code || "-"
  );

  setText(
    "profilePhone",
    agent.phone || "-"
  );

  setText(
    "profileEmail",
    agent.email || "-"
  );

  setText(
    "profileNextAction",
    getNextAction(agent.stage)
  );


  // COMPLIANCE
  setComplianceValue(
    "profileResidentLicense",
    agent.residentLicense
  );

  setComplianceValue(
    "profileEO",
    agent.eoStatus
  );

  setComplianceValue(
    "profileAML",
    agent.amlStatus
  );

  setComplianceValue(
    "profileTevahFee",
    agent.tevahPlatformFee
  );


  // MILESTONES
  if (
    typeof renderAgentMilestones === "function"
  ) {
    renderAgentMilestones(agent);
  }
}
//  AGENTS PAGE 

function renderAgentsPage() {
  const list = document.getElementById("agentsList");
  if (!list) return;

  const searchValue =
    String(
      document.getElementById("agentsSearch")?.value || ""
    )
      .trim()
      .toLowerCase();

  const filteredAgents =
    allAgents.filter((agent) => {

      const name =
        String(
          agent.name ||
          getAgentDisplayName(agent) ||
          ""
        ).toLowerCase();

      const upline =
        String(
          agent.upline ||
          agent.coordinator ||
          ""
        ).toLowerCase();

      const code =
        String(
          agent.code ||
          ""
        ).toLowerCase();

      const email =
        String(
          agent.email ||
          ""
        ).toLowerCase();

      const phone =
        String(
          agent.phone ||
          ""
        ).toLowerCase();

      const stage =
        String(
          agent.stage ||
          ""
        ).toLowerCase();

      const status =
        String(
          agent.teamStatus ||
          agent.status ||
          ""
        ).toLowerCase();

      return (
        name.includes(searchValue) ||
        upline.includes(searchValue) ||
        code.includes(searchValue) ||
        email.includes(searchValue) ||
        phone.includes(searchValue) ||
        stage.includes(searchValue) ||
        status.includes(searchValue)
      );
    });

  list.innerHTML = "";

  // ========================================================
  // NOTHING FOUND
  // ========================================================

  if (filteredAgents.length === 0) {
    list.innerHTML = `
      <div class="agents-empty">
        No agents found
      </div>
    `;

    document
      .getElementById("agentProfile")
      ?.classList.add("hidden");

    document
      .getElementById("agentProfileEmpty")
      ?.classList.remove("hidden");

    return;
  }

  // ========================================================
  // DETERMINE WHICH AGENT SHOULD BE OPEN
  // ========================================================

  let agentToShow = null;

  if (selectedAgent) {
    agentToShow =
      filteredAgents.find(
        (agent) =>
          String(agent.id) ===
          String(selectedAgent.id)
      ) || null;
  }

  if (!agentToShow) {
    agentToShow = filteredAgents[0];
  }

  selectedAgent = agentToShow;

  showAgentProfile(selectedAgent);

  // ========================================================
  // BUILD LEFT AGENT LIST
  // ========================================================

  filteredAgents.forEach((agent) => {

    const item =
      document.createElement("div");

    item.className =
      "agent-list-item";

    const isSelected =
      String(agent.id) ===
      String(selectedAgent?.id);

    if (isSelected) {
      item.classList.add("active");
    }

    item.innerHTML = `
      <b>
        ${getAgentDisplayName(agent)}
      </b>

      <span>
        ${
          agent.upline ||
          agent.coordinator ||
          "No upline"
        }

        <small
          class="stage-dot ${getStageColor(agent.stage)}"
        ></small>

        ${agent.stage || "Not Placed"}
      </span>
    `;

    item.addEventListener(
      "click",
      () => {

        selectedAgent = agent;

        document
          .querySelectorAll(
            "#agentsPage .agent-list-item"
          )
          .forEach((row) =>
            row.classList.remove("active")
          );

        item.classList.add("active");

        showAgentProfile(agent);
      }
    );

    list.appendChild(item);
  });
}


// ==========================================================
// AGENTS SEARCH INPUT
// ==========================================================

const agentsSearchInput =
  document.getElementById("agentsSearch");

if (agentsSearchInput) {

  agentsSearchInput.addEventListener(
    "input",
    renderAgentsPage
  );

  agentsSearchInput.addEventListener(
    "keydown",
    (event) => {

      if (event.key === "Escape") {

        agentsSearchInput.value = "";

        renderAgentsPage();

        agentsSearchInput.blur();
      }
    }
  );
}

/* =========================================================
   AGENT PROFILE - MILESTONE PROGRESS
========================================================= */

function getLaunchDate(agent) {
  return (
    agent.recruitDate ||
    agent.recruit_date ||
    agent.recruitDateCST ||
    ""
  );
}


function formatMilestoneDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );
}


function renderPendingMilestone(elementId) {
  const el =
    document.getElementById(elementId);

  if (!el) return;

  el.className =
    "milestone-status pending";

  el.innerHTML = `
    <svg
      class="pending-clock"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
      ></circle>

      <path
        d="M12 7v5l3 2"
      ></path>
    </svg>

    <span class="milestone-status-text">
      Pending
    </span>
  `;
}


function renderCompletedMilestone(
  elementId,
  value = "Completed"
) {
  const el =
    document.getElementById(elementId);

  if (!el) return;

  el.className =
    "milestone-status completed";

  el.textContent = value;
}


function normalizeStage(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function isLicensedAgent(agent) {
  const stage =
    normalizeStage(
      agent.pipelineStage ||
      agent.pipeline_stage ||
      agent.stage
    );

  const status =
    normalizeStage(
      agent.teamStatus ||
      agent.status
    );

  return (
    stage === "licensed" ||
    stage === "contracted" ||
    status.includes("licensed") ||
    status.includes("contracted")
  );
}


function isContractedAgent(agent) {
  const stage =
    normalizeStage(
      agent.pipelineStage ||
      agent.pipeline_stage ||
      agent.stage
    );

  const status =
    normalizeStage(
      agent.teamStatus ||
      agent.status
    );

  return (
    stage === "contracted" ||
    status.includes("contracted")
  );
}


/* =========================================================
   RENDER AGENT MILESTONES
========================================================= */

function renderAgentMilestones(agent) {
  if (!agent) return;


  const normalizedStage =
    String(
      agent.stage ||
      agent.pipelineStage ||
      ""
    )
      .trim()
      .toLowerCase();


  // ========================================================
  // LAUNCHED
  // Recruit date is the actual launch date.
  // ========================================================

  const launchDate =
    agent.recruitDate ||
    agent.recruit_date ||
    agent.recruitDateCST ||
    "";

  const launched =
    Boolean(launchDate);


  if (launched) {

    renderCompletedMilestone(
      "profileLaunchState",
      formatMilestoneDate(launchDate)
    );

  } else {

    renderPendingMilestone(
      "profileLaunchState"
    );
  }


  // ========================================================
  // LICENSED
  // ========================================================

  const licensed =
    normalizedStage === "licensed" ||
    normalizedStage === "contracted";


  if (licensed) {

    renderCompletedMilestone(
      "profileLicensedState",
      "Completed"
    );

  } else {

    renderPendingMilestone(
      "profileLicensedState"
    );
  }


  // ========================================================
  // CONTRACTED
  // ========================================================

  const contracted =
    normalizedStage === "contracted";


  if (contracted) {

    renderCompletedMilestone(
      "profileContractedState",
      "Completed"
    );

  } else {

    renderPendingMilestone(
      "profileContractedState"
    );
  }


  // ========================================================
  // VISUAL STATES
  // ========================================================

  document
    .getElementById("statusOne")
    ?.classList.toggle(
      "completed",
      launched
    );

  document
    .getElementById("statusTwo")
    ?.classList.toggle(
      "completed",
      licensed
    );

  document
    .getElementById("statusThree")
    ?.classList.toggle(
      "completed",
      contracted
    );


  // ========================================================
  // CONNECTOR LINES
  // ========================================================

  const dots =
    document.querySelectorAll(
      "#agentsPage .agent-progress-dot"
    );

  if (dots[0]) {
    dots[0].classList.toggle(
      "active-dot",
      licensed
    );
  }

  if (dots[1]) {
    dots[1].classList.toggle(
      "active-dot",
      contracted
    );
  }
}
// ==========================================================
// SAFE AGENT DISPLAY NAME
// Prevents an email address from being shown as the agent name.
// ==========================================================

function getAgentDisplayName(agent) {

  const name =
    String(agent?.name || "").trim();

  // Good normal name
  if (name && !name.includes("@")) {
    return name;
  }

  // If the database name accidentally contains an email,
  // try to create something readable from the email.
  const email =
    String(agent?.email || name || "").trim();

  if (email.includes("@")) {

    const beforeAt =
      email.split("@")[0];

    return beforeAt
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
  }

  return "Unnamed Agent";
}


function setComplianceValue(elementId, value) {
  const el = document.getElementById(elementId);

  if (!el) return;

const cleanValue =
  String(value || "").trim();

const normalizedValue =
  cleanValue.toLowerCase();

const isOnlyDashes =
  /^[---]+$/.test(cleanValue);

const hasValue =
  cleanValue !== "" &&
  !isOnlyDashes &&
  normalizedValue !== "pending" &&
  normalizedValue !== "none" &&
  normalizedValue !== "no" &&
  normalizedValue !== "n/a";

el.textContent =
  hasValue ? cleanValue : "-";

const card =
  el.closest(".compliance-item");

card?.classList.toggle(
  "completed",
  hasValue
);
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

//  COMMAND CENTER 

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

function getCommandPriorityScore(agent) {
  const stageScores = {
    "Licensed": 100,
    "Exam Passed": 92,
    "Not Placed": 85,
    "Quiz Sent": 75,
    "XCEL Completed": 65,
    "Contracted": 10
  };

  return stageScores[agent.stage] || 50;
}


function getCommandFilteredAgents() {
  const searchValue =
    document
      .getElementById("commandSearch")
      ?.value.trim()
      .toLowerCase() || "";

  let agents =
    allAgents.filter((agent) => {
      const searchableText = [
        getAgentDisplayName(agent),
        agent.coordinator,
        agent.stage,
        agent.email,
        agent.phone,
        agent.code
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchValue);
    });


  if (commandListFilter === "priority") {
    agents = agents
      .filter(
        (agent) =>
          agent.stage !== "Contracted"
      )
      .sort(
        (a, b) =>
          getCommandPriorityScore(b) -
          getCommandPriorityScore(a)
      );
  } else {
    agents.sort((a, b) =>
      getAgentDisplayName(a).localeCompare(
        getAgentDisplayName(b)
      )
    );
  }

  return agents;
}


function renderCommandCenter(
  agent = selectedAgent,
  skipProfileRender = false
) {
  const list =
    document.getElementById(
      "commandAgentList"
    );

  if (!list) return;

  const filteredAgents =
    getCommandFilteredAgents();

  const flaggedAgentCount =
    allAgents.filter(
      (agent) => agent.stage !== "Contracted"
    ).length;

  setText(
    "commandAgentTotal",
    `${allAgents.length} agents`
  );

  setText(
    "commandFlaggedCount",
    flaggedAgentCount
  );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredAgents.length /
        commandPageSize
      )
    );

  if (commandCurrentPage > totalPages) {
    commandCurrentPage = totalPages;
  }

  const start =
    (commandCurrentPage - 1) *
    commandPageSize;

  const pageAgents =
    filteredAgents.slice(
      start,
      start + commandPageSize
    );

  list.innerHTML = "";

  if (!pageAgents.length) {
    list.innerHTML = `
      <div class="command-list-empty">
        <strong>No agents found</strong>
        <span>Try a different search or filter.</span>
      </div>
    `;

    renderCommandPagination(0);
    return;
  }


  pageAgents.forEach((listedAgent) => {
    const row =
      document.createElement("button");

    row.type = "button";
    row.className =
      "command-agent-row";

    row.dataset.stage =
      listedAgent.stage ||
      "Not Placed";

    if (
      selectedAgent &&
      selectedAgent.id === listedAgent.id
    ) {
      row.classList.add("active");
    }

    const risk =
      getCommandRisk(listedAgent);

    row.innerHTML = `
      <div class="command-avatar">
        ${getInitials(
          getAgentDisplayName(listedAgent)
        )}
      </div>

      <div class="command-agent-copy">
        <strong>
          ${getAgentDisplayName(listedAgent)}
        </strong>

        <span>
          Coordinator
          •
          ${
            ["Licensed", "Contracted"].includes(
              listedAgent.stage
            )
              ? "Licensed"
              : "Not Licensed"
          }
        </span>
      </div>

      <span
        class="command-agent-status"
        title="${risk.label} priority"
      ></span>
    `;

    row.addEventListener(
      "click",
      () => {
        selectedAgent = listedAgent;
        showCommandProfile(listedAgent);
      }
    );

    list.appendChild(row);
  });


  renderCommandPagination(
    filteredAgents.length
  );

  if (
    agent &&
    !skipProfileRender
  ) {
    showCommandProfile(agent);
  }
}

// ==========================================================
// COMMAND CENTER FILTERS
// ==========================================================

document
  .querySelectorAll("[data-command-filter]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      commandListFilter =
        button.dataset.commandFilter;

      commandCurrentPage = 1;

      document
        .querySelectorAll("[data-command-filter]")
        .forEach((filterButton) => {
          filterButton.classList.toggle(
            "active",
            filterButton === button
          );
        });

      renderCommandCenter(
        selectedAgent,
        true
      );
    });
  });


// ==========================================================
// COMMAND CENTER SEARCH
// ==========================================================

document
  .getElementById("commandSearch")
  ?.addEventListener("input", () => {
    commandCurrentPage = 1;

    renderCommandCenter(
      selectedAgent,
      true
    );
  });


// ==========================================================
// COMMAND CENTER PAGINATION
// ==========================================================

document.addEventListener("click", (event) => {
  const button =
    event.target.closest(
      "[data-command-page]"
    );

  if (!button) return;

  const filteredAgents =
    getCommandFilteredAgents();

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredAgents.length /
        commandPageSize
      )
    );

  if (
    button.dataset.commandPage === "next" &&
    commandCurrentPage < totalPages
  ) {
    commandCurrentPage++;
  }

  if (
    button.dataset.commandPage === "prev" &&
    commandCurrentPage > 1
  ) {
    commandCurrentPage--;
  }

  renderCommandCenter(
    selectedAgent,
    true
  );
});

function renderCommandPagination(total) {
  const pagination = document.getElementById("commandPagination");
  if (!pagination) return;

  const totalPages = Math.ceil(total / commandPageSize) || 1;
  const start = total === 0 ? 0 : (commandCurrentPage - 1) * commandPageSize + 1;
  const end   = Math.min(commandCurrentPage * commandPageSize, total);

  pagination.innerHTML = `
    <span class="pagination-summary">Showing ${start} - ${end} of ${total} agents</span>
    <div class="pagination-controls">
      <button type="button" data-command-page="prev">&lt;</button>
      <span>${commandCurrentPage}</span>
      <button type="button" data-command-page="next">&gt;</button>
    </div>
  `;
}
// ==========================================================
// OPEN COMMAND CENTER FROM AGENT PROFILE
// ==========================================================

document
  .getElementById("openCommandFromAgent")
  ?.addEventListener("click", () => {

    if (!selectedAgent) return;

    // Keep the same agent selected
    const agentToOpen = selectedAgent;

    // Open Command page
    showPage("Command");

    // Update top navigation
    document
      .querySelectorAll(".nav-btn")
      .forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.textContent.trim() === "Command"
        );
      });

    // Keep selected agent available to Command Center
    selectedAgent = agentToOpen;

    // Render Command page if function exists
    if (typeof renderCommandPage === "function") {
      renderCommandPage();
    }

    // Open this specific agent in Command Center
    if (typeof showCommandProfile === "function") {
      showCommandProfile(agentToOpen);
    }
  });
//  COMMAND PROFILE 

const coordinatorActionMap = {
  "Not Placed": [
    { icon: "", title: "Send Welcome",          desc: "Introduce yourself as the licensing coordinator." },
    { icon: "", title: "Send Quiz Invitation",  desc: "Send the readiness quiz to begin licensing." },
    { icon: "", title: "Schedule First Follow-Up", desc: "Book a check-in to keep momentum." },
  ],
  "Quiz Sent": [
    { icon: "", title: "Send Quiz Reminder",    desc: "Remind agent to complete the quiz." },
    { icon: "", title: "Call Agent",            desc: "Check if they need help." },
    { icon: "", title: "Inactive Re-Engagement",desc: "Restart conversation if inactive." },
  ],
  "Quiz Passed": [
    { icon: "", title: "Send XCEL Instructions",desc: "Guide agent to start XCEL." },
    { icon: "", title: "Send XCEL Login",       desc: "Send access details and password." },
    { icon: "&#10003;", title: "Confirm Enrollment",    desc: "Confirm agent is enrolled." },
  ],
  "Continuing Education": [
    { icon: "", title: "Complete CE Requirements",desc: "Help agent finish CE." },
    { icon: "", title: "CE Reminder",            desc: "Follow up on CE completion." },
    { icon: "", title: "Call Agent",             desc: "Check progress directly." },
  ],
  "Licensed": [
    { icon: "", title: "Send Contracting Instructions", desc: "Move agent into contracting." },
    { icon: "", title: "Request Required Documents",    desc: "Collect needed contracting documents." },
    { icon: "&#10003;", title: "Confirm Compliance",            desc: "Verify compliance is completed." },
  ],
  "Contracted": [
    { icon: "", title: "Welcome Contracted Agent", desc: "Prepare agent for production." },
    { icon: "", title: "Send Fast Start Steps",    desc: "Give first production actions." },
    { icon: "", title: "Schedule First Field Training", desc: "Book initial field training." },
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
// ==========================================================
// COMMAND CENTER V2 INTELLIGENCE
// ==========================================================

const commandStageOrder = [
  "Not Placed",
  "Quiz Sent",
  "XCEL Completed",
  "Exam Passed",
  "Licensed",
  "Contracted"
];


const commandStageIntelligence = {
  "Not Placed": {
    title:
      "Licensing has not started",
    text:
      "Start onboarding and send the licensing readiness quiz.",
    primary:
      "Start Licensing",
    insight:
      "Begin the journey today",
    playbook:
      "3-Step Licensing Launch"
  },

  "Quiz Sent": {
    title:
      "Quiz is awaiting completion",
    text:
      "Follow up and remove any barrier preventing completion.",
    primary:
      "Send Reminder",
    insight:
      "One step from XCEL",
    playbook:
      "3-Step Quiz Follow-Up"
  },

  "XCEL Completed": {
    title:
      "Ready for exam preparation",
    text:
      "Confirm readiness and help schedule the state exam.",
    primary:
      "Prepare Exam",
    insight:
      "Move toward the state exam",
    playbook:
      "3-Step Exam Playbook"
  },

  "Exam Passed": {
    title:
      "Exam passed-activate the license",
    text:
      "Complete fingerprints and the state license application.",
    primary:
      "Activate License",
    insight:
      "One milestone from licensing",
    playbook:
      "3-Step License Activation"
  },

  "Licensed": {
    title:
      "Licensed and ready for contracting",
    text:
      "Complete contracting to move this agent into production.",
    primary:
      "Start Contracting",
    insight:
      "One milestone from production",
    playbook:
      "3-Step Contracting Playbook"
  },

  "Contracted": {
    title:
      "Contracted and ready for production",
    text:
      "Launch fast-start activity and schedule field training.",
    primary:
      "Launch Production",
    insight:
      "Ready to write business",
    playbook:
      "3-Step Production Launch"
  }
};


function getCommandFirstName(agent) {
  return String(
    getAgentDisplayName(agent) ||
    "Agent"
  )
    .trim()
    .split(/\s+/)[0];
}


function getCommandDays(agent) {
  const value =
    agent.lastActivity ||
    agent.updatedAt ||
    agent.recruitDate ||
    agent.recruit_date;

  if (!value) return null;

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - date.getTime()) /
      86400000
    )
  );
}


function getCommandRisk(agent) {
  const stage =
    agent.stage || "Not Placed";

  const days =
    getCommandDays(agent);

  if (stage === "Contracted") {
    return {
      label: "Low",
      className: "low"
    };
  }

  if (stage === "Licensed") {
    return {
      label:
        days !== null && days >= 14
          ? "High"
          : "Medium",
      className:
        days !== null && days >= 14
          ? "high"
          : "medium"
    };
  }

  if (
    stage === "Not Placed" &&
    days !== null &&
    days >= 7
  ) {
    return {
      label: "High",
      className: "high"
    };
  }

  if (
    days !== null &&
    days >= 14
  ) {
    return {
      label: "High",
      className: "high"
    };
  }

  return {
    label: "Medium",
    className: "medium"
  };
}


function getCommandLastActivity(agent) {
  const key =
    agent.code ||
    agent.email ||
    agent.name;

  const latestActivity =
    activityLog[key]?.[0];

  if (latestActivity?.date) {
    return latestActivity.date;
  }

  const fallback =
    agent.lastActivity ||
    agent.updatedAt ||
    agent.recruitDate ||
    agent.recruit_date;

  if (!fallback) return "-";

  const date =
    new Date(fallback);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric"
    }
  );
}


function renderCommandJourney(agent) {
  const currentStage =
    agent.stage || "Not Placed";

  const currentIndex =
    Math.max(
      0,
      commandStageOrder.indexOf(
        currentStage
      )
    );

  document
    .querySelectorAll(
      ".command-milestone"
    )
    .forEach(
      (milestone, index) => {
        milestone.classList.remove(
          "complete",
          "current"
        );

        const icon =
          milestone.querySelector("i");

        const status =
          milestone.querySelector("span");

        if (index < currentIndex) {
          milestone.classList.add(
            "complete"
          );

          if (icon) {
            icon.textContent = forgeSymbol(10003);
          }

          if (status) {
            status.textContent =
              "Completed";
          }
        }

        else if (index === currentIndex) {
          milestone.classList.add(
            "current"
          );

          if (icon) {
            icon.textContent = "";
          }

          if (status) {
            status.textContent =
              currentStage === "Contracted"
                ? "Complete"
                : "Current";
          }
        }

        else {
          if (icon) {
            icon.textContent = "";
          }

          if (status) {
            status.textContent =
              index === currentIndex + 1
                ? "Next"
                : "Upcoming";
          }
        }
      }
    );
}

function showCommandProfile(agent) {
  if (!agent) return;

  selectedAgent = agent;

  document
    .getElementById("commandEmpty")
    ?.classList.add("hidden");

  document
    .getElementById("commandProfile")
    ?.classList.remove("hidden");

  document
    .getElementById("messageComposer")
    ?.classList.add("hidden");


  const stage =
    agent.stage || "Not Placed";

  const intelligence =
    commandStageIntelligence[stage] ||
    {
      title: "Review this agent",
      text:
        "Review the current licensing position and choose the next step.",
      primary: "Take Action",
      insight:
        "Review journey progress",
      playbook:
        "3-Step Action Playbook"
    };

  const days =
    getCommandDays(agent);

  const risk =
    getCommandRisk(agent);


  setText(
    "commandAvatar",
    getInitials(
      getAgentDisplayName(agent)
    )
  );

  setText(
    "commandName",
    getAgentDisplayName(agent)
  );

  setText(
    "commandFirstName",
    getCommandFirstName(agent)
  );

  setText(
    "commandMeta",
    agent.upline ||
    agent.coordinator ||
    "No coordinator"
  );

  setText(
    "commandStageBadge",
    stage
  );

  setText(
    "commandDaysInStage",
    days === null
      ? "-"
      : `${days} ${
          days === 1
            ? "day"
            : "days"
        }`
  );

  setText(
    "commandRiskLevel",
    risk.label
  );

  const riskElement =
    document.getElementById(
      "commandRiskLevel"
    );

  riskElement?.classList.remove(
    "low",
    "medium",
    "high"
  );

  riskElement?.classList.add(
    risk.className
  );

  setText(
    "commandLastActivity",
    getCommandLastActivity(agent)
  );

  setText(
    "recommendedTitle",
    intelligence.title
  );

  setText(
    "recommendedText",
    intelligence.text
  );

  setText(
    "commandPrimaryActionText",
    intelligence.primary
  );

  setText(
    "commandPlaybookTitle",
    intelligence.playbook
  );

  setText(
    "commandJourneyInsight",
    intelligence.insight
  );

  setText(
    "commandJourneyInsightDetail",
    intelligence.text
  );


  renderCommandJourney(agent);

  renderCoordinatorActions(agent);

  renderLicensingChecklist(agent);

  renderActivityTimeline(agent);

  renderTodayQueue();

  renderCommandCenter(
    agent,
    true
  );
}

function getCoordinatorActionIcon(action) {

  const title = String(
    action.title ||
    action.name ||
    ""
  ).toLowerCase();


  // WELCOME / INTRODUCTION
  if (
    title.includes("welcome") ||
    title.includes("introduce")
  ) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3"/>
        <path d="M3.5 19c.4-3.2 2.4-5 5.5-5s5.1 1.8 5.5 5"/>
        <path d="M17 8v6"/>
        <path d="M14 11h6"/>
      </svg>
    `;
  }


  // QUIZ / DOCUMENT
  if (
    title.includes("quiz") ||
    title.includes("exam")
  ) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z"/>
        <path d="M15 3v5h4"/>
        <path d="M9 12h6"/>
        <path d="M9 16h4"/>
      </svg>
    `;
  }


  // FOLLOW-UP / CALENDAR
  if (
    title.includes("follow") ||
    title.includes("schedule")
  ) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2"/>
        <path d="M8 3v4"/>
        <path d="M16 3v4"/>
        <path d="M3 10h18"/>
        <path d="m9 15 2 2 4-4"/>
      </svg>
    `;
  }


  // CONTRACTING
  if (title.includes("contract")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z"/>
        <path d="M15 3v5h4"/>
        <path d="M9 13h6"/>
        <path d="M9 17h4"/>
      </svg>
    `;
  }


  // DEFAULT ACTION
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 8v4"/>
      <path d="M12 16h.01"/>
    </svg>
  `;
}
function getRecommendedActionIcon(title) {
  const text = String(title || "").toLowerCase();

  if (text.includes("welcome")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3"/>
        <path d="M3.5 19c.4-3.2 2.4-5 5.5-5s5.1 1.8 5.5 5"/>
        <path d="M17 8v6"/>
        <path d="M14 11h6"/>
      </svg>
    `;
  }

  if (text.includes("quiz") || text.includes("exam")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z"/>
        <path d="M15 3v5h4"/>
        <path d="M9 12h6"/>
        <path d="M9 16h4"/>
      </svg>
    `;
  }

  if (text.includes("follow") || text.includes("schedule")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2"/>
        <path d="M8 3v4"/>
        <path d="M16 3v4"/>
        <path d="M3 10h18"/>
        <path d="m9 15 2 2 4-4"/>
      </svg>
    `;
  }

  if (text.includes("contract")) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z"/>
        <path d="M15 3v5h4"/>
        <path d="M9 13h6"/>
        <path d="M9 17h4"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z"/>
    </svg>
  `;
}

function renderCoordinatorActions(agent) {
  const container =
    document.getElementById(
      "coordinatorActions"
    );

  if (!container) return;

  const actions =
    coordinatorActionMap[agent.stage] ||
    [
      {
        title: "Review Agent",
        desc:
          "Review the agents current licensing status."
      }
    ];

  container.innerHTML = "";

  actions
    .slice(0, 3)
    .forEach(
      (action, index) => {
        const row =
          document.createElement("div");

        row.className =
          "action-row";

        const state =
          index === 0
            ? "Start"
            : index === 1
            ? "Waiting"
            : "Pending";

        row.innerHTML = `
          <div class="action-icon">
            ${getCoordinatorActionIcon(action)}
          </div>

          <div class="action-copy">
            <strong>
              ${action.title}
            </strong>

            <span>
              ${action.desc || ""}
            </span>
          </div>

          <button
            type="button"
            data-compose="${action.title}"
            data-method="Text"
          >
            ${state}
          </button>
        `;

        container.appendChild(row);
      }
    );
}
function getActionMessage(actionTitle, agent) {
  const template = actionMessages[actionTitle] || "Hi {agent}, following up on your licensing journey.";
  return template
    .replaceAll("{agent}",      agent?.name        || "")
    .replaceAll("{coordinator}", selectedCoordinator === "All" ? "your coordinator" : selectedCoordinator)
    .replaceAll("{upline}",     agent?.coordinator || "your upline");
}

//  SMART COMPOSER 

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

  currentDeliveryMethod = method;
  setActiveDelivery(method);
  renderTemplateOptions(method);

  const stage = selectedAgent.stage || "Not Placed";
  const template = getStageMessageTemplate(stage, method, selectedAgent, currentMessageVariant);

  setText("smartMethodBadge", method);
  setText("actionTitle", `${method} - ${selectedAgent.name}`);
  setText("actionSubtitle", getActionSubtitle(method, stage));
  setText("messageLabel", getActionMessageLabel(method));

  setText("smartAgentName", selectedAgent.name || "-");
  setText("smartAgentStage", stage);
  setText("smartAgentUpline", selectedAgent.upline || selectedAgent.coordinator || "-");
  setText("templatePickerHint", getTemplatePickerHint(method));

  const phoneEl = document.getElementById("smartAgentPhone");
  if (phoneEl) {
    if (selectedAgent.phone) {
      phoneEl.innerHTML = `
        <a href="tel:${selectedAgent.phone.replace(/\D/g, "")}"
           class="phone-link">
            ${selectedAgent.phone}
        </a>
      `;
    } else {
      phoneEl.innerHTML = `
        <span class="missing-phone">
          No phone number on file
        </span>
      `;
    }
  }

  const subjectWrap = document.getElementById("emailSubjectWrap");
  const subjectEl = document.getElementById("actionSubject");
  const messageEl = document.getElementById("actionMessage");
  const callWrap = document.getElementById("callOutcomeWrap");

  subjectWrap?.classList.toggle("hidden", method !== "Email");
  callWrap?.classList.toggle("hidden", method !== "Call");

  const draft = getSavedActionDraft(selectedAgent, method, currentMessageVariant);

  if (subjectEl) subjectEl.value = draft?.subject ?? template.subject ?? "";
  if (messageEl) messageEl.value = draft?.body ?? template.body ?? "";
}

/*Helper*/
function getActionMessageLabel(method) {
  if (method === "Call") return "Call Script";
  if (method === "Note") return "Coordinator Note";
  if (method === "Zoom") return "Invite Message";
  return "Message";
}

function getTemplatePickerHint(method) {
  const hints = {
    Text: "Use a balanced, direct, or encouragement text.",
    Email: "Choose between professional, concise, or accountability email templates.",
    WhatsApp: "Use a warmer, conversational WhatsApp message.",
    Call: "Switch between a live script, voicemail, or follow-up script.",
    Zoom: "Pick an invite or reminder format.",
    Note: "Choose a quick documentation note template."
  };
  return hints[method] || "Choose a template.";
}

function getTemplateOptionsForMethod(method) {
  const libraries = {
    Text: [
      { key: "default", label: "Balanced" },
      { key: "friendly", label: "Warm" },
      { key: "direct", label: "Direct" },
      { key: "urgent", label: "Urgent" }
    ],
    Email: [
      { key: "default", label: "Professional" },
      { key: "concise", label: "Concise" },
      { key: "accountability", label: "Accountability" },
      { key: "celebration", label: "Celebration" }
    ],
    WhatsApp: [
      { key: "friendly", label: "Warm" },
      { key: "default", label: "Balanced" },
      { key: "direct", label: "Direct" },
      { key: "urgent", label: "Reminder" }
    ],
    Call: [
      { key: "opening", label: "Live Call" },
      { key: "voicemail", label: "Voicemail" },
      { key: "objection", label: "Obstacle" },
      { key: "followup", label: "Follow-Up" }
    ],
    Zoom: [
      { key: "invite", label: "Invite" },
      { key: "reminder", label: "Reminder" }
    ],
    Note: [
      { key: "summary", label: "Summary" },
      { key: "nextstep", label: "Next Step" },
      { key: "attempted", label: "Attempted" }
    ]
  };

  return libraries[method] || libraries.Text;
}

function renderTemplateOptions(method) {
  const container = document.getElementById("messageTemplateOptions");
  if (!container) return;

  const options = getTemplateOptionsForMethod(method);
  if (!options.some((option) => option.key === currentMessageVariant)) {
    currentMessageVariant = options[0]?.key || "default";
  }

  container.innerHTML = options.map((option) => `
    <button
      type="button"
      class="template-chip ${option.key === currentMessageVariant ? "active" : ""}"
      data-template-variant="${option.key}"
      data-template-method="${method}"
    >
      ${option.label}
    </button>
  `).join("");
}

function getSavedActionDraft(agent, method, variant) {
  const key = `forgeActionDraft::${agent?.code || agent?.email || agent?.name || "agent"}::${method}::${variant}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Could not load action draft:", error);
    return null;
  }
}

function saveActionDraft(agent, method, variant, payload) {
  const key = `forgeActionDraft::${agent?.code || agent?.email || agent?.name || "agent"}::${method}::${variant}`;
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.warn("Could not save action draft:", error);
  }
}

function refreshComposerTemplate() {
  if (!selectedAgent) return;
  const stage = selectedAgent.stage || "Not Placed";
  const template = getStageMessageTemplate(stage, currentDeliveryMethod, selectedAgent, currentMessageVariant);
  const subjectEl = document.getElementById("actionSubject");
  const messageEl = document.getElementById("actionMessage");
  if (subjectEl) subjectEl.value = template.subject || "";
  if (messageEl) messageEl.value = template.body || "";
}

function setActiveDelivery(method) {
  document.querySelectorAll(".delivery").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.delivery === method);
  });
}

function getActionSubtitle(method, stage) {
  if (method === "Call") return `Call script for ${stage}.`;
  if (method === "Email") return `Email template for ${stage}.`;
  if (method === "WhatsApp") return `WhatsApp message for ${stage}.`;
  if (method === "Zoom") return `Zoom invite for ${stage}.`;
  if (method === "Note") return `Coordinator note for ${stage}.`;
  return `Text message for ${stage}.`;
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

document.getElementById("saveDraft")?.addEventListener("click", () => {
  if (!selectedAgent) return;
  const method = currentDeliveryMethod || document.getElementById("smartMethodBadge")?.innerText || "Text";
  const payload = {
    subject: document.getElementById("actionSubject")?.value || "",
    body: document.getElementById("actionMessage")?.value || "",
    savedAt: new Date().toISOString()
  };
  saveActionDraft(selectedAgent, method, currentMessageVariant, payload);
  alert("Draft saved.");
});

document.getElementById("sendAction")?.addEventListener("click", () => {
  if (!selectedAgent) return;

  const method =
    document.getElementById("smartMethodBadge")?.innerText || "Text";

  const message =
    document.getElementById("actionMessage")?.value || "";

  const subject =
    document.getElementById("actionSubject")?.value || "";

  completeSmartAction(method, message, subject);
});

function completeSmartAction(method, message, subject = "") {
  const phone = (selectedAgent.phone || "").replace(/\D/g, "");
  const email = selectedAgent.email || "";
  const callOutcome = document.getElementById("callOutcome")?.value || "";
  const activityMessage = method === "Call" && callOutcome
    ? `${message}

Outcome: ${callOutcome}`
    : message;

  logCoordinatorActivity(selectedAgent, method, activityMessage);
  markChecklistFromMethod(method, selectedAgent.stage);

  if (method === "Call" && phone) {
    window.location.href = `tel:${phone}`;
  }

  if (method === "Text" && phone) {
    window.location.href = `sms:${phone}?&body=${encodeURIComponent(message)}`;
  }

  if (method === "Email" && email) {
    window.location.href =
      `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  }

  if (method === "WhatsApp" && phone) {
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  }

  if (method === "Zoom") {
    navigator.clipboard.writeText(message);
    alert("Zoom invite copied. Paste it into text, email, or WhatsApp.");
  }

  if (method === "Note") {
    alert("Note saved.");
  }

  document.getElementById("actionModal")?.classList.add("hidden");

  renderLicensingChecklist(selectedAgent);
  renderActivityTimeline(selectedAgent);
  renderTodayQueue();
}

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
  box.value = `Hi ${selectedAgent.name}, \n\n` + box.value.replace(/^Hi .*?,\s*/i, "");
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
  ".quick-actions button, .command-channel-actions button, .command-add-activity, #takeActionBtn, .take-action-btn, [data-compose]"
);

  if (!actionBtn) return;

  event.preventDefault();
  event.stopPropagation();

  const method = actionBtn.dataset.method || "Text";
  openSmartComposer(method);
});



//---make the delivery buttons inside the modal switch the message type.
document.addEventListener("click", (event) => {
  const deliveryBtn = event.target.closest(".delivery");
  if (!deliveryBtn || !selectedAgent) return;

  event.preventDefault();
  event.stopPropagation();

  openSmartComposer(deliveryBtn.dataset.delivery || "Text");
});

document.addEventListener("click", (event) => {
  const templateBtn = event.target.closest("[data-template-variant]");
  if (!templateBtn || !selectedAgent) return;

  event.preventDefault();
  event.stopPropagation();

  currentMessageVariant = templateBtn.dataset.templateVariant || "default";
  currentDeliveryMethod = templateBtn.dataset.templateMethod || currentDeliveryMethod || "Text";
  renderTemplateOptions(currentDeliveryMethod);
  refreshComposerTemplate();
});
//  ACTIVITY LOG 

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

//  CHECKLIST 

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

//  INSIGHTS 

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
  setText("daysInStage",  "-");
  setText("nextFollowUp", risk === "High" ? "Today" : "Soon");
  setText("aiCoachText",  coachText);
}

//  TODAY QUEUE 

function renderTodayQueue() {
  const queue = document.getElementById("todayQueue");
  if (!queue) return;

  queue.innerHTML = "";

  const priorities = [];

  allAgents.forEach((agent) => {

    switch (agent.stage) {

      case "Not Placed":
        priorities.push({
          priority: "High",
          title: "Welcome " + getAgentDisplayName(agent),
          agent
        });
        break;


      case "Quiz Sent":
        priorities.push({
          priority: "Medium",
          title: "Quiz Reminder",
          agent
        });
        break;


      case "Licensed":
        priorities.push({
          priority: "High",
          title: "Contract " + getAgentDisplayName(agent),
          agent
        });
        break;


      case "Continuing Education":
        priorities.push({
          priority: "High",
          title: "CE Follow-Up",
          agent
        });
        break;
    }
  });


  // ========================================================
  // EMPTY STATE
  // ========================================================

  if (priorities.length === 0) {

    queue.innerHTML = `
      <div class="queue-empty">
        No recommended actions right now.
      </div>
    `;

    return;
  }


  // ========================================================
  // RENDER ACTIONS
  // ========================================================

  priorities.forEach((task) => {

    const row = document.createElement("div");

    row.className = "queue-item";

    row.innerHTML = `

      <div class="queue-icon">
        ${getRecommendedActionIcon(task.title)}
      </div>

      <div class="queue-copy">

        <strong>
          ${task.title}
        </strong>

        <span>
          ${task.priority} priority
        </span>

      </div>

      <button
        type="button"
        class="queue-open-btn"
      >
        Open
      </button>
    `;


    // ======================================================
    // OPEN AGENT
    // ======================================================

    row
      .querySelector(".queue-open-btn")
      ?.addEventListener(
        "click",
        () => {

          selectedAgent = task.agent;

          showCommandProfile(task.agent);

          renderCommandAgentList();
        }
      );


    queue.appendChild(row);
  });
 setText(
    "todayCount",
    priorities.length +
      (priorities.length === 1 ? " Task" : " Tasks")
  );
}

//  GUIDE MODAL 

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
  setText("guideStage", `${agent.name} - ${agent.stage}`);

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

document.getElementById("openGuideBtn")?.addEventListener("click", (event) => {
  if (!selectedAgent) return;
  event.preventDefault();
  event.stopPropagation();
  openGuide(selectedAgent);
});

document.addEventListener("click", (event) => {
  const guideBtn = event.target.closest("#openGuideBtn, .guide-btn");
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

//  CSV IMPORT 

document.getElementById("csvImportInput")?.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      console.log("Starting CSV import...");

      const csvAgents = parseCSV(reader.result).map(normalizeAgent);

      console.log("CSV agents parsed:", csvAgents.length);

      if (!currentUserProfile?.organization_id) {
        throw new Error(
          "Your FORGE profile does not have an organization assigned."
        );
      }

      // Only import agents that have an Agent Code.
// This prevents blank/NULL Agent Codes from creating
// incomplete duplicate records again.

const validAgents = csvAgents.filter((agent) => {
  return agent.code && agent.code.trim() !== "";
});

const skippedAgents = csvAgents.length - validAgents.length;

console.log(
  `Valid agents: ${validAgents.length}. Skipped without Agent Code: ${skippedAgents}`
);

// ==========================================================
// TEAM CSV -> SUPABASE
// Converts imported agents into database rows.
// Uses Agent Code to update existing agents instead of
// creating duplicates.
// ==========================================================

const rows = validAgents
  .filter(agent => agent.code)
  .map((agent) => {

    // Check whether this agent already exists in FORGE
    const existingAgent = allAgents.find(
      (existing) =>
        String(existing.code || "")
          .trim()
          .toLowerCase() ===
        String(agent.code || "")
          .trim()
          .toLowerCase()
    );

   return {
  organization_id:
    currentUserProfile.organization_id,

  agent_code: agent.code,

  name: cleanAgentName(agent.name),

  phone: agent.phone || null,

  email: agent.email || null,

  recruit_date: agent.recruitDate || null,

  upline_code: agent.uplineCode || null,

  upline_name:
    cleanAgentName(agent.upline) || null,

  team_status:
    agent.teamStatus || null,

  stage:
    agent.stage,

import_source:
"Team CSV"
};

}); // closes .map()

console.log("Rows being sent to Supabase:", rows);
     // UPSERT =
// If agent does not exist -> create them.
// If agent already exists -> update their existing record.
//
// We identify an agent using:
// organization_id + agent_code

// ==========================================================
// SAVE TEAM CSV TO SUPABASE
// Upsert prevents duplicate Agent Codes
// inside the same organization.
// ==========================================================

const { data, error } = await forgeSupabase
  .from("agents")
  .upsert(rows, {
    onConflict: "organization_id,agent_code",
    ignoreDuplicates: false
  })
  .select();

if (error) {
  console.error("SUPABASE IMPORT ERROR:", error);
  alert("Import failed: " + error.message);
  return;
}

// Could be newly created OR updated agents.
console.log("Supabase saved agents:", data);

// Reload the organization's team from Supabase.
await loadCSV();

const importedCount =
  Array.isArray(data)
    ? data.length
    : rows.length;

alert(
  `${importedCount} agents imported successfully.`
);

} catch (error) {

  console.error(
    "CSV IMPORT CRASH:",
    error
  );

  alert(
    "Import error: " +
    (error?.message || String(error))
  );

} finally {

  // Allows the same CSV to be selected again later.
  event.target.value = "";
}
    // CLOSE reader.onload
};

  reader.onerror = () => {
    console.error("CSV FILE READ ERROR:", reader.error);
    alert("FORGE could not read the CSV file.");
    event.target.value = "";
  };

  reader.readAsText(file);
});


document
  .getElementById("smartImportBtn")
  ?.addEventListener("click", () => {

    document
      .getElementById("importGuideModal")
      ?.classList.remove("hidden");

  });


document
  .getElementById("startSmartImport")
  ?.addEventListener("click", () => {

    document
      .getElementById("importGuideModal")
      ?.classList.add("hidden");

    document
      .getElementById("smartImportInput")
      ?.click();

  });


document.addEventListener("click", (event) => {
  if (
    event.target.id === "closeImportGuide" ||
    event.target.id === "cancelImportGuide"
  ) {
    document
      .getElementById("importGuideModal")
      ?.classList.add("hidden");
  }
});
function detectTevahFileType(rows) {
  if (!rows?.length) return "unknown";

  const headers = Object.keys(rows[0]).map((h) => h.trim());

  if (
    headers.includes("Agent Code") &&
    headers.includes("Full name") &&
    headers.includes("Team Status")
  ) {
    return "team";
  }

  if (
    headers.includes("AGENT NAME") &&
    headers.includes("CODE") &&
    headers.includes("RESI. LICENSE")
  ) {
    return "compliance";
  }

  if (
    headers.includes("RECRUIT NAME") &&
    headers.includes("RECRUIT CODE")
  ) {
    return "recruit";
  }

  return "unknown";
}
// ==========================================================
// TEAM CSV IMPORT
// Smart Import -> Team CSV -> Supabase
// ==========================================================

function getTeamJourneyStage(teamStatus) {

  const status = String(teamStatus || "")
    .trim()
    .toLowerCase();

  // Furthest stage wins.

  if (status.includes("contracted")) {
    return "Contracted";
  }

  if (
    status.includes("license") ||
    status.includes("licensed")
  ) {
    return "Licensed";
  }

  if (status.includes("exam passed")) {
    return "Exam Passed";
  }

  if (status.includes("xcel")) {
    return "XCEL Completed";
  }

  if (status.includes("quiz sent")) {
    return "Quiz Sent";
  }

  return "Not Placed";
}


async function importTeamFile(parsedRows) {

  console.log(
    "FORGE Team import started:",
    parsedRows.length
  );

  if (!currentUserProfile?.organization_id) {
    throw new Error(
      "FORGE profile does not have an organization."
    );
  }


  // Convert raw Tevah Team CSV rows
  // using your existing normalizeAgent().
  const teamAgents =
    parsedRows.map(normalizeAgent);


  // Only valid people with Agent Code.
  const validAgents =
    teamAgents.filter((agent) =>
      String(agent.code || "").trim()
    );


  console.log(
    "Valid Team agents:",
    validAgents.length
  );


  // Remove duplicate Agent Codes from the SAME FILE.
  const uniqueByCode = new Map();

  validAgents.forEach((agent) => {

    const code =
      String(agent.code)
        .trim()
        .toUpperCase();

    uniqueByCode.set(code, agent);

  });


  const uniqueAgents =
    Array.from(uniqueByCode.values());


  console.log(
    "Unique Team agents:",
    uniqueAgents.length
  );


  const rows =
    uniqueAgents.map((agent) => {

      const teamStatus =
        agent.teamStatus || "";

      return {

        organization_id:
          currentUserProfile.organization_id,

        agent_code:
          String(agent.code)
            .trim()
            .toUpperCase(),

        name:
          cleanAgentName(agent.name)
            .replace(/&/g, " ")
            .replace(/\s+/g, " ")
            .trim(),

        phone:
          agent.phone || null,

        email:
          agent.email
            ? String(agent.email)
                .trim()
                .toLowerCase()
            : null,

        recruit_date:
          agent.recruitDate || null,

        upline_code:
          agent.uplineCode
            ? String(agent.uplineCode)
                .trim()
                .toUpperCase()
            : null,

        upline_name:
          cleanAgentName(agent.upline)
            .replace(/&/g, " ")
            .replace(/\s+/g, " ")
            .trim() || null,

        team_status:
          teamStatus || null,

        stage:
          getTeamJourneyStage(teamStatus),

        import_source:
          "Team CSV"
      };

    });


  console.log(
    "Team rows going to Supabase:",
    rows
  );


  const {
    data,
    error
  } = await forgeSupabase
    .from("agents")
    .upsert(
      rows,
      {
        onConflict:
          "organization_id,agent_code",

        ignoreDuplicates:
          false
      }
    )
    .select();


  if (error) {

    console.error(
      "TEAM IMPORT ERROR:",
      error
    );

    throw error;
  }


  console.log(
    "Team import successful:",
    data
  );


  await loadCSV();


  alert(
    `${uniqueAgents.length} team members imported successfully.`
  );

}
document
  .getElementById("smartImportInput")
  ?.addEventListener("change", async (event) => {

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();

      const parsedRows = parseCSV(text);

      const fileType = detectTevahFileType(parsedRows);

      console.log(
        "FORGE detected Tevah file type:",
        fileType
      );

      if (fileType === "team") {
        await importTeamFile(parsedRows, file);
      }

      else if (fileType === "compliance") {
        await importComplianceFile(parsedRows, file);
      }

      else if (fileType === "recruit") {
        await importRecruitFile(parsedRows, file);
      }

      else {
        alert(
          "FORGE could not recognize this Tevah CSV format."
        );
      }

    } catch (error) {
      console.error(
        "SMART IMPORT ERROR:",
        error
      );

      alert(
        "Import failed: " +
        (error?.message || String(error))
      );

    } finally {
      event.target.value = "";
    }

  });

// ==========================================================
// IMPORT TEAM CSV
// ==========================================================
document.addEventListener("click", (event) => {

  if (event.target.id !== "startCSVImport") return;

  event.preventDefault();
  event.stopPropagation();

  // Close modal
  document
    .getElementById("importGuideModal")
    ?.classList.add("hidden");

  // Open Team CSV picker
  document
    .getElementById("csvImportInput")
    ?.click();

});


// ==========================================================
// IMPORT COMPLIANCE CSV
// ==========================================================
document.addEventListener("click", (event) => {

  if (event.target.id !== "startComplianceImport") return;

  event.preventDefault();
  event.stopPropagation();

  // Close modal
  document
    .getElementById("importGuideModal")
    ?.classList.add("hidden");

  // Open Compliance CSV picker
  document
    .getElementById("complianceImportInput")
    ?.click();

});

//  COMPLIANCE CSV IMPORT 

const STAGE_RANK = {
  "Not Placed": 0,
  "Quiz Sent": 1,
  "Quiz Passed": 2,
  "XCEL Completed": 3,
  "Exam Passed": 4,
  "Licensed": 5,
  "Contracted": 6
};

function isComplianceActive(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "active";
}

function getComplianceJourneyStage(complianceAgent, existingAgent) {
  const currentStage =
    existingAgent?.stage || "Not Placed";

  const residentActive =
    isComplianceActive(complianceAgent.residentLicense);

  const amlActive =
    isComplianceActive(complianceAgent.amlStatus);

  let complianceStage = currentStage;

  // Active Resident License confirms Licensed
  if (residentActive) {
    complianceStage = "Licensed";
  }

  // Active Resident License + Active AML confirms Contracted
  if (residentActive && amlActive) {
    complianceStage = "Contracted";
  }

  // Never move an agent backwards
  const currentRank =
    STAGE_RANK[currentStage] ?? 0;

  const complianceRank =
    STAGE_RANK[complianceStage] ?? 0;

  return complianceRank > currentRank
    ? complianceStage
    : currentStage;
}


document
  .getElementById("complianceImportInput")
  ?.addEventListener("change", (event) => {

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async () => {
      try {

        console.log(
          "Starting Compliance CSV import..."
        );

        const complianceAgents =
          parseCSV(reader.result)
            .map(normalizeComplianceAgent);

        console.log(
          "Compliance agents parsed:",
          complianceAgents.length
        );

        if (!currentUserProfile?.organization_id) {
          throw new Error(
            "Your FORGE profile does not have an organization assigned."
          );
        }


        // =====================================================
        // ONLY USE COMPLIANCE RECORDS WITH AGENT CODE
        // =====================================================

        const validAgents =
          complianceAgents.filter((agent) => {
            return (
              agent.code &&
              String(agent.code).trim() !== ""
            );
          });

        const skippedCount =
          complianceAgents.length -
          validAgents.length;

        console.log(
          `Valid compliance records: ${validAgents.length}. ` +
          `Skipped without Agent Code: ${skippedCount}`
        );


        // =====================================================
        // UPDATE EXISTING TEAM MEMBERS ONLY
        // Compliance CSV must NEVER create a new agent.
        // =====================================================

        let updatedCount = 0;
        let unmatchedCount = 0;
        let failedCount = 0;


        for (const complianceAgent of validAgents) {

          const existingAgent =
            findExistingTeamAgent(
              complianceAgent
            );


          // ===================================================
          // NO MATCH = DO NOT INSERT
          // ===================================================

          if (!existingAgent) {

            console.warn(
              "Compliance record has no Team match:",
              complianceAgent.code,
              complianceAgent.name
            );

            unmatchedCount++;
            continue;
          }


          // ===================================================
          // DETERMINE FINAL JOURNEY STAGE
          // ===================================================

          const finalStage =
            getComplianceJourneyStage(
              complianceAgent,
              existingAgent
            );


          // ===================================================
          // IMPORTANT:
          // Keep TEAM identity information from Team CSV.
          //
          // Compliance should add compliance information,
          // NOT overwrite phone/name/recruit date/upline with
          // data from another CSV column accidentally.
          // ===================================================

          const updates = {

            agent_level:
              complianceAgent.level || null,

            resident_state:
              complianceAgent.residentState || null,

            resident_license:
              complianceAgent.residentLicense || null,

            eo_status:
              complianceAgent.eoStatus || null,

            aml_status:
              complianceAgent.amlStatus || null,

            tevah_platform_fee:
              complianceAgent.tevahPlatformFee || null,

            npn:
              complianceAgent.npn || null,

            stage:
              finalStage,

            import_source:
              "Team CSV + Compliance"
          };


          // ===================================================
          // UPDATE THE EXACT EXISTING DATABASE RECORD
          // ===================================================

          const { error } =
            await forgeSupabase
              .from("agents")
              .update(updates)
              .eq(
                "organization_id",
                currentUserProfile.organization_id
              )
              .eq(
                "id",
                existingAgent.id
              );


          if (error) {

            console.error(
              "COMPLIANCE UPDATE ERROR:",
              complianceAgent.code,
              error
            );

            failedCount++;
            continue;
          }


          updatedCount++;
        }


        // =====================================================
        // RELOAD DATABASE AFTER ALL UPDATES
        // =====================================================

        await loadCSV();


        console.log(
          "Compliance import complete:",
          {
            updated: updatedCount,
            unmatched: unmatchedCount,
            failed: failedCount,
            skipped: skippedCount
          }
        );


        alert(
          `${updatedCount} compliance records updated successfully.` +
          (unmatchedCount
            ? ` ${unmatchedCount} unmatched records were skipped.`
            : "") +
          (failedCount
            ? ` ${failedCount} records failed to update.`
            : "")
        );


      } catch (error) {

        console.error(
          "COMPLIANCE IMPORT ERROR:",
          error
        );

        alert(
          "Compliance import error: " +
          (error?.message || String(error))
        );

      } finally {

        // Allow same file to be selected again
        event.target.value = "";

      }
    };


    reader.onerror = () => {

      console.error(
        "COMPLIANCE CSV FILE READ ERROR:",
        reader.error
      );

      alert(
        "FORGE could not read the Compliance CSV file."
      );

      event.target.value = "";
    };


    reader.readAsText(file);

  });
//  STORAGE 

function saveAgentsToLocalStorage() {
  localStorage.setItem("forgeAgents", JSON.stringify(allAgents));
}

//  GROWTH PAGE 

function getGrowthStatus(team) {
  const total = Number(team.total || 0);

  if (total === 0) {
    return "No Activity";
  }

  const progress =
    Number(team.progress || 0);

  const licensed =
    Number(team.licensed || 0);

  const contracted =
    Number(team.contracted || 0);

  const inactive =
    Number(team.inactive || 0);


  // ========================================================
  // CONVERSION RATES
  // ========================================================

  const licensingRate =
    licensed / total;

  const contractingRate =
    licensed > 0
      ? contracted / licensed
      : 0;

  const inactiveRate =
    inactive / total;


  // ========================================================
  // NEEDS ATTENTION
  // ========================================================

  if (
    inactiveRate >= 0.5 ||
    (
      total >= 3 &&
      licensed === 0 &&
      progress < 20
    )
  ) {
    return "Needs Attention";
  }


  // ========================================================
  // STRONG
  //
  // Strong licensing progress AND
  // strong movement from licensed -> contracted.
  // ========================================================

  if (
    progress >= 55 &&
    licensingRate >= 0.5 &&
    contractingRate >= 0.6
  ) {
    return "Strong";
  }


  // ========================================================
  // HEALTHY
  // ========================================================

  if (
    progress >= 30 ||
    licensingRate >= 0.3 ||
    contracted > 0
  ) {
    return "Healthy";
  }


  // ========================================================
  // BUILDING
  // ========================================================

  return "Building";
}
// ==========================================================
// GROWTH HIERARCHY HELPERS
// ==========================================================

function normalizeHierarchyValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


function buildAgentIndexes() {
  const byCode = new Map();
  const byName = new Map();

  allAgents.forEach((agent) => {
    const code = normalizeHierarchyValue(agent.code);
    const name = normalizeHierarchyValue(agent.name);

    if (code) {
      byCode.set(code, agent);
    }

    if (name) {
      byName.set(name, agent);
    }
  });

  return { byCode, byName };
}


function findImmediateUpline(agent, indexes) {
  if (!agent) return null;

  const uplineCode =
    normalizeHierarchyValue(agent.uplineCode);

  const uplineName =
    normalizeHierarchyValue(agent.upline);

  // Prefer code because it is safer than matching names
  if (
    uplineCode &&
    indexes.byCode.has(uplineCode)
  ) {
    return indexes.byCode.get(uplineCode);
  }

  if (
    uplineName &&
    indexes.byName.has(uplineName)
  ) {
    return indexes.byName.get(uplineName);
  }

  return null;
}


// Returns every upline above this agent.
// Example:
// Sarah -> John -> Mary -> Dorothy -> Georgette
function getRollupChain(agent, indexes) {
  const chain = [];

  const visited = new Set();

  let current = agent;

  while (current) {

    const currentKey =
      normalizeHierarchyValue(
        current.id ||
        current.code ||
        current.name
      );

    if (
      currentKey &&
      visited.has(currentKey)
    ) {
      console.warn(
        "Hierarchy cycle detected:",
        current.name
      );

      break;
    }

    if (currentKey) {
      visited.add(currentKey);
    }

    const upline =
      findImmediateUpline(
        current,
        indexes
      );

    if (!upline) break;

    chain.push(upline);

    current = upline;
  }

  return chain;
}


// Finds every descendant beneath a leader,
// regardless of how many generations deep.
function getOrganizationMembers(
  leader,
  indexes
) {
  return allAgents.filter((agent) => {

    if (
      String(agent.id) ===
      String(leader.id)
    ) {
      return false;
    }

    const chain =
      getRollupChain(
        agent,
        indexes
      );

    return chain.some((upline) =>
      String(upline.id) ===
      String(leader.id)
    );
  });
}


// Direct recruits only
function getDirectRecruits(leader) {
  return allAgents.filter((agent) => {

    const leaderCode =
      normalizeHierarchyValue(
        leader.code
      );

    const leaderName =
      normalizeHierarchyValue(
        leader.name
      );

    const agentUplineCode =
      normalizeHierarchyValue(
        agent.uplineCode
      );

    const agentUplineName =
      normalizeHierarchyValue(
        agent.upline
      );

    if (
      leaderCode &&
      agentUplineCode
    ) {
      return (
        leaderCode ===
        agentUplineCode
      );
    }

    return (
      leaderName &&
      leaderName ===
      agentUplineName
    );
  });
}
// ==========================================================
// GROWTH PAGE - FULL ORGANIZATION HIERARCHY
// ==========================================================

function renderGrowthPage() {
  const indexes =
    buildAgentIndexes();

  const leaders =
    allAgents.filter((agent) =>
      getDirectRecruits(agent).length > 0
    );


  const stageProgress = {
    "not placed": 0,
    "not started": 0,

    "quiz sent": 10,
    "quiz passed": 20,

    "xcel": 30,
    "xcel completed": 40,

    "simulation exams": 50,

    "exam scheduled": 60,
    "exam passed": 70,

    "fingerprints": 80,

    "applied for license": 90,

    "licensed": 95,

    "contracted": 100
  };


  const growthTeams =
    leaders.map((leader) => {

      const directMembers =
        getDirectRecruits(leader);

      const organizationMembers =
        getOrganizationMembers(
          leader,
          indexes
        );


      let active = 0;
      let inactive = 0;
      let licensed = 0;
      let contracted = 0;
      let progressPoints = 0;


      organizationMembers.forEach(
        (agent) => {

          const stage =
            normalizeHierarchyValue(
              agent.stage ||
              agent.pipelineStage
            );

          const status =
            normalizeHierarchyValue(
              agent.teamStatus ||
              agent.status
            );


          if (
            status.includes("inactive")
          ) {
            inactive++;
          } else {
            active++;
          }


          if (
            stage === "licensed" ||
            stage === "contracted"
          ) {
            licensed++;
          }


          if (
            stage === "contracted"
          ) {
            contracted++;
          }


          progressPoints +=
            stageProgress[stage] ?? 0;
        }
      );


      const total =
        organizationMembers.length;


      const progress =
        total > 0
          ? Math.round(
              progressPoints /
              total
            )
          : 0;


      return {
        name:
          `${leader.name}'s Organization`,

        leader:
          leader.name,

        leaderId:
          leader.id,

        leaderCode:
          leader.code,

        direct:
          directMembers.length,

        total,

        active,
        inactive,
        licensed,
        contracted,
        progress,

        members:
          organizationMembers
      };
    });


  growthTeams.sort(
    (a, b) =>
      b.contracted - a.contracted ||
      b.licensed - a.licensed ||
      b.total - a.total ||
      b.progress - a.progress
  );


  console.log(
    "Hierarchical Growth Teams:",
    growthTeams
  );


  renderGrowthRows(
    growthTeams
  );

  renderGrowthCards(
    growthTeams
  );
}

function renderGrowthRows(growthTeams) {
  const list =
    document.getElementById("teamPerformanceList");

  if (!list) return;

  list.innerHTML = `
    <div class="growth-table-head">
      <span>Rank</span>
      <span>Leader</span>
      <span>Progress</span>
      <span>Direct</span>
      <span>Organization</span>
      <span>Licensed</span>
      <span>Contracted</span>
      <span>Status</span>
      <span></span>
    </div>
  `;


  growthTeams.forEach((team, index) => {
  const status = getGrowthStatus(team);

  const row = document.createElement("div");
  row.className = "growth-table-row";

  row.innerHTML = `
    <div class="rank">
      ${index + 1}
    </div>

    <div class="team-name">
      <strong>${team.leader}</strong>

      <small>
        ${team.direct} direct - ${team.total} organization
      </small>
    </div>

    <div class="momentum-cell">
      <strong>${team.progress}%</strong>

      <span class="momentum-bar">
        <span
          class="momentum-fill"
          style="width:${team.progress}%"
        ></span>
      </span>
    </div>

    <div class="growth-number">
      ${team.direct}
    </div>

    <button
      type="button"
      class="growth-number growth-org-button"
      data-leader-id="${team.leaderId}"
    >
      ${team.total}
    </button>

    <div class="growth-number">
      ${team.licensed}
    </div>

    <div class="growth-number">
      ${team.contracted}
    </div>

    <div>
      <span
        class="status-pill ${
          status
            .toLowerCase()
            .replaceAll(" ", "-")
        }"
      >
        ${status}
      </span>
    </div>

    <div>
      <button
        type="button"
        class="growth-view-team-btn"
      >
        View
      </button>
    </div>
  `;

  row
    .querySelector(".growth-view-team-btn")
    ?.addEventListener("click", () => {
      openGrowthTeamDrawer(team);
    });

  row
    .querySelector(".growth-org-button")
    ?.addEventListener("click", () => {
      openGrowthTeamDrawer(team);
    });

  list.appendChild(row);
});

} // closes renderGrowthRows

function renderGrowthCards(growthTeams) {

  const leadersWithDownline =
    growthTeams.length;

  const organizationSize =
    allAgents.length;

  const avgProgress =
    leadersWithDownline
      ? Math.round(
          growthTeams.reduce(
            (sum, team) =>
              sum + team.progress,
            0
          ) /
          leadersWithDownline
        )
      : 0;


  const topTeam =
    growthTeams[0] || {
      leader: "No Leader",
      name: "No Organization",
      progress: 0,
      direct: 0,
      total: 0,
      active: 0,
      licensed: 0,
      contracted: 0,
      inactive: 0
    };


 const needsAttention =
  growthTeams.filter(
    (team) =>
      getGrowthStatus(team) ===
      "Needs Attention"
  ).length;


  // ========================================================
  // TOP KPI CARDS
  // ========================================================

  setText(
    "growthTotalTeams",
    organizationSize
  );

  setText(
    "growthAvgMomentum",
    avgProgress
  );

  setText(
    "growthTopTeam",
    topTeam.leader
  );

  setText(
    "growthTopMomentum",
    `Progress ${topTeam.progress}%`
  );

  setText(
    "growthNeedsAttention",
    needsAttention
  );
   

  // ========================================================
  // AVERAGE TREND
  // ========================================================

  setText(
    "growthTrend",
    `${avgProgress}% average across ${leadersWithDownline} leaders`
  );
}
// ==========================================================
// GROWTH TEAM INTELLIGENCE DRAWER
// ==========================================================

function openGrowthTeamDrawer(team) {
  if (!team) return;

  selectedGrowthTeam = team;

  const drawer =
    document.getElementById("growthTeamDrawer");

  if (!drawer) return;


  // ========================================================
  // BASIC SUMMARY
  // ========================================================

  setText(
    "growthDrawerLeader",
    team.leader || "Leader"
  );

  setText(
    "growthDrawerSummary",
    `${team.total} organization members - ${team.direct} direct recruits`
  );

  setText(
    "growthDrawerDirect",
    team.direct
  );

  setText(
    "growthDrawerTotal",
    team.total
  );

  setText(
    "growthDrawerLicensed",
    team.licensed
  );

  setText(
    "growthDrawerContracted",
    team.contracted
  );

  setText(
    "growthDrawerProgress",
    `${team.progress}%`
  );


  // ========================================================
  // FIND LEADER
  // ========================================================

  const leader =
    allAgents.find(
      (agent) =>
        String(agent.id) ===
        String(team.leaderId)
    );

  if (!leader) {
    console.warn(
      "Growth leader not found:",
      team
    );
    return;
  }


  const indexes =
    buildAgentIndexes();

  const directMembers =
    getDirectRecruits(leader);

  const organizationMembers =
    getOrganizationMembers(
      leader,
      indexes
    );


  setText(
    "growthDrawerDirectCount",
    directMembers.length
  );

  setText(
    "growthDrawerOrgCount",
    organizationMembers.length
  );


  // ========================================================
  // PIPELINE DISTRIBUTION
  // ========================================================

  renderGrowthPipelineDistribution(
    organizationMembers
  );


  // ========================================================
  // LISTS
  // ========================================================

  renderGrowthDrawerAgents(
    "growthDrawerDirectList",
    directMembers
  );

  renderGrowthDrawerAgents(
    "growthDrawerOrgList",
    organizationMembers
  );


  drawer.classList.remove("hidden");

  document.body.classList.add(
    "growth-drawer-open"
  );
}


function closeGrowthTeamDrawer() {
  document
    .getElementById("growthTeamDrawer")
    ?.classList.add("hidden");

  document.body.classList.remove(
    "growth-drawer-open"
  );
}


// ==========================================================
// DRAWER AGENT LIST
// ==========================================================

function renderGrowthDrawerAgents(
  containerId,
  agents
) {
  const container =
    document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = "";


  if (!agents.length) {
    container.innerHTML = `
      <div class="growth-drawer-empty">
        No agents
      </div>
    `;

    return;
  }


  agents
    .slice()
    .sort((a, b) =>
      getAgentDisplayName(a)
        .localeCompare(
          getAgentDisplayName(b)
        )
    )
    .forEach((agent) => {

      const row =
        document.createElement("button");

      row.type = "button";

      row.className =
        "growth-drawer-agent";

      row.innerHTML = `
        <span class="growth-drawer-avatar">
          ${getInitials(
            getAgentDisplayName(agent)
          )}
        </span>

        <span class="growth-drawer-agent-copy">

          <strong>
            ${getAgentDisplayName(agent)}
          </strong>

          <small>
            ${agent.stage || "Not Placed"}
          </small>

        </span>

        <span class="growth-drawer-chevron">
          >
        </span>
      `;


      row.addEventListener(
        "click",
        () => {

          closeGrowthTeamDrawer();

          selectedAgent = agent;

          showPage("Agents");

          showAgentProfile(agent);

          document
            .querySelectorAll(".nav-btn")
            .forEach((btn) =>
              btn.classList.toggle(
                "active",
                btn.textContent.trim() === "Agents"
              )
            );
        }
      );


      container.appendChild(row);
    });
}


// ==========================================================
// PIPELINE DISTRIBUTION
// ==========================================================

function renderGrowthPipelineDistribution(
  agents
) {
  const container =
    document.getElementById(
      "growthDrawerPipeline"
    );

  if (!container) return;


  const stageOrder = [
    "Not Placed",
    "Quiz Sent",
    "Quiz Passed",
    "XCEL Completed",
    "Exam Scheduled",
    "Exam Passed",
    "Fingerprints",
    "Applied For License",
    "Licensed",
    "Contracted"
  ];


  const counts = {};

  stageOrder.forEach((stage) => {
    counts[stage] = 0;
  });


  agents.forEach((agent) => {
    const stage =
      agent.stage || "Not Placed";

    if (!(stage in counts)) {
      counts[stage] = 0;
    }

    counts[stage]++;
  });


  const total =
    Math.max(agents.length, 1);


  container.innerHTML =
    Object.entries(counts)
      .filter(
        ([, count]) =>
          count > 0
      )
      .map(
        ([stage, count]) => {

          const percent =
            Math.round(
              (count / total) * 100
            );

          return `
            <div class="growth-pipeline-row">

              <div class="growth-pipeline-label">
                <span>${stage}</span>
                <strong>${count}</strong>
              </div>

              <div class="growth-pipeline-track">
                <span
                  style="width:${percent}%"
                ></span>
              </div>

            </div>
          `;
        }
      )
      .join("");
}


// ==========================================================
// DRAWER EVENTS
// ==========================================================

document
  .getElementById("closeGrowthDrawer")
  ?.addEventListener(
    "click",
    closeGrowthTeamDrawer
  );


document
  .getElementById(
    "closeGrowthDrawerBackdrop"
  )
  ?.addEventListener(
    "click",
    closeGrowthTeamDrawer
  );


document.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Escape") {
      closeGrowthTeamDrawer();
    }
  }
);
//  STAGE MESSAGE TEMPLATES 

function getStageMessageTemplate(stage, method, agent, variant = "default") {
  const fullName = agent?.name || "there";
  const firstName = String(fullName).trim().split(/\s+/)[0] || fullName;
  const coordinatorName = selectedCoordinator === "All" ? "your licensing coordinator" : selectedCoordinator;

  const stageContextMap = {
    "Not Placed": {
      milestone: "starting the licensing journey",
      nextStep: "complete the readiness check so we can place you on the right path",
      request: "Reply and let me know whether you have already started licensing, taken any course, or completed any exam.",
      urgency: "The sooner we confirm your starting point, the faster we can move you forward."
    },
    "Quiz Sent": {
      milestone: "the licensing readiness quiz",
      nextStep: "complete the quiz so I can guide your next step",
      request: "Please complete the quiz today and reply \"Done\" when finished.",
      urgency: "That keeps your momentum moving and helps us avoid delay."
    },
    "Quiz Passed": {
      milestone: "passing the readiness quiz",
      nextStep: "move into XCEL and begin exam preparation",
      request: "Please confirm once you have access to XCEL and let me know if you need help getting started.",
      urgency: "I want to keep your momentum strong while everything is still fresh."
    },
    "XCEL Completed": {
      milestone: "completing XCEL",
      nextStep: "schedule your state exam",
      request: "Please schedule your state exam and send me the confirmed date.",
      urgency: "It is best to do that quickly while the material is still fresh."
    },
    "Exam Passed": {
      milestone: "passing your exam",
      nextStep: "complete your license application and remaining state requirements",
      request: "Send me an update on what has already been completed so I can guide the rest.",
      urgency: "You are very close, so now is the time to finish strong."
    },
    "Continuing Education": {
      milestone: "the continuing education step",
      nextStep: "complete CE and clear any missing compliance items",
      request: "Please complete the CE requirement and let me know if you need login or course help.",
      urgency: "Removing this blocker quickly will keep your progress moving."
    },
    "Licensed": {
      milestone: "becoming licensed",
      nextStep: "complete contracting and move into production",
      request: "Please review your contracting instructions and tell me once you have started.",
      urgency: "I do not want you to sit licensed without moving into the next stage."
    },
    "Contracted": {
      milestone: "reaching the contracting stage",
      nextStep: "complete appointment and fast-start activity",
      request: "Please confirm once your appointment steps are submitted and we will prepare your next launch steps.",
      urgency: "You are now very close to production."
    }
  };

  const context = stageContextMap[stage] || stageContextMap["Not Placed"];

  const emailTemplates = {
    default: {
      subject: `${stage} - Next Step`,
      body: `Hi ${firstName},\n\nCongratulations on ${context.milestone}. The next step is to ${context.nextStep}.\n\n${context.request}\n\n${context.urgency}\n\nI am here to help.\n\n${coordinatorName}`
    },
    concise: {
      subject: `${stage} - Quick Follow-Up`,
      body: `Hi ${firstName},\n\nQuick follow-up: your next step is to ${context.nextStep}.\n\n${context.request}\n\nPlease update me once done.\n\n${coordinatorName}`
    },
    accountability: {
      subject: `${stage} - Action Needed`,
      body: `Hi ${firstName},\n\nI am following up because we need to keep your licensing journey moving. Your next step is to ${context.nextStep}.\n\n${context.request}\n\nPlease send me an update today so we can keep your progress on track.\n\n${coordinatorName}`
    },
    celebration: {
      subject: `Congratulations, ${firstName}!`,
      body: `Hi ${firstName},\n\nCongratulations on ${context.milestone}. That is a meaningful step forward.\n\nNow let us build on that momentum by making sure you ${context.nextStep}.\n\n${context.request}\n\nYou are doing well, and I am here to support you.\n\n${coordinatorName}`
    }
  };

  const textTemplates = {
    default: `Hi ${firstName}, congratulations on ${context.milestone}. Your next step is to ${context.nextStep}. ${context.request} ${context.urgency}`,
    friendly: `Hi ${firstName}! Great job on ${context.milestone}. Now let’s keep the momentum going. The next step is to ${context.nextStep}. ${context.request}`,
    direct: `Hi ${firstName}, next step: ${context.nextStep}. ${context.request} Please update me once done.`,
    urgent: `Hi ${firstName}, quick reminder: you need to ${context.nextStep}. ${context.request} Please send me an update today.`
  };

  const callTemplates = {
    opening: `Call ${fullName}. Start warm, congratulate them on ${context.milestone}, then say the purpose of the call is to help them ${context.nextStep}. Ask: what is the current status, what is blocking you, and what exact action can you complete today? End by confirming a specific next step and timeline.`,
    voicemail: `Hi ${firstName}, this is ${coordinatorName}. I am calling to follow up on your licensing journey. Your next step is to ${context.nextStep}. Please call or text me back so I can help you move forward.`,
    objection: `Call ${fullName}. Ask what has slowed them down. Listen first, identify the blocker, reassure them, then bring the conversation back to the key next step: ${context.nextStep}. Close with one concrete commitment for today.`,
    followup: `Call ${fullName}. Remind them that the next step is to ${context.nextStep}. Review the last update, ask whether they have completed it, and if not, schedule the exact follow-up date before ending the call.`
  };

  const zoomTemplates = {
    invite: {
      subject: `Quick Zoom Support - ${stage}`,
      body: `Hi ${firstName},\n\nLet’s schedule a quick Zoom session to help you move forward. We will review where you are, what is pending, and how to complete the next step: ${context.nextStep}.\n\nReply with a time that works for you today or tomorrow.\n\n${coordinatorName}`
    },
    reminder: {
      subject: `Zoom Reminder - Licensing Support`,
      body: `Hi ${firstName},\n\nFriendly reminder about our Zoom support session. We will use the time to help you ${context.nextStep}.\n\nPlease confirm your availability.\n\n${coordinatorName}`
    }
  };

  const noteTemplates = {
    summary: `${fullName} is currently in ${stage}. Reviewed current status and discussed next step: ${context.nextStep}. Awaiting agent update.`,
    nextstep: `${fullName} needs to ${context.nextStep}. Follow up after the agent confirms completion.`,
    attempted: `Attempted outreach to ${fullName} regarding ${stage}. Goal was to help the agent ${context.nextStep}. No final outcome recorded yet.`
  };

  if (method === "Email") {
    return emailTemplates[variant] || emailTemplates.default;
  }

  if (method === "Call") {
    return { subject: "", body: callTemplates[variant] || callTemplates.opening };
  }

  if (method === "Zoom") {
    return zoomTemplates[variant] || zoomTemplates.invite;
  }

  if (method === "Note") {
    return { subject: "", body: noteTemplates[variant] || noteTemplates.summary };
  }

  if (method === "WhatsApp") {
    return { subject: "", body: (textTemplates[variant] || textTemplates.friendly).replace(/\s+/g, " ").trim().slice(0, 520) };
  }

  return { subject: "", body: (textTemplates[variant] || textTemplates.default).replace(/\s+/g, " ").trim().slice(0, 420) };
}

//  STAGE COLOR 

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

//  GROWTH HELPERS 

function getDirectDownlineCount(leaderName, agents) {
  return agents.filter((a) =>
    String(a.coordinator || "").trim().toLowerCase() === String(leaderName || "").trim().toLowerCase()
  ).length;
}

function isLeader(agent, agents) {
  return getDirectDownlineCount(agent.name, agents) > 0;
}
// ==========================================================
// LOAD CURRENT FORGE USER PROFILE
// ==========================================================

async function loadCurrentUserProfile() {

  const {
    data: { user },
    error: authError
  } = await forgeSupabase.auth.getUser();

  if (authError) {
    console.error(
      "FORGE AUTH USER ERROR:",
      authError
    );
    return null;
  }

  if (!user?.email) {
    console.error(
      "FORGE: No authenticated user email."
    );
    return null;
  }

  const {
    data: profile,
    error: profileError
  } = await forgeSupabase
    .from("profiles")
    .select("*")
    .eq(
      "email",
      user.email.toLowerCase()
    )
    .maybeSingle();

  if (profileError) {
    console.error(
      "FORGE PROFILE ERROR:",
      profileError
    );
    return null;
  }

  if (!profile) {
    console.error(
      "FORGE profile not found for:",
      user.email
    );
    return null;
  }

  currentUserProfile = profile;

console.log(
  "Current FORGE profile:",
  currentUserProfile
);

// Load platform / organization context
await loadPlatformAdminStatus();
await loadAvailableOrganizations();
setInitialOrganization();

// Render user after context is known
renderLoggedInUser();

return profile;
}
//  DOM READY 

document.addEventListener("DOMContentLoaded", async () => {
  const authenticated = await protectForge();

if (!authenticated) return;
  
  document.addEventListener("click", (event) => {
    const navBtn = event.target.closest(".nav-btn");
    if (!navBtn) return;

    document.querySelectorAll(".nav-btn").forEach((btn) =>
      btn.classList.remove("active")
    );

    navBtn.classList.add("active");
    showPage(navBtn.textContent.trim());
  });

  document.addEventListener("click", (event) => {
    const filterBtn = event.target.closest(".filter");
    if (!filterBtn) return;

    document.querySelectorAll(".filter").forEach((btn) =>
      btn.classList.remove("active")
    );

    filterBtn.classList.add("active");
    renderDashboard(filterBtn.dataset.filter || "all");
  });
  // your click listeners stay here...

 const profile = await loadCurrentUserProfile();

if (!profile) return;

await loadCSV();

  setInterval(updateTime, 30000);
});

// AI buttons --------
document.getElementById("rewriteProfessional")?.addEventListener("click", () => {
  rewriteActionMessage("professional");
});

document.getElementById("rewriteFriendly")?.addEventListener("click", () => {
  rewriteActionMessage("friendly");
});

document.getElementById("rewriteShorter")?.addEventListener("click", () => {
  rewriteActionMessage("shorter");
});

document.getElementById("copyActionMessage")?.addEventListener("click", () => {
  const message = document.getElementById("actionMessage")?.value || "";
  navigator.clipboard.writeText(message);
  alert("Message copied.");
});

function rewriteActionMessage(style) {
  const box = document.getElementById("actionMessage");
  if (!box) return;

  let text = box.value.trim();

  if (style === "professional") {
    box.value = text
      .replace(/Hi /i, "Hello ")
      + "\n\nThank you.";
  }

  if (style === "friendly") {
    box.value =
      `Hi ${selectedAgent?.name || ""}, \n\n` +
      text.replace(/^Hi .*?,\s*/i, "");
  }

  if (style === "shorter") {
    box.value = text
      .split(".")
      .filter(Boolean)
      .slice(0, 3)
      .join(". ")
      .trim() + ".";
  }
}


// ==========================================================
// HOME SUMMARY LINKS
// ==========================================================

document.addEventListener("click", function (event) {

  const button =
    event.target.closest(".summary-link");

  if (!button) return;

  event.preventDefault();

  const target =
    button.dataset.filterTarget;

  console.log(
    "HOME SUMMARY CLICK:",
    target
  );


  // --------------------------------------------------------
  // VIEW ALL
  // --------------------------------------------------------

  if (target === "all") {

    showPage("Agents");

    setHomeNavActive("Agents");

    return;
  }


  // --------------------------------------------------------
// VIEW PIPELINE
// --------------------------------------------------------

if (target === "pipeline") {

  currentJourneyMode = "launch";

  document
    .querySelectorAll(".journey-mode")
    .forEach((button) => {

      button.classList.toggle(
        "active",
        button.dataset.mode === "launch"
      );

    });

  showPage("Journey");

  setHomeNavActive("Journey");

  renderJourneyPage();

  return;
}


  // --------------------------------------------------------
// VIEW LICENSED
// --------------------------------------------------------

if (target === "licensed") {

  openActivateStageFromHome(
    "Licensed"
  );

  return;
}


// --------------------------------------------------------
// VIEW CONTRACTED
// --------------------------------------------------------

if (target === "contracted") {

  openActivateStageFromHome(
    "Contracted"
  );

  return;
}

});

function setHomeNavActive(pageName) {

  document
    .querySelectorAll(".nav-btn")
    .forEach((button) => {

      button.classList.toggle(
        "active",
        button.textContent
          .trim()
          .toLowerCase() ===
          pageName.toLowerCase()
      );

    });
}

// ==========================================================
// HOME -> JOURNEY ACTIVATE STAGE
// ==========================================================

function openActivateStageFromHome(stage) {

  // 1. Switch Journey to ACTIVATE mode
  currentJourneyMode = "activate";


  // 2. Update Launch / Activate toggle buttons
  document
    .querySelectorAll(".journey-mode")
    .forEach((button) => {

      button.classList.toggle(
        "active",
        button.dataset.mode === "activate"
      );

    });


  // 3. Open Journey
  showPage("Journey");

  setHomeNavActive("Journey");


  // 4. Render Journey using Activate mode
  renderJourneyPage();


  // 5. Focus the requested column
  setTimeout(() => {

    const listId =
      stage === "Licensed"
        ? "journeyLicensedList"
        : "journeyContractedList";


    const list =
      document.getElementById(listId);


    const column =
      list?.closest(".journey-column");


    if (!column) {

      console.warn(
        "FORGE could not locate Journey stage:",
        stage
      );

      return;
    }


    column.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center"
    });


    column.classList.add(
      "forge-stage-focus"
    );


    setTimeout(() => {

      column.classList.remove(
        "forge-stage-focus"
      );

    }, 1800);

  }, 100);
}