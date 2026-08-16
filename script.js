console.log("✅ FORGE SCRIPT LOADED - NEW VERSION");
let allAgents = [];
let pendingImportAgents = [];
let selectedCoordinator = "All";
let selectedAgent = null;
let commandCurrentPage = 1;
let selectedGrowthTeam = null;
let currentForgeMission = [];
let availableOrganizations = [];
let currentOrganization = null;
let isPlatformAdmin = false;
const commandPageSize = 11;
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

// ==========================================================
// HOME — TODAY'S WORK QUEUE
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
    // LICENSED — READY FOR CONTRACTING
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
    // NOT PLACED — STALLED / NOT STARTED
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
  document
  .getElementById(
    "startFollowUpsBtn"
  )
  ?.addEventListener(
    "click",
    () => {

      const agents =
        currentForgeMission
          .map(
            (item) =>
              item.agent
          );


      if (!agents.length) {
        return;
      }


      launchForgeContext({
        type: "mission",

        title:
          "Today's Mission",

        reason:
          "Highest-impact coordinator actions",

        agents
      });

    }
  );


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
            : "—"
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
    return "✓";
  }

  if (
    text.includes("exam")
  ) {
    return "□";
  }

  if (
    text.includes("quiz")
  ) {
    return "→";
  }

  if (
    text.includes("movement") ||
    text.includes("started")
  ) {
    return "◷";
  }

  return "•";
}


function formatHomeDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
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

// ─── CSV ──────────────────────────────────────────────────────────────────────

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
// Active, License, Contracted  → Contracted
// Active, Contracted, License  → Contracted
// Active, License              → Licensed
// Inactive, License            → Licensed
// Active, Non-Licensed         → XCEL
// Inactive, Non-Licensed       → Not Placed
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

  // 1. Agent Code — strongest match
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
document
  .getElementById("pulseActionBtn")
  ?.addEventListener(
    "click",
    () => {

      const agents =
        allAgents.filter(
          (agent) =>
            agent.stage === "Licensed"
        );

      launchForgeContext({
        type: "contracting",

        title:
          "Contracting Focus",

        reason:
          "Licensed agents awaiting contracting",

        agents
      });

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
  .getElementById("forgeInsightBtn")
  ?.addEventListener("click", () => {

    showPage("Command");

    document
      .querySelectorAll(".nav-btn")
      .forEach((btn) =>
        btn.classList.toggle(
          "active",
          btn.textContent.trim() === "Command"
        )
      );

  });
document
  .getElementById("pulseActionBtn")
  ?.addEventListener("click", () => {

    showPage("Agents");

    document
      .querySelectorAll(".nav-btn")
      .forEach((btn) =>
        btn.classList.toggle(
          "active",
          btn.textContent.trim() === "Agents"
        )
      );

  });

// ==========================================================
// HOME — PIPELINE OVERVIEW
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
    "Not Placed": "⊙",
    "Quiz Sent": "↗",
    "XCEL Completed": "▣",
    "Exam Passed": "▦",
    "Licensed": "◇",
    "Contracted": "✓"
  };

  return icons[stage] || "•";
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
// ─── FILTER BUTTONS ───────────────────────────────────────────────────────────

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

// Pipeline Overview → Journey
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


// Organization Pulse → Growth
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

// ─── LOAD AGENTS FROM SUPABASE ────────────────────────────────────────────────

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

console.log("Agents loaded from Supabase:", allAgents.length);

renderAllPages();

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
    "XCEL Completed": "✓ Passed Exam",
    "Exam Passed": "✓ Licensed",
    "Licensed": "✓ Contracted",
    "Contracted": ""
  };

  return labels[stage] || "";
}
// ─── JOURNEY PAGE ─────────────────────────────────────────────────────────────

