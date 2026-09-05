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
let commandStageFilter = "all";
let commandSortMode = "priority";
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
  status,
  top_leader_name,
  top_leader_email,
  top_leader_agent_code
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
      row["RECRUIT NAME"] ||
      row["Full name"] ||
      row["AGENT NAME"] ||
      ""
    ),

    code: String(
      row["RECRUIT CODE"] ||
      row["AGENT CODE"] ||
      row["Agent Code"] ||
      row["CODE"] ||
      ""
    ).trim(),

    phone: String(
      row["PHONE"] ||
      row["Phone"] ||
      ""
    ).trim(),

    email: String(
      row["EMAIL"] ||
      row["Email"] ||
      ""
    )
      .trim()
      .toLowerCase(),

    recruitDate: String(
      row["RECRUIT DATE"] ||
      row["Recruit Date"] ||
      row["Recruit Date ( CST )"] ||
      ""
    ).trim(),

    upline: cleanAgentName(
      row["UPLINE"] ||
      row["Upline Name"] ||
      row["UPLINE AGENT"] ||
      ""
    )
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

  let recruiter =
  findAgentBySmartMatch({
    name: recruiterName
  });

if (!recruiter) {
  console.warn(
    `Recruiter "${recruiterName}" is not yet in this organization. ` +
    `FORGE will still import the recruit list.`
  );

  recruiter = {
    name: recruiterName,
    code: null
  };
}

  const recruits =
  parsedRows
    .map(normalizeRecruitAgent)
    .filter(agent =>
      agent.name &&
      agent.name.trim() !== ""
    );

  let created = 0;
  let updated = 0;

  for (const recruit of recruits) {

    const existing =
      findAgentBySmartMatch(recruit);

    const row = {
      organization_id:
        getActiveOrganizationId(),

      agent_code:
  recruit.code ||
  recruit.email ||
  recruit.phone ||
  `RECRUIT-${normalizeMatchName(recruit.name)}`,

      name:
        cleanAgentName(recruit.name),

      phone:
        recruit.phone || null,

      email:
        recruit.email || null,

      recruit_date:
        recruit.recruitDate || null,

     upline_name:
  cleanAgentName(
    recruit.upline ||
    recruiter?.name ||
    ""
  ) || null,

upline_code:
  recruiter?.code || null,

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
let selectedImportFiles = [];

const importFileInput = document.getElementById("importFileInput");
const chooseImportFiles = document.getElementById("chooseImportFiles");
const importFileList = document.getElementById("importFileList");
const selectedFileCount = document.getElementById("selectedFileCount");
const confirmImport = document.getElementById("confirmImport");

chooseImportFiles?.addEventListener("click", () => {
  importFileInput?.click();
});

importFileInput?.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);

  files.forEach((file) => {
    const alreadyAdded = selectedImportFiles.some(
      (existing) =>
        existing.name === file.name &&
        existing.size === file.size
    );

    if (!alreadyAdded) {
      selectedImportFiles.push(file);
    }
  });

  renderSelectedImportFiles();

  // lets you select the same file again if you removed it
  importFileInput.value = "";
});

function renderSelectedImportFiles() {
  if (!importFileList) return;

  importFileList.innerHTML = "";

  selectedFileCount.textContent =
    selectedImportFiles.length === 0
      ? "No files selected"
      : `${selectedImportFiles.length} file${
          selectedImportFiles.length === 1 ? "" : "s"
        } selected`;

  selectedImportFiles.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "import-file-row";

    row.innerHTML = `
      <div class="import-file-details">
        <strong>${escapeImportHtml(file.name)}</strong>
        <span>${formatImportFileSize(file.size)}</span>
      </div>

      <button
        type="button"
        class="remove-import-file"
        data-index="${index}"
        aria-label="Remove ${escapeImportHtml(file.name)}"
      >
        ×
      </button>
    `;

    importFileList.appendChild(row);
  });

  importFileList
    .querySelectorAll(".remove-import-file")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);

        selectedImportFiles.splice(index, 1);

        renderSelectedImportFiles();
      });
    });

  confirmImport.disabled = selectedImportFiles.length === 0;

  confirmImport.textContent =
    selectedImportFiles.length === 0
      ? "Import All Files"
      : selectedImportFiles.length === 1
      ? "Import 1 File"
      : `Import All ${selectedImportFiles.length} Files`;
}

function formatImportFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeImportHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  const headers = Object.keys(rows[0]).map((h) =>
    String(h || "").trim().toUpperCase()
  );

  console.log("FORGE CSV HEADERS:", headers);

  // ========================================================
  // TEAM EXPORT
  // ========================================================

  if (
    headers.includes("AGENT CODE") &&
    headers.includes("FULL NAME") &&
    headers.includes("TEAM STATUS")
  ) {
    return "team";
  }

  // ========================================================
  // COMPLIANCE EXPORT
  // ========================================================

  if (
    headers.includes("AGENT NAME") &&
    headers.includes("CODE") &&
    headers.includes("RESI. LICENSE")
  ) {
    return "compliance";
  }

  // ========================================================
  // RECRUIT / PROGRESSION EXPORT
  //
  // Supports:
  // RECRUIT CODE
  // AGENT CODE
  //
  // This includes the Apex Recruit and Agent Tracker CSV.
  // ========================================================

  if (
    headers.includes("RECRUIT NAME") &&
    (
      headers.includes("RECRUIT CODE") ||
      headers.includes("AGENT CODE") ||
      headers.includes("EMAIL") ||
      headers.includes("PHONE")
    )
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

  // Exam scheduling
  examScheduledAt: agent.exam_scheduled_at || "",

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
  type="button"
  class="journey-more-btn"
  data-agent-menu="${agent.id}"
  aria-label="Agent options"
  title="More options"
>
  <span></span>
  <span></span>
  <span></span>
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
// JOURNEY AGENT MENU - FIXED / PORTAL VERSION
// ==========================================================

document.addEventListener("click", async (event) => {

  const menuButton =
    event.target.closest("[data-agent-menu]");

  // --------------------------------------------------------
  // CLICK OUTSIDE = CLOSE MENU
  // --------------------------------------------------------

  if (!menuButton) {

    if (!event.target.closest(".journey-agent-menu")) {
      document
        .querySelectorAll(".journey-agent-menu")
        .forEach((menu) => menu.remove());
    }

    return;
  }

  event.preventDefault();
  event.stopPropagation();


  // --------------------------------------------------------
  // GET AGENT
  // --------------------------------------------------------

  const agentId =
    menuButton.dataset.agentMenu;

  const agent =
    allAgents.find(
      (item) =>
        String(item.id) === String(agentId)
    );

  if (!agent) {
    console.error(
      "FORGE could not find agent:",
      agentId
    );

    return;
  }


  // --------------------------------------------------------
  // CLOSE EXISTING MENU
  // --------------------------------------------------------

  document
    .querySelectorAll(".journey-agent-menu")
    .forEach((menu) => menu.remove());


  // --------------------------------------------------------
  // CREATE MENU
  // --------------------------------------------------------

  const menu =
    document.createElement("div");

  menu.className =
    "journey-agent-menu";

  menu.innerHTML = `

    <button
      type="button"
      data-menu-profile
    >
      <span class="journey-menu-icon">
        &#9673;
      </span>

      <span>
        View Details
      </span>
    </button>


    <button
      type="button"
      data-menu-edit
    >
      <span class="journey-menu-icon">
        &#9998;
      </span>

      <span>
        Edit Agent
      </span>
    </button>


    ${
      agent.stage !== "Not Placed"
        ? `
          <button
            type="button"
            data-menu-back
          >
            <span class="journey-menu-icon">
              &#8630;
            </span>

            <span>
              Move Back
            </span>
          </button>
        `
        : ""
    }


    <button
      type="button"
      class="danger"
      data-menu-delete
    >
      <span class="journey-menu-icon">
        &#128465;
      </span>

      <span>
        Remove Agent
      </span>
    </button>

  `;


  // ========================================================
  // IMPORTANT:
  // Put menu on BODY instead of inside Journey card.
  // This prevents all clipping.
  // ========================================================

  document.body.appendChild(menu);


  // --------------------------------------------------------
  // POSITION MENU BESIDE BUTTON
  // --------------------------------------------------------

  const rect =
    menuButton.getBoundingClientRect();

  const menuWidth = 210;

  let left =
    rect.right - menuWidth;

  let top =
    rect.bottom + 8;


  // Keep menu on screen
  if (left < 10) {
    left = 10;
  }

  if (
    left + menuWidth >
    window.innerWidth - 10
  ) {
    left =
      window.innerWidth -
      menuWidth -
      10;
  }


  menu.style.position = "fixed";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.width = `${menuWidth}px`;
  menu.style.zIndex = "999999";


  // --------------------------------------------------------
  // VIEW DETAILS
  // --------------------------------------------------------

  menu
    .querySelector("[data-menu-profile]")
    ?.addEventListener(
      "click",
      (clickEvent) => {

        clickEvent.stopPropagation();

        selectedAgent = agent;

        menu.remove();

        showPage("Agents");

        document
          .querySelectorAll(".nav-btn")
          .forEach((nav) => {

            nav.classList.toggle(
              "active",
              nav.textContent
                .trim() === "Agents"
            );

          });

        renderAgentsPage();

        showAgentProfile(agent);
      }
    );


  // --------------------------------------------------------
  // EDIT AGENT
  // --------------------------------------------------------

  menu
    .querySelector("[data-menu-edit]")
    ?.addEventListener(
      "click",
      (clickEvent) => {

        clickEvent.stopPropagation();

        selectedAgent = agent;

        menu.remove();

        document
          .querySelector(".edit-agent-btn")
          ?.click();
      }
    );


  // --------------------------------------------------------
  // MOVE BACK
  // --------------------------------------------------------

  menu
    .querySelector("[data-menu-back]")
    ?.addEventListener(
      "click",
      async (clickEvent) => {

        clickEvent.stopPropagation();

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

        menu.remove();

        await updateJourneyStage(
          agent,
          stages[index - 1]
        );
      }
    );


  // --------------------------------------------------------
  // REMOVE AGENT FROM SUPABASE
  // --------------------------------------------------------

  menu
    .querySelector("[data-menu-delete]")
    ?.addEventListener(
      "click",
      async (clickEvent) => {

        clickEvent.stopPropagation();

        const confirmed =
          confirm(
            `Remove ${agent.name} from FORGE?`
          );

        if (!confirmed) {
          return;
        }

        const {
          error
        } =
          await forgeSupabase
            .from("agents")
            .delete()
            .eq(
              "organization_id",
              getActiveOrganizationId()
            )
            .eq(
              "id",
              agent.id
            );


        if (error) {

          console.error(
            "FORGE DELETE AGENT ERROR:",
            error
          );

          alert(
            "FORGE could not remove this agent."
          );

          return;
        }


        menu.remove();

        await loadCSV();

        alert(
          `${agent.name} was removed from FORGE.`
        );
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
  const stateInput = document.getElementById("newAgentResidentState");
  if (stateInput) stateInput.value = "";
  document.getElementById("newAgentCode").value = "";
  document.getElementById("newAgentUpline").value = "";
  document.getElementById("newAgentStage").value = "";
  const examDateInput =
    document.getElementById("newAgentExamDate");
  const examTimeInput =
    document.getElementById("newAgentExamTime");

  if (examDateInput) examDateInput.value = "";
  if (examTimeInput) examTimeInput.value = "";

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
        getActiveOrganizationId()
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
document
  .getElementById("saveAddAgent")
  ?.addEventListener("click", async () => {

    const name =
      document
        .getElementById("newAgentName")
        ?.value.trim();

    const email =
      document
        .getElementById("newAgentEmail")
        ?.value.trim()
        .toLowerCase();

    const phone =
      document
        .getElementById("newAgentPhone")
        ?.value.trim();

    let code =
      document
        .getElementById("newAgentCode")
        ?.value.trim()
        .toUpperCase();

    const upline =
      document
        .getElementById("newAgentUpline")
        ?.value.trim() || "";

    const residentState =
      document
        .getElementById("newAgentResidentState")
        ?.value || "";

    const stage =
      document
        .getElementById("newAgentStage")
        ?.value || "Not Placed";

    const examDate =
      document
        .getElementById("newAgentExamDate")
        ?.value || "";

    const examTime =
      document
        .getElementById("newAgentExamTime")
        ?.value || "";

    const examScheduledAt =
      examDate
        ? new Date(
            `${examDate}T${examTime || "09:00"}:00`
          ).toISOString()
        : null;


    if (!name) {
      alert("Please enter the agent name.");
      return;
    }


    const organizationId =
      getActiveOrganizationId();


    if (!organizationId) {
      alert(
        "FORGE does not have an active organization."
      );
      return;
    }


    // ======================================================
    // MANUAL RECORDS STILL NEED A UNIQUE AGENT CODE
    // ======================================================

    if (!code) {

      const cleanName =
        normalizeMatchName(name)
          .toUpperCase();

      code =
        `MANUAL-${cleanName}-${Date.now()
          .toString()
          .slice(-6)}`;
    }


    const saveButton =
      document.getElementById(
        "saveAddAgent"
      );

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }


    try {

      // ====================================================
      // EDIT EXISTING REAL DATABASE AGENT
      // ====================================================

      if (selectedAgent?.id) {

        const updates = {
          name,
          email: email || null,
          phone: phone || null,
          agent_code: code,
          upline_name: upline || null,
          resident_state: residentState || null,
          stage,
          exam_scheduled_at: examScheduledAt,
          import_source:
            selectedAgent.importSource ||
            "Manual"
        };


        const { error } =
          await forgeSupabase
            .from("agents")
            .update(updates)
            .eq(
              "organization_id",
              organizationId
            )
            .eq(
              "id",
              selectedAgent.id
            );


        if (error) {
          throw error;
        }

      }

      // ====================================================
      // CREATE NEW AGENT
      // ====================================================

      else {

        const newAgent = {

          organization_id:
            organizationId,

          agent_code:
            code,

          name,

          email:
            email || null,

          phone:
            phone || null,

          upline_name:
            upline || null,

          resident_state:
            residentState || null,

          stage,

          exam_scheduled_at:
            examScheduledAt,

          team_status:
            null,

          import_source:
            "Manual"
        };


        const {
          data,
          error
        } =
          await forgeSupabase
            .from("agents")
            .insert(newAgent)
            .select()
            .single();


        if (error) {
          throw error;
        }


        console.log(
          "Manual FORGE agent created:",
          data
        );
      }


      // ====================================================
      // RELOAD ACTIVE ORGANIZATION FROM DATABASE
      // ====================================================

      await loadCSV();


      document
        .getElementById("addAgentModal")
        ?.classList.add("hidden");


      clearAgentForm();

      selectedAgent = null;


      renderAllPages();


      alert(
        `${name} saved to ${
          currentOrganization?.name ||
          "this organization"
        }.`
      );


    } catch (error) {

      console.error(
        "FORGE MANUAL AGENT SAVE ERROR:",
        error
      );


      alert(
        "FORGE could not save this agent: " +
        (
          error?.message ||
          String(error)
        )
      );

    } finally {

      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent =
          "Save Agent";
      }
    }

  });

// Pre-fill edit modal
document.addEventListener("click", (e) => {
  if (!e.target.closest(".edit-agent-btn") || !selectedAgent) return;

  document.getElementById("newAgentName").value =
    selectedAgent.name || "";

  document.getElementById("newAgentEmail").value =
    selectedAgent.email || "";

  document.getElementById("newAgentPhone").value =
    selectedAgent.phone || "";

  const residentStateInput =
    document.getElementById("newAgentResidentState");

  if (residentStateInput) {
    residentStateInput.value =
      selectedAgent.residentState ||
      selectedAgent.resident_state ||
      "";
  }

  document.getElementById("newAgentCode").value =
    selectedAgent.code || "";

  const uplineInput =
    document.getElementById("newAgentUpline");

  if (uplineInput) {
    uplineInput.value =
      selectedAgent.upline || "";
  }

  const uplineCodeInput =
    document.getElementById("newAgentUplineCode");

  if (uplineCodeInput) {
    uplineCodeInput.value =
      selectedAgent.uplineCode || "";
  }

  document.getElementById("newAgentStage").value =
    selectedAgent.stage || "Not Placed";

  const examValue =
    selectedAgent.examScheduledAt ||
    selectedAgent.exam_scheduled_at ||
    "";

  if (examValue) {
    const examDateObj = new Date(examValue);

    if (!Number.isNaN(examDateObj.getTime())) {
      const localDate = new Date(
        examDateObj.getTime() -
        examDateObj.getTimezoneOffset() * 60000
      );

      const isoLocal =
        localDate.toISOString();

      const examDateInput =
        document.getElementById("newAgentExamDate");

      const examTimeInput =
        document.getElementById("newAgentExamTime");

      if (examDateInput) {
        examDateInput.value =
          isoLocal.slice(0, 10);
      }

      if (examTimeInput) {
        examTimeInput.value =
          isoLocal.slice(11, 16);
      }
    }
  } else {
    const examDateInput =
      document.getElementById("newAgentExamDate");

    const examTimeInput =
      document.getElementById("newAgentExamTime");

    if (examDateInput) examDateInput.value = "";
    if (examTimeInput) examTimeInput.value = "";
  }

  document
    .getElementById("addAgentModal")
    .classList.remove("hidden");
});

//  PAGE NAVIGATION 
function showPage(pageName) {

  // ========================================================
  // 1. RESET TEAM MAP OVERLAYS / DRAWERS
  // ========================================================

  if (pageName !== "Team Map") {

    const stage =
      document.getElementById("teamMapStage");

    const drawer =
      document.getElementById("teamMapAgentDrawer");

    const overlay =
      document.getElementById("teamMapAgentOverlay");


    stage?.classList.remove("active");

    if (stage) {
      stage.style.display = "none";
      stage.setAttribute("aria-hidden", "true");
    }


    drawer?.classList.remove("open");

    if (drawer) {
      drawer.setAttribute("aria-hidden", "true");
    }


    overlay?.classList.add("hidden");


    document.body.style.overflow = "";
  }


  // ========================================================
  // 2. HOME
  // ========================================================

  const dashboard =
    document.querySelector(".dashboard");

  const lower =
    document.querySelector(".lower");


  if (dashboard) {
    dashboard.style.display =
      pageName === "Home"
        ? "grid"
        : "none";
  }


  if (lower) {
    lower.style.display =
      pageName === "Home"
        ? "grid"
        : "none";
  }


  // ========================================================
  // 3. ALL APP PAGES
  // ========================================================

  const pages = {

    Journey:
      document.getElementById(
        "journeyPage"
      ),

    Agents:
      document.getElementById(
        "agentsPage"
      ),

    "Team Map":
      document.getElementById(
        "teamMapPage"
      ),

    Command:
      document.getElementById(
        "commandPage"
      ),

    Growth:
      document.getElementById(
        "growthPage"
      )

  };


  Object.entries(pages)
    .forEach(
      ([name, page]) => {

        if (!page) return;


        const shouldShow =
          pageName === name;


        page.classList.toggle(
          "hidden",
          !shouldShow
        );


        // IMPORTANT:
        // Direct display prevents CSS conflicts.
        page.style.display =
          shouldShow
            ? ""
            : "none";

      }
    );


  // ========================================================
  // 4. RENDER ONLY ACTIVE PAGE
  // ========================================================

  if (pageName === "Growth") {

    renderGrowthPage();

  }


  if (pageName === "Command") {

    renderCommandCenter();

  }


  if (pageName === "Journey") {

    renderJourneyPage();

  }


  if (pageName === "Agents") {

    renderAgentsPage();

  }


  if (pageName === "Team Map") {

    const teamMapPage =
      document.getElementById(
        "teamMapPage"
      );


    if (teamMapPage) {

      teamMapPage.style.display =
        "block";

    }


    renderTeamMap();

  }

}

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
        agent.upline,
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
    agents = agents.filter(
      (agent) => agent.stage !== "Contracted"
    );
  }

  if (commandStageFilter === "pipeline") {
    agents = agents.filter((agent) =>
      ["Not Placed", "Quiz Sent", "XCEL Completed", "Exam Passed"].includes(agent.stage)
    );
  }

  if (commandStageFilter === "licensed") {
    agents = agents.filter((agent) =>
      ["Licensed", "Contracted"].includes(agent.stage)
    );
  }

  if (commandSortMode === "name") {
    agents.sort((a, b) =>
      getAgentDisplayName(a).localeCompare(getAgentDisplayName(b))
    );
  } else if (commandSortMode === "recent") {
    agents.sort((a, b) => {
      const aDate = new Date(a.lastActivity || a.updatedAt || a.recruitDate || a.recruit_date || 0).getTime() || 0;
      const bDate = new Date(b.lastActivity || b.updatedAt || b.recruitDate || b.recruit_date || 0).getTime() || 0;
      return bDate - aDate;
    });
  } else {
    agents.sort((a, b) =>
      getCommandPriorityScore(b) - getCommandPriorityScore(a)
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

    row.title = `${getAgentDisplayName(listedAgent)} · ${listedAgent.stage || "Not Placed"}`;

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
          Upline
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
// COMMAND CENTER SMART SIDEBAR CONTROLS
// ==========================================================
document
  .querySelectorAll("[data-command-stage-filter]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      commandStageFilter = button.dataset.commandStageFilter || "all";
      commandCurrentPage = 1;

      document
        .querySelectorAll("[data-command-stage-filter]")
        .forEach((chip) => chip.classList.toggle("active", chip === button));

      renderCommandCenter(selectedAgent, true);
    });
  });

document
  .getElementById("commandSort")
  ?.addEventListener("change", (event) => {
    commandSortMode = event.target.value || "priority";
    commandCurrentPage = 1;
    renderCommandCenter(selectedAgent, true);
  });

function setCommandSidebarCollapsed(collapsed) {
  const page = document.getElementById("commandPage");
  if (!page) return;

  page.classList.toggle("command-sidebar-collapsed", collapsed);
  localStorage.setItem("forgeCommandSidebarCollapsed", collapsed ? "1" : "0");

  const label = document.querySelector("#collapseCommandSidebar .collapse-label");
  const icon = document.querySelector("#collapseCommandSidebar .collapse-icon");
  if (label) label.textContent = collapsed ? "Expand" : "Collapse";
  if (icon) icon.textContent = collapsed ? "»" : "«";
}

document
  .getElementById("collapseCommandSidebar")
  ?.addEventListener("click", () => {
    const page = document.getElementById("commandPage");
    setCommandSidebarCollapsed(!page?.classList.contains("command-sidebar-collapsed"));
  });

setCommandSidebarCollapsed(
  localStorage.getItem("forgeCommandSidebarCollapsed") === "1"
);


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


// ==========================================================
// FORGE SMART EXAM SCHEDULER
// Stores exam_scheduled_at in Supabase and turns the date
// into actionable Command Center intelligence.
// ==========================================================

function forgeExamDateValue(agent) {
  return (
    agent?.examScheduledAt ||
    agent?.exam_scheduled_at ||
    ""
  );
}

function forgeFormatExamDate(value, includeTime = true) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(
    undefined,
    includeTime
      ? {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }
      : {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric"
        }
  );
}

function forgeGetExamTiming(value) {
  if (!value) {
    return {
      state: "unscheduled",
      days: null,
      label: "Exam not scheduled",
      detail:
        "Add the confirmed exam date so FORGE can guide the follow-up."
    };
  }

  const exam = new Date(value);
  if (Number.isNaN(exam.getTime())) {
    return {
      state: "unscheduled",
      days: null,
      label: "Exam not scheduled",
      detail:
        "Add the confirmed exam date so FORGE can guide the follow-up."
    };
  }

  const now = new Date();

  const startToday =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const startExam =
    new Date(
      exam.getFullYear(),
      exam.getMonth(),
      exam.getDate()
    );

  const days =
    Math.round(
      (startExam - startToday) /
      86400000
    );

  if (days < 0) {
    return {
      state: "overdue",
      days,
      label: "Exam date has passed",
      detail:
        `${forgeFormatExamDate(value)} · Confirm the result and update the Journey.`
    };
  }

  if (days === 0) {
    return {
      state: "today",
      days,
      label: "Exam is today",
      detail:
        `${forgeFormatExamDate(value)} · Send encouragement and confirm the result afterward.`
    };
  }

  if (days === 1) {
    return {
      state: "tomorrow",
      days,
      label: "Exam is tomorrow",
      detail:
        `${forgeFormatExamDate(value)} · Send final preparation and reminder.`
    };
  }

  if (days <= 3) {
    return {
      state: "soon",
      days,
      label: `Exam in ${days} days`,
      detail:
        `${forgeFormatExamDate(value)} · High-priority exam preparation window.`
    };
  }

  if (days <= 7) {
    return {
      state: "week",
      days,
      label: `Exam in ${days} days`,
      detail:
        `${forgeFormatExamDate(value)} · Keep preparation and accountability active.`
    };
  }

  return {
    state: "scheduled",
    days,
    label: `Exam in ${days} days`,
    detail:
      `${forgeFormatExamDate(value)} · Exam is scheduled and on track.`
  };
}

