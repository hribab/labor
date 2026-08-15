"use strict";

const crypto = require("crypto");

const GENERATOR_NAME = "Labor Ad Hoc Idea Generator";
const AUTONOMOUS_GENERATOR_NAME = "Autonomous Agent";
const GENERATION_MODE = "ad_hoc";
const AUTONOMOUS_GENERATION_MODE = "autonomous_pipeline";
const SPECIES = ["saas", "game", "agent"];
const IDEA_COUNTS = Object.freeze({ saas: 4, game: 3, agent: 3 });
const TOTAL_IDEAS = Object.values(IDEA_COUNTS).reduce(
  (total, count) => total + count,
  0
);
const MAX_CUSTOM_INSTRUCTIONS = 6000;
const ACTIVE_RUN_LEASE_MS = 20 * 60 * 1000;
const AUTONOMOUS_ACTIVE_RUN_LEASE_MS = 4 * 60 * 60 * 1000;

const SAAS_MARKETS = [
  "construction operations", "small manufacturing", "healthcare administration",
  "legal operations", "education administration", "property management",
  "local logistics", "agriculture operations", "independent hospitality",
  "insurance operations", "local government", "professional services",
  "retail operations", "energy operations", "automotive services",
  "financial operations", "media production", "scientific research",
  "nonprofit operations", "home services",
];
const SAAS_CUSTOMERS = [
  "independent professional", "freelancer", "small business owner",
  "operations manager", "department lead", "field worker",
  "regulated professional", "local government employee", "online creator",
  "marketplace seller", "small research team", "consumer household",
];
const ORGANIZATION_SIZES = [
  "single user", "2-10 employees", "11-50 employees", "51-250 employees",
];
const SAAS_PROBLEMS = [
  "important evidence is scattered across user-owned files",
  "the same facts are repeatedly re-entered into different records",
  "deadlines are missed because obligations are not converted into actions",
  "errors are found only after a workflow is complete",
  "specialized decisions have no reusable audit trail",
  "documents require slow line-by-line comparison",
  "small operational risks stay invisible until they become expensive",
  "customers abandon a long and confusing intake process",
  "recurring work depends on one person's memory",
  "service quality varies because exceptions are not remembered",
  "teams cannot tell which records are incomplete",
  "business owners cannot compare scenarios using their own data",
  "review notes never become reusable operating rules",
  "work queues hide the reason an item is blocked",
  "completed work cannot be reconstructed from its evidence",
];
const PAIN_FREQUENCIES = ["multiple times per day", "daily", "weekly", "monthly"];
const PAIN_SEVERITIES = [
  "lost productivity", "lost revenue", "customer churn", "regulatory exposure",
  "business-critical failure",
];
const WORKAROUNDS = [
  "spreadsheets", "shared documents", "paper forms", "manual copy and paste",
  "unstructured folders", "generic task lists", "personal memory", "no formal process",
];
const WORKFLOW_STAGES = [
  "intake", "data collection", "planning", "creation", "review", "execution",
  "monitoring", "reporting", "renewal", "compliance",
];
const SAAS_PRODUCT_TYPES = [
  "single-purpose workflow workspace", "focused system of record",
  "document-to-record compiler", "evidence completeness checker",
  "exception memory", "decision-support workspace", "obligation tracker",
  "scenario comparison tool", "quality-control queue", "self-service intake flow",
];
const SAAS_AI_ROLES = [
  "extract structured facts from user-provided material",
  "classify records using a user-owned taxonomy",
  "turn evidence into a complete draft",
  "recommend the next action from stored state",
  "detect contradictions across user-owned records",
  "explain why a record is incomplete",
  "compare versions and isolate consequential changes",
  "convert repeated exceptions into reusable rules",
  "simulate outcomes from user-entered assumptions",
  "verify work against an explicit checklist",
];
const USER_OWNED_DATA = [
  "typed records", "uploaded documents", "uploaded images", "saved checklists",
  "user-authored templates", "prior generated outputs", "project histories",
  "user-entered measurements", "uploaded tables", "in-product activity logs",
];
const INTERACTION_MODELS = [
  "focused dashboard", "in-product inbox", "single-purpose workspace", "timeline",
  "guided form", "visual queue", "comparison canvas", "searchable record library",
];
const SAAS_DISTRIBUTION = [
  "shareable product-generated reports", "public template pages",
  "free in-product diagnostic", "user-invited collaborators",
  "searchable educational pages", "downloadable example workspaces",
  "recipient-to-user sharing loop", "public benchmark summaries from opt-in data",
];
const INNOVATION_LENSES = [
  "remove one entire workflow step", "replace waiting with immediate structured output",
  "turn repeated judgment into reusable product memory",
  "convert a manual service into self-service software",
  "detect the problem before the user notices",
  "make the product improve from user-owned history",
  "make every output explain its evidence",
  "make an expensive capability practical for a very small team",
];
const INSPIRATION_DOMAINS = [
  "video game progression", "air traffic control", "biological ecosystems",
  "financial ledgers", "emergency triage", "manufacturing quality gates",
  "scientific notebooks", "version control", "library catalogues", "flight checklists",
];
const MONETIZATION_MODELS = [
  "low-cost monthly subscription", "per-workspace subscription",
  "usage tier based on stored projects", "free core with a paid professional edition",
  "annual small-team license",
];

