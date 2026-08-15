import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  Code2,
  Dna,
  ExternalLink,
  File,
  Github,
  KeyRound,
  LogOut,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Play,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Wrench,
  X,
  ArrowRight,
} from "lucide-react";

import {
  activateCustomerDataPlane,
  auth,
  controlDb,
  db,
  getDataPlaneState,
  initializeAnalytics,
  isFirebasePermissionError,
  repairCustomerDataPlaneSession,
  signOutCustomerDataPlane,
  storage,
  userFacingFirebaseError,
} from "./lib/firebase";
import { callAppGenerationAgent, callLaborAgent } from "./lib/agent";
import CloudBuildLogPanel from "./components/CloudBuildLogPanel";
import GeneratedCodeWorkspace from "./components/GeneratedCodeWorkspace";
import LaborLogo from "./components/LaborLogo";
import LaborLoginExperience from "./components/LaborLoginExperience";
import ReleaseApplicationModal from "./components/ReleaseApplicationModal";
import SessionConfigurationPopover from "./components/SessionConfigurationPopover";
import Agent from "./pages/Agent";
import Configurations from "./pages/Configurations";
import Evolver from "./pages/Evolver";
import GetStarted from "./pages/GetStarted";
import Privacy from "./pages/Privacy";
import Releases from "./pages/Releases";
import Terms from "./pages/Terms";
import {
  LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION,
  LABOR_GITHUB_URL,
} from "./lib/laborBrand";

const STARTERS = [
  {
    type: "App",
    label: "Team dashboard",
    prompt:
      "Build a shared dashboard for tracking projects, owners, deadlines, and progress.",
  },
  {
    type: "Game",
    label: "Highway runner",
    prompt:
      "Create a cinematic endless highway game with simple controls and rising difficulty.",
  },
  {
    type: "Creative",
    label: "Music visuals",
    prompt: "Create an audio-reactive visual universe that changes with music.",
  },
  {
    type: "Automation",
    label: "Market watcher",
    prompt:
      "Build a system that watches market changes and summarizes the important shifts.",
  },
];

const RUN_COLLECTION = "runs";
const CONFIG_COLLECTION = "Configurations";
const RUN_PATH_PREFIX = "/run/";
const GET_STARTED_PATH = "/getstarted";
const SETTINGS_PATH = "/settings";
const RELEASES_PATH = "/releases";
const AGENT_PATH = "/agent";
const EVOLVER_PATH = "/evolver";
const LEGACY_AGENTS_PATH = "/agents";
const PRIVACY_PATH = "/privacy";
const TERMS_PATH = "/terms";
const RUN_PAGE_SIZE = 20;
const RUN_SEARCH_SCAN_SIZE = 200;
const googleProvider = new GoogleAuthProvider();

googleProvider.addScope("email");
googleProvider.addScope("profile");