function renderCommandExamScheduler(agent) {
  const panel =
    document.getElementById(
      "commandExamScheduler"
    );

  if (!panel || !agent) return;

  const dateInput =
    document.getElementById(
      "commandExamDate"
    );

  const timeInput =
    document.getElementById(
      "commandExamTime"
    );

  const clearButton =
    document.getElementById(
      "clearCommandExamDate"
    );

  const title =
    document.getElementById(
      "commandExamStatusTitle"
    );

  const text =
    document.getElementById(
      "commandExamStatusText"
    );

  const existing =
    forgeExamDateValue(agent);

  // The scheduler is most useful around the exam,
  // but keep it visible whenever a saved date exists.
  const shouldShow =
    existing ||
    [
      "XCEL Completed",
      "Exam Scheduled",
      "Exam Passed"
    ].includes(agent.stage);

  panel.classList.toggle(
    "hidden",
    !shouldShow
  );

  if (!shouldShow) return;

  panel.dataset.examState =
    forgeGetExamTiming(existing).state;

  if (existing) {
    const date = new Date(existing);

    if (!Number.isNaN(date.getTime())) {
      const local =
        new Date(
          date.getTime() -
          date.getTimezoneOffset() * 60000
        )
          .toISOString();

      if (dateInput) {
        dateInput.value =
          local.slice(0, 10);
      }

      if (timeInput) {
        timeInput.value =
          local.slice(11, 16);
      }
    }
  } else {
    if (dateInput) {
      dateInput.value = "";
      dateInput.min =
        new Date()
          .toISOString()
          .slice(0, 10);
    }

    if (timeInput) {
      timeInput.value = "";
    }
  }

  const timing =
    forgeGetExamTiming(existing);

  if (title) {
    title.textContent =
      timing.label;
  }

  if (text) {
    text.textContent =
      timing.detail;
  }

  clearButton?.classList.toggle(
    "hidden",
    !existing
  );
}

function applyExamIntelligence(agent, intelligence) {
  const examValue =
    forgeExamDateValue(agent);

  if (
    !examValue ||
    ![
      "XCEL Completed",
      "Exam Scheduled"
    ].includes(agent?.stage)
  ) {
    return intelligence;
  }

  const timing =
    forgeGetExamTiming(examValue);

  const copy = {
    ...intelligence
  };

  if (
    timing.state === "today"
  ) {
    copy.title =
      "State exam is today";
    copy.text =
      "Send encouragement now and confirm the exam result afterward.";
    copy.primary =
      "Support Exam Day";
    copy.insight =
      "Exam-day priority";
    copy.playbook =
      "Exam Day Success Plan";
  }

  else if (
    timing.state === "tomorrow" ||
    timing.state === "soon"
  ) {
    copy.title =
      timing.label;
    copy.text =
      "Use the final preparation window: confirm logistics, documents, and confidence.";
    copy.primary =
      "Prepare for Exam";
    copy.insight =
      "Exam approaching";
    copy.playbook =
      "3-Step Final Exam Prep";
  }

  else if (
    timing.state === "overdue"
  ) {
    copy.title =
      "Exam date passed — confirm result";
    copy.text =
      "Follow up now. If the agent passed, move them forward; if not, create a retake plan.";
    copy.primary =
      "Confirm Exam Result";
    copy.insight =
      "Result needs confirmation";
    copy.playbook =
      "Exam Result Follow-Up";
  }

  else {
    copy.title =
      `Exam scheduled · ${forgeFormatExamDate(examValue, false)}`;
    copy.text =
      `${timing.label}. Keep study accountability active until exam day.`;
    copy.primary =
      "Prepare for Exam";
    copy.insight =
      "Exam date confirmed";
    copy.playbook =
      "3-Step Exam Preparation";
  }

  return copy;
}

async function saveForgeExamSchedule() {
  if (!selectedAgent?.id) {
    alert(
      "Select an agent first."
    );
    return;
  }

  const date =
    document
      .getElementById(
        "commandExamDate"
      )
      ?.value || "";

  const time =
    document
      .getElementById(
        "commandExamTime"
      )
      ?.value || "09:00";

  if (!date) {
    alert(
      "Choose the exam date first."
    );
    return;
  }

  const exam =
    new Date(
      `${date}T${time}:00`
    );

  if (
    Number.isNaN(
      exam.getTime()
    )
  ) {
    alert(
      "The exam date is not valid."
    );
    return;
  }

  const saveButton =
    document.getElementById(
      "saveCommandExamDate"
    );

  const oldText =
    saveButton?.textContent ||
    "Save Exam";

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent =
      "Saving...";
  }

  try {
    const value =
      exam.toISOString();

    const { error } =
      await forgeSupabase
        .from("agents")
        .update({
          exam_scheduled_at:
            value
        })
        .eq(
          "organization_id",
          getActiveOrganizationId()
        )
        .eq(
          "id",
          selectedAgent.id
        );

    if (error) {
      throw error;
    }

    selectedAgent.examScheduledAt =
      value;

    selectedAgent.exam_scheduled_at =
      value;

    const match =
      allAgents.find(
        agent =>
          String(agent.id) ===
          String(
            selectedAgent.id
          )
      );

    if (match) {
      match.examScheduledAt =
        value;
      match.exam_scheduled_at =
        value;
    }

    logCoordinatorActivity?.(
      selectedAgent,
      "Exam Schedule",
      `State exam scheduled for ${forgeFormatExamDate(value)}.`
    );

    showCommandProfile(
      selectedAgent
    );

  } catch (error) {
    console.error(
      "FORGE EXAM SCHEDULE SAVE ERROR:",
      error
    );

    alert(
      "FORGE could not save the exam date: " +
      (
        error?.message ||
        String(error)
      )
    );
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent =
        oldText;
    }
  }
}

async function clearForgeExamSchedule() {
  if (!selectedAgent?.id) return;

  if (
    !confirm(
      "Clear this agent's scheduled exam date?"
    )
  ) {
    return;
  }

  try {
    const { error } =
      await forgeSupabase
        .from("agents")
        .update({
          exam_scheduled_at:
            null
        })
        .eq(
          "organization_id",
          getActiveOrganizationId()
        )
        .eq(
          "id",
          selectedAgent.id
        );

    if (error) {
      throw error;
    }

    selectedAgent.examScheduledAt =
      "";

    selectedAgent.exam_scheduled_at =
      "";

    const match =
      allAgents.find(
        agent =>
          String(agent.id) ===
          String(
            selectedAgent.id
          )
      );

    if (match) {
      match.examScheduledAt = "";
      match.exam_scheduled_at = "";
    }

    showCommandProfile(
      selectedAgent
    );

  } catch (error) {
    console.error(
      "FORGE EXAM SCHEDULE CLEAR ERROR:",
      error
    );

    alert(
      "FORGE could not clear the exam date: " +
      (
        error?.message ||
        String(error)
      )
    );
  }
}

document
  .getElementById(
    "saveCommandExamDate"
  )
  ?.addEventListener(
    "click",
    saveForgeExamSchedule
  );

document
  .getElementById(
    "clearCommandExamDate"
  )
  ?.addEventListener(
    "click",
    clearForgeExamSchedule
  );


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

  let intelligence =
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

  intelligence =
    applyExamIntelligence(
      agent,
      intelligence
    );

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


  renderCommandExamScheduler(agent);

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

  if (method === "Email" && !email) {
    alert(
      `${getAgentDisplayName(selectedAgent)} does not have an email address in FORGE.`
    );
    return;
  }
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
    openForgeEmailComposer(
      selectedAgent,
      subject,
      message
    );
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

// ==========================================================
// COMMAND CENTER CONTACT ACTIONS
// Call / Text / Email / WhatsApp now launch the real channel.
// Other action buttons still use FORGE Smart Composer.
// ==========================================================

function forgeCleanPhoneForLink(value) {
  let digits = String(value || "").replace(/\D/g, "");

  // Default US/Canada behavior for 10-digit numbers.
  if (digits.length === 10) {
    digits = "1" + digits;
  }

  return digits;
}


function forgeOpenMailClient(email, subject = "", message = "") {
  const cleanEmail =
    String(email || "").trim();

  if (!cleanEmail) {
    return false;
  }

  const mailto =
    `mailto:${cleanEmail}` +
    `?subject=${encodeURIComponent(subject || "")}` +
    `&body=${encodeURIComponent(message || "")}`;

  try {
    // A real link click is more reliable than window.location
    // when FORGE is embedded inside GoHighLevel / an iframe.
    const link =
      document.createElement("a");

    link.href = mailto;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    return true;
  } catch (error) {
    console.warn(
      "FORGE could not open the email client with a link:",
      error
    );

    try {
      window.open(mailto, "_blank");
      return true;
    } catch (fallbackError) {
      console.error(
        "FORGE email fallback failed:",
        fallbackError
      );
      return false;
    }
  }
}



function getForgeOrganizationEmailBrand() {
  const org = currentOrganization || {};
  const name = String(org.name || "Organization").trim();
  const key = name.toLowerCase();

  // Database values win, so future organizations can be branded
  // without changing this JavaScript file.
  const brand = {
    name,
    logo: org.email_logo_url || org.logo_url || "",
    primary: org.email_primary_color || org.primary_color || "#0b397a",
    accent: org.email_accent_color || org.accent_color || "#2563eb",
    tagline: org.email_tagline || org.tagline || "Powered by FORGE"
  };

  // Built-in branding for the two organizations supplied for FORGE.
  if (key.includes("apex")) {
    brand.logo = brand.logo || "https://forge.bizzallone.com/assets/apex-wealth-building-logo.png";
    brand.primary = org.email_primary_color || "#071d13";
    brand.accent = org.email_accent_color || "#c9a227";
    brand.tagline = org.email_tagline || "We build wealth. We impact lives.";
  } else if (key.includes("bizzall")) {
    brand.logo = brand.logo || "https://forge.bizzallone.com/assets/bizzall-logo.png";
    brand.primary = org.email_primary_color || "#071b3d";
    brand.accent = org.email_accent_color || "#1769d2";
    brand.tagline = org.email_tagline || "Business for all";
  }

  return brand;
}

function renderForgeOrganizationEmailBrand() {
  const brand = getForgeOrganizationEmailBrand();
  const card = document.getElementById("forgeEmailCard");
  const logo = document.getElementById("forgeEmailOrgLogo");
  const fallback = document.getElementById("forgeEmailOrgFallback");

  setText("forgeEmailOrgName", brand.name);
  setText("forgeEmailOrgTagline", brand.tagline);

  if (card) {
    card.style.setProperty("--org-primary", brand.primary);
    card.style.setProperty("--org-accent", brand.accent);
  }

  if (logo && brand.logo) {
    logo.src = brand.logo;
    logo.alt = `${brand.name} logo`;
    logo.classList.remove("hidden");
    fallback?.classList.add("hidden");

    logo.onerror = () => {
      logo.classList.add("hidden");
      if (fallback) {
        fallback.textContent = brand.name;
        fallback.classList.remove("hidden");
      }
    };
  } else {
    logo?.classList.add("hidden");
    if (fallback) {
      fallback.textContent = brand.name;
      fallback.classList.remove("hidden");
    }
  }
}


function forgeEmailBrandKey(organizationName = "") {
  const name =
    String(organizationName || "")
      .trim()
      .toLowerCase();

  if (name.includes("apex")) {
    return "apex";
  }

  if (name.includes("bizzall")) {
    return "bizzall";
  }

  return "default";
}

function applyForgeEmailModalBrandKey() {
  const modal =
    document.getElementById(
      "forgeEmailModal"
    );

  if (!modal) return;

  const organizationName =
    currentOrganization?.name ||
    selectedAgent?.organizationName ||
    selectedAgent?.organization_name ||
    "";

  modal.dataset.brand =
    forgeEmailBrandKey(
      organizationName
    );
}




const FORGE_EMAIL_LOGOS = {
  bizzall: {
    filename: "bizzall-logo.png",
    mime: "image/png",
    data: "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Ywl5xqTY9Shrw42EYBI6VJceKyjWVeARCzghpwZdsgjb/ScuUPz3xpvvVXgpO56XxPTEbaZ4r7P+SYZ2Y+s6DVnooM9w5mvLeui1hxt+2Bd6YS/9kNNn/IMs+lq3DYxCL+SlnzrW2nfpgzbGJXJSbFtyELjUx41+sps3b1614YYbVquttlq11lprVd3X6F6dddZZFXZc8acubkKsDjzwZ9Wee+5Z4UcW8LTN3Oree++tdt11l+rDDz/MerNmza5uvPEmYa2zzjrVJhtvXD300EMVfYTvzz//rNpuu+2qV199tSH/xz/+If8333xzhR2vGjlyVLV97+1lr/g8x48//ni18sorV2t271716NGjWnfddauBAwcKS1zB7c0336x69+5drb/++tVGG21UnX322YqV/fzHGO688070bQz7darNN9usevCBByyPeSxtnlEf5NG3oJo8aXK10cYbVVh4qx5r9qjWW2+96qQTT6qwwCs+xjhz5szqb/f+rdp6q62rjZBX8jz6qKOq4cOHW7zAwdtVq7Fjx1YrrdSt6t59jWqDDdev1lln7erEE0+sxowZA1+Wr8gZt3kesI5/zNGAAcdUyy23XPXSSy9V88IGA8t+xtivX7/q6KOPqrCoZ37Cwl7J/uuuu67qt1c/cWac6nN8+ot8lfMteLTqZ93CvoFHeYnpeoHTxj5w3G5hfrlvBob2U+gHVsgbbXAIXg15w5+tK4FHfWExR/LnGJ6zYoF6tybjgA0nDec10UYQ7dlBBtZGPJPwAROhmnD4i0ETcdq2Jp9cXJYTAr2w11ZtykLudTzKbrjkYPWws2SVNs1+s4v+wK11ItnU48LBxWfLLbeqzj///Or5557Dzn5FteUWW2on50IUfvv371/tuceeFY4MMOHnVPfcc0+18847Y4H6f8ob7ibGTjem2mqrrap+e+9dvfDCC9XNt9xcvffe+1rQAmfEiBFaoF5++SXtJMHjySefrFZcYcVq6623rl568SUsUCOrHXfcsXrssccyB/Jlm4vOTTfdVD377LPVC8+/UH322WeerwXyddGFF2mxe+qpp6ohQ4bIBq+Vaej06bMjdvCjq+cQ8x133FG98847eQHRePn45bFDviZPnlxtvvnm1SWXXFIR+5lnnq7+/f77ygn1cOd29cQTT1SrrbpqdcEFF1TPP/+8FvKddtypOuWX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"
  },
  apex: {
    filename: "apex-wealth-building-logo.png",
    mime: "image/png",
    data: "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"
  }
};

function forgeOrganizationLogoAsset() {
  const key = forgeEmailBrandKey(currentOrganization?.name || "");
  return FORGE_EMAIL_LOGOS[key] || null;
}

function forgeEscapeEmailHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function forgeStripDuplicateGreeting(value = "", firstName = "") {
  let text = String(value || "").trim();
  if (!text) return "";

  const escapedName =
    String(firstName || "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const genericGreeting =
    /^(hi|hello|dear)\s+[^\n,]{1,60},?\s*(?:\n+|$)/i;

  const namedGreeting = escapedName
    ? new RegExp(
        `^(hi|hello|dear)\\s+${escapedName},?\\s*(?:\\n+|$)`,
        "i"
      )
    : null;

  if (namedGreeting && namedGreeting.test(text)) {
    text = text.replace(namedGreeting, "").trimStart();
  } else if (genericGreeting.test(text)) {
    text = text.replace(genericGreeting, "").trimStart();
  }

  return text;
}

function forgeEmailParagraphs(value = "") {
  return String(value || "")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const safe =
        forgeEscapeEmailHtml(paragraph)
          .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#25364a;">${safe}</p>`;
    })
    .join("");
}

function forgeEmailJourneyStages() {
  return [
    "Not Placed",
    "Quiz Sent",
    "XCEL Completed",
    "Exam Scheduled",
    "Exam Passed",
    "Licensed",
    "Contracted"
  ];
}

function forgeEmailStageLabel(stage) {
  const labels = {
    "Not Placed": "Start",
    "Quiz Sent": "Quiz",
    "XCEL Completed": "XCEL",
    "Exam Scheduled": "Exam",
    "Exam Passed": "Passed",
    "Licensed": "Licensed",
    "Contracted": "Contracted"
  };

  return labels[stage] || stage || "Journey";
}

function forgeEmailStageIndex(stage) {
  const order = forgeEmailJourneyStages();

  // Exam Scheduled is represented by a saved exam date even if the main
  // Journey stage is still XCEL Completed.
  if (
    stage === "XCEL Completed" &&
    selectedAgent &&
    forgeExamDateValue?.(selectedAgent)
  ) {
    return order.indexOf("Exam Scheduled");
  }

  const index =
    order.indexOf(stage);

  return index >= 0 ? index : 0;
}


const FORGE_PRODUCTION_LINKS = {
  bizzall: "https://docs.google.com/spreadsheets/d/1hO0bP0pnM-uTh_DPiY0G_a-qywzmx2SKv72j-CsX0R4/edit?usp=sharing",
  apex: "https://drive.google.com/drive/folders/1iFXw6SLyXPjiy2XMV7yGzSsyk7fAtih1?usp=drive_link"
};

function forgeProductionLinkForCurrentOrganization() {
  const key = forgeEmailBrandKey(currentOrganization?.name || "");
  return FORGE_PRODUCTION_LINKS[key] || "";
}

const FORGE_LICENSING_LINKS = {
  quiz: "https://triumph-elite.ins.everbornops.com/platform/licensing",
  xcel: "https://my.xcelsolutions.com/portal/login/globalfinancialimpact?logout=true",
  sircon: "https://www.sircon.com/",
  nipr: "https://nipr.com/licensing-center/apply-for-a-license",
  successCE: "https://app.successce.com/v2Theme/Customer/Login.aspx",
  tevah: "https://www.tevahtech.com/",
  stateInfo: "https://nipr.com/licensing-center/state-information"
};

// Verified direct scheduling links currently wired into FORGE.
// Additional states can be added safely here as their official vendor links are confirmed.
const FORGE_EXAM_SCHEDULERS = {
  TX: {
    label: "Texas · Pearson VUE",
    url: "https://www.pearsonvue.com/us/en/tx/insurance.html"
  },
  CA: {
    label: "California · Insurance Exam Scheduling",
    url: "https://www.insurance.ca.gov/0200-industry/0200-prod-licensing/0100-applicant-info/0800-exam-info/schedule-exam/computer-exam/"
  }
};

function forgeNormalizeState(value = "") {
  return String(value || "").trim().toUpperCase();
}

function forgeAgentResidentState(agent) {
  return forgeNormalizeState(
    agent?.residentState ||
    agent?.resident_state ||
    ""
  );
}


const FORGE_STATE_LICENSING = {
  AL: {
    examProvider: "University of Alabama",
    examUrl: "https://training.ua.edu/insurance-testing/",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/alabama",
    fingerprintLabel: "CHECK ALABAMA REQUIREMENTS"
  },
  AK: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/ak/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/alaska",
    fingerprintLabel: "CHECK ALASKA REQUIREMENTS"
  },
  AZ: {
    examProvider: "PSI",
    examUrl: "https://test-takers.psiexams.com/",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/arizona",
    fingerprintLabel: "CHECK ARIZONA REQUIREMENTS"
  },
  AR: {
    examProvider: "PSI",
    examUrl: "https://test-takers.psiexams.com/",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/arkansas",
    fingerprintLabel: "CHECK ARKANSAS REQUIREMENTS"
  },
  CT: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/ct/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/connecticut",
    fingerprintLabel: "CHECK CONNECTICUT REQUIREMENTS"
  },
  DE: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/de/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/delaware",
    fingerprintLabel: "CHECK DELAWARE REQUIREMENTS"
  },
  FL: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/fl/insurance.html",
    fingerprintRequired: true,
    fingerprintProvider: "IdentoGO by IDEMIA",
    fingerprintUrl: "https://www.identogo.com/",
    fingerprintLabel: "SCHEDULE FINGERPRINTS"
  },
  GA: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/ga/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/georgia",
    fingerprintLabel: "CHECK GEORGIA REQUIREMENTS"
  },
  ID: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/id/insurance.html",
    fingerprintRequired: true,
    fingerprintProvider: "PSI electronic fingerprint service",
    fingerprintUrl: "https://test-takers.psiexams.com/",
    fingerprintLabel: "SCHEDULE FINGERPRINTS"
  },
  IL: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/il/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/illinois",
    fingerprintLabel: "CHECK ILLINOIS REQUIREMENTS"
  },
  IN: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/in/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/indiana",
    fingerprintLabel: "CHECK INDIANA REQUIREMENTS"
  },
  IA: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/ia/insurance.html",
    fingerprintRequired: true,
    fingerprintProvider: "Fieldprint",
    fingerprintUrl: "https://www.fieldprint.com/",
    fingerprintLabel: "COMPLETE FINGERPRINTS"
  },
  KS: {
    examProvider: "Pearson VUE",
    examUrl: "https://www.pearsonvue.com/us/en/ks/insurance.html",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/kansas",
    fingerprintLabel: "CHECK KANSAS REQUIREMENTS"
  },
  KY: {
    examProvider: "Kentucky DOI eServices",
    examUrl: "https://insurance.ky.gov/",
    fingerprintRequired: null,
    fingerprintUrl: "https://nipr.com/licensing-center/state-information/kentucky",
    fingerprintLabel: "CHECK KENTUCKY REQUIREMENTS"
  },
  MD: {
    examProvider: "Prometric",
    examUrl: "https://www.prometric.com/test-takers/search/maryland-insurance",
    fingerprintRequired: false,
    fingerprintUrl: "",
    fingerprintLabel: ""
  },
  VA: {
    examProvider: "Prometric",
    examUrl: "https://www.prometric.com/exams/insurance-va",
    fingerprintRequired: true,
    fingerprintProvider: "Fieldprint Virginia",
    fingerprintUrl: "https://fieldprintvirginia.com/",
    fingerprintLabel: "SCHEDULE FINGERPRINTS"
  }
};

function forgeStateLicensingConfig(agent) {
  const state = forgeAgentResidentState(agent);
  const config = FORGE_STATE_LICENSING[state];

  if (config) return { state, ...config };

  return {
    state,
    examProvider: "State licensing information",
    examUrl: state
      ? `https://nipr.com/licensing-center/state-information/${forgeStateSlug(state)}`
      : "https://nipr.com/licensing-center/state-information",
    fingerprintRequired: null,
    fingerprintUrl: state
      ? `https://nipr.com/licensing-center/state-information/${forgeStateSlug(state)}`
      : "https://nipr.com/licensing-center/state-information",
    fingerprintLabel: "CHECK STATE REQUIREMENTS"
  };
}

function forgeStateSlug(code) {
  const names = {
    AL:"alabama",AK:"alaska",AZ:"arizona",AR:"arkansas",CA:"california",
    CO:"colorado",CT:"connecticut",DE:"delaware",FL:"florida",GA:"georgia",
    HI:"hawaii",ID:"idaho",IL:"illinois",IN:"indiana",IA:"iowa",
    KS:"kansas",KY:"kentucky",LA:"louisiana",ME:"maine",MD:"maryland",
    MA:"massachusetts",MI:"michigan",MN:"minnesota",MS:"mississippi",
    MO:"missouri",MT:"montana",NE:"nebraska",NV:"nevada",NH:"new-hampshire",
    NJ:"new-jersey",NM:"new-mexico",NY:"new-york",NC:"north-carolina",
    ND:"north-dakota",OH:"ohio",OK:"oklahoma",OR:"oregon",PA:"pennsylvania",
    RI:"rhode-island",SC:"south-carolina",SD:"south-dakota",TN:"tennessee",
    TX:"texas",UT:"utah",VT:"vermont",VA:"virginia",WA:"washington",
    WV:"west-virginia",WI:"wisconsin",WY:"wyoming",DC:"district-of-columbia"
  };
  return names[code] || "";
}

function forgeExamSchedulerForAgent(agent) {
  const state = forgeAgentResidentState(agent);

  if (agent?.examScheduleUrl || agent?.exam_schedule_url) {
    return {
      label: `${state || "State"} · Exam Scheduler`,
      url: agent.examScheduleUrl || agent.exam_schedule_url,
      direct: true
    };
  }

  const config = forgeStateLicensingConfig(agent);

  return {
    label: `${state || "State"} · ${config.examProvider}`,
    url: config.examUrl,
    direct: !!FORGE_STATE_LICENSING[state]
  };
}


function forgeFingerprintActionForAgent(agent) {
  const config = forgeStateLicensingConfig(agent);

  if (config.fingerprintRequired === true) {
    return {
      required: true,
      button: config.fingerprintLabel || "SCHEDULE FINGERPRINTS",
      url: config.fingerprintUrl,
      provider: config.fingerprintProvider || "State fingerprint vendor"
    };
  }

  if (config.fingerprintRequired === false) {
    return {
      required: false,
      button: "",
      url: "",
      provider: ""
    };
  }

  return {
    required: null,
    button: config.fingerprintLabel || "CHECK STATE REQUIREMENTS",
    url: config.fingerprintUrl,
    provider: "State-specific requirements"
  };
}

