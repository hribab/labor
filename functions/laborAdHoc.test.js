"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLaborAdHocGenerator } = require("./laborAdHoc");

const generator = createLaborAdHocGenerator({
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: () => null,
      },
    },
  },
  db: {},
  logger: { error() {} },
  rootCollection: "testkitchen",
  authenticateRequest: async () => ({ email: "owner@example.com" }),
  handleCors: () => false,
  getHttpStatus: () => 500,
  getErrorMessage: (error) => error.message,
  loadConfiguredLlm: async () => ({ provider: "openai", modelId: "gpt-6-astra" }),
  callStructuredLlm: async () => ({}),
  serializeLlmProvider: (value) => value,
});

const {
  createEntropy,
  generateGenomePopulation,
  ideaGenerationSystemInstruction,
  ideaGenerationPrompt,
  ideaPopulationSchema,
  normalizeIdeaPopulation,
} = generator.__test;

test("cryptographic sampling creates the configured unique population", () => {
  const population = generateGenomePopulation({
    customInstructionsPresent: true,
    createdAtMs: Date.UTC(2026, 7, 5),
    entropy: createEntropy(),
  });
  const groups = [
    ["saas", population.saasGenomes, 4],
    ["game", population.gameGenomes, 3],
    ["agent", population.agentGenomes, 3],
  ];
  const allIds = new Set();

  groups.forEach(([species, genomes, expectedCount]) => {
    assert.equal(genomes.length, expectedCount);
    assert.equal(
      new Set(genomes.map((item) => item.combinationSignature)).size,
      expectedCount
    );
    genomes.forEach((genome, index) => {
      assert.equal(genome.species, species);
      assert.equal(genome.speciesRank, index + 1);
      assert.equal(genome.customInstructionsPresent, true);
      assert.equal(genome.samplingRules.selectionMethod, "cryptographic_random");
      assert.ok(genome.dimensions.hardConstraints.length >= 6);
      allIds.add(genome.genomeId);
    });
  });

  assert.equal(allIds.size, 10);
});

test("one-call prompt makes custom instructions prominent without weakening autonomy", () => {
  const instructions = "Focus every idea on solo accountants working with uploaded PDFs.";
  const prompt = ideaGenerationPrompt({
    genomes: generateGenomePopulation(),
    customInstructions: instructions,
    previousIdeas: [],
    entropy: createEntropy(),
  });
  const system = ideaGenerationSystemInstruction();

  assert.ok(prompt.includes(instructions));
  assert.match(system, /highest-priority creative direction/);
  assert.match(system, /zero third-party accounts/);
  assert.match(system, /SaaS ideas must be small, focused/);
  assert.match(system, /famous-game mechanic/);
  assert.match(system, /automate one or more complete workflows/);
});

test("structured output requires and normalizes exactly ten genome-linked ideas", () => {
  const genomes = generateGenomePopulation();
  const makeIdea = (genome) => ({
    genomeId: genome.genomeId,
    name: `Idea ${genome.speciesRank}`,
    oneLiner: "A focused generated concept.",
    customerOrPlayer: "A specific user",
    problemOrDesire: "A specific recurring need",
    productConcept: "A complete product concept",
    workflow: ["Input", "Process", "Result"],
    minimumViableProduct: ["Workspace", "Memory", "Output"],
    firebaseArchitecture: ["Hosting", "Firestore", "Storage", "LLM calls"],
    monetization: "Subscription",
    distribution: "Shareable outputs",
    whyDifferent: "Persistent structured state",
    whyNow: "Capable long-context models",
    autonomyProof: "The workflow closes without another human or service.",
    fingerprint: {
      customer: "specific user",
      problem: "specific need",
      workflow: "input process result",
      economic: "subscription",
      mechanism: `mechanism ${genome.genomeId}`,
    },
    deploymentFit: {
      firebaseOnly: true,
      operatorIndependent: true,
      externalDependencies: [],
      manualOperations: [],
      explanation: "The complete loop uses the allowed stack.",
    },
  });
  const raw = {
    saasIdeas: genomes.saasGenomes.map(makeIdea),
    gameIdeas: genomes.gameGenomes.map(makeIdea),
    agentIdeas: genomes.agentGenomes.map(makeIdea),
  };
  const ideas = normalizeIdeaPopulation(raw, genomes, {
    generationId: "adhoc_test",
    generationNumber: 2,
    customInstructionsPresent: false,
    model: { provider: "openai", modelId: "gpt-6-astra" },
    createdAtMs: 1,
  });

  assert.equal(ideas.length, 10);
  assert.deepEqual(
    Object.fromEntries(["saas", "game", "agent"].map((species) => [
      species,
      ideas.filter((idea) => idea.species === species).length,
    ])),
    { saas: 4, game: 3, agent: 3 }
  );
  assert.ok(ideas.every((idea) => idea.mode === "ad_hoc"));
  assert.throws(
    () => normalizeIdeaPopulation({ ...raw, gameIdeas: raw.gameIdeas.slice(1) }, genomes),
    /exactly 3 game ideas/
  );
});

test("response schema fixes the 4-3-3 species population", () => {
  const schema = ideaPopulationSchema();
  Object.entries({ saasIdeas: 4, gameIdeas: 3, agentIdeas: 3 }).forEach(
    ([key, expectedCount]) => {
    assert.equal(schema.properties[key].minItems, expectedCount);
    assert.equal(schema.properties[key].maxItems, expectedCount);
  });
});