function safeDocId(value) {
  return String(value || "guest").replace(/\//g, "_");
}

function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getRunIdFromPath() {
  if (typeof window === "undefined") return "";
  const path = window.location.pathname || "";
  if (!path.startsWith(RUN_PATH_PREFIX)) return "";
  return decodeURIComponent(path.slice(RUN_PATH_PREFIX.length).split("/")[0] || "");
}

function getPageFromPath() {
  if (typeof window === "undefined") return "chat";
  const path = window.location.pathname;
  if (path === GET_STARTED_PATH) return "getstarted";
  if (path === SETTINGS_PATH) return "configurations";
  if (path === RELEASES_PATH) return "releases";
  if (path === AGENT_PATH) return "agent";
  if (path === EVOLVER_PATH || path === LEGACY_AGENTS_PATH) return "evolver";
  if (path === PRIVACY_PATH || path === `${PRIVACY_PATH}/`) return "privacy";
  if (path === TERMS_PATH || path === `${TERMS_PATH}/`) return "terms";
  return "chat";
}

function setRunIdInUrl(runId) {
  if (typeof window === "undefined") return;
  const nextPath = runId ? `${RUN_PATH_PREFIX}${encodeURIComponent(runId)}` : "/";
  const nextUrl = `${nextPath}${window.location.search || ""}${window.location.hash || ""}`;
  const currentUrl = `${window.location.pathname}${window.location.search || ""}${window.location.hash || ""}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function setPageInUrl(page) {
  if (typeof window === "undefined") return;
  const pagePaths = {
    releases: RELEASES_PATH,
    agent: AGENT_PATH,
    evolver: EVOLVER_PATH,
    getstarted: GET_STARTED_PATH,
    configurations: SETTINGS_PATH,
    privacy: PRIVACY_PATH,
    terms: TERMS_PATH,
  };
  const path = pagePaths[page] || SETTINGS_PATH;
  const nextUrl = `${path}${window.location.search || ""}${window.location.hash || ""}`;
  const currentUrl = `${window.location.pathname}${window.location.search || ""}${window.location.hash || ""}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function tsToMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value._seconds === "number") return value._seconds * 1000;

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function runFromSnapshot(runDoc) {
  const data = runDoc.data() || {};
  return {
    id: runDoc.id,
    title: String(data.title || "Untitled prototype"),
    createdAtMs: tsToMs(data.createdAt),
    updatedAtMs: tsToMs(data.updatedAt),
    generationValidationBlocked: Boolean(data.generationValidationBlocked),
    generationValidationRepairAttempts: Math.max(
      0,
      Number(data.generationValidationRepairAttempts || 0)
    ),
  };
}

function sortRunsByUpdatedAt(items) {
  return items.slice().sort((left, right) => {
    const rightTime = right.updatedAtMs || right.createdAtMs || 0;
    const leftTime = left.updatedAtMs || left.createdAtMs || 0;
    return rightTime - leftTime;
  });
}

function makeRunTitle(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "New prototype";
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}...` : cleaned;
}

function formatTime(ms) {
  if (!ms) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatAgentPhase(value) {
  const phase = String(value || "").trim();
  if (!phase) return "Analyzing parameters";
  if (phase.startsWith("cloud_build_")) {
    const status = phase.slice("cloud_build_".length).replace(/_/g, " ");
    return `Cloud Build ${status}`;
  }
  return phase.replace(/_/g, " ");
}

function buildAgentReply(data) {
  if (!data) return null;

  return {
    status: String(data.status || "processing"),
    phase: data.phase ? String(data.phase) : "",
    finalTextMd: String(data.finalTextMd || ""),
    requiresUserInput: Boolean(data.requiresUserInput),
    followupOptions: Array.isArray(data.followupOptions)
      ? data.followupOptions
      : [],
    suggestedPrompts: Array.isArray(data.suggestedPrompts)
      ? data.suggestedPrompts
      : [],
    jsonData: data.jsonData || null,
    error: data.error ? String(data.error) : "",
    updatedAtMs:
      Number(data.lastUpdatedMs || 0) ||
      tsToMs(data.updatedAt) ||
      tsToMs(data.createdAt),
  };
}

function isGenerating(messages) {
  return messages.some((message) => {
    const reply = message.agentReply;
    return (
      reply?.jsonData?.actionType === "app_generation" &&
      ["processing", "thinking", "queued", "running"].includes(reply.status)
    );
  });
}

function getRequiredThirdPartyApis(reply) {
  const direct = reply?.jsonData?.requiredThirdPartyApis;
  const routed = reply?.jsonData?.routerDecision?.requiredThirdPartyApis;
  return Array.isArray(direct) ? direct : Array.isArray(routed) ? routed : [];
}

function getThirdPartyCredentialStatus(reply) {
  return reply?.jsonData?.thirdPartyCredentialStatus || {
    required: false,
    ready: true,
    services: [],
    validationResults: [],
  };
}

function thirdPartyCredentialsReady(reply) {
  const requiredApis = getRequiredThirdPartyApis(reply);
  if (!requiredApis.length) return true;
  return Boolean(getThirdPartyCredentialStatus(reply)?.ready);
}

function isConcreteCurlSample(value) {
  const text = String(value || "").trim();
  return /^curl\s+/i.test(text) && /https?:\/\//i.test(text);
}

function getDisplaySampleCurl(api = {}) {
  const recommendation = api.providerRecommendation || {};
  const direct = recommendation.sampleCurl || "";
  const example = Array.isArray(api.examples) ? api.examples[0] || "" : "";
  if (isConcreteCurlSample(direct)) return direct;
  if (isConcreteCurlSample(example)) return example;
  return "";
}

function App() {
  const initialRunId = getRunIdFromPath();
  const initialPage = getPageFromPath();
  const [identity, setIdentity] = useState({
    ready: false,
    uid: "",
    email: "",
    label: "",
    photoURL: "",
  });
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsLoadingMore, setRunsLoadingMore] = useState(false);
  const [runsHasMore, setRunsHasMore] = useState(true);
  const [runSearchOpen, setRunSearchOpen] = useState(false);
  const [runSearchItems, setRunSearchItems] = useState([]);
  const [runSearchLoading, setRunSearchLoading] = useState(false);
  const [runSearchError, setRunSearchError] = useState("");
  const [activeRunId, setActiveRunId] = useState(initialRunId);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(false);
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [pendingGenerationMessageIds, setPendingGenerationMessageIds] =
    useState([]);
  const [error, setError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [activePage, setActivePage] = useState(initialPage);
  const [workspaceViewMode, setWorkspaceViewMode] = useState("preview");
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [dataPlane, setDataPlane] = useState(() => getDataPlaneState());
  const [cloudSessionRepairing, setCloudSessionRepairing] = useState(false);
  const [cloudReconnectRequired, setCloudReconnectRequired] = useState(false);

  const textareaRef = useRef(null);
  const endRef = useRef(null);
  const latestDeploymentReplyRef = useRef(null);
  const focusedDeploymentRef = useRef("");
  const fileInputRef = useRef(null);
  const activeRunIdRef = useRef(initialRunId);
  const replyUnsubsRef = useRef(new Map());
  const creatingRunRef = useRef(null);
  const generationLaunchesRef = useRef(new Set());
  const runsCursorRef = useRef(null);
  const runsHaveOlderPagesRef = useRef(false);
  const loadingMoreRunsRef = useRef(false);
  const cloudSessionRepairRef = useRef(null);

  const repairCloudSession = useCallback(async () => {
    if (!identity.email) return false;
    if (cloudSessionRepairRef.current) return cloudSessionRepairRef.current;

    const repair = (async () => {
      setCloudSessionRepairing(true);
      try {
        const nextDataPlane = await repairCustomerDataPlaneSession({
          email: identity.email,
          userDocId: safeDocId(identity.email),
        });
        setDataPlane(nextDataPlane);
        setCloudReconnectRequired(false);
        setError("");
        return true;
      } catch (repairError) {
        setCloudReconnectRequired(true);
        setError(
          "Labor could not renew access automatically. Open Settings and reconnect Google Cloud. Your existing projects, apps, data, and releases will be kept."
        );
        return false;
      } finally {
        setCloudSessionRepairing(false);
        cloudSessionRepairRef.current = null;
      }
    })();
    cloudSessionRepairRef.current = repair;
    return repair;
  }, [identity.email]);

  const handleWorkspaceError = useCallback(
    (workspaceError) => {
      if (isFirebasePermissionError(workspaceError)) {
        setError(userFacingFirebaseError(workspaceError));
        void repairCloudSession();
        return;
      }
      setError(userFacingFirebaseError(workspaceError));
    },
    [repairCloudSession]
  );

  const userDocId = useMemo(() => safeDocId(identity.email), [identity.email]);
  const generationRunning = useMemo(() => isGenerating(messages), [messages]);
  const sidebarOpen = sidebarPinnedOpen || sidebarPeekOpen;
  const isCodeWorkspaceMode = activePage === "chat" && workspaceViewMode === "code";
  const onboardingRequired =
    identity.ready && Boolean(identity.email) && onboardingReady && !onboardingComplete;
  const onboardingPending =
    identity.ready && Boolean(identity.email) && !onboardingReady;
  const customerDataPlanePending =
    identity.ready &&
    Boolean(identity.email) &&
    onboardingReady &&
    onboardingComplete &&
    !dataPlane.active;
  const onboardingGateActive =
    onboardingRequired || onboardingPending || customerDataPlanePending;
  const activeRunGenerationBlocked = useMemo(
    () =>
      Boolean(
        runs.find((run) => run.id === activeRunId)?.generationValidationBlocked
      ),
    [activeRunId, runs]
  );
  const latestDeploymentMessageId = useMemo(() => {
    let latest = null;

    messages.forEach((message) => {
      const reply = message.agentReply;
      if (
        reply?.jsonData?.actionType !== "app_generation" ||
        reply.status !== "completed"
      ) {
        return;
      }

      const rank = reply.updatedAtMs || message.createdAtMs || 0;
      if (!latest || rank >= latest.rank) {
        latest = { id: message.id, rank };
      }
    });

    return latest?.id || "";
  }, [messages]);
  const consumedGenerationMessageIds = useMemo(() => {
    const consumed = new Set();
    const generationAttempts = messages.filter(
      (message) => message.action === "proceed"
    );

    generationAttempts.forEach((attempt) => {
      if (attempt.sourceMessageId) consumed.add(attempt.sourceMessageId);
      if (attempt.retryOfMessageId) consumed.add(attempt.retryOfMessageId);

      messages.forEach((candidate) => {
        const actionType = candidate.agentReply?.jsonData?.actionType;
        const isConfirmation =
          actionType === "confirm_problem" || actionType === "confirm_update";
        if (
          isConfirmation &&
          candidate.createdAtMs <= attempt.createdAtMs
        ) {
          consumed.add(candidate.id);
        }
      });
    });

    return consumed;
  }, [messages]);
  const sessionConfigurationMessageId = useMemo(() => {
    let latestReplyMessageId = "";

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!latestReplyMessageId && message.agentReply) {
        latestReplyMessageId = message.id;
      }
      if (getRequiredThirdPartyApis(message.agentReply).length) {
        return message.id;
      }
    }

    return latestReplyMessageId;
  }, [messages]);

  useEffect(() => {
    if (!identity.ready || !identity.email || !dataPlane.active) return;
    initializeAnalytics();
  }, [dataPlane.active, identity.email, identity.ready]);

  useEffect(() => {
    setWorkspaceViewMode("preview");
  }, [activePage, activeRunId]);

  useEffect(() => {
    activeRunIdRef.current = activeRunId;
    if (activePage !== "chat") {
      setPageInUrl(activePage);
      return;
    }
    setRunIdInUrl(activeRunId);
  }, [activePage, activeRunId]);

  useEffect(() => {
    const handlePopState = () => {
      const page = getPageFromPath();
      const runId = getRunIdFromPath();
      setActivePage(page);
      activeRunIdRef.current = runId;
      if (page === "chat") {
        setActiveRunId(runId);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      const applyIdentity = async () => {
      if (user) {
        const email = user.email || `${user.uid}@users.labor`;
        let nextDataPlane = getDataPlaneState();
        try {
          nextDataPlane = await activateCustomerDataPlane({
            email,
            userDocId: safeDocId(email),
          });
        } catch (dataPlaneError) {
          nextDataPlane = getDataPlaneState();
          if (dataPlaneError?.provisioning) {
            setError(
              "Labor is updating the core functions in your Google Cloud project."
            );
          } else {
            setError(dataPlaneError.message || "Could not open your cloud workspace.");
          }
        }
        if (!active) return;
        setDataPlane(nextDataPlane);
        setIdentity({
          ready: true,
          uid: user.uid,
          email,
          label: user.displayName || user.email || "Google user",
          photoURL: user.photoURL || "",
        });
        return;
      }

      await signOutCustomerDataPlane();
      if (!active) return;
      setDataPlane(getDataPlaneState());
      setCloudReconnectRequired(false);
      setMessages([]);
      setRuns([]);
      setRunsLoading(false);
      setRunsHasMore(false);
      setRunSearchOpen(false);
      setRunSearchItems([]);
      setProfileOpen(false);
      setSidebarPinnedOpen(false);
      setSidebarPeekOpen(false);
      const publicPage = getPageFromPath();
      setActivePage(
        publicPage === "privacy" || publicPage === "terms"
          ? publicPage
          : "chat"
      );
      setOnboardingReady(false);
      setOnboardingComplete(false);
      setIdentity({
        ready: true,
        uid: "",
        email: "",
        label: "",
        photoURL: "",
      });
      };

      void applyIdentity();
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!identity.ready || !identity.email) {
      setOnboardingReady(false);
      setOnboardingComplete(false);
      return undefined;
    }

    return onSnapshot(
      doc(
        controlDb,
        ROOT_COLLECTION,
        userDocId,
        CONFIG_COLLECTION,
        "onboarding"
      ),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() || {} : {};
        setOnboardingComplete(data.status === "completed");
        setOnboardingReady(true);
      },
      (err) => {
        setError(err.message);
        setOnboardingReady(true);
        setOnboardingComplete(false);
      }
    );
  }, [identity.email, identity.ready, userDocId]);

  useEffect(() => {
    if (!identity.ready || !identity.email) return;
    if (!onboardingReady) return;

    if (!onboardingComplete) {
      setActivePage("getstarted");
      setSidebarPinnedOpen(false);
      setSidebarPeekOpen(false);
      setProfileOpen(false);
      return;
    }

    if (activePage === "getstarted") {
      setActivePage("chat");
    }
  }, [activePage, identity.email, identity.ready, onboardingComplete, onboardingReady]);

  useEffect(() => {
    if (
      !identity.ready ||
      !identity.email ||
      !onboardingComplete ||
      dataPlane.active
    ) {
      return undefined;
    }

    let active = true;
    let opening = false;
    const unsubscribe = onSnapshot(
      doc(
        controlDb,
        ROOT_COLLECTION,
        userDocId,
        CONFIG_COLLECTION,
        "googleCloud"
      ),
      async (snapshot) => {
        const cloud = snapshot.exists() ? snapshot.data() || {} : {};
        if (cloud.status !== "ready" || opening) return;
        opening = true;
        try {
          const nextDataPlane = await activateCustomerDataPlane({
            email: identity.email,
            userDocId,
          });
          if (!active || !nextDataPlane.active) return;
          setDataPlane(nextDataPlane);
          setError("");
        } catch (dataPlaneError) {
          if (active && !dataPlaneError?.provisioning) {
            setError(
              dataPlaneError.message || "Could not open your cloud workspace."
            );
          }
        } finally {
          opening = false;
        }
      },
      (snapshotError) => {
        if (active) setError(snapshotError.message);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    dataPlane.active,
    identity.email,
    identity.ready,
    onboardingComplete,
    userDocId,
  ]);

  useEffect(() => {
    if (!identity.ready || !identity.email || !dataPlane.active) {
      setRuns([]);
      setRunsLoading(false);
      setRunsHasMore(false);
      runsCursorRef.current = null;
      runsHaveOlderPagesRef.current = false;
      return undefined;
    }

    const runsRef = collection(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION);
    const qRef = query(
      runsRef,
      orderBy("updatedAt", "desc"),
      limit(RUN_PAGE_SIZE)
    );

    setRuns([]);
    setRunsLoading(true);
    setRunsHasMore(true);
    setRunsLoadingMore(false);
    runsCursorRef.current = null;
    runsHaveOlderPagesRef.current = false;
    loadingMoreRunsRef.current = false;

    return onSnapshot(
      qRef,
      (snapshot) => {
        const next = snapshot.docs.map(runFromSnapshot);
        const firstPageIds = new Set(next.map((run) => run.id));

        setRuns((current) => {
          const olderRuns = current.filter(
            (run) => !firstPageIds.has(run.id)
          );
          return sortRunsByUpdatedAt([...next, ...olderRuns]);
        });

        if (!runsHaveOlderPagesRef.current) {
          runsCursorRef.current =
            snapshot.docs[snapshot.docs.length - 1] || null;
          setRunsHasMore(snapshot.docs.length === RUN_PAGE_SIZE);
        }

        setRunsLoading(false);
      },
      (err) => {
        setRunsLoading(false);
        handleWorkspaceError(err);
      }
    );
  }, [
    dataPlane.active,
    dataPlane.sessionVersion,
    handleWorkspaceError,
    identity.email,
    identity.ready,
    userDocId,
  ]);

  const loadMoreRuns = useCallback(async () => {
    if (
      !identity.ready ||
      !identity.email ||
      !runsHasMore ||
      loadingMoreRunsRef.current
    ) {
      return;
    }

    const cursor = runsCursorRef.current;
    if (!cursor) {
      setRunsHasMore(false);
      return;
    }

    loadingMoreRunsRef.current = true;
    setRunsLoadingMore(true);

    try {
      const runsRef = collection(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION);
      const pageSnapshot = await getDocs(
        query(
          runsRef,
          orderBy("updatedAt", "desc"),
          startAfter(cursor),
          limit(RUN_PAGE_SIZE)
        )
      );
      const pageRuns = pageSnapshot.docs.map(runFromSnapshot);

      setRuns((current) => {
        const byId = new Map(current.map((run) => [run.id, run]));
        pageRuns.forEach((run) => byId.set(run.id, run));
        return sortRunsByUpdatedAt(Array.from(byId.values()));
      });

      if (pageSnapshot.docs.length) {
        runsCursorRef.current =
          pageSnapshot.docs[pageSnapshot.docs.length - 1];
        runsHaveOlderPagesRef.current = true;
      }
      setRunsHasMore(pageSnapshot.docs.length === RUN_PAGE_SIZE);
    } catch (err) {
      handleWorkspaceError(err);
    } finally {
      loadingMoreRunsRef.current = false;
      setRunsLoadingMore(false);
    }
  }, [
    handleWorkspaceError,
    identity.email,
    identity.ready,
    runsHasMore,
    userDocId,
  ]);

  const handleRecentScroll = useCallback(
    (event) => {
      const element = event.currentTarget;
      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining < 96) loadMoreRuns();
    },
    [loadMoreRuns]
  );

  const closeRunSearch = useCallback(() => {
    setRunSearchOpen(false);
  }, []);

  const selectRunFromSearch = useCallback((run) => {
    activeRunIdRef.current = run.id;
    setRuns((current) => {
      if (current.some((item) => item.id === run.id)) return current;
      return sortRunsByUpdatedAt([run, ...current]);
    });
    setActiveRunId(run.id);
    setActivePage("chat");
    setProfileOpen(false);
    setSidebarPeekOpen(false);
    setRunSearchOpen(false);
  }, []);

  useEffect(() => {
    if (
      !runSearchOpen ||
      !identity.ready ||
      !identity.email ||
      !dataPlane.active
    ) {
      return undefined;
    }

    let active = true;
    setRunSearchItems(runs);
    setRunSearchLoading(true);
    setRunSearchError("");

    const loadSearchWindow = async () => {
      try {
        const searchSnapshot = await getDocs(
          query(
            collection(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION),
            orderBy("updatedAt", "desc"),
            limit(RUN_SEARCH_SCAN_SIZE)
          )
        );
        if (!active) return;
        setRunSearchItems(searchSnapshot.docs.map(runFromSnapshot));
      } catch (err) {
        if (active) setRunSearchError(err.message);
      } finally {
        if (active) setRunSearchLoading(false);
      }
    };

    loadSearchWindow();
    return () => {
      active = false;
    };
  }, [
    identity.email,
    identity.ready,
    dataPlane.active,
    runSearchOpen,
    userDocId,
  ]);

  const upsertMessage = useCallback((messageId, patch) => {
    setMessages((prev) => {
      const idx = prev.findIndex((message) => message.id === messageId);
      const nextMessage = {
        id: messageId,
        text: "",
        role: "user",
        createdAtMs: Date.now(),
        attachments: [],
        agentReply: null,
        ...patch,
      };

      if (idx === -1) {
        return [...prev, nextMessage].sort(
          (a, b) => a.createdAtMs - b.createdAtMs
        );
      }

      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy.sort((a, b) => a.createdAtMs - b.createdAtMs);
    });
  }, []);

  useEffect(() => {
    replyUnsubsRef.current.forEach((unsub) => unsub());
    replyUnsubsRef.current.clear();

    if (
      !identity.ready ||
      !identity.email ||
      !dataPlane.active ||
      !activeRunId
    ) {
      setMessages([]);
      return undefined;
    }

    const messagesRef = collection(
      db,
      ROOT_COLLECTION,
      userDocId,
      RUN_COLLECTION,
      activeRunId,
      "messages"
    );
    const qRef = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubMessages = onSnapshot(
      qRef,
      (snapshot) => {
        const seenIds = new Set();

        snapshot.docs.forEach((messageDoc) => {
          const messageId = messageDoc.id;
          const data = messageDoc.data() || {};
          seenIds.add(messageId);

          upsertMessage(messageId, {
            id: messageId,
            text: String(data.text || ""),
            role: String(data.role || "user"),
            action: data.action ? String(data.action) : "",
            sourceMessageId: data.sourceMessageId
              ? String(data.sourceMessageId)
              : "",
            retryOfMessageId: data.retryOfMessageId
              ? String(data.retryOfMessageId)
              : "",
            createdAtMs: tsToMs(data.createdAt) || Date.now(),
            problemStatement: data.problemStatement
              ? String(data.problemStatement)
              : "",
          });

          if (!replyUnsubsRef.current.has(messageId)) {
            const replyRef = doc(
              db,
              ROOT_COLLECTION,
              userDocId,
              RUN_COLLECTION,
              activeRunId,
              "messages",
              messageId,
              "agentreply",
              "current"
            );

            const unsubReply = onSnapshot(replyRef, (replySnap) => {
              upsertMessage(messageId, {
                agentReply: replySnap.exists()
                  ? buildAgentReply(replySnap.data())
                  : null,
              });
            });

            replyUnsubsRef.current.set(messageId, unsubReply);
          }
        });

        replyUnsubsRef.current.forEach((unsub, messageId) => {
          if (seenIds.has(messageId)) return;
          unsub();
          replyUnsubsRef.current.delete(messageId);
        });

        setMessages((prev) => prev.filter((message) => seenIds.has(message.id)));
      },
      (err) => handleWorkspaceError(err)
    );

    return () => {
      unsubMessages();
      replyUnsubsRef.current.forEach((unsub) => unsub());
      replyUnsubsRef.current.clear();
    };
  }, [
    activeRunId,
    dataPlane.active,
    dataPlane.sessionVersion,
    handleWorkspaceError,
    identity.email,
    identity.ready,
    upsertMessage,
    userDocId,
  ]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    const completedDeploymentIsLatest =
      Boolean(latestDeploymentMessageId) &&
      latestMessage?.id === latestDeploymentMessageId &&
      latestMessage?.agentReply?.status === "completed";

    if (completedDeploymentIsLatest) {
      const deploymentKey = `${activeRunId}:${latestDeploymentMessageId}`;
      if (focusedDeploymentRef.current === deploymentKey) return undefined;

      const frameId = window.requestAnimationFrame(() => {
        const replyElement = latestDeploymentReplyRef.current;
        if (!replyElement) return;

        replyElement.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        focusedDeploymentRef.current = deploymentKey;
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    return undefined;
  }, [
    activeRunId,
    latestDeploymentMessageId,
    messages.length,
    messages[messages.length - 1]?.agentReply?.updatedAtMs,
  ]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${Math.min(
      Math.max(textareaRef.current.scrollHeight, 24),
      112
    )}px`;
  }, [inputText]);

  const ensureRun = useCallback(
    async (seedText = "") => {
      if (activeRunIdRef.current) return activeRunIdRef.current;
      if (creatingRunRef.current) return creatingRunRef.current;

      const createRun = async () => {
        const runsRef = collection(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION);
        const runRef = doc(runsRef);
        await setDoc(runRef, {
          title: makeRunTitle(seedText),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          source: "labor",
        });
        activeRunIdRef.current = runRef.id;
        setActiveRunId(runRef.id);
        return runRef.id;
      };

      creatingRunRef.current = createRun();
      try {
        return await creatingRunRef.current;
      } finally {
        creatingRunRef.current = null;
      }
    },
    [userDocId]
  );

  const startNewRun = useCallback(() => {
    setError("");
    setMessages([]);
    setAttachedFiles([]);
    setActivePage("chat");
    activeRunIdRef.current = "";
    setActiveRunId("");
    setSidebarPeekOpen(false);
  }, []);

  const updateAttachedFile = useCallback((fileId, patch) => {
    setAttachedFiles((prev) =>
      prev.map((item) => (item.id === fileId ? { ...item, ...patch } : item))
    );
  }, []);

  const uploadDraftFile = useCallback(
    async (file, runId) => {
      const fileId = createId("file");
      const cleanName = file.name.replace(/[^\w.\- ]+/g, "_");
      const path = `${ROOT_COLLECTION}/${userDocId}/${runId}/drafts/${fileId}-${cleanName}`;

      setAttachedFiles((prev) => [
        ...prev,
        {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          uploadProgress: 0,
          uploading: true,
          downloadURL: "",
          storagePath: path,
          error: "",
        },
      ]);

      const task = uploadBytesResumable(storageRef(storage, path), file, {
        contentType: file.type || "application/octet-stream",
      });

      task.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100
          );
          updateAttachedFile(fileId, { uploadProgress: progress });
        },
        (err) => {
          updateAttachedFile(fileId, {
            uploading: false,
            error: err.message,
          });
        },
        async () => {
          const downloadURL = await getDownloadURL(task.snapshot.ref);
          updateAttachedFile(fileId, {
            uploading: false,
            uploadProgress: 100,
            downloadURL,
          });
        }
      );
    },
    [updateAttachedFile, userDocId]
  );

  const handleFilesSelected = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!files.length) return;

      try {
        const runId = await ensureRun(inputText || "File context");
        files.forEach((file) => uploadDraftFile(file, runId));
      } catch (err) {
        handleWorkspaceError(err);
      }
    },
    [ensureRun, handleWorkspaceError, inputText, uploadDraftFile]
  );

  const removeAttachedFile = useCallback((fileId) => {
    setAttachedFiles((prev) => prev.filter((item) => item.id !== fileId));
  }, []);

  const sendPrompt = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !identity.ready || !identity.email || isSending) return;

    if (activeRunGenerationBlocked) {
      setError(
        "This session reached its generation repair limit. Start a new chat to continue."
      );
      return;
    }

    if (attachedFiles.some((file) => file.uploading)) {
      setError("Wait for file uploads to finish before sending.");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const runId = await ensureRun(text);
      const runRef = doc(db, ROOT_COLLECTION, userDocId, RUN_COLLECTION, runId);
      const messagesRef = collection(runRef, "messages");
      const messageRef = await addDoc(messagesRef, {
        text,
        role: "user",
        attachmentCount: attachedFiles.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const runPatch = {
        updatedAt: serverTimestamp(),
      };

      if (!messages.length) {
        runPatch.title = makeRunTitle(text);
      }

      await setDoc(runRef, runPatch, { merge: true });

      await setDoc(doc(messageRef, "agentreply", "current"), {
        status: "processing",
        phase: "understanding_problem",
        finalTextMd: "Reading this like a product lead before reaching for code.",
        requiresUserInput: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdatedMs: Date.now(),
      });

      await Promise.all(
        attachedFiles
          .filter((file) => file.downloadURL)
          .map((file) =>
            setDoc(doc(messageRef, "files", file.id), {
              fileId: file.id,
              name: file.name,
              size: file.size,
              type: file.type,
              url: file.downloadURL,
              storagePath: file.storagePath,
              createdAt: serverTimestamp(),
            })
          )
      );

      setInputText("");
      setAttachedFiles([]);

      await callLaborAgent({
        email: userDocId,
        runid: runId,
        messageid: messageRef.id,
        usermessage: text,
      });
    } catch (err) {
      handleWorkspaceError(err);
    } finally {
      setIsSending(false);
    }
  }, [
    activeRunGenerationBlocked,
    attachedFiles,
    ensureRun,
    identity.email,
    identity.ready,
    inputText,
    handleWorkspaceError,
    isSending,
    messages.length,
    userDocId,
  ]);

  const proceedWithGeneration = useCallback(
    async (sourceMessage) => {
      if (
        !identity.ready ||
        !identity.email ||
        !activeRunId ||
        generationRunning ||
        generationLaunchesRef.current.has(sourceMessage.id)
      ) {
        return;
      }

      if (activeRunGenerationBlocked) {
        setError(
          "This session reached its generation repair limit. Start a new chat to continue."
        );
        return;
      }

      const problemStatement =
        sourceMessage.agentReply?.jsonData?.problemStatement ||
        sourceMessage.agentReply?.jsonData?.routerDecision?.problemStatement ||
        "";
      const potentialSolution =
        sourceMessage.agentReply?.jsonData?.potentialSolution ||
        sourceMessage.agentReply?.jsonData?.routerDecision?.potentialSolution ||
        "";
      const updateRequest = Array.isArray(
        sourceMessage.agentReply?.jsonData?.updateRequest
      )
        ? sourceMessage.agentReply.jsonData.updateRequest
        : [];
      const updateReasons = Array.isArray(
        sourceMessage.agentReply?.jsonData?.updateReasons
      )
        ? sourceMessage.agentReply.jsonData.updateReasons
        : [];
      const solutionBlueprint =
        sourceMessage.agentReply?.jsonData?.solutionBlueprint ||
        sourceMessage.agentReply?.jsonData?.routerDecision?.solutionBlueprint ||
        null;
      const gameBlueprint =
        sourceMessage.agentReply?.jsonData?.gameBlueprint ||
        sourceMessage.agentReply?.jsonData?.routerDecision?.gameBlueprint ||
        null;
      const artworkBlueprint =
        sourceMessage.agentReply?.jsonData?.artworkBlueprint ||
        sourceMessage.agentReply?.jsonData?.routerDecision?.artworkBlueprint ||
        null;
      const agentArchitecture =
        sourceMessage.agentReply?.jsonData?.agentArchitecture ||
        sourceMessage.agentReply?.jsonData?.routerDecision?.agentArchitecture ||
        null;
      const isGame = solutionBlueprint?.solutionKind === "game";
      const isArtwork = solutionBlueprint?.solutionKind === "artwork";
      const isAgent = solutionBlueprint?.solutionKind === "ai_agent";
      const generationMode = updateRequest.length ? "update" : "create";
      const knownDeployment = sourceMessage.agentReply?.jsonData || {};
      const knownPreviewUrl = String(knownDeployment.previewUrl || "").trim();
      const knownHostingSiteId = String(
        knownDeployment.hostingSiteId || ""
      ).trim();
      const knownProductName = String(
        knownDeployment.productName || ""
      ).trim();
      const retryOfMessageId =
        sourceMessage.action === "proceed" &&
        sourceMessage.agentReply?.status === "failed"
          ? sourceMessage.id
          : "";
      const confirmationSourceMessageId =
        sourceMessage.action === "proceed"
          ? sourceMessage.sourceMessageId ||
            sourceMessage.agentReply?.jsonData?.sourceMessageId ||
            sourceMessage.id
          : sourceMessage.id;

      if (!problemStatement.trim()) {
        setError("The problem statement is missing. Send a clarification first.");
        return;
      }

      generationLaunchesRef.current.add(sourceMessage.id);
      setPendingGenerationMessageIds((current) => [
        ...new Set([...current, sourceMessage.id]),
      ]);
      setError("");

      try {
        const runRef = doc(
          db,
          ROOT_COLLECTION,
          userDocId,
          RUN_COLLECTION,
          activeRunId
        );
        const messageRef = await addDoc(collection(runRef, "messages"), {
          text: retryOfMessageId ? "Try Again" : "Proceed",
          role: "user",
          action: "proceed",
          problemStatement,
          potentialSolution,
          updateRequest,
          updateReasons,
          solutionBlueprint,
          gameBlueprint,
          artworkBlueprint,
          agentArchitecture,
          generationMode,
          sourceMessageId: confirmationSourceMessageId,
          retryOfMessageId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(runRef, {
          updatedAt: serverTimestamp(),
        }, { merge: true });

        await setDoc(doc(messageRef, "agentreply", "current"), {
          status: "processing",
          phase: "starting_generation",
          finalTextMd:
            generationMode === "update"
              ? "Confirmed. I am updating and redeploying the current prototype."
              : isGame
                ? "Confirmed. I am building the complete playable game."
                : isArtwork
                  ? "Confirmed. I am composing the complete interactive artwork."
                : isAgent
                  ? "Confirmed. I am building the agent, its execution runtime, and its control surface."
                : "Confirmed. I am turning the problem into a deployable web prototype.",
          requiresUserInput: false,
          jsonData: {
            actionType: "app_generation",
            generationMode,
            problemStatement,
            potentialSolution,
            updateRequest,
            updateReasons,
            solutionBlueprint,
            gameBlueprint,
            artworkBlueprint,
            agentArchitecture,
            sourceMessageId: confirmationSourceMessageId,
            retryOfMessageId,
            ...(knownPreviewUrl ? { previewUrl: knownPreviewUrl } : {}),
            ...(knownHostingSiteId
              ? { hostingSiteId: knownHostingSiteId }
              : {}),
            ...(knownProductName ? { productName: knownProductName } : {}),
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastUpdatedMs: Date.now(),
        });

        await callAppGenerationAgent({
          email: userDocId,
          runid: activeRunId,
          messageid: messageRef.id,
          sourceMessageId: confirmationSourceMessageId,
          problemStatement,
          potentialSolution,
          updateRequest,
          updateReasons,
          solutionBlueprint,
          gameBlueprint,
          artworkBlueprint,
          agentArchitecture,
          generationMode,
        });
      } catch (err) {
        handleWorkspaceError(err);
      } finally {
        generationLaunchesRef.current.delete(sourceMessage.id);
        setPendingGenerationMessageIds((current) =>
          current.filter((messageId) => messageId !== sourceMessage.id)
        );
      }
    },
    [
      activeRunGenerationBlocked,
      handleWorkspaceError,
      activeRunId,
      generationRunning,
      identity.email,
      identity.ready,
      userDocId,
    ]
  );

  const submitOnEnter = useCallback(
    (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      sendPrompt();
    },
    [sendPrompt]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthBusy(true);
    setAuthError("");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err.message || "Google sign-in failed.");
      setAuthBusy(false);
    }
  }, []);

  useEffect(() => {
    if (identity.ready && identity.email) {
      setAuthBusy(false);
    }
  }, [identity.email, identity.ready]);

  const logout = useCallback(async () => {
    setAuthBusy(true);
    setAuthError("");

    try {
      await signOutCustomerDataPlane();
      await signOut(auth);
      setDataPlane(getDataPlaneState());
      activeRunIdRef.current = "";
      setActiveRunId("");
      setActivePage("chat");
    } catch (err) {
      setAuthError(err.message || "Logout failed.");
    } finally {
      setAuthBusy(false);
      setProfileOpen(false);
      setSidebarPinnedOpen(false);
      setSidebarPeekOpen(false);
    }
  }, []);

  const emptyState = !messages.length;
  const isEmptyNewRun = activePage === "chat" && !activeRunId && emptyState;
  const isMultiline = inputText?.includes("\n") || inputText?.length > 20;
  const isComposerExpanded = isMultiline || attachedFiles.length > 0;

  if (activePage === "privacy") return <Privacy />;
  if (activePage === "terms") return <Terms />;

  return (
    <div className="tk-app-shell flex h-screen overflow-hidden bg-[#0A0A0A] font-sans text-slate-300 selection:bg-violet-300/25">
      {!onboardingGateActive && (
        <aside
          onPointerLeave={() => {
            if (!sidebarPinnedOpen) {
              setSidebarPeekOpen(false);
              setProfileOpen(false);
            }
          }}
          className={[
            "tk-glass-sidebar fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0A0A0A] transition-all duration-200 ease-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            sidebarPinnedOpen ? "md:static md:z-auto md:translate-x-0" : "",
          ].join(" ")}
        >
          <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-3">
            <div className="flex min-w-0 items-center gap-2 px-1">
              <LaborLogo
                decorative
                className="size-6 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(255,38,54,0.25)]"
              />
              <span className="truncate text-sm font-semibold text-white">
                Labor
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setRunSearchItems(runs);
                setRunSearchOpen(true);
              }}
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              aria-label="Search chats"
              title="Search chats"
            >
              <Search size={16} strokeWidth={1.6} />
            </button>
          </div>

          <nav className="border-b border-white/[0.05] px-2 py-3">
            <button
              type="button"
              onClick={startNewRun}
              disabled={isEmptyNewRun}
              className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-light text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:text-slate-600 disabled:hover:bg-transparent disabled:hover:text-slate-600"
            >
              <MessageSquarePlus size={16} strokeWidth={1.7} />
              New
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePage("releases");
                setProfileOpen(false);
                setSidebarPeekOpen(false);
              }}
              className={[
                "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-light transition-colors",
                activePage === "releases"
                  ? "tk-glass-selected bg-white/[0.07] text-white"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
              ].join(" ")}
            >
              <Rocket size={16} strokeWidth={1.7} />
              Releases
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePage("agent");
                setProfileOpen(false);
                setSidebarPeekOpen(false);
              }}
              className={[
                "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-light transition-colors",
                activePage === "agent"
                  ? "tk-glass-selected bg-white/[0.07] text-white"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
              ].join(" ")}
            >
              <Bot size={16} strokeWidth={1.7} />
              Agent
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePage("evolver");
                setProfileOpen(false);
                setSidebarPeekOpen(false);
              }}
              className={[
                "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-light transition-colors",
                activePage === "evolver"
                  ? "tk-glass-selected bg-white/[0.07] text-white"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
              ].join(" ")}
            >
              <Dna size={16} strokeWidth={1.7} />
              Evolver
            </button>
          </nav>

          <div
            className="tk-scrollbar mt-2 flex-1 overflow-y-auto px-2 py-3"
            onScroll={handleRecentScroll}
          >
            <div className="mb-2 px-3 text-xs font-medium text-slate-600">
              Recent
            </div>

            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  activeRunIdRef.current = run.id;
                  setActivePage("chat");
                  setActiveRunId(run.id);
                  setProfileOpen(false);
                  setSidebarPeekOpen(false);
                }}
                className={[
                  "mb-0.5 flex min-h-9 w-full items-center rounded-md px-3 text-left text-sm transition-colors",
                  activePage === "chat" && run.id === activeRunId
                    ? "tk-glass-selected bg-white/[0.07] text-white"
                    : "text-slate-500 hover:bg-white/[0.045] hover:text-slate-200",
                ].join(" ")}
              >
                <span className="line-clamp-1 font-light">{run.title}</span>
              </button>
            ))}

            {runsLoading ? (
              <div className="flex items-center gap-2 px-3 py-5 text-xs text-slate-600">
                <Loader2 size={13} className="animate-spin" />
                Loading
              </div>
            ) : !runs.length ? (
              <div className="px-3 py-5 text-xs font-light text-slate-600">
                No chats yet.
              </div>
            ) : null}

            {runsLoadingMore ? (
              <div className="flex justify-center py-3 text-slate-600">
                <Loader2 size={13} className="animate-spin" />
              </div>
            ) : null}
          </div>

        <div className="relative px-3 py-4 border-t border-white/5">
          {profileOpen && identity.email && (
            <div className="tk-glass-float absolute bottom-[80px] left-3 right-3 rounded-2xl border border-white/10 bg-[#0A0A0A]/90 p-2">
              <div className="px-3 py-2">
                <div className="truncate text-sm font-medium text-white">
                  {identity.label || "Executive User"}
                </div>
                <div className="truncate text-xs text-slate-500 mt-0.5">
                  {identity.email}
                </div>
              </div>
              <div className="my-1 h-px bg-white/5" />
              <button
                type="button"
                onClick={() => {
                  setActivePage("configurations");
                  setProfileOpen(false);
                  setSidebarPeekOpen(false);
                }}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-300 transition-colors hover:bg-white/10"
              >
                <SlidersHorizontal size={15} strokeWidth={1.5} />
                Settings
              </button>
              <a
                href={LABOR_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-300 transition-colors hover:bg-white/10"
              >
                <Github size={15} strokeWidth={1.5} />
                Source code
                <ExternalLink
                  size={12}
                  strokeWidth={1.5}
                  className="ml-auto text-slate-600"
                />
              </a>
              <button
                type="button"
                onClick={logout}
                disabled={authBusy}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {authBusy ? (
                  <Loader2 className="animate-spin text-slate-400" size={15} />
                ) : (
                  <LogOut size={15} strokeWidth={1.5} />
                )}
                Sign Out
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            disabled={!identity.email}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 transition-colors hover:bg-white/5 disabled:cursor-default disabled:opacity-60"
          >
            {identity.photoURL ? (
              <img
                src={identity.photoURL}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/20"
              />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-slate-300">
                <UserRound size={15} strokeWidth={1.5} />
              </span>
            )}
            <span className="min-w-0 truncate text-sm font-medium text-slate-300">
              {identity.label || "Sign in"}
            </span>
          </button>
        </div>
      </aside>
      )}

      {!onboardingGateActive && (
        <button
          type="button"
          onClick={() => {
            if (sidebarPinnedOpen) {
              setSidebarPinnedOpen(false);
              setSidebarPeekOpen(false);
              setProfileOpen(false);
              return;
            }

            setSidebarPeekOpen(false);
            setSidebarPinnedOpen(true);
          }}
          className={[
            "tk-glass-control fixed left-4 top-4 z-50 grid h-8 w-8 place-items-center rounded-lg border border-white/5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200",
            sidebarOpen ? "bg-transparent" : "bg-[#0A0A0A]/60",
          ].join(" ")}
          aria-label={sidebarPinnedOpen ? "Close sidebar" : "Keep sidebar open"}
          title={sidebarPinnedOpen ? "Close sidebar" : "Keep sidebar open"}
        >
          {sidebarPinnedOpen ? (
            <PanelLeftClose size={18} strokeWidth={1.5} />
          ) : (
            <PanelLeftOpen size={18} strokeWidth={1.5} />
          )}
        </button>
      )}

      {!onboardingGateActive && activePage === "chat" && identity.email ? (
        <SessionConfigurationPopover
          activeRunId={activeRunId}
          messageId={sessionConfigurationMessageId}
          sidebarOpen={sidebarOpen}
          userDocId={userDocId}
        />
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col relative">
        {!sidebarOpen && !onboardingGateActive && (
          <div
            className="fixed inset-y-0 left-0 z-30 w-5 cursor-ew-resize bg-transparent"
            onPointerEnter={() => setSidebarPeekOpen(true)}
            aria-hidden="true"
          >
            <div className="h-full w-px bg-white/0 transition-colors" />
          </div>
        )}

        {activePage === "getstarted" || onboardingGateActive ? (
          <GetStarted
            identity={identity}
            userDocId={userDocId}
            onComplete={async () => {
              const nextDataPlane = await activateCustomerDataPlane({
                email: identity.email,
                userDocId,
                force: true,
              });
              if (!nextDataPlane.active) {
                throw new Error(
                  "Google Cloud must finish provisioning before Labor can continue."
                );
              }
              setDataPlane(nextDataPlane);
              setOnboardingComplete(true);
              setActivePage("chat");
            }}
          />
        ) : activePage === "configurations" ? (
          <Configurations
            identity={identity}
            userDocId={userDocId}
            required={false}
            onBack={() => setActivePage("chat")}
          />
        ) : activePage === "releases" ? (
          <Releases
            userDocId={userDocId}
            onOpenRun={(runId) => {
              activeRunIdRef.current = runId;
              setActiveRunId(runId);
              setActivePage("chat");
            }}
          />
        ) : activePage === "agent" ? (
          <Agent
            userDocId={userDocId.toLowerCase()}
            onOpenReleases={() => setActivePage("releases")}
            onOpenSettings={() => setActivePage("configurations")}
          />
        ) : activePage === "evolver" ? (
          <Evolver
            userDocId={userDocId.toLowerCase()}
            onOpenSettings={() => setActivePage("configurations")}
          />
        ) : (
        <div className="flex min-h-0 flex-1 relative z-10 w-full">
          <section className="relative flex min-w-0 w-full flex-col">
            <div
              className={[
                "tk-scrollbar flex-1 overflow-y-auto px-6 pt-20",
                isCodeWorkspaceMode ? "pb-8" : "pb-44",
              ].join(" ")}
            >
              <div className="mx-auto w-full">
                {emptyState ? (
                  <EmptyState
                    onPromptClick={setInputText}
                    onOpenEvolver={() => setActivePage("evolver")}
                  />
                ) : (
                  messages.map((message) => {
                    const proceedPending =
                      pendingGenerationMessageIds.includes(message.id);

                    return (
                      <MessageBlock
                        key={message.id}
                        message={message}
                        onProceed={() => proceedWithGeneration(message)}
                        proceedDisabled={
                          generationRunning ||
                          activeRunGenerationBlocked ||
                          proceedPending
                        }
                        proceedBusy={proceedPending}
                        generationAlreadyStarted={consumedGenerationMessageIds.has(
                          message.id
                        )}
                        userDocId={userDocId}
                        activeRunId={activeRunId}
                        onWorkspaceViewModeChange={setWorkspaceViewMode}
                        latestDeploymentMessageId={latestDeploymentMessageId}
                        latestDeploymentReplyRef={
                          message.id === latestDeploymentMessageId
                            ? latestDeploymentReplyRef
                            : null
                        }
                        onOpenReleases={() => setActivePage("releases")}
                      />
                    );
                  })
                )}
                <div ref={endRef} />
              </div>
            </div>

            {!isCodeWorkspaceMode && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/90 to-transparent px-4 pb-3 pt-24">
              <div className="pointer-events-auto mx-auto w-full max-w-3xl">
                {error && (
                  <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-md px-4 py-3 text-sm font-light text-red-200 shadow-lg">
                    {cloudSessionRepairing ? (
                      <Loader2
                        className="mt-0.5 shrink-0 animate-spin"
                        size={15}
                        strokeWidth={1.5}
                      />
                    ) : (
                      <AlertTriangle
                        className="mt-0.5 shrink-0"
                        size={15}
                        strokeWidth={1.5}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      {cloudSessionRepairing
                        ? "Labor is restoring access to your cloud workspace. Your run is safe."
                        : error}
                    </span>
                    {!cloudSessionRepairing &&
                    /cloud workspace|renew access|reconnect google cloud/i.test(
                      error
                    ) ? (
                      <button
                        type="button"
                        onClick={
                          cloudReconnectRequired
                            ? () => setActivePage("configurations")
                            : repairCloudSession
                        }
                        className="shrink-0 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.14]"
                      >
                        {cloudReconnectRequired
                          ? "Open Settings"
                          : "Restore access"}
                      </button>
                    ) : null}
                  </div>
                )}
                {activeRunGenerationBlocked ? (
                  <div className="mx-auto flex min-h-12 w-full max-w-xl items-center gap-3 rounded-2xl border border-amber-300/20 bg-[#1A1710]/90 px-4 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
                    <AlertTriangle
                      size={15}
                      strokeWidth={1.7}
                      className="shrink-0 text-amber-200"
                    />
                    <span className="min-w-0 flex-1 text-xs font-light leading-5 text-amber-100/75">
                      This session used its three generation repairs. Start a new
                      chat to continue without another retry loop.
                    </span>
                    <button
                      type="button"
                      onClick={startNewRun}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] font-medium text-black transition hover:bg-slate-200"
                    >
                      <MessageSquarePlus size={13} />
                      New chat
                    </button>
                  </div>
                ) : (
                <div
                  className={`tk-glass-composer mx-auto max-w-xl rounded-[1.65rem] border border-white/10 bg-[#1f1f1f] transition-all duration-300 ease-in-out focus-within:border-white/20 ${
                    isComposerExpanded
                      ? "flex flex-col px-3 py-2"
                      : "flex items-center px-2 py-1"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFilesSelected}
                  />

                  <ComposerAttachments
                    files={attachedFiles}
                    onRemove={removeAttachedFile}
                  />

                  {!isComposerExpanded && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
                      aria-label="Attach documents"
                      title="Attach documents"
                    >
                      <Paperclip size={16} strokeWidth={1.5} />
                    </button>
                  )}

                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(event) => setInputText(event.target.value)}
                    onKeyDown={submitOnEnter}
                    rows={isComposerExpanded ? undefined : 1}
                    placeholder="What are we building today?..."
                    className={`tk-composer-input tk-scrollbar max-h-28 min-h-6 w-full resize-none bg-transparent text-[15px] font-light leading-6 text-slate-200 outline-none placeholder:text-slate-500 ${
                      isComposerExpanded ? "px-2 pb-0 pt-1.5" : "px-2 py-1"
                    }`}
                  />

                  <div
                    className={
                      isComposerExpanded
                        ? "mt-1 flex h-9 w-full items-center justify-between"
                        : "flex shrink-0 items-center pl-1"
                    }
                  >
                    {isComposerExpanded && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
                        aria-label="Attach documents"
                        title="Attach documents"
                      >
                        <Paperclip size={16} strokeWidth={1.5} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={sendPrompt}
                      disabled={!inputText.trim() || isSending}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-black transition-all hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
                      aria-label="Submit"
                    >
                      {isSending ? (
                        <Loader2 className="animate-spin" size={16} strokeWidth={2} />
                      ) : (
                        <ArrowUp size={16} strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>
                )}


              </div>
            </div>
            )}
          </section>
        </div>
        )}
      </main>

      {identity.ready && !identity.email && (
        <LaborLoginExperience
          busy={authBusy}
          error={authError}
          onSignIn={signInWithGoogle}
        />
      )}

      <ChatSearchModal
        open={runSearchOpen}
        items={runSearchItems}
        loading={runSearchLoading}
        error={runSearchError}
        onClose={closeRunSearch}
        onSelect={selectRunFromSearch}
      />
    </div>
  );
}

function ChatSearchModal({
  open,
  items,
  loading,
  error,
  onClose,
  onSelect,
}) {
  const [searchText, setSearchText] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setSearchText("");
    const frameId = window.requestAnimationFrame(() => inputRef.current?.focus());

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  const results = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const matches = term
      ? items.filter((run) => run.title.toLowerCase().includes(term))
      : items;
    return matches.slice(0, 20);
  }, [items, searchText]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Search chats"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="tk-glass-float w-full max-w-xl overflow-hidden rounded-lg border border-white/[0.1] bg-[#111111]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search size={16} className="shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search recent chats"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
          {loading ? (
            <Loader2 size={14} className="animate-spin text-slate-600" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close search"
          >
            <X size={15} />
          </button>
        </div>

        <div className="tk-scrollbar max-h-[52vh] overflow-y-auto p-2">
          {error ? (
            <div className="px-3 py-3 text-xs text-red-300">{error}</div>
          ) : null}

          {results.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelect(run)}
              className="flex min-h-11 w-full items-center justify-between gap-4 rounded-md px-3 text-left transition-colors hover:bg-white/[0.06]"
            >
              <span className="min-w-0 truncate text-sm font-light text-slate-300">
                {run.title}
              </span>
              <span className="shrink-0 text-[11px] text-slate-600">
                {formatTime(run.updatedAtMs || run.createdAtMs)}
              </span>
            </button>
          ))}

          {!loading && !results.length ? (
            <div className="px-3 py-10 text-center text-xs text-slate-600">
              No matching chats.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPromptClick, onOpenEvolver }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 text-center">
      <div className="flex items-center gap-1.5">
        <LaborLogo
          decorative
          className="size-4 object-contain drop-shadow-[0_0_8px_rgba(255,38,54,0.22)]"
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Labor
        </p>
      </div>

      <h1 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-white sm:text-2xl">
        What should we build?
      </h1>

      <p className="mt-2 text-sm leading-5 text-slate-400">
        Describe your idea. I will build it and deploy it.
      </p>

      <button
        type="button"
        onClick={onOpenEvolver}
        className="group mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/[0.06] px-3.5 text-xs font-medium text-violet-200 transition hover:border-violet-300/30 hover:bg-violet-400/[0.11] hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-violet-300"
      >
        <Dna size={13} strokeWidth={1.7} />
        Let Evolver find an idea for me
        <ArrowRight
          size={12}
          className="text-violet-300/55 transition-transform group-hover:translate-x-0.5"
        />
      </button>

      <div className="mt-5 grid w-full grid-cols-2 gap-2 text-left">
        {STARTERS.map(({ type, label, prompt }) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPromptClick(prompt)}
            className="group flex h-11 min-w-0 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 transition hover:border-white/[0.13] hover:bg-white/[0.055] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
          >
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.09em] text-slate-600 transition group-hover:text-slate-500">
              {type}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-400 transition group-hover:text-slate-200">
              {label}
            </span>
            <ArrowRight
              size={11}
              className="shrink-0 -translate-x-1 text-slate-600 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
            />
          </button>
        ))}
      </div>

      <p className="mt-4 text-[10px] leading-4 text-slate-600">
        Large builds may cost $10+ in AI usage.
      </p>
    </div>
  );
}




function UserMessageText({ text }) {
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const content = String(text || "");

  useEffect(() => {
    setExpanded(false);
  }, [content]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || expanded) return undefined;

    const measureOverflow = () => {
      setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };
    const frameId = window.requestAnimationFrame(measureOverflow);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureOverflow);

    observer?.observe(element);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [content, expanded]);

  return (
    <>
      <div
        ref={contentRef}
        className={[
          "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          expanded ? "" : "tk-user-message-clamped",
        ].join(" ")}
      >
        {content}
      </div>

      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="ml-auto mt-1 grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse message" : "Expand message"}
          title={expanded ? "Collapse message" : "Expand message"}
        >
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      ) : null}
    </>
  );
}

function MessageBlock({
  message,
  onProceed,
  proceedDisabled,
  proceedBusy,
  generationAlreadyStarted,
  userDocId,
  activeRunId,
  onWorkspaceViewModeChange,
  latestDeploymentMessageId,
  latestDeploymentReplyRef,
  onOpenReleases,
}) {
  const baseReply = message.agentReply;
  const [credentialStatusOverride, setCredentialStatusOverride] = useState(null);
  const reply = useMemo(() => {
    if (!baseReply || !credentialStatusOverride) return baseReply;
    return {
      ...baseReply,
      jsonData: {
        ...(baseReply.jsonData || {}),
        thirdPartyCredentialStatus: credentialStatusOverride,
      },
    };
  }, [baseReply, credentialStatusOverride]);

  useEffect(() => {
    setCredentialStatusOverride(null);
  }, [baseReply?.updatedAtMs, message.id]);

  const isProceed = message.action === "proceed";
  const status = reply?.status || "";
  const actionType = reply?.jsonData?.actionType || "";
  const canProceed =
    (actionType === "confirm_problem" || actionType === "confirm_update") &&
    reply.requiresUserInput &&
    status !== "failed" &&
    thirdPartyCredentialsReady(reply);
  const hasStructuredConfirmation =
    actionType === "confirm_problem" || actionType === "confirm_update";
  const isAppGeneration = actionType === "app_generation";
  const isGeneratedAppReady = isAppGeneration && status === "completed";
  const isLatestGeneratedAppReady =
    isGeneratedAppReady && message.id === latestDeploymentMessageId;
  const proceedActionDisabled =
    proceedDisabled || generationAlreadyStarted;
  const canRetryGeneration =
    isAppGeneration &&
    status === "failed" &&
    !reply?.jsonData?.buildId &&
    !reply?.jsonData?.generationBlocked;

  return (
    <div className="mb-10 w-full max-w-6xl mx-auto">
      <div className="mx-auto mb-6 flex w-full max-w-4xl justify-end">
        <div className="tk-glass-message max-w-[80%] rounded-2xl rounded-tr-sm border border-white/5 bg-white/10 px-5 py-3.5 text-[15px] font-light leading-relaxed text-white">
          {isProceed ? (
            <span className="inline-flex items-center gap-2 font-medium">
              <Play size={14} fill="currentColor" />
              Executing Plan
            </span>
          ) : (
            <UserMessageText text={message.text} />
          )}
        </div>
      </div>

      {reply && (
        <>
          <div
            ref={isLatestGeneratedAppReady ? latestDeploymentReplyRef : null}
            className="mx-auto flex w-full max-w-4xl scroll-mt-5 gap-4"
          >
            <div className="tk-glass-control mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300">
              <Bot size={16} strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1 pt-1 w-full">
              {["processing", "thinking", "queued", "running"].includes(status) && (
                <div className="mb-3 flex items-center gap-3 text-sm font-light text-slate-500">
                  <Loader2 className="animate-spin text-slate-400" size={14} />
                  <span>{formatAgentPhase(reply.phase)}</span>
                </div>
              )}

              {hasStructuredConfirmation ? (
                <ConfirmationDetails reply={reply} />
              ) : (
                <div className="prose prose-invert max-w-none text-[15px] font-light leading-relaxed text-slate-300 prose-p:leading-relaxed prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {reply.finalTextMd || "Synthesizing response..."}
                  </ReactMarkdown>
                </div>
              )}

              {reply.error && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-light text-red-200">
                  {reply.error}
                </div>
              )}

              {hasStructuredConfirmation && (
                <ThirdPartyCredentialsPanel
                  reply={reply}
                  userDocId={userDocId}
                  activeRunId={activeRunId}
                  messageId={message.id}
                  onCredentialStatusChange={setCredentialStatusOverride}
                />
              )}

              {canProceed && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onProceed}
                    disabled={proceedActionDisabled}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-black transition-all hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
                  >
                    {proceedBusy ? (
                      <Loader2 className="animate-spin" size={16} strokeWidth={2} />
                    ) : (
                      <CheckCircle2 size={16} strokeWidth={2} />
                    )}
                    Proceed
                  </button>
                </div>
              )}

              {isAppGeneration && !isGeneratedAppReady && (
                <GenerationMeta
                  reply={reply}
                  userDocId={userDocId}
                  activeRunId={activeRunId}
                  messageId={message.id}
                  onViewModeChange={onWorkspaceViewModeChange}
                  onOpenReleases={onOpenReleases}
                />
              )}

              {canRetryGeneration && (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onProceed}
                    disabled={proceedActionDisabled}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-black transition-all hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
                  >
                    {proceedBusy ? (
                      <Loader2
                        className="animate-spin"
                        size={16}
                        strokeWidth={2}
                      />
                    ) : (
                      <RefreshCw size={16} strokeWidth={2} />
                    )}
                    Try Again
                  </button>
                </div>
              )}

              {!isAppGeneration && message.createdAtMs ? (
                <div className="mt-4 text-xs font-light text-slate-600">
                  {formatTime(message.createdAtMs)}
                </div>
              ) : null}
            </div>
          </div>

          {isLatestGeneratedAppReady && (
            <GenerationMeta
              reply={reply}
              userDocId={userDocId}
              activeRunId={activeRunId}
              messageId={message.id}
              onViewModeChange={onWorkspaceViewModeChange}
              onOpenReleases={onOpenReleases}
            />
          )}

          {isGeneratedAppReady && !isLatestGeneratedAppReady && (
            <SupersededDeploymentNotice
              reply={reply}
              userDocId={userDocId}
              activeRunId={activeRunId}
              messageId={message.id}
            />
          )}

          {isAppGeneration && message.createdAtMs ? (
            <div className="mx-auto mt-4 w-full max-w-4xl pl-12 text-xs font-light text-slate-600">
              {formatTime(message.createdAtMs)}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function SupersededDeploymentNotice({ reply, userDocId, activeRunId, messageId }) {
  const sourceZip = reply?.jsonData?.sourceZip || "";
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const downloadSourceZip = async () => {
    if (!sourceZip || downloading) return;

    setDownloading(true);
    setDownloadError("");

    try {
      const result = await callAppGenerationAgent({
        email: userDocId,
        runid: activeRunId,
        messageid: messageId,
        action: "get_source_zip_download_url",
        sourceZip,
      });
      if (!result?.downloadUrl) {
        throw new Error("No download URL was returned.");
      }

      const anchor = document.createElement("a");
      anchor.href = result.downloadUrl;
      anchor.download = "labor-source.zip";
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      setDownloadError(err.message || "Could not download this source ZIP.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-4xl pl-12">
      <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-light text-emerald-200">
        <CheckCircle2 size={15} strokeWidth={1.7} className="shrink-0" />
        <span>
          This deployment was superseded. The live preview is shown only on the
          latest deployment message.
        </span>
        {sourceZip ? (
          <button
            type="button"
            onClick={downloadSourceZip}
            disabled={downloading}
            className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-2.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15 disabled:text-emerald-100/45"
          >
            {downloading ? (
              <Loader2 className="animate-spin" size={13} />
            ) : (
              <File size={13} />
            )}
            Download ZIP
          </button>
        ) : null}
      </div>
      {downloadError ? (
        <div className="mt-2 text-xs text-red-200">{downloadError}</div>
      ) : null}
    </div>
  );
}

function ThirdPartyCredentialsPanel({
  reply,
  userDocId,
  activeRunId,
  messageId,
  onCredentialStatusChange,
}) {
  const requiredApis = getRequiredThirdPartyApis(reply);
  const credentialStatus = getThirdPartyCredentialStatus(reply);
  const validationResults = Array.isArray(credentialStatus?.validationResults)
    ? credentialStatus.validationResults
    : [];
  const [values, setValues] = useState({});
  const [apiContracts, setApiContracts] = useState({});
  const [helpOpen, setHelpOpen] = useState({});
  const [saving, setSaving] = useState(false);
  const [fallbackSaving, setFallbackSaving] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!requiredApis.length || credentialStatus?.ready) return null;

  const updateValue = (serviceId, fieldName, value) => {
    setValues((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [fieldName]: value,
      },
    }));
  };

  const updateApiContract = (serviceId, value) => {
    setApiContracts((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        rawText: value,
      },
    }));
  };

  const toggleHelp = (serviceId) => {
    setHelpOpen((prev) => ({
      ...prev,
      [serviceId]: !prev[serviceId],
    }));
  };

  const useLlmFallback = async (api) => {
    setFallbackSaving(api.serviceId);
    setError("");
    setSuccess("");

    try {
      const result = await callLaborAgent({
        email: userDocId,
        runid: activeRunId,
        messageid: messageId,
        action: "use_llm_fallback_for_third_party",
        requiredApis,
        serviceId: api.serviceId,
      });

      if (result?.credentialStatus) {
        onCredentialStatusChange?.(result.credentialStatus);
      }
      setSuccess(result?.message || "I will use the configured LLM fallback.");
    } catch (err) {
      setError(err.message || "Could not enable the LLM fallback.");
    } finally {
      setFallbackSaving("");
    }
  };

  const saveCredentials = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await callLaborAgent({
        email: userDocId,
        runid: activeRunId,
        messageid: messageId,
        action: "save_third_party_credentials",
        requiredApis,
        credentials: values,
        apiContracts,
      });

      if (result?.credentialStatus) {
        onCredentialStatusChange?.(result.credentialStatus);
      }
      setSuccess(result?.message || "API keys saved.");
    } catch (err) {
      setError(err.message || "Could not save API keys.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200">
          <KeyRound size={16} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="text-sm font-medium text-amber-100">
            External API setup
          </div>
          <p className="mt-1 text-sm font-light leading-6 text-amber-100/70">
            This app needs a live external service. Paste the real API request
            if you have it. When I can identify a reliable provider request, I
            can explain it; otherwise you can use the configured LLM fallback.
          </p>

          <div className="mt-4 grid min-w-0 gap-4">
            {requiredApis.map((api) => {
              const serviceStatus = credentialStatus?.services?.find(
                (item) => item.serviceId === api.serviceId
              );
              const validation = validationResults.find(
                (item) => item.serviceId === api.serviceId
              );
              const recommendation = api.providerRecommendation || {};
              const sampleCurl = getDisplaySampleCurl(api);
              const hasSuggestedApiContract =
                sampleCurl && !api.apiContractStatus?.needsUserProvidedApiContract;

              return (
                <div
                  key={api.serviceId}
                  className="tk-glass-card min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-white">
                      {api.serviceName}
                    </div>
                    {serviceStatus?.saved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">
                        <CheckCircle2 size={12} />
                        {serviceStatus.llmFallback
                          ? "Using LLM fallback"
                          : "Saved and validated"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 grid gap-2 text-xs font-light leading-5 text-slate-400">
                    {api.reason ? <p>{api.reason}</p> : null}
                    {api.howItWillBeUsed ? (
                      <p>
                        <span className="text-slate-300">Used for: </span>
                        {api.howItWillBeUsed}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-4 grid min-w-0 max-w-full gap-3 overflow-hidden">
                    <div className="tk-glass-card min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                      <div className="text-sm font-medium text-white">
                        Paste your API request
                      </div>
                      <p className="mt-1 text-xs font-light leading-5 text-slate-400">
                        Paste a cURL command, API docs snippet, or request and
                        response example. I will extract and validate the real
                        call before building.
                      </p>
                      <textarea
                        value={apiContracts?.[api.serviceId]?.rawText || ""}
                        onChange={(event) =>
                          updateApiContract(api.serviceId, event.target.value)
                        }
                        placeholder={[
                          "curl -X POST https://api.vendor.com/v1/generate \\",
                          "  -H \"Authorization: Bearer YOUR_API_KEY\" \\",
                          "  -H \"Content-Type: application/json\" \\",
                          "  -d '{\"prompt\":\"...\"}'",
                        ].join("\n")}
                        className="tk-glass-input mt-3 min-h-[190px] w-full min-w-0 resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-3 font-mono text-xs leading-5 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/50"
                      />
                    </div>

                    {hasSuggestedApiContract ? (
                      <button
                        type="button"
                        onClick={() => toggleHelp(api.serviceId)}
                        className="w-fit text-left text-sm font-medium text-sky-300 transition hover:text-sky-200"
                      >
                        I don't know what this is, you help me
                      </button>
                    ) : (
                      <div className="tk-glass-card rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs font-light leading-5 text-slate-400">
                          I could not determine a reliable production API
                          request for this service yet. Paste a cURL command or
                          API docs snippet above, or let me use the configured
                          LLM as a best-effort fallback.
                        </p>
                        <button
                          type="button"
                          onClick={() => useLlmFallback(api)}
                          disabled={fallbackSaving === api.serviceId}
                          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-sky-300 transition hover:text-sky-200 disabled:text-slate-500"
                        >
                          {fallbackSaving === api.serviceId ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : null}
                          I don't want to do it, you figure out
                        </button>
                      </div>
                    )}

                    {hasSuggestedApiContract && helpOpen[api.serviceId] ? (
                      <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-sky-300/15 bg-sky-300/[0.045] p-4">
                        <div className="text-sm font-medium text-white">
                          Since you want {api.serviceName.toLowerCase()}, it
                          needs {recommendation.productName || api.serviceName}.
                        </div>
                        <p className="mt-2 text-xs font-light leading-5 text-slate-300">
                          We need to call it through an API. I picked the most
                          likely provider for this scenario, and the API
                          documentation should look like this:
                        </p>

                        {sampleCurl ? (
                          <pre className="tk-scrollbar mt-3 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/35 p-3 text-[11px] leading-5 text-slate-300">
                            {sampleCurl}
                          </pre>
                        ) : (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-400">
                            I don't have a concrete sample request yet. Paste
                            any docs or request example above and I will extract
                            the real call.
                          </div>
                        )}

                        <p className="mt-3 text-xs font-light leading-5 text-slate-300">
                          If you see an API key in that request, sign up on the
                          provider's website, create the key, and paste it
                          here. I will take care of the rest.
                        </p>

                        {recommendation.apiKeyInstructions ? (
                          <p className="mt-2 text-xs font-light leading-5 text-sky-100/70">
                            {recommendation.apiKeyInstructions}
                          </p>
                        ) : null}

                        <div className="mt-3 grid gap-2">
                          {(api.credentialFields || []).map((field) => (
                            <label key={field.fieldName} className="grid gap-1">
                              <span className="text-xs text-slate-400">
                                {field.label || field.fieldName}
                              </span>
                              <input
                                type={field.secret === false ? "text" : "password"}
                                value={values?.[api.serviceId]?.[field.fieldName] || ""}
                                onChange={(event) =>
                                  updateValue(
                                    api.serviceId,
                                    field.fieldName,
                                    event.target.value
                                  )
                                }
                                placeholder={
                                  field.placeholder ||
                                  field.example ||
                                  "Paste API key for this provider"
                                }
                                className="tk-glass-input h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-sky-200/50"
                              />
                            </label>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => useLlmFallback(api)}
                          disabled={fallbackSaving === api.serviceId}
                          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sky-300 transition hover:text-sky-200 disabled:text-slate-500"
                        >
                          {fallbackSaving === api.serviceId ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : null}
                          I don't want to do it, you figure out
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {validation?.message ? (
                    <div
                      className={`mt-3 text-xs ${
                        validation.validated === false
                          ? "text-red-200"
                          : "text-emerald-200"
                      }`}
                    >
                      {validation.message}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveCredentials}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-100 px-4 text-sm font-medium text-black transition hover:bg-amber-50 disabled:bg-white/10 disabled:text-slate-500"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <KeyRound size={15} />}
              Validate and save
            </button>
            {credentialStatus?.ready ? (
              <span className="text-xs text-emerald-200">Ready to proceed.</span>
            ) : (
              <span className="text-xs text-amber-100/60">
                Proceed unlocks after the API contract and credentials are ready.
              </span>
            )}
          </div>

          {success ? <div className="mt-3 text-xs text-emerald-200">{success}</div> : null}
          {error ? <div className="mt-3 text-xs text-red-200">{error}</div> : null}
        </div>
      </div>
    </section>
  );
}

function ConfirmationDetails({ reply }) {
  const actionType = reply?.jsonData?.actionType || "";
  const solutionBlueprint =
    reply?.jsonData?.solutionBlueprint ||
    reply?.jsonData?.routerDecision?.solutionBlueprint ||
    null;
  const gameBlueprint =
    reply?.jsonData?.gameBlueprint ||
    reply?.jsonData?.routerDecision?.gameBlueprint ||
    null;
  const artworkBlueprint =
    reply?.jsonData?.artworkBlueprint ||
    reply?.jsonData?.routerDecision?.artworkBlueprint ||
    null;
  const problemStatement =
    reply?.jsonData?.problemStatement ||
    reply?.jsonData?.routerDecision?.problemStatement ||
    "";
  const potentialSolution =
    reply?.jsonData?.potentialSolution ||
    reply?.jsonData?.routerDecision?.potentialSolution ||
    "";
  const updateRequest = Array.isArray(reply?.jsonData?.updateRequest)
    ? reply.jsonData.updateRequest
    : [];
  const updateReasons = Array.isArray(reply?.jsonData?.updateReasons)
    ? reply.jsonData.updateReasons
    : [];
  const agentArchitecture =
    reply?.jsonData?.agentArchitecture ||
    reply?.jsonData?.routerDecision?.agentArchitecture ||
    null;
  if (solutionBlueprint?.solutionKind === "game") {
    return (
      <GameConfirmationDetails
        gameBlueprint={gameBlueprint}
        isUpdate={actionType === "confirm_update"}
        updateRequest={updateRequest}
        updateReasons={updateReasons}
      />
    );
  }

  if (solutionBlueprint?.solutionKind === "artwork") {
    return (
      <ArtworkConfirmationDetails
        artworkBlueprint={artworkBlueprint}
        isUpdate={actionType === "confirm_update"}
        updateRequest={updateRequest}
        updateReasons={updateReasons}
      />
    );
  }

  if (solutionBlueprint?.solutionKind === "ai_agent") {
    return (
      <AgentDesignConfirmation
        agentArchitecture={agentArchitecture}
        isUpdate={actionType === "confirm_update"}
        updateRequest={updateRequest}
        updateReasons={updateReasons}
      />
    );
  }

  if (actionType === "confirm_update") {
    return (
      <div className="grid gap-4">
        <section className="tk-glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Modification Directives
          </div>
          <ul className="mt-4 grid gap-3 text-[15px] font-light leading-relaxed text-slate-300">
            {(updateRequest.length
              ? updateRequest
              : ["Apply updates to existing architecture based on current parameters."]
            ).map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="tk-glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Strategic Impact
          </div>
          <ul className="mt-4 grid gap-3 text-[15px] font-light leading-relaxed text-slate-300">
            {(updateReasons.length
              ? updateReasons
              : ["Aligns system behavior with specified executive workflows."]
            ).map((item, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm font-light text-slate-400">
          Review the parameters above. Click <span className="font-medium text-white">Proceed</span> to iterate the environment.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="tk-glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          Problem Definition
        </div>
        <p className="mt-3 text-[15px] font-light leading-relaxed text-slate-300">
          {problemStatement || "Validating business requirement constraints."}
        </p>
      </section>

      <section className="tk-glass-card rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          Proposed Architecture
        </div>
        <p className="mt-3 text-[15px] font-light leading-relaxed text-slate-300">
          {potentialSolution ||
            "A purpose-built interface designed to resolve the identified operational bottleneck."}
        </p>
      </section>

      <p className="text-sm font-light text-slate-400">
        Review the parameters above. Click <span className="font-medium text-white">Proceed</span> to provision the application.
      </p>
    </div>
  );
}

function GameConfirmationDetails({
  gameBlueprint,
  isUpdate,
  updateRequest,
  updateReasons,
}) {
  const game = gameBlueprint && typeof gameBlueprint === "object"
    ? gameBlueprint
    : {};
  const list = (value, limit = 6) => (
    Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : []
  );
  const mechanics = list(game.mechanics, 6);
  const enemies = list(game.enemies, 5);
  const progression = list(game.progression, 5);
  const coreLoop = list(game.coreLoop, 6);
  const desktopControls = list(game.movement?.desktopControls, 4);
  const mobileControls = list(game.movement?.mobileControls, 4);
  const stack = [
    ["Engine", game.techStack?.engine?.name, game.techStack?.engine?.packageName],
    ["Assets", game.techStack?.runtimeAssets?.format, ""],
    ["Physics", game.techStack?.physics?.name, game.techStack?.physics?.packageName],
    ["State", game.techStack?.state?.name, game.techStack?.state?.packageName],
    ["Audio", game.techStack?.audio?.name, game.techStack?.audio?.packageName],
  ];

  return (
    <div className="grid gap-4">
      {isUpdate && (
        <section className="border-l border-amber-200/30 pl-4">
          <div className="text-[10px] font-semibold uppercase text-amber-100/60">
            Game update
          </div>
          <div className="mt-2 grid gap-1.5 text-sm font-light leading-6 text-slate-300">
            {(updateRequest.length ? updateRequest : ["Apply the confirmed gameplay update."])
              .slice(0, 5)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="flex gap-2">
                  <span className="text-slate-600">{index + 1}.</span>
                  <span>{item}</span>
                </div>
              ))}
          </div>
          {updateReasons.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {updateReasons.slice(0, 3).join(" ")}
            </p>
          )}
        </section>
      )}

      <section className="tk-glass-panel overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.018]">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                Game plan
              </div>
              <h3 className="mt-1 truncate text-lg font-medium text-white">
                {game.title || "Playable game"}
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
              {[game.dimension?.toUpperCase(), game.genre, game.perspective]
                .filter(Boolean)
                .map((item) => (
                  <span key={item} className="rounded border border-white/[0.08] px-2 py-1">
                    {item}
                  </span>
                ))}
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm font-light leading-6 text-slate-300">
            {game.concept || "A polished, complete gameplay loop built for immediate play."}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            {game.objective && <span><b className="font-medium text-slate-400">Win:</b> {game.objective}</span>}
            {game.loseCondition && <span><b className="font-medium text-slate-400">Lose:</b> {game.loseCondition}</span>}
            {game.sessionLength && <span><b className="font-medium text-slate-400">Session:</b> {game.sessionLength}</span>}
          </div>
        </div>

        <div className="grid border-t border-white/[0.06] md:grid-cols-2">
          <div className="px-5 py-4 md:border-r md:border-white/[0.06]">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Core loop</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
              {(coreLoop.length ? coreLoop : ["Play", "Adapt", "Progress", "Replay"])
                .map((item, index) => (
                  <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5">
                    {index > 0 && <span className="text-slate-700">/</span>}
                    <span>{item}</span>
                  </span>
                ))}
            </div>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 md:border-t-0">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Movement</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {game.movement?.model || "Responsive direct control"}
              {game.movement?.camera ? `; ${game.movement.camera}` : ""}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              {[desktopControls.join(", "), mobileControls.join(", ")]
                .filter(Boolean)
                .join(" | ") || "Keyboard and touch controls"}
            </p>
          </div>
        </div>

        <div className="grid border-t border-white/[0.06] lg:grid-cols-3">
          <CompactGameList
            title="Mechanics"
            items={mechanics.map((item) => ({
              title: item?.name,
              detail: item?.description,
            }))}
          />
          <CompactGameList
            title="Enemies and hazards"
            items={enemies.map((item) => ({
              title: item?.name,
              detail: item?.behavior || item?.playerImpact,
            }))}
            className="border-t border-white/[0.06] lg:border-l lg:border-t-0"
          />
          <CompactGameList
            title="Progression"
            items={progression.map((item) => ({
              title: item?.stage,
              detail: [item?.difficulty, item?.changes].filter(Boolean).join(" - "),
            }))}
            className="border-t border-white/[0.06] lg:border-l lg:border-t-0"
          />
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4">
          <div className="text-[10px] font-semibold uppercase text-slate-500">Art direction</div>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            {[game.artDirection?.style, game.artDirection?.palette, game.artDirection?.effects]
              .filter(Boolean)
              .join(". ") || "Cohesive procedural visuals, readable silhouettes, and polished feedback."}
          </p>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4">
          <div className="text-[10px] font-semibold uppercase text-slate-500">Selected stack</div>
          <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
            {stack.map(([label, value, packageName]) => (
              <div key={label} className="min-w-0">
                <div className="text-[10px] text-slate-600">{label}</div>
                <div className="mt-0.5 break-words text-xs text-slate-300">
                  {value || "Built-in"}
                </div>
                {packageName && (
                  <div className="mt-0.5 break-all font-mono text-[9px] text-slate-600">
                    {packageName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="text-sm font-light text-slate-400">
        Click <span className="font-medium text-white">Proceed</span> to build and deploy the playable game.
      </p>
    </div>
  );
}

function CompactGameList({ title, items, className = "" }) {
  const visibleItems = Array.isArray(items)
    ? items.filter((item) => item?.title || item?.detail).slice(0, 4)
    : [];

  return (
    <div className={`min-w-0 px-5 py-4 ${className}`}>
      <div className="text-[10px] font-semibold uppercase text-slate-500">{title}</div>
      <div className="mt-2 grid gap-2">
        {(visibleItems.length ? visibleItems : [{ title: "Adaptive challenge", detail: "Introduced through the playable loop." }])
          .map((item, index) => (
            <div key={`${item.title}-${index}`} className="min-w-0 text-xs leading-5">
              <span className="text-slate-300">{item.title}</span>
              {item.detail && <span className="mt-0.5 line-clamp-2 text-slate-600">{item.detail}</span>}
            </div>
          ))}
      </div>
    </div>
  );
}

function ArtworkConfirmationDetails({
  artworkBlueprint,
  isUpdate,
  updateRequest,
  updateReasons,
}) {
  const artwork = artworkBlueprint && typeof artworkBlueprint === "object"
    ? artworkBlueprint
    : {};
  const list = (value, limit = 6) => (
    Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : []
  );
  const phases = list(artwork.scenePhases, 6);
  const elements = list(artwork.visualElements, 6);
  const interactions = list(artwork.interactions, 5);
  const timeline = list(artwork.timeline, 6);
  const transitions = list(artwork.transitions, 5);
  const stack = [
    ["Renderer", artwork.techStack?.primaryRenderer?.name, artwork.techStack?.primaryRenderer?.packageName],
    ["Animation", artwork.techStack?.animation?.name, artwork.techStack?.animation?.packageName],
    ["Physics", artwork.techStack?.physics?.name, artwork.techStack?.physics?.packageName],
    ["State", artwork.techStack?.state?.name, artwork.techStack?.state?.packageName],
    ["Audio", artwork.techStack?.audio?.name, artwork.techStack?.audio?.packageName],
  ];
  const Detail = ({ label, children }) => (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase text-slate-600">{label}</div>
      <div className="mt-1 text-xs font-light leading-5 text-slate-300">{children || "Not required"}</div>
    </div>
  );

  return (
    <div className="grid gap-4">
      {isUpdate && (
        <section className="border-l border-cyan-200/30 pl-4">
          <div className="text-[10px] font-semibold uppercase text-cyan-100/60">
            Artwork update
          </div>
          <div className="mt-2 grid gap-1.5 text-sm font-light leading-6 text-slate-300">
            {(updateRequest.length ? updateRequest : ["Apply the confirmed visual update."])
              .slice(0, 5)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="flex gap-2">
                  <span className="text-slate-600">{index + 1}.</span>
                  <span>{item}</span>
                </div>
              ))}
          </div>
          {updateReasons.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {updateReasons.slice(0, 3).join(" ")}
            </p>
          )}
        </section>
      )}

      <section className="tk-glass-panel overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.018]">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                Artwork direction
              </div>
              <h3 className="mt-1 truncate text-lg font-medium text-white">
                {artwork.title || "Code-generated artwork"}
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
              {[
                artwork.medium?.dimension?.toUpperCase(),
                String(artwork.techStack?.profile || "").replace(/_/g, " "),
                ...list(artwork.experienceTypes, 2),
              ].filter(Boolean).map((item) => (
                <span key={item} className="rounded border border-white/[0.08] px-2 py-1">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm font-light leading-6 text-slate-300">
            {artwork.briefConcept || "A complete browser-native visual experience with an authored premise and continuous rendering."}
          </p>
          <p className="mt-2 text-xs font-light leading-5 text-slate-500">
            {artwork.narrativePremise || "The visual system evolves through a deliberate sequence of states."}
          </p>
        </div>

        <div className="grid border-t border-white/[0.06] md:grid-cols-3">
          <div className="px-5 py-4 md:col-span-2 md:border-r md:border-white/[0.06]">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Scene and phase structure</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(phases.length ? phases : [{ name: "Continuous composition", visualState: "One evolving visual state" }])
                .map((phase, index) => (
                  <div key={`${phase?.name}-${index}`} className="min-w-0 border-l border-white/[0.08] pl-3">
                    <div className="truncate text-xs text-slate-200">{phase?.name || `Phase ${index + 1}`}</div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                      {phase?.visualState || phase?.motion}
                    </p>
                    {phase?.duration && <div className="mt-1 text-[9px] text-slate-700">{phase.duration}</div>}
                  </div>
                ))}
            </div>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 md:border-t-0">
            <Detail label="Medium">
              {[artwork.medium?.surface, artwork.medium?.presentation].filter(Boolean).join(". ")}
            </Detail>
          </div>
        </div>

        <div className="grid border-t border-white/[0.06] lg:grid-cols-3">
          <div className="px-5 py-4 lg:border-r lg:border-white/[0.06]">
            <Detail label="Main subject">
              {[artwork.mainSubject?.description, artwork.mainSubject?.appearance, artwork.mainSubject?.behavior]
                .filter(Boolean)
                .join(". ")}
            </Detail>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 lg:border-r lg:border-t-0 lg:border-white/[0.06]">
            <Detail label="Environment">
              {[artwork.environment?.description, artwork.environment?.spatialStructure]
                .filter(Boolean)
                .join(". ")}
            </Detail>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 lg:border-t-0">
            <div className="text-[10px] font-semibold uppercase text-slate-600">Visual elements</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
              {(elements.length ? elements : [{ name: "Procedural focal form" }])
                .map((item, index) => (
                  <span key={`${item?.name}-${index}`} title={item?.role || item?.appearance || ""}>
                    {item?.name || item?.role}
                  </span>
                ))}
            </div>
          </div>
        </div>

        <div className="grid border-t border-white/[0.06] md:grid-cols-3">
          <div className="px-5 py-4 md:border-r md:border-white/[0.06]">
            <Detail label="Motion design">
              {[artwork.motionDesign?.choreography, artwork.motionDesign?.simulation, artwork.motionDesign?.looping]
                .filter(Boolean)
                .join(". ")}
            </Detail>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 md:border-r md:border-t-0 md:border-white/[0.06]">
            <Detail label="Interaction">
              {interactions.map((item) => `${item?.input}: ${item?.response}`).filter(Boolean).join("; ") || artwork.techStack?.interaction}
            </Detail>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 md:border-t-0">
            <Detail label="Camera">
              {[artwork.camera?.type, artwork.camera?.behavior].filter(Boolean).join(". ")}
            </Detail>
          </div>
        </div>

        <details className="group border-t border-white/[0.06] px-5 py-4">
          <summary className="cursor-pointer list-none text-xs text-slate-400 transition hover:text-white">
            Timeline, transitions and generative rules
          </summary>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            <Detail label="Timeline">
              {timeline.map((item) => `${item?.phase}: ${item?.action}`).filter(Boolean).join("; ")}
            </Detail>
            <Detail label="Transitions">
              {transitions.map((item) => item?.technique).filter(Boolean).join("; ")}
            </Detail>
            <Detail label="Generative system">
              {[
                artwork.generativeRules?.seedStrategy,
                ...list(artwork.generativeRules?.algorithms, 3),
              ].filter(Boolean).join("; ")}
            </Detail>
          </div>
        </details>

        <div className="grid border-t border-white/[0.06] md:grid-cols-3">
          <div className="px-5 py-4 md:col-span-2 md:border-r md:border-white/[0.06]">
            <Detail label="Art direction">
              {[
                artwork.artDirection?.style,
                list(artwork.artDirection?.palette, 5).join(", "),
                artwork.artDirection?.shapeLanguage,
                artwork.artDirection?.lighting,
                ...list(artwork.artDirection?.effects, 3),
              ].filter(Boolean).join(". ")}
            </Detail>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 md:border-t-0">
            <Detail label="Audio direction">
              {artwork.audioDirection?.enabled
                ? [artwork.audioDirection?.source, artwork.audioDirection?.behavior, artwork.audioDirection?.reactivity]
                    .filter(Boolean)
                    .join(". ")
                : "Visual-first; complete without audio"}
            </Detail>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Exact JavaScript stack</div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
                {stack.map(([label, value, packageName]) => (
                  <div key={label} className="min-w-[100px] max-w-[180px]">
                    <div className="text-[9px] text-slate-600">{label}</div>
                    <div className="mt-0.5 break-words text-xs text-slate-300">{value || "Browser native"}</div>
                    {packageName && <div className="mt-0.5 break-all font-mono text-[9px] text-slate-600">{packageName}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-right text-[10px] leading-5 text-slate-600">
              <div>{artwork.performance?.targetFps || 60} fps target</div>
              <div>DPR {artwork.performance?.dprLimit || 2} max</div>
              <div>{artwork.performance?.maxObjects || 2000} object budget</div>
            </div>
          </div>
        </div>
      </section>

      <p className="text-sm font-light text-slate-400">
        Click <span className="font-medium text-white">Proceed</span> to build and deploy the complete artwork.
      </p>
    </div>
  );
}

function AgentDesignConfirmation({
  agentArchitecture,
  isUpdate,
  updateRequest,
  updateReasons,
}) {
  const agent = agentArchitecture && typeof agentArchitecture === "object"
    ? agentArchitecture
    : {};
  const list = (value, limit = 8) => (
    Array.isArray(value) ? value.filter(Boolean).slice(0, limit) : []
  );
  const successCriteria = list(agent.successCriteria, 5);
  const triggers = list(agent.triggers, 5);
  const agents = list(agent.agents, 8);
  const skills = list(agent.skills, 8);
  const tools = list(agent.tools, 8);
  const memory = list(agent.memory, 6);
  const outputs = list(agent.outputs, 6);
  const approvals = list(agent.approvalRules, 5);
  const modeLabel = agent.mode === "multi" ? "Multi-agent system" : "Single agent";
  const functionStack = [
    agent.functionArchitecture?.orchestratorFunction,
    agent.functionArchitecture?.executionFunction,
    ...list(agent.functionArchitecture?.observerFunctions, 4).map(
      (item) => item?.functionName
    ),
  ].filter(Boolean);

  return (
    <div className="grid gap-4">
      {isUpdate && (
        <section className="border-l border-cyan-200/30 pl-4">
          <div className="text-[10px] font-semibold uppercase text-cyan-100/60">
            Agent update
          </div>
          <div className="mt-2 grid gap-1.5 text-sm font-light leading-6 text-slate-300">
            {(updateRequest.length ? updateRequest : ["Apply the confirmed agent update."])
              .slice(0, 5)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="flex gap-2">
                  <span className="text-slate-600">{index + 1}.</span>
                  <span>{item}</span>
                </div>
              ))}
          </div>
          {updateReasons.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {updateReasons.slice(0, 3).join(" ")}
            </p>
          )}
        </section>
      )}

      <section className="tk-glass-panel overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.018]">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase text-slate-500">
                Agent design
              </div>
              <h3 className="mt-1 text-lg font-medium text-white">
                {agent.name || "Focused workflow agent"}
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
              <span className="rounded border border-cyan-100/10 bg-cyan-200/[0.04] px-2 py-1 text-cyan-100/70">
                {modeLabel}
              </span>
              {agent.executionModel?.executionMode && (
                <span className="rounded border border-white/[0.08] px-2 py-1">
                  {agent.executionModel.executionMode}
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm font-light leading-6 text-slate-300">
            {agent.briefConcept || "A bounded specialist that receives work, completes it, and reports a verified result."}
          </p>
          {agent.domain && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="text-slate-400">Expertise:</span> {agent.domain}
            </p>
          )}
        </div>

        <div className="grid border-t border-white/[0.06] md:grid-cols-2">
          <div className="px-5 py-4 md:border-r md:border-white/[0.06]">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Goal</div>
            <p className="mt-2 text-sm font-light leading-6 text-slate-300">
              {agent.goal || "Complete the confirmed outcome and save a usable result."}
            </p>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 md:border-t-0">
            <div className="text-[10px] font-semibold uppercase text-slate-500">
              Success
            </div>
            <CompactAgentItems
              items={successCriteria.map((item) => ({
                title: item?.metric,
                detail: item?.target,
              }))}
              fallback="The owned outcome is verified and saved."
            />
          </div>
        </div>

        <div className="grid border-t border-white/[0.06] lg:grid-cols-3">
          <div className="px-5 py-4">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Triggers</div>
            <CompactAgentItems
              items={triggers.map((item) => ({
                title: String(item?.type || "").replace(/_/g, " "),
                detail: [item?.source, item?.event].filter(Boolean).join(" - "),
              }))}
              fallback="User starts work from the agent interface."
            />
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 lg:border-l lg:border-t-0">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Execution</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {agent.executionModel?.pattern || "Bounded plan, act, verify, and report"}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              Up to {agent.executionModel?.maxModelIterations || 6} model steps and {agent.executionModel?.maxToolCalls || 12} tool calls
            </p>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-4 lg:border-l lg:border-t-0">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Model and compute</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              {[agent.modelAndCompute?.model, agent.modelAndCompute?.reasoningLevel]
                .filter(Boolean)
                .join(" - ") || "Configured preferred model"}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              {agent.modelAndCompute?.contextStrategy || "Only relevant run context is sent to the model."}
            </p>
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase text-slate-500">
              {agent.mode === "multi" ? "Agent team" : "Agent role"}
            </div>
            <div className="text-[10px] text-slate-600">
              {agents.length || 1} logical {agents.length === 1 ? "agent" : "agents"}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {(agents.length ? agents : [{ displayName: agent.name, goal: agent.goal }])
              .map((item, index) => (
                <div key={item?.agentId || `${item?.displayName}-${index}`} className="min-w-0 rounded border border-white/[0.06] bg-black/10 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-slate-200">
                      {item?.displayName || `Agent ${index + 1}`}
                    </span>
                    <span className="shrink-0 text-[9px] text-cyan-100/50">
                      {item?.executionMode || "hybrid"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                    {item?.goal || item?.role}
                  </p>
                </div>
              ))}
          </div>
        </div>

        <div className="grid border-t border-white/[0.06] md:grid-cols-2">
          <AgentDesignDisclosure title="Skills and tools">
            <AgentLabelList title="Skills" items={skills.map((item) => item?.name)} />
            <AgentLabelList title="Tools" items={tools.map((item) => item?.name)} />
          </AgentDesignDisclosure>
          <AgentDesignDisclosure title="Context and memory" className="md:border-l md:border-white/[0.06]">
            <AgentLabelList title="Inputs" items={agent.inputsAndContext?.triggerInputs} />
            <AgentLabelList title="Memory" items={memory.map((item) => item?.type)} />
          </AgentDesignDisclosure>
          <AgentDesignDisclosure title="Autonomy and communication" className="border-t border-white/[0.06]">
            <p className="text-xs leading-5 text-slate-400">
              <span className="text-slate-300">{agent.autonomy?.level || "Bounded autonomous"}.</span>{" "}
              {agent.communication?.finalPresentation || "Results and progress appear in the application."}
            </p>
            <AgentLabelList title="Can do independently" items={agent.autonomy?.independentActions} />
            <AgentLabelList title="Channels" items={agent.communication?.channels} />
            <AgentLabelList
              title={approvals.length ? "Approval required" : "Approvals"}
              items={approvals.length ? approvals.map((item) => item?.action) : ["No routine approval steps"]}
            />
          </AgentDesignDisclosure>
          <AgentDesignDisclosure title="Outputs and operations" className="border-t border-white/[0.06] md:border-l md:border-white/[0.06]">
            <AgentLabelList title="Outputs" items={outputs.map((item) => item?.name)} />
            <AgentLabelList title="Functions" items={functionStack} mono />
          </AgentDesignDisclosure>
          <AgentDesignDisclosure title="Failure and observability" className="border-t border-white/[0.06]">
            <p className="text-xs leading-5 text-slate-400">
              Up to {agent.failureHandling?.maxAttempts || 3} attempts. {agent.failureHandling?.recovery || "Retry transient failures and resume from the latest checkpoint."}
            </p>
            <AgentLabelList title="Events" items={agent.observability?.events} />
            {agent.observability?.costTracking && (
              <p className="text-[10px] leading-5 text-slate-600">
                {agent.observability.costTracking}
              </p>
            )}
          </AgentDesignDisclosure>
          <AgentDesignDisclosure title="Selected stack" className="border-t border-white/[0.06] md:border-l md:border-white/[0.06]">
            <AgentLabelList
              title="Runtime"
              items={[
                agent.techStack?.frontend,
                agent.techStack?.orchestrator,
                agent.techStack?.execution,
                agent.techStack?.database,
                agent.techStack?.storage,
                agent.techStack?.modelTransport,
              ]}
            />
          </AgentDesignDisclosure>
        </div>
      </section>

      <p className="text-sm font-light text-slate-400">
        Click <span className="font-medium text-white">Proceed</span> to build and deploy the working agent.
      </p>
    </div>
  );
}

function CompactAgentItems({ items, fallback }) {
  const visible = Array.isArray(items)
    ? items.filter((item) => item?.title || item?.detail).slice(0, 5)
    : [];

  return (
    <div className="mt-2 grid gap-1.5">
      {(visible.length ? visible : [{ title: fallback, detail: "" }]).map((item, index) => (
        <div key={`${item.title}-${index}`} className="text-xs leading-5">
          <span className="text-slate-300">{item.title}</span>
          {item.detail && <span className="text-slate-600">: {item.detail}</span>}
        </div>
      ))}
    </div>
  );
}

function AgentDesignDisclosure({ title, children, className = "" }) {
  return (
    <details className={`group px-5 py-4 [&::-webkit-details-marker]:hidden ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-semibold uppercase text-slate-500">
        {title}
        <span className="text-sm font-light text-slate-700 transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 grid gap-3">{children}</div>
    </details>
  );
}

function AgentLabelList({ title, items, mono = false }) {
  const visible = Array.isArray(items) ? items.filter(Boolean).slice(0, 8) : [];
  if (!visible.length) return null;

  return (
    <div>
      <div className="text-[9px] uppercase text-slate-700">{title}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {visible.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={`max-w-full break-words rounded border border-white/[0.06] px-2 py-1 text-[10px] text-slate-400 ${mono ? "font-mono" : ""}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function InstantToolbarTooltip({ label, children }) {
  return (
    <span className="tk-instant-tooltip">
      {children}
      <span className="tk-instant-tooltip-label" role="tooltip">
        {label}
      </span>
    </span>
  );
}

function GenerationMeta({
  reply,
  userDocId,
  activeRunId,
  messageId,
  onViewModeChange,
  onOpenReleases,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState("preview");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [previewDiagnostics, setPreviewDiagnostics] = useState([]);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairError, setRepairError] = useState("");
  const [runtimeRepairBusy, setRuntimeRepairBusy] = useState(false);
  const [runtimeRepairError, setRuntimeRepairError] = useState("");
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseSummary, setReleaseSummary] = useState(null);
  const previewUrl = String(reply.jsonData?.previewUrl || "").trim();
  const buildId = reply.jsonData?.buildId;
  const sourceZip = reply.jsonData?.sourceZip || "";
  const done = reply.status === "completed";
  const failureKind = String(reply.jsonData?.failureKind || "");
  const generationValidationFailure =
    failureKind === "generation_validation";
  const deploymentRepairAvailable =
    reply.jsonData?.repairAvailable !== false && Boolean(buildId);
  const runtimeErrors = useMemo(
    () =>
      previewDiagnostics.filter(
        (item) =>
          item?.level === "error" &&
          ["runtime-error", "unhandled-rejection", "console-error"].includes(
            String(item?.type || "")
          )
      ),
    [previewDiagnostics]
  );
  const repairableRuntimeErrors = runtimeErrors.length
    ? runtimeErrors
    : Array.isArray(reply.jsonData?.runtimeErrors)
      ? reply.jsonData.runtimeErrors
      : [];

  const showGeneratedCode = () => {
    setViewMode("code");
    onViewModeChange?.("code");
  };

  const showDeployment = () => {
    setViewMode("preview");
    onViewModeChange?.("preview");
  };

  const fixAndRedeploy = async () => {
    if (repairBusy || !userDocId || !activeRunId || !messageId) return;
    if (!buildId) {
      setRepairError(
        "Cloud Build did not start, so there is no failed deployment to repair."
      );
      return;
    }

    setRepairBusy(true);
    setRepairError("");
    setViewMode("preview");
    onViewModeChange?.("preview");

    try {
      const result = await callAppGenerationAgent({
        action: "fix_failed_deployment",
        email: userDocId,
        runid: activeRunId,
        messageid: messageId,
        buildId: reply.jsonData?.buildId || "",
        sourceZip,
      });
      setPreviewNonce(Date.now());
      if (result?.previewUrl) showDeployment();
    } catch (err) {
      setRepairError(err.message || "Could not repair this deployment.");
    } finally {
      setRepairBusy(false);
    }
  };

  const fixRuntimeErrors = async () => {
    if (
      runtimeRepairBusy ||
      !userDocId ||
      !activeRunId ||
      !messageId ||
      !repairableRuntimeErrors.length
    ) {
      return;
    }

    setRuntimeRepairBusy(true);
    setRuntimeRepairError("");

    try {
      const result = await callAppGenerationAgent({
        action: "fix_runtime_errors",
        email: userDocId,
        runid: activeRunId,
        messageid: messageId,
        sourceZip,
        runtimeErrors: repairableRuntimeErrors.map((item) => ({
          type: String(item?.type || "runtime-error"),
          level: String(item?.level || "error"),
          message: String(item?.message || "Unknown runtime error"),
          stack: String(item?.stack || ""),
          filename: String(item?.filename || ""),
          lineno: Number(item?.lineno || 0) || null,
          colno: Number(item?.colno || 0) || null,
          timestamp: Number(item?.timestamp || 0) || Date.now(),
        })),
      });
      setPreviewDiagnostics([]);
      setDiagnosticsOpen(false);
      setPreviewNonce(Date.now());
      if (result?.previewUrl) showDeployment();
    } catch (err) {
      setRuntimeRepairError(
        err.message || "Could not repair the runtime errors."
      );
    } finally {
      setRuntimeRepairBusy(false);
    }
  };

  useEffect(() => {
    if (!done) return undefined;

    let previewOrigin = "";
    try {
      previewOrigin = new URL(previewUrl).origin;
    } catch {
      previewOrigin = "";
    }

    const handleMessage = (event) => {
      if (previewOrigin && event.origin !== previewOrigin) return;
      const data = event.data || {};
      if (!["labor-preview", "forwardrun-preview"].includes(data.source)) return;

      if (data.type === "runtime-ready") {
        setPreviewDiagnostics((items) => [
          ...items.filter((item) => item.type !== "runtime-ready"),
          {
            id: `ready_${Date.now()}`,
            type: "runtime-ready",
            level: "info",
            message: "Preview runtime loaded.",
            timestamp: data.timestamp || Date.now(),
          },
        ]);
        return;
      }

      if (!["runtime-error", "unhandled-rejection", "console-error"].includes(data.type)) {
        return;
      }

      setPreviewDiagnostics((items) => [
        {
          id: `${data.type}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          type: data.type,
          level: data.level || "error",
          message: String(data.message || "Unknown preview runtime error"),
          stack: String(data.stack || ""),
          filename: String(data.filename || ""),
          lineno: data.lineno || null,
          colno: data.colno || null,
          timestamp: data.timestamp || Date.now(),
        },
        ...items,
      ].slice(0, 30));
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [done, previewUrl]);

  useEffect(() => {
    setPreviewDiagnostics([]);
    setDiagnosticsOpen(false);
  }, [buildId, previewNonce]);

  useEffect(() => {
    if (!done || !userDocId || !activeRunId) {
      setReleaseSummary(null);
      return undefined;
    }

    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, "releases", activeRunId),
      (snapshot) => {
        setReleaseSummary(
          snapshot.exists()
            ? { id: snapshot.id, ...(snapshot.data() || {}) }
            : null
        );
      },
      () => setReleaseSummary(null)
    );
  }, [activeRunId, done, userDocId]);

  if (!done && viewMode === "code" && sourceZip) {
    const codeContainerClasses = isFullscreen
      ? "tk-glass-editor fixed inset-4 z-50 overflow-hidden rounded-3xl border border-white/10 bg-[#050505] shadow-[0_0_80px_rgba(0,0,0,0.8)]"
      : "tk-glass-editor relative mt-6 h-[620px] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#080808] shadow-2xl";

    return (
      <>
        {isFullscreen ? (
          <div
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsFullscreen(false)}
          />
        ) : null}
        <div className={codeContainerClasses}>
          <GeneratedCodeWorkspace
            userDocId={userDocId}
            runId={activeRunId}
            reply={reply}
            previewUrl={previewUrl}
            onPreview={showDeployment}
            onDeployed={() => setPreviewNonce(Date.now())}
            previewControlLabel="Deployment logs"
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((current) => !current)}
          />
        </div>
      </>
    );
  }

  if (!done) {
    return (
      <CloudBuildLogPanel
        reply={reply}
        className="mt-6 w-full"
        onViewCode={sourceZip ? showGeneratedCode : undefined}
        onFixAndRedeploy={
          reply.status === "failed" &&
          !generationValidationFailure &&
          (reply.jsonData?.repairKind === "runtime" ||
            deploymentRepairAvailable)
            ? reply.jsonData?.repairKind === "runtime"
              ? fixRuntimeErrors
              : fixAndRedeploy
            : undefined
        }
        fixing={repairBusy || runtimeRepairBusy}
        repairError={
          reply.jsonData?.repairKind === "runtime"
            ? runtimeRepairError
            : repairError
        }
      />
    );
  }

  if (!previewUrl) {
    return (
      <div className="mt-6 flex w-full items-center justify-between gap-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3 text-xs text-amber-100/80">
        <span>The deployment completed without a preview address.</span>
        {sourceZip ? (
          <button
            type="button"
            onClick={showGeneratedCode}
            className="shrink-0 text-slate-300 transition hover:text-white"
          >
            View code
          </button>
        ) : null}
      </div>
    );
  }

  const iframeSrc = `${previewUrl}?preview=${previewNonce || reply.updatedAtMs || Date.now()}`;
  const containerClasses = isFullscreen
    ? "tk-glass-editor fixed inset-4 z-50 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#050505] shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-300"
    : "tk-glass-editor relative flex h-[620px] w-full flex-col overflow-hidden rounded-3xl border border-white/20 bg-[#0A0A0A] shadow-2xl transition-all duration-300";
  const isReleased =
    String(releaseSummary?.status || "").toLowerCase() === "completed";
  const releasedAtMs =
    Number(releaseSummary?.releasedAtMs || 0) ||
    tsToMs(releaseSummary?.updatedAt);

  const renderContent = () => (
    <div
      className={
        isFullscreen
          ? ""
          : "tk-preview-arrival relative mx-auto mt-8 mb-4 w-full max-w-[1040px] group"
      }
    >
      {!isFullscreen && isReleased ? (
        <div className="relative z-10 mb-3 flex items-center justify-between gap-4 px-1 text-xs">
          <span className="min-w-0 truncate text-emerald-200/80">
            Released{releasedAtMs ? ` ${formatTime(releasedAtMs)}` : ""}
          </span>
          <button
            type="button"
            onClick={onOpenReleases}
            className="inline-flex shrink-0 items-center gap-1.5 text-slate-400 transition-colors hover:text-white"
          >
            View analytics
            <ExternalLink size={12} strokeWidth={1.6} />
          </button>
        </div>
      ) : null}
      {!isFullscreen && (
        <div className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-white/[0.035] opacity-70 blur-3xl" />
      )}
      <div className={containerClasses}>
        {viewMode === "preview" && (
        <div className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-gradient-to-b from-black/95 via-black/85 to-black/75 px-2 sm:px-5">
          <div className="hidden items-center gap-3 drop-shadow-md sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            </span>
            <span className="text-[11px] font-semibold tracking-[0.1em] text-white uppercase">
              Live Application
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 drop-shadow-md sm:gap-2">
            <InstantToolbarTooltip
              label={
                runtimeErrors.length
                  ? `${runtimeErrors.length} preview runtime error${runtimeErrors.length === 1 ? "" : "s"}`
                  : "Preview diagnostics"
              }
            >
              <button
                type="button"
                onClick={() => setDiagnosticsOpen((open) => !open)}
                className={`relative grid h-9 w-9 place-items-center rounded-xl border backdrop-blur-md transition-all hover:scale-105 ${
                  runtimeErrors.length
                    ? "border-amber-300/30 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25"
                    : "border-white/5 bg-black/40 text-slate-300 hover:bg-white/20 hover:text-white"
                }`}
                aria-label={
                  runtimeErrors.length
                    ? `${runtimeErrors.length} preview runtime error${runtimeErrors.length === 1 ? "" : "s"}`
                    : "Preview diagnostics"
                }
              >
                <AlertTriangle size={15} strokeWidth={1.7} />
                {runtimeErrors.length ? (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-semibold leading-none text-black">
                    {Math.min(runtimeErrors.length, 9)}
                  </span>
                ) : null}
              </button>
            </InstantToolbarTooltip>

            <InstantToolbarTooltip label="Reload application">
              <button
                type="button"
                onClick={() => {
                  setPreviewDiagnostics([]);
                  setDiagnosticsOpen(false);
                  const iframe = document.getElementById(
                    `iframe-${buildId || "preview"}`
                  );
                  if (iframe) iframe.src = iframe.src;
                }}
                className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white hover:scale-105"
                aria-label="Reload application"
              >
                <RefreshCw size={15} strokeWidth={1.5} />
              </button>
            </InstantToolbarTooltip>

            <InstantToolbarTooltip label="View source code">
              <button
                type="button"
                onClick={showGeneratedCode}
                className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white hover:scale-105"
                aria-label="View source code"
              >
                <Code2 size={15} strokeWidth={1.5} />
              </button>
            </InstantToolbarTooltip>

            <InstantToolbarTooltip label="Open in new tab">
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white hover:scale-105"
                aria-label="Open application in new tab"
              >
                <ExternalLink size={15} strokeWidth={1.5} />
              </a>
            </InstantToolbarTooltip>

            <InstantToolbarTooltip
              label={isFullscreen ? "Restore preview" : "Expand preview"}
            >
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-black/40 text-slate-300 backdrop-blur-md border border-white/5 transition-all hover:bg-white/20 hover:text-white hover:scale-105"
                aria-label={isFullscreen ? "Restore preview" : "Expand preview"}
              >
                {isFullscreen ? (
                  <Minimize2 size={15} strokeWidth={1.5} />
                ) : (
                  <Maximize2 size={15} strokeWidth={1.5} />
                )}
              </button>
            </InstantToolbarTooltip>

            <button
              type="button"
              onClick={() => setReleaseModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-violet-300/20 bg-violet-300/15 px-3 text-[11px] font-medium text-violet-100 backdrop-blur-md transition-all hover:scale-105 hover:bg-violet-300/25"
              aria-label="Release application"
            >
              <Rocket size={15} strokeWidth={1.7} />
              Release
            </button>
          </div>
        </div>
        )}

        {viewMode === "preview" && diagnosticsOpen ? (
          <PreviewDiagnosticsPanel
            diagnostics={previewDiagnostics}
            previewUrl={previewUrl}
            onFixAndDeploy={fixRuntimeErrors}
            fixing={runtimeRepairBusy}
            fixError={runtimeRepairError}
            onClose={() => setDiagnosticsOpen(false)}
          />
        ) : null}

        {viewMode === "code" ? (
          <GeneratedCodeWorkspace
            userDocId={userDocId}
            runId={activeRunId}
            reply={reply}
            previewUrl={previewUrl}
            onPreview={() => {
              showDeployment();
            }}
            onDeployed={() => setPreviewNonce(Date.now())}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((current) => !current)}
          />
        ) : (
          <iframe
            id={`iframe-${buildId || 'preview'}`}
            src={iframeSrc}
            title="Application Preview"
            className="min-h-0 flex-1 w-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {isFullscreen && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={() => setIsFullscreen(false)} />
      )}
      {renderContent()}
      <ReleaseApplicationModal
        open={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        userDocId={userDocId}
        runId={activeRunId}
        previewUrl={previewUrl}
        productName={reply.jsonData?.productName || "application"}
        onReleased={() => setPreviewNonce(Date.now())}
      />
    </>
  );
}

function PreviewDiagnosticsPanel({
  diagnostics,
  previewUrl,
  onFixAndDeploy,
  fixing = false,
  fixError = "",
  onClose,
}) {
  const safeDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
  const errors = safeDiagnostics.filter((item) => item?.level === "error");
  const visibleItems = errors.length ? errors : safeDiagnostics;

  return (
    <div className="tk-glass-float absolute inset-x-4 top-12 z-20 max-h-[calc(100%-4rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#101010]/95">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <AlertTriangle
              size={15}
              className={errors.length ? "text-amber-200" : "text-slate-400"}
            />
            Preview diagnostics
          </div>
          <p className="mt-1 text-xs font-light text-slate-400">
            Runtime errors reported from the live application preview.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {errors.length ? (
            <button
              type="button"
              onClick={onFixAndDeploy}
              disabled={fixing || !onFixAndDeploy}
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
            >
              {fixing ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Wrench size={13} strokeWidth={1.8} />
              )}
              {fixing ? "Fixing..." : "Fix and deploy"}
            </button>
          ) : (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <ExternalLink size={13} />
              Open app
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close diagnostics"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="tk-scrollbar max-h-[440px] overflow-auto p-4">
        {fixError ? (
          <div className="mb-3 rounded-xl border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-100">
            {fixError}
          </div>
        ) : null}
        {!visibleItems.length ? (
          <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm font-light leading-6 text-slate-400">
            No runtime errors have been reported yet. If the preview is blank,
            open the app in a new tab and use the browser's DevTools console for
            deeper inspection.
          </div>
        ) : (
          <div className="grid gap-3">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-amber-300/15 bg-amber-300/[0.06] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-100/70">
                    {String(item?.type || "runtime error").replace(/-/g, " ")}
                  </div>
                  {item.timestamp ? (
                    <div className="text-[11px] text-slate-500">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-amber-50">
                  {item.message}
                </div>
                {item.filename ? (
                  <div className="mt-2 break-all font-mono text-[11px] text-slate-400">
                    {item.filename}
                    {item.lineno ? `:${item.lineno}${item.colno ? `:${item.colno}` : ""}` : ""}
                  </div>
                ) : null}
                {item.stack ? (
                  <pre className="tk-scrollbar mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/35 p-3 text-[11px] leading-5 text-slate-300">
                    {item.stack}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComposerAttachments({ files, onRemove }) {
  if (!files.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex max-w-[220px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-1.5 text-xs"
        >
          <File className="shrink-0 text-slate-400" size={13} strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium leading-4 text-slate-200">{file.name}</div>
            <div className="mt-0.5 text-[10px] font-light leading-3 text-slate-500">
              {file.error
                ? file.error
                : file.uploading
                  ? `Syncing ${file.uploadProgress}%`
                  : "Attached"}
            </div>
            {file.uploading && (
              <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${file.uploadProgress}%` }}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="grid h-6 w-6 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Remove asset"
          >
            {file.error ? <Trash2 size={12} /> : <X size={13} />}
          </button>
        </div>
      ))}
    </div>
  );
}

export default App;
