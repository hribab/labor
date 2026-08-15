import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  ChevronRight,
  CircleDot,
  Cloud,
  CloudSun,
  Code2,
  Database,
  Dna,
  ExternalLink,
  Gamepad2,
  GitFork,
  Loader2,
  Network,
  PanelsTopLeft,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";

import { callStartAutonomousAgent, callStartLabor } from "../lib/agent";
import {
  db,
  isFirebasePermissionError,
  repairCustomerDataPlaneSession,
  userFacingFirebaseError,
} from "../lib/firebase";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "../lib/laborBrand";
import LaborReferenceMenu from "../components/LaborReferenceMenu";

const SPECIES = [
  { id: "saas", label: "SaaS", plural: "SaaS ideas", icon: PanelsTopLeft },
  { id: "game", label: "Games", plural: "game ideas", icon: Gamepad2 },
  { id: "agent", label: "AI Agents", plural: "AI-agent ideas", icon: Bot },
];
const EVOLUTION_STAGES = [
  { id: "observe", label: "Observe", icon: CloudSun },
  { id: "breed", label: "Breed", icon: GitFork },
  { id: "attack", label: "Attack", icon: ShieldCheck },
  { id: "select", label: "Select", icon: Trophy },
  { id: "remember", label: "Remember", icon: Database },
  { id: "evolve", label: "Evolve", icon: BrainCircuit },
];
const STAGE_RANK = {
  observe: 0,
  remember: 1,
  map_niches: 1,
  breed: 2,
  dispatch_attacks: 2,
  attack: 3,
  autonomy_check: 3,
  select: 4,
  evolve: 5,
  shadow_tournament: 5,
  completed: 6,
};
const RUNNING_STATUSES = new Set(["queued", "running", "retrying"]);