function forgeEmailStageAction(stage, agent) {
  const exam = forgeExamSchedulerForAgent(agent);

  const actions = {
    "Not Placed": {
      button: "START LICENSING QUIZ",
      url: FORGE_LICENSING_LINKS.quiz
    },
    "Quiz Sent": {
      button: "COMPLETE YOUR QUIZ",
      url: FORGE_LICENSING_LINKS.quiz
    },
    "XCEL Completed": {
      button: exam.direct ? "SCHEDULE YOUR EXAM" : "FIND YOUR EXAM LINK",
      url: exam.url
    },
    "Exam Scheduled": {
      button: "VIEW EXAM INFORMATION",
      url: exam.url
    },
    "Exam Passed": (() => {
      const fp = forgeFingerprintActionForAgent(agent);
      if (fp.required === true) {
        return {
          button: fp.button,
          url: fp.url
        };
      }
      return {
        button: "APPLY FOR YOUR LICENSE",
        url: FORGE_LICENSING_LINKS.sircon
      };
    })(),
    "Licensed": {
      button: "COMPLETE COMPLIANCE TRAINING",
      url: FORGE_LICENSING_LINKS.successCE
    },
    "Contracted": {
      button: "LAUNCH PRODUCTION",
      url: forgeProductionLinkForCurrentOrganization()
    }
  };

  return actions[stage] || {
    button: "CONTINUE YOUR JOURNEY",
    url: FORGE_LICENSING_LINKS.quiz
  };
}

function forgeLicensingResourcesHtml(brand, agent) {
  const exam = forgeExamSchedulerForAgent(agent);
  const links = [
    { title: "Licensing Quiz", subtitle: "Readiness & licensing workflow", url: FORGE_LICENSING_LINKS.quiz },
    { title: "State Exam", subtitle: exam.label, url: exam.url },
    { title: "SIRCON", subtitle: "Resident license application", url: FORGE_LICENSING_LINKS.sircon },
    { title: "NIPR", subtitle: "Licensing center & applications", url: FORGE_LICENSING_LINKS.nipr },
    { title: "SUCCESS CE", subtitle: "AML & annuity best-interest training", url: FORGE_LICENSING_LINKS.successCE },
    { title: "TEVAH TECHNOLOGY", subtitle: "E&O & carrier appointment", url: FORGE_LICENSING_LINKS.tevah }
  ];

  return `
    <div style="margin-top:28px;padding-top:22px;border-top:1px solid #e9edf2;">
      <div style="font-size:11px;font-weight:900;letter-spacing:.12em;color:${brand.primary};">
        LICENSING RESOURCES
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">
        ${links.map((item) => `
          <tr>
            <td style="padding:9px 0;border-bottom:1px solid #edf1f5;">
              <a href="${forgeEscapeEmailHtml(item.url)}" target="_blank"
                style="display:block;text-decoration:none;color:${brand.primaryDeep};">
                <span style="font-size:13px;font-weight:850;">${forgeEscapeEmailHtml(item.title)}</span>
                <span style="display:block;margin-top:2px;font-size:11px;color:#718096;">${forgeEscapeEmailHtml(item.subtitle)}</span>
              </a>
            </td>
            <td align="right" style="border-bottom:1px solid #edf1f5;">
              <a href="${forgeEscapeEmailHtml(item.url)}" target="_blank"
                style="display:inline-block;text-decoration:none;font-size:18px;font-weight:900;color:${brand.accent};">›</a>
            </td>
          </tr>
        `).join("")}
      </table>
    </div>
  `;
}


function forgeStateRequirementNote(stage, agent) {
  const state =
    String(
      agent?.residentState ||
      agent?.resident_state ||
      forgeAgentResidentState?.(agent) ||
      ""
    )
      .trim()
      .toUpperCase();

  if (!state) {
    return "";
  }

  const config =
    typeof forgeStateLicensingConfig === "function"
      ? forgeStateLicensingConfig(agent)
      : null;

  if (stage === "XCEL Completed") {
    if (config?.examProvider) {
      return `${state} exam provider: ${config.examProvider}.`;
    }

    return `Review your ${state} exam scheduling requirements.`;
  }

  if (
    stage === "Exam Scheduled"
  ) {
    return `Your ${state} licensing exam is the next major milestone.`;
  }

  if (
    stage === "Exam Passed"
  ) {
    if (
      config?.fingerprintRequired === true
    ) {
      return `${state} requires fingerprinting before the resident licensing process is complete.`;
    }

    if (
      config?.fingerprintRequired === false
    ) {
      return `Continue with the remaining ${state} resident license application requirements.`;
    }

    return `Review the remaining ${state} licensing requirements before submitting your application.`;
  }

  if (
    stage === "Licensed"
  ) {
    return `Your ${state} resident license is active. Complete your remaining contracting requirements.`;
  }

  if (
    stage === "Contracted"
  ) {
    return `Your ${state} resident licensing and contracting journey is complete.`;
  }

  return "";
}

function forgeEmailNextStep(stage, agent) {
  const examValue =
    typeof forgeExamDateValue === "function"
      ? forgeExamDateValue(agent)
      : "";

  if (
    examValue &&
    ["XCEL Completed", "Exam Scheduled"].includes(stage)
  ) {
    const action = forgeEmailStageAction("Exam Scheduled", agent);
    return {
      eyebrow: "STATE EXAM",
      title: "Your exam is scheduled",
      text:
        `Your state exam is confirmed for ${forgeFormatExamDate(examValue)}. Keep preparing and make sure you have everything you need before exam day.`,
      button: action.button,
      url: action.url
    };
  }

  const steps = {
    "Not Placed": {
      eyebrow: "GET STARTED",
      title: "Begin your licensing journey",
      text:
        "Your first step is to complete the readiness check so your team can guide you through the right licensing path.",
      button: "START YOUR NEXT STEP"
    },
    "Quiz Sent": {
      eyebrow: "YOUR NEXT STEP",
      title: "Complete your readiness quiz",
      text:
        "Complete your licensing readiness quiz so your team can move you into the next stage of your journey.",
      button: "COMPLETE YOUR NEXT STEP"
    },
    "XCEL Completed": {
      eyebrow: "YOUR NEXT STEP",
      title: "Schedule your state exam",
      text:
        "Your licensing course is complete. Schedule your state exam while the material is still fresh, then share the confirmed date with your team.",
      button: "SCHEDULE YOUR EXAM"
    },
    "Exam Passed": {
      eyebrow: "CONGRATULATIONS",
      title: "You passed your exam",
      text:
        "Excellent work. Your next focus is fingerprints and the state licensing application so you can become fully licensed.",
      button: "CONTINUE TO LICENSING"
    },
    "Licensed": {
      eyebrow: "MILESTONE REACHED",
      title: "You are licensed",
      text:
        "You reached a major milestone. The next step is contracting so you can move into production.",
      button: "START CONTRACTING"
    },
    "Contracted": {
      eyebrow: "READY FOR PRODUCTION",
      title: "Your business launch starts now",
      text:
        "You are contracted and ready to move into fast-start activity, field training, and your first client appointments.",
      button: "LAUNCH PRODUCTION"
    }
  };

  const step = steps[stage] || {
    eyebrow: "YOUR NEXT STEP",
    title: "Keep your momentum moving",
    text:
      "Review your current milestone and complete the next action so your licensing journey continues moving forward.",
    button: "CONTINUE YOUR JOURNEY"
  };

  const action = forgeEmailStageAction(stage, agent);

  return {
    ...step,
    button: action.button,
    url: action.url,
    stateNote: forgeStateRequirementNote(stage, agent)
  };
}

function forgeResolveEmailBrandForHtml() {
  const brand =
    typeof getForgeOrganizationEmailBrand === "function"
      ? getForgeOrganizationEmailBrand()
      : {
          name: currentOrganization?.name || "Your Organization",
          logo: "",
          primary: "#0a2b59",
          accent: "#3f8cff",
          tagline: "Powered by FORGE"
        };

  const key = forgeEmailBrandKey(brand.name);

  if (key === "apex") {
    return {
      ...brand,
      key,
      primary: "#067647",
      primaryDeep: "#034d32",
      accent: "#18a566",
      accentLight: "#a7f3d0",
      accentDeep: "#047857",
      surface: "#f3fbf7",
      name: brand.name || "Apex Wealth Building"
    };
  }

  if (key === "bizzall") {
    return {
      ...brand,
      key,
      primary: "#0a2b59",
      primaryDeep: "#061a38",
      accent: "#3f8cff",
      accentLight: "#8ec0ff",
      accentDeep: "#1557a6",
      surface: "#f6f9fd",
      name: brand.name || "Team Bizzall"
    };
  }

  return {
    ...brand,
    key,
    primaryDeep: brand.primary || "#0a2b59",
    accentLight: brand.accent || "#3f8cff",
    accentDeep: brand.accent || "#3f8cff",
    surface: "#f7f9fc"
  };
}

function forgeBuildBrandedEmailHtml(agent, subject, body, options = {}) {
  const brand =
    forgeResolveEmailBrandForHtml();

  const firstName =
    String(
      getAgentDisplayName(agent) || "there"
    )
      .trim()
      .split(/\s+/)[0];

  const stage =
    agent?.stage || "Not Placed";

  const cleanBody =
    forgeStripDuplicateGreeting(
      body,
      firstName
    );

  const nextStep =
    forgeEmailNextStep(stage, agent);

  const stages =
    forgeEmailJourneyStages();

  const currentIndex =
    forgeEmailStageIndex(stage);

  const journeyHtml =
    stages
      .map((item, index) => {
        const complete =
          index <= currentIndex;

        const dotBackground =
          complete
            ? brand.primary
            : "#e9edf2";

        const dotBorder =
          complete
            ? brand.accent
            : "#d8dee7";

        const textColor =
          complete
            ? brand.primary
            : "#7f8b9c";

        return `
          <td style="width:${100 / stages.length}%;text-align:center;vertical-align:top;padding:0 2px;">
            <div style="width:28px;height:28px;border-radius:999px;margin:0 auto 7px;background:${dotBackground};border:2px solid ${dotBorder};color:#fff;font-size:12px;line-height:24px;font-weight:800;">
              ${complete ? "✓" : ""}
            </div>
            <div style="font-size:10px;line-height:1.15;font-weight:700;color:${textColor};">
              ${forgeEscapeEmailHtml(forgeEmailStageLabel(item))}
            </div>
          </td>
        `;
      })
      .join("");

  // Text-only organization branding is intentional.
  // This avoids broken external/CID logo images in previews and email clients.
  const logoHtml = `
    <div style="font-size:24px;line-height:1.15;font-weight:900;color:#fff;letter-spacing:-.02em;">
      ${forgeEscapeEmailHtml(brand.name)}
    </div>
  `;

  const coordinatorName =
    selectedCoordinator &&
    selectedCoordinator !== "All"
      ? selectedCoordinator
      : "Your Licensing Team";

  const examValue =
    typeof forgeExamDateValue === "function"
      ? forgeExamDateValue(agent)
      : "";

  const examBlock =
    examValue
      ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 0;border-collapse:separate;">
          <tr>
            <td style="padding:16px 18px;border:1px solid ${brand.accent};border-radius:14px;background:#fffdf7;">
              <div style="font-size:10px;letter-spacing:.12em;font-weight:900;color:${brand.primary};">STATE EXAM</div>
              <div style="margin-top:5px;font-size:18px;font-weight:800;color:${brand.primaryDeep};">${forgeEscapeEmailHtml(forgeFormatExamDate(examValue))}</div>
              <div style="margin-top:4px;font-size:13px;color:#687788;">FORGE will keep this date visible in your licensing workflow.</div>
            </td>
          </tr>
        </table>
      `
      : "";

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f5;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 14px 40px rgba(18,35,55,.10);">
            <tr>
              <td style="height:5px;background:${brand.accent};font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <tr>
              <td style="padding:24px 28px;background:${brand.primaryDeep};">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      ${logoHtml}
                    </td>
                    <td align="right" style="vertical-align:middle;color:${brand.accentLight};font-size:10px;font-weight:800;letter-spacing:.12em;">
                      LICENSING JOURNEY
                    </td>
                  </tr>
                </table>
                <div style="margin-top:12px;font-size:12px;color:${brand.accentLight};font-weight:600;">
                  ${forgeEscapeEmailHtml(brand.tagline || "Powered by FORGE")}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:34px 34px 16px;">
                <div style="font-size:28px;font-weight:850;color:${brand.primaryDeep};line-height:1.2;">
                  Hi ${forgeEscapeEmailHtml(firstName)},
                </div>

                <div style="margin-top:18px;">
                  ${forgeEmailParagraphs(cleanBody)}
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
                  <tr>
                    <td style="padding:22px;border:1px solid ${brand.accent};border-radius:16px;background:${brand.surface};">
                      <div style="font-size:10px;letter-spacing:.14em;font-weight:900;color:${brand.accentDeep || brand.primary};">
                        ${forgeEscapeEmailHtml(nextStep.eyebrow)}
                      </div>
                      <div style="margin-top:7px;font-size:22px;line-height:1.25;font-weight:850;color:${brand.primaryDeep};">
                        ${forgeEscapeEmailHtml(nextStep.title)}
                      </div>
                      <div style="margin-top:9px;font-size:14px;line-height:1.55;color:#58697a;">
                        ${forgeEscapeEmailHtml(nextStep.text)}${nextStep.stateNote ? `<div style="margin-top:10px;font-size:11px;font-weight:800;color:#667085;">${forgeEscapeEmailHtml(nextStep.stateNote)}</div>` : ""}
                      </div>
                    </td>
                  </tr>
                </table>

                ${examBlock}

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px auto 28px;">
                  <tr>
                    <td align="center" style="border-radius:12px;background:${brand.primary};border:1px solid ${brand.accent};">
                      <a href="${forgeEscapeEmailHtml(options.nextStepUrl || nextStep.url || FORGE_LICENSING_LINKS.quiz)}"
                         target="_blank"
                         style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-size:12px;font-weight:900;letter-spacing:.04em;">
                        ${forgeEscapeEmailHtml(nextStep.button)} →
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="padding-top:22px;border-top:1px solid #e9edf2;">
                  <div style="font-size:11px;font-weight:900;letter-spacing:.12em;color:${brand.primary};">
                    YOUR JOURNEY
                  </div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
                    <tr>
                      ${journeyHtml}
                    </tr>
                  </table>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:30px;">
                  <tr>
                    <td style="padding:18px 20px;border-radius:14px;background:#f7f9fb;">
                      <div style="font-size:11px;color:#7a8796;font-weight:800;">YOUR SUPPORT TEAM</div>
                      <div style="margin-top:5px;font-size:16px;color:${brand.primaryDeep};font-weight:850;">
                        ${forgeEscapeEmailHtml(coordinatorName)}
                      </div>
                      <div style="margin-top:3px;font-size:12px;color:#69798a;">
                        ${forgeEscapeEmailHtml(brand.name)}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:22px 24px;background:${brand.primaryDeep};">
                <div style="font-size:12px;color:#fff;font-weight:800;">${forgeEscapeEmailHtml(brand.name)}</div>
                <div style="margin-top:5px;font-size:10px;color:${brand.accentLight};">${forgeEscapeEmailHtml(brand.tagline || "")}</div>
                <div style="margin-top:12px;font-size:9px;color:rgba(255,255,255,.58);letter-spacing:.08em;">POWERED BY FORGE</div>
              </td>
            </tr>
          </table>

          <div style="max-width:620px;margin:12px auto 0;text-align:center;font-size:10px;line-height:1.5;color:#8a95a3;">
            This message was prepared through FORGE for ${forgeEscapeEmailHtml(brand.name)}.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function forgeRenderEmailPreview() {
  const preview =
    document.getElementById("forgeEmailPreviewFrame");

  if (!preview) {
    console.error("FORGE: Preview container not found.");
    return;
  }

  if (!selectedAgent) {
    preview.innerHTML = `
      <div style="padding:40px;text-align:center;">
        Select an agent to preview the email.
      </div>
    `;
    return;
  }

  try {
    const subject =
      document.getElementById("forgeEmailSubject")
        ?.value || "";

    const body =
      document.getElementById("forgeEmailBody")
        ?.value || "";

    const emailHtml =
      forgeBuildBrandedEmailHtml(
        selectedAgent,
        subject,
        body
      );

    const parser =
      new DOMParser();

    const emailDocument =
      parser.parseFromString(
        emailHtml,
        "text/html"
      );

    preview.innerHTML =
      emailDocument.body.innerHTML;

    preview.style.display = "block";
    preview.style.background = "#ffffff";

    console.log(
      "FORGE EMAIL PREVIEW RENDERED"
    );

  } catch (error) {
    console.error(
      "FORGE EMAIL PREVIEW ERROR:",
      error
    );

    preview.innerHTML = `
      <div style="
        min-height:360px;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:32px;
        text-align:center;
        color:#66788a;
        font-weight:700;
      ">
        Preview error: ${
          String(
            error?.message ||
            error ||
            "Unknown error"
          )
        }
      </div>
    `;
  }
}
function forgeSetEmailTab(tabName = "edit") {
  document
    .querySelectorAll(".forge-email-tab")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.forgeEmailTab === tabName
      );
    });

  document
    .getElementById("forgeEmailEditPanel")
    ?.classList.toggle(
      "hidden",
      tabName !== "edit"
    );

  document
    .getElementById("forgeEmailPreviewPanel")
    ?.classList.toggle(
      "hidden",
      tabName !== "preview"
    );

  if (tabName === "preview") {
    forgeRenderEmailPreview();
  }
}


async function forgeCreateAgentNextStepLink(agent) {
  const agentId = agent?.id;

  if (!agentId) {
    throw new Error("This agent does not have a database ID yet.");
  }

  if (!forgeSupabase?.functions?.invoke) {
    throw new Error("Supabase Functions is not available in this FORGE build.");
  }

  const { data, error } = await forgeSupabase.functions.invoke(
    "create-agent-next-step-link",
    {
      body: {
        agentId
      }
    }
  );

  if (error) throw error;

  if (!data?.ok || !data?.url) {
    throw new Error(
      data?.error || "FORGE could not create the secure agent link."
    );
  }

  return data.url;
}

async function forgeSendBrandedEmail() {
  if (!selectedAgent) {
    alert("Please select an agent first.");
    return;
  }

  const to =
    String(selectedAgent.email || "").trim();

  if (!to) {
    alert(
      `${getAgentDisplayName(selectedAgent)} does not have an email address in FORGE.`
    );
    return;
  }

  const subject =
    document.getElementById("forgeEmailSubject")
      ?.value.trim() || "";

  const body =
    document.getElementById("forgeEmailBody")
      ?.value || "";

  if (!subject) {
    forgeSetEmailStatus(
      "Add a subject before sending."
    );
    forgeSetEmailTab("edit");
    return;
  }

  const button =
    document.getElementById("sendForgeBrandedEmail");

  const oldText =
    button?.textContent || "Send Branded Email";

  if (button) {
    button.disabled = true;
    button.textContent = "Sending...";
  }

  forgeSetEmailStatus(
    "Sending your branded email..."
  );

  try {
    const brand =
      forgeResolveEmailBrandForHtml();

    forgeSetEmailStatus(
      "Creating the agent's secure next-step link..."
    );

    const nextStepUrl =
      await forgeCreateAgentNextStepLink(
        selectedAgent
      );

    const html =
      forgeBuildBrandedEmailHtml(
        selectedAgent,
        subject,
        body,
        {
          forSend: true,
          nextStepUrl
        }
      );

    const logoAsset = null;

    if (
      !forgeSupabase?.functions?.invoke
    ) {
      throw new Error(
        "Supabase Functions is not available in this FORGE build."
      );
    }

    const { data, error } =
      await forgeSupabase.functions.invoke(
        "send-branded-email",
        {
          body: {
            to,
            subject,
            html,
            text: body,
            organizationId:
              getActiveOrganizationId(),
            organizationName:
              brand.name,
            agentId:
              selectedAgent.id || null,
            logoBase64:
              logoAsset?.data || null,
            logoFilename:
              logoAsset?.filename || null,
            logoMime:
              logoAsset?.mime || null
          }
        }
      );

    if (error) {
      throw error;
    }

    if (
      data &&
      data.ok === false
    ) {
      throw new Error(
        data.error ||
        "Email service returned an error."
      );
    }

    forgeSetEmailStatus(
      "✓ Branded email sent successfully."
    );

    if (
      typeof logCoordinatorActivity === "function"
    ) {
      logCoordinatorActivity(
        selectedAgent,
        "Email",
        `Branded email sent: ${subject}`
      );
    }

    setTimeout(
      closeForgeEmailComposer,
      900
    );

  } catch (error) {
    console.error(
      "FORGE BRANDED EMAIL SEND ERROR:",
      error
    );

    const message =
      error?.message ||
      String(error);

    const friendlyMessage =
      /Failed to send a request to the Edge Function/i.test(message)
        ? "Email sending is not connected yet. The FORGE preview is working, but the Supabase Edge Function must be deployed before Send Branded Email can deliver."
        : message;

    forgeSetEmailStatus(
      `Could not send: ${friendlyMessage}`
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}

document.addEventListener(
  "click",
  async (event) => {
    const tab =
      event.target.closest(
        "[data-forge-email-tab]"
      );

    if (tab) {
      event.preventDefault();
      forgeSetEmailTab(
        tab.dataset.forgeEmailTab
      );
      return;
    }

    const sendButton =
      event.target.closest(
        "#sendForgeBrandedEmail"
      );

    if (sendButton) {
      event.preventDefault();
      event.stopPropagation();
      await forgeSendBrandedEmail();
      return;
    }
  }
);

document.addEventListener(
  "input",
  (event) => {
    if (
      event.target?.id === "forgeEmailSubject" ||
      event.target?.id === "forgeEmailBody"
    ) {
      if (
        !document
          .getElementById("forgeEmailPreviewPanel")
          ?.classList.contains("hidden")
      ) {
        forgeRenderEmailPreview();
      }
    }
  }
);



function openForgeEmailComposer(agent, subject = "", message = "") {
  if (!agent) {
    alert("Please select an agent first.");
    return;
  }

  const email =
    String(agent.email || "").trim();

  if (!email) {
    alert(
      `${getAgentDisplayName(agent)} does not have an email address in FORGE.`
    );
    return;
  }

  applyForgeEmailModalBrandKey();

  const modal =
    document.getElementById(
      "forgeEmailModal"
    );

  // Brand every email composer from the active organization.
  renderForgeOrganizationEmailBrand();

  const subjectInput =
    document.getElementById(
      "forgeEmailSubject"
    );

  const bodyInput =
    document.getElementById(
      "forgeEmailBody"
    );

  setText(
    "forgeEmailRecipientName",
    getAgentDisplayName(agent)
  );

  setText(
    "forgeEmailRecipientAddress",
    email
  );

  setText(
    "forgeEmailAvatar",
    getInitials(
      getAgentDisplayName(agent)
    )
  );

  if (subjectInput) {
    subjectInput.value =
      subject || "";
  }

  if (bodyInput) {
    bodyInput.value =
      message || "";
  }

  const status =
    document.getElementById(
      "forgeEmailStatus"
    );

  if (status) {
    status.textContent =
      "Preview the organization-branded email, then send it directly from FORGE.";
  }

  forgeSetEmailTab("edit");

  modal?.classList.remove(
    "hidden"
  );
}

function closeForgeEmailComposer() {
  document
    .getElementById(
      "forgeEmailModal"
    )
    ?.classList.add(
      "hidden"
    );
}


function forgeSetEmailStatus(message) {
  const status =
    document.getElementById(
      "forgeEmailStatus"
    );

  if (status) {
    status.textContent =
      message || "";
  }
}

async function forgeCopyEmailContent() {
  const subject =
    document
      .getElementById(
        "forgeEmailSubject"
      )
      ?.value || "";

  const body =
    document
      .getElementById(
        "forgeEmailBody"
      )
      ?.value || "";

  const content =
    subject
      ? `${subject}\n\n${body}`
      : body;

  if (!content.trim()) {
    forgeSetEmailStatus(
      "There is nothing to copy."
    );
    return;
  }

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(
        content
      );

      forgeSetEmailStatus(
        "Email copied."
      );

      return;
    }
  } catch (error) {
    console.warn(
      "Modern clipboard copy failed:",
      error
    );
  }

  // Fallback for embedded browsers / older permissions.
  const textarea =
    document.createElement(
      "textarea"
    );

  textarea.value =
    content;

  textarea.setAttribute(
    "readonly",
    ""
  );

  textarea.style.position =
    "fixed";

  textarea.style.left =
    "-9999px";

  document.body.appendChild(
    textarea
  );

  textarea.select();
  textarea.setSelectionRange(
    0,
    textarea.value.length
  );

  let copied = false;

  try {
    copied =
      document.execCommand(
        "copy"
      );
  } catch (error) {
    console.error(
      "Clipboard fallback failed:",
      error
    );
  }

  textarea.remove();

  forgeSetEmailStatus(
    copied
      ? "Email copied."
      : "Copy was blocked. Select the message and copy it manually."
  );
}

// IMPORTANT:
// index.html loads script.js BEFORE the email modal markup.
// Event delegation guarantees these controls work even though
// the modal elements are parsed after this script runs.
document.addEventListener(
  "click",
  async (event) => {

    const closeButton =
      event.target.closest(
        "#closeForgeEmailModal, #cancelForgeEmail"
      );

    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();

      closeForgeEmailComposer();
      return;
    }


    const copyButton =
      event.target.closest(
        "#copyForgeEmail"
      );

    if (copyButton) {
      event.preventDefault();
      event.stopPropagation();

      await forgeCopyEmailContent();
      return;
    }


    const gmailButton =
      event.target.closest(
        "#openForgeEmailInGmail"
      );

    if (gmailButton) {
      event.preventDefault();
      event.stopPropagation();

      openForgeEmailInGmail();
      return;
    }


    // Clicking the dark backdrop closes the modal,
    // but clicking the card itself does not.
    if (
      event.target?.id ===
      "forgeEmailModal"
    ) {
      closeForgeEmailComposer();
    }

  }
);

function openForgeEmailInGmail() {
  if (!selectedAgent) {
    alert(
      "Please select an agent first."
    );
    return;
  }

  const email =
    String(
      selectedAgent.email || ""
    ).trim();

  if (!email) {
    alert(
      `${getAgentDisplayName(selectedAgent)} does not have an email address in FORGE.`
    );
    return;
  }

  const subject =
    document
      .getElementById(
        "forgeEmailSubject"
      )
      ?.value || "";

  const body =
    document
      .getElementById(
        "forgeEmailBody"
      )
      ?.value || "";

  const gmailUrl =
    "https://mail.google.com/mail/?view=cm&fs=1" +
    `&to=${encodeURIComponent(email)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  window.open(
    gmailUrl,
    "_blank",
    "noopener,noreferrer"
  );
}

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape" &&
      !document
        .getElementById(
          "forgeEmailModal"
        )
        ?.classList.contains(
          "hidden"
        )
    ) {
      closeForgeEmailComposer();
    }
  }
);