const GAME_REFERENCES = [
  ["Tetris", "fit falling shapes into complete lines"],
  ["Snake", "grow while navigating a tightening grid"],
  ["Pac-Man", "route through a maze while avoiding pursuers"],
  ["Minesweeper", "deduce hidden hazards from local numeric clues"],
  ["2048", "merge matching tiles to create higher values"],
  ["Wordle", "use constrained feedback to discover a hidden answer"],
  ["Flappy Bird", "survive a one-input obstacle course"],
  ["Angry Birds", "solve structures with limited physics-based launches"],
  ["Plants vs. Zombies", "place defenders against lane-based waves"],
  ["Candy Crush", "match adjacent pieces to trigger cascades"],
  ["Vampire Survivors", "move through swarms while attacks fire automatically"],
  ["Slay the Spire", "build a deck through branching combat choices"],
  ["Balatro", "combine familiar card hands with escalating modifiers"],
  ["Crossy Road", "advance through shifting lanes one move at a time"],
  ["Breakout", "redirect a bouncing projectile to clear a field"],
  ["Doodle Jump", "climb an endless field of temporary platforms"],
  ["Fruit Ninja", "identify and strike fast-moving targets"],
  ["Geometry Dash", "memorize and execute a rhythmic obstacle sequence"],
  ["Sudoku", "satisfy intersecting placement constraints"],
  ["Solitaire", "reorder constrained card stacks toward a complete state"],
];
const GAME_TWISTS = [
  "the board rewrites one rule after every successful round",
  "the player's previous failures return as helpful ghost hints",
  "two familiar mechanics alternate every thirty seconds",
  "the level is built from a short phrase entered before play",
  "every reward also creates a future obstacle",
  "the player can bank one mistake and replay it strategically",
  "the board remembers favorite tactics and counters them",
  "the same compact level changes meaning when viewed from another side",
  "progress is driven by deliberately choosing a handicap",
  "the player edits one rule between rounds, then lives with the consequence",
  "a shrinking play area turns efficiency into the main skill",
  "failed runs leave behind one persistent tool for the next attempt",
  "the scoring system rewards elegant solutions rather than speed",
  "the level alternates between planning and five-second execution bursts",
  "pieces carry memories from the previous three moves",
  "the player must protect the mistake that created the current advantage",
];
const GAME_THEMES = [
  "tiny night market", "abandoned orbital greenhouse", "living sketchbook",
  "clockwork kitchen", "subterranean radio station", "storm-chasing caravan",
  "miniature museum after closing", "dreamlike city transit map",
  "deep-sea repair shop", "paper theatre", "haunted office archive",
  "floating neighborhood", "impossible botanical library", "retro computer desktop",
  "mountain rescue board", "cosmic laundromat",
];
const GAME_SESSIONS = ["2-4 minutes", "5-8 minutes", "10-15 minutes"];
const GAME_MODES = [
  "solo", "solo with asynchronous ghost replays", "local pass-and-play",
  "asynchronous turn exchange stored in Firestore",
];
const GAME_PROGRESSION = [
  "short run unlocks", "persistent rule modifiers", "branching challenge map",
  "daily seeded boards", "cosmetic collection earned through mastery",
  "compact campaign of escalating variants",
];
const GAME_VISUALS = [
  "clean geometric shapes", "paper-cut collage", "high-contrast pixel art",
  "hand-drawn notebook marks", "minimal neon arcade", "toy-like isometric pieces",
];

const AGENT_DOMAINS = [
  "document preparation", "project planning", "personal operations",
  "small-team knowledge", "quality assurance", "research synthesis from uploaded sources",
  "application intake", "policy comparison", "creative production planning",
  "record normalization", "learning material creation", "decision documentation",
  "meeting-free status synthesis", "inventory reasoning from user-entered records",
  "case-file organization",
];
const AGENT_USERS = [
  "independent professional", "small business owner", "project lead", "researcher",
  "teacher", "student", "online creator", "operations coordinator",
  "regulated professional", "small internal team",
];
const AGENT_GOALS = [
  "turn an unstructured intake into a complete working record",
  "transform uploaded material into a sequenced execution plan",
  "compare a new artifact against stored requirements and repair gaps",
  "maintain a living summary from user-owned project state",
  "convert repeated decisions into a reusable operating playbook",
  "produce a final deliverable and its evidence trail from one brief",
  "find contradictions across a private collection and propose resolutions",
  "split a complex objective into independently completed work packets",
  "normalize many inconsistent records into one dependable schema",
  "generate and maintain a scenario tree from changing assumptions",
];
const AGENT_TRIGGERS = [
  "the user uploads a file set", "the user submits a structured brief",
  "an in-product record enters a ready state", "the user starts a saved workflow",
  "a Firebase-owned scheduled batch becomes due", "the user adds material to a workspace",
];
const AGENT_INPUTS = [
  "typed instructions", "uploaded documents", "uploaded images", "uploaded tables",
  "saved product records", "user-authored rules", "prior in-product outputs",
  "project history stored in Firestore",
];
const AGENT_WORKFLOWS = [
  "intake, classify, transform, verify, store",
  "plan, execute independent steps, reconcile, publish",
  "extract claims, link evidence, challenge gaps, produce final output",
  "compare versions, identify consequences, update the living record",
  "decompose objective, run parallel reasoning, merge and quality-check",
  "observe stored state, prioritize work, complete actions, log decisions",
];
const AGENT_MEMORY = [
  "workspace facts and decisions", "user-owned terminology and templates",
  "prior exceptions and their resolutions", "project state and completed steps",
  "quality rules inferred from accepted outputs", "versioned evidence graph",
];
const AGENT_OUTPUTS = [
  "completed structured workspace", "evidence-linked report", "versioned action plan",
  "normalized record set", "finished document package", "decision log with next actions",
];

const FIXED_HARD_CONSTRAINTS = [
  "must run with Firebase Hosting, Firestore, Firebase Storage, and direct LLM calls only",
  "must require no third-party account, API, integration, data feed, or external tool",
  "must require no founder, operator, reviewer, approver, concierge, or manual fulfillment",
  "must complete its promised value loop after ordinary end-user input",
];