function LaborIdeasPage({
  userDocId,
  experience = "evolver",
  onOpenReleases,
  onOpenSettings,
}) {
  const selfEvolving = experience === "evolver";
  const [control, setControl] = useState(null);
  const [generation, setGeneration] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [requestedGenerationId, setRequestedGenerationId] = useState("");
  const [activeSpecies, setActiveSpecies] = useState("saas");
  const [expandedIdeaId, setExpandedIdeaId] = useState("");
  const [adHocControl, setAdHocControl] = useState(null);
  const [adHocGeneration, setAdHocGeneration] = useState(null);
  const [adHocIdeas, setAdHocIdeas] = useState([]);
  const [adHocLoading, setAdHocLoading] = useState(false);
  const [adHocStarting, setAdHocStarting] = useState(false);
  const [adHocError, setAdHocError] = useState("");
  const [adHocRequestedGenerationId, setAdHocRequestedGenerationId] = useState("");
  const [customInstructionsOpen, setCustomInstructionsOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [agentConfirmationOpen, setAgentConfirmationOpen] = useState(false);
  const [evolverConfirmationOpen, setEvolverConfirmationOpen] = useState(false);
  const [restoringAccess, setRestoringAccess] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [evolverAccessError, setEvolverAccessError] = useState(false);
  const [agentAccessError, setAgentAccessError] = useState(false);
  const [accessSessionVersion, setAccessSessionVersion] = useState(0);
  const customInstructionsRef = useRef(null);
  const accessRepairRef = useRef(null);

  function reportSnapshotError(snapshotError, target = "evolver") {
    const message = userFacingFirebaseError(snapshotError);
    const accessError = isFirebasePermissionError(snapshotError);
    if (target === "agent") {
      setAdHocError(message);
      setAgentAccessError(accessError);
    } else {
      setError(message);
      setEvolverAccessError(accessError);
    }
    if (accessError) void restoreAccess();
  }

  async function restoreAccess() {
    if (!userDocId) return;
    if (accessRepairRef.current) return accessRepairRef.current;

    const repair = (async () => {
      setRestoringAccess(true);
      try {
        await repairCustomerDataPlaneSession({
          email: userDocId,
          userDocId,
        });
        setAccessSessionVersion(Date.now());
        setReconnectRequired(false);
        setError("");
        setAdHocError("");
        setEvolverAccessError(false);
        setAgentAccessError(false);
      } catch {
        const message =
          "Labor could not renew access automatically. Reconnect Google Cloud in Settings. Your existing apps, data, and releases will be kept.";
        setReconnectRequired(true);
        if (selfEvolving) setError(message);
        else setAdHocError(message);
      } finally {
        setRestoringAccess(false);
        accessRepairRef.current = null;
      }
    })();
    accessRepairRef.current = repair;
    return repair;
  }

  useEffect(() => {
    if (!customInstructionsOpen) return;
    customInstructionsRef.current?.focus();
  }, [customInstructionsOpen]);

  useEffect(() => {
    if (!selfEvolving || !userDocId) {
      setControl(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, "agents", "labor"),
      (snapshot) => {
        const nextControl = snapshot.exists()
          ? { id: snapshot.id, ...(snapshot.data() || {}) }
          : null;
        setControl(nextControl);
        setLoading(false);
        setError("");
        setEvolverAccessError(false);
        if (
          requestedGenerationId &&
          [nextControl?.activeGenerationId, nextControl?.latestGenerationId].includes(
            requestedGenerationId
          )
        ) {
          setRequestedGenerationId("");
        }
      },
      (snapshotError) => {
        reportSnapshotError(snapshotError);
        setLoading(false);
      }
    );
  }, [accessSessionVersion, requestedGenerationId, selfEvolving, userDocId]);

  const generationId =
    requestedGenerationId ||
    control?.activeGenerationId ||
    control?.latestGenerationId ||
    "";

  useEffect(() => {
    if (!selfEvolving || !userDocId || !generationId) {
      setGeneration(null);
      setIdeas([]);
      return undefined;
    }

    const generationRef = doc(
      db,
      ROOT_COLLECTION,
      userDocId,
      "agents",
      "labor",
      "generations",
      generationId
    );
    return onSnapshot(
      generationRef,
      (snapshot) => {
        setGeneration(
          snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() || {}) } : null
        );
        setError("");
        setEvolverAccessError(false);
      },
      (snapshotError) => reportSnapshotError(snapshotError)
    );
  }, [accessSessionVersion, generationId, selfEvolving, userDocId]);

  useEffect(() => {
    if (!selfEvolving || !userDocId || !generationId) return undefined;
    const ideasRef = collection(
      db,
      ROOT_COLLECTION,
      userDocId,
      "agents",
      "labor",
      "generations",
      generationId,
      "ideas"
    );
    return onSnapshot(
      ideasRef,
      (snapshot) => {
        const nextIdeas = snapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() || {}) }))
          .sort((left, right) => {
            if (left.species !== right.species) {
              return speciesIndex(left.species) - speciesIndex(right.species);
            }
            return Number(left.speciesRank || 99) - Number(right.speciesRank || 99);
          });
        setIdeas(nextIdeas);
      },
      (snapshotError) => reportSnapshotError(snapshotError)
    );
  }, [accessSessionVersion, generationId, selfEvolving, userDocId]);

  useEffect(() => {
    if (selfEvolving || !userDocId) {
      setAdHocControl(null);
      setAdHocLoading(false);
      return undefined;
    }

    setAdHocLoading(true);
    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, "agents", "laborAdHoc"),
      (snapshot) => {
        const nextControl = snapshot.exists()
          ? { id: snapshot.id, ...(snapshot.data() || {}) }
          : null;
        setAdHocControl(nextControl);
        setAdHocLoading(false);
        const nextError =
          nextControl?.status === "failed"
            ? nextControl.error || "Idea generation failed."
            : "";
        setAdHocError(nextError);
        setAgentAccessError(isFirebasePermissionError(nextError));
        if (
          adHocRequestedGenerationId &&
          [nextControl?.activeGenerationId, nextControl?.latestGenerationId].includes(
            adHocRequestedGenerationId
          )
        ) {
          setAdHocRequestedGenerationId("");
        }
      },
      (snapshotError) => {
        reportSnapshotError(snapshotError, "agent");
        setAdHocLoading(false);
      }
    );
  }, [
    accessSessionVersion,
    adHocRequestedGenerationId,
    selfEvolving,
    userDocId,
  ]);

  const adHocGenerationId =
    adHocRequestedGenerationId ||
    adHocControl?.activeGenerationId ||
    adHocControl?.latestGenerationId ||
    "";

  useEffect(() => {
    if (selfEvolving || !userDocId || !adHocGenerationId) {
      setAdHocGeneration(null);
      setAdHocIdeas([]);
      return undefined;
    }

    return onSnapshot(
      doc(
        db,
        ROOT_COLLECTION,
        userDocId,
        "agents",
        "laborAdHoc",
        "generations",
        adHocGenerationId
      ),
      (snapshot) => {
        const nextGeneration = snapshot.exists()
          ? { id: snapshot.id, ...(snapshot.data() || {}) }
          : null;
        setAdHocGeneration(nextGeneration);
        const nextError =
          nextGeneration?.status === "failed"
            ? nextGeneration.error || "Idea generation failed."
            : "";
        setAdHocError(nextError);
        setAgentAccessError(isFirebasePermissionError(nextError));
      },
      (snapshotError) => reportSnapshotError(snapshotError, "agent")
    );
  }, [accessSessionVersion, adHocGenerationId, selfEvolving, userDocId]);

  useEffect(() => {
    if (selfEvolving || !userDocId || !adHocGenerationId) return undefined;
    const ideasRef = collection(
      db,
      ROOT_COLLECTION,
      userDocId,
      "agents",
      "laborAdHoc",
      "generations",
      adHocGenerationId,
      "ideas"
    );
    return onSnapshot(
      ideasRef,
      (snapshot) => {
        const nextIdeas = snapshot.docs
          .map((item) => ({ id: item.id, ...(item.data() || {}) }))
          .sort((left, right) => {
            if (left.species !== right.species) {
              return speciesIndex(left.species) - speciesIndex(right.species);
            }
            return Number(left.speciesRank || 99) - Number(right.speciesRank || 99);
          });
        setAdHocIdeas(nextIdeas);
      },
      (snapshotError) => reportSnapshotError(snapshotError, "agent")
    );
  }, [accessSessionVersion, adHocGenerationId, selfEvolving, userDocId]);

  const isRunning = RUNNING_STATUSES.has(
    String(generation?.status || control?.status || "").toLowerCase()
  );
  const completed = generation?.status === "completed";
  const failed = generation?.status === "failed" || control?.status === "failed";
  const visibleIdeas = useMemo(
    () => ideas.filter((idea) => idea.species === activeSpecies),
    [activeSpecies, ideas]
  );
  const speciesCounts = useMemo(
    () => Object.fromEntries(SPECIES.map((species) => [
      species.id,
      ideas.filter((idea) => idea.species === species.id).length,
    ])),
    [ideas]
  );
  const adHocIsRunning =
    adHocStarting ||
    RUNNING_STATUSES.has(
      String(adHocGeneration?.status || adHocControl?.status || "").toLowerCase()
    );
  const adHocVisibleIdeas = useMemo(
    () => adHocIdeas.filter((idea) => idea.species === activeSpecies),
    [activeSpecies, adHocIdeas]
  );
  const adHocSpeciesCounts = useMemo(
    () => Object.fromEntries(SPECIES.map((species) => [
      species.id,
      adHocIdeas.filter((idea) => idea.species === species.id).length,
    ])),
    [adHocIdeas]
  );
  const agentLiveProductCount = useMemo(
    () => adHocIdeas.filter((idea) => {
      const status = String(idea.pipelineStatus || "").toLowerCase();
      return (
        ["released", "deployed_with_warning"].includes(status) ||
        Boolean(idea.releaseUrl || idea.previewUrl)
      );
    }).length,
    [adHocIdeas]
  );
  const agentLiveWarningCount = useMemo(
    () => adHocIdeas.filter((idea) => {
      const status = String(idea.pipelineStatus || "").toLowerCase();
      const hasLiveDeployment = Boolean(idea.releaseUrl || idea.previewUrl);
      return (
        status === "deployed_with_warning" ||
        (status === "failed" && hasLiveDeployment)
      );
    }).length,
    [adHocIdeas]
  );
  const staleAgentAggregateFailure =
    !selfEvolving &&
    agentLiveProductCount > 0 &&
    /all autonomous product pipelines failed/i.test(adHocError);
  const visibleError = selfEvolving
    ? error
    : staleAgentAggregateFailure
      ? ""
      : adHocError;
  const visibleAccessError = selfEvolving
    ? evolverAccessError
    : agentAccessError;

  async function startEvolution() {
    if (starting || isRunning || !userDocId) return;
    setEvolverConfirmationOpen(false);
    setStarting(true);
    setError("");
    setEvolverAccessError(false);
    setExpandedIdeaId("");
    try {
      const result = await callStartLabor({
        email: userDocId,
        confirmedAutonomousLaunch: true,
      });
      if (result?.generationId) setRequestedGenerationId(result.generationId);
    } catch (requestError) {
      reportSnapshotError(requestError);
    } finally {
      setStarting(false);
    }
  }

  async function startAutonomousPipeline() {
    if (adHocIsRunning || !userDocId) return;
    setAgentConfirmationOpen(false);
    setAdHocStarting(true);
    setAdHocError("");
    setAgentAccessError(false);
    setExpandedIdeaId("");
    setAdHocIdeas([]);
    try {
      const result = await callStartAutonomousAgent({
        email: userDocId,
        customInstructions: customInstructions.trim(),
      });
      if (result?.generationId) {
        setAdHocRequestedGenerationId(result.generationId);
      }
    } catch (requestError) {
      reportSnapshotError(requestError, "agent");
    } finally {
      setAdHocStarting(false);
    }
  }

  return (
    <div className="tk-page-surface tk-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#0A0A0A] px-5 pb-20 pt-20 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        {selfEvolving ? (
          <section className="flex min-h-[62vh] flex-col items-center justify-center border-b border-white/[0.07] py-16 text-center">
            <div className="relative grid h-14 w-14 place-items-center rounded-lg border border-violet-200/20 bg-violet-200/[0.06] text-violet-100">
              <Dna size={24} strokeWidth={1.35} />
              {isRunning ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0A0A0A] bg-emerald-300" />
              ) : null}
            </div>
            <div className="mt-5 text-xs font-medium uppercase text-violet-200/70">
              A new kind of autonomous software
            </div>
            <h2 className="mt-3 mb-3 text-5xl font-medium leading-none text-white sm:text-6xl">
              Evolver
            </h2>
            {/* <p className="mt-4 text-lg font-light leading-7 text-slate-300 sm:text-2xl">
              It begins with a direction.
              <span className="block text-violet-200 sm:inline"> Not a destination.</span>
            </p> */}
            <LaborReferenceMenu />
            <p className="mt-5 max-w-2xl text-sm font-light leading-6 text-slate-400 sm:text-base">
              Evolver is a new kind of autonomous software that changes across
              generations. An Agent follows an exact goal toward an expected result.
              Evolver starts with a direction and lets variation, pressure, and
              survival reveal what comes next.
            </p>


            <p className="mt-5 max-w-2xl text-xs font-light leading-5 text-slate-500 sm:text-sm sm:leading-6">
              Labor’s first direction is idea generation. It searches for software
              worth building, remembers what survives, and changes how the next
              generation is created.
            </p>

            <p className="mt-5 max-w-2xl border-t border-white/[0.07] pt-5 text-xs font-light leading-5 text-slate-400 sm:text-sm sm:leading-6">
              When you start a generation, Labor evolves 240 candidates, selects 10
              survivors, generates code for each one, deploys them to Firebase,
              releases them to production, and continues managing them. Every
              launched product appears in Releases.
            </p>

            <button
              type="button"
              onClick={() => setEvolverConfirmationOpen(true)}
              disabled={starting || isRunning || loading || !userDocId}
              className="mt-7 inline-flex h-11 min-w-36 items-center justify-center gap-2 rounded-lg border border-violet-100/20 bg-violet-200 px-5 text-sm font-medium text-[#111018] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
            >
              {starting || isRunning ? (
                <Loader2 size={15} className="animate-spin" />
              ) : completed || failed ? (
                <RefreshCw size={15} />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
              {starting
                ? "Starting"
                : isRunning
                  ? "Evolving"
                  : completed || failed
                    ? "Evolve next generation"
                    : "Start"}
            </button>
            <p className="mt-3 max-w-xl text-xs font-light leading-5 text-slate-600">
              We choose the starting direction. The next meaningful step, 0 → 1,
              is not prewritten.
            </p>

            <div className="mt-4 flex max-w-xl items-start gap-2 text-left text-[11px] leading-4 text-amber-100/65">
              <AlertTriangle
                size={13}
                className="mt-0.5 shrink-0 text-amber-300/70"
                strokeWidth={1.7}
              />
              <p>
                <span className="font-medium text-amber-100/80">
                  Experimental and high risk.
                </span>{" "}
                A run can consume a large token budget and still return no usable ideas.
              </p>
            </div>

            <EvolutionLoop activePhase={generation?.phase || control?.phase} completed={completed} />
          </section>
        ) : (
         <section className="flex min-h-[52vh] flex-col items-center justify-center border-b border-white/[0.07] py-16 text-center">
  <div className="text-xs font-medium uppercase text-slate-600">
    Meet Labor
  </div>

  <h2 className="mt-4 max-w-3xl text-3xl font-medium leading-tight text-white sm:text-5xl">
    Hi, I’m Labor. I build and launch products for you.
  </h2>

  <p className="mt-5 max-w-2xl text-sm font-light leading-6 text-slate-400 sm:text-base">
    Give me permission and I’ll come up with ten ideas, build each one,
    put it online, prepare its launch, and keep managing it after it goes live.
  </p>

  <p className="mt-3 max-w-xl text-xs font-light leading-5 text-slate-600">
    Each run creates 4 online tools, 3 games, and 3 AI assistants.
    You’ll find everything I launch in{" "}
    {onOpenReleases ? (
      <button
        type="button"
        onClick={onOpenReleases}
        className="font-medium text-slate-300 underline decoration-white/20 underline-offset-4 transition hover:text-white"
      >
        Releases
      </button>
    ) : (
      <span className="font-medium text-slate-300">Releases</span>
    )}
    .
  </p>

  <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
    <button
      type="button"
      onClick={() => setAgentConfirmationOpen(true)}
      disabled={adHocIsRunning || adHocLoading || !userDocId}
      className="inline-flex h-11 min-w-48 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-5 text-sm font-medium text-[#111018] transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-55"
    >
      {adHocIsRunning ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Play size={15} fill="currentColor" />
      )}

      {adHocIsRunning
        ? "Labor is working"
        : "Let Labor get to work"}
    </button>

    <button
      type="button"
      onClick={() => setCustomInstructionsOpen((current) => !current)}
      className="inline-flex h-9 items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/40"
      aria-expanded={customInstructionsOpen}
      aria-controls="labor-custom-instructions"
    >
      <Plus size={13} strokeWidth={1.7} />

      {customInstructions.trim()
        ? "Edit Labor’s directions"
        : "Tell Labor what to focus on"}
    </button>
  </div>

  {customInstructionsOpen ? (
    <div
      id="labor-custom-instructions"
      className="mt-6 w-full max-w-xl text-left"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor="labor-custom-instructions-input"
          className="text-xs text-slate-400"
        >
          What should Labor focus on?
        </label>

        <button
          type="button"
          onClick={() => setCustomInstructionsOpen(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white/[0.05] hover:text-slate-300"
          aria-label="Close Labor’s directions"
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      <textarea
        ref={customInstructionsRef}
        id="labor-custom-instructions-input"
        value={customInstructions}
        onChange={(event) =>
          setCustomInstructions(event.target.value.slice(0, 6000))
        }
        maxLength={6000}
        rows={4}
        placeholder="For example: Create products for solo accountants who work with PDF files."
        className="tk-scrollbar w-full resize-y rounded-lg border border-white/[0.1] bg-white/[0.025] px-3 py-3 text-sm font-light leading-6 text-slate-200 outline-none transition placeholder:text-slate-700 focus:border-white/20"
      />

      <div className="mt-1.5 text-right text-[10px] tabular-nums text-slate-700">
        {customInstructions.length}/6000
      </div>
    </div>
  ) : null}

  {adHocIsRunning ? (
    <p className="mt-6 max-w-xl text-xs font-light leading-5 text-slate-600">
      Labor is creating and launching your ten products. You can leave this
      page—it will keep working in the background.
    </p>
  ) : null}
</section>
        )}

        {visibleError ? (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-300/15 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">
            {restoringAccess ? (
              <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin" />
            ) : (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 break-words">
              {restoringAccess
                ? "Labor is restoring access to your cloud workspace. Your run is safe."
                : visibleError}
            </span>
            {!restoringAccess && visibleAccessError ? (
              <button
                type="button"
                onClick={reconnectRequired ? onOpenSettings : restoreAccess}
                className="shrink-0 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.14]"
              >
                {reconnectRequired ? "Open Settings" : "Restore access"}
              </button>
            ) : null}
          </div>
        ) : null}

        {!selfEvolving && !visibleError && agentLiveWarningCount ? (
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100/85">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1 leading-5">
              {agentLiveWarningCount === 1
                ? "One product is live, but its final release step needs attention."
                : `${agentLiveWarningCount} products are live, but their final release steps need attention.`}
              {" "}The deployed applications remain available; open a product below for its warning.
            </span>
          </div>
        ) : null}

        {selfEvolving && generation ? (
          <GenerationProgress generation={generation} isRunning={isRunning} />
        ) : null}

        {selfEvolving ? (
          ideas.length ? (
            <section className="py-10">
              <div className="flex flex-col justify-between gap-5 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end">
                <div>
                  <div className="flex items-center gap-2 text-white">
                    <Sparkles size={16} className="text-violet-200" strokeWidth={1.6} />
                    <h2 className="text-lg font-medium">
                      Generation {generation?.generationNumber || ""} survivors
                    </h2>
                  </div>
                  <p className="mt-2 text-xs font-light text-slate-500">
                    Thirty niche champions with distinct causal fingerprints.
                  </p>
                </div>
                <SpeciesTabs
                  activeSpecies={activeSpecies}
                  counts={speciesCounts}
                  onChange={(species) => {
                    setActiveSpecies(species);
                    setExpandedIdeaId("");
                  }}
                />
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {visibleIdeas.map((idea) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    expanded={expandedIdeaId === idea.id}
                    onToggle={() =>
                      setExpandedIdeaId((current) => (current === idea.id ? "" : idea.id))
                    }
                  />
                ))}
              </div>
            </section>
          ) : isRunning ? (
            <section className="flex min-h-40 items-center justify-center py-10 text-sm text-slate-600">
              <Loader2 size={14} className="mr-2 animate-spin" />
              The first organisms will appear after natural selection.
            </section>
          ) : null
        ) : adHocIdeas.length ? (
          <AdHocResults
            generation={adHocGeneration}
            ideas={adHocVisibleIdeas}
            activeSpecies={activeSpecies}
            counts={adHocSpeciesCounts}
            expandedIdeaId={expandedIdeaId}
            onSpeciesChange={(species) => {
              setActiveSpecies(species);
              setExpandedIdeaId("");
            }}
            onToggleIdea={(ideaId) =>
              setExpandedIdeaId((current) => (current === ideaId ? "" : ideaId))
            }
          />
        ) : adHocIsRunning ? (
          <section className="flex min-h-40 items-center justify-center py-10 text-sm text-slate-600">
            <Loader2 size={14} className="mr-2 animate-spin" />
            Preparing the autonomous product pipelines.
          </section>
        ) : null}
      </div>
      <AutonomousAgentConfirmation
        open={selfEvolving ? evolverConfirmationOpen : agentConfirmationOpen}
        busy={selfEvolving ? starting : adHocStarting}
        experience={selfEvolving ? "evolver" : "agent"}
        onCancel={() => {
          if (selfEvolving) setEvolverConfirmationOpen(false);
          else setAgentConfirmationOpen(false);
        }}
        onConfirm={selfEvolving ? startEvolution : startAutonomousPipeline}
      />
    </div>
  );
}