async function forgeOpenCommandChannel(method) {
  if (!selectedAgent) {
    alert("Please select an agent first.");
    return;
  }

  const phone = forgeCleanPhoneForLink(selectedAgent.phone);
  const email = String(selectedAgent.email || "").trim();

  const stage = selectedAgent.stage || "Not Placed";
  const template =
    typeof getStageMessageTemplate === "function"
      ? getStageMessageTemplate(
          stage,
          method,
          selectedAgent,
          method === "WhatsApp" ? "friendly" : "default"
        )
      : { subject: "", body: "" };

  let subject = template?.subject || "";
  let message = template?.body || "";

  const examValue =
    forgeExamDateValue(selectedAgent);

  if (
    examValue &&
    ["Text", "Email", "WhatsApp"].includes(method)
  ) {
    const examLine =
      `\n\nYour state exam is scheduled for ${forgeFormatExamDate(examValue)}.`;

    if (
      !String(message)
        .toLowerCase()
        .includes("exam is scheduled")
    ) {
      message += examLine;
    }
  }

  if (method === "Call") {
    if (!phone) {
      alert(`${getAgentDisplayName(selectedAgent)} does not have a phone number in FORGE.`);
      return;
    }

    window.location.href = `tel:+${phone}`;
    return;
  }

  if (method === "Text") {
    if (!phone) {
      alert(`${getAgentDisplayName(selectedAgent)} does not have a phone number in FORGE.`);
      return;
    }

    try {
      const nextStepUrl =
        await forgeCreateAgentNextStepLink(
          selectedAgent
        );

      const secureMessage =
        `${message}\n\nContinue your FORGE journey here:\n${nextStepUrl}`;

      const separator =
        /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? "&"
          : "?";

      window.location.href =
        `sms:+${phone}${separator}body=${encodeURIComponent(secureMessage)}`;
    } catch (error) {
      console.error("FORGE SECURE TEXT LINK ERROR:", error);
      alert(
        `FORGE could not create the secure licensing link: ${
          error?.message || String(error)
        }`
      );
    }

    return;
  }

  if (method === "Email") {
    if (!email) {
      alert(
        `${getAgentDisplayName(selectedAgent)} does not have an email address in FORGE.`
      );
      return;
    }

    openForgeEmailComposer(
      selectedAgent,
      subject,
      message
    );

    return;
  }

  if (method === "WhatsApp") {
    if (!phone) {
      alert(`${getAgentDisplayName(selectedAgent)} does not have a phone number in FORGE.`);
      return;
    }

    try {
      const nextStepUrl =
        await forgeCreateAgentNextStepLink(
          selectedAgent
        );

      const secureMessage =
        `${message}\n\nContinue your FORGE journey here:\n${nextStepUrl}`;

      const url =
        `https://wa.me/${phone}?text=${encodeURIComponent(secureMessage)}`;

      window.open(
        url,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      console.error("FORGE SECURE WHATSAPP LINK ERROR:", error);
      alert(
        `FORGE could not create the secure licensing link: ${
          error?.message || String(error)
        }`
      );
    }

    return;
  }

  openSmartComposer(method);
}

document.addEventListener("click", (event) => {
  const actionBtn = event.target.closest(
    ".quick-actions button, .command-channel-actions button, .command-add-activity, #takeActionBtn, .take-action-btn, [data-compose]"
  );

  if (!actionBtn) return;

  event.preventDefault();
  event.stopPropagation();

  const method =
    actionBtn.dataset.method ||
    actionBtn.dataset.compose ||
    "Text";

  // The four communication buttons in the Command hero
  // should actually open the communication channel.
  if (
    actionBtn.closest(".command-channel-actions") &&
    ["Call", "Text", "Email", "WhatsApp"].includes(method)
  ) {
    forgeOpenCommandChannel(method);
    return;
  }

  // Keep the rest of FORGE's workflow/composer behavior.
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
    getActiveOrganizationId(),

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

    selectedImportFiles = [];
    renderSelectedImportFiles();

    const organizationName =
      document.getElementById("importOrganizationName");

    if (organizationName) {
      organizationName.textContent =
        currentOrganization?.name ||
        "Current Organization";
    }

    const report =
      document.getElementById("importSafetyReport");

    if (report) {
      report.innerHTML = "";
      report.classList.add("hidden");
    }

    document
      .getElementById("importReviewModal")
      ?.classList.remove("hidden");

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
          getActiveOrganizationId(),

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

       stage: (() => {

  const importedStage =
    getTeamJourneyStage(teamStatus);

  const existingAgent =
    allAgents.find((existing) =>
      String(existing.code || "")
        .trim()
        .toUpperCase() ===
      String(agent.code || "")
        .trim()
        .toUpperCase()
    );

  if (!existingAgent) {
    return importedStage;
  }

  const currentStage =
    existingAgent.stage ||
    "Not Placed";

  const currentRank =
    STAGE_RANK[currentStage] ?? 0;

  const importedRank =
    STAGE_RANK[importedStage] ?? 0;

  return importedRank > currentRank
    ? importedStage
    : currentStage;

})(),

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
// ==========================================================
// LEGACY SINGLE-FILE SMART IMPORT DISABLED
// Safe Multi-Source Import below is now the only Smart Import path.
// ==========================================================

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

async function importComplianceFile(parsedRows, file) {

  console.log(
    "Starting Smart Compliance import..."
  );

  if (!getActiveOrganizationId()) {
    throw new Error(
      "FORGE does not have an active organization selected."
    );
  }

  const complianceAgents =
    parsedRows.map(normalizeComplianceAgent);

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

  let updatedCount = 0;
  let unmatchedCount = 0;
  let failedCount = 0;

  for (const complianceAgent of validAgents) {

    const existingAgent =
      findExistingTeamAgent(
        complianceAgent
      );

   if (!existingAgent) {

  console.log(
    "Creating Compliance-only team member:",
    complianceAgent.code,
    complianceAgent.name
  );

  const residentActive =
    isComplianceActive(
      complianceAgent.residentLicense
    );

  const amlActive =
    isComplianceActive(
      complianceAgent.amlStatus
    );

  let initialStage = "Not Placed";

  if (residentActive) {
    initialStage = "Licensed";
  }

  if (residentActive && amlActive) {
    initialStage = "Contracted";
  }

  const newAgent = {

    organization_id:
      getActiveOrganizationId(),

    agent_code:
      String(complianceAgent.code)
        .trim()
        .toUpperCase(),

    name:
      cleanAgentName(
        complianceAgent.name
      ),

    email:
      complianceAgent.email
        ? String(complianceAgent.email)
            .trim()
            .toLowerCase()
        : null,

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

    upline_name:
      complianceAgent.upline || null,

    team_status:
      complianceAgent.teamStatus || null,

    stage:
      initialStage,

    import_source:
      "Tevah Compliance"
  };

  const { error: insertError } =
    await forgeSupabase
      .from("agents")
      .upsert(
        newAgent,
        {
          onConflict:
            "organization_id,agent_code",

          ignoreDuplicates:
            false
        }
      );

  if (insertError) {

    console.error(
      "COMPLIANCE INSERT ERROR:",
      complianceAgent.code,
      insertError
    );

    failedCount++;
    continue;
  }

  updatedCount++;
  continue;
}

    const finalStage =
      getComplianceJourneyStage(
        complianceAgent,
        existingAgent
      );

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

    const { error } =
      await forgeSupabase
        .from("agents")
        .update(updates)
        .eq(
          "organization_id",
          getActiveOrganizationId()
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

  await loadCSV();

  alert(
    `${updatedCount} compliance records updated successfully.` +
    (unmatchedCount
      ? ` ${unmatchedCount} unmatched records were skipped.`
      : "") +
    (failedCount
      ? ` ${failedCount} records failed to update.`
      : "") +
    (skippedCount
      ? ` ${skippedCount} records without Agent Code were skipped.`
      : "")
  );
}

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
                getActiveOrganizationId()
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
      nextStep: "begin your XCEL pre-licensing course",
      request: "Open your personal FORGE Journey and use the XCEL button to begin your training.",
      urgency: "I want to keep your momentum strong while everything is still fresh."
    },
    "XCEL Completed": {
      milestone: "completing XCEL",
      nextStep: "schedule your state exam",
      request: "Schedule through the official provider, then return to your personal FORGE Journey and save the confirmed exam date and time.",
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

// ==========================================================
// FORGE JOURNEY MENU - FINAL OVERRIDE
// Paste at VERY BOTTOM of script.js
// ==========================================================

document.addEventListener(
  "click",
  async (event) => {

    const menuButton =
      event.target.closest("[data-agent-menu]");

    // ======================================================
    // CLICK OUTSIDE -> CLOSE MENU
    // ======================================================

    if (!menuButton) {

      if (
        !event.target.closest(
          ".forge-floating-agent-menu"
        )
      ) {
        document
          .querySelectorAll(
            ".forge-floating-agent-menu"
          )
          .forEach((menu) =>
            menu.remove()
          );
      }

      return;
    }


    // ======================================================
    // THIS IS A THREE-DOT CLICK
    // Stop older Journey handlers from interfering
    // ======================================================

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();


    const agentId =
      menuButton.dataset.agentMenu;

    console.log(
      "FORGE MENU CLICK:",
      agentId
    );


    const agent =
      allAgents.find(
        (item) =>
          String(item.id) ===
          String(agentId)
      );


    if (!agent) {

      console.error(
        "FORGE MENU: Agent not found:",
        agentId
      );

      return;
    }


    // Close any existing menu
    document
      .querySelectorAll(
        ".forge-floating-agent-menu"
      )
      .forEach((menu) =>
        menu.remove()
      );


    // ======================================================
    // CREATE FLOATING MENU
    // ======================================================

    const menu =
      document.createElement("div");

    menu.className =
      "forge-floating-agent-menu";


    menu.innerHTML = `

      <button
        type="button"
        data-forge-view-agent
      >
        <span>◉</span>
        View Details
      </button>


      <button
        type="button"
        data-forge-edit-agent
      >
        <span>✎</span>
        Edit Agent
      </button>


      ${
        agent.stage !== "Not Placed"
          ? `
            <button
              type="button"
              data-forge-move-back
            >
              <span>↶</span>
              Move Back
            </button>
          `
          : ""
      }


      <button
        type="button"
        class="danger"
        data-forge-remove-agent
      >
        <span>⌫</span>
        Remove Agent
      </button>

    `;


    document.body.appendChild(menu);


    // ======================================================
    // POSITION NEXT TO THREE-DOT BUTTON
    // ======================================================

    const rect =
      menuButton.getBoundingClientRect();

    const menuWidth = 210;


    let left =
      rect.right -
      menuWidth;


    let top =
      rect.bottom + 8;


    // Prevent going off right edge
    if (
      left + menuWidth >
      window.innerWidth - 12
    ) {
      left =
        window.innerWidth -
        menuWidth -
        12;
    }


    // Prevent going off left edge
    if (left < 12) {
      left = 12;
    }


    menu.style.left =
      `${left}px`;

    menu.style.top =
      `${top}px`;


    console.log(
      "FORGE MENU OPENED:",
      agent.name
    );


    // ======================================================
    // VIEW DETAILS
    // ======================================================

    menu
      .querySelector(
        "[data-forge-view-agent]"
      )
      ?.addEventListener(
        "click",
        (clickEvent) => {

          clickEvent.stopPropagation();

          selectedAgent = agent;

          menu.remove();

          showPage("Agents");

          document
            .querySelectorAll(
              ".nav-btn"
            )
            .forEach((nav) => {

              nav.classList.toggle(
                "active",
                nav.textContent
                  .trim() ===
                  "Agents"
              );

            });


          renderAgentsPage();

          showAgentProfile(agent);

        }
      );


    // ======================================================
    // EDIT
    // ======================================================

    menu
      .querySelector(
        "[data-forge-edit-agent]"
      )
      ?.addEventListener(
        "click",
        (clickEvent) => {

          clickEvent.stopPropagation();

          selectedAgent = agent;

          menu.remove();

          document
            .querySelector(
              ".edit-agent-btn"
            )
            ?.click();

        }
      );


    // ======================================================
    // MOVE BACK
    // ======================================================

    menu
      .querySelector(
        "[data-forge-move-back]"
      )
      ?.addEventListener(
        "click",
        async (clickEvent) => {

          clickEvent.stopPropagation();


          const stages = [
            "Not Placed",
            "Quiz Sent",
            "XCEL Completed",
            "Exam Passed",
            "Licensed",
            "Contracted"
          ];


          const index =
            stages.indexOf(
              agent.stage
            );


          if (index <= 0) {
            return;
          }


          menu.remove();


          await updateJourneyStage(
            agent,
            stages[index - 1]
          );

        }
      );


    // ======================================================
    // REMOVE FROM CURRENT ORGANIZATION
    // ======================================================

    menu
      .querySelector(
        "[data-forge-remove-agent]"
      )
      ?.addEventListener(
        "click",
        async (clickEvent) => {

          clickEvent.stopPropagation();


          const confirmed =
            confirm(
              `Remove ${agent.name} from FORGE?`
            );


          if (!confirmed) {
            return;
          }


          const {
            error
          } =
            await forgeSupabase
              .from("agents")
              .delete()
              .eq(
                "organization_id",
                getActiveOrganizationId()
              )
              .eq(
                "id",
                agent.id
              );


          if (error) {

            console.error(
              "FORGE REMOVE AGENT ERROR:",
              error
            );

            alert(
              "FORGE could not remove this agent."
            );

            return;
          }


          menu.remove();


          await loadCSV();


          alert(
            `${agent.name} was removed from FORGE.`
          );

        }
      );

  },

  // IMPORTANT:
  // Capture phase lets this handler run BEFORE
  // the older Journey menu listeners.
  true
);

// ==========================================================
// FORGE EXPORT CURRENT ORGANIZATION TO CSV
// ==========================================================

document
  .getElementById("exportForgeBtn")
  ?.addEventListener("click", () => {

    const organizationName =
      currentOrganization?.name ||
      "FORGE Organization";

    if (!allAgents.length) {
      alert("There are no agents to export.");
      return;
    }

    // -------------------------------------------------------
    // CSV HEADERS
    // -------------------------------------------------------

    const headers = [
      "Agent Code",
      "Full Name",
      "Email",
      "Phone",
      "Recruit Date",
      "Upline Name",
      "Upline Code",
      "Team Status",
      "Journey Stage",
      "Resident State",
      "Resident License",
      "E&O",
      "AML",
      "Tevah Platform Fee",
      "NPN",
      "Import Source"
    ];


    // -------------------------------------------------------
    // SAFE CSV VALUE
    // Handles commas, quotes and line breaks correctly
    // -------------------------------------------------------

    function csvValue(value) {

      const text =
        String(value ?? "");

      return `"${text.replace(/"/g, '""')}"`;
    }


    // -------------------------------------------------------
    // BUILD ROWS
    // -------------------------------------------------------

    const rows =
      allAgents.map((agent) => [

        agent.code || "",
        agent.name || "",
        agent.email || "",
        agent.phone || "",
        agent.recruitDate || "",

        agent.upline || "",
        agent.uplineCode || "",

        agent.teamStatus || "",
        agent.stage || "",

        agent.residentState || "",
        agent.residentLicense || "",

        agent.eoStatus || "",
        agent.amlStatus || "",
        agent.tevahPlatformFee || "",

        agent.npn || "",
        agent.importSource || ""

      ]);


    // -------------------------------------------------------
    // CREATE CSV CONTENT
    // -------------------------------------------------------

    const csv =
      [
        headers.map(csvValue).join(","),
        ...rows.map(
          (row) =>
            row.map(csvValue).join(",")
        )
      ].join("\r\n");


    // -------------------------------------------------------
    // UTF-8 BOM
    // Makes Excel display names/symbols correctly
    // -------------------------------------------------------

    const blob =
      new Blob(
        ["\uFEFF" + csv],
        {
          type:
            "text/csv;charset=utf-8;"
        }
      );


    // -------------------------------------------------------
    // CREATE FILE NAME
    // Example:
    // Apex-Wealth-Building-FORGE-2026-08-20.csv
    // -------------------------------------------------------

    const safeOrganizationName =
      organizationName
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "");

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const fileName =
      `${safeOrganizationName}-FORGE-${today}.csv`;


    // -------------------------------------------------------
    // DOWNLOAD
    // -------------------------------------------------------

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);


    console.log(
      "FORGE export complete:",
      fileName,
      allAgents.length,
      "agents"
    );

  });

// ==========================================================
// FORGE TEAM MAP
// Organization-aware team hierarchy
// ==========================================================

// ==========================================================
// TEAM MAP STATE
// ==========================================================

let teamMapMembers = [];

let teamMapRootCode = "";

let teamMapFocusCode = "";

let teamMapCollapsed =
  new Set();

let teamMapDirectOnlyMode =
  false;

let teamMapViewMode =
  "tree";

let teamMapZoom =
  1;
// ----------------------------------------------------------
// NORMALIZE FORGE AGENTS FOR TEAM MAP
// ----------------------------------------------------------

function getTeamMapMembers() {

  const people = allAgents.map((agent) => ({
    id: agent.id || agent.code || agent.email || agent.name,

    code:
      String(
        agent.code ||
        agent.agent_code ||
        ""
      ).trim(),

    name:
      String(
        agent.name ||
        agent.full_name ||
        ""
      ).trim(),

    email:
      String(
        agent.email ||
        ""
      ).trim().toLowerCase(),

    phone:
      String(
        agent.phone ||
        ""
      ).trim(),

    uplineCode:
      String(
        agent.uplineCode ||
        agent.upline_code ||
        ""
      ).trim(),

    uplineName:
      String(
        agent.upline ||
        agent.uplineName ||
        agent.upline_name ||
        ""
      ).trim(),

    recruitDate:
      agent.recruitDate ||
      agent.recruit_date ||
      "",

    status:
      agent.teamStatus ||
      agent.team_status ||
      "",

    stage:
      agent.stage ||
      "Not Placed",

    isOrganizationRoot: false
  }));


  // ========================================================
  // ORGANIZATION TOP LEADER
  // ========================================================

  const topLeaderName =
    String(
      currentOrganization?.top_leader_name ||
      ""
    ).trim();

  const topLeaderEmail =
    String(
      currentOrganization?.top_leader_email ||
      ""
    )
      .trim()
      .toLowerCase();

  const topLeaderCode =
    String(
      currentOrganization?.top_leader_agent_code ||
      ""
    ).trim();


  let existingLeader = null;


  // ========================================================
  // 1. MATCH BY ACTUAL AGENT CODE
  // ========================================================

  if (topLeaderCode) {

    existingLeader =
      people.find(
        member =>
          normalizeTeamMapCode(
            member.code
          ) ===
          normalizeTeamMapCode(
            topLeaderCode
          )
      );
  }


  // ========================================================
  // 2. MATCH BY EMAIL
  // ========================================================

  if (
    !existingLeader &&
    topLeaderEmail
  ) {

    existingLeader =
      people.find(
        member =>
          String(member.email || "")
            .trim()
            .toLowerCase() ===
          topLeaderEmail
      );
  }


  // ========================================================
  // 3. MATCH BY NORMALIZED NAME
  // ========================================================

  if (
    !existingLeader &&
    topLeaderName
  ) {

    existingLeader =
      people.find(
        member =>
          normalizeTeamMapName(
            member.name
          ) ===
          normalizeTeamMapName(
            topLeaderName
          )
      );
  }


  // ========================================================
  // REAL FORGE AGENT FOUND
  // ========================================================

  if (existingLeader) {

    existingLeader.isOrganizationRoot =
      true;

  }


  // ========================================================
  // NO AGENT RECORD — CREATE VIRTUAL ROOT
  // ========================================================

  else if (topLeaderName) {

    people.push({

      id:
        `ORG_ROOT_${
          currentOrganization?.id ||
          "UNKNOWN"
        }`,

      code:
        topLeaderCode ||
        `ORGROOT-${
          currentOrganization?.id ||
          "ROOT"
        }`,

      name:
        topLeaderName,

      email:
        topLeaderEmail,

      phone: "",

      uplineCode: "",
      uplineName: "",

      recruitDate: "",

      status:
        "Organization Leader",

      stage: "",

      isOrganizationRoot:
        true
    });
  }


  return people;
}
// ----------------------------------------------------------
// CHILDREN
// ----------------------------------------------------------

function normalizeTeamMapCode(value) {

  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}


function normalizeTeamMapName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}


function findTeamMapParent(member) {

  if (!member) {
    return null;
  }


  if (member.isOrganizationRoot) {
    return null;
  }


  // ======================================================
  // 1. MATCH UPLINE CODE
  // ======================================================

  const uplineCode =
    normalizeTeamMapCode(
      member.uplineCode
    );


  if (uplineCode) {

    const byCode =
      teamMapMembers.find(
        person =>
          normalizeTeamMapCode(
            person.code
          ) ===
          uplineCode
      );


    if (byCode) {
      return byCode;
    }
  }


  // ======================================================
  // 2. MATCH UPLINE NAME
  // ======================================================

  const uplineName =
    normalizeTeamMapName(
      member.uplineName
    );


  if (uplineName) {

    const byName =
      teamMapMembers.find(
        person =>
          normalizeTeamMapName(
            person.name
          ) ===
          uplineName
      );


    if (byName) {
      return byName;
    }
  }


  return null;
}

function teamMapChildren(code) {

  const normalizedCode =
    normalizeTeamMapCode(code);


  return teamMapMembers.filter(
    (member) => {

      const parent =
        findTeamMapParent(member);

      if (!parent) {
        return false;
      }

      return (
        normalizeTeamMapCode(
          parent.code
        ) === normalizedCode
      );
    }
  );
}
// ==========================================================
// TEAM MAP SMART SORT
// Leaders first -> members second
// ==========================================================

function sortTeamMapMembersForDisplay(members = []) {

  return [...members].sort((a, b) => {

    const aDirect =
      teamMapChildren(a.code).length;

    const bDirect =
      teamMapChildren(b.code).length;


    const aLeader =
      aDirect > 0;

    const bLeader =
      bDirect > 0;


    // Leaders always go left.
    if (aLeader !== bLeader) {

      return aLeader
        ? -1
        : 1;
    }


    // Bigger leaders first.
    if (aLeader && bLeader) {

      if (bDirect !== aDirect) {

        return bDirect - aDirect;
      }


      const aDownline =
        teamMapDescendantCount(a.code);

      const bDownline =
        teamMapDescendantCount(b.code);


      if (bDownline !== aDownline) {

        return bDownline - aDownline;
      }

    }


    return String(a.name || "")
      .localeCompare(
        String(b.name || "")
      );

  });

}

// ==========================================================
// HIERARCHY COLOR
// ==========================================================

function getTeamMapHierarchyClass(level = 0) {

  if (level <= 0) {
    return "tm-level-root";
  }

  const normalizedLevel =
    ((level - 1) % 6) + 1;

  return `tm-level-${normalizedLevel}`;
}

// ----------------------------------------------------------
// ROOT
// ----------------------------------------------------------

function findTeamMapRoot() {

  if (!teamMapMembers.length) {
    return null;
  }


  // ======================================================
  // ORGANIZATION'S DESIGNATED TOP LEADER
  // ======================================================

  const designatedRoot =
    teamMapMembers.find(
      member =>
        member.isOrganizationRoot
    );


  if (designatedRoot) {
    return designatedRoot;
  }


  // ======================================================
  // FALLBACK FOR OLD ORGANIZATIONS
  // ======================================================

  const possibleRoots =
    teamMapMembers.filter(
      member =>
        !findTeamMapParent(member)
    );


  if (!possibleRoots.length) {
    return null;
  }


  return possibleRoots.sort(
    (a, b) =>
      teamMapDescendantCount(
        b.code
      ) -
      teamMapDescendantCount(
        a.code
      )
  )[0];
}
// ----------------------------------------------------------
// DESCENDANT COUNT
// ----------------------------------------------------------

function teamMapDescendantCount(
  code,
  visited = new Set()
) {

  if (visited.has(code)) {
    return 0;
  }

  visited.add(code);

  return teamMapChildren(code)
    .reduce(
      (total, child) =>
        total +
        1 +
        teamMapDescendantCount(
          child.code,
          visited
        ),
      0
    );
}


// ----------------------------------------------------------
// DEPTH
// ----------------------------------------------------------

function teamMapDepth(
  code,
  visited = new Set()
) {

  if (visited.has(code)) {
    return 0;
  }

  visited.add(code);

  const children =
    teamMapChildren(code);

  if (!children.length) {
    return 1;
  }

  return (
    1 +
    Math.max(
      ...children.map(
        (child) =>
          teamMapDepth(
            child.code,
            new Set(visited)
          )
      )
    )
  );
}


// ----------------------------------------------------------
// LEADERS
// ----------------------------------------------------------

function getTeamMapLeaders() {

  return teamMapMembers
    .filter(
      (member) =>
        teamMapChildren(
          member.code
        ).length > 0
    )
    .sort(
      (a, b) =>
        teamMapDescendantCount(
          b.code
        ) -
        teamMapDescendantCount(
          a.code
        )
    );
}


// ----------------------------------------------------------
// INITIALS
// ----------------------------------------------------------

function teamMapInitials(name) {

  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part.charAt(0).toUpperCase()
    )
    .join("");
}


// ----------------------------------------------------------
// ESCAPE HTML
// ----------------------------------------------------------

function teamMapEscape(value) {

  return String(value ?? "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


// ----------------------------------------------------------
// NODE
// ----------------------------------------------------------

// ==========================================================
// BUILD FORGE TEAM MAP NODE
// Click card = expand / collapse branch
// ==========================================================

function buildTeamMapNode(
  member,
  level = 0,
  visited = new Set()
) {

  if (!member) return "";


  const code =
    normalizeTeamMapCode(
      member.code
    );


  if (
    !code ||
    visited.has(code)
  ) {
    return "";
  }


  const nextVisited =
    new Set(visited);

  nextVisited.add(code);


  const children =
    sortTeamMapMembersForDisplay(
      teamMapChildren(member.code)
    );


  const directCount =
    children.length;


  const hasDirects =
    directCount > 0;


  const isCollapsed =
    teamMapCollapsed.has(code);


  const isRoot =
    level === 0;


  const hierarchyClass =
    getTeamMapHierarchyClass(
      level
    );


  const initials =
    String(member.name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word =>
        word.charAt(0)
      )
      .join("")
      .toUpperCase();


  return `

    <div
      class="
        team-map-branch
        ${hierarchyClass}
      "
      data-team-map-branch-code="${teamMapEscape(
        member.code
      )}"
    >

      <article
        class="
          team-map-node
          ${hierarchyClass}
          ${isRoot ? "is-root" : ""}
          ${hasDirects ? "has-directs" : "no-directs"}
          ${isCollapsed ? "is-collapsed" : "is-expanded"}
        "

        data-team-map-code="${teamMapEscape(
          member.code
        )}"

        ${
          hasDirects
            ? `data-team-map-toggle="${teamMapEscape(
                member.code
              )}"`
            : ""
        }

        ${
          hasDirects
            ? `role="button" tabindex="0"`
            : ""
        }
      >

        <div class="team-map-avatar">
          ${teamMapEscape(
            initials
          )}
        </div>


        <div class="team-map-node-copy">

          <strong>
            ${teamMapEscape(
              member.name || "Unknown"
            )}
          </strong>

          <span>
            ${teamMapEscape(
              member.code || "—"
            )}
          </span>

        </div>


        ${
          hasDirects
            ? `
              <div class="team-map-node-count">

                ${directCount}

                <small>
                  direct
                </small>

              </div>
            `
            : ""
        }


        ${
          !isRoot
            ? `
              <span
                class="
                  team-map-branch-dot
                  ${hasDirects ? "expandable" : "terminal"}
                "
              >

                ${
                  hasDirects
                    ? (
                        isCollapsed
                          ? "+"
                          : "−"
                      )
                    : ""
                }

              </span>
            `
            : ""
        }

      </article>


      ${
        hasDirects &&
        !isCollapsed

          ? `

            <div
              class="
                team-map-children
                team-map-level-${level + 1}
              "
            >

              ${children
                .map(
                  child =>
                    buildTeamMapNode(
                      child,
                      level + 1,
                      nextVisited
                    )
                )
                .join("")}

            </div>

          `

          : ""
      }

    </div>

  `;
}

// ==========================================================
// TEAM MAP NODE COLLAPSE / EXPAND
// ==========================================================

document.addEventListener(
  "click",
  event => {

    const card =
      event.target.closest(
        ".team-map-node[data-team-map-toggle]"
      );

    if (!card) return;

    event.preventDefault();
    event.stopPropagation();

    const code =
      normalizeTeamMapCode(
        card.dataset.teamMapToggle
      );

    if (!code) return;

    if (
      teamMapCollapsed.has(code)
    ) {
      teamMapCollapsed.delete(code);
    } else {
      teamMapCollapsed.add(code);
    }

    drawTeamMap();
  }
);
// ==========================================================
// KEYBOARD SUPPORT
// ==========================================================

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {
      return;
    }


    const card =
      event.target.closest(
        ".team-map-node[data-team-map-toggle]"
      );


    if (!card) return;


    event.preventDefault();

    card.click();

  }
);
// ==========================================================
// EXPAND / COLLAPSE TEAM BRANCH
// ==========================================================

document.addEventListener(
  "click",
  event => {

    const toggle =
      event.target.closest(
        "[data-team-map-toggle]"
      );

    if (!toggle) return;


    event.preventDefault();
    event.stopPropagation();


    const code =
      normalizeTeamMapCode(
        toggle.dataset.teamMapToggle
      );


    if (!code) return;


    if (
      teamMapCollapsed.has(code)
    ) {

      // EXPAND this branch
      teamMapCollapsed.delete(code);

    } else {

      // COLLAPSE this branch
      teamMapCollapsed.add(code);

    }


    teamMapDirectOnlyMode =
      false;


    drawTeamMap();

  }
);

document
  .getElementById(
    "teamMapDirectOnly"
  )
  ?.addEventListener(
    "click",
    () => {

      const rootCode =
        normalizeTeamMapCode(
          teamMapFocusCode ||
          teamMapRootCode
        );


      teamMapCollapsed =
        new Set(
          teamMapMembers
            .filter(
              member =>
                teamMapChildren(
                  member.code
                ).length > 0
            )
            .map(
              member =>
                normalizeTeamMapCode(
                  member.code
                )
            )
        );


      // Selected root remains expanded.
      teamMapCollapsed.delete(
        rootCode
      );


      teamMapDirectOnlyMode =
        true;


      drawTeamMap();

    }
  );

document
  .getElementById(
    "teamMapFullTree"
  )
  ?.addEventListener(
    "click",
    () => {

      // Open everything underneath current leader.
      teamMapCollapsed.clear();

      teamMapDirectOnlyMode =
        false;

      drawTeamMap();

    }
  );

// ----------------------------------------------------------
// LEADER SELECT
// ----------------------------------------------------------

function renderTeamMapLeaderSelect() {

  const select =
    document.getElementById(
      "teamMapLeaderSelect"
    );

  if (!select) {
    return;
  }


  const leaders =
    getTeamMapLeaders();


  select.innerHTML = `

    <option value="">
      Entire Organization
    </option>

    ${leaders
      .map(
        (leader) => `

          <option
            value="${teamMapEscape(
              leader.code
            )}"
          >
            ${teamMapEscape(
              leader.name
            )}
            (${teamMapDescendantCount(
              leader.code
            )})
          </option>

        `
      )
      .join("")}

  `;


  select.value =
    teamMapFocusCode ===
    teamMapRootCode
      ? ""
      : teamMapFocusCode;
}


// ----------------------------------------------------------
// STATS
// ----------------------------------------------------------

function updateTeamMapStats() {

  const root =
    teamMapMembers.find(
      (member) =>
        member.code ===
        teamMapRootCode
    );


  const leaders =
    getTeamMapLeaders();


  const direct =
    root
      ? teamMapChildren(
          root.code
        ).length
      : 0;


  const levels =
    root
      ? teamMapDepth(
          root.code
        )
      : 0;


  const setText =
    (id, value) => {

      const element =
        document.getElementById(id);

      if (element) {
        element.textContent =
          value;
      }
    };


  setText(
    "teamMapTotal",
    teamMapMembers.length
  );

  setText(
    "teamMapLeaders",
    leaders.length
  );

  setText(
    "teamMapDirect",
    direct
  );

  setText(
    "teamMapLevels",
    levels
  );

  setText(
    "teamMapMemberCount",
    `${teamMapMembers.length} team member${
      teamMapMembers.length === 1
        ? ""
        : "s"
    }`
  );


  setText(
    "teamMapOrgName",
    currentOrganization?.name ||
    "Your Organization"
  );
}


// ----------------------------------------------------------
// DRAW MAP
// ----------------------------------------------------------

function drawTeamMap() {

  const tree =
    document.getElementById(
      "teamMapTree"
    );

  if (!tree) {
    return;
  }


  if (!teamMapMembers.length) {

    tree.innerHTML = `

      <div class="team-map-empty">

        <div class="team-map-empty-icon">
          ◇
        </div>

        <h3>
          No team members yet
        </h3>

        <p>
          Import your Tevah Team CSV to build this organization's Team Map.
        </p>

      </div>

    `;

    return;
  }


  const member =
    teamMapMembers.find(
      (person) =>
        person.code ===
        teamMapFocusCode
    ) ||
    teamMapMembers.find(
      (person) =>
        person.code ===
        teamMapRootCode
    );


  if (!member) {
    return;
  }


 tree.innerHTML =
  buildTeamMapNode(
    member,
    0,
    new Set()
  );


const currentView =
  document.getElementById(
    "teamMapCurrentView"
  );


if (currentView) {

  const isTopLeader =
    normalizeTeamMapCode(
      member.code
    ) ===
    normalizeTeamMapCode(
      teamMapRootCode
    );


  currentView.textContent =
    teamMapDirectOnlyMode
      ? `${member.name} · Direct Team`
      : (
          isTopLeader
            ? "Entire Organization"
            : `${member.name}'s Team`
        );
}


