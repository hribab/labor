"use strict";

const crypto = require("crypto");

const ENGINE_NAME = "Labor Evolution Engine";
const ENGINE_LOOP = ["Observe", "Breed", "Attack", "Select", "Remember", "Evolve"];
const SPECIES = ["saas", "game", "agent"];
const SPECIES_SELECTION_TARGETS = Object.freeze({ saas: 4, game: 3, agent: 3 });
const SELECTED_IDEA_TARGET = Object.values(SPECIES_SELECTION_TARGETS)
  .reduce((total, count) => total + count, 0);
const STAGE_ORDER = [
  "observe",
  "remember",
  "map_niches",
  "breed",
  "dispatch_attacks",
  "attack",
  "autonomy_check",
  "select",
  "evolve",
  "shadow_tournament",
  "completed",
];
const STAGE_LABELS = {
  observe: "Reading market weather",
  remember: "Studying the Living Forest and Graveyard",
  map_niches: "Mapping underexplored habitats",
  breed: "Breeding candidate genomes",
  dispatch_attacks: "Opening the Predator Arena",
  attack: "Expressing and attacking ideas",
  autonomy_check: "Running the zero-dependency autonomy check",
  select: "Selecting diverse survivors",
  evolve: "Evolving recipes, predators, and flow",
  shadow_tournament: "Running the Shadow Tournament",
  completed: "Generation complete",
};
const PREDATOR_ROLES = [
  "customer",
  "buyer",
  "skeptic",
  "competitor",
  "distributor",
  "engineer",
  "regulator",
  "historian",
  "contrarian",
  "timing",
];
const FITNESS_KEYS = [
  "problem",
  "timing",
  "distribution",
  "economic",
  "mechanism",
  "defensibility",
  "novelty",
  "execution",
  "survivalCalibration",
];
const COGNITIVE_MODES = [
  "frustration",
  "observation",
  "analogy",
  "combination",
  "counterfactual",
  "obsession",
  "timing",
  "social_imitation",
  "constraint_pressure",
  "accidental_discovery",
];
const V1_AUTONOMY_CHECK_ID = "v1_autonomy_check";
const AUTONOMY_DEPENDENCY_KINDS = [
  "third_party_ecosystem",
  "external_api_or_account",
  "external_data_dependency",
  "communication_infrastructure",
  "manual_human_fulfillment",
  "human_approval_or_review",
  "non_firebase_runtime",
  "physical_world_dependency",
  "other_dependency",
];
const RECIPE_SEEDS = [
  {
    id: "friction_hunter",
    name: "Friction Hunter",
    thesis: "Find expensive, repetitive human work and remove the operator from the loop.",
    preferredOperators: ["deletion", "value", "repair"],
  },
  {
    id: "timing_surfer",
    name: "Timing Surfer",
    thesis: "Start from a capability or cost curve that changed recently.",
    preferredOperators: ["environmental", "insertion", "value"],
  },
  {
    id: "contrarian",
    name: "Contrarian",
    thesis: "Reverse the accepted buyer, workflow, ownership, or interaction assumption.",
    preferredOperators: ["inversion", "deletion", "rearrangement"],
  },
  {
    id: "cross_pollinator",
    name: "Cross-Pollinator",
    thesis: "Move a proven mechanism between distant industries or species.",
    preferredOperators: ["transposition", "crossover", "duplication"],
  },
  {
    id: "grave_robber",
    name: "Grave Robber",
    thesis: "Repair a killed idea at the exact gene named on its death certificate.",
    preferredOperators: ["repair", "deletion", "inversion"],
  },
  {
    id: "simplifier",
    name: "Simplifier",
    thesis: "Delete dependencies and features until value appears immediately.",
    preferredOperators: ["deletion", "rearrangement", "value"],
  },
  {
    id: "behavior_watcher",
    name: "Behavior Watcher",
    thesis: "Notice strange workarounds and behavior spreading before products exist.",
    preferredOperators: ["environmental", "insertion", "transposition"],
  },
  {
    id: "infrastructure_miner",
    name: "Infrastructure Miner",
    thesis: "Exploit newly cheap storage, generation, reasoning, or distribution primitives.",
    preferredOperators: ["environmental", "duplication", "crossover"],
  },
  {
    id: "regulation_surfer",
    name: "Regulation Surfer",
    thesis: "Turn a new rule or proof burden into an automated product workflow.",
    preferredOperators: ["environmental", "insertion", "repair"],
  },
  {
    id: "distribution_first",
    name: "Distribution First",
    thesis: "Begin with a reachable audience and breed backward toward a product.",
    preferredOperators: ["inversion", "crossover", "value"],
  },
];

const PREDATOR_SEEDS = [
  ["customer", "Why would the person experiencing this care enough to change behavior?"],
  ["buyer", "Why would a specific buyer pay from a real budget?"],
  ["skeptic", "Is this structurally more than a thin LLM wrapper?"],
  ["competitor", "What prevents an incumbent or fast follower from copying it?"],
  ["distributor", "How are the first 100 users reached without manual outreach infrastructure?"],
  ["engineer", "Can the complete value loop run on Firebase and LLM calls alone?"],
  ["regulator", "What privacy, safety, ownership, or policy constraint can kill it?"],
  ["historian", "What similar concept failed, and is the failure cause actually repaired?"],
  ["contrarian", "Which hidden assumption is probably false?"],
  ["timing", "Why now, and why not five years earlier or later?"],
].map(([id, question]) => ({
  id,
  name: `${id.slice(0, 1).toUpperCase()}${id.slice(1)}`,
  question,
}));