function AutonomousAgentConfirmation({
  open,
  busy,
  experience = "agent",
  onCancel,
  onConfirm,
}) {
  const evolver = experience === "evolver";
  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="autonomous-agent-confirmation-title"
        className="tk-scrollbar max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-white/[0.12] bg-[#101116] shadow-[0_28px_90px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div>
            <div className="text-[10px] font-medium uppercase text-slate-600">
              Before Labor starts
            </div>

            <h2
              id="autonomous-agent-confirmation-title"
              className="mt-1.5 text-xl font-medium text-white"
            >
              This run may cost money
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            aria-label="Close confirmation"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm font-light leading-6 text-slate-400">
            {evolver
              ? "Evolving and publishing ten products requires many AI model calls and cloud services. Your connected providers may charge you for this usage."
              : "I don’t want to use your resources without being clear about the cost. Creating and publishing ten products requires repeated AI model calls and cloud services. Your connected providers may charge you for this usage."}
          </p>

          <div className="mt-5 border-y border-white/[0.07]">
            <div className="grid gap-3 py-4 sm:grid-cols-[140px_1fr]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <Code2
                  size={14}
                  className="text-violet-200"
                  strokeWidth={1.7}
                />
                AI model usage
              </div>

              <ol className="space-y-2 text-xs font-light leading-5 text-slate-500">
                <li>
                  1. {evolver
                    ? "Evolve hundreds of candidates into ten survivors"
                    : "Create ten product ideas"}
                </li>
                <li>2. Build and test every product</li>
                <li>3. Prepare launch content for every product</li>
              </ol>
            </div>

            <div className="grid gap-3 border-t border-white/[0.07] py-4 sm:grid-cols-[140px_1fr]">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                <Cloud
                  size={14}
                  className="text-sky-200"
                  strokeWidth={1.7}
                />
                Cloud services
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-light text-slate-500">
                <span>Firebase Hosting</span>
                <span>Firestore database</span>
                <span>Authentication</span>
                <span>Cloud Storage</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] px-3 py-3 text-xs font-light leading-5 text-amber-100/75">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0 text-amber-300"
            />

            <span>
              Once started, Labor will continue through every stage without
              asking again. Live products may keep using cloud resources after
              this run. Continue only if you accept the possible charges.
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/[0.08] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg px-4 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
          >
            Not now
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-9 min-w-48 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-[#111018] transition hover:bg-slate-200 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Rocket size={14} />
            )}

            {evolver
              ? "I understand, start Evolver"
              : "I understand, start Labor"}
          </button>
        </div>
      </section>
    </div>
  );
}
function SpeciesTabs({ activeSpecies, counts, onChange }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-white/[0.08] bg-black/20 p-1 sm:w-auto">
      {SPECIES.map((species) => {
        const Icon = species.icon;
        const selected = activeSpecies === species.id;
        return (
          <button
            key={species.id}
            type="button"
            onClick={() => onChange(species.id)}
            className={[
              "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs transition sm:flex-none",
              selected
                ? "bg-white/[0.1] text-white"
                : "text-slate-500 hover:text-slate-200",
            ].join(" ")}
          >
            <Icon size={13} strokeWidth={1.6} />
            <span>{species.label}</span>
            <span className="text-[10px] text-slate-600">{counts[species.id] || 0}</span>
          </button>
        );
      })}
    </div>
  );
}

