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
    brand.logo = brand.logo || "./assets/apex-wealth-building-logo.png";
    brand.primary = org.email_primary_color || "#071d13";
    brand.accent = org.email_accent_color || "#c9a227";
    brand.tagline = org.email_tagline || "We build wealth. We impact lives.";
  } else if (key.includes("bizzall")) {
    brand.logo = brand.logo || "./assets/bizzall-logo.png";
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
      "Gmail will open in a new tab with this email prefilled.";
  }

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



function forgeOpenCommandChannel(method) {
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

    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
    window.location.href =
      `sms:+${phone}${separator}body=${encodeURIComponent(message)}`;
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

    const url =
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank", "noopener,noreferrer");
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