function createLaborAdHocGenerator(dependencies) {
  const {
    admin,
    db,
    logger,
    rootCollection,
    authenticateRequest,
    handleCors,
    getHttpStatus,
    getErrorMessage,
    loadConfiguredLlm,
    callStructuredLlm,
    serializeLlmProvider,
    enqueueAutonomousGeneration,
    enqueueAutonomousProducts,
  } = dependencies;

  if (!admin || !db || !authenticateRequest || !callStructuredLlm) {
    throw new Error("Labor ad hoc generator dependencies are incomplete.");
  }

  const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

  function laborAdHocRef(ownerEmail) {
    return db
      .collection(rootCollection)
      .doc(ownerEmail)
      .collection("agents")
      .doc("laborAdHoc");
  }

  function generationRef(ownerEmail, generationId) {
    return laborAdHocRef(ownerEmail).collection("generations").doc(generationId);
  }

  async function createGeneration({ ownerEmail, customInstructions, autonomous }) {
    const nowMs = Date.now();
    const generationId = `${autonomous ? "agent" : "adhoc"}_${nowMs}_${crypto
      .randomBytes(5)
      .toString("hex")}`;
    const controlRef = laborAdHocRef(ownerEmail);
    const genRef = generationRef(ownerEmail, generationId);
    const entropy = createEntropy();
    const genomes = generateGenomePopulation({
      customInstructionsPresent: Boolean(customInstructions),
      createdAtMs: nowMs,
      entropy,
    });
    const generator = autonomous ? AUTONOMOUS_GENERATOR_NAME : GENERATOR_NAME;
    const mode = autonomous ? AUTONOMOUS_GENERATION_MODE : GENERATION_MODE;
    const status = autonomous ? "queued" : "running";
    const phase = autonomous ? "queued" : "generating_ideas";
    let generationNumber = 1;

    await db.runTransaction(async (transaction) => {
      const controlSnapshot = await transaction.get(controlRef);
      const control = controlSnapshot.exists ? controlSnapshot.data() || {} : {};
      const activeLeaseMs = control.mode === AUTONOMOUS_GENERATION_MODE
        ? AUTONOMOUS_ACTIVE_RUN_LEASE_MS
        : ACTIVE_RUN_LEASE_MS;
      const activeIsFresh =
        ["queued", "running", "retrying"].includes(String(control.status || "")) &&
        Number(control.updatedAtMs || 0) > nowMs - activeLeaseMs;
      if (activeIsFresh) {
        throw httpError(
          "Agent already has an active generation and release run.",
          409,
          "labor_ad_hoc_active",
          { generationId: cleanText(control.activeGenerationId, 200) }
        );
      }

      generationNumber = Math.max(0, Number(control.generationCount || 0)) + 1;
      transaction.create(genRef, {
        id: generationId,
        generationId,
        generationNumber,
        generator,
        mode,
        autonomous,
        status,
        phase,
        phaseLabel: autonomous
          ? "Autonomous run queued"
          : "Generating ten fresh ideas",
        activity: autonomous
          ? "Waiting for the idea-generation worker."
          : "Expressing four SaaS, three game, and three AI-agent genomes.",
        counts: { saas: 0, game: 0, agent: 0, total: 0 },
        ideaTarget: { ...IDEA_COUNTS, total: TOTAL_IDEAS },
        strategy: "crypto_genomes_single_model_call",
        modelCallCount: 1,
        customInstructions,
        hasCustomInstructions: Boolean(customInstructions),
        entropy: cleanValue(entropy),
        genomes: cleanValue(genomes),
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        completedAtMs: 0,
        error: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(controlRef, {
        generator,
        mode,
        autonomous,
        status,
        phase,
        activeGenerationId: generationId,
        latestGenerationId: generationId,
        generationCount: generationNumber,
        hasCustomInstructions: Boolean(customInstructions),
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });

    return {
      ownerEmail,
      generationId,
      generationNumber,
      customInstructions,
      autonomous,
      nowMs,
      entropy,
      genomes,
    };
  }

  async function expressGeneration(context) {
    const {
      ownerEmail,
      generationId,
      generationNumber,
      customInstructions,
      autonomous,
      nowMs,
      entropy,
      genomes,
    } = context;
    const controlRef = laborAdHocRef(ownerEmail);
    const genRef = generationRef(ownerEmail, generationId);
    const startedAtMs = Date.now();

    await Promise.all([
      genRef.set({
        status: "running",
        phase: "generating_ideas",
        phaseLabel: "Generating ten product ideas",
        activity: "Expressing four SaaS, three game, and three AI-agent genomes.",
        error: "",
        updatedAtMs: startedAtMs,
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      controlRef.set({
        status: "running",
        phase: "generating_ideas",
        activeGenerationId: generationId,
        error: "",
        updatedAtMs: startedAtMs,
        updatedAt: serverTimestamp(),
      }, { merge: true }),
    ]);

    const [llm, previousIdeas] = await Promise.all([
      loadConfiguredLlm(ownerEmail),
      loadPreviousIdeaMemory(ownerEmail),
    ]);
    const rawResult = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: ideaGenerationSystemInstruction(),
      prompt: ideaGenerationPrompt({
        genomes,
        customInstructions,
        previousIdeas,
        entropy,
      }),
      schema: ideaPopulationSchema(),
      name: autonomous ? "autonomous_agent_ideas" : "labor_ad_hoc_ideas",
    });
    const model = serializeLlmProvider(llm);
    const ideas = normalizeIdeaPopulation(rawResult, genomes, {
      generationId,
      generationNumber,
      generator: autonomous ? AUTONOMOUS_GENERATOR_NAME : GENERATOR_NAME,
      mode: autonomous ? AUTONOMOUS_GENERATION_MODE : GENERATION_MODE,
      autonomous,
      customInstructionsPresent: Boolean(customInstructions),
      model,
      createdAtMs: nowMs,
    });

    const readyAtMs = Date.now();
    const batch = db.batch();
    ideas.forEach((idea) => {
      const storedIdea = {
        ...idea,
        pipelineStatus: autonomous ? "queued" : "idea_ready",
        pipelinePhase: autonomous ? "queued_for_build" : "generated",
        buildAttempts: 0,
        runId: "",
        messageId: "",
        releaseId: "",
        previewUrl: "",
        releaseUrl: "",
        pipelineError: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(genRef.collection("ideas").doc(idea.id), storedIdea);
      batch.set(controlRef.collection("ideas").doc(idea.id), storedIdea);
    });
    batch.set(genRef, {
      status: autonomous ? "running" : "completed",
      phase: autonomous ? "dispatching_products" : "completed",
      phaseLabel: autonomous ? "Ideas ready. Scheduling builds" : "Ten ideas ready",
      activity: autonomous
        ? "Scheduling code generation, deployment, and release for every idea."
        : "A fresh ad hoc batch is ready.",
      counts: {
        ...IDEA_COUNTS,
        total: TOTAL_IDEAS,
        productsQueued: autonomous ? TOTAL_IDEAS : 0,
        productsBuilding: 0,
        productsReleasing: 0,
        productsReleased: 0,
        productsFailed: 0,
      },
      model,
      completedAtMs: autonomous ? 0 : readyAtMs,
      updatedAtMs: readyAtMs,
      ...(autonomous ? {} : { completedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(controlRef, {
      status: autonomous ? "running" : "completed",
      phase: autonomous ? "dispatching_products" : "completed",
      activeGenerationId: autonomous ? generationId : "",
      latestGenerationId: generationId,
      latestIdeaCount: TOTAL_IDEAS,
      model,
      updatedAtMs: readyAtMs,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    if (autonomous) {
      await dispatchAutonomousProducts({ ownerEmail, generationId, ideas });
    }

    return { ideas, model };
  }

  async function dispatchAutonomousProducts({ ownerEmail, generationId, ideas }) {
    if (typeof enqueueAutonomousProducts !== "function") {
      throw new Error("The autonomous product queue is not configured.");
    }
    const dispatch = await enqueueAutonomousProducts({
      email: ownerEmail,
      generationId,
      ideas: ideas.map((idea) => ({
        id: idea.id,
        species: idea.species,
        speciesRank: idea.speciesRank,
      })),
    });
    const queuedIdeaIds = new Set(dispatch?.queuedIdeaIds || ideas.map((idea) => idea.id));
    const failures = Array.isArray(dispatch?.failures) ? dispatch.failures : [];
    const failedById = new Map(failures.map((failure) => [failure.ideaId, failure]));
    const nowMs = Date.now();
    const genRef = generationRef(ownerEmail, generationId);
    const controlRef = laborAdHocRef(ownerEmail);
    const batch = db.batch();
    let batchWriteCount = 0;

    ideas.forEach((idea) => {
      if (queuedIdeaIds.has(idea.id) && !failedById.has(idea.id)) return;
      const error = cleanText(
        failedById.get(idea.id)?.error || "The product worker could not be queued.",
        1200
      );
      const patch = {
        pipelineStatus: "failed",
        pipelinePhase: "build_queue_failed",
        pipelineError: error,
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      };
      batch.set(genRef.collection("ideas").doc(idea.id), patch, { merge: true });
      batch.set(controlRef.collection("ideas").doc(idea.id), patch, { merge: true });
      batchWriteCount += 2;
    });

    const queuedCount = ideas.filter((idea) => queuedIdeaIds.has(idea.id)).length;
    const failedCount = TOTAL_IDEAS - queuedCount;
    const noWorkersQueued = queuedCount === 0;
    if (noWorkersQueued) {
      batch.set(genRef, {
        status: "failed",
        phase: "failed",
        phaseLabel: "Product workers could not be queued",
        activity: "No product worker could be queued.",
        counts: {
          ...IDEA_COUNTS,
          total: TOTAL_IDEAS,
          productsQueued: 0,
          productsBuilding: 0,
          productsReleasing: 0,
          productsReleased: 0,
          productsFailed: TOTAL_IDEAS,
        },
        error: "No product worker could be queued.",
        completedAtMs: nowMs,
        updatedAtMs: nowMs,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batch.set(controlRef, {
        status: "failed",
        phase: "failed",
        activeGenerationId: "",
        error: "No product worker could be queued.",
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      batchWriteCount += 2;
    }
    if (batchWriteCount) await batch.commit();
    if (noWorkersQueued) {
      throw new Error("No autonomous product worker could be queued.");
    }

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(genRef);
      const generation = snapshot.exists ? snapshot.data() || {} : {};
      if (["completed", "failed"].includes(cleanText(generation.status, 80))) return;
      transaction.set(genRef, {
        phase: "building_products",
        phaseLabel: `Building and releasing ${queuedCount} products`,
        activity: failedCount
          ? `${queuedCount} product workers queued; ${failedCount} could not be scheduled.`
          : "All ten products are building in parallel.",
        error: "",
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(controlRef, {
        status: "running",
        phase: "building_products",
        activeGenerationId: generationId,
        error: "",
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
  }

  async function generateLaborIdeas(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("POST only");

    let context = null;
    try {
      const identity = await authenticateRequest(req, req.body?.email);
      context = await createGeneration({
        ownerEmail: identity.email,
        customInstructions: cleanText(
          req.body?.customInstructions,
          MAX_CUSTOM_INSTRUCTIONS
        ),
        autonomous: false,
      });
      await expressGeneration(context);
      return res.status(200).json({
        ok: true,
        actionType: "labor_ad_hoc_generated",
        generationId: context.generationId,
        generationNumber: context.generationNumber,
        ideaCount: TOTAL_IDEAS,
        modelCallCount: 1,
        strategy: "crypto_genomes_single_model_call",
      });
    } catch (error) {
      logger.error("generateLaborIdeas error", {
        ownerEmail: context?.ownerEmail || "",
        generationId: context?.generationId || "",
        error: getErrorMessage(error),
      });
      if (context?.generationId) {
        await markGenerationFailed(context.ownerEmail, context.generationId, error)
          .catch(() => undefined);
      }
      return res.status(getHttpStatus(error)).json({
        ok: false,
        error: getErrorMessage(error),
        code: error?.code || "labor_ad_hoc_failed",
        generationId: error?.details?.generationId || context?.generationId || "",
      });
    }
  }

  async function startAutonomousAgent(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("POST only");

    let context = null;
    try {
      if (typeof enqueueAutonomousGeneration !== "function") {
        throw new Error("The autonomous generation queue is not configured.");
      }
      const identity = await authenticateRequest(req, req.body?.email);
      context = await createGeneration({
        ownerEmail: identity.email,
        customInstructions: cleanText(
          req.body?.customInstructions,
          MAX_CUSTOM_INSTRUCTIONS
        ),
        autonomous: true,
      });
      await enqueueAutonomousGeneration({
        email: context.ownerEmail,
        generationId: context.generationId,
      });
      return res.status(202).json({
        ok: true,
        actionType: "autonomous_agent_queued",
        generationId: context.generationId,
        generationNumber: context.generationNumber,
        ideaCount: TOTAL_IDEAS,
        productCount: TOTAL_IDEAS,
        status: "queued",
      });
    } catch (error) {
      logger.error("startAutonomousAgent error", {
        ownerEmail: context?.ownerEmail || "",
        generationId: context?.generationId || "",
        error: getErrorMessage(error),
      });
      if (context?.generationId) {
        await markGenerationFailed(context.ownerEmail, context.generationId, error)
          .catch(() => undefined);
      }
      return res.status(getHttpStatus(error)).json({
        ok: false,
        error: getErrorMessage(error),
        code: error?.code || "autonomous_agent_start_failed",
        generationId: error?.details?.generationId || context?.generationId || "",
      });
    }
  }

  async function runAutonomousAgentGeneration(request) {
    const payload = request?.data || {};
    const ownerEmail = cleanText(payload.email, 320).toLowerCase();
    const generationId = cleanText(payload.generationId, 200);
    if (!ownerEmail || !generationId) {
      throw new Error("Autonomous generation task payload is incomplete.");
    }

    const genRef = generationRef(ownerEmail, generationId);
    try {
      const snapshot = await genRef.get();
      if (!snapshot.exists) throw new Error("Autonomous generation no longer exists.");
      const generation = snapshot.data() || {};
      if (["completed", "failed"].includes(String(generation.status || ""))) return;
      if (generation.mode !== AUTONOMOUS_GENERATION_MODE) {
        throw new Error("Generation is not an autonomous Agent run.");
      }

      const existingIdeas = await genRef.collection("ideas").get();
      if (existingIdeas.size === TOTAL_IDEAS) {
        const storedIdeas = existingIdeas.docs.map((item) => ({
          id: item.id,
          ...(item.data() || {}),
        }));
        const resetBatch = db.batch();
        let resetCount = 0;
        storedIdeas.forEach((idea) => {
          if (!["failed", "retrying"].includes(
            cleanText(idea.pipelineStatus, 80).toLowerCase()
          )) return;
          const patch = {
            pipelineStatus: "queued",
            pipelinePhase: "queued_for_build",
            pipelineError: "",
            updatedAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          };
          resetBatch.set(genRef.collection("ideas").doc(idea.id), patch, { merge: true });
          resetBatch.set(
            laborAdHocRef(ownerEmail).collection("ideas").doc(idea.id),
            patch,
            { merge: true }
          );
          Object.assign(idea, patch);
          resetCount += 1;
        });
        if (resetCount) await resetBatch.commit();
        await dispatchAutonomousProducts({
          ownerEmail,
          generationId,
          ideas: storedIdeas,
        });
        return;
      }

      await expressGeneration({
        ownerEmail,
        generationId,
        generationNumber: Math.max(1, Number(generation.generationNumber || 1)),
        customInstructions: cleanText(
          generation.customInstructions,
          MAX_CUSTOM_INSTRUCTIONS
        ),
        autonomous: true,
        nowMs: Number(generation.createdAtMs || Date.now()),
        entropy: generation.entropy || createEntropy(),
        genomes: generation.genomes,
      });
    } catch (error) {
      const retrying = Number(request?.retryCount || 0) < 1;
      logger.error("runAutonomousAgentGeneration error", {
        ownerEmail,
        generationId,
        retrying,
        error: getErrorMessage(error),
      });
      if (retrying) {
        await markGenerationRetrying(ownerEmail, generationId, error).catch(() => undefined);
      } else {
        await markGenerationFailed(ownerEmail, generationId, error).catch(() => undefined);
      }
      throw error;
    }
  }

  async function loadPreviousIdeaMemory(ownerEmail) {
    const snapshot = await laborAdHocRef(ownerEmail).collection("ideas").limit(120).get();
    return snapshot.docs.map((item) => {
      const idea = item.data() || {};
      return cleanValue({
        species: idea.species,
        name: idea.name,
        fingerprint: idea.fingerprint,
      });
    });
  }

  async function markGenerationFailed(ownerEmail, generationId, error) {
    const nowMs = Date.now();
    const message = cleanText(getErrorMessage(error), 1200) || "Idea generation failed.";
    const batch = db.batch();
    batch.set(generationRef(ownerEmail, generationId), {
      status: "failed",
      phase: "failed",
      phaseLabel: "Generation failed",
      activity: message,
      error: message,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(laborAdHocRef(ownerEmail), {
      status: "failed",
      phase: "failed",
      activeGenerationId: "",
      latestGenerationId: generationId,
      error: message,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }

  async function markGenerationRetrying(ownerEmail, generationId, error) {
    const nowMs = Date.now();
    const message = cleanText(getErrorMessage(error), 1200) || "Worker failed.";
    const patch = {
      status: "retrying",
      phase: "retrying_idea_generation",
      phaseLabel: "Retrying idea generation",
      activity: message,
      error: message,
      updatedAtMs: nowMs,
      updatedAt: serverTimestamp(),
    };
    await Promise.all([
      generationRef(ownerEmail, generationId).set(patch, { merge: true }),
      laborAdHocRef(ownerEmail).set({
        ...patch,
        activeGenerationId: generationId,
        latestGenerationId: generationId,
      }, { merge: true }),
    ]);
  }

  return {
    generateLaborIdeas,
    startAutonomousAgent,
    runAutonomousAgentGeneration,
    __test: {
      createEntropy,
      generateGenomePopulation,
      ideaGenerationSystemInstruction,
      ideaGenerationPrompt,
      ideaPopulationSchema,
      normalizeIdeaPopulation,
    },
  };
}

function createEntropy() {
  return {
    requestNonce: crypto.randomUUID(),
    randomSeedHex: crypto.randomBytes(24).toString("hex"),
    randomSeedInteger: crypto.randomInt(1, 2147483647),
  };
}

function generateGenomePopulation({
  customInstructionsPresent = false,
  createdAtMs = Date.now(),
  entropy = createEntropy(),
} = {}) {
  const createdAt = new Date(createdAtMs).toISOString();
  const seen = new Set();
  const createSpecies = (species, factory) => {
    const population = [];
    for (let rank = 1; rank <= IDEA_COUNTS[species]; rank += 1) {
      let genome = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = factory(rank, createdAt, entropy, customInstructionsPresent);
        const signature = shortHash(JSON.stringify(candidate.dimensions));
        if (seen.has(`${species}:${signature}`)) continue;
        seen.add(`${species}:${signature}`);
        genome = { ...candidate, combinationSignature: signature };
        break;
      }
      if (!genome) throw new Error(`Could not sample a unique ${species} genome.`);
      population.push(genome);
    }
    return population;
  };

  return {
    saasGenomes: createSpecies("saas", createSaasGenome),
    gameGenomes: createSpecies("game", createGameGenome),
    agentGenomes: createSpecies("agent", createAgentGenome),
  };
}

function baseGenome(species, speciesRank, createdAt, entropy, customInstructionsPresent) {
  return {
    genomeVersion: "1.0",
    genomeId: crypto.randomUUID(),
    randomSeed: crypto.randomInt(1, 2147483647),
    requestNonce: entropy.requestNonce,
    createdAt,
    species,
    speciesRank,
    samplingRules: {
      selectionMethod: "cryptographic_random",
      avoidPreviousCombinations: true,
      similarityThreshold: 0.72,
      maximumRegenerationAttempts: 10,
    },
    customInstructionsPresent,
  };
}

function createSaasGenome(rank, createdAt, entropy, customInstructionsPresent) {
  return {
    ...baseGenome("saas", rank, createdAt, entropy, customInstructionsPresent),
    dimensions: {
      market: randomChoice(SAAS_MARKETS),
      customerType: randomChoice(SAAS_CUSTOMERS),
      organizationSize: randomChoice(ORGANIZATION_SIZES),
      primaryProblem: randomChoice(SAAS_PROBLEMS),
      painFrequency: randomChoice(PAIN_FREQUENCIES),
      painSeverity: randomChoice(PAIN_SEVERITIES),
      existingWorkaround: randomChoice(WORKAROUNDS),
      workflowStage: randomChoice(WORKFLOW_STAGES),
      coreProductType: randomChoice(SAAS_PRODUCT_TYPES),
      aiRole: randomChoice(SAAS_AI_ROLES),
      automationLevel: "fully autonomous after ordinary end-user input",
      primaryDataTypes: randomSample(USER_OWNED_DATA, 2),
      interactionModel: randomChoice(INTERACTION_MODELS),
      monetizationModel: randomChoice(MONETIZATION_MODELS),
      distributionChannels: randomSample(SAAS_DISTRIBUTION, 2),
      innovationLens: randomChoice(INNOVATION_LENSES),
      inspirationDomain: randomChoice(INSPIRATION_DOMAINS),
      hardConstraints: [
        ...FIXED_HARD_CONSTRAINTS,
        "must solve exactly one narrow recurring problem",
        "must create value beyond what a one-shot general LLM prompt can provide",
      ],
    },
  };
}

function createGameGenome(rank, createdAt, entropy, customInstructionsPresent) {
  const [referenceGame, borrowedMechanic] = randomChoice(GAME_REFERENCES);
  return {
    ...baseGenome("game", rank, createdAt, entropy, customInstructionsPresent),
    dimensions: {
      referenceGame,
      borrowedMechanic,
      creativeTwist: randomChoice(GAME_TWISTS),
      theme: randomChoice(GAME_THEMES),
      sessionLength: randomChoice(GAME_SESSIONS),
      playerMode: randomChoice(GAME_MODES),
      progression: randomChoice(GAME_PROGRESSION),
      visualIdentity: randomChoice(GAME_VISUALS),
      failure: randomChoice([
        "run ends immediately", "limited mistakes per round", "recoverable score loss",
        "board state becomes harder but remains playable",
      ]),
      reward: randomChoice([
        "mastery score", "new rule variant", "cosmetic collection", "branch unlock",
      ]),
      hardConstraints: [
        ...FIXED_HARD_CONSTRAINTS,
        "must be an original browser game with original naming, theme, and assets",
        "must preserve the reference game's recognizable core mechanic",
        "must use Firestore only for persistence or asynchronous play",
      ],
    },
  };
}

function createAgentGenome(rank, createdAt, entropy, customInstructionsPresent) {
  return {
    ...baseGenome("agent", rank, createdAt, entropy, customInstructionsPresent),
    dimensions: {
      workflowDomain: randomChoice(AGENT_DOMAINS),
      user: randomChoice(AGENT_USERS),
      goal: randomChoice(AGENT_GOALS),
      trigger: randomChoice(AGENT_TRIGGERS),
      inputs: randomSample(AGENT_INPUTS, 2),
      workflowPattern: randomChoice(AGENT_WORKFLOWS),
      memory: randomChoice(AGENT_MEMORY),
      output: randomChoice(AGENT_OUTPUTS),
      planningStyle: randomChoice([
        "plan then execute", "parallel work packets then reconcile",
        "iterative draft and self-check", "constraint-first execution",
      ]),
      failureHandling: randomChoice([
        "retry with a narrower task", "record uncertainty and choose a safe fallback",
        "rebuild from the last valid checkpoint", "produce a partial result with explicit gaps",
      ]),
      observability: "every step, decision, and artifact is stored in Firestore",
      autonomyBoundary: "runs to completion after the initiating user's input; review is optional",
      interactionModel: randomChoice(INTERACTION_MODELS),
      hardConstraints: [
        ...FIXED_HARD_CONSTRAINTS,
        "must automate one or more complete workflows rather than merely chat",
        "must use only user-provided or product-owned data",
      ],
    },
  };
}

function ideaGenerationSystemInstruction() {
  return [
    "You are Labor's non-evolving ad hoc idea generator.",
    `Express exactly ${TOTAL_IDEAS} supplied genomes as exactly ${IDEA_COUNTS.saas} SaaS ideas, ${IDEA_COUNTS.game} game ideas, and ${IDEA_COUNTS.agent} AI-agent ideas. Return one idea for every genomeId exactly once.`,
    "This is a single-pass generation. Do not merge genomes, skip difficult genomes, invent new genome IDs, or produce alternatives.",
    "The only allowed implementation primitives are Firebase Hosting, Firestore, Firebase Storage, and direct LLM calls. Ordinary end users may type, upload, play, and inspect results inside the hosted product.",
    "The complete promised value loop must require zero third-party accounts, APIs, integrations, platforms, external data feeds, scraping, communication infrastructure, payment rails, devices, native applications, browser extensions, non-Firebase runtimes, or separately operated services.",
    "No founder, employee, contractor, expert, moderator, reviewer, approver, concierge, operator, content team, or manual fulfillment may be required after the end user starts the workflow. Optional end-user inspection is allowed; a second human role required for completion is not.",
    "SaaS ideas must be small, focused, and solve exactly one clear recurring problem. They must create persistent structured workflow value that a one-shot general LLM prompt cannot replace today.",
    "Game ideas should deliberately start from the supplied famous-game mechanic and add one creative touch. Do not invent a new genre. Produce an original product name, theme, rules expression, and visual identity without copying protected characters, names, story, or assets.",
    "AI-agent ideas must automate one or more complete workflows. They must plan, act on user-owned inputs, maintain Firestore memory, handle failure, and finish a measurable output rather than merely converse.",
    "Commercial positioning may be described, but an external payment integration cannot be required for the core product to work.",
    "When custom instructions are supplied, they are the highest-priority creative direction. Apply them visibly to every compatible idea, subordinate only to species counts, the supplied genomes, zero-dependency rules, safety, and the response schema.",
    "Keep all ideas causally distinct from the prior-idea memory. Compare customer or player, problem or desire, workflow, economics, and mechanism rather than wording alone.",
  ].join("\n\n");
}

function ideaGenerationPrompt({ genomes, customInstructions, previousIdeas, entropy }) {
  return [
    "Generate the complete ad hoc population from these cryptographically sampled genomes.",
    "Request entropy (use it as a diversity cue, never as content):",
    JSON.stringify(entropy),
    "CUSTOM INSTRUCTIONS (high creative priority):",
    customInstructions || "No custom instructions were supplied.",
    "Previously generated ad hoc causal fingerprints to avoid:",
    JSON.stringify(previousIdeas || []),
    "Genome population:",
    JSON.stringify(genomes),
    "For each idea, make the workflow and Firebase architecture concrete enough to expose hidden dependencies. deploymentFit.externalDependencies and deploymentFit.manualOperations must be empty because any such idea violates the generation contract.",
  ].join("\n\n");
}

function ideaPopulationSchema() {
  const item = objectSchema({
    genomeId: stringSchema(),
    name: stringSchema(),
    oneLiner: stringSchema(),
    customerOrPlayer: stringSchema(),
    problemOrDesire: stringSchema(),
    productConcept: stringSchema(),
    workflow: arraySchema(stringSchema(), 3, 7),
    minimumViableProduct: arraySchema(stringSchema(), 3, 7),
    firebaseArchitecture: arraySchema(stringSchema(), 2, 7),
    monetization: stringSchema(),
    distribution: stringSchema(),
    whyDifferent: stringSchema(),
    whyNow: stringSchema(),
    autonomyProof: stringSchema(),
    fingerprint: objectSchema({
      customer: stringSchema(),
      problem: stringSchema(),
      workflow: stringSchema(),
      economic: stringSchema(),
      mechanism: stringSchema(),
    }),
    deploymentFit: objectSchema({
      firebaseOnly: booleanSchema(),
      operatorIndependent: booleanSchema(),
      externalDependencies: arraySchema(stringSchema(), 0, 0),
      manualOperations: arraySchema(stringSchema(), 0, 0),
      explanation: stringSchema(),
    }),
  });
  return objectSchema({
    saasIdeas: arraySchema(item, IDEA_COUNTS.saas, IDEA_COUNTS.saas),
    gameIdeas: arraySchema(item, IDEA_COUNTS.game, IDEA_COUNTS.game),
    agentIdeas: arraySchema(item, IDEA_COUNTS.agent, IDEA_COUNTS.agent),
  });
}

function normalizeIdeaPopulation(raw, genomes, metadata = {}) {
  const genomeGroups = {
    saas: genomes?.saasGenomes || [],
    game: genomes?.gameGenomes || [],
    agent: genomes?.agentGenomes || [],
  };
  const resultGroups = {
    saas: raw?.saasIdeas,
    game: raw?.gameIdeas,
    agent: raw?.agentIdeas,
  };
  const genomeById = new Map();
  Object.entries(genomeGroups).forEach(([species, population]) => {
    if (!Array.isArray(population) || population.length !== IDEA_COUNTS[species]) {
      throw new Error(`Expected ${IDEA_COUNTS[species]} ${species} genomes.`);
    }
    population.forEach((genome) => genomeById.set(genome.genomeId, genome));
  });

  const seenGenomeIds = new Set();
  const ideas = [];
  SPECIES.forEach((species) => {
    const generated = resultGroups[species];
    if (!Array.isArray(generated) || generated.length !== IDEA_COUNTS[species]) {
      throw new Error(`The model must return exactly ${IDEA_COUNTS[species]} ${species} ideas.`);
    }
    generated.forEach((rawIdea, index) => {
      const genomeId = cleanText(rawIdea?.genomeId, 200);
      const genome = genomeById.get(genomeId);
      if (!genome || genome.species !== species || seenGenomeIds.has(genomeId)) {
        throw new Error(`The model returned an invalid or duplicate ${species} genomeId.`);
      }
      seenGenomeIds.add(genomeId);
      const rank = index + 1;
      const name = cleanText(rawIdea.name, 160) || `Untitled ${species} idea`;
      const oneLiner = cleanText(rawIdea.oneLiner, 600);
      ideas.push(cleanValue({
        id: `${metadata.generationId}_${species}_${String(rank).padStart(2, "0")}`,
        generationId: metadata.generationId,
        generationNumber: metadata.generationNumber,
        generator: metadata.generator || GENERATOR_NAME,
        mode: metadata.mode || GENERATION_MODE,
        autonomous: Boolean(metadata.autonomous),
        species,
        speciesRank: rank,
        status: "generated",
        name,
        oneLiner,
        genome,
        phenotype: {
          name,
          oneLiner,
          customerOrPlayer: cleanText(rawIdea.customerOrPlayer, 1000),
          problemOrDesire: cleanText(rawIdea.problemOrDesire, 1200),
          productConcept: cleanText(rawIdea.productConcept, 1800),
          workflow: cleanStringArray(rawIdea.workflow, 7, 1000),
          mvp: cleanStringArray(rawIdea.minimumViableProduct, 7, 1000),
          firebaseArchitecture: cleanStringArray(rawIdea.firebaseArchitecture, 7, 1000),
          monetization: cleanText(rawIdea.monetization, 800),
          distribution: cleanText(rawIdea.distribution, 800),
          moat: cleanText(rawIdea.whyDifferent, 1000),
          whyNow: cleanText(rawIdea.whyNow, 1000),
          autonomyProof: cleanText(rawIdea.autonomyProof, 1400),
        },
        fingerprint: rawIdea.fingerprint,
        deploymentFit: rawIdea.deploymentFit,
        customInstructionsApplied: Boolean(metadata.customInstructionsPresent),
        model: metadata.model || null,
        createdAtMs: Number(metadata.createdAtMs || Date.now()),
        updatedAtMs: Date.now(),
      }));
    });
  });
  if (ideas.length !== TOTAL_IDEAS || seenGenomeIds.size !== TOTAL_IDEAS) {
    throw new Error("The generated population does not cover all ten genomes.");
  }
  return ideas;
}

function randomChoice(values) {
  return values[crypto.randomInt(0, values.length)];
}

function randomSample(values, count) {
  const available = [...values];
  const selected = [];
  while (selected.length < count && available.length) {
    const index = crypto.randomInt(0, available.length);
    selected.push(available.splice(index, 1)[0]);
  }
  return selected;
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function cleanStringArray(values, maxItems = 20, maxLength = 1000) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, maxItems).map((value) => cleanText(value, maxLength)).filter(Boolean);
}

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) return value.map(cleanValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cleanValue(item)])
    );
  }
  return String(value);
}

function objectSchema(properties) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

function arraySchema(items, minItems, maxItems) {
  return { type: "array", items, minItems, maxItems };
}

function stringSchema() {
  return { type: "string" };
}

function booleanSchema() {
  return { type: "boolean" };
}

function httpError(message, statusCode = 500, code = "labor_ad_hoc_error", details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

module.exports = {
  createLaborAdHocGenerator,
};