const updated =
  document.getElementById(
    "teamMapUpdated"
  );


if (updated) {

  updated.textContent =
    "Updated " +
    new Date().toLocaleTimeString(
      [],
      {
        hour: "numeric",
        minute: "2-digit"
      }
    );
}

}



// ----------------------------------------------------------
// MAIN TEAM MAP RENDER
// ----------------------------------------------------------

function renderTeamMap() {

  teamMapMembers =
    getTeamMapMembers();


  teamMapMembers.sort(
    (a, b) =>
      a.name.localeCompare(
        b.name
      )
  );


  const root =
    findTeamMapRoot();


  if (!root) {

  teamMapRootCode = "";
  teamMapFocusCode = "";

  updateTeamMapStats();

  const tree =
    document.getElementById(
      "teamMapTree"
    );

  if (tree) {
    tree.innerHTML = `
      <div class="team-map-empty">
        <div class="team-map-empty-icon">
          !
        </div>

        <h3>
          Team hierarchy needs attention
        </h3>

        <p>
          FORGE found team members, but could not identify
          the organization's true top leader.
        </p>
      </div>
    `;
  }

  return;
}


  teamMapRootCode =
    root.code;


  if (
    !teamMapFocusCode ||
    !teamMapMembers.some(
      (member) =>
        member.code ===
        teamMapFocusCode
    )
  ) {

    teamMapFocusCode =
      teamMapRootCode;
  }


  updateTeamMapStats();

  renderTeamMapLeaderSelect();

  drawTeamMap();
  renderTeamIntelligence();
}


// ----------------------------------------------------------
// TEAM MAP CLICK EVENTS
// ----------------------------------------------------------

document.addEventListener(
  "click",
  (event) => {

    const collapseButton =
      event.target.closest(
        "[data-team-collapse-code]"
      );


    if (collapseButton) {

      event.stopPropagation();

      const code =
        collapseButton.dataset
          .teamCollapseCode;


      if (
        teamMapCollapsed.has(
          code
        )
      ) {

        teamMapCollapsed.delete(
          code
        );

      } else {

        teamMapCollapsed.add(
          code
        );
      }


      drawTeamMap();

      return;
    }


    const memberButton =
      event.target.closest(
        "[data-team-member-code]"
      );

  }
);


// ----------------------------------------------------------
// LEADER SELECT
// ----------------------------------------------------------

document
  .getElementById(
    "teamMapLeaderSelect"
  )
  ?.addEventListener(
    "change",
    (event) => {

      const selectedCode =
        event.target.value;


      // ENTIRE ORGANIZATION
      if (!selectedCode) {

        teamMapFocusCode =
          teamMapRootCode;

        teamMapCollapsed.clear();

        drawTeamMap();

        return;
      }


      // ==========================================
      // SELECTED TEAM ONLY
      // ==========================================

      teamMapFocusCode =
        selectedCode;


      // Start the selected team clean.
      teamMapCollapsed.clear();


      // Collapse deeper leaders initially,
      // but keep the selected leader open.
      teamMapMembers
        .forEach(
          (member) => {

            if (
              member.code ===
              selectedCode
            ) {
              return;
            }


            if (
              teamMapChildren(
                member.code
              ).length > 0
            ) {

              teamMapCollapsed.add(
                member.code
              );
            }

          }
        );


      drawTeamMap();


      setTimeout(
        () => {

          const viewport =
            document.getElementById(
              "teamMapViewport"
            );


          viewport?.scrollTo({
            top: 0,
            left:
              Math.max(
                0,
                (
                  viewport.scrollWidth -
                  viewport.clientWidth
                ) / 2
              ),
            behavior: "smooth"
          });

        },
        50
      );
    }
  );


// ----------------------------------------------------------
// TOP LEADER
// ----------------------------------------------------------

document
  .getElementById(
    "teamMapResetBtn"
  )
  ?.addEventListener(
    "click",
    () => {

      teamMapFocusCode =
        teamMapRootCode;


      teamMapDirectOnlyMode =
        false;


      teamMapCollapsed.clear();


      const selector =
        document.getElementById(
          "teamMapLeaderSelect"
        );


      if (selector) {

        selector.value = "";
      }


      drawTeamMap();


      setTimeout(
        () => {

          fitTeamMapToScreen();

        },
        80
      );

    }
  );


// ----------------------------------------------------------
// SEARCH
// ----------------------------------------------------------

document
  .getElementById(
    "teamMapSearch"
  )
  ?.addEventListener(
    "input",
    (event) => {

      const value =
        String(
          event.target.value ||
          ""
        )
          .trim()
          .toLowerCase();


      if (!value) {
        return;
      }


      const match =
        teamMapMembers.find(
          (member) =>

            member.name
              .toLowerCase()
              .includes(value) ||

            member.code
              .toLowerCase()
              .includes(value) ||

            member.email
              .toLowerCase()
              .includes(value)
        );


      if (!match) {
        return;
      }


      teamMapFocusCode =
        match.code;


      renderTeamMapLeaderSelect();

      drawTeamMap();

    }
  );

// ==========================================================
// TEAM MAP VIEW CONTROLS
// ==========================================================

const TEAM_MAP_MIN_ZOOM = 0.65;
const TEAM_MAP_MAX_ZOOM = 1.6;
const TEAM_MAP_ZOOM_STEP = 0.1;


function applyTeamMapZoom() {

  const layer =
    document.getElementById(
      "teamMapZoomLayer"
    );

  if (!layer) return;

  layer.style.transform =
    `scale(${teamMapZoom})`;

  layer.style.transformOrigin =
    "top center";
}


function setTeamMapZoom(value) {

  teamMapZoom =
    Math.min(
      TEAM_MAP_MAX_ZOOM,
      Math.max(
        TEAM_MAP_MIN_ZOOM,
        value
      )
    );

  applyTeamMapZoom();
}


document
  .getElementById("teamMapZoomIn")
  ?.addEventListener(
    "click",
    () => {

      setTeamMapZoom(
        teamMapZoom +
        TEAM_MAP_ZOOM_STEP
      );

    }
  );


document
  .getElementById("teamMapZoomOut")
  ?.addEventListener(
    "click",
    () => {

      setTeamMapZoom(
        teamMapZoom -
        TEAM_MAP_ZOOM_STEP
      );

    }
  );
// ==========================================================
// COLLAPSE / EXPAND ENTIRE TEAM MAP
// ==========================================================

function collapseEntireTeamMap() {

  const rootCode =
    normalizeTeamMapCode(
      teamMapFocusCode ||
      teamMapRootCode
    );

  if (!rootCode) return;

  // Collapse the visible upline/root itself.
  // buildTeamMapNode() will stop rendering all children,
  // so only the upline remains visible.
  teamMapCollapsed.clear();
  teamMapCollapsed.add(rootCode);

  teamMapDirectOnlyMode = false;

  drawTeamMap();
  updateTeamMapCollapseButton();

  setTimeout(
    fitTeamMapToScreen,
    50
  );
}

function expandEntireTeamMap() {

  teamMapCollapsed.clear();

  drawTeamMap();
  updateTeamMapCollapseButton();

  setTimeout(
    fitTeamMapToScreen,
    50
  );
}


function updateTeamMapCollapseButton() {

  const button =
    document.getElementById(
      "teamMapCollapseAll"
    );

  if (!button) return;

  button.textContent =
    "Collapse All";
}

// ==========================================================
// FIT TO SCREEN
// ==========================================================

function fitTeamMapToScreen() {

  const viewport =
    document.getElementById(
      "teamMapViewport"
    );

  const tree =
    document.getElementById(
      "teamMapTree"
    );

  if (!viewport || !tree) {
    return;
  }


  // Reset before measuring
  teamMapZoom = 1;
  applyTeamMapZoom();


  requestAnimationFrame(() => {

    const availableWidth =
      viewport.clientWidth - 30;

    const treeWidth =
      tree.scrollWidth;


    if (
      treeWidth >
      availableWidth
    ) {

      const calculatedZoom =
        availableWidth /
        treeWidth;

      setTeamMapZoom(
        Math.max(
          TEAM_MAP_MIN_ZOOM,
          Math.min(
            1.05,
            calculatedZoom
          )
        )
      );

    } else {

      setTeamMapZoom(1);

    }


    viewport.scrollTo({
      left:
        Math.max(
          0,
          (
            viewport.scrollWidth -
            viewport.clientWidth
          ) / 2
        ),

      top: 0,

      behavior: "smooth"
    });

  });
}


document
  .getElementById("teamMapFit")
  ?.addEventListener(
    "click",
    fitTeamMapToScreen
  );

document
  .getElementById(
    "teamMapCollapseAll"
  )
  ?.addEventListener(
    "click",
    () => {

      if (
        teamMapCollapsed.size > 0
      ) {
        expandEntireTeamMap();
      } else {
        collapseEntireTeamMap();
      }

    }
  );

// ==========================================================
// FORGE PREMIUM TEAM MAP FULLSCREEN
// ==========================================================

let teamMapStageZoom = 1;


// ----------------------------------------------------------
// COPY CURRENT MAP INTO FULLSCREEN
// ----------------------------------------------------------

function renderTeamMapStage() {

  const source =
    document.getElementById(
      "teamMapTree"
    );

  const canvas =
    document.getElementById(
      "teamMapStageCanvas"
    );

  if (!source || !canvas) {
    return false;
  }


  canvas.innerHTML =
    source.innerHTML;


  canvas.style.transform =
    `scale(${teamMapStageZoom})`;

  return true;
}


// ----------------------------------------------------------
// OPEN FULLSCREEN
// ----------------------------------------------------------

function openTeamMapStage() {

  const stage =
    document.getElementById(
      "teamMapStage"
    );

  if (!stage) return;


  teamMapStageZoom = 1;


  if (!renderTeamMapStage()) {
    return;
  }


  const currentRoot =
    teamMapMembers.find(
      member =>
        normalizeTeamMapCode(
          member.code
        ) ===
        normalizeTeamMapCode(
          teamMapFocusCode ||
          teamMapRootCode
        )
    );


  const title =
    document.getElementById(
      "teamMapStageTitle"
    );


  if (title) {

    title.textContent =
      currentRoot?.name ||
      "Team Map";

  }


  stage.classList.add(
    "active"
  );

  stage.setAttribute(
    "aria-hidden",
    "false"
  );


  document.body.style.overflow =
    "hidden";


  setTimeout(() => {

    centerTeamMapStage();

  }, 80);
}


// ----------------------------------------------------------
// CLOSE
// ----------------------------------------------------------

function closeTeamMapStage() {

  const stage =
    document.getElementById(
      "teamMapStage"
    );

  stage?.classList.remove(
    "active"
  );

  stage?.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.style.overflow =
    "";
}


// ----------------------------------------------------------
// CENTER
// ----------------------------------------------------------

function centerTeamMapStage() {

  const viewport =
    document.getElementById(
      "teamMapStageViewport"
    );

  if (!viewport) return;


  viewport.scrollLeft =
    Math.max(
      0,
      (
        viewport.scrollWidth -
        viewport.clientWidth
      ) / 2
    );


  viewport.scrollTop = 0;
}


// ----------------------------------------------------------
// FIT
// ----------------------------------------------------------

function fitTeamMapStage() {

  const viewport =
    document.getElementById(
      "teamMapStageViewport"
    );

  const tree =
    document.querySelector(
      "#teamMapStageCanvas .team-map-tree"
    );


  if (!viewport || !tree) return;


  // IMPORTANT:
  // Never make cards microscopic.
  const available =
    viewport.clientWidth - 120;


  const naturalWidth =
    tree.scrollWidth ||
    tree.offsetWidth ||
    1200;


  teamMapStageZoom =
    Math.max(
      0.62,
      Math.min(
        1,
        available /
        naturalWidth
      )
    );


  const canvas =
    document.getElementById(
      "teamMapStageCanvas"
    );


  if (canvas) {

    canvas.style.transform =
      `scale(${teamMapStageZoom})`;

  }


  setTimeout(
    centerTeamMapStage,
    30
  );
}


// ----------------------------------------------------------
// EVENTS
// ----------------------------------------------------------

document
  .getElementById(
    "teamMapOpenStage"
  )
  ?.addEventListener(
    "click",
    openTeamMapStage
  );


document
  .getElementById(
    "teamMapStageExit"
  )
  ?.addEventListener(
    "click",
    closeTeamMapStage
  );


document
  .getElementById(
    "teamMapStageFit"
  )
  ?.addEventListener(
    "click",
    fitTeamMapStage
  );


document
  .getElementById(
    "teamMapStageZoomIn"
  )
  ?.addEventListener(
    "click",
    () => {

      teamMapStageZoom =
        Math.min(
          1.6,
          teamMapStageZoom + 0.1
        );


      const canvas =
        document.getElementById(
          "teamMapStageCanvas"
        );


      if (canvas) {

        canvas.style.transform =
          `scale(${teamMapStageZoom})`;

      }

    }
  );


document
  .getElementById(
    "teamMapStageZoomOut"
  )
  ?.addEventListener(
    "click",
    () => {

      teamMapStageZoom =
        Math.max(
          0.5,
          teamMapStageZoom - 0.1
        );


      const canvas =
        document.getElementById(
          "teamMapStageCanvas"
        );


      if (canvas) {

        canvas.style.transform =
          `scale(${teamMapStageZoom})`;

      }

    }
  );


document.addEventListener(
  "keydown",
  event => {

    if (event.key === "Escape") {
      closeTeamMapStage();
    }

  }
);


// Fit
document
  .getElementById(
    "teamMapStageFit"
  )
  ?.addEventListener(
    "click",
    fitTeamMapStage
  );


// Zoom in
document
  .getElementById(
    "teamMapStageZoomIn"
  )
  ?.addEventListener(
    "click",
    () => {

      teamMapStageZoom =
        Math.min(
          1.8,
          teamMapStageZoom +
          .1
        );


      applyTeamMapStageZoom();
    }
  );


// Zoom out
document
  .getElementById(
    "teamMapStageZoomOut"
  )
  ?.addEventListener(
    "click",
    () => {

      teamMapStageZoom =
        Math.max(
          .35,
          teamMapStageZoom -
          .1
        );


      applyTeamMapStageZoom();
    }
  );




// ==========================================================
// REFRESH
// ==========================================================