function createLaborEvolutionEngine(dependencies) {
  const {
    admin,
    db,
    logger,
    getFunctions,
    region,
    rootCollection,
    authenticateRequest,
    handleCors,
    getHttpStatus,
    getErrorMessage,
    loadConfiguredLlm,
    callStructuredLlm,
    serializeLlmProvider,
    enqueueAutonomousProducts,
  } = dependencies;

  if (!admin || !db || !getFunctions || !callStructuredLlm) {
    throw new Error("Labor Evolution Engine dependencies are incomplete.");
  }

  const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const increment = (value) => admin.firestore.FieldValue.increment(value);

  function laborRef(ownerEmail) {
    return db
      .collection(rootCollection)
      .doc(ownerEmail)
      .collection("agents")
      .doc("labor");
  }

  function generationRef(ownerEmail, generationId) {
    return laborRef(ownerEmail).collection("generations").doc(generationId);
  }

  function workRef(ownerEmail, generationId, workId) {
    return generationRef(ownerEmail, generationId).collection("work").doc(workId);
  }

  async function startLabor(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== "POST") return res.status(405).send("POST only");

    let ownerEmail = "";
    let generationId = "";
    try {
      if (req.body?.confirmedAutonomousLaunch !== true) {
        throw httpError(
          "Confirm the autonomous build, deployment, and release before starting Evolver.",
          400,
          "labor_confirmation_required"
        );
      }
      const identity = await authenticateRequest(req, req.body?.email);
      ownerEmail = identity.email;
      const foundation = await ensureFoundation(ownerEmail);
      const nowMs = Date.now();
      generationId = `generation_${nowMs}_${crypto.randomBytes(4).toString("hex")}`;
      const genRef = generationRef(ownerEmail, generationId);
      const controlRef = laborRef(ownerEmail);
      const requestedCandidates = normalizeCandidateCount(
        req.body?.candidateCount || foundation.flow.candidateCount
      );

      let generationNumber = 1;
      await db.runTransaction(async (transaction) => {
        const controlSnapshot = await transaction.get(controlRef);
        const control = controlSnapshot.exists ? controlSnapshot.data() || {} : {};
        const activeGenerationId = safeId(control.activeGenerationId);
        const activeUpdatedAtMs = Number(control.updatedAtMs || 0);
        const activeIsFresh = activeUpdatedAtMs > nowMs - 6 * 60 * 60 * 1000;
        if (
          activeGenerationId &&
          ["queued", "running", "retrying"].includes(String(control.status || "")) &&
          activeIsFresh
        ) {
          throw httpError(
            "Labor is already evolving a generation.",
            409,
            "labor_generation_active",
            { generationId: activeGenerationId }
          );
        }

        generationNumber = Math.max(0, Number(control.generationCount || 0)) + 1;
        const initialRecord = {
          id: generationId,
          generationId,
          generationNumber,
          engine: ENGINE_NAME,
          lifecycle: ENGINE_LOOP,
          status: "queued",
          phase: "observe",
          phaseLabel: STAGE_LABELS.observe,
          stageIndex: 0,
          stageCount: STAGE_ORDER.length - 1,
          progressPercent: 2,
          activity: "Preparing a new evolutionary environment.",
          candidateTarget: requestedCandidates,
          productTarget: SELECTED_IDEA_TARGET,
          autonomous: true,
          autonomousLaunchConfirmed: true,
          autonomousLaunchConfirmedAtMs: nowMs,
          counts: {
            candidatesGenerated: 0,
            candidatesEvaluated: 0,
            selectedIdeas: 0,
            killedCandidates: 0,
            nicheCells: 0,
          },
          activeFlowId: foundation.flow.id,
          flowVersion: Number(foundation.flow.version || 1),
          flowGenomeSnapshot: cleanValue({
            ...foundation.flow,
            candidateCount: requestedCandidates,
          }),
          dispatchPending: true,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
          startedAtMs: 0,
          completedAtMs: 0,
          error: "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        transaction.create(genRef, initialRecord);
        transaction.set(
          controlRef,
          {
            engine: ENGINE_NAME,
            lifecycle: ENGINE_LOOP,
            status: "queued",
            phase: "observe",
            phaseLabel: STAGE_LABELS.observe,
            activeGenerationId: generationId,
            latestGenerationId: generationId,
            generationCount: generationNumber,
            progressPercent: 2,
            updatedAtMs: nowMs,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      await writeEvent(ownerEmail, generationId, {
        type: "generation_started",
        stage: "observe",
        message: `Generation ${generationNumber} entered the ecosystem.`,
      });

      try {
        await dispatchCurrentPhase(ownerEmail, generationId, "observe");
      } catch (error) {
        await markGenerationFailed(
          ownerEmail,
          generationId,
          "observe",
          `Background dispatch failed: ${getErrorMessage(error)}`.slice(0, 1000)
        );
        throw error;
      }

      return res.status(202).json({
        ok: true,
        actionType: "labor_generation_queued",
        generationId,
        generationNumber,
        ideaCount: SELECTED_IDEA_TARGET,
        productCount: SELECTED_IDEA_TARGET,
        status: "queued",
        phase: "observe",
      });
    } catch (error) {
      logger.error("startLabor error", {
        ownerEmail,
        generationId,
        error: getErrorMessage(error),
      });
      return res.status(getHttpStatus(error)).json({
        ok: false,
        error: getErrorMessage(error),
        code: error?.code || "labor_start_failed",
        generationId: error?.details?.generationId || generationId,
      });
    }
  }

  async function runLaborEvolution(request) {
    const payload = request?.data || {};
    const ownerEmail = normalizeOwnerEmail(payload.ownerEmail || payload.email);
    const generationId = safeId(payload.generationId);
    const requestedPhase = safeStage(payload.phase);
    const requestedWorkId = safeId(payload.workId);
    const taskId = safeId(request?.id) || `task_${crypto.randomBytes(6).toString("hex")}`;

    if (!ownerEmail || !generationId || !requestedPhase) {
      throw new Error("Labor task payload is incomplete.");
    }

    const genRef = generationRef(ownerEmail, generationId);
    let generationSnapshot = await genRef.get();
    if (!generationSnapshot.exists) return;
    let generation = generationSnapshot.data() || {};
    if (["completed", "failed"].includes(String(generation.status || ""))) return;

    if (generation.phase !== requestedPhase) {
      if (generation.dispatchPending) {
        await dispatchCurrentPhase(ownerEmail, generationId, generation.phase);
      }
      return;
    }

    const workId = requestedWorkId || `stage_${requestedPhase}`;
    const lease = await acquireWorkLease(
      workRef(ownerEmail, generationId, workId),
      taskId,
      requestedPhase
    );
    if (!lease.acquired) return;

    await Promise.all([
      genRef.set(
        {
          status: "running",
          error: "",
          startedAtMs: Number(generation.startedAtMs || 0) || Date.now(),
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      laborRef(ownerEmail).set(
        {
          status: "running",
          phase: requestedPhase,
          phaseLabel: STAGE_LABELS[requestedPhase],
          activeGenerationId: generationId,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);

    try {
      generationSnapshot = await genRef.get();
      generation = generationSnapshot.data() || generation;
      let workCompletedInsideStage = false;
      switch (requestedPhase) {
        case "observe":
          await runObserveStage(ownerEmail, generationId, generation);
          break;
        case "remember":
          await runRememberStage(ownerEmail, generationId, generation);
          break;
        case "map_niches":
          await runNicheStage(ownerEmail, generationId, generation);
          break;
        case "breed":
          if (!requestedWorkId) {
            await dispatchCurrentPhase(ownerEmail, generationId, "breed");
            break;
          }
          workCompletedInsideStage = await runBreedShard(
            ownerEmail,
            generationId,
            requestedWorkId,
            generation
          );
          break;
        case "dispatch_attacks":
          await runAttackDispatchStage(ownerEmail, generationId, generation);
          break;
        case "attack":
          if (!requestedWorkId) {
            await dispatchCurrentPhase(ownerEmail, generationId, "attack");
            break;
          }
          workCompletedInsideStage = await runAttackShard(
            ownerEmail,
            generationId,
            requestedWorkId,
            generation
          );
          break;
        case "autonomy_check":
          await runAutonomyCheckStage(ownerEmail, generationId, generation);
          break;
        case "select":
          await runSelectionStage(ownerEmail, generationId, generation);
          break;
        case "evolve":
          await runEvolutionStage(ownerEmail, generationId, generation);
          break;
        case "shadow_tournament":
          await runShadowTournament(ownerEmail, generationId, generation);
          break;
        default:
          return;
      }

      if (!workCompletedInsideStage) {
        await markWorkCompleted(workRef(ownerEmail, generationId, workId));
      }
    } catch (error) {
      const message = getErrorMessage(error).slice(0, 1600);
      logger.error("runLaborEvolution stage error", {
        ownerEmail,
        generationId,
        phase: requestedPhase,
        workId,
        attempt: lease.attempt,
        error: message,
      });
      await releaseWorkLeaseWithError(
        workRef(ownerEmail, generationId, workId),
        message
      );

      if (lease.attempt >= 3) {
        await markGenerationFailed(ownerEmail, generationId, requestedPhase, message);
        return;
      }

      await Promise.all([
        genRef.set(
          {
            status: "retrying",
            error: message,
            activity: `Retrying ${STAGE_LABELS[requestedPhase].toLowerCase()}.`,
            updatedAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        laborRef(ownerEmail).set(
          {
            status: "retrying",
            error: message,
            updatedAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
      ]);
      throw error;
    }
  }

  async function ensureFoundation(ownerEmail) {
    const controlRef = laborRef(ownerEmail);
    const flowRef = controlRef.collection("flowGenomes").doc("flow_0001");
    const recipeRefs = RECIPE_SEEDS.map((recipe) =>
      controlRef.collection("mutationRecipes").doc(recipe.id)
    );
    const predatorRefs = PREDATOR_SEEDS.map((predator) =>
      controlRef.collection("predators").doc(predator.id)
    );
    const snapshots = await db.getAll(controlRef, flowRef, ...recipeRefs, ...predatorRefs);
    const [controlSnapshot, flowSnapshot, ...seedSnapshots] = snapshots;
    const batch = db.batch();
    const nowMs = Date.now();
    let hasWrites = false;

    if (!flowSnapshot.exists) {
      batch.create(flowRef, {
        ...defaultFlowGenome(),
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    }

    RECIPE_SEEDS.forEach((recipe, index) => {
      const snapshot = seedSnapshots[index];
      if (snapshot?.exists) return;
      batch.create(recipeRefs[index], {
        ...recipe,
        status: "active",
        generation: 1,
        parentRecipeIds: [],
        influence: 1 / RECIPE_SEEDS.length,
        trials: 0,
        candidatesGenerated: 0,
        survivors: 0,
        selectedScoreTotal: 0,
        downstreamSurvivors: 0,
        downstreamDeaths: 0,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    });

    PREDATOR_SEEDS.forEach((predator, index) => {
      const snapshot = seedSnapshots[RECIPE_SEEDS.length + index];
      if (snapshot?.exists) return;
      batch.create(predatorRefs[index], {
        ...predator,
        status: "active",
        generation: 1,
        attacks: 0,
        fatalFindings: 0,
        downstreamMisses: 0,
        downstreamFalsePositives: 0,
        calibrationWeight: 1,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    });

    if (!controlSnapshot.exists) {
      batch.create(controlRef, {
        engine: ENGINE_NAME,
        lifecycle: ENGINE_LOOP,
        status: "idle",
        phase: "",
        phaseLabel: "Ready to evolve",
        activeFlowId: "flow_0001",
        flowVersion: 1,
        activeGenerationId: "",
        latestGenerationId: "",
        generationCount: 0,
        progressPercent: 0,
        constraintEnvelope: feasibilityEnvelope(),
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      hasWrites = true;
    } else {
      batch.set(
        controlRef,
        {
          engine: ENGINE_NAME,
          lifecycle: ENGINE_LOOP,
          constraintEnvelope: feasibilityEnvelope(),
          activeFlowId: safeId(controlSnapshot.data()?.activeFlowId) || "flow_0001",
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      hasWrites = true;
    }

    if (hasWrites) await batch.commit();
    const activeFlowId =
      safeId(controlSnapshot.data()?.activeFlowId) || "flow_0001";
    const activeFlowSnapshot =
      activeFlowId === "flow_0001"
        ? await flowRef.get()
        : await controlRef.collection("flowGenomes").doc(activeFlowId).get();
    const flow = activeFlowSnapshot.exists
      ? activeFlowSnapshot.data() || defaultFlowGenome()
      : defaultFlowGenome();
    return { flow: normalizeFlowGenome(flow) };
  }

  async function dispatchCurrentPhase(ownerEmail, generationId, phase) {
    const normalizedPhase = safeStage(phase);
    if (!normalizedPhase || normalizedPhase === "completed") return;
    const genRef = generationRef(ownerEmail, generationId);
    const generationSnapshot = await genRef.get();
    if (!generationSnapshot.exists) return;
    const generation = generationSnapshot.data() || {};
    if (generation.phase !== normalizedPhase) return;

    if (normalizedPhase === "breed") {
      await ensureBreedWork(ownerEmail, generationId, generation);
      await dispatchPendingWork(ownerEmail, generationId, "breed");
    } else if (normalizedPhase === "attack") {
      await dispatchPendingWork(ownerEmail, generationId, "attack");
    } else {
      await enqueueLaborTask({
        ownerEmail,
        generationId,
        phase: normalizedPhase,
        workId: `stage_${normalizedPhase}`,
      });
    }

    await clearDispatchPending(genRef, normalizedPhase);
  }

  async function enqueueLaborTask(payload) {
    const queue = getFunctions().taskQueue(
      `locations/${region}/functions/runLaborEvolution`
    );
    await queue.enqueue(payload, { dispatchDeadlineSeconds: 1200 });
  }

  async function ensureBreedWork(ownerEmail, generationId, generation) {
    const target = normalizeCandidateCount(generation.candidateTarget);
    const flow = normalizeFlowGenome(generation.flowGenomeSnapshot || {});
    const batchSize = clampInteger(flow.breedBatchSize, 10, 30, 20);
    const targets = distributeSpeciesTarget(target);
    const workItems = [];

    SPECIES.forEach((species, speciesIndex) => {
      let offset = 0;
      let shardIndex = 0;
      while (offset < targets[species]) {
        const count = Math.min(batchSize, targets[species] - offset);
        workItems.push({
          id: `breed_${species}_${String(shardIndex).padStart(2, "0")}`,
          kind: "breed",
          phase: "breed",
          species,
          speciesIndex,
          shardIndex,
          offset,
          count,
          status: "queued",
        });
        offset += count;
        shardIndex += 1;
      }
    });

    const refs = workItems.map((item) => workRef(ownerEmail, generationId, item.id));
    const snapshots = refs.length ? await db.getAll(...refs) : [];
    const batch = db.batch();
    let writes = 0;
    workItems.forEach((item, index) => {
      if (snapshots[index]?.exists) return;
      batch.create(refs[index], {
        ...item,
        attempt: 0,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writes += 1;
    });
    if (writes) await batch.commit();

    await generationRef(ownerEmail, generationId).set(
      {
        breedShardsTotal: workItems.length,
        breedShardsCompleted: Number(generation.breedShardsCompleted || 0),
        activity: `Breeding ${target} genomes across ${workItems.length} evolutionary niches.`,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function dispatchPendingWork(ownerEmail, generationId, kind) {
    const snapshot = await generationRef(ownerEmail, generationId)
      .collection("work")
      .get();
    const pending = snapshot.docs
      .map((docSnapshot) => ({ id: docSnapshot.id, ...(docSnapshot.data() || {}) }))
      .filter(
        (item) =>
          item.kind === kind &&
          !["completed", "running"].includes(String(item.status || ""))
      );

    for (const item of pending) {
      await enqueueLaborTask({
        ownerEmail,
        generationId,
        phase: kind,
        workId: item.id,
      });
    }
  }

  async function clearDispatchPending(genRef, phase) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(genRef);
      if (!snapshot.exists || snapshot.data()?.phase !== phase) return;
      transaction.set(
        genRef,
        {
          dispatchPending: false,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  }

  async function runObserveStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "observe", 6,
      "Comparing current market pressures with the previous environment.");
    const labor = laborRef(ownerEmail);
    const weatherSnapshots = await labor.collection("marketWeather").limit(12).get();
    const previousWeather = weatherSnapshots.docs
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }))
      .sort((left, right) => Number(right.createdAtMs || 0) - Number(left.createdAtMs || 0))[0] || null;
    const llm = await loadConfiguredLlm(ownerEmail, {
      preferredProvider: "openai",
      requirePreferred: true,
    });
    const weatherRun = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: marketWeatherSystemInstruction(),
      prompt: marketWeatherPrompt(previousWeather, generation.flowGenomeSnapshot),
      schema: marketWeatherSchema(),
      name: "labor_market_weather",
      webSearch: {
        enabled: true,
        required: true,
        externalWebAccess: true,
        searchContextSize: "high",
        returnTokenBudget: "unlimited",
        reasoningEffort: "high",
        includeSources: true,
      },
      returnWebSearchMetadata: true,
    });
    const weather = weatherRun?.result || {};
    const webSearch = cleanValue(weatherRun?.webSearch || {});
    if (!webSearch.used || !Array.isArray(webSearch.sources) || !webSearch.sources.length) {
      throw new Error("Market Weather requires a completed live web search with source evidence.");
    }
    validateMarketWeatherSearchEvidence(weather, webSearch);
    const weatherId = `weather_${Date.now()}_${shortHash(generationId)}`;
    const nowMs = Date.now();
    await labor.collection("marketWeather").doc(weatherId).set({
      id: weatherId,
      generationId,
      previousWeatherId: previousWeather?.id || "",
      observedAtMs: nowMs,
      model: serializeLlmProvider(llm),
      webSearch,
      ...cleanValue(weather),
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await transitionStage(ownerEmail, generationId, "observe", "remember", {
      weatherId,
      marketPressureCount: Array.isArray(weather?.pressures) ? weather.pressures.length : 0,
      marketWeatherThesis: cleanText(weather?.thesis, 1200),
      marketWeatherAsOfDate: cleanText(weather?.asOfDate, 80),
      marketWeatherSourceCount: Number(webSearch.sources.length || 0),
      model: serializeLlmProvider(llm),
      progressPercent: 11,
      activity: "Market pressures recorded. Studying ancestral survival next.",
    });
  }

  async function runRememberStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "remember", 14,
      "Reading survivor lineages, death certificates, novelty memory, and evaluator misses.");
    const [memory, weatherSnapshot] = await Promise.all([
      loadEvolutionMemory(ownerEmail),
      laborRef(ownerEmail).collection("marketWeather").doc(generation.weatherId).get(),
    ]);
    const llm = await loadConfiguredLlm(ownerEmail);
    const analysis = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: ancestorSystemInstruction(),
      prompt: ancestorPrompt(memory, weatherSnapshot.data() || {}),
      schema: ancestorSchema(),
      name: "labor_ancestral_analysis",
    });
    const analysisId = `ancestry_${Date.now()}_${shortHash(generationId)}`;
    await laborRef(ownerEmail).collection("ancestralAnalyses").doc(analysisId).set({
      id: analysisId,
      generationId,
      weatherId: generation.weatherId,
      memoryCounts: memory.counts,
      ...cleanValue(analysis),
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await transitionStage(ownerEmail, generationId, "remember", "map_niches", {
      ancestralAnalysisId: analysisId,
      memoryCounts: memory.counts,
      progressPercent: 18,
      activity: "Ancestral patterns extracted. Building a Museum of Champions map.",
    });
  }

  async function runNicheStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "map_niches", 21,
      "Choosing habitats that preserve novelty instead of one fashionable winner.");
    const labor = laborRef(ownerEmail);
    const [weatherSnapshot, ancestrySnapshot, museumSnapshot] = await Promise.all([
      labor.collection("marketWeather").doc(generation.weatherId).get(),
      labor.collection("ancestralAnalyses").doc(generation.ancestralAnalysisId).get(),
      labor.collection("museumOfChampions").limit(120).get(),
    ]);
    const llm = await loadConfiguredLlm(ownerEmail);
    const nicheMap = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: nicheSystemInstruction(),
      prompt: nichePrompt({
        weather: weatherSnapshot.data() || {},
        ancestry: ancestrySnapshot.data() || {},
        museum: museumSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })),
      }),
      schema: nicheMapSchema(),
      name: "labor_ecosystem_map",
    });
    const niches = normalizeNiches(nicheMap);
    const batch = db.batch();
    niches.forEach((niche, index) => {
      const id = safeId(niche.id) || `${niche.species}_niche_${index + 1}`;
      batch.set(
        generationRef(ownerEmail, generationId).collection("niches").doc(id),
        {
          ...cleanValue(niche),
          id,
          createdAtMs: Date.now(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    await transitionStage(ownerEmail, generationId, "map_niches", "breed", {
      nicheMapSummary: cleanText(nicheMap?.ecosystemThesis, 1200),
      nicheCount: niches.length,
      "counts.nicheCells": niches.length,
      progressPercent: 25,
      activity: `Mapped ${niches.length} habitats. Breeding a large candidate population.`,
    });
  }

  async function runBreedShard(ownerEmail, generationId, workId, generation) {
    const shardRef = workRef(ownerEmail, generationId, workId);
    const shardSnapshot = await shardRef.get();
    if (!shardSnapshot.exists) throw new Error(`Missing Labor breeding shard: ${workId}`);
    const shard = shardSnapshot.data() || {};
    const species = normalizeSpecies(shard.species);
    const requestedCount = clampInteger(shard.count, 1, 30, 20);
    if (!species) throw new Error(`Invalid Labor species in ${workId}`);

    const labor = laborRef(ownerEmail);
    const [weatherSnapshot, ancestrySnapshot, nicheSnapshot, recipesSnapshot, livingSnapshot, graveyardSnapshot] =
      await Promise.all([
        labor.collection("marketWeather").doc(generation.weatherId).get(),
        labor.collection("ancestralAnalyses").doc(generation.ancestralAnalysisId).get(),
        generationRef(ownerEmail, generationId).collection("niches").get(),
        labor.collection("mutationRecipes").get(),
        labor.collection("ideas").limit(60).get(),
        labor.collection("graveyard").limit(80).get(),
      ]);

    const niches = nicheSnapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() || {}) }))
      .filter((item) => normalizeSpecies(item.species) === species);
    const recipes = recipesSnapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() || {}) }))
      .filter((item) => item.status !== "retired")
      .sort((left, right) => Number(right.influence || 0) - Number(left.influence || 0));
    const parents = livingSnapshot.docs.map(compactIdeaForPrompt);
    const repairableDeaths = graveyardSnapshot.docs.map(compactDeathForPrompt);
    const llm = await loadConfiguredLlm(ownerEmail);
    const result = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: breedingSystemInstruction(species),
      prompt: breedingPrompt({
        generationId,
        shard,
        species,
        requestedCount,
        flow: generation.flowGenomeSnapshot,
        weather: weatherSnapshot.data() || {},
        ancestry: ancestrySnapshot.data() || {},
        niches,
        recipes,
        parents,
        repairableDeaths,
      }),
      schema: breedingSchema(species, requestedCount),
      name: `labor_${species}_genomes`,
    });
    const genomes = Array.isArray(result?.genomes) ? result.genomes : [];
    if (genomes.length !== requestedCount) {
      throw new Error(
        `Breeding shard ${workId} returned ${genomes.length} of ${requestedCount} required genomes.`
      );
    }

    const candidateRecords = genomes.map((genome, index) => {
      const candidateId = `${workId}_${String(index).padStart(2, "0")}`;
      const normalizedGenome = normalizeCandidateGenome({
        ...genome,
        species,
        recipeId: chooseKnownId(genome?.recipeId, recipes, index),
        nicheId: chooseKnownId(genome?.nicheId, niches, index),
        cognitiveMode: chooseCognitiveMode(genome?.cognitiveMode, index),
      }, species);
      return {
        id: candidateId,
        candidateId,
        generationId,
        generationNumber: Number(generation.generationNumber || 1),
        species,
        shardId: workId,
        shardIndex: Number(shard.shardIndex || 0),
        candidateIndex: Number(shard.offset || 0) + index,
        status: "genome",
        selectionStatus: "pending_expression",
        genome: normalizedGenome,
        lineage: {
          parentIdeaIds: stringArray(normalizedGenome.parentIdeaIds, 8),
          recipeId: normalizedGenome.recipeId,
          mutationOperators: stringArray(normalizedGenome.mutationOperators, 8),
          cognitiveMode: normalizedGenome.cognitiveMode,
          marketPressureIds: stringArray(normalizedGenome.pressureIds, 8),
          nicheId: normalizedGenome.nicheId,
          flowGenomeId: generation.activeFlowId,
          flowVersion: Number(generation.flowVersion || 1),
        },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
    });

    await commitDocumentSets(
      candidateRecords.map((record) => ({
        ref: generationRef(ownerEmail, generationId)
          .collection("candidates")
          .doc(record.id),
        data: record,
      }))
    );

    const completion = await completeFanoutShard({
      ownerEmail,
      generationId,
      workId,
      kind: "breed",
      completedField: "breedShardsCompleted",
      totalField: "breedShardsTotal",
      countField: "counts.candidatesGenerated",
      count: candidateRecords.length,
      nextPhase: "dispatch_attacks",
      progressStart: 25,
      progressEnd: 48,
      activity: "Breeding diverse descendants across the ecosystem map.",
    });
    if (completion.transitioned) {
      await writeEvent(ownerEmail, generationId, {
        type: "population_bred",
        stage: "breed",
        message: `${completion.aggregateCount} candidate genomes entered the population.`,
      });
      await dispatchCurrentPhase(ownerEmail, generationId, "dispatch_attacks");
    }
    return true;
  }

  async function runAttackDispatchStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "dispatch_attacks", 50,
      "Assigning every phenotype to the full evolving predator council.");
    const candidatesSnapshot = await generationRef(ownerEmail, generationId)
      .collection("candidates")
      .get();
    const candidateIds = candidatesSnapshot.docs.map((item) => item.id).sort();
    if (candidateIds.length < 30) {
      throw new Error("Labor has too few candidate genomes to open the Predator Arena.");
    }
    const flow = normalizeFlowGenome(generation.flowGenomeSnapshot || {});
    const attackBatchSize = clampInteger(flow.attackBatchSize, 4, 10, 6);
    const workItems = [];
    for (let offset = 0; offset < candidateIds.length; offset += attackBatchSize) {
      const shardIndex = workItems.length;
      workItems.push({
        id: `attack_${String(shardIndex).padStart(3, "0")}`,
        kind: "attack",
        phase: "attack",
        shardIndex,
        candidateIds: candidateIds.slice(offset, offset + attackBatchSize),
        count: Math.min(attackBatchSize, candidateIds.length - offset),
        status: "queued",
      });
    }

    const refs = workItems.map((item) => workRef(ownerEmail, generationId, item.id));
    const snapshots = refs.length ? await db.getAll(...refs) : [];
    const writes = workItems
      .map((item, index) => ({ item, ref: refs[index], snapshot: snapshots[index] }))
      .filter(({ snapshot }) => !snapshot?.exists)
      .map(({ item, ref }) => ({
        ref,
        data: {
          ...item,
          attempt: 0,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        create: true,
      }));
    await commitDocumentSets(writes);
    await transitionStage(ownerEmail, generationId, "dispatch_attacks", "attack", {
      attackShardsTotal: workItems.length,
      attackShardsCompleted: 0,
      progressPercent: 52,
      activity: `${candidateIds.length} phenotypes are entering ${workItems.length} predator trials.`,
    });
  }

  async function runAttackShard(ownerEmail, generationId, workId, generation) {
    const shardRef = workRef(ownerEmail, generationId, workId);
    const shardSnapshot = await shardRef.get();
    if (!shardSnapshot.exists) throw new Error(`Missing Labor attack shard: ${workId}`);
    const shard = shardSnapshot.data() || {};
    const candidateIds = stringArray(shard.candidateIds, 12);
    if (!candidateIds.length) throw new Error(`Attack shard ${workId} has no candidates.`);
    const candidateRefs = candidateIds.map((candidateId) =>
      generationRef(ownerEmail, generationId).collection("candidates").doc(candidateId)
    );
    const [candidateSnapshots, predatorSnapshot, predatorVariantSnapshot, fingerprintSnapshot] = await Promise.all([
      db.getAll(...candidateRefs),
      laborRef(ownerEmail).collection("predators").get(),
      laborRef(ownerEmail).collection("predatorVariants").limit(80).get(),
      laborRef(ownerEmail).collection("noveltyFingerprints").limit(180).get(),
    ]);
    const candidates = candidateSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() || {}) }));
    if (candidates.length !== candidateIds.length) {
      throw new Error(`Attack shard ${workId} could not load every candidate genome.`);
    }
    const predatorVariants = predatorVariantSnapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() || {}) }))
      .filter((item) => item.status !== "retired");
    const predators = predatorSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() || {}),
      variants: predatorVariants
        .filter((variant) => variant.parentPredatorId === item.id)
        .slice(0, 4)
        .map((variant) => ({
          id: variant.id,
          question: variant.question,
          targetsFailurePattern: variant.targetsFailurePattern,
          status: variant.status,
        })),
    }));
    const noveltyMemory = fingerprintSnapshot.docs
      .map((item) => compactFingerprintForPrompt({ id: item.id, ...(item.data() || {}) }))
      .slice(0, 180);
    const llm = await loadConfiguredLlm(ownerEmail);
    const result = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: predatorSystemInstruction(),
      prompt: predatorPrompt({
        candidates,
        predators,
        noveltyMemory,
        flow: generation.flowGenomeSnapshot,
      }),
      schema: predatorArenaSchema(candidateIds.length),
      name: "labor_predator_arena",
    });
    const evaluations = Array.isArray(result?.evaluations) ? result.evaluations : [];
    const evaluationById = new Map(
      evaluations.map((evaluation) => [safeId(evaluation?.candidateId), evaluation])
    );
    const missingIds = candidateIds.filter((candidateId) => !evaluationById.has(candidateId));
    if (missingIds.length) {
      throw new Error(`Predator shard ${workId} omitted: ${missingIds.join(", ")}`);
    }

    const writes = candidates.map((candidate) => {
      const evaluation = normalizeEvaluation(
        evaluationById.get(candidate.id),
        candidate
      );
      return {
        ref: generationRef(ownerEmail, generationId).collection("candidates").doc(candidate.id),
        data: {
          status: "evaluated",
          selectionStatus: "awaiting_selection",
          phenotype: evaluation.phenotype,
          survivalProfile: evaluation.survivalProfile,
          predatorScores: evaluation.predatorScores,
          fatalPredators: evaluation.fatalPredators,
          topAttacks: evaluation.topAttacks,
          repair: evaluation.repair,
          fingerprint: evaluation.fingerprint,
          niche: evaluation.niche,
          deploymentFit: evaluation.deploymentFit,
          coherence: evaluation.coherence,
          fatality: evaluation.fatality,
          preliminaryFitness: weightedFitness(
            evaluation.survivalProfile,
            generation.flowGenomeSnapshot?.fitnessWeights
          ),
          evaluatedAtMs: Date.now(),
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        merge: true,
      };
    });
    await commitDocumentSets(writes);

    const completion = await completeFanoutShard({
      ownerEmail,
      generationId,
      workId,
      kind: "attack",
      completedField: "attackShardsCompleted",
      totalField: "attackShardsTotal",
      countField: "counts.candidatesEvaluated",
      count: candidates.length,
      nextPhase: "autonomy_check",
      progressStart: 52,
      progressEnd: 76,
      activity: "Predators are attacking customer value, timing, distribution, safety, and execution.",
    });
    if (completion.transitioned) {
      await writeEvent(ownerEmail, generationId, {
        type: "predator_arena_completed",
        stage: "attack",
        message: `${completion.aggregateCount} expressed ideas survived a complete hostile simulation.`,
      });
      await dispatchCurrentPhase(ownerEmail, generationId, "autonomy_check");
    }
    return true;
  }

  async function runAutonomyCheckStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "autonomy_check", 78,
      "Auditing the complete population for hidden dependencies and human-operated value loops.");
    const candidateSnapshot = await generationRef(ownerEmail, generationId)
      .collection("candidates")
      .get();
    const allCandidates = candidateSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() || {}),
    }));
    const candidates = allCandidates.filter((candidate) =>
      candidate.status === "evaluated" && candidate.fingerprint
    );
    const expectedCount = Math.max(
      0,
      Number(generation.candidateTarget || generation.counts?.candidatesEvaluated || 0)
    );
    if (!candidates.length || candidates.length !== allCandidates.length) {
      throw new Error(
        `The autonomy check requires a completely evaluated population; found ${candidates.length} of ${allCandidates.length}.`
      );
    }
    if (expectedCount && candidates.length !== expectedCount) {
      throw new Error(
        `The autonomy check expected ${expectedCount} candidates but found ${candidates.length}.`
      );
    }

    const llm = await loadConfiguredLlm(ownerEmail);
    const result = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: autonomyCheckSystemInstruction(),
      prompt: autonomyCheckPrompt(candidates),
      schema: autonomyCheckSchema(candidates.length),
      name: V1_AUTONOMY_CHECK_ID,
    });
    const audit = validateAutonomyAudit(result, candidates);
    const decisionById = new Map(
      audit.decisions.map((decision) => [decision.candidateId, decision])
    );
    const nowMs = Date.now();
    const candidateWrites = candidates.map((candidate) => ({
      ref: generationRef(ownerEmail, generationId).collection("candidates").doc(candidate.id),
      data: {
        autonomyCheck: decisionById.get(candidate.id),
        autonomyCheckedAtMs: nowMs,
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      },
      merge: true,
    }));
    await commitDocumentSets([
      ...candidateWrites,
      {
        ref: generationRef(ownerEmail, generationId).collection("checks").doc(V1_AUTONOMY_CHECK_ID),
        data: {
          id: V1_AUTONOMY_CHECK_ID,
          checkId: V1_AUTONOMY_CHECK_ID,
          policyVersion: 1,
          auditThesis: cleanText(audit.auditThesis, 1600),
          reviewedCandidateIds: audit.reviewedCandidateIds,
          forbiddenCandidateIds: audit.decisions
            .filter((decision) => decision.verdict === "forbidden")
            .map((decision) => decision.candidateId),
          allowedCount: audit.allowedCount,
          forbiddenCount: audit.forbiddenCount,
          decisionDigest: autonomyDecisionDigest(audit.decisions),
          generationId,
          model: serializeLlmProvider(llm),
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    ]);
    await transitionStage(ownerEmail, generationId, "autonomy_check", "select", {
      autonomyCheckId: V1_AUTONOMY_CHECK_ID,
      autonomyCheckSummary: cleanText(audit.auditThesis, 1200),
      "counts.autonomyAllowed": audit.allowedCount,
      "counts.autonomyRejected": audit.forbiddenCount,
      progressPercent: 81,
      activity: `${audit.allowedCount} organisms passed the zero-dependency gate; ${audit.forbiddenCount} were marked for extinction.`,
    });
    await writeEvent(ownerEmail, generationId, {
      type: "v1_autonomy_check_completed",
      stage: "autonomy_check",
      message: `Audited all ${audit.reviewedCandidateIds.length} candidates in one population-wide pass and rejected ${audit.forbiddenCount}.`,
    });
  }

  async function runSelectionStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "select", 82,
      "Running the structural identity test and preserving the champion of every habitat.");
    const labor = laborRef(ownerEmail);
    const [candidateSnapshot, priorFingerprintSnapshot, museumSnapshot, autonomyCheckSnapshot] = await Promise.all([
      generationRef(ownerEmail, generationId).collection("candidates").get(),
      labor.collection("noveltyFingerprints").limit(400).get(),
      labor.collection("museumOfChampions").get(),
      generationRef(ownerEmail, generationId).collection("checks").doc(V1_AUTONOMY_CHECK_ID).get(),
    ]);
    const rawCandidates = candidateSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() || {}),
    }));
    if (!autonomyCheckSnapshot.exists) {
      throw new Error("Natural selection cannot run without v1_autonomy_check evidence.");
    }
    const autonomyAudit = validateStoredAutonomyCheck(
      autonomyCheckSnapshot.data() || {},
      rawCandidates
    );
    const autonomyById = new Map(
      autonomyAudit.decisions.map((decision) => [decision.candidateId, decision])
    );
    const candidates = rawCandidates.map((candidate) => ({
      ...candidate,
      autonomyCheck: autonomyById.get(candidate.id),
    }));
    const priorFingerprints = priorFingerprintSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() || {}),
    }));
    const selection = selectGeneration({
      candidates,
      priorFingerprints,
      flow: generation.flowGenomeSnapshot,
    });

    const ideaWrites = [];
    const candidateWrites = [];
    const graveyardWrites = [];
    const fingerprintWrites = [];
    const nowMs = Date.now();
    selection.selected.forEach((candidate) => {
      const ideaId = `idea_${generation.generationNumber}_${candidate.species}_${String(candidate.speciesRank).padStart(2, "0")}_${shortHash(candidate.id)}`;
      candidate.selectedIdeaId = ideaId;
      const idea = buildIdeaRecord({ candidate, ideaId, generation, generationId, nowMs });
      ideaWrites.push(
        { ref: generationRef(ownerEmail, generationId).collection("ideas").doc(ideaId), data: idea },
        { ref: labor.collection("ideas").doc(ideaId), data: idea }
      );
      fingerprintWrites.push({
        ref: labor.collection("noveltyFingerprints").doc(ideaId),
        data: {
          id: ideaId,
          ideaId,
          generationId,
          species: candidate.species,
          fingerprint: candidate.fingerprint,
          lineage: candidate.lineage,
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        },
      });
      candidateWrites.push({
        ref: generationRef(ownerEmail, generationId).collection("candidates").doc(candidate.id),
        data: {
          status: "selected",
          selectionStatus: "living_forest",
          selectedIdeaId: ideaId,
          speciesRank: candidate.speciesRank,
          finalFitness: candidate.finalFitness,
          selectionReason: candidate.selectionReason,
          autonomyCheck: candidate.autonomyCheck,
          selectedAtMs: nowMs,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        merge: true,
      });
    });

    selection.eliminated.forEach((candidate) => {
      const deathCertificate = candidate.deathCertificate;
      candidateWrites.push({
        ref: generationRef(ownerEmail, generationId).collection("candidates").doc(candidate.id),
        data: {
          status: "killed",
          selectionStatus: "graveyard",
          finalFitness: candidate.finalFitness,
          autonomyCheck: candidate.autonomyCheck,
          deathCertificate,
          killedAtMs: nowMs,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        merge: true,
      });
      graveyardWrites.push({
        ref: labor.collection("graveyard").doc(`${generationId}_${candidate.id}`),
        data: {
          id: `${generationId}_${candidate.id}`,
          candidateId: candidate.id,
          generationId,
          generationNumber: Number(generation.generationNumber || 1),
          species: candidate.species,
          workingName: cleanText(candidate.genome?.workingName, 160),
          genome: compactGenome(candidate.genome),
          fingerprint: candidate.fingerprint,
          lineage: candidate.lineage,
          autonomyCheck: candidate.autonomyCheck,
          finalFitness: candidate.finalFitness,
          deathCertificate,
          createdAtMs: nowMs,
          createdAt: serverTimestamp(),
        },
      });
    });

    await commitDocumentSets([
      ...ideaWrites,
      ...candidateWrites,
      ...graveyardWrites,
      ...fingerprintWrites,
    ]);
    await Promise.all([
      updateMuseumOfChampions(labor, selection.champions, museumSnapshot),
      updateRecipeEvolutionStats(labor, candidates, selection.selected),
      updatePredatorEvolutionStats(labor, candidates),
    ]);

    const metrics = buildGenerationMetrics(selection, candidates);
    await transitionStage(ownerEmail, generationId, "select", "evolve", {
      metrics,
      selectedIdeaIds: selection.selected.map((item) => item.selectedIdeaId).filter(Boolean),
      "counts.selectedIdeas": selection.selected.length,
      "counts.killedCandidates": selection.eliminated.length,
      progressPercent: 87,
      activity: `${selection.selected.length} diverse survivors entered the Living Forest.`,
    });
    await writeEvent(ownerEmail, generationId, {
      type: "natural_selection_completed",
      stage: "select",
      message: `Selected ${speciesSelectionSummary(selection.selected)} from distinct niches and lineages.`,
    });
  }

  async function runEvolutionStage(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "evolve", 90,
      "Mutating the Flow Genome, successful recipes, and predators that missed weaknesses.");
    const labor = laborRef(ownerEmail);
    const [flowSnapshot, recipeSnapshot, predatorSnapshot, predatorVariantSnapshot, graveyardSnapshot] = await Promise.all([
      labor.collection("flowGenomes").doc(generation.activeFlowId).get(),
      labor.collection("mutationRecipes").get(),
      labor.collection("predators").get(),
      labor.collection("predatorVariants").limit(80).get(),
      labor.collection("graveyard").limit(120).get(),
    ]);
    const incumbent = normalizeFlowGenome(
      flowSnapshot.exists ? flowSnapshot.data() || {} : generation.flowGenomeSnapshot || {}
    );
    const recipes = recipeSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    const predators = [
      ...predatorSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })),
      ...predatorVariantSnapshot.docs.map((item) => ({
        id: item.id,
        variantOf: item.data()?.parentPredatorId || "",
        ...(item.data() || {}),
      })),
    ];
    const deaths = graveyardSnapshot.docs.map(compactDeathForPrompt);
    const llm = await loadConfiguredLlm(ownerEmail);
    const proposal = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: evolutionScientistSystemInstruction(),
      prompt: evolutionPrompt({
        incumbent,
        metrics: generation.metrics || {},
        recipes,
        predators,
        deaths,
      }),
      schema: evolutionProposalSchema(),
      name: "labor_meta_evolution",
    });
    const challenger = mutateFlowGenome(
      incumbent,
      proposal?.flowMutation || {},
      Number(generation.generationNumber || 1) + 1
    );
    const challengerId = `flow_${String(challenger.version).padStart(4, "0")}_${shortHash(generationId)}`;
    challenger.id = challengerId;
    challenger.status = "shadow";
    challenger.parentFlowId = incumbent.id;
    challenger.createdByGenerationId = generationId;
    challenger.mutationRationale = cleanText(proposal?.diagnosis, 2400);
    challenger.changedFields = stringArray(proposal?.flowMutation?.changedFields, 30);

    const writes = [
      {
        ref: labor.collection("flowGenomes").doc(challengerId),
        data: {
          ...cleanValue(challenger),
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
    ];
    normalizeRecipeOffspring(proposal?.recipeOffspring, recipes, generationId).forEach((recipe) => {
      writes.push({
        ref: labor.collection("mutationRecipes").doc(recipe.id),
        data: {
          ...recipe,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    });
    normalizePredatorMutations(proposal?.predatorMutations, predators, generationId).forEach((variant) => {
      writes.push({
        ref: labor.collection("predatorVariants").doc(variant.id),
        data: {
          ...variant,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    });
    await commitDocumentSets(writes);
    await transitionStage(ownerEmail, generationId, "evolve", "shadow_tournament", {
      challengerFlowId: challengerId,
      evolutionDiagnosis: cleanText(proposal?.diagnosis, 2400),
      progressPercent: 94,
      activity: "A challenger Flow Genome is replaying the same historical environment.",
    });
  }

  async function runShadowTournament(ownerEmail, generationId, generation) {
    await setStageActivity(ownerEmail, generationId, "shadow_tournament", 97,
      "Requiring the new brain to defeat the incumbent before it can take control.");
    const labor = laborRef(ownerEmail);
    const [incumbentSnapshot, challengerSnapshot, ideasSnapshot, tournamentsSnapshot] =
      await Promise.all([
        labor.collection("flowGenomes").doc(generation.activeFlowId).get(),
        labor.collection("flowGenomes").doc(generation.challengerFlowId).get(),
        labor.collection("ideas").limit(240).get(),
        labor.collection("shadowTournaments").limit(24).get(),
      ]);
    const incumbent = normalizeFlowGenome(
      incumbentSnapshot.exists ? incumbentSnapshot.data() || {} : generation.flowGenomeSnapshot || {}
    );
    const challenger = normalizeFlowGenome(
      challengerSnapshot.exists ? challengerSnapshot.data() || {} : incumbent
    );
    const ideas = ideasSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    const labeledIdeas = ideas.filter(hasDownstreamOutcome);
    const priorTournaments = tournamentsSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() || {}),
    }));
    const llm = await loadConfiguredLlm(ownerEmail);
    const tournament = await callStructuredLlm({
      userDocId: ownerEmail,
      llmConfig: llm,
      systemInstructionText: shadowTournamentSystemInstruction(),
      prompt: shadowTournamentPrompt({
        incumbent,
        challenger,
        generationMetrics: generation.metrics || {},
        labeledIdeas: labeledIdeas.slice(0, 160).map(compactIdeaForPrompt),
        priorTournaments: priorTournaments.slice(0, 12).map(compactTournamentForPrompt),
      }),
      schema: shadowTournamentSchema(),
      name: "labor_shadow_tournament",
    });
    const promotion = decideFlowPromotion({
      incumbent,
      challenger,
      tournament,
      labeledIdeaCount: labeledIdeas.length,
    });
    const tournamentId = `tournament_${generation.generationNumber}_${shortHash(generationId)}`;
    const nowMs = Date.now();
    const tournamentRecord = {
      id: tournamentId,
      generationId,
      incumbentFlowId: incumbent.id,
      challengerFlowId: challenger.id,
      labeledIdeaCount: labeledIdeas.length,
      ...cleanValue(tournament),
      promotion,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await labor.collection("shadowTournaments").doc(tournamentId).set(tournamentRecord);

    if (promotion.promoted) {
      await db.runTransaction(async (transaction) => {
        transaction.set(
          labor.collection("flowGenomes").doc(incumbent.id),
          { status: "retired", retiredAtMs: nowMs, updatedAt: serverTimestamp() },
          { merge: true }
        );
        transaction.set(
          labor.collection("flowGenomes").doc(challenger.id),
          { status: "active", promotedAtMs: nowMs, updatedAt: serverTimestamp() },
          { merge: true }
        );
        transaction.set(
          labor,
          {
            activeFlowId: challenger.id,
            flowVersion: challenger.version,
            lastTournamentId: tournamentId,
            updatedAtMs: nowMs,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
    } else {
      await labor.collection("flowGenomes").doc(challenger.id).set(
        {
          status: promotion.status,
          tournamentId,
          promotionReason: promotion.reason,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    const genRef = generationRef(ownerEmail, generationId);
    const selectedIdeasSnapshot = await genRef.collection("ideas").get();
    const selectedIdeas = selectedIdeasSnapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() || {}),
    }));
    if (!selectedIdeas.length) {
      throw new Error("Evolution completed without a survivor to build.");
    }

    await Promise.all([
      genRef.set(
        {
          status: "running",
          stageIndex: STAGE_ORDER.length - 2,
          progressPercent: 98,
          activity: `Evolution memory is updated. Queueing ${selectedIdeas.length} survivors for code generation and release.`,
          tournamentId,
          flowPromotion: promotion,
          activeFlowAfterGeneration: promotion.promoted ? challenger.id : incumbent.id,
          evolutionCompletedAtMs: nowMs,
          updatedAtMs: nowMs,
          error: "",
          dispatchPending: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      labor.set(
        {
          status: "running",
          phase: "shadow_tournament",
          phaseLabel: "Queueing survivor product pipelines",
          progressPercent: 98,
          activeGenerationId: generationId,
          latestGenerationId: generationId,
          selectedIdeaCount: selectedIdeas.length,
          lastTournamentId: tournamentId,
          flowVersion: promotion.promoted ? challenger.version : incumbent.version,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
    await writeEvent(ownerEmail, generationId, {
      type: "evolution_completed",
      stage: "shadow_tournament",
      message: promotion.promoted
        ? `Flow Genome v${challenger.version} won promotion. The survivors are entering autonomous production.`
        : `The challenger remains in shadow. The survivors are entering autonomous production: ${promotion.reason}`,
    });
    await dispatchEvolutionProducts(ownerEmail, generationId, selectedIdeas);
  }

  async function dispatchEvolutionProducts(ownerEmail, generationId, ideas) {
    if (typeof enqueueAutonomousProducts !== "function") {
      throw new Error("The Evolver product queue is not configured.");
    }
    const nowMs = Date.now();
    const genRef = generationRef(ownerEmail, generationId);
    const controlRef = laborRef(ownerEmail);
    const resetBatch = db.batch();
    ideas.forEach((idea) => {
      const patch = {
        pipelineStatus: "queued",
        pipelinePhase: "queued_for_build",
        pipelineError: "",
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      };
      resetBatch.set(genRef.collection("ideas").doc(idea.id), patch, { merge: true });
      resetBatch.set(controlRef.collection("ideas").doc(idea.id), patch, { merge: true });
    });
    await resetBatch.commit();

    const dispatch = await enqueueAutonomousProducts({
      email: ownerEmail,
      generationId,
      pipelineSource: "evolver",
      ideas: ideas.map((idea) => ({
        id: idea.id,
        species: idea.species,
        speciesRank: idea.speciesRank,
      })),
    });
    const queuedIdeaIds = new Set(
      dispatch?.queuedIdeaIds || ideas.map((idea) => idea.id)
    );
    const failures = Array.isArray(dispatch?.failures) ? dispatch.failures : [];
    const failedById = new Map(
      failures.map((failure) => [failure.ideaId, failure])
    );
    const batch = db.batch();
    let failedCount = 0;

    ideas.forEach((idea) => {
      if (queuedIdeaIds.has(idea.id) && !failedById.has(idea.id)) return;
      failedCount += 1;
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
    });
    if (failedCount) await batch.commit();

    const queuedCount = ideas.length - failedCount;
    if (!queuedCount) {
      throw new Error("No Evolver product worker could be queued.");
    }

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(genRef);
      if (!snapshot.exists) return;
      const current = snapshot.data() || {};
      transaction.set(genRef, {
        status: "running",
        phase: "building_products",
        phaseLabel: `Building and releasing ${queuedCount} survivors`,
        progressPercent: 99,
        activity: failedCount
          ? `${queuedCount} survivors are building; ${failedCount} could not be scheduled.`
          : "All ten survivors are building and releasing in parallel.",
        counts: {
          ...(current.counts || {}),
          productsQueued: queuedCount,
          productsBuilding: 0,
          productsReleasing: 0,
          productsReleased: 0,
          productsFailed: failedCount,
        },
        error: "",
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      transaction.set(controlRef, {
        status: "running",
        phase: "building_products",
        phaseLabel: `Building and releasing ${queuedCount} survivors`,
        progressPercent: 99,
        activeGenerationId: generationId,
        error: "",
        updatedAtMs: nowMs,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await writeEvent(ownerEmail, generationId, {
      type: "product_pipelines_queued",
      stage: "release",
      message: `${queuedCount} survivors entered autonomous code generation, deployment, and release.`,
    });
  }

  async function transitionStage(ownerEmail, generationId, fromPhase, toPhase, patch = {}) {
    const genRef = generationRef(ownerEmail, generationId);
    const nowMs = Date.now();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(genRef);
      if (!snapshot.exists || snapshot.data()?.phase !== fromPhase) return;
      transaction.set(
        genRef,
        {
          ...expandDottedFields(patch),
          status: "running",
          phase: toPhase,
          phaseLabel: STAGE_LABELS[toPhase],
          stageIndex: Math.max(0, STAGE_ORDER.indexOf(toPhase)),
          dispatchPending: true,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      transaction.set(
        laborRef(ownerEmail),
        {
          status: "running",
          phase: toPhase,
          phaseLabel: STAGE_LABELS[toPhase],
          progressPercent: Number(patch.progressPercent || 0),
          activeGenerationId: generationId,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await dispatchCurrentPhase(ownerEmail, generationId, toPhase);
  }

  async function setStageActivity(ownerEmail, generationId, phase, progressPercent, activity) {
    const nowMs = Date.now();
    await Promise.all([
      generationRef(ownerEmail, generationId).set(
        {
          status: "running",
          phase,
          phaseLabel: STAGE_LABELS[phase],
          stageIndex: Math.max(0, STAGE_ORDER.indexOf(phase)),
          progressPercent,
          activity,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      laborRef(ownerEmail).set(
        {
          status: "running",
          phase,
          phaseLabel: STAGE_LABELS[phase],
          progressPercent,
          activeGenerationId: generationId,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
  }

  async function completeFanoutShard(options) {
    const {
      ownerEmail,
      generationId,
      workId,
      kind,
      completedField,
      totalField,
      countField,
      count,
      nextPhase,
      progressStart,
      progressEnd,
      activity,
    } = options;
    const genRef = generationRef(ownerEmail, generationId);
    const shardRef = workRef(ownerEmail, generationId, workId);
    let result = { transitioned: false, aggregateCount: 0 };
    await db.runTransaction(async (transaction) => {
      const [generationSnapshot, shardSnapshot] = await Promise.all([
        transaction.get(genRef),
        transaction.get(shardRef),
      ]);
      if (!generationSnapshot.exists || !shardSnapshot.exists) return;
      const shard = shardSnapshot.data() || {};
      if (shard.status === "completed") return;
      const data = generationSnapshot.data() || {};
      if (data.phase !== kind) return;
      const completed = Number(data[completedField] || 0) + 1;
      const total = Math.max(1, Number(data[totalField] || 1));
      const aggregateCount = Number(readPath(data, countField) || 0) + count;
      const isLast = completed >= total;
      const progressPercent = isLast
        ? progressEnd
        : Math.round(progressStart + ((progressEnd - progressStart) * completed) / total);
      transaction.set(
        shardRef,
        {
          status: "completed",
          leaseOwner: "",
          leaseUntilMs: 0,
          completedAtMs: Date.now(),
          updatedAtMs: Date.now(),
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      const countKey = countField.split(".").pop();
      const generationPatch = {
        [completedField]: completed,
        counts: { [countKey]: increment(count) },
        progressPercent,
        activity,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      };
      if (isLast) {
        generationPatch.phase = nextPhase;
        generationPatch.phaseLabel = STAGE_LABELS[nextPhase];
        generationPatch.stageIndex = STAGE_ORDER.indexOf(nextPhase);
        generationPatch.dispatchPending = true;
      }
      transaction.set(genRef, generationPatch, { merge: true });
      transaction.set(
        laborRef(ownerEmail),
        {
          phase: isLast ? nextPhase : kind,
          phaseLabel: STAGE_LABELS[isLast ? nextPhase : kind],
          progressPercent,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      result = { transitioned: isLast, aggregateCount };
    });
    return result;
  }

  async function acquireWorkLease(ref, taskId, phase) {
    let result = { acquired: false, attempt: 0 };
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.exists ? snapshot.data() || {} : {};
      if (data.status === "completed") return;
      const nowMs = Date.now();
      if (
        data.status === "running" &&
        Number(data.leaseUntilMs || 0) > nowMs &&
        data.leaseOwner !== taskId
      ) {
        return;
      }
      const attempt = Math.max(0, Number(data.attempt || 0)) + 1;
      transaction.set(
        ref,
        {
          kind: data.kind || (phase === "breed" || phase === "attack" ? phase : "stage"),
          phase,
          status: "running",
          attempt,
          leaseOwner: taskId,
          leaseUntilMs: nowMs + 18 * 60 * 1000,
          error: "",
          startedAtMs: Number(data.startedAtMs || 0) || nowMs,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
          ...(snapshot.exists ? {} : { createdAtMs: nowMs, createdAt: serverTimestamp() }),
        },
        { merge: true }
      );
      result = { acquired: true, attempt };
    });
    return result;
  }

  async function markWorkCompleted(ref) {
    await ref.set(
      {
        status: "completed",
        leaseOwner: "",
        leaseUntilMs: 0,
        completedAtMs: Date.now(),
        updatedAtMs: Date.now(),
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function releaseWorkLeaseWithError(ref, error) {
    await ref.set(
      {
        status: "queued",
        leaseOwner: "",
        leaseUntilMs: 0,
        error,
        updatedAtMs: Date.now(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async function markGenerationFailed(ownerEmail, generationId, phase, error) {
    const nowMs = Date.now();
    await Promise.all([
      generationRef(ownerEmail, generationId).set(
        {
          status: "failed",
          phase,
          phaseLabel: STAGE_LABELS[phase] || phase,
          activity: "Evolution stopped after repeated stage failures.",
          error,
          failedAtMs: nowMs,
          updatedAtMs: nowMs,
          dispatchPending: false,
          failedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      laborRef(ownerEmail).set(
        {
          status: "failed",
          phase,
          phaseLabel: STAGE_LABELS[phase] || phase,
          activeGenerationId: "",
          latestGenerationId: generationId,
          error,
          updatedAtMs: nowMs,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
    await writeEvent(ownerEmail, generationId, {
      type: "generation_failed",
      stage: phase,
      message: error,
    });
  }

  async function writeEvent(ownerEmail, generationId, event) {
    const nowMs = Date.now();
    const id = `${nowMs}_${crypto.randomBytes(3).toString("hex")}`;
    await generationRef(ownerEmail, generationId).collection("events").doc(id).set({
      id,
      ...cleanValue(event),
      createdAtMs: nowMs,
      createdAt: serverTimestamp(),
    });
  }

  async function loadEvolutionMemory(ownerEmail) {
    const labor = laborRef(ownerEmail);
    const [livingSnapshot, graveyardSnapshot, fingerprintSnapshot, recipeSnapshot, predatorSnapshot] =
      await Promise.all([
        labor.collection("ideas").limit(160).get(),
        labor.collection("graveyard").limit(200).get(),
        labor.collection("noveltyFingerprints").limit(300).get(),
        labor.collection("mutationRecipes").get(),
        labor.collection("predators").get(),
      ]);
    const living = livingSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    const graveyard = graveyardSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    const fingerprints = fingerprintSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    const recipes = recipeSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    const predators = predatorSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
    return {
      counts: {
        livingIdeas: living.length,
        killedIdeas: graveyard.length,
        noveltyFingerprints: fingerprints.length,
        mutationRecipes: recipes.length,
        predators: predators.length,
        downstreamLabels: living.filter(hasDownstreamOutcome).length,
      },
      living: living.slice(0, 100).map(compactIdeaForPrompt),
      graveyard: graveyard.slice(0, 140).map(compactDeathForPrompt),
      fingerprints: fingerprints.slice(0, 220).map(compactFingerprintForPrompt),
      recipes: recipes.map(compactRecipeForPrompt),
      predators: predators.map(compactPredatorForPrompt),
    };
  }

  async function commitDocumentSets(operations) {
    const filtered = (Array.isArray(operations) ? operations : []).filter(
      (operation) => operation?.ref && operation?.data
    );
    for (let offset = 0; offset < filtered.length; offset += 400) {
      const batch = db.batch();
      filtered.slice(offset, offset + 400).forEach((operation) => {
        if (operation.create) batch.create(operation.ref, operation.data);
        else if (operation.merge) batch.set(operation.ref, operation.data, { merge: true });
        else batch.set(operation.ref, operation.data);
      });
      await batch.commit();
    }
  }

  async function updateMuseumOfChampions(labor, champions, museumSnapshot) {
    const existing = new Map(
      museumSnapshot.docs.map((item) => [item.id, { id: item.id, ...(item.data() || {}) }])
    );
    const writes = [];
    champions.forEach((candidate) => {
      const cellId = safeId(`${candidate.species}_${candidate.nicheCell}`);
      const incumbent = existing.get(cellId);
      if (incumbent && Number(incumbent.finalFitness || 0) >= candidate.finalFitness) return;
      writes.push({
        ref: labor.collection("museumOfChampions").doc(cellId),
        data: {
          id: cellId,
          species: candidate.species,
          nicheCell: candidate.nicheCell,
          candidateId: candidate.id,
          ideaId: candidate.selectedIdeaId || "",
          generationId: candidate.generationId,
          workingName: candidate.genome?.workingName || candidate.phenotype?.name || "",
          finalFitness: candidate.finalFitness,
          survivalProfile: candidate.survivalProfile,
          fingerprint: candidate.fingerprint,
          lineage: candidate.lineage,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
          ...(incumbent ? {} : { createdAtMs: Date.now(), createdAt: serverTimestamp() }),
        },
        merge: true,
      });
    });
    await commitDocumentSets(writes);
  }

  async function updateRecipeEvolutionStats(labor, candidates, selected) {
    const generated = new Map();
    const survivors = new Map();
    const scoreTotals = new Map();
    candidates.forEach((candidate) => {
      const recipeId = safeId(candidate.lineage?.recipeId || candidate.genome?.recipeId);
      if (!recipeId) return;
      generated.set(recipeId, (generated.get(recipeId) || 0) + 1);
    });
    selected.forEach((candidate) => {
      const recipeId = safeId(candidate.lineage?.recipeId || candidate.genome?.recipeId);
      if (!recipeId) return;
      survivors.set(recipeId, (survivors.get(recipeId) || 0) + 1);
      scoreTotals.set(recipeId, (scoreTotals.get(recipeId) || 0) + candidate.finalFitness);
    });
    const recipeSnapshot = await labor.collection("mutationRecipes").get();
    const activeRecipes = recipeSnapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() || {}) }))
      .filter((recipe) => recipe.status !== "retired");
    const influenceScores = Object.fromEntries(activeRecipes.map((recipe) => {
      const priorGenerated = Number(recipe.candidatesGenerated || 0);
      const priorSurvivors = Number(recipe.survivors || 0);
      const nextGenerated = priorGenerated + Number(generated.get(recipe.id) || 0);
      const nextSurvivors = priorSurvivors + Number(survivors.get(recipe.id) || 0);
      const bayesianYield = (nextSurvivors + 1.5) / (nextGenerated + 12);
      const continuity = Math.max(0.002, Number(recipe.influence || 0.01));
      return [recipe.id, continuity * 0.68 + bayesianYield * 0.32];
    }));
    const nextInfluence = normalizeWeights(influenceScores);
    const batch = db.batch();
    activeRecipes.forEach((recipe) => {
      const recipeId = recipe.id;
      const count = Number(generated.get(recipeId) || 0);
      batch.set(
        labor.collection("mutationRecipes").doc(recipeId),
        {
          trials: increment(count ? 1 : 0),
          candidatesGenerated: increment(count),
          survivors: increment(survivors.get(recipeId) || 0),
          selectedScoreTotal: increment(scoreTotals.get(recipeId) || 0),
          lastGenerationYield: (survivors.get(recipeId) || 0) / Math.max(1, count),
          influence: Number(nextInfluence[recipeId] || 0),
          lastUsedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  async function updatePredatorEvolutionStats(labor, candidates) {
    const stats = new Map(PREDATOR_ROLES.map((role) => [role, { attacks: 0, fatal: 0 }]));
    const variantStats = new Map();
    candidates.forEach((candidate) => {
      PREDATOR_ROLES.forEach((role) => {
        const item = stats.get(role);
        item.attacks += 1;
        if (candidate.fatalPredators?.includes(role) || Number(candidate.predatorScores?.[role] || 100) < 35) {
          item.fatal += 1;
        }
      });
      (candidate.topAttacks || []).forEach((attack) => {
        const variantId = safeId(attack?.predatorVariantId);
        if (!variantId) return;
        const value = variantStats.get(variantId) || { attacks: 0, fatal: 0 };
        value.attacks += 1;
        if (
          candidate.fatalPredators?.includes(attack.predator) ||
          Number(candidate.fatality || 0) >= 70
        ) {
          value.fatal += 1;
        }
        variantStats.set(variantId, value);
      });
    });
    const batch = db.batch();
    stats.forEach((value, role) => {
      batch.set(
        labor.collection("predators").doc(role),
        {
          attacks: increment(value.attacks),
          fatalFindings: increment(value.fatal),
          lastFatalRate: value.fatal / Math.max(1, value.attacks),
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    variantStats.forEach((value, variantId) => {
      batch.set(
        labor.collection("predatorVariants").doc(variantId),
        {
          attacks: increment(value.attacks),
          fatalFindings: increment(value.fatal),
          lastFatalRate: value.fatal / Math.max(1, value.attacks),
          status: "challenger",
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  function selectGeneration({ candidates, priorFingerprints, flow }) {
    const normalizedFlow = normalizeFlowGenome(flow || {});
    const similarityThreshold = clampNumber(
      normalizedFlow.noveltySimilarityThreshold,
      0.55,
      0.95,
      0.78
    );
    const ranked = candidates
      .filter((candidate) => candidate.status === "evaluated" && candidate.fingerprint)
      .map((candidate) => ({
        ...candidate,
        finalFitness: weightedFitness(
          candidate.survivalProfile,
          normalizedFlow.fitnessWeights
        ),
        nicheCell: deriveNicheCell(candidate),
      }))
      .sort((left, right) => right.finalFitness - left.finalFitness);
    const eligible = [];
    const eliminated = [];

    ranked.forEach((candidate) => {
      const feasibility = feasibilityFailure(candidate);
      if (feasibility) {
        const autonomyVerdict = candidate.autonomyCheck?.verdict;
        eliminated.push(withDeathCertificate(
          candidate,
          autonomyVerdict === "forbidden"
            ? "v1_autonomy_dependency"
            : autonomyVerdict === "independent"
              ? "execution"
              : "v1_autonomy_unverified",
          feasibility,
          autonomyVerdict === "independent" ? "predator_arena" : V1_AUTONOMY_CHECK_ID
        ));
        return;
      }
      if (Number(candidate.fatality || 0) >= 88 || candidate.fatalPredators?.length >= 3) {
        eliminated.push(withDeathCertificate(
          candidate,
          "predator_failure",
          candidate.topAttacks?.[0]?.attack || "Multiple independent predators found a fatal weakness.",
          "predator_arena"
        ));
        return;
      }
      if (candidate.finalFitness < normalizedFlow.minimumSurvivalScore) {
        const weakest = weakestFitnessAxis(candidate.survivalProfile);
        eliminated.push(withDeathCertificate(
          candidate,
          `${weakest}_fitness`,
          `The ${weakest} survival axis fell below the active Flow Genome threshold.`,
          "natural_selection"
        ));
        return;
      }
      const priorDuplicate = closestFingerprint(candidate.fingerprint, priorFingerprints);
      if (priorDuplicate.similarity >= similarityThreshold) {
        eliminated.push(withDeathCertificate(
          candidate,
          "global_identity_collision",
          `Its causal skeleton overlaps prior idea ${priorDuplicate.id} at ${Math.round(priorDuplicate.similarity * 100)}%.`,
          "identity_test",
          priorDuplicate
        ));
        return;
      }
      const currentDuplicate = closestFingerprint(candidate.fingerprint, eligible);
      if (currentDuplicate.similarity >= similarityThreshold) {
        eliminated.push(withDeathCertificate(
          candidate,
          "generation_identity_collision",
          `A stronger sibling already occupies the same causal structure (${Math.round(currentDuplicate.similarity * 100)}%).`,
          "identity_test",
          currentDuplicate
        ));
        return;
      }
      eligible.push(candidate);
    });

    const championsByCell = new Map();
    eligible.forEach((candidate) => {
      const key = `${candidate.species}:${candidate.nicheCell}`;
      const incumbent = championsByCell.get(key);
      if (!incumbent || incumbent.finalFitness < candidate.finalFitness) {
        championsByCell.set(key, candidate);
      }
    });
    const champions = Array.from(championsByCell.values());
    const selected = [];
    SPECIES.forEach((species) => {
      const pool = eligible.filter((candidate) => candidate.species === species);
      const speciesChampions = champions
        .filter((candidate) => candidate.species === species)
        .sort((left, right) => right.finalFitness - left.finalFitness);
      const chosen = greedyDiverseSelection(
        speciesChampions,
        pool,
        SPECIES_SELECTION_TARGETS[species]
      );
      chosen.forEach((candidate, index) => {
        candidate.speciesRank = index + 1;
        candidate.selectionReason =
          index < speciesChampions.length
            ? "MAP-Elites niche champion"
            : "Diversity-preserving lineage selection";
        selected.push(candidate);
      });
    });
    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    eligible.forEach((candidate) => {
      if (!selectedIds.has(candidate.id)) {
        eliminated.push(withDeathCertificate(
          candidate,
          "niche_competition",
          "A stronger or more lineage-diverse organism occupied its habitat.",
          "museum_of_champions"
        ));
      }
    });
    return { selected, eliminated, champions };
  }

  function greedyDiverseSelection(champions, fullPool, limit) {
    const chosen = [];
    const remaining = uniqueById([...champions, ...fullPool]);
    const recipes = new Set();
    const modes = new Set();
    const niches = new Set();
    const parentRoots = new Set();
    while (chosen.length < limit && remaining.length) {
      let bestIndex = 0;
      let bestScore = -Infinity;
      remaining.forEach((candidate, index) => {
        const recipe = candidate.lineage?.recipeId || "";
        const mode = candidate.lineage?.cognitiveMode || "";
        const niche = candidate.nicheCell || "";
        const parent = candidate.lineage?.parentIdeaIds?.[0] || candidate.id;
        const diversityBonus =
          (recipes.has(recipe) ? 0 : 7) +
          (modes.has(mode) ? 0 : 5) +
          (niches.has(niche) ? 0 : 8) +
          (parentRoots.has(parent) ? 0 : 4);
        const score = candidate.finalFitness + diversityBonus;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      const [winner] = remaining.splice(bestIndex, 1);
      chosen.push(winner);
      recipes.add(winner.lineage?.recipeId || "");
      modes.add(winner.lineage?.cognitiveMode || "");
      niches.add(winner.nicheCell || "");
      parentRoots.add(winner.lineage?.parentIdeaIds?.[0] || winner.id);
    }
    return chosen;
  }

  function buildIdeaRecord({ candidate, ideaId, generation, generationId, nowMs }) {
    return {
      id: ideaId,
      ideaId,
      generationId,
      generationNumber: Number(generation.generationNumber || 1),
      species: candidate.species,
      speciesRank: candidate.speciesRank,
      status: "alive",
      statusSource: "labor_selection",
      autonomous: true,
      pipelineSource: "evolver",
      pipelineStatus: "queued",
      pipelinePhase: "waiting_for_evolution",
      pipelineError: "",
      ageWhenDecided: 0,
      killReason: "",
      evidenceStrength: "simulated",
      validationStage: "generated",
      name: candidate.phenotype?.name || candidate.genome?.workingName || "Untitled organism",
      oneLiner: candidate.phenotype?.oneLiner || candidate.genome?.opportunityStatement || "",
      phenotype: candidate.phenotype,
      genome: candidate.genome,
      survivalProfile: candidate.survivalProfile,
      finalFitness: candidate.finalFitness,
      predatorScores: candidate.predatorScores,
      topAttacks: candidate.topAttacks,
      repair: candidate.repair,
      deploymentFit: candidate.deploymentFit,
      autonomyCheck: candidate.autonomyCheck,
      fingerprint: candidate.fingerprint,
      lineage: candidate.lineage,
      niche: candidate.niche,
      nicheCell: candidate.nicheCell,
      selectionReason: candidate.selectionReason,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  function buildGenerationMetrics(selection, candidates) {
    const selected = selection.selected;
    const meanFitness = average(selected.map((item) => item.finalFitness));
    const meanNovelty = average(selected.map((item) => Number(item.survivalProfile?.novelty || 0)));
    const meanCoherence = average(selected.map((item) => Number(item.coherence || 0)));
    const nicheCoverage = new Set(selected.map((item) => `${item.species}:${item.nicheCell}`)).size;
    const lineageCoverage = new Set(selected.map((item) =>
      `${item.lineage?.recipeId}:${item.lineage?.cognitiveMode}:${item.lineage?.parentIdeaIds?.[0] || "root"}`
    )).size;
    const killReasons = countBy(selection.eliminated, (item) => item.deathCertificate?.killReason || "unknown");
    return {
      generatedCount: candidates.length,
      evaluatedCount: candidates.filter((item) => item.status === "evaluated").length,
      selectedCount: selected.length,
      eliminatedCount: selection.eliminated.length,
      meanFitness,
      meanNovelty,
      meanCoherence,
      nicheCoverage,
      lineageCoverage,
      structuralDuplicateRate:
        (((killReasons.global_identity_collision || 0) +
          (killReasons.generation_identity_collision || 0)) /
          Math.max(1, selection.eliminated.length)) * 100,
      autonomyRejectedCount: killReasons.v1_autonomy_dependency || 0,
      autonomyRejectionRate:
        ((killReasons.v1_autonomy_dependency || 0) /
          Math.max(1, selection.eliminated.length)) * 100,
      firebaseConstraintRejectionRate:
        (((killReasons.execution || 0) +
          (killReasons.v1_autonomy_dependency || 0) +
          (killReasons.v1_autonomy_unverified || 0)) /
          Math.max(1, selection.eliminated.length)) * 100,
      speciesCounts: countBy(selected, (item) => item.species),
      killReasons,
    };
  }

  function defaultFlowGenome() {
    return {
      id: "flow_0001",
      version: 1,
      status: "active",
      name: "Convergence Ecology",
      marketQuestions: [
        "What became technically possible in the last meaningful capability shift?",
        "What became at least an order of magnitude cheaper?",
        "Which behavior changed before products adapted?",
        "Which regulated workflow gained a new proof burden?",
        "Which expensive task still moves through documents, forms, or spreadsheets?",
        "Which product category became obsolete or overcrowded?",
        "Which underserved group can now be reached directly?",
        "Which two or three independent pressures are converging?",
      ],
      archivesToExamine: ["living_forest", "graveyard", "novelty_memory", "museum_of_champions"],
      mutationProbabilities: normalizeWeights({
        value: 0.11,
        insertion: 0.1,
        deletion: 0.1,
        duplication: 0.08,
        transposition: 0.12,
        crossover: 0.13,
        inversion: 0.11,
        environmental: 0.13,
        rearrangement: 0.06,
        repair: 0.06,
      }),
      cognitiveModeWeights: normalizeWeights(
        Object.fromEntries(COGNITIVE_MODES.map((mode) => [mode, 0.1]))
      ),
      candidateCount: 240,
      breedBatchSize: 20,
      attackBatchSize: 6,
      evaluatorOrder: PREDATOR_ROLES,
      fitnessWeights: normalizeWeights({
        problem: 0.17,
        timing: 0.13,
        distribution: 0.13,
        economic: 0.12,
        mechanism: 0.12,
        defensibility: 0.08,
        novelty: 0.11,
        execution: 0.09,
        survivalCalibration: 0.05,
      }),
      parentSelection: {
        livingElites: 0.28,
        underexploredCells: 0.2,
        repairedFailures: 0.17,
        marketPressures: 0.2,
        distantDomains: 0.1,
        crossSpecies: 0.05,
      },
      minimumSurvivalScore: 55,
      noveltySimilarityThreshold: 0.78,
      nicheExplorationRate: 0.42,
      riskBudget: 0.38,
      noveltyBudget: 0.62,
      repairBudget: 0.24,
      pressureConvergenceMinimum: 2,
      promotionGuard: {
        minDownstreamLabels: 12,
        minimumWinningMargin: 3,
        maximumMetricRegression: 5,
        minimumConfidence: 0.72,
      },
    };
  }

  function normalizeFlowGenome(value) {
    const base = defaultFlowGenome();
    const flow = value && typeof value === "object" ? value : {};
    return {
      ...base,
      ...cleanValue(flow),
      id: safeId(flow.id) || base.id,
      version: clampInteger(flow.version, 1, 100000, base.version),
      marketQuestions: stringArray(flow.marketQuestions, 16).length
        ? stringArray(flow.marketQuestions, 16)
        : base.marketQuestions,
      archivesToExamine: stringArray(flow.archivesToExamine, 12).length
        ? stringArray(flow.archivesToExamine, 12)
        : base.archivesToExamine,
      mutationProbabilities: normalizeWeights({
        ...base.mutationProbabilities,
        ...(flow.mutationProbabilities || {}),
      }),
      cognitiveModeWeights: normalizeWeights({
        ...base.cognitiveModeWeights,
        ...(flow.cognitiveModeWeights || {}),
      }),
      fitnessWeights: normalizeWeights({
        ...base.fitnessWeights,
        ...(flow.fitnessWeights || {}),
      }),
      parentSelection: normalizeWeights({
        ...base.parentSelection,
        ...(flow.parentSelection || {}),
      }),
      candidateCount: normalizeCandidateCount(flow.candidateCount || base.candidateCount),
      breedBatchSize: clampInteger(flow.breedBatchSize, 10, 30, base.breedBatchSize),
      attackBatchSize: clampInteger(flow.attackBatchSize, 4, 10, base.attackBatchSize),
      evaluatorOrder: normalizeEvaluatorOrder(flow.evaluatorOrder),
      minimumSurvivalScore: clampNumber(flow.minimumSurvivalScore, 40, 78, base.minimumSurvivalScore),
      noveltySimilarityThreshold: clampNumber(
        flow.noveltySimilarityThreshold,
        0.55,
        0.95,
        base.noveltySimilarityThreshold
      ),
      nicheExplorationRate: clampNumber(flow.nicheExplorationRate, 0.1, 0.9, base.nicheExplorationRate),
      riskBudget: clampNumber(flow.riskBudget, 0.1, 0.85, base.riskBudget),
      noveltyBudget: clampNumber(flow.noveltyBudget, 0.2, 0.9, base.noveltyBudget),
      repairBudget: clampNumber(flow.repairBudget, 0.05, 0.6, base.repairBudget),
      pressureConvergenceMinimum: clampInteger(
        flow.pressureConvergenceMinimum,
        2,
        4,
        base.pressureConvergenceMinimum
      ),
      promotionGuard: {
        ...base.promotionGuard,
        ...(flow.promotionGuard || {}),
      },
    };
  }

  function mutateFlowGenome(incumbentValue, mutation, nextGeneration) {
    const incumbent = normalizeFlowGenome(incumbentValue);
    const proposal = mutation && typeof mutation === "object" ? mutation : {};
    const next = normalizeFlowGenome({
      ...incumbent,
      version: incumbent.version + 1,
      candidateCount: proposal.candidateCount || incumbent.candidateCount,
      mutationProbabilities: proposal.mutationProbabilities || incumbent.mutationProbabilities,
      cognitiveModeWeights: proposal.cognitiveModeWeights || incumbent.cognitiveModeWeights,
      fitnessWeights: proposal.fitnessWeights || incumbent.fitnessWeights,
      parentSelection: proposal.parentSelection || incumbent.parentSelection,
      evaluatorOrder: proposal.evaluatorOrder || incumbent.evaluatorOrder,
      minimumSurvivalScore: proposal.minimumSurvivalScore ?? incumbent.minimumSurvivalScore,
      noveltySimilarityThreshold:
        proposal.noveltySimilarityThreshold ?? incumbent.noveltySimilarityThreshold,
      nicheExplorationRate: proposal.nicheExplorationRate ?? incumbent.nicheExplorationRate,
      riskBudget: proposal.riskBudget ?? incumbent.riskBudget,
      noveltyBudget: proposal.noveltyBudget ?? incumbent.noveltyBudget,
      repairBudget: proposal.repairBudget ?? incumbent.repairBudget,
      marketQuestions: uniqueStrings([
        ...incumbent.marketQuestions,
        ...stringArray(proposal.marketQuestionAdditions, 4),
      ]).slice(-16),
    });
    next.generation = nextGeneration;
    return next;
  }

  function normalizeRecipeOffspring(raw, recipes, generationId) {
    const knownIds = new Set(recipes.map((recipe) => recipe.id));
    return (Array.isArray(raw) ? raw : []).slice(0, 3).map((recipe, index) => {
      const baseId = safeId(recipe?.id || recipe?.name) || `recipe_${index + 1}`;
      let id = `${baseId}_${shortHash(generationId + index)}`;
      if (knownIds.has(id)) id = `${id}_${index + 1}`;
      return {
        id,
        name: cleanText(recipe?.name, 120) || titleCase(baseId),
        thesis: cleanText(recipe?.thesis, 800),
        preferredOperators: stringArray(recipe?.preferredOperators, 8),
        parentRecipeIds: stringArray(recipe?.parentRecipeIds, 4),
        mutationRationale: cleanText(recipe?.mutationRationale, 800),
        status: "experimental",
        generation: 2,
        influence: 0.025,
        trials: 0,
        candidatesGenerated: 0,
        survivors: 0,
        selectedScoreTotal: 0,
        downstreamSurvivors: 0,
        downstreamDeaths: 0,
        createdByGenerationId: generationId,
      };
    });
  }

  function normalizePredatorMutations(raw, predators, generationId) {
    const known = new Set(predators.map((predator) => predator.id));
    return (Array.isArray(raw) ? raw : []).slice(0, 4).map((variant, index) => {
      const parentPredatorId = known.has(safeId(variant?.parentPredatorId))
        ? safeId(variant.parentPredatorId)
        : PREDATOR_ROLES[index % PREDATOR_ROLES.length];
      return {
        id: `${parentPredatorId}_variant_${shortHash(generationId + index)}`,
        parentPredatorId,
        question: cleanText(variant?.question, 600),
        targetsFailurePattern: cleanText(variant?.targetsFailurePattern, 600),
        mutationRationale: cleanText(variant?.mutationRationale, 800),
        status: "shadow",
        generation: 2,
        createdByGenerationId: generationId,
      };
    });
  }

  function decideFlowPromotion({ incumbent, challenger, tournament, labeledIdeaCount }) {
    const guard = incumbent.promotionGuard || defaultFlowGenome().promotionGuard;
    const incumbentScore = tournamentComposite(tournament?.incumbent);
    const challengerScore = tournamentComposite(tournament?.challenger);
    const margin = challengerScore - incumbentScore;
    const confidence = clampNumber(tournament?.confidence, 0, 1, 0);
    const regressions = tournamentRegressions(tournament?.incumbent, tournament?.challenger);
    if (labeledIdeaCount < Number(guard.minDownstreamLabels || 12)) {
      return {
        promoted: false,
        status: "shadow",
        reason: `Held in shadow until ${guard.minDownstreamLabels} user survival outcomes exist; ${labeledIdeaCount} are available.`,
        incumbentScore,
        challengerScore,
        margin,
      };
    }
    if (String(tournament?.verdict || "").toLowerCase() !== "promote") {
      return {
        promoted: false,
        status: "rejected",
        reason: cleanText(tournament?.rationale, 800) || "The challenger did not win the historical replay.",
        incumbentScore,
        challengerScore,
        margin,
      };
    }
    if (margin < Number(guard.minimumWinningMargin || 3)) {
      return {
        promoted: false,
        status: "shadow",
        reason: `The challenger won by ${margin.toFixed(1)}, below the ${guard.minimumWinningMargin}-point promotion margin.`,
        incumbentScore,
        challengerScore,
        margin,
      };
    }
    if (confidence < Number(guard.minimumConfidence || 0.72)) {
      return {
        promoted: false,
        status: "shadow",
        reason: "Tournament confidence did not clear the promotion guard.",
        incumbentScore,
        challengerScore,
        margin,
      };
    }
    if (regressions.some((regression) => regression.amount > Number(guard.maximumMetricRegression || 5))) {
      return {
        promoted: false,
        status: "rejected",
        reason: `Promotion blocked by regression in ${regressions[0].metric}.`,
        incumbentScore,
        challengerScore,
        margin,
      };
    }
    return {
      promoted: true,
      status: "active",
      reason: `The challenger won by ${margin.toFixed(1)} points with ${Math.round(confidence * 100)}% confidence.`,
      incumbentScore,
      challengerScore,
      margin,
      activeFlowId: challenger.id,
    };
  }

  function tournamentComposite(profile) {
    const metrics = profile && typeof profile === "object" ? profile : {};
    const positive = [
      "survivalPrediction",
      "deathPrediction",
      "diversity",
      "globalUniqueness",
      "coherence",
      "marketTiming",
      "nicheCoverage",
    ];
    const positiveMean = average(positive.map((key) => Number(metrics[key] || 0)));
    const costPenalty = Number(metrics.computationalCost || 0) * 0.08;
    const falsePositivePenalty = Number(metrics.falsePositiveRate || 0) * 0.12;
    return round2(positiveMean - costPenalty - falsePositivePenalty);
  }

  function tournamentRegressions(incumbent, challenger) {
    const positive = [
      "survivalPrediction",
      "deathPrediction",
      "diversity",
      "globalUniqueness",
      "coherence",
      "marketTiming",
      "nicheCoverage",
    ];
    return positive
      .map((metric) => ({
        metric,
        amount: Number(incumbent?.[metric] || 0) - Number(challenger?.[metric] || 0),
      }))
      .filter((item) => item.amount > 0)
      .sort((left, right) => right.amount - left.amount);
  }

  function normalizeCandidateGenome(value, species) {
    const genome = value && typeof value === "object" ? value : {};
    return cleanValue({
      species,
      workingName: cleanText(genome.workingName, 120),
      opportunityStatement: cleanText(genome.opportunityStatement, 800),
      pressureIds: stringArray(genome.pressureIds, 8),
      nicheId: safeId(genome.nicheId),
      recipeId: safeId(genome.recipeId),
      cognitiveMode: chooseCognitiveMode(genome.cognitiveMode, 0),
      mutationOperators: stringArray(genome.mutationOperators, 8),
      parentIdeaIds: stringArray(genome.parentIdeaIds, 8),
      lineageRationale: cleanText(genome.lineageRationale, 900),
      causalMechanism: cleanText(genome.causalMechanism, 900),
      operatorIndependence: cleanText(genome.operatorIndependence, 700),
      firebaseArchitecture: cleanText(genome.firebaseArchitecture, 900),
      constraintProof: cleanText(genome.constraintProof, 900),
      genes: normalizeSpeciesGenes(genome.genes, species),
    });
  }

  function normalizeSpeciesGenes(value, species) {
    const genes = value && typeof value === "object" ? value : {};
    const keys = speciesGeneKeys(species);
    return Object.fromEntries(keys.map((key) => [key, cleanText(genes[key], 700)]));
  }

  function normalizeEvaluation(value, candidate) {
    const evaluation = value && typeof value === "object" ? value : {};
    const profile = Object.fromEntries(
      FITNESS_KEYS.map((key) => [key, clampNumber(evaluation.survivalProfile?.[key], 0, 100, 0)])
    );
    const predatorScores = Object.fromEntries(
      PREDATOR_ROLES.map((role) => [role, clampNumber(evaluation.predatorScores?.[role], 0, 100, 0)])
    );
    const phenotype = evaluation.phenotype && typeof evaluation.phenotype === "object"
      ? evaluation.phenotype
      : {};
    return cleanValue({
      candidateId: candidate.id,
      phenotype: {
        name: cleanText(phenotype.name, 140) || candidate.genome?.workingName,
        oneLiner: cleanText(phenotype.oneLiner, 360),
        customerOrPlayer: cleanText(phenotype.customerOrPlayer, 700),
        problemOrFantasy: cleanText(phenotype.problemOrFantasy, 900),
        productConcept: cleanText(phenotype.productConcept, 1800),
        workflow: stringArray(phenotype.workflow, 8, 600),
        monetization: cleanText(phenotype.monetization, 700),
        distribution: cleanText(phenotype.distribution, 800),
        moat: cleanText(phenotype.moat, 800),
        firstUsers: cleanText(phenotype.firstUsers, 700),
        risks: stringArray(phenotype.risks, 6, 600),
        whyNow: cleanText(phenotype.whyNow, 1000),
        pressureConvergence: stringArray(phenotype.pressureConvergence, 6, 500),
        firebaseArchitecture: stringArray(phenotype.firebaseArchitecture, 8, 600),
      },
      survivalProfile: profile,
      predatorScores,
      fatalPredators: stringArray(evaluation.fatalPredators, 10)
        .filter((role) => PREDATOR_ROLES.includes(role)),
      topAttacks: (Array.isArray(evaluation.topAttacks) ? evaluation.topAttacks : [])
        .slice(0, 4)
        .map((attack) => ({
          predator: PREDATOR_ROLES.includes(attack?.predator) ? attack.predator : "skeptic",
          predatorVariantId: safeId(attack?.predatorVariantId),
          question: cleanText(attack?.question, 500),
          attack: cleanText(attack?.attack, 900),
          evidence: cleanText(attack?.evidence, 800),
          repair: cleanText(attack?.repair, 800),
        })),
      repair: {
        applied: Boolean(evaluation.repair?.applied),
        reason: cleanText(evaluation.repair?.reason, 700),
        genomeChanges: stringArray(evaluation.repair?.genomeChanges, 8, 500),
        repairedConcept: cleanText(evaluation.repair?.repairedConcept, 1200),
      },
      fingerprint: normalizeFingerprint(evaluation.fingerprint, candidate),
      niche: {
        cellKey: safeId(evaluation.niche?.cellKey) || safeId(candidate.genome?.nicheId) || "unmapped",
        axisA: cleanText(evaluation.niche?.axisA, 120),
        axisB: cleanText(evaluation.niche?.axisB, 120),
        axisC: cleanText(evaluation.niche?.axisC, 120),
        habitat: cleanText(evaluation.niche?.habitat, 360),
      },
      deploymentFit: {
        firebaseOnly: Boolean(evaluation.deploymentFit?.firebaseOnly),
        operatorIndependent: Boolean(evaluation.deploymentFit?.operatorIndependent),
        externalServices: stringArray(evaluation.deploymentFit?.externalServices, 10, 300),
        manualSteps: stringArray(evaluation.deploymentFit?.manualSteps, 10, 300),
        explanation: cleanText(evaluation.deploymentFit?.explanation, 900),
      },
      coherence: clampNumber(evaluation.coherence, 0, 100, 0),
      fatality: clampNumber(evaluation.fatality, 0, 100, 0),
    });
  }

  function normalizeFingerprint(value, candidate = {}) {
    const fingerprint = value && typeof value === "object" ? value : {};
    return {
      customer: cleanText(fingerprint.customer, 600),
      problem: cleanText(fingerprint.problem, 700),
      workflow: cleanText(fingerprint.workflow, 700),
      economic: cleanText(fingerprint.economic, 600),
      mechanism: cleanText(fingerprint.mechanism, 800),
      lineage: cleanText(
        fingerprint.lineage || JSON.stringify(candidate.lineage || candidate.genome?.parentIdeaIds || []),
        700
      ),
    };
  }

  function structuralSimilarity(leftValue, rightValue) {
    const left = normalizeFingerprint(leftValue);
    const right = normalizeFingerprint(rightValue);
    const weights = {
      customer: 0.14,
      problem: 0.22,
      workflow: 0.2,
      economic: 0.13,
      mechanism: 0.25,
      lineage: 0.06,
    };
    return round4(Object.entries(weights).reduce((sum, [key, weight]) =>
      sum + tokenSimilarity(left[key], right[key]) * weight, 0));
  }

  function closestFingerprint(fingerprint, records) {
    let best = { id: "", similarity: 0 };
    (Array.isArray(records) ? records : []).forEach((record) => {
      const candidateFingerprint = record?.fingerprint || record;
      const similarity = structuralSimilarity(fingerprint, candidateFingerprint);
      if (similarity > best.similarity) {
        best = { id: record?.ideaId || record?.id || "prior", similarity };
      }
    });
    return best;
  }

  function tokenSimilarity(left, right) {
    const leftTokens = normalizedTokens(left);
    const rightTokens = normalizedTokens(right);
    if (!leftTokens.size || !rightTokens.size) return 0;
    let intersection = 0;
    leftTokens.forEach((token) => {
      if (rightTokens.has(token)) intersection += 1;
    });
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return union ? intersection / union : 0;
  }

  function normalizedTokens(value) {
    const stop = new Set([
      "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
      "it", "of", "on", "or", "that", "the", "their", "this", "to", "with", "using",
      "user", "users", "product", "system", "app", "application", "software", "tool",
    ]);
    return new Set(
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .map(stemToken)
        .filter((token) => token.length > 2 && !stop.has(token))
    );
  }

  function stemToken(token) {
    if (token.length > 6 && token.endsWith("ing")) return token.slice(0, -3);
    if (token.length > 5 && token.endsWith("ed")) return token.slice(0, -2);
    if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
    return token;
  }

  function weightedFitness(profile, weightsValue) {
    const baseWeights = defaultFlowGenome().fitnessWeights;
    const weights = normalizeWeights({ ...baseWeights, ...(weightsValue || {}) });
    return round2(FITNESS_KEYS.reduce((sum, key) =>
      sum + clampNumber(profile?.[key], 0, 100, 0) * Number(weights[key] || 0), 0));
  }

  function validateMarketWeatherSearchEvidence(weather, webSearch) {
    const asOfMs = Date.parse(cleanText(weather?.asOfDate, 80));
    if (!Number.isFinite(asOfMs) || Math.abs(Date.now() - asOfMs) > 48 * 60 * 60 * 1000) {
      throw new Error("Market Weather did not report a current asOfDate.");
    }
    const retrievedUrls = new Set(
      (Array.isArray(webSearch?.sources) ? webSearch.sources : [])
        .map((source) => canonicalEvidenceUrl(source?.url))
        .filter(Boolean)
    );
    if (!retrievedUrls.size) {
      throw new Error("Market Weather search returned no verifiable source URLs.");
    }

    const pressures = Array.isArray(weather?.pressures) ? weather.pressures : [];
    const unsupported = pressures.filter((pressure) => {
      const evidenceUrls = (Array.isArray(pressure?.evidenceSources)
        ? pressure.evidenceSources
        : []).map((source) => canonicalEvidenceUrl(source?.url)).filter(Boolean);
      return !evidenceUrls.length || !evidenceUrls.some((url) => retrievedUrls.has(url));
    });
    if (unsupported.length) {
      throw new Error(
        `Market Weather contains pressures without retrieved web evidence: ${unsupported
          .slice(0, 6)
          .map((pressure) => safeId(pressure?.id) || "unnamed")
          .join(", ")}.`
      );
    }
    return true;
  }

  function canonicalEvidenceUrl(value) {
    try {
      const url = new URL(cleanText(value, 1600));
      if (!["http:", "https:"].includes(url.protocol)) return "";
      url.hash = "";
      url.search = "";
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
    } catch {
      return "";
    }
  }

  function validateAutonomyAudit(value, candidates) {
    const population = Array.isArray(candidates) ? candidates : [];
    const expectedByNormalizedId = new Map();
    population.forEach((candidate) => {
      const normalizedId = safeId(candidate?.id);
      if (!normalizedId || expectedByNormalizedId.has(normalizedId)) {
        throw new Error("The candidate population contains a missing or duplicate autonomy-check ID.");
      }
      expectedByNormalizedId.set(normalizedId, candidate.id);
    });

    const rawDecisions = Array.isArray(value?.decisions) ? value.decisions : [];
    if (rawDecisions.length !== population.length) {
      throw new Error(
        `v1_autonomy_check returned ${rawDecisions.length} decisions for ${population.length} candidates.`
      );
    }
    const seen = new Set();
    const extras = [];
    const decisions = rawDecisions.map((item) => {
      const normalizedId = safeId(item?.candidateId);
      if (!normalizedId || seen.has(normalizedId)) {
        throw new Error(`v1_autonomy_check returned a missing or duplicate candidateId: ${normalizedId || "empty"}.`);
      }
      seen.add(normalizedId);
      const candidateId = expectedByNormalizedId.get(normalizedId);
      if (!candidateId) extras.push(normalizedId);

      const dependencyKinds = uniqueStrings(item?.dependencyKinds)
        .map(safeId)
        .filter((kind) => AUTONOMY_DEPENDENCY_KINDS.includes(kind));
      const implicatedSystems = stringArray(item?.implicatedSystems, 10, 300);
      const explicit = Boolean(item?.explicit);
      const downstreamHumanIntervention = Boolean(item?.downstreamHumanIntervention);
      const hasDependencyEvidence =
        dependencyKinds.length > 0 ||
        implicatedSystems.length > 0 ||
        explicit ||
        downstreamHumanIntervention;
      const forbidden = item?.verdict === "forbidden" || hasDependencyEvidence;
      if (forbidden && !dependencyKinds.length) {
        dependencyKinds.push("other_dependency");
      }
      return {
        checkId: V1_AUTONOMY_CHECK_ID,
        policyVersion: 1,
        candidateId: candidateId || normalizedId,
        verdict: forbidden ? "forbidden" : "independent",
        dependencyKinds: forbidden ? dependencyKinds : [],
        implicatedSystems: forbidden ? implicatedSystems : [],
        explicit: forbidden && explicit,
        downstreamHumanIntervention: forbidden && downstreamHumanIntervention,
        evidence: cleanText(item?.evidence, 900),
        reason: cleanText(item?.reason, 1200),
      };
    });
    const missing = Array.from(expectedByNormalizedId.keys()).filter((id) => !seen.has(id));
    if (missing.length || extras.length) {
      throw new Error(
        `v1_autonomy_check coverage mismatch; missing: ${missing.slice(0, 12).join(", ") || "none"}; ` +
        `unexpected: ${extras.slice(0, 12).join(", ") || "none"}.`
      );
    }

    const decisionById = new Map(decisions.map((decision) => [decision.candidateId, decision]));
    const orderedDecisions = population.map((candidate) => decisionById.get(candidate.id));
    const forbiddenCount = orderedDecisions.filter((decision) => decision.verdict === "forbidden").length;
    return {
      id: V1_AUTONOMY_CHECK_ID,
      checkId: V1_AUTONOMY_CHECK_ID,
      policyVersion: 1,
      auditThesis: cleanText(value?.auditThesis, 1600),
      reviewedCandidateIds: population.map((candidate) => candidate.id),
      decisions: orderedDecisions,
      allowedCount: orderedDecisions.length - forbiddenCount,
      forbiddenCount,
    };
  }

  function validateStoredAutonomyCheck(value, candidates) {
    const population = Array.isArray(candidates) ? candidates : [];
    const expectedIds = population.map((candidate) => candidate.id);
    const reviewedIds = stringArray(value?.reviewedCandidateIds, 600, 180);
    const expected = new Set(expectedIds.map(safeId));
    const reviewed = new Set(reviewedIds.map(safeId));
    if (
      reviewedIds.length !== expectedIds.length ||
      reviewed.size !== expected.size ||
      Array.from(expected).some((candidateId) => !reviewed.has(candidateId))
    ) {
      throw new Error("Stored v1_autonomy_check evidence does not cover the complete candidate population.");
    }

    const audit = validateAutonomyAudit({
      auditThesis: value?.auditThesis,
      decisions: population.map((candidate) => candidate.autonomyCheck),
    }, population);
    const storedDigest = cleanText(value?.decisionDigest, 128);
    const decisionDigest = autonomyDecisionDigest(audit.decisions);
    if (!storedDigest || storedDigest !== decisionDigest) {
      throw new Error("Stored v1_autonomy_check decisions do not match their generation audit digest.");
    }
    if (
      Number(value?.allowedCount) !== audit.allowedCount ||
      Number(value?.forbiddenCount) !== audit.forbiddenCount
    ) {
      throw new Error("Stored v1_autonomy_check counts do not match candidate decisions.");
    }
    return audit;
  }

  function autonomyDecisionDigest(decisions) {
    const canonical = (Array.isArray(decisions) ? decisions : []).map((decision) => ({
      candidateId: decision?.candidateId || "",
      verdict: decision?.verdict || "",
      dependencyKinds: stringArray(decision?.dependencyKinds, 12, 120),
      implicatedSystems: stringArray(decision?.implicatedSystems, 10, 300),
      explicit: Boolean(decision?.explicit),
      downstreamHumanIntervention: Boolean(decision?.downstreamHumanIntervention),
      evidence: cleanText(decision?.evidence, 900),
      reason: cleanText(decision?.reason, 1200),
    }));
    return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  }

  function feasibilityFailure(candidate) {
    const autonomy = candidate.autonomyCheck || {};
    if (autonomy.verdict === "forbidden") {
      return cleanText(
        autonomy.reason ||
          "The population-wide autonomy check found a forbidden dependency in the core value loop.",
        1200
      );
    }
    if (autonomy.verdict !== "independent") {
      return "The idea has not passed the required v1_autonomy_check.";
    }
    const fit = candidate.deploymentFit || {};
    if (!fit.firebaseOnly) {
      return "The core value loop cannot run entirely on Firebase Hosting, Firestore, Storage, and LLM calls.";
    }
    if (!fit.operatorIndependent) {
      return "The idea requires founder, operator, or service-team intervention to deliver its core outcome.";
    }
    if (stringArray(fit.externalServices, 20).length) {
      return `Forbidden external services: ${stringArray(fit.externalServices, 6).join(", ")}.`;
    }
    if (stringArray(fit.manualSteps, 20).length) {
      return `Manual fulfillment remains in the value loop: ${stringArray(fit.manualSteps, 4).join(", ")}.`;
    }
    return "";
  }

  function withDeathCertificate(candidate, killReason, explanation, validationStage, duplicate = null) {
    return {
      ...candidate,
      deathCertificate: {
        status: "killed",
        ageWhenDecided: 0,
        killReason,
        explanation: cleanText(explanation, 1200),
        evidenceStrength: "simulated",
        validationStage,
        predatorEvidence: candidate.topAttacks?.slice(0, 3) || [],
        autonomyEvidence: candidate.autonomyCheck?.verdict === "forbidden"
          ? cleanValue(candidate.autonomyCheck)
          : null,
        duplicateOf: duplicate?.id || "",
        duplicateSimilarity: Number(duplicate?.similarity || 0),
      },
    };
  }

  function weakestFitnessAxis(profile) {
    return FITNESS_KEYS.reduce((weakest, key) =>
      Number(profile?.[key] || 0) < Number(profile?.[weakest] || 0) ? key : weakest,
    FITNESS_KEYS[0]);
  }

  function deriveNicheCell(candidate) {
    return safeId(candidate.niche?.cellKey || candidate.genome?.nicheId) ||
      `${candidate.species}_${shortHash(JSON.stringify(candidate.fingerprint || {}))}`;
  }

  function normalizeNiches(value) {
    const raw = Array.isArray(value?.niches) ? value.niches : [];
    return raw
      .map((niche, index) => ({
        id: safeId(niche?.id) || `niche_${index + 1}`,
        species: normalizeSpecies(niche?.species) || SPECIES[index % SPECIES.length],
        habitat: cleanText(niche?.habitat, 500),
        axisA: cleanText(niche?.axisA, 160),
        axisB: cleanText(niche?.axisB, 160),
        axisC: cleanText(niche?.axisC, 160),
        pressureIds: stringArray(niche?.pressureIds, 8),
        underexploredReason: cleanText(niche?.underexploredReason, 700),
        selectionRule: cleanText(niche?.selectionRule, 700),
      }))
      .filter((niche) => niche.habitat)
      .slice(0, 45);
  }

  function normalizeCandidateCount(value) {
    return clampInteger(value, 200, 500, 240);
  }

  function distributeSpeciesTarget(total) {
    const base = Math.floor(total / SPECIES.length);
    const remainder = total - base * SPECIES.length;
    return Object.fromEntries(SPECIES.map((species, index) => [species, base + (index < remainder ? 1 : 0)]));
  }

  function normalizeEvaluatorOrder(value) {
    const supplied = stringArray(value, PREDATOR_ROLES.length)
      .filter((role) => PREDATOR_ROLES.includes(role));
    return uniqueStrings([...supplied, ...PREDATOR_ROLES]);
  }

  function chooseKnownId(value, items, index) {
    const known = new Set((Array.isArray(items) ? items : []).map((item) => item.id));
    const requested = safeId(value);
    if (known.has(requested)) return requested;
    return items[index % Math.max(1, items.length)]?.id || requested || "root";
  }

  function chooseCognitiveMode(value, index) {
    const mode = safeId(value);
    return COGNITIVE_MODES.includes(mode) ? mode : COGNITIVE_MODES[index % COGNITIVE_MODES.length];
  }

  function speciesGeneKeys(species) {
    if (species === "game") {
      return [
        "coreFantasy", "primaryMechanic", "playerSkill", "progression", "failure", "reward",
        "replayLoop", "socialLoop", "sessionLength", "contentExpansion", "visualIdentity", "monetization",
      ];
    }
    if (species === "agent") {
      return [
        "goal", "trigger", "inputs", "tools", "memory", "planning", "permissions",
        "humanApproval", "failureHandling", "observability", "economicValue", "frequency", "autonomyBoundary",
      ];
    }
    return [
      "customer", "pain", "frequency", "currentWorkaround", "buyer", "urgency", "workflow",
      "distribution", "pricing", "switchingCost", "dataAdvantage", "timeToValue",
    ];
  }

  function feasibilityEnvelope() {
    return {
      allowedRuntime: ["Firebase Hosting", "Firestore", "Firebase Storage", "LLM calls"],
      externalServicePolicy: "none",
      operatorInterventionPolicy: "none for the core value loop",
      communicationInfrastructurePolicy: "no email, SMS, telephony, or messaging server setup",
      implementationRule:
        "A single developer must be able to ship the complete core product without a third-party account or manual fulfillment team.",
    };
  }

  function sharedLaborInstruction() {
    return [
      `You are a permanent subsystem inside ${ENGINE_NAME}, not a generic brainstorming assistant.`,
      "Labor evolves an ecosystem of generators. Ideas, mutation recipes, predator evaluators, fitness weights, niche exploration, and the Flow Genome all have ancestry and can evolve.",
      "Preserve causal specificity. Do not disguise old concepts with new names. Compare customer, problem, workflow, economics, mechanism, and lineage.",
      "Every idea must deliver its complete core value with Firebase Hosting, Firestore, Firebase Storage, and LLM calls only.",
      "Reject ideas whose core execution needs a third-party API, SaaS integration, email/SMS/telephony server, hardware, browser extension, native app, scraping infrastructure, human concierge, operator review, manual outreach, or manual fulfillment.",
      "Normal customer interaction is allowed. Founder or service-team intervention in the value loop is not.",
      "Do not assume market success. Optimize startup hypotheses for fewer obvious failures, stronger timing, realistic distribution, conceptual novelty, niche diversity, and longer survival.",
    ].join("\n");
  }

  function marketWeatherSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You are the Market Weather observer.",
      "You must search the live web before forming the report. Model memory is not acceptable evidence for current market conditions.",
      "Produce market pressures, not trend headlines. A pressure must connect a changed capability, cost, behavior, rule, distribution channel, or obsolete workflow to a specific underserved group.",
      "The delta from the prior snapshot matters more than static popularity. Distinguish known signal from inference and assign confidence honestly.",
      "Ground every pressure in current, reputable source evidence. Prefer primary sources and material published or updated within the last 90 days; use older sources only to establish a clearly labeled baseline.",
      "Record the event date separately from publication recency when they differ. Never invent a URL, date, statistic, regulation, product release, or price change.",
      "Reward convergence: each promising pressure should name independent partners that can combine into opportunity.",
    ].join("\n\n");
  }

  function marketWeatherPrompt(previousWeather, flowValue) {
    const flow = normalizeFlowGenome(flowValue || {});
    const observedAt = new Date().toISOString();
    return [
      `Create the Market Weather snapshot for ${observedAt}.`,
      "Search broadly enough to verify changes in capabilities, costs, behavior, regulation, labor, workflows, distribution, and product obsolescence. Do not let one news cycle or one industry dominate the report.",
      "Ask the active Flow Genome's market questions and identify 9-12 concrete pressures usable by SaaS, game, and AI-agent species.",
      "Do not propose finished products yet.",
      `Set asOfDate to ${observedAt}. Every pressure must cite 1-5 web sources that directly support its claimed change; two independent sources are preferred for high-confidence pressures.`,
      "Every pressure must pass the Firebase-only feasibility envelope.",
      "Active market questions:",
      JSON.stringify(flow.marketQuestions),
      "Previous weather snapshot (empty means first generation):",
      JSON.stringify(previousWeather ? compactWeatherForPrompt(previousWeather) : {}),
      "Feasibility envelope:",
      JSON.stringify(feasibilityEnvelope()),
    ].join("\n\n");
  }

  function ancestorSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You are Labor's evolutionary historian and calibration scientist.",
      "Living Forest evidence reveals recurring survivor genes. Graveyard death certificates reveal failure mechanisms. Novelty memory reveals occupied causal structures.",
      "Do not infer traction from a generated or selected status. Separate simulated survival from downstream user labels.",
      "Identify recipe yield, predator blind spots, repeated kill reasons, underexplored idea regions, and repairable deaths.",
    ].join("\n\n");
  }

  function ancestorPrompt(memory, weather) {
    return [
      "Study the current user's complete available ancestry before a new generation breeds.",
      "Explain which genes and recipes deserve more reproductive influence, which failure causes need stronger predators, and which occupied structures must not recur.",
      "Market Weather:",
      JSON.stringify(compactWeatherForPrompt(weather)),
      "Evolution memory:",
      JSON.stringify(memory),
    ].join("\n\n");
  }

  function nicheSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You build Labor's MAP-Elites ecosystem map, called the Museum of Champions.",
      "Do not rank everything on one leaderboard. Define distinct habitats so unusual but viable organisms survive instead of converging on fashionable markets.",
      "Create exactly 12 niches per species. Use that species' native dimensions and include underexplored habitats.",
      "SaaS habitats may vary consumer/enterprise, urgency, autonomy, budget, distribution, and horizontal/vertical.",
      "Game habitats may vary casual/hardcore, solo/social, session length, skill/strategy, and authored/emergent content.",
      "Agent habitats may vary advisory/autonomous, risk, tool count, one-time/continuous, and personal/enterprise.",
    ].join("\n\n");
  }

  function nichePrompt({ weather, ancestry, museum }) {
    return [
      "Build 36 distinct target habitats: 12 SaaS, 12 game, and 12 AI-agent niches.",
      "Each habitat must connect to at least two market pressures and define a selection rule.",
      "Prioritize underexplored cells without abandoning utility, timing, or the Firebase-only constraint.",
      "Market Weather:",
      JSON.stringify(compactWeatherForPrompt(weather)),
      "Ancestral analysis:",
      JSON.stringify(compactAncestryForPrompt(ancestry)),
      "Existing Museum cells:",
      JSON.stringify(museum.slice(0, 120).map(compactMuseumForPrompt)),
    ].join("\n\n");
  }

  function breedingSystemInstruction(species) {
    return [
      sharedLaborInstruction(),
      `You are the Mutation Lab breeder for the ${speciesLabel(species)} species.`,
      `Use the ${speciesLabel(species)} genome only. Do not force another species' genes into it.`,
      "Use value mutation, insertion, deletion, duplication, transposition, crossover, inversion, environmental adaptation, rearrangement, and death-cause repair as genuine structural operators.",
      "Use frustration, observation, analogy, combination, counterfactual thinking, obsession, timing, social imitation, constraint pressure, and accidental discovery as distinct human cognitive modes.",
      "Every genome needs at least two independent market pressures. Distant crossover is welcome when the mechanism remains coherent.",
      "A genome must state exactly why no operator, integration setup, communication server, or manual service is required.",
      "Return structurally different organisms, not surface-level variations.",
    ].join("\n\n");
  }

  function breedingPrompt(context) {
    const {
      generationId,
      shard,
      species,
      requestedCount,
      flow,
      weather,
      ancestry,
      niches,
      recipes,
      parents,
      repairableDeaths,
    } = context;
    return [
      `Breed exactly ${requestedCount} ${speciesLabel(species)} offspring for shard ${shard.id} in generation ${generationId}.`,
      "Distribute them across the supplied niches, mutation recipes, operators, cognitive modes, and lineages.",
      "At least 20% should repair a named death cause when repairable ancestors exist. At least 25% should use distant-domain or cross-species transfer. At least 20% should use inversion or deletion. The rest may exploit market-pressure convergence.",
      "No two offspring may share the same customer/problem/workflow/mechanism skeleton.",
      "Active Flow Genome:",
      JSON.stringify(normalizeFlowGenome(flow || {})),
      "Market Weather:",
      JSON.stringify(compactWeatherForPrompt(weather)),
      "Ancestral analysis:",
      JSON.stringify(compactAncestryForPrompt(ancestry)),
      "Available habitats:",
      JSON.stringify(niches),
      "Competing mutation recipes:",
      JSON.stringify(recipes.map(compactRecipeForPrompt)),
      "Potential living parents:",
      JSON.stringify(parents.slice(0, 50)),
      "Repairable deaths:",
      JSON.stringify(repairableDeaths.slice(0, 60)),
      "Required species genes:",
      JSON.stringify(speciesGeneKeys(species)),
      "Hard feasibility envelope:",
      JSON.stringify(feasibilityEnvelope()),
    ].join("\n\n");
  }

  function predatorSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You are the complete Predator Arena and phenotype expression system.",
      "First express each genome as one coherent product organism. Then independently run all ten predators: customer, buyer, skeptic, competitor, distributor, engineer, regulator, historian, contrarian, and timing.",
      "Predator scores mean probability of surviving that predator from 0 to 100. Do not average away fatal weaknesses.",
      "When a challenger predator question exposes a top attack, record its predatorVariantId; otherwise use an empty string.",
      "Repair promising but flawed candidates when a precise gene change can remove the failure without turning it into a duplicate. Record the repair.",
      "Create a six-layer identity fingerprint: customer, problem, workflow, economics, mechanism, and lineage. Compare causal structure, not vocabulary.",
      "The deployment-fit verdict is a hard gate. Any external service or operator dependence must be stated explicitly and should make firebaseOnly or operatorIndependent false.",
    ].join("\n\n");
  }

  function predatorPrompt({ candidates, predators, noveltyMemory, flow }) {
    return [
      `Express, attack, repair when warranted, and score exactly these ${candidates.length} candidate genomes.`,
      "Return one evaluation for every candidateId exactly once.",
      "A useful idea has a real problem or player desire. A timely idea is supported by recent pressure convergence. A different idea changes the causal skeleton.",
      "Active Flow Genome:",
      JSON.stringify(normalizeFlowGenome(flow || {})),
      "Evolving predator population:",
      JSON.stringify(predators.map(compactPredatorForPrompt)),
      "Prior causal fingerprints:",
      JSON.stringify(noveltyMemory),
      "Candidate genomes:",
      JSON.stringify(candidates.map((candidate) => ({
        candidateId: candidate.id,
        species: candidate.species,
        genome: candidate.genome,
        lineage: candidate.lineage,
      }))),
      "Hard feasibility envelope:",
      JSON.stringify(feasibilityEnvelope()),
    ].join("\n\n");
  }

  function autonomyCheckSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You are v1_autonomy_check, Labor's population-wide zero-dependency auditor.",
      "Audit the meaning and operating model of every idea together. This is semantic systems analysis, never keyword or vendor-name matching.",
      "The only allowed implementation primitives are Firebase Hosting, Firestore, Firebase Storage, and LLM calls. User-supplied text or files may enter through the hosted product and be stored in Firebase.",
      "Mark an idea forbidden when its core value, data, workflow, acquisition, delivery, or continued operation explicitly or implicitly depends on any outside product ecosystem, platform account, API, integration, data source, communication network, payment rail, non-Firebase runtime, device, physical-world service, or separately operated infrastructure.",
      "Infer hidden coupling from the concept itself. If the customer, workflow, data model, or mechanism only exists inside a named external ecosystem, reject it even when the draft omits words such as API or integration and claims to be Firebase-only.",
      "Mark an idea forbidden when a founder, employee, contractor, concierge, moderator, reviewer, approver, domain expert, content team, or other human must perform, inspect, approve, route, fulfill, or rescue any step required for the promised outcome after the user starts the workflow.",
      "Ordinary end-user interaction is not manual fulfillment: a user may provide input, play a game, inspect generated output, or choose what to do with it. A second human role required to complete or validate the product's result is forbidden.",
      "Judge the real dependency implied by the phenotype, genome, workflow, distribution, monetization, architecture, and repair. Do not trust self-authored constraint proofs when the causal model contradicts them.",
      "Return exactly one decision for every supplied candidateId, with no omissions, duplicates, or invented IDs. Independent decisions must have empty dependencyKinds and implicatedSystems and both dependency flags false.",
    ].join("\n\n");
  }

  function autonomyCheckPrompt(candidates) {
    return [
      `Run one grouped v1 autonomy audit across all ${candidates.length} expressed ideas.`,
      "Identify every organism that violates the zero-dependency policy, including concepts coupled to an outside ecosystem without explicitly naming a technical integration.",
      "Use dependencyKinds as a semantic failure taxonomy. In evidence, cite the exact product requirement or causal implication that creates the dependency. In reason, explain why Firebase plus LLM calls cannot independently deliver the complete promised outcome.",
      "For an independent organism, explain briefly why its complete value loop closes inside the allowed stack.",
      "Allowed stack:",
      JSON.stringify(feasibilityEnvelope()),
      "Complete candidate population:",
      JSON.stringify(candidates.map(compactCandidateForAutonomyCheck)),
    ].join("\n\n");
  }

  function evolutionScientistSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You are the evolution scientist that mutates the evolver itself.",
      "Diagnose prediction errors, repeated deaths, recipe yield, predator blind spots, niche coverage, novelty, and compute cost.",
      "Propose a bounded Flow Genome challenger. Never activate it directly.",
      "Weights must remain balanced rather than collapsing around one fashionable signal. Candidate count must remain 200-500.",
      "Create at most three recipe offspring and four predator variants. Each mutation needs a parent and a specific failure pattern or opportunity.",
    ].join("\n\n");
  }

  function evolutionPrompt({ incumbent, metrics, recipes, predators, deaths }) {
    return [
      "Mutate the active evolutionary process based on this generation's evidence.",
      "The challenger will face a Shadow Tournament, so change only fields supported by evidence.",
      "Incumbent Flow Genome:",
      JSON.stringify(incumbent),
      "Generation metrics:",
      JSON.stringify(metrics),
      "Mutation recipe population:",
      JSON.stringify(recipes.map(compactRecipeForPrompt)),
      "Predator population:",
      JSON.stringify(predators.map(compactPredatorForPrompt)),
      "Recent death certificates:",
      JSON.stringify(deaths.slice(0, 100)),
    ].join("\n\n");
  }

  function shadowTournamentSystemInstruction() {
    return [
      sharedLaborInstruction(),
      "You are a conservative Shadow Tournament referee.",
      "The incumbent and challenger must process the same historical conditions. Judge survival prediction, death prediction, diversity, uniqueness, coherence, timing, cost, false positives, and niche coverage.",
      "Generated/selected status is not market traction. Only explicit downstream user survival outcomes count as labeled evidence.",
      "Recommend promotion only when the challenger has a meaningful, explainable win without hiding regressions. Otherwise hold it in shadow or reject it.",
    ].join("\n\n");
  }

  function shadowTournamentPrompt(context) {
    return [
      "Replay both Flow Genomes against the same generation metrics and labeled historical ideas.",
      "Score every metric 0-100 except computationalCost and falsePositiveRate, where lower is better.",
      "Incumbent:",
      JSON.stringify(context.incumbent),
      "Challenger:",
      JSON.stringify(context.challenger),
      "Current generation metrics:",
      JSON.stringify(context.generationMetrics),
      "Downstream-labeled ideas:",
      JSON.stringify(context.labeledIdeas),
      "Prior tournament calibration:",
      JSON.stringify(context.priorTournaments),
    ].join("\n\n");
  }

  function marketWeatherSchema() {
    return objectSchema({
      asOfDate: stringSchema(),
      thesis: stringSchema(),
      changedSincePrevious: arraySchema(stringSchema(), 3, 12),
      pressures: arraySchema(objectSchema({
        id: stringSchema(),
        changeType: enumSchema([
          "capability", "cost", "behavior", "regulation", "labor_shift", "workflow",
          "distribution", "obsolescence", "constraint",
        ]),
        signal: stringSchema(),
        previousDelta: stringSchema(),
        affectedGroups: arraySchema(stringSchema(), 1, 6),
        newCapability: stringSchema(),
        oldConstraint: stringSchema(),
        convergencePartners: arraySchema(stringSchema(), 1, 5),
        confidence: numberSchema(0, 1),
        evidenceBasis: enumSchema(["known", "inferred", "mixed"]),
        evidenceSources: arraySchema(objectSchema({
          title: stringSchema(),
          url: stringSchema(),
          publishedAt: stringSchema(),
          supportedClaim: stringSchema(),
        }), 1, 5),
        firebaseFit: stringSchema(),
      }), 9, 12),
      overcrowdedCategories: arraySchema(stringSchema(), 3, 10),
      underservedGroups: arraySchema(stringSchema(), 4, 12),
      newQuestions: arraySchema(stringSchema(), 3, 8),
    });
  }

  function ancestorSchema() {
    return objectSchema({
      survivorGenes: arraySchema(objectSchema({
        gene: stringSchema(),
        evidence: stringSchema(),
        confidence: numberSchema(0, 1),
      }), 0, 12),
      recurrentDeathPatterns: arraySchema(objectSchema({
        killReason: stringSchema(),
        pattern: stringSchema(),
        strongerPredator: stringSchema(),
      }), 0, 12),
      recipeAssessment: arraySchema(objectSchema({
        recipeId: stringSchema(),
        signal: enumSchema(["amplify", "hold", "mutate", "retire"]),
        reason: stringSchema(),
      }), 0, 16),
      predatorBlindSpots: arraySchema(objectSchema({
        predatorId: stringSchema(),
        missedPattern: stringSchema(),
        proposedQuestion: stringSchema(),
      }), 0, 12),
      underexploredRegions: arraySchema(objectSchema({
        species: enumSchema(SPECIES),
        region: stringSchema(),
        whyUnderexplored: stringSchema(),
        relevantPressureIds: arraySchema(stringSchema(), 1, 6),
      }), 6, 18),
      repairTargets: arraySchema(objectSchema({
        killedIdeaId: stringSchema(),
        deathCause: stringSchema(),
        repairHypothesis: stringSchema(),
      }), 0, 12),
      calibrationWarnings: arraySchema(stringSchema(), 0, 10),
      ancestryThesis: stringSchema(),
    });
  }

  function nicheMapSchema() {
    return objectSchema({
      ecosystemThesis: stringSchema(),
      niches: arraySchema(objectSchema({
        id: stringSchema(),
        species: enumSchema(SPECIES),
        habitat: stringSchema(),
        axisA: stringSchema(),
        axisB: stringSchema(),
        axisC: stringSchema(),
        pressureIds: arraySchema(stringSchema(), 2, 6),
        underexploredReason: stringSchema(),
        selectionRule: stringSchema(),
      }), 36, 36),
    });
  }

  function breedingSchema(species, count) {
    const geneProperties = Object.fromEntries(
      speciesGeneKeys(species).map((key) => [key, stringSchema()])
    );
    return objectSchema({
      genomes: arraySchema(objectSchema({
        workingName: stringSchema(),
        opportunityStatement: stringSchema(),
        pressureIds: arraySchema(stringSchema(), 2, 6),
        nicheId: stringSchema(),
        recipeId: stringSchema(),
        cognitiveMode: enumSchema(COGNITIVE_MODES),
        mutationOperators: arraySchema(enumSchema([
          "value", "insertion", "deletion", "duplication", "transposition",
          "crossover", "inversion", "environmental", "rearrangement", "repair",
        ]), 1, 5),
        parentIdeaIds: arraySchema(stringSchema(), 0, 6),
        lineageRationale: stringSchema(),
        causalMechanism: stringSchema(),
        operatorIndependence: stringSchema(),
        firebaseArchitecture: stringSchema(),
        constraintProof: stringSchema(),
        genes: objectSchema(geneProperties),
      }), count, count),
    });
  }

  function predatorArenaSchema(count) {
    const fitnessProperties = Object.fromEntries(
      FITNESS_KEYS.map((key) => [key, numberSchema(0, 100)])
    );
    const predatorProperties = Object.fromEntries(
      PREDATOR_ROLES.map((role) => [role, numberSchema(0, 100)])
    );
    return objectSchema({
      evaluations: arraySchema(objectSchema({
        candidateId: stringSchema(),
        phenotype: objectSchema({
          name: stringSchema(),
          oneLiner: stringSchema(),
          customerOrPlayer: stringSchema(),
          problemOrFantasy: stringSchema(),
          productConcept: stringSchema(),
          workflow: arraySchema(stringSchema(), 3, 8),
          monetization: stringSchema(),
          distribution: stringSchema(),
          moat: stringSchema(),
          firstUsers: stringSchema(),
          risks: arraySchema(stringSchema(), 2, 6),
          whyNow: stringSchema(),
          pressureConvergence: arraySchema(stringSchema(), 2, 6),
          firebaseArchitecture: arraySchema(stringSchema(), 3, 8),
        }),
        survivalProfile: objectSchema(fitnessProperties),
        predatorScores: objectSchema(predatorProperties),
        fatalPredators: arraySchema(enumSchema(PREDATOR_ROLES), 0, 10),
        topAttacks: arraySchema(objectSchema({
          predator: enumSchema(PREDATOR_ROLES),
          predatorVariantId: stringSchema(),
          question: stringSchema(),
          attack: stringSchema(),
          evidence: stringSchema(),
          repair: stringSchema(),
        }), 2, 4),
        repair: objectSchema({
          applied: booleanSchema(),
          reason: stringSchema(),
          genomeChanges: arraySchema(stringSchema(), 0, 8),
          repairedConcept: stringSchema(),
        }),
        fingerprint: objectSchema({
          customer: stringSchema(),
          problem: stringSchema(),
          workflow: stringSchema(),
          economic: stringSchema(),
          mechanism: stringSchema(),
          lineage: stringSchema(),
        }),
        niche: objectSchema({
          cellKey: stringSchema(),
          axisA: stringSchema(),
          axisB: stringSchema(),
          axisC: stringSchema(),
          habitat: stringSchema(),
        }),
        deploymentFit: objectSchema({
          firebaseOnly: booleanSchema(),
          operatorIndependent: booleanSchema(),
          externalServices: arraySchema(stringSchema(), 0, 10),
          manualSteps: arraySchema(stringSchema(), 0, 10),
          explanation: stringSchema(),
        }),
        coherence: numberSchema(0, 100),
        fatality: numberSchema(0, 100),
      }), count, count),
    });
  }

  function autonomyCheckSchema(count) {
    return objectSchema({
      auditThesis: stringSchema(),
      decisions: arraySchema(objectSchema({
        candidateId: stringSchema(),
        verdict: enumSchema(["independent", "forbidden"]),
        dependencyKinds: arraySchema(enumSchema(AUTONOMY_DEPENDENCY_KINDS), 0, 9),
        implicatedSystems: arraySchema(stringSchema(), 0, 10),
        explicit: booleanSchema(),
        downstreamHumanIntervention: booleanSchema(),
        evidence: stringSchema(),
        reason: stringSchema(),
      }), count, count),
    });
  }

  function evolutionProposalSchema() {
    const mutationProbabilityProperties = Object.fromEntries(
      ["value", "insertion", "deletion", "duplication", "transposition", "crossover",
        "inversion", "environmental", "rearrangement", "repair"]
        .map((key) => [key, numberSchema(0, 1)])
    );
    const cognitiveProperties = Object.fromEntries(
      COGNITIVE_MODES.map((key) => [key, numberSchema(0, 1)])
    );
    const fitnessProperties = Object.fromEntries(
      FITNESS_KEYS.map((key) => [key, numberSchema(0, 1)])
    );
    return objectSchema({
      diagnosis: stringSchema(),
      flowMutation: objectSchema({
        changedFields: arraySchema(stringSchema(), 1, 20),
        candidateCount: numberSchema(200, 500),
        mutationProbabilities: objectSchema(mutationProbabilityProperties),
        cognitiveModeWeights: objectSchema(cognitiveProperties),
        fitnessWeights: objectSchema(fitnessProperties),
        parentSelection: objectSchema({
          livingElites: numberSchema(0, 1),
          underexploredCells: numberSchema(0, 1),
          repairedFailures: numberSchema(0, 1),
          marketPressures: numberSchema(0, 1),
          distantDomains: numberSchema(0, 1),
          crossSpecies: numberSchema(0, 1),
        }),
        evaluatorOrder: arraySchema(enumSchema(PREDATOR_ROLES), 10, 10),
        minimumSurvivalScore: numberSchema(40, 78),
        noveltySimilarityThreshold: numberSchema(0.55, 0.95),
        nicheExplorationRate: numberSchema(0.1, 0.9),
        riskBudget: numberSchema(0.1, 0.85),
        noveltyBudget: numberSchema(0.2, 0.9),
        repairBudget: numberSchema(0.05, 0.6),
        marketQuestionAdditions: arraySchema(stringSchema(), 1, 4),
      }),
      recipeOffspring: arraySchema(objectSchema({
        id: stringSchema(),
        name: stringSchema(),
        thesis: stringSchema(),
        preferredOperators: arraySchema(stringSchema(), 1, 8),
        parentRecipeIds: arraySchema(stringSchema(), 1, 4),
        mutationRationale: stringSchema(),
      }), 0, 3),
      predatorMutations: arraySchema(objectSchema({
        parentPredatorId: enumSchema(PREDATOR_ROLES),
        question: stringSchema(),
        targetsFailurePattern: stringSchema(),
        mutationRationale: stringSchema(),
      }), 0, 4),
    });
  }

  function shadowTournamentSchema() {
    const profile = objectSchema({
      survivalPrediction: numberSchema(0, 100),
      deathPrediction: numberSchema(0, 100),
      diversity: numberSchema(0, 100),
      globalUniqueness: numberSchema(0, 100),
      coherence: numberSchema(0, 100),
      marketTiming: numberSchema(0, 100),
      computationalCost: numberSchema(0, 100),
      falsePositiveRate: numberSchema(0, 100),
      nicheCoverage: numberSchema(0, 100),
    });
    return objectSchema({
      incumbent: profile,
      challenger: profile,
      verdict: enumSchema(["promote", "hold", "reject"]),
      confidence: numberSchema(0, 1),
      rationale: stringSchema(),
      evidence: arraySchema(stringSchema(), 2, 12),
      safeguards: arraySchema(stringSchema(), 1, 8),
    });
  }

  function objectSchema(properties) {
    return {
      type: "object",
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    };
  }

  function arraySchema(items, minItems = 0, maxItems = 100) {
    return { type: "array", items, minItems, maxItems };
  }

  function stringSchema() {
    return { type: "string" };
  }

  function numberSchema(minimum = 0, maximum = 100) {
    return { type: "number", minimum, maximum };
  }

  function booleanSchema() {
    return { type: "boolean" };
  }

  function enumSchema(values) {
    return { type: "string", enum: values };
  }

  function compactWeatherForPrompt(weather) {
    return {
      id: weather?.id || "",
      asOfDate: cleanText(weather?.asOfDate, 80),
      thesis: cleanText(weather?.thesis, 1200),
      changedSincePrevious: stringArray(weather?.changedSincePrevious, 12, 500),
      pressures: (Array.isArray(weather?.pressures) ? weather.pressures : []).slice(0, 12).map((pressure) => ({
        id: pressure?.id || "",
        changeType: pressure?.changeType || "",
        signal: cleanText(pressure?.signal, 600),
        previousDelta: cleanText(pressure?.previousDelta, 500),
        affectedGroups: stringArray(pressure?.affectedGroups, 6, 240),
        convergencePartners: stringArray(pressure?.convergencePartners, 5, 400),
        confidence: Number(pressure?.confidence || 0),
        evidenceBasis: cleanText(pressure?.evidenceBasis, 40),
        evidenceSources: (Array.isArray(pressure?.evidenceSources)
          ? pressure.evidenceSources
          : []).slice(0, 5).map((source) => ({
            title: cleanText(source?.title, 300),
            url: cleanText(source?.url, 1200),
            publishedAt: cleanText(source?.publishedAt, 80),
            supportedClaim: cleanText(source?.supportedClaim, 600),
          })),
        firebaseFit: cleanText(pressure?.firebaseFit, 500),
      })),
      overcrowdedCategories: stringArray(weather?.overcrowdedCategories, 10, 240),
      underservedGroups: stringArray(weather?.underservedGroups, 12, 240),
    };
  }

  function compactAncestryForPrompt(ancestry) {
    return {
      ancestryThesis: cleanText(ancestry?.ancestryThesis, 1400),
      survivorGenes: (ancestry?.survivorGenes || []).slice(0, 12),
      recurrentDeathPatterns: (ancestry?.recurrentDeathPatterns || []).slice(0, 12),
      recipeAssessment: (ancestry?.recipeAssessment || []).slice(0, 16),
      predatorBlindSpots: (ancestry?.predatorBlindSpots || []).slice(0, 12),
      underexploredRegions: (ancestry?.underexploredRegions || []).slice(0, 18),
      repairTargets: (ancestry?.repairTargets || []).slice(0, 12),
      calibrationWarnings: stringArray(ancestry?.calibrationWarnings, 10, 500),
    };
  }

  function compactIdeaForPrompt(value) {
    const idea = value && typeof value === "object" ? value : {};
    return {
      id: idea.id || idea.ideaId || "",
      species: idea.species || "",
      status: idea.status || "",
      statusSource: idea.statusSource || "",
      validationStage: idea.validationStage || "",
      name: cleanText(idea.name || idea.phenotype?.name, 160),
      oneLiner: cleanText(idea.oneLiner || idea.phenotype?.oneLiner, 500),
      customerOrPlayer: cleanText(idea.phenotype?.customerOrPlayer, 500),
      problemOrFantasy: cleanText(idea.phenotype?.problemOrFantasy, 600),
      mechanism: cleanText(idea.fingerprint?.mechanism, 600),
      nicheCell: idea.nicheCell || idea.niche?.cellKey || "",
      finalFitness: Number(idea.finalFitness || 0),
      lineage: cleanValue(idea.lineage || {}),
      outcome: cleanValue(idea.outcome || {}),
    };
  }

  function compactDeathForPrompt(value) {
    const item = value && typeof value === "object" ? value : {};
    const death = item.deathCertificate || item;
    return {
      id: item.id || item.candidateId || "",
      species: item.species || "",
      workingName: cleanText(item.workingName || item.name, 160),
      killReason: death.killReason || "",
      explanation: cleanText(death.explanation, 800),
      validationStage: death.validationStage || "",
      evidenceStrength: death.evidenceStrength || "",
      genome: compactGenome(item.genome),
      fingerprint: normalizeFingerprint(item.fingerprint || {}),
      lineage: cleanValue(item.lineage || {}),
    };
  }

  function compactGenome(value) {
    const genome = value && typeof value === "object" ? value : {};
    return {
      workingName: cleanText(genome.workingName, 160),
      opportunityStatement: cleanText(genome.opportunityStatement, 600),
      recipeId: genome.recipeId || "",
      cognitiveMode: genome.cognitiveMode || "",
      mutationOperators: stringArray(genome.mutationOperators, 8),
      nicheId: genome.nicheId || "",
      causalMechanism: cleanText(genome.causalMechanism, 700),
      genes: cleanValue(genome.genes || {}),
    };
  }

  function compactCandidateForAutonomyCheck(candidate) {
    const genome = candidate?.genome || {};
    const phenotype = candidate?.phenotype || {};
    return {
      candidateId: candidate?.id || "",
      species: candidate?.species || "",
      genome: {
        workingName: cleanText(genome.workingName, 160),
        opportunityStatement: cleanText(genome.opportunityStatement, 800),
        causalMechanism: cleanText(genome.causalMechanism, 900),
        operatorIndependence: cleanText(genome.operatorIndependence, 700),
        firebaseArchitecture: cleanText(genome.firebaseArchitecture, 900),
        constraintProof: cleanText(genome.constraintProof, 900),
        genes: cleanValue(genome.genes || {}),
      },
      phenotype: {
        name: cleanText(phenotype.name, 160),
        oneLiner: cleanText(phenotype.oneLiner, 500),
        customerOrPlayer: cleanText(phenotype.customerOrPlayer, 700),
        problemOrFantasy: cleanText(phenotype.problemOrFantasy, 900),
        productConcept: cleanText(phenotype.productConcept, 1800),
        workflow: stringArray(phenotype.workflow, 8, 600),
        monetization: cleanText(phenotype.monetization, 700),
        distribution: cleanText(phenotype.distribution, 800),
        firstUsers: cleanText(phenotype.firstUsers, 700),
        risks: stringArray(phenotype.risks, 6, 600),
        firebaseArchitecture: stringArray(phenotype.firebaseArchitecture, 8, 600),
      },
      deploymentFit: cleanValue(candidate?.deploymentFit || {}),
      repair: cleanValue(candidate?.repair || {}),
    };
  }

  function compactFingerprintForPrompt(value) {
    return {
      id: value?.id || value?.ideaId || "",
      species: value?.species || "",
      fingerprint: normalizeFingerprint(value?.fingerprint || value || {}),
    };
  }

  function compactRecipeForPrompt(value) {
    const generated = Number(value?.candidatesGenerated || 0);
    const survivors = Number(value?.survivors || 0);
    return {
      id: value?.id || "",
      name: value?.name || "",
      thesis: cleanText(value?.thesis, 600),
      preferredOperators: stringArray(value?.preferredOperators, 8),
      status: value?.status || "",
      influence: Number(value?.influence || 0),
      trials: Number(value?.trials || 0),
      candidatesGenerated: generated,
      survivors,
      historicalYield: survivors / Math.max(1, generated),
      downstreamSurvivors: Number(value?.downstreamSurvivors || 0),
      downstreamDeaths: Number(value?.downstreamDeaths || 0),
    };
  }

  function compactPredatorForPrompt(value) {
    return {
      id: value?.id || "",
      question: cleanText(value?.question, 600),
      calibrationWeight: Number(value?.calibrationWeight || 1),
      attacks: Number(value?.attacks || 0),
      fatalFindings: Number(value?.fatalFindings || 0),
      downstreamMisses: Number(value?.downstreamMisses || 0),
      downstreamFalsePositives: Number(value?.downstreamFalsePositives || 0),
      challengerQuestion: cleanText(value?.challengerQuestion, 600),
      variants: (Array.isArray(value?.variants) ? value.variants : []).slice(0, 4).map((variant) => ({
        id: variant?.id || "",
        question: cleanText(variant?.question, 600),
        targetsFailurePattern: cleanText(variant?.targetsFailurePattern, 500),
        status: variant?.status || "",
      })),
    };
  }

  function compactMuseumForPrompt(value) {
    return {
      id: value?.id || "",
      species: value?.species || "",
      nicheCell: value?.nicheCell || "",
      workingName: cleanText(value?.workingName, 160),
      finalFitness: Number(value?.finalFitness || 0),
      fingerprint: normalizeFingerprint(value?.fingerprint || {}),
    };
  }

  function compactTournamentForPrompt(value) {
    return {
      id: value?.id || "",
      labeledIdeaCount: Number(value?.labeledIdeaCount || 0),
      incumbent: value?.incumbent || {},
      challenger: value?.challenger || {},
      verdict: value?.verdict || "",
      promotion: value?.promotion || {},
    };
  }

  function hasDownstreamOutcome(idea) {
    if (!idea || typeof idea !== "object") return false;
    if (Number(idea.outcomeRecordedAtMs || 0) > 0) return true;
    if (["user", "customer", "validation"].includes(String(idea.statusSource || "").toLowerCase())) return true;
    return ["interviewed", "validated", "launched", "traction", "killed_by_user"]
      .includes(String(idea.validationStage || "").toLowerCase());
  }

  function speciesSelectionSummary(selected) {
    const counts = countBy(selected, (item) => item.species);
    return `${counts.saas || 0} SaaS, ${counts.game || 0} games, and ${counts.agent || 0} AI agents`;
  }

  function speciesLabel(species) {
    if (species === "saas") return "Customer Problem SaaS";
    if (species === "game") return "Game";
    return "AI Agent";
  }

  function expandDottedFields(value) {
    const result = {};
    Object.entries(value || {}).forEach(([key, item]) => {
      if (!key.includes(".")) {
        result[key] = item;
        return;
      }
      const parts = key.split(".");
      let cursor = result;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) cursor[part] = item;
        else {
          cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
          cursor = cursor[part];
        }
      });
    });
    return result;
  }

  function readPath(value, path) {
    return String(path || "").split(".").reduce((current, key) => current?.[key], value);
  }

  function normalizeWeights(value) {
    const entries = Object.entries(value || {}).map(([key, weight]) => [
      key,
      Math.max(0, Number(weight || 0)),
    ]);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    if (!entries.length) return {};
    if (!total) {
      const equal = 1 / entries.length;
      return Object.fromEntries(entries.map(([key]) => [key, round4(equal)]));
    }
    return Object.fromEntries(entries.map(([key, weight]) => [key, round4(weight / total)]));
  }

  function cleanValue(value, depth = 0) {
    if (depth > 14) return cleanText(JSON.stringify(value), 2000);
    if (value === null || value === undefined) return value === undefined ? null : null;
    if (["string", "number", "boolean"].includes(typeof value)) {
      if (typeof value === "string") return cleanText(value, 12000);
      if (typeof value === "number") return Number.isFinite(value) ? value : 0;
      return value;
    }
    if (Array.isArray(value)) return value.slice(0, 500).map((item) => cleanValue(item, depth + 1));
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .slice(0, 300)
          .map(([key, item]) => [safeObjectKey(key), cleanValue(item, depth + 1)])
      );
    }
    return String(value);
  }

  function safeObjectKey(value) {
    return String(value || "field").replace(/[~*/\[\]]/g, "_").slice(0, 180) || "field";
  }

  function cleanText(value, maxLength = 4000) {
    return String(value || "").replace(/\u0000/g, "").trim().slice(0, maxLength);
  }

  function stringArray(value, maxItems = 40, maxLength = 1200) {
    return (Array.isArray(value) ? value : [])
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  function uniqueStrings(value) {
    return Array.from(new Set((Array.isArray(value) ? value : []).map((item) => cleanText(item, 1200)).filter(Boolean)));
  }

  function safeId(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 180);
  }

  function normalizeOwnerEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    if (!email || email.includes("/") || !email.includes("@")) return "";
    return email.slice(0, 320);
  }

  function safeStage(value) {
    const stage = safeId(value);
    return STAGE_ORDER.includes(stage) ? stage : "";
  }

  function normalizeSpecies(value) {
    const species = safeId(value);
    return SPECIES.includes(species) ? species : "";
  }

  function shortHash(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 10);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function clampInteger(value, min, max, fallback) {
    return Math.round(clampNumber(value, min, max, fallback));
  }

  function average(values) {
    const numbers = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    return numbers.length ? round2(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : 0;
  }

  function round2(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function round4(value) {
    return Math.round(Number(value || 0) * 10000) / 10000;
  }

  function countBy(items, keyFn) {
    return (Array.isArray(items) ? items : []).reduce((counts, item) => {
      const key = String(keyFn(item) || "unknown");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function uniqueById(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter((item) => {
      const id = item?.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function httpError(message, statusCode = 500, code = "labor_error", details = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
  }

  return {
    startLabor,
    runLaborEvolution,
    __test: {
      defaultFlowGenome,
      normalizeFlowGenome,
      structuralSimilarity,
      weightedFitness,
      validateMarketWeatherSearchEvidence,
      validateAutonomyAudit,
      feasibilityFailure,
      selectGeneration,
      decideFlowPromotion,
      normalizeWeights,
    },
  };
}

module.exports = {
  createLaborEvolutionEngine,
};
