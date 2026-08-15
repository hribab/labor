"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLaborEvolutionEngine } = require("./laborEvolution");

const engine = createLaborEvolutionEngine({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => null,
        increment: (value) => value,
      },
    },
  },
  db: {},
  logger: { error() {} },
  getFunctions: {},
  region: "us-central1",
  rootCollection: "testkitchen",
  authenticateRequest: async () => ({ email: "owner@example.com" }),
  handleCors: () => false,
  getHttpStatus: () => 500,
  getErrorMessage: (error) => error.message,
  loadConfiguredLlm: async () => ({}),
  callStructuredLlm: async () => ({}),
  serializeLlmProvider: () => ({}),
});

const {
  defaultFlowGenome,
  normalizeWeights,
  structuralSimilarity,
  weightedFitness,
  validateMarketWeatherSearchEvidence,
  validateAutonomyAudit,
  feasibilityFailure,
  selectGeneration,
  decideFlowPromotion,
} = engine.__test;

test("five-layer structural fingerprints compare causal skeletons", () => {
  const original = {
    customer: "independent clinic administrator",
    problem: "repetitive regulated documentation after each patient visit",
    workflow: "turn visit notes into an approval-ready compliance record",
    economic: "clinic owner pays from administration budget",
    mechanism: "persistent templates learn exceptions and produce evidence-linked drafts",
    lineage: "friction hunter plus regulation surfer",
  };
  const paraphrase = {
    customer: "administrators at small independent clinics",
    problem: "regulated documents repeated following patient visits",
    workflow: "visit notes become compliance records ready for approval",
    economic: "the clinic owner uses an administrative budget",
    mechanism: "evidence linked drafts use persistent exception-learning templates",
    lineage: "regulation surfer crossed with friction hunter",
  };
  const unrelated = {
    customer: "cooperative puzzle game players",
    problem: "teams want surprising short replay sessions",
    workflow: "players combine procedural rules to unlock a shared map",
    economic: "players buy themed expansion packs",
    mechanism: "a seeded world mutates based on group failure patterns",
    lineage: "behavior watcher and accidental discovery",
  };

  assert.ok(structuralSimilarity(original, paraphrase) > 0.55);
  assert.ok(structuralSimilarity(original, unrelated) < 0.25);
});

test("fitness remains a survival profile rather than one model score", () => {
  const weights = normalizeWeights({
    problem: 2,
    timing: 1,
    distribution: 1,
    economic: 1,
    mechanism: 1,
    defensibility: 1,
    novelty: 1,
    execution: 1,
    survivalCalibration: 1,
  });
  const profile = Object.fromEntries(Object.keys(weights).map((key) => [key, 80]));
  profile.problem = 100;
  assert.equal(weightedFitness(profile, weights), 84);
});

test("Market Weather rejects claims that are not grounded in retrieved web sources", () => {
  const weather = {
    asOfDate: new Date().toISOString(),
    pressures: [{
      id: "pressure_current_cost_shift",
      evidenceSources: [{
        url: "https://example.com/research/current-cost-shift?utm_source=feed",
      }],
    }],
  };
  const search = {
    sources: [{ url: "https://example.com/research/current-cost-shift" }],
  };

  assert.equal(validateMarketWeatherSearchEvidence(weather, search), true);
  assert.throws(
    () => validateMarketWeatherSearchEvidence(weather, {
      sources: [{ url: "https://different.example/report" }],
    }),
    /without retrieved web evidence/
  );
});

test("the Firebase-only envelope is a hard selection gate", () => {
  const valid = {
    autonomyCheck: {
      checkId: "v1_autonomy_check",
      policyVersion: 1,
      verdict: "independent",
      dependencyKinds: [],
      implicatedSystems: [],
      explicit: false,
      downstreamHumanIntervention: false,
    },
    deploymentFit: {
      firebaseOnly: true,
      operatorIndependent: true,
      externalServices: [],
      manualSteps: [],
    },
    genome: {
      firebaseArchitecture: "Firebase Hosting, Firestore, Storage, and LLM calls",
      operatorIndependence: "No operator is required",
    },
    phenotype: { productConcept: "A self-serve workspace" },
  };
  assert.equal(feasibilityFailure(valid), "");
  assert.match(
    feasibilityFailure({
      ...valid,
      deploymentFit: {
        ...valid.deploymentFit,
        externalServices: ["external communications platform"],
      },
    }),
    /Forbidden external services/
  );
  assert.match(
    feasibilityFailure({
      ...valid,
      autonomyCheck: {
        ...valid.autonomyCheck,
        verdict: "forbidden",
        dependencyKinds: ["third_party_ecosystem"],
        reason: "The complete workflow exists inside an outside product ecosystem.",
      },
    }),
    /outside product ecosystem/
  );
});