document
  .getElementById(
    "teamMapRefreshBtn"
  )
  ?.addEventListener(
    "click",
    async () => {

      await loadCSV();

      teamMapCollapsed.clear();

      renderTeamMap();

      setTimeout(
        fitTeamMapToScreen,
        100
      );

    }
  );


// ==========================================================
// TREE / COMPACT / LIST MODES
// ==========================================================

document.addEventListener(
  "click",
  (event) => {

    const button =
      event.target.closest(
        ".team-map-view-btn"
      );

    if (!button) return;


    document
      .querySelectorAll(
        ".team-map-view-btn"
      )
      .forEach(
        item =>
          item.classList.remove(
            "active"
          )
      );


    button.classList.add(
      "active"
    );


    const view =
      button.dataset.teamMapView;


    const viewport =
      document.getElementById(
        "teamMapViewport"
      );


    viewport?.classList.remove(
      "team-map-view-tree",
      "team-map-view-compact",
      "team-map-view-list"
    );


    viewport?.classList.add(
      `team-map-view-${view}`
    );


    if (view === "tree") {

      setTeamMapZoom(1);

      drawTeamMap();

    }


    if (view === "compact") {

      teamMapCollapsed.clear();

      drawTeamMap();

      setTimeout(
        () =>
          setTeamMapZoom(
            0.75
          ),
        30
      );

    }


    if (view === "list") {

      renderTeamMapList();

    }

  }
);


// ==========================================================
// LIST VIEW
// ==========================================================

function renderTeamMapList() {

  const tree =
    document.getElementById(
      "teamMapTree"
    );

  if (!tree) return;


  const sorted =
    [...teamMapMembers]
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );


  tree.innerHTML = `

    <div class="team-map-list">

      ${sorted
        .map(
          member => {

            const parent =
              findTeamMapParent(
                member
              );


            return `

              <button
                type="button"
                class="team-map-list-row"
                data-team-member-code="${teamMapEscape(
                  member.code
                )}"
              >

                <div class="team-map-avatar">
                  ${teamMapInitials(
                    member.name
                  )}
                </div>


                <div class="team-map-list-name">

                  <strong>
                    ${teamMapEscape(
                      member.name
                    )}
                  </strong>

                  <span>
                    ${teamMapEscape(
                      member.code
                    )}
                  </span>

                </div>


                <div class="team-map-list-upline">

                  <span>Reports to</span>

                  <strong>
                    ${
                      member.isOrganizationRoot
                        ? "Top Leader"
                        : teamMapEscape(
                            parent?.name ||
                            member.uplineName ||
                            "—"
                          )
                    }
                  </strong>

                </div>


                <div class="team-map-list-team">

                  <strong>
                    ${teamMapDescendantCount(
                      member.code
                    )}
                  </strong>

                  <span>
                    downline
                  </span>

                </div>

              </button>

            `;

          }
        )
        .join("")}

    </div>

  `;

}

// ==========================================================
// TEAM MAP AGENT QUICK PANEL
// ==========================================================

let teamMapDrawerAgent = null;

// ==========================================================
// FIND REAL FORGE AGENT
// ==========================================================

function getForgeAgentFromTeamMapMember(member) {

  if (!member) {
    return null;
  }

  // 1. MATCH DATABASE ID
  let agent = allAgents.find(
    (item) =>
      String(item.id) ===
      String(member.id)
  );

  if (agent) {
    return agent;
  }


  // 2. MATCH AGENT CODE
  if (member.code) {

    agent = allAgents.find(
      (item) =>
        normalizeTeamMapCode(item.code) ===
        normalizeTeamMapCode(member.code)
    );

    if (agent) {
      return agent;
    }
  }


  // 3. MATCH EMAIL
  if (member.email) {

    const memberEmail =
      String(member.email)
        .trim()
        .toLowerCase();

    agent = allAgents.find(
      (item) =>
        String(item.email || "")
          .trim()
          .toLowerCase() ===
        memberEmail
    );

    if (agent) {
      return agent;
    }
  }


  // 4. MATCH NORMALIZED NAME
  if (member.name) {

    const memberName =
      normalizeTeamMapName(
        member.name
      );

    agent = allAgents.find(
      (item) =>
        normalizeTeamMapName(
          item.name
        ) === memberName
    );

    if (agent) {
      return agent;
    }
  }


  return null;
}


// ==========================================================
// DRAWER ACTIVITY
// ==========================================================

function renderTeamMapDrawerActivity(agent) {
  const timeline =
    document.getElementById(
      "tmDrawerActivityTimeline"
    );

  if (!timeline || !agent) return;


  const key =
    agent.code ||
    agent.email ||
    agent.name;


  const entries =
    activityLog?.[key] || [];


  if (!entries.length) {

    timeline.innerHTML = `
      <div class="tm-drawer-no-activity">
        No activity logged yet.
      </div>
    `;

    return;
  }


  timeline.innerHTML =
    entries
      .slice(0, 5)
      .map(
        entry => `

          <div class="tm-drawer-activity">

            <div class="tm-drawer-activity-dot"></div>

            <div>

              <strong>
                ${teamMapEscape(
                  entry.method || "Activity"
                )}
              </strong>

              <p>
                ${teamMapEscape(
                  entry.message || ""
                )}
              </p>

              <small>
                ${teamMapEscape(
                  entry.date || ""
                )}
              </small>

            </div>

          </div>

        `
      )
      .join("");
}


// ----------------------------------------------------------
// OPEN
// ----------------------------------------------------------

function openTeamMapAgentDrawer(member) {

  const agent =
    getForgeAgentFromTeamMapMember(
      member
    );


  // Organization root can still
  // be viewed as team hierarchy,
  // but not edited if it is virtual.
  if (!agent) {

    alert(
      `${member.name} is the organization root and does not have a regular FORGE agent record yet.`
    );

    return;
  }


  teamMapDrawerAgent =
    agent;

  selectedAgent =
    agent;


  const drawer =
    document.getElementById(
      "teamMapAgentDrawer"
    );

  const overlay =
    document.getElementById(
      "teamMapAgentOverlay"
    );


  if (!drawer) return;


  document.getElementById(
    "tmDrawerAvatar"
  ).textContent =
    teamMapInitials(
      agent.name
    );


  document.getElementById(
    "tmDrawerName"
  ).textContent =
    agent.name ||
    "Unnamed Agent";


  document.getElementById(
    "tmDrawerCode"
  ).textContent =
    agent.code ||
    "No agent code";


  document.getElementById(
    "tmDrawerEmail"
  ).textContent =
    agent.email ||
    "Not available";


  document.getElementById(
    "tmDrawerPhone"
  ).textContent =
    agent.phone ||
    "Not available";


  document.getElementById(
    "tmDrawerUpline"
  ).textContent =
    agent.upline ||
    "Top Level";


  const badge =
    document.getElementById(
      "tmDrawerStageBadge"
    );


  if (badge) {

    badge.textContent =
      agent.stage ||
      "Not Placed";

    badge.dataset.stage =
      agent.stage ||
      "Not Placed";
  }


  const stageSelect =
    document.getElementById(
      "tmDrawerStageSelect"
    );


  if (stageSelect) {

    stageSelect.value =
      agent.stage ||
      "Not Placed";
  }


  document.getElementById(
    "tmDrawerActivityNote"
  ).value = "";


  renderTeamMapDrawerActivity(
    agent
  );


  drawer.classList.add(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "false"
  );


  overlay?.classList.remove(
    "hidden"
  );
}


// ----------------------------------------------------------
// CLOSE
// ----------------------------------------------------------

function closeTeamMapAgentDrawer() {

  document
    .getElementById(
      "teamMapAgentDrawer"
    )
    ?.classList.remove(
      "open"
    );


  document
    .getElementById(
      "teamMapAgentDrawer"
    )
    ?.setAttribute(
      "aria-hidden",
      "true"
    );


  document
    .getElementById(
      "teamMapAgentOverlay"
    )
    ?.classList.add(
      "hidden"
    );


  teamMapDrawerAgent =
    null;
}


document
  .getElementById(
    "closeTeamMapAgentDrawer"
  )
  ?.addEventListener(
    "click",
    closeTeamMapAgentDrawer
  );


document
  .getElementById(
    "teamMapAgentOverlay"
  )
  ?.addEventListener(
    "click",
    closeTeamMapAgentDrawer
  );


// ----------------------------------------------------------
// CARD CLICK
// ----------------------------------------------------------

document.addEventListener(
  "click",
  event => {

    const card =
      event.target.closest(
        "[data-team-member-code]"
      );

    if (!card) return;


    // Ignore collapse button.
    if (
      event.target.closest(
        "[data-team-collapse-code]"
      )
    ) {
      return;
    }


    const code =
      card.dataset
        .teamMemberCode;


    const member =
      teamMapMembers.find(
        person =>
          person.code ===
          code
      );


    if (!member) return;


    openTeamMapAgentDrawer(
      member
    );
  }
);


// ----------------------------------------------------------
// CONNECT BUTTONS
// Uses your existing FORGE composer
// ----------------------------------------------------------

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "[data-tm-action]"
      );

    if (!button) return;

    if (!teamMapDrawerAgent) {
      return;
    }


    selectedAgent =
      teamMapDrawerAgent;


    const method =
      button.dataset.tmAction;


    openSmartComposer(
      method
    );
  }
);


// ----------------------------------------------------------
// MOVE STAGE
// ----------------------------------------------------------

document
  .getElementById(
    "tmDrawerMoveStage"
  )
  ?.addEventListener(
    "click",
    async () => {

      if (!teamMapDrawerAgent) {
        return;
      }


      const newStage =
        document
          .getElementById(
            "tmDrawerStageSelect"
          )
          ?.value;


      if (!newStage) return;


      await updateJourneyStage(
        teamMapDrawerAgent,
        newStage
      );


      const badge =
        document.getElementById(
          "tmDrawerStageBadge"
        );


      if (badge) {

        badge.textContent =
          newStage;

        badge.dataset.stage =
          newStage;
      }


      // Refresh Team Map
      await loadCSV();

      renderTeamMap();


      // Reconnect drawer agent
      teamMapDrawerAgent =
        allAgents.find(
          agent =>
            String(agent.id) ===
            String(
              teamMapDrawerAgent.id
            )
        ) ||
        teamMapDrawerAgent;


      selectedAgent =
        teamMapDrawerAgent;
    }
  );

// ==========================================================
// FORGE TEAM MAP — CLEAN FULLSCREEN STAGE
// ==========================================================

let forgeStageZoom = 1;


function renderForgeStage() {

  const source =
    document.getElementById(
      "teamMapTree"
    );

  const canvas =
    document.getElementById(
      "teamMapStageCanvas"
    );


  if (!source || !canvas) {
    return;
  }


  canvas.innerHTML =
    source.innerHTML;


  canvas.style.transform =
    `scale(${forgeStageZoom})`;

  canvas.style.transformOrigin =
    "top center";
}


function applyForgeStageZoom() {

  const canvas =
    document.getElementById(
      "teamMapStageCanvas"
    );


  if (!canvas) return;


  canvas.style.transform =
    `scale(${forgeStageZoom})`;
}


function fitForgeStage() {

  const viewport =
    document.getElementById(
      "teamMapStageViewport"
    );

  const canvas =
    document.getElementById(
      "teamMapStageCanvas"
    );


  if (
    !viewport ||
    !canvas
  ) {
    return;
  }


  forgeStageZoom = 1;

  applyForgeStageZoom();


  requestAnimationFrame(() => {

    const naturalWidth =
      canvas.scrollWidth ||
      canvas.offsetWidth ||
      1200;


    const availableWidth =
      viewport.clientWidth -
      100;


    forgeStageZoom =
      Math.max(
        .5,
        Math.min(
          1.15,
          availableWidth /
          naturalWidth
        )
      );


    applyForgeStageZoom();


    setTimeout(() => {

      viewport.scrollLeft =
        Math.max(
          0,
          (
            viewport.scrollWidth -
            viewport.clientWidth
          ) / 2
        );

      viewport.scrollTop =
        0;

    }, 30);

  });
}


function openForgeStage() {

  const stage =
    document.getElementById(
      "teamMapStage"
    );


  if (!stage) {

    console.error(
      "teamMapStage HTML not found."
    );

    return;
  }


  forgeStageZoom = 1;


  renderForgeStage();


  const title =
    document.getElementById(
      "teamMapStageTitle"
    );


  if (title) {

    title.textContent =
      document
        .getElementById(
          "teamMapCurrentView"
        )
        ?.textContent
        ?.trim() ||

      currentOrganization?.name ||

      "Team Map";
  }


  stage.classList.add(
    "active"
  );


  document.body.style.overflow =
    "hidden";


  setTimeout(
    fitForgeStage,
    80
  );
}


function closeForgeStage() {

  document
    .getElementById(
      "teamMapStage"
    )
    ?.classList.remove(
      "active"
    );


  document.body.style.overflow =
    "";
}


document
  .getElementById(
    "teamMapOpenStage"
  )
  ?.addEventListener(
    "click",
    openForgeStage
  );


document
  .getElementById(
    "teamMapStageExit"
  )
  ?.addEventListener(
    "click",
    closeForgeStage
  );


document
  .getElementById(
    "teamMapStageFit"
  )
  ?.addEventListener(
    "click",
    fitForgeStage
  );


document
  .getElementById(
    "teamMapStageZoomIn"
  )
  ?.addEventListener(
    "click",
    () => {

      forgeStageZoom =
        Math.min(
          1.8,
          forgeStageZoom + .1
        );

      applyForgeStageZoom();
    }
  );


document
  .getElementById(
    "teamMapStageZoomOut"
  )
  ?.addEventListener(
    "click",
    () => {

      forgeStageZoom =
        Math.max(
          .4,
          forgeStageZoom - .1
        );

      applyForgeStageZoom();
    }
  );


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Escape" &&
      document
        .getElementById(
          "teamMapStage"
        )
        ?.classList.contains(
          "active"
        )
    ) {

      closeForgeStage();
    }

  }
);
// ----------------------------------------------------------
// LOG NOTE / ACTIVITY
// ----------------------------------------------------------

document
  .getElementById(
    "tmDrawerLogActivity"
  )
  ?.addEventListener(
    "click",
    () => {

      if (!teamMapDrawerAgent) {
        return;
      }


      const input =
        document.getElementById(
          "tmDrawerActivityNote"
        );


      const note =
        String(
          input?.value ||
          ""
        ).trim();


      if (!note) {
        return;
      }


      logCoordinatorActivity(
        teamMapDrawerAgent,
        "Note",
        note
      );


      if (input) {
        input.value = "";
      }


      renderTeamMapDrawerActivity(
        teamMapDrawerAgent
      );
    }
  );


// ----------------------------------------------------------
// EDIT INFO
// Reuse existing FORGE edit modal
// ----------------------------------------------------------

document
  .getElementById(
    "tmDrawerEditAgent"
  )
  ?.addEventListener(
    "click",
    () => {

      if (!teamMapDrawerAgent) {
        return;
      }


      selectedAgent =
        teamMapDrawerAgent;


      document
        .querySelector(
          ".edit-agent-btn"
        )
        ?.click();
    }
  );


// ----------------------------------------------------------
// FULL PROFILE
// ----------------------------------------------------------

document
  .getElementById(
    "tmDrawerFullProfile"
  )
  ?.addEventListener(
    "click",
    () => {

      if (!teamMapDrawerAgent) {
        return;
      }


      selectedAgent =
        teamMapDrawerAgent;


      closeTeamMapAgentDrawer();


      showPage(
        "Agents"
      );


      setActiveForgeNav?.(
        "Agents"
      );


      renderAgentsPage?.();


      showAgentProfile?.(
        selectedAgent
      );
    }
  );


// ----------------------------------------------------------
// VIEW THIS PERSON'S TEAM
// ----------------------------------------------------------

document
  .getElementById(
    "tmDrawerViewTeam"
  )
  ?.addEventListener(
    "click",
    () => {

      if (!teamMapDrawerAgent) {
        return;
      }


      teamMapFocusCode =
        normalizeTeamMapCode(
          teamMapDrawerAgent.code
        );


      closeTeamMapAgentDrawer();


      renderTeamMapLeaderSelect();

      drawTeamMap();


      document
        .getElementById(
          "teamMapViewport"
        )
        ?.scrollTo({
          top: 0,
          left: 0,
          behavior: "smooth"
        });
    }
  );

// ==========================================================
// FORGE TEAM INTELLIGENCE
// ==========================================================

let teamIntelSortMode =
  "downline";


function getTeamIntelLeaders() {

  return teamMapMembers
    .filter(
      member =>
        teamMapChildren(
          member.code
        ).length > 0
    );
}


// ----------------------------------------------------------
// REAL METRICS
// ----------------------------------------------------------

function getTeamIntelMetrics(
  member
) {

  const direct =
    teamMapChildren(
      member.code
    );


  const downline =
    teamMapDescendantCount(
      member.code
    );


  const depth =
    teamMapDepth(
      member.code
    );


  const directLeaders =
    direct.filter(
      person =>
        teamMapChildren(
          person.code
        ).length > 0
    );


  return {
    direct,
    downline,
    depth,
    directLeaders
  };
}


// ----------------------------------------------------------
// SORT
// ----------------------------------------------------------

function sortTeamIntelLeaders(
  leaders
) {

  return [...leaders]
    .sort(
      (a, b) => {

        const aMetrics =
          getTeamIntelMetrics(a);

        const bMetrics =
          getTeamIntelMetrics(b);


        if (
          teamIntelSortMode ===
          "direct"
        ) {

          return (
            bMetrics.direct.length -
            aMetrics.direct.length
          );
        }


        if (
          teamIntelSortMode ===
          "depth"
        ) {

          return (
            bMetrics.depth -
            aMetrics.depth
          );
        }


        return (
          bMetrics.downline -
          aMetrics.downline
        );
      }
    );
}


// ----------------------------------------------------------
// RANK VALUE
// ----------------------------------------------------------

function getTeamIntelRankValue(
  metrics
) {

  if (
    teamIntelSortMode ===
    "direct"
  ) {

    return {
      value:
        metrics.direct.length,

      label:
        "DIRECT"
    };
  }


  if (
    teamIntelSortMode ===
    "depth"
  ) {

    return {
      value:
        metrics.depth,

      label:
        "LEVELS"
    };
  }


  return {
    value:
      metrics.downline,

    label:
      "DOWNLINE"
  };
}


// ----------------------------------------------------------
// RENDER BOARD
// ----------------------------------------------------------

function renderTeamIntelligence() {

  const grid =
    document.getElementById(
      "teamIntelGrid"
    );


  if (!grid) return;


  const leaders =
    sortTeamIntelLeaders(
      getTeamIntelLeaders()
    );


  grid.innerHTML =
    leaders
      .map(
        (leader, index) => {

          const metrics =
            getTeamIntelMetrics(
              leader
            );


          const ranking =
            getTeamIntelRankValue(
              metrics
            );


          const branchPreview =
            metrics.directLeaders
              .slice(0, 4);


          return `

            <button
              type="button"
              class="team-intel-card"
              data-team-intel-code="${teamMapEscape(
                leader.code
              )}"
            >

              <div class="team-intel-top">

                <div class="team-intel-rank">
                  #${index + 1}
                </div>


                <div class="team-intel-name">

                  <strong>
                    ${teamMapEscape(
                      leader.name
                    )}
                  </strong>

                  <span>
                    ${teamMapEscape(
                      leader.code
                    )}
                  </span>

                </div>


                <div class="team-intel-score">

                  <strong>
                    ${ranking.value}
                  </strong>

                  <span>
                    ${ranking.label}
                  </span>

                </div>

              </div>


              <div class="team-intel-metrics">

                <div class="team-intel-metric">
                  <strong>
                    ${metrics.downline}
                  </strong>
                  <span>
                    DOWNLINE
                  </span>
                </div>


                <div class="team-intel-metric">
                  <strong>
                    ${metrics.direct.length}
                  </strong>
                  <span>
                    DIRECT
                  </span>
                </div>


                <div class="team-intel-metric">
                  <strong>
                    ${metrics.depth}
                  </strong>
                  <span>
                    LEVELS
                  </span>
                </div>

              </div>


              <div class="team-intel-branches">

                ${
                  branchPreview.length
                    ? branchPreview
                        .map(
                          child => `

                            <span class="team-intel-branch">

                              ${teamMapEscape(
                                child.name
                              )}

                              ·

                              ${teamMapDescendantCount(
                                child.code
                              )}

                            </span>

                          `
                        )
                        .join("")
                    : `
                      <span class="team-intel-branch">
                        No direct leader branches
                      </span>
                    `
                }

              </div>


              <div class="team-intel-open">
                Explore Team →
              </div>

            </button>

          `;

        }
      )
      .join("");
}


// ----------------------------------------------------------
// OPEN SELECTED TEAM
// ----------------------------------------------------------

function openTeamIntelFocus(
  code
) {

  const leader =
    teamMapMembers.find(
      member =>
        normalizeTeamMapCode(
          member.code
        ) ===
        normalizeTeamMapCode(
          code
        )
    );


  if (!leader) return;


  const metrics =
    getTeamIntelMetrics(
      leader
    );


  const grid =
    document.getElementById(
      "teamIntelGrid"
    );


  const focus =
    document.getElementById(
      "teamIntelFocused"
    );


  const back =
    document.getElementById(
      "teamIntelCloseFocus"
    );


  grid?.classList.add(
    "hidden"
  );


  focus?.classList.remove(
    "hidden"
  );


  back?.classList.remove(
    "hidden"
  );


  if (!focus) return;


  // Leaders first,
  // normal members after.
  const direct =
    [...metrics.direct]
      .sort(
        (a, b) => {

          const aChildren =
            teamMapChildren(
              a.code
            ).length;

          const bChildren =
            teamMapChildren(
              b.code
            ).length;


          if (
            aChildren > 0 &&
            bChildren === 0
          ) {
            return -1;
          }


          if (
            aChildren === 0 &&
            bChildren > 0
          ) {
            return 1;
          }


          if (
            bChildren !==
            aChildren
          ) {

            return (
              bChildren -
              aChildren
            );
          }


          return a.name.localeCompare(
            b.name
          );
        }
      );


  focus.innerHTML = `

    <div class="team-intel-focus-title">

      <div>

        <span class="team-intelligence-eyebrow">
          SELECTED TEAM
        </span>

        <h3>
          ${teamMapEscape(
            leader.name
          )}
        </h3>

        <p>
          ${teamMapEscape(
            leader.code
          )}
          · Live organization hierarchy
        </p>

      </div>


      <div class="team-intel-focus-stats">

        <div class="team-intel-focus-stat">

          <strong>
            ${metrics.downline}
          </strong>

          <span>
            DOWNLINE
          </span>

        </div>


        <div class="team-intel-focus-stat">

          <strong>
            ${metrics.direct.length}
          </strong>

          <span>
            DIRECT
          </span>

        </div>


        <div class="team-intel-focus-stat">

          <strong>
            ${metrics.depth}
          </strong>

          <span>
            LEVELS
          </span>

        </div>

      </div>

    </div>


    <div class="team-intel-mini-root">
      ${teamMapEscape(
        leader.name
      )}
    </div>


    ${
      direct.length
        ? `

          <div class="team-intel-mini-line"></div>


          <div class="team-intel-mini-children">

            ${direct
              .map(
                child => {

                  const childDirect =
                    teamMapChildren(
                      child.code
                    ).length;


                  return `

                    <button
                      type="button"
                      class="team-intel-mini-child"
                      data-team-intel-open-map="${teamMapEscape(
                        child.code
                      )}"
                    >

                      ${teamMapEscape(
                        child.name
                      )}

                      ${
                        childDirect
                          ? `
                            <br>
                            <small>
                              ${childDirect}
                              direct ·
                              ${teamMapDescendantCount(
                                child.code
                              )}
                              downline
                            </small>
                          `
                          : ""
                      }

                    </button>

                  `;

                }
              )
              .join("")}

          </div>

        `
        : ""
    }


    <button
      type="button"
      class="team-map-reset-btn"
      data-team-intel-open-map="${teamMapEscape(
        leader.code
      )}"
    >
      Open Full Team Map →
    </button>

  `;
}
// ==========================================================
// OPEN LEADER IN TEAM MAP
// ==========================================================

// ==========================================================
// OPEN SELECTED LEADER
// Starts with DIRECTS ONLY
// ==========================================================

function openLeaderInTeamMap(code) {

  if (!code) return;


  const leader =
    teamMapMembers.find(
      member =>
        normalizeTeamMapCode(
          member.code
        ) ===
        normalizeTeamMapCode(
          code
        )
    );


  if (!leader) return;


  teamMapFocusCode =
    leader.code;


  teamMapDirectOnlyMode =
    true;


  // Collapse every leader first.
  teamMapCollapsed =
    new Set(
      teamMapMembers
        .filter(
          member =>
            teamMapChildren(
              member.code
            ).length > 0
        )
        .map(
          member =>
            normalizeTeamMapCode(
              member.code
            )
        )
    );


  // But selected leader/root stays open.
  teamMapCollapsed.delete(
    normalizeTeamMapCode(
      leader.code
    )
  );


  teamMapViewMode =
    "tree";


  document
    .querySelectorAll(
      ".team-map-view-btn"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.teamMapView ===
            "tree"
        );

      }
    );


  const selector =
    document.getElementById(
      "teamMapLeaderSelect"
    );


  if (selector) {
    selector.value =
      leader.code;
  }


  drawTeamMap();


  teamMapZoom = 1;

  applyTeamMapZoom();


  document
    .querySelector(
      ".team-map-surface"
    )
    ?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

}
// ==========================================================
// DIRECT ONLY
// ==========================================================