function AdHocResults({
  generation,
  ideas,
  activeSpecies,
  counts,
  expandedIdeaId,
  onSpeciesChange,
  onToggleIdea,
}) {
  return (
    <section className="py-10">
      <div className="flex flex-col justify-between gap-5 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Sparkles size={15} className="text-slate-300" strokeWidth={1.6} />
            <h2 className="text-lg font-medium">Autonomous products</h2>
          </div>
          <p className="mt-2 text-xs font-light text-slate-600">
            Batch {generation?.generationNumber || ""}
            {generation?.hasCustomInstructions ? " - Custom instructions applied" : ""}
            {generation?.phaseLabel ? ` - ${generation.phaseLabel}` : ""}
          </p>
        </div>
        <SpeciesTabs activeSpecies={activeSpecies} counts={counts} onChange={onSpeciesChange} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {ideas.map((idea) => (
          <AdHocIdeaCard
            key={idea.id}
            idea={idea}
            expanded={expandedIdeaId === idea.id}
            onToggle={() => onToggleIdea(idea.id)}
          />
        ))}
      </div>
    </section>
  );
}

function autonomousPipelinePresentation(status) {
  switch (String(status || "").toLowerCase()) {
    case "released":
      return { label: "Live in production", color: "text-emerald-300" };
    case "release_queued":
    case "releasing":
      return { label: "Preparing release", color: "text-sky-300" };
    case "deployed":
      return { label: "First deployment ready", color: "text-cyan-300" };
    case "deployed_with_warning":
      return { label: "Live, release needs attention", color: "text-amber-300" };
    case "building":
      return { label: "Generating and deploying", color: "text-violet-200" };
    case "retrying":
      return { label: "Retrying pipeline", color: "text-amber-300" };
    case "failed":
      return { label: "Pipeline needs attention", color: "text-red-300" };
    case "idea_ready":
      return { label: "Idea ready", color: "text-slate-400" };
    default:
      return { label: "Queued for build", color: "text-slate-500" };
  }
}