test("v1_autonomy_check requires one grouped decision for every candidate", () => {
  const candidates = [{ id: "candidate_a" }, { id: "candidate_b" }];
  const audit = validateAutonomyAudit({
    auditThesis: "One organism closes its loop; one depends on a human reviewer.",
    decisions: [
      {
        candidateId: "candidate_a",
        verdict: "independent",
        dependencyKinds: [],
        implicatedSystems: [],
        explicit: false,
        downstreamHumanIntervention: false,
        evidence: "The workflow uses only user input, Firebase, and an LLM.",
        reason: "Its complete value loop is self-contained.",
      },
      {
        candidateId: "candidate_b",
        verdict: "forbidden",
        dependencyKinds: ["human_approval_or_review"],
        implicatedSystems: [],
        explicit: false,
        downstreamHumanIntervention: true,
        evidence: "A specialist must approve every generated result.",
        reason: "The promised outcome cannot complete autonomously.",
      },
    ],
  }, candidates);

  assert.equal(audit.allowedCount, 1);
  assert.equal(audit.forbiddenCount, 1);
  assert.deepEqual(audit.reviewedCandidateIds, ["candidate_a", "candidate_b"]);
  assert.throws(
    () => validateAutonomyAudit({
      auditThesis: "Incomplete",
      decisions: [
        {
          candidateId: "candidate_a",
          verdict: "independent",
          dependencyKinds: [],
          implicatedSystems: [],
          explicit: false,
          downstreamHumanIntervention: false,
          evidence: "",
          reason: "",
        },
      ],
    }, candidates),
    /1 decisions for 2 candidates/
  );
});

test("MAP-Elites keeps four SaaS, three game, and three agent survivors", () => {
  const candidates = [];
  const tokens = [
    "amber", "birch", "cobalt", "delta", "ember", "fjord", "garnet",
    "harbor", "indigo", "juniper", "kepler", "lumen", "marble", "nectar",
  ];
  ["saas", "game", "agent"].forEach((species) => {
    for (let index = 0; index < 14; index += 1) {
      const unique = `${species}_${index}`;
      const token = tokens[index];
      candidates.push({
        id: unique,
        generationId: "generation_test",
        species,
        status: "evaluated",
        genome: {
          workingName: `Organism ${unique}`,
          nicheId: `niche_${unique}`,
          recipeId: `recipe_${index % 7}`,
        },
        lineage: {
          recipeId: `recipe_${index % 7}`,
          cognitiveMode: `mode_${index % 10}`,
          parentIdeaIds: [`parent_${index}`],
        },
        phenotype: { name: `Idea ${unique}`, productConcept: `Concept ${unique}` },
        fingerprint: {
          customer: `${species} customer ${token}`,
          problem: `${species} problem ${token}`,
          workflow: `${species} workflow ${token}`,
          economic: `${species} economics ${token}`,
          mechanism: `${species} mechanism ${token}`,
          lineage: `${species} lineage ${token}`,
        },
        niche: { cellKey: `cell_${unique}` },
        deploymentFit: {
          firebaseOnly: true,
          operatorIndependent: true,
          externalServices: [],
          manualSteps: [],
        },
        autonomyCheck: {
          checkId: "v1_autonomy_check",
          policyVersion: 1,
          verdict: "independent",
          dependencyKinds: [],
          implicatedSystems: [],
          explicit: false,
          downstreamHumanIntervention: false,
        },
        survivalProfile: {
          problem: 78,
          timing: 77,
          distribution: 76,
          economic: 75,
          mechanism: 82,
          defensibility: 71,
          novelty: 88,
          execution: 84,
          survivalCalibration: 70,
        },
        predatorScores: {},
        fatalPredators: [],
        fatality: 10,
        coherence: 85,
      });
    }
  });
  const flow = { ...defaultFlowGenome(), noveltySimilarityThreshold: 0.95 };
  const result = selectGeneration({ candidates, priorFingerprints: [], flow });
  assert.deepEqual(
    Object.fromEntries(["saas", "game", "agent"].map((species) => [
      species,
      result.selected.filter((item) => item.species === species).length,
    ])),
    { saas: 4, game: 3, agent: 3 }
  );
});

test("a challenger cannot self-promote without downstream evidence", () => {
  const incumbent = defaultFlowGenome();
  const challenger = { ...incumbent, id: "flow_0002", version: 2 };
  const strong = {
    survivalPrediction: 95,
    deathPrediction: 95,
    diversity: 95,
    globalUniqueness: 95,
    coherence: 95,
    marketTiming: 95,
    computationalCost: 20,
    falsePositiveRate: 10,
    nicheCoverage: 95,
  };
  const weak = { ...strong, survivalPrediction: 70, diversity: 70, nicheCoverage: 70 };
  const held = decideFlowPromotion({
    incumbent,
    challenger,
    tournament: { incumbent: weak, challenger: strong, verdict: "promote", confidence: 0.95 },
    labeledIdeaCount: 0,
  });
  assert.equal(held.promoted, false);
  assert.equal(held.status, "shadow");
});