document
  .getElementById(
    "teamMapDirectOnly"
  )
  ?.addEventListener(
    "click",
    () => {

      const rootCode =
        normalizeTeamMapCode(
          teamMapFocusCode ||
          teamMapRootCode
        );


      teamMapCollapsed =
        new Set(
          teamMapMembers
            .filter(
              member =>
                teamMapChildren(
                  member.code
                ).length > 0
            )
            .map(
              member =>
                normalizeTeamMapCode(
                  member.code
                )
            )
        );


      // Root stays open.
      teamMapCollapsed.delete(
        rootCode
      );


      teamMapDirectOnlyMode =
        true;


      drawTeamMap();

    }
  );

// ==========================================================
// FULL TREE
// ==========================================================

document
  .getElementById(
    "teamMapFullTree"
  )
  ?.addEventListener(
    "click",
    () => {

      teamMapCollapsed.clear();

      teamMapDirectOnlyMode =
        false;

      drawTeamMap();

    }
  );
// ==========================================================
// TEAM INTELLIGENCE EVENTS
// ==========================================================

document.addEventListener(
  "click",
  event => {

    const teamCard =
      event.target.closest(
        "[data-team-intel-code]"
      );


   if (teamCard) {

  const code =
    teamCard.dataset
      .teamIntelCode;

  openLeaderInTeamMap(code);

  return;
}

    const openMap =
      event.target.closest(
        "[data-team-intel-open-map]"
      );


    if (openMap) {

  const code =
    openMap.dataset
      .teamIntelOpenMap;

  openLeaderInTeamMap(code);

  return;
}

  }
);
// BACK TO RANKINGS

document
  .getElementById(
    "teamIntelCloseFocus"
  )
  ?.addEventListener(
    "click",
    () => {

      document
        .getElementById(
          "teamIntelGrid"
        )
        ?.classList.remove(
          "hidden"
        );


      document
        .getElementById(
          "teamIntelFocused"
        )
        ?.classList.add(
          "hidden"
        );


      document
        .getElementById(
          "teamIntelCloseFocus"
        )
        ?.classList.add(
          "hidden"
        );

    }
  );


// SORT TABS

document.addEventListener(
  "click",
  event => {

    const tab =
      event.target.closest(
        "[data-team-intel-sort]"
      );


    if (!tab) return;


    teamIntelSortMode =
      tab.dataset
        .teamIntelSort;


    document
      .querySelectorAll(
        ".team-intel-tab"
      )
      .forEach(
        button =>
          button.classList.remove(
            "active"
          )
      );


    tab.classList.add(
      "active"
    );


    renderTeamIntelligence();

  }
);

// ==========================================================
// DIRECT ONLY BUTTON
// ==========================================================

document
  .getElementById("teamMapDirectOnly")
  ?.addEventListener("click", () => {

    teamMapDirectOnlyMode =
      !teamMapDirectOnlyMode;

    const button =
      document.getElementById(
        "teamMapDirectOnly"
      );

    button?.classList.toggle(
      "active",
      teamMapDirectOnlyMode
    );

    drawTeamMap();

    // Reset to natural readable size.
    teamMapZoom = 1;
    applyTeamMapZoom();

  });

// ==========================================================
// FORGE ENTERPRISE VIEW -> TEAM TREE INTEGRATION
// ==========================================================

function renderForgeEnterpriseView() {
  const topGrid = document.getElementById("forgeEnterpriseTopGrid");
  const leadersList = document.getElementById("forgeEnterpriseLeaders");
  if (!topGrid || !leadersList) return;

  const leaders = teamMapMembers
    .filter(member => member?.code && teamMapChildren(member.code).length > 0)
    .map(member => ({
      member,
      direct: teamMapChildren(member.code).length,
      downline: teamMapDescendantCount(member.code)
    }));

  // Top 12 = strongest total organizations.
  const top12 = [...leaders]
    .sort((a, b) =>
      b.downline - a.downline ||
      b.direct - a.direct ||
      String(a.member.name || "").localeCompare(String(b.member.name || ""))
    )
    .slice(0, 12);

  // Sidebar = every person with at least one direct; strongest direct builders first.
  const organization = [...leaders]
    .sort((a, b) =>
      b.direct - a.direct ||
      b.downline - a.downline ||
      String(a.member.name || "").localeCompare(String(b.member.name || ""))
    );

  topGrid.innerHTML = top12.length
    ? top12.map((team) => `
      <button type="button" class="forge-enterprise-card" data-forge-open-team="${teamMapEscape(team.member.code)}">
        <div class="forge-enterprise-card-top">
          <div>
            <strong>${teamMapEscape(team.member.name || "Unknown")}</strong>
            <small>${teamMapEscape(team.member.code || "—")} · ${team.direct} direct</small>
          </div>
          <div class="forge-enterprise-score">
            <b>${team.downline}</b>
            <span>DOWNLINE</span>
          </div>
        </div>
        <div class="forge-enterprise-card-footer">
          <span>${team.direct} direct recruit${team.direct === 1 ? "" : "s"}</span>
          <b>Open Team →</b>
        </div>
      </button>
    `).join("")
    : `<div class="team-map-empty">No leaders with direct recruits found.</div>`;

  leadersList.innerHTML = organization.length
    ? organization.map((team) => `
      <button type="button" class="forge-enterprise-leader" data-forge-open-team="${teamMapEscape(team.member.code)}">
        <span>
          <strong>${teamMapEscape(team.member.name || "Unknown")}</strong>
          <span>${team.direct} direct · ${team.downline} downline</span>
        </span>
        <b>→</b>
      </button>
    `).join("")
    : `<div class="team-map-empty">No organization leaders found.</div>`;
}

function showForgeEnterpriseView() {
  document.getElementById("teamMapEnterpriseView")?.classList.remove("hidden");
  document.getElementById("teamMapTreeView")?.classList.add("hidden");
  renderForgeEnterpriseView();
}

function showForgeTeamTree(code) {
  if (!code) return;
  document.getElementById("teamMapEnterpriseView")?.classList.add("hidden");
  document.getElementById("teamMapTreeView")?.classList.remove("hidden");
  openLeaderInTeamMap(code);
}

document.addEventListener("click", (event) => {
  const team = event.target.closest("[data-forge-open-team]");
  if (!team) return;
  showForgeTeamTree(team.dataset.forgeOpenTeam);
});

document.getElementById("teamMapBackToEnterprise")?.addEventListener("click", showForgeEnterpriseView);
document.getElementById("forgeEnterpriseTopTeams")?.addEventListener("click", showForgeEnterpriseView);

document.getElementById("forgeEnterpriseSearchBtn")?.addEventListener("click", () => {
  const input = document.getElementById("forgeEnterpriseSearch");
  const query = String(input?.value || "").trim().toLowerCase();
  if (!query) return;
  const match = teamMapMembers.find(member =>
    String(member.name || "").toLowerCase().includes(query) ||
    String(member.code || "").toLowerCase().includes(query)
  );
  if (match) showForgeTeamTree(match.code);
});

document.getElementById("forgeEnterpriseSearch")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("forgeEnterpriseSearchBtn")?.click();
});

document.getElementById("forgeEnterpriseFit")?.addEventListener("click", () => {
  if (document.getElementById("teamMapTreeView")?.classList.contains("hidden")) {
    showForgeTeamTree(teamMapFocusCode || teamMapRootCode);
  }
  setTimeout(fitTeamMapToScreen, 50);
});

document.getElementById("forgeEnterpriseZoomIn")?.addEventListener("click", () => {
  if (document.getElementById("teamMapTreeView")?.classList.contains("hidden")) {
    showForgeTeamTree(teamMapFocusCode || teamMapRootCode);
  }
  document.getElementById("teamMapZoomIn")?.click();
});

document.getElementById("forgeEnterpriseZoomOut")?.addEventListener("click", () => {
  if (document.getElementById("teamMapTreeView")?.classList.contains("hidden")) {
    showForgeTeamTree(teamMapFocusCode || teamMapRootCode);
  }
  document.getElementById("teamMapZoomOut")?.click();
});

document.getElementById("forgeEnterpriseFullscreen")?.addEventListener("click", () => {
  if (document.getElementById("teamMapTreeView")?.classList.contains("hidden")) {
    showForgeTeamTree(teamMapFocusCode || teamMapRootCode);
  }
  setTimeout(() => document.getElementById("teamMapOpenStage")?.click(), 80);
});

// Enhance the existing Team Map render without replacing its data logic.
const forgeOriginalRenderTeamMap = renderTeamMap;
renderTeamMap = function() {
  forgeOriginalRenderTeamMap();
  window.teamMapMembers = teamMapMembers;
  renderForgeEnterpriseView();
  // Opening the Team Map page always begins on the enterprise selector.
  if (!document.getElementById("teamMapPage")?.classList.contains("hidden")) {
    const treeView = document.getElementById("teamMapTreeView");
    const enterpriseView = document.getElementById("teamMapEnterpriseView");
    if (treeView && enterpriseView && !enterpriseView.dataset.userOpenedTree) {
      enterpriseView.classList.remove("hidden");
      treeView.classList.add("hidden");
    }
  }
};

// Keep tree open after a deliberate selection until user goes back.
const forgeOriginalOpenLeaderInTeamMap = openLeaderInTeamMap;
openLeaderInTeamMap = function(code) {
  document.getElementById("teamMapEnterpriseView")?.setAttribute("data-user-opened-tree", "1");
  forgeOriginalOpenLeaderInTeamMap(code);
};

document.getElementById("teamMapBackToEnterprise")?.addEventListener("click", () => {
  document.getElementById("teamMapEnterpriseView")?.removeAttribute("data-user-opened-tree");
});

// ==========================================================
// FORGE FULLSCREEN TEAM MAP — LIVE EXPAND / COLLAPSE
// ==========================================================

function syncTeamMapStage() {

  const source =
    document.getElementById("teamMapTree");

  const canvas =
    document.getElementById("teamMapStageCanvas");

  if (!source || !canvas) return;

  canvas.innerHTML =
    source.innerHTML;

  if (
    typeof applyTeamMapStageZoom ===
    "function"
  ) {
    applyTeamMapStageZoom();
  }
}


// ----------------------------------------------------------
// COLLAPSE ALL
// Keeps current root visible.
// Every leader underneath becomes clickable with +
// ----------------------------------------------------------

function collapseForgeTeamMap() {

  const rootCode =
    normalizeTeamMapCode(
      teamMapFocusCode ||
      teamMapRootCode
    );

  if (!rootCode) return;

  teamMapCollapsed.clear();
  teamMapCollapsed.add(rootCode);

  teamMapDirectOnlyMode = false;

  drawTeamMap();

  requestAnimationFrame(() => {
    syncTeamMapStage();
  });
}


// ----------------------------------------------------------
// EXPAND ALL
// ----------------------------------------------------------

function expandForgeTeamMap() {

  teamMapDirectOnlyMode = false;

  teamMapCollapsed.clear();

  drawTeamMap();

  requestAnimationFrame(() => {
    syncTeamMapStage();
  });
}


// ----------------------------------------------------------
// OPEN/CLOSE ONE LEADER BRANCH
// ----------------------------------------------------------

function toggleForgeTeamBranch(rawCode) {

  const code =
    normalizeTeamMapCode(
      rawCode
    );

  if (!code) return;

  const member =
    teamMapMembers.find(
      person =>
        normalizeTeamMapCode(
          person.code
        ) === code
    );

  if (!member) return;

  const children =
    teamMapChildren(
      member.code
    );

  if (!children.length) return;


  if (
    teamMapCollapsed.has(code)
  ) {

    // Open this leader.
    teamMapCollapsed.delete(code);

    // Keep the next leaders closed.
    // This makes the map drill down one level at a time.
    children.forEach(
      child => {

        if (
          teamMapChildren(
            child.code
          ).length > 0
        ) {
          teamMapCollapsed.add(
            normalizeTeamMapCode(
              child.code
            )
          );
        }

      }
    );

  } else {

    // Close this leader's branch.
    teamMapCollapsed.add(code);

  }


  teamMapDirectOnlyMode = false;

  drawTeamMap();

  requestAnimationFrame(() => {
    syncTeamMapStage();
  });
}


// ==========================================================
// FULLSCREEN CARD CLICK
// Your real Team Map uses:
// .team-map-node[data-team-map-toggle]
// ==========================================================

document.addEventListener(
  "click",
  event => {

    const stage =
      document.getElementById(
        "teamMapStage"
      );

    if (
      !stage ||
      stage.classList.contains(
        "hidden"
      )
    ) {
      return;
    }


    const card =
      event.target.closest(
        "#teamMapStageCanvas .team-map-node[data-team-map-toggle]"
      );

    if (!card) return;


    event.preventDefault();
    event.stopImmediatePropagation();


    const code =
      card.dataset
        .teamMapToggle;


    toggleForgeTeamBranch(
      code
    );

  },
  true
);


// ==========================================================
// FULLSCREEN COLLAPSE ALL BUTTON
// ==========================================================

document
  .getElementById(
    "teamMapStageCollapseAll"
  )
  ?.addEventListener(
    "click",
    () => {

      collapseForgeTeamMap();

      setTimeout(
        () => {

          if (
            typeof fitTeamMapStage ===
            "function"
          ) {
            fitTeamMapStage();
          }

        },
        100
      );

    }
  );


// ==========================================================
// KEEP FULLSCREEN UPDATED WHEN NORMAL MAP REDRAWS
// ==========================================================

const forgeLiveDrawTeamMap =
  drawTeamMap;

drawTeamMap = function(
  ...args
) {

  const result =
    forgeLiveDrawTeamMap.apply(
      this,
      args
    );


  const stage =
    document.getElementById(
      "teamMapStage"
    );


  if (
    stage &&
    !stage.classList.contains(
      "hidden"
    )
  ) {

    requestAnimationFrame(
      () => {
        syncTeamMapStage();
      }
    );

  }


  return result;
};

// ==========================================================
// FORGE SAFE MULTI-SOURCE IMPORT ENGINE v1
// ----------------------------------------------------------
// SAFETY RULES
// 1. Agent Code is the strongest identity.
// 2. Fallback matching: email -> phone -> unique exact cleaned name.
// 3. Blank CSV cells never erase saved data.
// 4. Existing Name / Code / Upline are protected. Conflicts are warned.
// 5. Supplemental files add information; they do not replace identity.
// 6. Journey stage can only move forward.
// 7. Ambiguous/conflicting rows are rejected instead of guessed.
// 8. New people require BOTH Agent Code and Name.
// 9. Every warning/rejection is shown in the Import Review report.
// ==========================================================

const FORGE_IMPORT_ALIASES = {
  name: [
    "AGENT NAME", "FULL NAME", "FULLNAME", "NAME",
    "RECRUIT NAME", "ASSOCIATE NAME", "MEMBER NAME"
  ],
  code: [
    "AGENT CODE", "CODE", "RECRUIT CODE",
    "ASSOCIATE CODE", "MEMBER CODE"
  ],
  email: ["EMAIL", "EMAIL ADDRESS", "E-MAIL"],
  phone: ["PHONE", "PHONE NUMBER", "MOBILE", "MOBILE PHONE"],
  upline: [
    "UPLINE NAME", "UPLINE AGENT", "UPLINE",
    "SPONSOR", "SPONSOR NAME", "RECRUITER", "RECRUITER NAME"
  ],
  uplineCode: [
    "UPLINE CODE", "SPONSOR CODE", "RECRUITER CODE"
  ],
  recruitDate: [
    "RECRUIT DATE", "RECRUIT DATE ( CST )",
    "JOIN DATE", "START DATE"
  ],
  teamStatus: ["TEAM STATUS", "STATUS", "AGENT STATUS"],
  stage: [
    "STAGE", "JOURNEY STAGE", "LICENSING STAGE",
    "PIPELINE STAGE", "PROGRESS STAGE"
  ],
  level: ["LEVEL", "AGENT LEVEL", "RANK"],
  residentState: [
    "RESI. STATE", "RESIDENT STATE", "RESIDENT STATE LICENSE"
  ],
  residentLicense: [
    "RESI. LICENSE", "RESIDENT LICENSE", "LICENSE STATUS"
  ],
  eoStatus: ["E&O", "EO", "E & O", "E&O STATUS", "EO STATUS"],
  amlStatus: ["AML", "AML STATUS"],
  tevahPlatformFee: [
    "TEVAH PLATFORM FEE", "PLATFORM FEE", "TEVAH FEE"
  ],
  npn: ["NPN", "NATIONAL PRODUCER NUMBER"],
  xcelStatus: [
    "XCEL", "XCEL STATUS", "XCEL COMPLETE", "XCEL COMPLETED",
    "PRE-LICENSING STATUS", "PRELICENSING STATUS",
    "COURSE STATUS", "COURSE COMPLETION"
  ],
  examStatus: [
    "EXAM STATUS", "EXAM RESULT", "STATE EXAM",
    "STATE EXAM STATUS"
  ]
};

function forgeImportNormalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function forgeImportHeaderMap(row) {
  const map = new Map();

  Object.keys(row || {}).forEach((header) => {
    map.set(
      forgeImportNormalizeHeader(header),
      row[header]
    );
  });

  return map;
}

function forgeImportPick(map, aliases) {
  for (const alias of aliases) {
    const key = forgeImportNormalizeHeader(alias);

    if (!map.has(key)) continue;

    const value = map.get(key);

    if (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }

  return "";
}

function forgeImportCleanPhone(value) {
  return String(value || "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function forgeImportCanonicalRow(rawRow) {
  const map = forgeImportHeaderMap(rawRow);

  return {
    name: cleanAgentName(
      forgeImportPick(map, FORGE_IMPORT_ALIASES.name)
    ),

    code: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.code
    ).toUpperCase(),

    email: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.email
    ).toLowerCase(),

    phone: forgeImportCleanPhone(
      forgeImportPick(
        map,
        FORGE_IMPORT_ALIASES.phone
      )
    ),

    upline: cleanAgentName(
      forgeImportPick(
        map,
        FORGE_IMPORT_ALIASES.upline
      )
    ),

    uplineCode: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.uplineCode
    ).toUpperCase(),

    recruitDate: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.recruitDate
    ),

    teamStatus: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.teamStatus
    ),

    explicitStage: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.stage
    ),

    level: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.level
    ),

    residentState: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.residentState
    ),

    residentLicense: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.residentLicense
    ),

    eoStatus: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.eoStatus
    ),

    amlStatus: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.amlStatus
    ),

    tevahPlatformFee: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.tevahPlatformFee
    ),

    npn: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.npn
    ),

    xcelStatus: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.xcelStatus
    ),

    examStatus: forgeImportPick(
      map,
      FORGE_IMPORT_ALIASES.examStatus
    )
  };
}

function forgeDetectCsvProfile(rows, fileName = "") {
  if (!rows?.length) {
    return {
      type: "unknown",
      confidence: 0,
      reason: "The file contains no records."
    };
  }

  const headers =
    Object.keys(rows[0] || {})
      .map(forgeImportNormalizeHeader);

  const has = (name) =>
    headers.includes(
      forgeImportNormalizeHeader(name)
    );

  const any = (names) =>
    names.some(has);

  if (
    any(["RESI. LICENSE", "RESIDENT LICENSE"]) ||
    (
      any(["AML", "AML STATUS"]) &&
      any(["E&O", "EO", "E&O STATUS"])
    )
  ) {
    return {
      type: "compliance",
      confidence: 100,
      reason: "Compliance/license columns detected."
    };
  }

  if (
    any([
      "XCEL", "XCEL STATUS", "XCEL COMPLETE",
      "XCEL COMPLETED", "PRE-LICENSING STATUS",
      "PRELICENSING STATUS", "COURSE STATUS",
      "COURSE COMPLETION"
    ])
  ) {
    return {
      type: "xcel",
      confidence: 100,
      reason: "XCEL/pre-licensing columns detected."
    };
  }

  if (
    has("AGENT CODE") &&
    any(["FULL NAME", "AGENT NAME"]) &&
    (
      has("TEAM STATUS") ||
      any(["UPLINE NAME", "UPLINE CODE", "UPLINE AGENT"])
    )
  ) {
    return {
      type: "team",
      confidence: 100,
      reason: "Team identity/hierarchy columns detected."
    };
  }

  if (
    has("RECRUIT NAME") ||
    /byrecruit|recruit/i.test(fileName)
  ) {
    return {
      type: "recruit",
      confidence: 90,
      reason: "Recruit/progression columns detected."
    };
  }

  const identityHeader =
    FORGE_IMPORT_ALIASES.code.some(has) ||
    FORGE_IMPORT_ALIASES.email.some(has) ||
    FORGE_IMPORT_ALIASES.phone.some(has) ||
    FORGE_IMPORT_ALIASES.name.some(has);

  let recognized = 0;

  Object.values(FORGE_IMPORT_ALIASES)
    .flat()
    .forEach((alias) => {
      if (has(alias)) recognized++;
    });

  if (identityHeader && recognized >= 2) {
    return {
      type: "generic",
      confidence: Math.min(85, 50 + recognized * 5),
      reason:
        "Compatible identity/progress columns detected."
    };
  }

  return {
    type: "unknown",
    confidence: 0,
    reason:
      "FORGE could not find a safe identity column plus recognized data."
  };
}

function forgeImportAgentLabel(row) {
  return (
    row.name ||
    row.code ||
    row.email ||
    row.phone ||
    "Unknown row"
  );
}

function forgeImportEqualName(a, b) {
  const left = normalizeMatchName(a);
  const right = normalizeMatchName(b);

  return !!left && !!right && left === right;
}

function forgeImportEqualText(a, b) {
  return (
    String(a || "").trim().toLowerCase() ===
    String(b || "").trim().toLowerCase()
  );
}

function forgeImportFindMatches(row) {
  const code =
    String(row.code || "")
      .trim()
      .toLowerCase();

  const email =
    String(row.email || "")
      .trim()
      .toLowerCase();

  const phone =
    forgeImportCleanPhone(row.phone);

  const name =
    normalizeMatchName(row.name);

  const byCode =
    code
      ? allAgents.filter((agent) =>
          String(agent.code || "")
            .trim()
            .toLowerCase() === code
        )
      : [];

  if (byCode.length === 1) {
    return {
      agent: byCode[0],
      basis: "Agent Code",
      ambiguous: false
    };
  }

  if (byCode.length > 1) {
    return {
      agent: null,
      basis: "Agent Code",
      ambiguous: true,
      reason: "Duplicate Agent Code already exists in FORGE."
    };
  }

  const byEmail =
    email
      ? allAgents.filter((agent) =>
          String(agent.email || "")
            .trim()
            .toLowerCase() === email
        )
      : [];

  if (byEmail.length === 1) {
    return {
      agent: byEmail[0],
      basis: "Email",
      ambiguous: false
    };
  }

  if (byEmail.length > 1) {
    return {
      agent: null,
      basis: "Email",
      ambiguous: true,
      reason: "Email matches more than one FORGE person."
    };
  }

  const byPhone =
    phone
      ? allAgents.filter((agent) =>
          forgeImportCleanPhone(agent.phone) === phone
        )
      : [];

  if (byPhone.length === 1) {
    return {
      agent: byPhone[0],
      basis: "Phone",
      ambiguous: false
    };
  }

  if (byPhone.length > 1) {
    return {
      agent: null,
      basis: "Phone",
      ambiguous: true,
      reason: "Phone matches more than one FORGE person."
    };
  }

  const byName =
    name
      ? allAgents.filter((agent) =>
          normalizeMatchName(agent.name) === name
        )
      : [];

  if (byName.length === 1) {
    return {
      agent: byName[0],
      basis: "Exact Name",
      ambiguous: false
    };
  }

  if (byName.length > 1) {
    return {
      agent: null,
      basis: "Exact Name",
      ambiguous: true,
      reason:
        "Name is not unique. Agent Code is required to identify the correct person."
    };
  }

  return {
    agent: null,
    basis: null,
    ambiguous: false
  };
}

function forgeImportIdentityConflict(existing, incoming, matchBasis) {
  const conflicts = [];

  if (
    incoming.code &&
    existing.code &&
    !forgeImportEqualText(
      incoming.code,
      existing.code
    )
  ) {
    conflicts.push(
      `Agent Code differs: FORGE=${existing.code}, CSV=${incoming.code}`
    );
  }

  if (
    incoming.name &&
    existing.name &&
    !forgeImportEqualName(
      incoming.name,
      existing.name
    )
  ) {
    conflicts.push(
      `Name differs: FORGE="${existing.name}", CSV="${incoming.name}"`
    );
  }

  if (
    matchBasis === "Agent Code" &&
    incoming.email &&
    existing.email &&
    !forgeImportEqualText(
      incoming.email,
      existing.email
    )
  ) {
    conflicts.push(
      `Email differs: FORGE=${existing.email}, CSV=${incoming.email}`
    );
  }

  return conflicts;
}