function renderJourneyPage() {
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
              <span>→</span>
            </button>
          `
          : `
            <span class="journey-complete">
              ✓ Complete
            </span>
          `
      }

      <button
        class="journey-more-btn"
        data-agent-menu="${agent.id}"
        aria-label="Agent options"
      >
        •••
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
        ? "Show less ↑"
        : `View all ${stageAgents.length} agents →`;

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

  const role =
    currentUserProfile.role ||
    "Coordinator";

  const email =
    currentUserProfile.email ||
    "";

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
// KEEP THIS AT TOP LEVEL — NOT INSIDE ANOTHER FUNCTION
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
    "—"
  );

  setText(
    "profileStatus",
    agent.teamStatus ||
    agent.status ||
    "—"
  );

  setText(
    "profileStage",
    agent.stage || "—"
  );

  setText(
    "profileCode",
    agent.code || "—"
  );

  setText(
    "profilePhone",
    agent.phone || "—"
  );

  setText(
    "profileEmail",
    agent.email || "—"
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
// ─── AGENTS PAGE ─────────────────────────────────────────────────────────────

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
   AGENT PROFILE — MILESTONE PROGRESS
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
  /^[-–—]+$/.test(cleanValue);

const hasValue =
  cleanValue !== "" &&
  !isOnlyDashes &&
  normalizedValue !== "pending" &&
  normalizedValue !== "none" &&
  normalizedValue !== "no" &&
  normalizedValue !== "n/a";

el.textContent =
  hasValue ? cleanValue : "—";

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

  setText(
  "commandAvatar",
  getInitials(getAgentDisplayName(agent))
);
  setText(
  "commandName",
  getAgentDisplayName(agent)
);
  // UPLINE
setText(
  "commandMeta",
  agent.upline ||
  agent.coordinator ||
  "No upline"
);
  setText("commandStageBadge", agent.stage || "Not Placed");

  // ==========================================================
  // COMMAND CENTER - COMPLIANCE STATUS
  // ==========================================================
  setComplianceValue(
    "commandResidentLicense",
    agent.residentLicense
  );

  setComplianceValue(
    "commandEO",
    agent.eoStatus
  );

  setComplianceValue(
    "commandAML",
    agent.amlStatus
  );

  setComplianceValue(
    "commandTevahFee",
    agent.tevahPlatformFee
  );

  const recommended =
    recommendedActionMap[agent.stage] || {
      title: "Review Agent",
      text: "Review this agent's current licensing status."
    };

  setText("recommendedTitle", recommended.title);
  setText("recommendedText", recommended.text);

  renderCoordinatorActions(agent);
  renderLicensingChecklist(agent);
  renderActivityTimeline(agent);
  updateCommandInsights(agent);
  renderTodayQueue();
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
          <div class="coordinator-action-icon">
  ${getCoordinatorActionIcon(action)}
        </div>
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

  setActiveDelivery(method);

  const stage = selectedAgent.stage || "Not Placed";
  const template = getStageMessageTemplate(stage, method, selectedAgent);

  setText("smartMethodBadge", method);
  setText("actionTitle", `${method} • ${selectedAgent.name}`);
  setText("actionSubtitle", getActionSubtitle(method, stage));

  setText("smartAgentName", selectedAgent.name || "—");
  setText("smartAgentStage", stage);
  setText("smartAgentUpline", selectedAgent.upline || selectedAgent.coordinator || "—");

  //---phone 
  const smartPhone = document.getElementById("smartAgentPhone");

if (smartPhone) {
  const phone = selectedAgent.phone || "";

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    smartPhone.innerHTML = `<a href="tel:${cleanPhone}" class="phone-link">📱 ${phone}</a>`;
  } else {
    smartPhone.textContent = "No phone";
  }
}

  // Phone Number
const phoneEl = document.getElementById("smartAgentPhone");

if (phoneEl) {
    if (selectedAgent.phone) {
        phoneEl.innerHTML = `
            <a href="tel:${selectedAgent.phone.replace(/\D/g, "")}"
               class="phone-link">
               📱 ${selectedAgent.phone}
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

  if (subjectEl) subjectEl.value = template.subject || "";
  if (messageEl) messageEl.value = template.body || "";
}

/*Helper*/
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

  logCoordinatorActivity(selectedAgent, method, message);
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
// If agent does not exist → create them.
// If agent already exists → update their existing record.
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

// ─── COMPLIANCE CSV IMPORT ────────────────────────────────────────────────────

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
// ─── STORAGE ─────────────────────────────────────────────────────────────────

function saveAgentsToLocalStorage() {
  localStorage.setItem("forgeAgents", JSON.stringify(allAgents));
}

// ─── GROWTH PAGE ─────────────────────────────────────────────────────────────

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
  // strong movement from licensed → contracted.
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
// GROWTH PAGE — FULL ORGANIZATION HIERARCHY
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
        ${team.direct} direct • ${team.total} organization
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
    `${team.total} organization members • ${team.direct} direct recruits`
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
          ›
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
// ─── DOM READY ────────────────────────────────────────────────────────────────

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
      .replace(/😊/g, "")
      + "\n\nThank you.";
  }

  if (style === "friendly") {
    box.value =
      `Hi ${selectedAgent?.name || ""}, 😊\n\n` +
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
// HOME → JOURNEY ACTIVATE STAGE
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