function AdHocIdeaCard({ idea, expanded, onToggle }) {
  const species = SPECIES.find((item) => item.id === idea.species) || SPECIES[0];
  const Icon = species.icon;
  const phenotype = idea.phenotype || {};
  const liveUrl = idea.releaseUrl || idea.previewUrl;
  const pipeline = autonomousPipelinePresentation(
    idea.pipelineStatus || (idea.autonomous ? "queued" : "idea_ready")
  );
  return (
    <article className="tk-glass-card min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.025]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-white/[0.025]"
        aria-expanded={expanded}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.04] text-violet-100">
          <Icon size={14} strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-white">
              {idea.name || phenotype.name || "Untitled idea"}
            </span>
            <span className="shrink-0 text-[10px] text-slate-700">
              #{idea.speciesRank || "-"}
            </span>
          </span>
          <span className="mt-1 line-clamp-2 block text-xs font-light leading-5 text-slate-500">
            {idea.oneLiner || phenotype.oneLiner}
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
            <span className={`inline-flex items-center gap-1 ${pipeline.color}`}>
              <CircleDot size={11} />
              {pipeline.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={11} />
              Autonomous build and release
            </span>
          </span>
        </span>
        <ChevronRight
          size={14}
          className={`shrink-0 text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded ? (
        <div className="border-t border-white/[0.07] px-4 pb-5 pt-4">
          <p className="text-sm font-light leading-6 text-slate-300">
            {phenotype.productConcept}
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <IdeaDetail label="Who it is for" value={phenotype.customerOrPlayer} />
            <IdeaDetail label="Problem or desire" value={phenotype.problemOrDesire} />
            <IdeaDetail label="Why different" value={phenotype.moat} />
            <IdeaDetail label="Distribution" value={phenotype.distribution} />
            <IdeaDetail label="Monetization" value={phenotype.monetization} />
            <IdeaDetail label="Why now" value={phenotype.whyNow} />
          </div>

          {Array.isArray(phenotype.workflow) && phenotype.workflow.length ? (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <div className="text-[10px] uppercase text-slate-700">Core workflow</div>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {phenotype.workflow.map((step, index) => (
                  <li key={`${idea.id}-adhoc-step-${index}`} className="flex min-w-0 gap-2 text-xs leading-5 text-slate-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-200/70" />
                    <span className="break-words">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {phenotype.autonomyProof ? (
            <div className="mt-5 flex gap-2 border-t border-white/[0.06] pt-4 text-xs leading-5 text-slate-500">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-200/70" />
              <span>{phenotype.autonomyProof}</span>
            </div>
          ) : null}

          {idea.pipelineError ? (
            <div className={`mt-5 flex gap-2 border-t border-white/[0.06] pt-4 text-xs leading-5 ${
              idea.previewUrl || idea.releaseUrl
                ? "text-amber-100/75"
                : "text-red-200/80"
            }`}>
              <AlertTriangle
                size={13}
                className={`mt-0.5 shrink-0 ${
                  idea.previewUrl || idea.releaseUrl
                    ? "text-amber-300"
                    : "text-red-300"
                }`}
              />
              <span>{idea.pipelineError}</span>
            </div>
          ) : null}

          {liveUrl ? (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-medium text-emerald-200 transition hover:text-emerald-100"
              >
                <Rocket size={13} />
                {idea.releaseUrl
                  ? "Open production release"
                  : "Open live application"}
                <ExternalLink size={11} />
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EvolutionLoop({ activePhase, completed }) {
  const rank = completed ? EVOLUTION_STAGES.length : Number(STAGE_RANK[activePhase] ?? -1);
  return (
    <div className="mt-12 grid w-full max-w-4xl grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] sm:grid-cols-6">
      {EVOLUTION_STAGES.map((stage, index) => {
        const Icon = stage.icon;
        const active =
          !completed &&
          (stage.id === activePhase ||
            (activePhase === "map_niches" && stage.id === "remember") ||
            (activePhase === "dispatch_attacks" && stage.id === "attack") ||
            (activePhase === "autonomy_check" && stage.id === "attack") ||
            (activePhase === "shadow_tournament" && stage.id === "evolve"));
        const passed = completed || index < rank;
        return (
          <div
            key={stage.id}
            className={[
              "flex h-16 min-w-0 items-center justify-center gap-2 bg-[#090b11]/80 px-2 text-xs",
              active ? "text-violet-100" : passed ? "text-slate-300" : "text-slate-700",
            ].join(" ")}
          >
            {active ? (
              <Loader2 size={13} className="shrink-0 animate-spin" />
            ) : (
              <Icon size={13} className="shrink-0" strokeWidth={1.5} />
            )}
            <span className="truncate">{stage.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function GenerationProgress({ generation, isRunning }) {
  const counts = generation.counts || {};
  const progress = Math.max(0, Math.min(100, Number(generation.progressPercent || 0)));
  const metrics = [
    { label: "Generation", value: generation.generationNumber || 1 },
    {
      label: "Genomes",
      value: `${Number(counts.candidatesGenerated || 0)}/${Number(generation.candidateTarget || 240)}`,
    },
    { label: "Evaluated", value: Number(counts.candidatesEvaluated || 0) },
    { label: "Survivors", value: Number(counts.selectedIdeas || 0) },
  ];
  return (
    <section className="border-b border-white/[0.07] py-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            {isRunning ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-violet-200" />
            ) : generation.status === "failed" ? (
              <AlertTriangle size={14} className="shrink-0 text-red-200" />
            ) : (
              <CircleDot size={14} className="shrink-0 text-emerald-200" />
            )}
            <span className="truncate">{generation.phaseLabel || "Evolution state"}</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs font-light leading-5 text-slate-500">
            {generation.activity || "Labor is updating its evolutionary memory."}
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-slate-500">{progress}%</span>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-violet-200 transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-[#090b11]/70 px-4 py-3">
            <div className="text-[10px] uppercase text-slate-700">{metric.label}</div>
            <div className="mt-1 text-sm font-medium tabular-nums text-slate-300">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      {generation.status === "failed" && generation.error ? (
        <p className="mt-3 text-xs leading-5 text-red-200/80">{generation.error}</p>
      ) : null}
    </section>
  );
}

function IdeaCard({ idea, expanded, onToggle }) {
  const species = SPECIES.find((item) => item.id === idea.species) || SPECIES[0];
  const Icon = species.icon;
  const phenotype = idea.phenotype || {};
  const lineage = idea.lineage || {};
  const survival = idea.survivalProfile || {};
  const fitness = Math.round(Number(idea.finalFitness || 0));
  return (
    <article className="tk-glass-card min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.025]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-white/[0.025]"
        aria-expanded={expanded}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.04] text-violet-100">
          <Icon size={14} strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-white">
              {idea.name || phenotype.name || "Untitled idea"}
            </span>
            <span className="shrink-0 text-[10px] text-slate-700">
              #{idea.speciesRank || "-"}
            </span>
          </span>
          <span className="mt-1 line-clamp-2 block text-xs font-light leading-5 text-slate-500">
            {idea.oneLiner || phenotype.oneLiner}
          </span>
          <span className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Network size={11} />
              {formatGeneLabel(lineage.recipeId || "root mutation")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Dna size={11} />
              {formatGeneLabel(lineage.cognitiveMode || "observation")}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-emerald-200">
            {fitness}
          </span>
          <ChevronRight
            size={14}
            className={`text-slate-600 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-white/[0.07] px-4 pb-5 pt-4">
          <div className="grid gap-5 sm:grid-cols-2">
            <IdeaDetail label="Who it is for" value={phenotype.customerOrPlayer} />
            <IdeaDetail label="Why now" value={phenotype.whyNow} />
            <IdeaDetail label="Mechanism" value={idea.fingerprint?.mechanism} />
            <IdeaDetail label="Distribution" value={phenotype.distribution} />
            <IdeaDetail label="Monetization" value={phenotype.monetization} />
            <IdeaDetail label="Defensibility" value={phenotype.moat} />
          </div>

          {Array.isArray(phenotype.workflow) && phenotype.workflow.length ? (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <div className="text-[10px] uppercase text-slate-700">Product loop</div>
              <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                {phenotype.workflow.map((step, index) => (
                  <li key={`${idea.id}-step-${index}`} className="flex min-w-0 gap-2 text-xs leading-5 text-slate-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-200/70" />
                    <span className="break-words">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[10px] uppercase text-slate-700">Survival profile</span>
              <span className="text-[10px] text-slate-600">MAP-Elites champion</span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
              {Object.entries(survival).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <div className="truncate text-[9px] text-slate-700">
                    {formatGeneLabel(key)}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full bg-emerald-200/70"
                      style={{ width: `${Math.max(0, Math.min(100, Number(value || 0)))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {idea.topAttacks?.[0]?.attack ? (
            <div className="mt-5 flex gap-2 border-t border-white/[0.06] pt-4 text-xs leading-5 text-slate-500">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-amber-200/70" />
              <span>
                <span className="text-slate-400">Strongest surviving attack: </span>
                {idea.topAttacks[0].attack}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function IdeaDetail({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-slate-700">{label}</div>
      <p className="mt-1 break-words text-xs font-light leading-5 text-slate-400">{value}</p>
    </div>
  );
}

function speciesIndex(value) {
  const index = SPECIES.findIndex((species) => species.id === value);
  return index === -1 ? 99 : index;
}

function formatGeneLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default LaborIdeasPage;