function forgeImportStageFromText(value) {
  const text =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!text) return "";

  if (
    text.includes("contracted") ||
    text.includes("ready to write")
  ) {
    return "Contracted";
  }

  if (
    text.includes("licensed") ||
    text === "active license" ||
    text.includes("license active")
  ) {
    return "Licensed";
  }

  if (
    text.includes("exam passed") ||
    text.includes("passed exam") ||
    text === "passed"
  ) {
    return "Exam Passed";
  }

  if (
    text.includes("xcel completed") ||
    text.includes("xcel complete") ||
    (
      text.includes("course") &&
      text.includes("complete")
    ) ||
    (
      text.includes("pre-licens") &&
      text.includes("complete")
    )
  ) {
    return "XCEL Completed";
  }

  if (text.includes("quiz sent")) {
    return "Quiz Sent";
  }

  if (
    text.includes("not placed") ||
    text.includes("not started")
  ) {
    return "Not Placed";
  }

  return "";
}

function forgeInferIncomingStage(row, sourceType) {
  const candidates = [];

  [
    row.explicitStage,
    row.teamStatus,
    row.xcelStatus,
    row.examStatus
  ].forEach((value) => {
    const stage =
      forgeImportStageFromText(value);

    if (stage) candidates.push(stage);
  });

  const licenseText =
    String(row.residentLicense || "")
      .trim()
      .toLowerCase();

  if (
    licenseText === "active" ||
    licenseText.includes("licensed") ||
    licenseText.includes("active license")
  ) {
    candidates.push("Licensed");
  }

  if (
    sourceType === "xcel" &&
    row.xcelStatus &&
    /complete|completed|passed|100%/i.test(
      row.xcelStatus
    )
  ) {
    candidates.push("XCEL Completed");
  }

  if (
    row.examStatus &&
    /pass|passed/i.test(row.examStatus)
  ) {
    candidates.push("Exam Passed");
  }

  if (!candidates.length) return "";

  return candidates.reduce((best, stage) => {
    const bestRank =
      STAGE_RANK[best] ?? -1;

    const rank =
      STAGE_RANK[stage] ?? -1;

    return rank > bestRank
      ? stage
      : best;
  }, "");
}

function forgeImportForwardStage(currentStage, incomingStage) {
  if (!incomingStage) {
    return currentStage || "Not Placed";
  }

  const current =
    currentStage || "Not Placed";

  const currentRank =
    STAGE_RANK[current] ?? 0;

  const incomingRank =
    STAGE_RANK[incomingStage] ?? 0;

  return incomingRank > currentRank
    ? incomingStage
    : current;
}

function forgeImportAddWarning(report, item) {
  report.warnings.push(item);
}

function forgeImportAddRejected(report, item) {
  report.rejected.push(item);
}

function forgeImportSourceLabel(type) {
  const labels = {
    team: "Tevah Team",
    compliance: "Compliance",
    recruit: "Recruit",
    xcel: "XCEL",
    generic: "Compatible CSV"
  };

  return labels[type] || "CSV";
}

function forgeImportMergeSource(existingSource, incomingSource) {
  const parts =
    String(existingSource || "")
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);

  if (
    incomingSource &&
    !parts.some(
      (part) =>
        part.toLowerCase() ===
        incomingSource.toLowerCase()
    )
  ) {
    parts.push(incomingSource);
  }

  return parts.join(" + ") || incomingSource;
}

function forgeImportBuildExistingUpdates(
  existing,
  incoming,
  sourceType,
  reportContext
) {
  const updates = {};

  // -----------------------------------------
  // PROTECTED IDENTITY / HIERARCHY
  // Fill blanks only. Never silently replace.
  // -----------------------------------------

  const protectedPairs = [
    ["name", "name", "Name"],
    ["email", "email", "Email"],
    ["phone", "phone", "Phone"],
    ["upline", "upline_name", "Upline"],
    ["uplineCode", "upline_code", "Upline Code"],
    ["recruitDate", "recruit_date", "Recruit Date"]
  ];

  protectedPairs.forEach(
    ([agentKey, dbKey, label]) => {

      const incomingValue =
        incoming[agentKey];

      if (!incomingValue) return;

      const existingValue =
        existing[agentKey];

      if (!existingValue) {
        updates[dbKey] = incomingValue;
        return;
      }

      const same =
        agentKey === "name" ||
        agentKey === "upline"
          ? forgeImportEqualName(
              existingValue,
              incomingValue
            )
          : forgeImportEqualText(
              existingValue,
              incomingValue
            );

      if (!same) {
        forgeImportAddWarning(
          reportContext.report,
          {
            file: reportContext.file,
            row: reportContext.row,
            person:
              existing.name ||
              incoming.name ||
              existing.code,
            message:
              `${label} conflict. Kept FORGE value "${existingValue}". CSV showed "${incomingValue}".`
          }
        );
      }
    }
  );

  // Team Status may be refreshed by the Team file.
  if (
    sourceType === "team" &&
    incoming.teamStatus
  ) {
    updates.team_status =
      incoming.teamStatus;
  }

  // Supplemental fields: update only when CSV actually supplied a value.
  const supplemental = [
    ["level", "agent_level"],
    ["residentState", "resident_state"],
    ["residentLicense", "resident_license"],
    ["eoStatus", "eo_status"],
    ["amlStatus", "aml_status"],
    ["tevahPlatformFee", "tevah_platform_fee"],
    ["npn", "npn"]
  ];

  supplemental.forEach(
    ([agentKey, dbKey]) => {
      if (incoming[agentKey]) {
        updates[dbKey] =
          incoming[agentKey];
      }
    }
  );

  const incomingStage =
    forgeInferIncomingStage(
      incoming,
      sourceType
    );

  const finalStage =
    forgeImportForwardStage(
      existing.stage,
      incomingStage
    );

  if (
    finalStage &&
    finalStage !== existing.stage
  ) {
    updates.stage = finalStage;
  }

  updates.import_source =
    forgeImportMergeSource(
      existing.importSource,
      forgeImportSourceLabel(sourceType)
    );

  return updates;
}

function forgeImportBuildNewRow(
  incoming,
  sourceType
) {
  const stage =
    forgeImportForwardStage(
      "Not Placed",
      forgeInferIncomingStage(
        incoming,
        sourceType
      )
    );

  return {
    organization_id:
      getActiveOrganizationId(),

    agent_code:
      String(incoming.code)
        .trim()
        .toUpperCase(),

    name:
      cleanAgentName(incoming.name),

    email:
      incoming.email || null,

    phone:
      incoming.phone || null,

    recruit_date:
      incoming.recruitDate || null,

    upline_name:
      incoming.upline || null,

    upline_code:
      incoming.uplineCode || null,

    team_status:
      incoming.teamStatus || null,

    agent_level:
      incoming.level || null,

    resident_state:
      incoming.residentState || null,

    resident_license:
      incoming.residentLicense || null,

    eo_status:
      incoming.eoStatus || null,

    aml_status:
      incoming.amlStatus || null,

    tevah_platform_fee:
      incoming.tevahPlatformFee || null,

    npn:
      incoming.npn || null,

    stage,

    import_source:
      forgeImportSourceLabel(sourceType)
  };
}

function forgeImportApplyLocalUpdate(
  agent,
  updates
) {
  const dbToAgent = {
    name: "name",
    email: "email",
    phone: "phone",
    recruit_date: "recruitDate",
    upline_name: "upline",
    upline_code: "uplineCode",
    team_status: "teamStatus",
    agent_level: "level",
    resident_state: "residentState",
    resident_license: "residentLicense",
    eo_status: "eoStatus",
    aml_status: "amlStatus",
    tevah_platform_fee: "tevahPlatformFee",
    npn: "npn",
    stage: "stage",
    import_source: "importSource"
  };

  Object.entries(updates)
    .forEach(([dbKey, value]) => {
      const agentKey =
        dbToAgent[dbKey];

      if (agentKey) {
        agent[agentKey] = value;
      }
    });
}

async function forgeImportProcessRow(
  incoming,
  sourceType,
  context
) {
  const report = context.report;

  report.total++;

  if (
    !incoming.name &&
    !incoming.code &&
    !incoming.email &&
    !incoming.phone
  ) {
    report.ignored++;
    return;
  }

  const match =
    forgeImportFindMatches(incoming);

  if (match.ambiguous) {
    forgeImportAddRejected(
      report,
      {
        file: context.file,
        row: context.row,
        person: forgeImportAgentLabel(incoming),
        message:
          match.reason ||
          "FORGE found more than one possible match."
      }
    );

    return;
  }

  if (match.agent) {
    const identityConflicts =
      forgeImportIdentityConflict(
        match.agent,
        incoming,
        match.basis
      );

    // Strong safety stop:
    // Code matched but the provided Name points somewhere else.
    if (
      match.basis === "Agent Code" &&
      incoming.name &&
      match.agent.name &&
      !forgeImportEqualName(
        incoming.name,
        match.agent.name
      )
    ) {
      forgeImportAddRejected(
        report,
        {
          file: context.file,
          row: context.row,
          person:
            `${incoming.name} · ${incoming.code}`,
          message:
            `Agent Code matched ${match.agent.name}, but the CSV name is ${incoming.name}. Nothing was changed.`
        }
      );

      return;
    }

    // If matching by fallback while CSV also supplied another code,
    // never attach that code to the wrong person.
    if (
      match.basis !== "Agent Code" &&
      incoming.code &&
      match.agent.code &&
      !forgeImportEqualText(
        incoming.code,
        match.agent.code
      )
    ) {
      forgeImportAddRejected(
        report,
        {
          file: context.file,
          row: context.row,
          person:
            forgeImportAgentLabel(incoming),
          message:
            `Matched by ${match.basis}, but Agent Code conflicts with FORGE. Nothing was changed.`
        }
      );

      return;
    }

    identityConflicts.forEach(
      (message) => {
        // Email-only conflicts are warnings when code and name are safe.
        if (
          !message.startsWith("Name differs") &&
          !message.startsWith("Agent Code differs")
        ) {
          forgeImportAddWarning(
            report,
            {
              file: context.file,
              row: context.row,
              person:
                match.agent.name ||
                forgeImportAgentLabel(incoming),
              message
            }
          );
        }
      }
    );

    const updates =
      forgeImportBuildExistingUpdates(
        match.agent,
        incoming,
        sourceType,
        {
          report,
          file: context.file,
          row: context.row
        }
      );

    const meaningfulKeys =
      Object.keys(updates)
        .filter(
          (key) =>
            key !== "import_source"
        );

    if (!meaningfulKeys.length) {
      report.unchanged++;
      return;
    }

    const { error } =
      await forgeSupabase
        .from("agents")
        .update(updates)
        .eq(
          "organization_id",
          getActiveOrganizationId()
        )
        .eq(
          "id",
          match.agent.id
        );

    if (error) {
      forgeImportAddRejected(
        report,
        {
          file: context.file,
          row: context.row,
          person:
            match.agent.name ||
            forgeImportAgentLabel(incoming),
          message:
            `Database update failed: ${error.message}`
        }
      );

      return;
    }

    forgeImportApplyLocalUpdate(
      match.agent,
      updates
    );

    report.updated++;
    return;
  }

  // -----------------------------------------
  // NEW PERSON
  // Safe creation requires Code + Name.
  // -----------------------------------------

  if (!incoming.code || !incoming.name) {
    forgeImportAddRejected(
      report,
      {
        file: context.file,
        row: context.row,
        person:
          forgeImportAgentLabel(incoming),
        message:
          "No safe existing match. New people require both Agent Code and Name."
      }
    );

    return;
  }

  const newRow =
    forgeImportBuildNewRow(
      incoming,
      sourceType
    );

  const { data, error } =
    await forgeSupabase
      .from("agents")
      .insert(newRow)
      .select()
      .single();

  if (error) {
    forgeImportAddRejected(
      report,
      {
        file: context.file,
        row: context.row,
        person:
          `${incoming.name} · ${incoming.code}`,
        message:
          `Could not add new person: ${error.message}`
      }
    );

    return;
  }

  const localAgent = {
    id: data.id,
    organizationId:
      data.organization_id,

    name: data.name || "",
    email: data.email || "",
    phone: data.phone || "",
    code: data.agent_code || "",

    upline: data.upline_name || "",
    uplineCode: data.upline_code || "",

    stage:
      data.stage || "Not Placed",

    teamStatus:
      data.team_status || "",

    level:
      data.agent_level || "",

    residentState:
      data.resident_state || "",

    residentLicense:
      data.resident_license || "",

    eoStatus:
      data.eo_status || "",

    amlStatus:
      data.aml_status || "",

    tevahPlatformFee:
      data.tevah_platform_fee || "",

    npn:
      data.npn || "",

    recruitDate:
      data.recruit_date || "",

    importSource:
      data.import_source || ""
  };

  allAgents.push(localAgent);

  report.created++;

  if (!incoming.upline && !incoming.uplineCode) {
    forgeImportAddWarning(
      report,
      {
        file: context.file,
        row: context.row,
        person:
          `${incoming.name} · ${incoming.code}`,
        message:
          "New person was added, but no Upline Name or Upline Code was supplied. Review their Team Map placement."
      }
    );
  }
}

async function forgeImportAnalyzeFiles(files) {
  const analysis = {
    files: [],
    totalRows: 0,
    recognizedFiles: 0,
    unknownFiles: 0
  };

  for (const file of files) {
    try {
      const text =
        await file.text();

      const rows =
        parseCSV(text);

      const profile =
        forgeDetectCsvProfile(
          rows,
          file.name
        );

      analysis.totalRows +=
        rows.length;

      analysis.files.push({
        file,
        rows,
        profile
      });

      if (profile.type === "unknown") {
        analysis.unknownFiles++;
      } else {
        analysis.recognizedFiles++;
      }

    } catch (error) {
      analysis.files.push({
        file,
        rows: [],
        profile: {
          type: "unknown",
          confidence: 0,
          reason:
            error?.message ||
            "FORGE could not read this file."
        }
      });

      analysis.unknownFiles++;
    }
  }

  return analysis;
}

function forgeImportRenderFilePreview(
  analysis
) {
  setText(
    "importTotal",
    analysis.totalRows
  );

  setText(
    "importNew",
    "—"
  );

  setText(
    "importExisting",
    "—"
  );

  setText(
    "importDuplicates",
    analysis.unknownFiles
  );

  setText(
    "importRejected",
    "—"
  );

  const progress =
    document.getElementById(
      "importProgress"
    );

  if (!progress) return;

  progress.classList.remove("hidden");

  progress.innerHTML =
    analysis.files
      .map((item) => {
        const type =
          item.profile.type === "unknown"
            ? "Needs review"
            : forgeImportSourceLabel(
                item.profile.type
              );

        return `
          <div style="margin:4px 0;">
            <strong>
              ${escapeImportHtml(
                item.file.name
              )}
            </strong>
            — ${escapeImportHtml(type)}
            (${item.rows.length} rows)
          </div>
        `;
      })
      .join("");
}

function forgeImportReportLine(
  item,
  kind
) {
  const icon =
    kind === "rejected"
      ? "✕"
      : "⚠";

  return `
    <div
      style="
        padding:9px 0;
        border-bottom:1px solid #e6edf7;
      "
    >
      <strong>
        ${icon}
        ${escapeImportHtml(
          item.person || "Record"
        )}
      </strong>
      <div style="color:#51627c;margin-top:3px;">
        ${escapeImportHtml(
          item.file || ""
        )}
        ${item.row ? ` · row ${item.row}` : ""}
      </div>
      <div style="margin-top:3px;">
        ${escapeImportHtml(
          item.message || ""
        )}
      </div>
    </div>
  `;
}

function forgeRenderSafeImportReport(report) {
  setText(
    "importTotal",
    report.total
  );

  setText(
    "importNew",
    report.created
  );

  setText(
    "importExisting",
    report.updated
  );

  setText(
    "importDuplicates",
    report.warnings.length
  );

  setText(
    "importRejected",
    report.rejected.length
  );

  const progress =
    document.getElementById(
      "importProgress"
    );

  if (progress) {
    progress.classList.remove("hidden");

    progress.innerHTML = `
      <strong>Import complete.</strong>
      ${report.filesProcessed} file${
        report.filesProcessed === 1 ? "" : "s"
      } processed ·
      ${report.created} new ·
      ${report.updated} updated ·
      ${report.unchanged} unchanged ·
      ${report.warnings.length} warning${
        report.warnings.length === 1 ? "" : "s"
      } ·
      ${report.rejected.length} rejected.
    `;
  }

  const box =
    document.getElementById(
      "importSafetyReport"
    );

  if (!box) return;

  const fileSummary =
    report.fileResults
      .map((file) => `
        <div style="margin-bottom:8px;">
          <strong>
            ${escapeImportHtml(file.name)}
          </strong>
          — ${escapeImportHtml(file.type)}
          · ${file.rows} rows
          ${
            file.skipped
              ? ` · <span style="color:#9a5b00;">SKIPPED: ${escapeImportHtml(file.reason)}</span>`
              : ""
          }
        </div>
      `)
      .join("");

  const warningLines =
    report.warnings
      .map((item) =>
        forgeImportReportLine(
          item,
          "warning"
        )
      )
      .join("");

  const rejectedLines =
    report.rejected
      .map((item) =>
        forgeImportReportLine(
          item,
          "rejected"
        )
      )
      .join("");

  box.innerHTML = `
    <div style="margin-bottom:14px;">
      <strong>Files reviewed</strong>
      <div style="margin-top:6px;">
        ${fileSummary || "No files."}
      </div>
    </div>

    ${
      report.warnings.length
        ? `
          <div style="margin-top:12px;">
            <strong>
              Warnings (${report.warnings.length})
            </strong>
            ${warningLines}
          </div>
        `
        : ""
    }

    ${
      report.rejected.length
        ? `
          <div style="margin-top:14px;">
            <strong>
              Rejected rows (${report.rejected.length})
            </strong>
            ${rejectedLines}
          </div>
        `
        : ""
    }

    ${
      !report.warnings.length &&
      !report.rejected.length
        ? `
          <div style="padding:10px 0;">
            ✓ No identity conflicts or rejected rows.
          </div>
        `
        : ""
    }
  `;

  box.classList.remove("hidden");
}

async function forgeRunSafeMultiSourceImport(
  files
) {
  if (!getActiveOrganizationId()) {
    throw new Error(
      "FORGE does not have an active organization selected."
    );
  }

  // Always start from the current saved organization.
  await loadCSV();

  const analysis =
    await forgeImportAnalyzeFiles(
      files
    );

  const report = {
    total: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    ignored: 0,
    warnings: [],
    rejected: [],
    filesProcessed: 0,
    fileResults: []
  };

  // Process team structure first if provided.
  // Then recruit, XCEL, compliance, then generic.
  const order = {
    team: 1,
    recruit: 2,
    xcel: 3,
    compliance: 4,
    generic: 5,
    unknown: 99
  };

  analysis.files.sort(
    (a, b) =>
      (order[a.profile.type] ?? 99) -
      (order[b.profile.type] ?? 99)
  );

  for (const item of analysis.files) {
    const type =
      item.profile.type;

    if (type === "unknown") {
      report.fileResults.push({
        name: item.file.name,
        type: "Unrecognized CSV",
        rows: item.rows.length,
        skipped: true,
        reason: item.profile.reason
      });

      forgeImportAddWarning(
        report,
        {
          file: item.file.name,
          row: null,
          person: "File skipped",
          message:
            item.profile.reason
        }
      );

      continue;
    }

    report.filesProcessed++;

    report.fileResults.push({
      name: item.file.name,
      type:
        forgeImportSourceLabel(type),
      rows: item.rows.length,
      skipped: false,
      reason: ""
    });

    for (
      let index = 0;
      index < item.rows.length;
      index++
    ) {
      const incoming =
        forgeImportCanonicalRow(
          item.rows[index]
        );

      await forgeImportProcessRow(
        incoming,
        type,
        {
          report,
          file: item.file.name,
          row: index + 2
        }
      );
    }
  }

  await loadCSV();

  return report;
}

// ----------------------------------------------------------
// Multi-file selection preview
// ----------------------------------------------------------

importFileInput?.addEventListener(
  "change",
  async () => {
    if (!selectedImportFiles.length) {
      return;
    }

    try {
      const analysis =
        await forgeImportAnalyzeFiles(
          selectedImportFiles
        );

      forgeImportRenderFilePreview(
        analysis
      );
    } catch (error) {
      console.error(
        "FORGE IMPORT PREVIEW ERROR:",
        error
      );
    }
  }
);

// ----------------------------------------------------------
// Run the safe batch
// ----------------------------------------------------------

confirmImport?.addEventListener(
  "click",
  async () => {

    if (!selectedImportFiles.length) {
      return;
    }

    const button =
      document.getElementById(
        "confirmImport"
      );

    const progress =
      document.getElementById(
        "importProgress"
      );

    const reportBox =
      document.getElementById(
        "importSafetyReport"
      );

    if (button) {
      button.disabled = true;
      button.textContent =
        "Reviewing & Importing...";
    }

    if (progress) {
      progress.classList.remove("hidden");
      progress.textContent =
        "FORGE is validating identities, hierarchy, and progress before saving...";
    }

    reportBox?.classList.add("hidden");

    try {
      const report =
        await forgeRunSafeMultiSourceImport(
          selectedImportFiles
        );

      forgeRenderSafeImportReport(
        report
      );

      if (button) {
        button.textContent =
          "Import Complete";
      }

    } catch (error) {
      console.error(
        "FORGE SAFE IMPORT ERROR:",
        error
      );

      if (progress) {
        progress.textContent =
          "Import stopped: " +
          (
            error?.message ||
            String(error)
          );
      }

      if (button) {
        button.disabled = false;
        button.textContent =
          "Try Import Again";
      }
    }
  }
);

// ----------------------------------------------------------
// Review modal close/cancel
// ----------------------------------------------------------

[
  "closeImportReview",
  "cancelImport"
].forEach((buttonId) => {
  document
    .getElementById(buttonId)
    ?.addEventListener(
      "click",
      () => {
        document
          .getElementById(
            "importReviewModal"
          )
          ?.classList.add("hidden");

        selectedImportFiles = [];
        renderSelectedImportFiles();

        const progress =
          document.getElementById(
            "importProgress"
          );

        progress?.classList.add("hidden");

        const report =
          document.getElementById(
            "importSafetyReport"
          );

        report?.classList.add("hidden");
      }
    );
});

function setupUplineAutocomplete() {

  const input =
    document.getElementById(
      "newAgentUpline"
    );

  const codeInput =
    document.getElementById(
      "newAgentUplineCode"
    );

  const suggestions =
    document.getElementById(
      "uplineSuggestions"
    );

  if (
    !input ||
    !codeInput ||
    !suggestions
  ) {
    return;
  }


  function closeSuggestions() {
    suggestions.innerHTML = "";
    suggestions.classList.add(
      "hidden"
    );
  }


  function showSuggestions(
    searchText
  ) {

    const query =
      String(
        searchText || ""
      )
        .trim()
        .toLowerCase();


    if (!query) {
      closeSuggestions();
      return;
    }


    const matches =
      [...allAgents]
        .filter(agent => {

          if (!agent?.name) {
            return false;
          }


          if (
            selectedAgent?.id &&
            String(agent.id) ===
            String(
              selectedAgent.id
            )
          ) {
            return false;
          }


          return String(
            agent.name
          )
            .toLowerCase()
            .includes(query);

        })
        .sort(
          (a, b) =>
            String(a.name)
              .localeCompare(
                String(b.name)
              )
        )
        .slice(0, 8);


    if (!matches.length) {

      suggestions.innerHTML = `
        <div class="upline-no-match">
          No matching upline found.
          You can keep the name you typed.
        </div>
      `;

      suggestions.classList.remove(
        "hidden"
      );

      return;
    }


    suggestions.innerHTML =
      matches
        .map(agent => `
          <button
            type="button"
            class="upline-suggestion"
            data-upline-name="${escapeForgeText(
              agent.name
            )}"
            data-upline-code="${escapeForgeText(
              agent.code || ""
            )}"
          >
            <span>
              <strong>
                ${escapeForgeText(
                  agent.name
                )}
              </strong>

              ${
                agent.code
                  ? `
                    <small>
                      ${escapeForgeText(
                        agent.code
                      )}
                    </small>
                  `
                  : ""
              }
            </span>
          </button>
        `)
        .join("");


    suggestions.classList.remove(
      "hidden"
    );
  }


  input.addEventListener(
    "input",
    () => {

      // Once they start typing again,
      // reset the selected code until
      // they choose a suggestion.
      codeInput.value = "";

      showSuggestions(
        input.value
      );

    }
  );


  suggestions.addEventListener(
    "click",
    event => {

      const option =
        event.target.closest(
          ".upline-suggestion"
        );

      if (!option) return;


      input.value =
        option.dataset
          .uplineName || "";

      codeInput.value =
        option.dataset
          .uplineCode || "";


      closeSuggestions();

    }
  );


  document.addEventListener(
    "click",
    event => {

      if (
        !event.target.closest(
          ".autocomplete-field"
        )
      ) {
        closeSuggestions();
      }

    }
  );
}