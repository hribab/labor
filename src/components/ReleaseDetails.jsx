import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Download,
  ExternalLink,
  FilePenLine,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  MonitorSmartphone,
  Newspaper,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  callAddCustomDomain,
  callAppGenerationAgent,
  callApplicationAnalytics,
  callRepairGoogleAnalyticsAccess,
  callReleaseMarketingAgent,
  callReleasedAppManagerAgent,
} from "../lib/agent";
import { db, userFacingFirebaseError } from "../lib/firebase";
import { requestGoogleCloudAccess } from "../lib/googleCloud";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "../lib/laborBrand";
import CloudBuildLogPanel from "./CloudBuildLogPanel";
import CustomDomainSetup from "./CustomDomainSetup";

const RELEASE_MANAGER_COLLECTION = "releaseManagement";

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function formatDateTime(value, fallback = "Not run yet") {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(milliseconds));
}

function nextDailyRunMs() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

function normalizeDomainList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item?.customDomain)
    : [];
}

function releaseFallback(release) {
  const previewUrl = String(release?.previewUrl || release?.releaseUrl || "");
  const legacyCustomDomain = String(release?.customDomain || "");
  const customDomains = Array.isArray(release?.customDomains)
    ? release.customDomains
    : legacyCustomDomain
      ? [
          {
            customDomain: legacyCustomDomain,
            url: `https://${legacyCustomDomain}/`,
            status: "needs_setup",
            records: Array.isArray(release?.domainSetup?.records)
              ? release.domainSetup.records
              : [],
          },
        ]
      : [];

  return {
    runId: String(release?.runId || release?.id || ""),
    releaseId: String(release?.latestReleaseId || release?.releaseId || ""),
    name: String(release?.productName || "Generated application"),
    description: String(release?.productDescription || ""),
    releaseUrl: previewUrl,
    previewUrl,
    customDomains,
    releasedAtMs: Number(release?.releasedAtMs || release?.createdAtMs || 0),
    sourceAvailable: false,
  };
}

function normalizeManagementState(data) {
  if (!data || typeof data !== "object") return null;
  return {
    ...data,
    status: String(data.status || "idle"),
    phase: String(data.phase || ""),
    resultMarkdown: String(data.resultMarkdown || ""),
    error: String(data.error || ""),
    startedAtMs: timestampMs(data.startedAtMs),
    lastRunAtMs:
      timestampMs(data.lastRunAtMs) ||
      timestampMs(data.completedAtMs) ||
      timestampMs(data.updatedAt),
    nextRunAtMs: timestampMs(data.nextRunAtMs),
  };
}

function managerPhaseLabel(phase) {
  const labels = {
    collecting_release: "Reading release",
    reading_analytics: "Reading analytics",
    reading_user_activity: "Reading application data",
    planning_data_analysis: "Planning data analysis",
    running_data_analysis: "Analyzing user records",
    thinking: "Planning next actions",
    completed: "Brief ready",
    failed: "Run failed",
  };
  return labels[phase] || "Working";
}

function ManagerMarkdown({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children: content }) => (
          <h1 className="mb-5 text-xl font-medium text-white">{content}</h1>
        ),
        h2: ({ children: content }) => (
          <h2 className="mb-3 mt-8 border-t border-white/[0.06] pt-6 text-sm font-medium text-white">
            {content}
          </h2>
        ),
        h3: ({ children: content }) => (
          <h3 className="mb-2 mt-6 text-sm font-medium text-slate-200">
            {content}
          </h3>
        ),
        p: ({ children: content }) => (
          <p className="my-3 text-sm font-light leading-7 text-slate-400">
            {content}
          </p>
        ),
        ul: ({ children: content }) => (
          <ul className="my-3 grid list-disc gap-2 pl-5 text-sm font-light leading-6 text-slate-400 marker:text-violet-300/60">
            {content}
          </ul>
        ),
        ol: ({ children: content }) => (
          <ol className="my-3 grid list-decimal gap-2 pl-5 text-sm font-light leading-6 text-slate-400">
            {content}
          </ol>
        ),
        li: ({ children: content }) => (
          <li className="pl-1">{content}</li>
        ),
        strong: ({ children: content }) => (
          <strong className="font-medium text-slate-200">{content}</strong>
        ),
        em: ({ children: content }) => (
          <em className="text-xs text-slate-600">{content}</em>
        ),
        code: ({ children: content }) => (
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-cyan-100">
            {content}
          </code>
        ),
        blockquote: ({ children: content }) => (
          <blockquote className="my-4 border-l border-violet-300/40 pl-4 text-slate-400">
            {content}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function productIntelligenceMarkdown(value) {
  return String(value || "")
    .replace(
      /\n## Best next actions\s*\n[\s\S]*?(?=\n## |$)/i,
      ""
    )
    .trim();
}

function cleanTextList(value, limit = 3) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeActionableItems(management) {
  const result = management?.result || {};
  const raw = result.actionableItems || {};
  const legacyUpdate = (Array.isArray(result.recommendedActions)
    ? result.recommendedActions
    : []
  ).find((item) => item?.skill === "software_update");
  const productUpdate = raw.productUpdate || {};
  const marketingArticles = raw.marketingArticles || {};

  return {
    productUpdate: {
      title:
        String(productUpdate.title || legacyUpdate?.title || "").trim() ||
        "Update the application",
      summary: String(
        productUpdate.summary || legacyUpdate?.rationale || ""
      ).trim(),
      changes: cleanTextList(
        productUpdate.changes || legacyUpdate?.executionPlan,
        3
      ),
      rationale: String(
        productUpdate.rationale || legacyUpdate?.rationale || ""
      ).trim(),
      expectedImpact: String(
        productUpdate.expectedImpact || legacyUpdate?.expectedImpact || ""
      ).trim(),
    },
    marketingArticles: {
      title:
        String(marketingArticles.title || "").trim() ||
        "Write marketing articles",
      summary: String(marketingArticles.summary || "").trim(),
      titles: cleanTextList(marketingArticles.titles, 3),
      rationale: String(marketingArticles.rationale || "").trim(),
    },
  };
}

function ReleaseActionRow({
  icon: Icon,
  title,
  children,
  onApprove,
  approveDisabled = false,
  comingSoon = false,
  warning = false,
  compact = false,
}) {
  const tone = warning
    ? {
        panel: "border-amber-200/[0.12] bg-amber-200/[0.025]",
        icon: "border-amber-200/15 bg-amber-200/[0.06] text-amber-200/70",
      }
    : {
        panel: "border-white/[0.08] bg-white/[0.025]",
        icon: "border-violet-200/15 bg-violet-200/[0.06] text-violet-100",
      };

  if (compact) {
    return (
      <div className={`min-w-0 overflow-hidden rounded-lg border ${tone.panel}`}>
        <div className="p-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span
              className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${tone.icon}`}
            >
              <Icon size={13} strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h3 className="min-w-0 flex-1 text-xs font-medium leading-4 text-slate-100">
                  {title}
                </h3>
                {comingSoon ? (
                  <span className="shrink-0 rounded border border-amber-200/15 bg-amber-200/[0.05] px-1.5 py-0.5 text-[8px] uppercase text-amber-200/60">
                    Soon
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 text-[11px] font-light leading-4 text-slate-500">
                {children}
              </div>
            </div>
          </div>
        </div>
        {!comingSoon ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={approveDisabled}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 border-t border-white/[0.07] text-[11px] font-medium text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-700"
          >
            Approve
            <ArrowRight size={11} />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-lg border sm:flex-row sm:items-stretch ${tone.panel}`}
    >
      <div className="flex min-w-0 flex-1 gap-3 p-4">
        <span
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${tone.icon}`}
        >
          <Icon size={14} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-slate-100">{title}</h3>
            {comingSoon ? (
              <span className="rounded border border-amber-200/15 bg-amber-200/[0.05] px-1.5 py-0.5 text-[9px] uppercase text-amber-200/60">
                Coming soon
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 text-xs font-light leading-5 text-slate-500">
            {children}
          </div>
        </div>
      </div>
      {!comingSoon ? (
        <button
          type="button"
          onClick={onApprove}
          disabled={approveDisabled}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border-t border-white/[0.07] px-5 text-xs font-medium text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-slate-700 sm:min-w-28 sm:border-l sm:border-t-0"
        >
          Approve
          <ArrowRight size={13} />
        </button>
      ) : null}
    </div>
  );
}

function ReleaseActionModal({ title, description, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-lg">
      <div className="tk-glass-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b0b0d]/95 shadow-[0_28px_100px_rgba(0,0,0,0.7)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-white">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs font-light leading-5 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function latestSeriesValue(data) {
  const values = Array.isArray(data) ? data : [];
  return Number(values[values.length - 1]?.value || 0);
}

function MiniLineChart({ data, ariaLabel }) {
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const values = Array.isArray(data) ? data : [];
  const width = 220;
  const height = 54;
  const padding = 4;
  const maxValue = Math.max(1, ...values.map((item) => Number(item.value || 0)));
  const denominator = Math.max(values.length - 1, 1);
  const points = values.map((item, index) => ({
    ...item,
    x: padding + (index / denominator) * (width - padding * 2),
    y:
      height -
      padding -
      (Number(item.value || 0) / maxValue) * (height - padding * 2),
  }));
  const path = points
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = path
    ? `${path} L ${width - padding} ${height - padding} L ${padding} ${
        height - padding
      } Z`
    : "";
  const hovered = points[hoveredIndex] || null;

  return (
    <div className="relative mt-2 h-14 w-full overflow-hidden">
      {hovered ? (
        <div className="pointer-events-none absolute right-1 top-0 z-10 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[10px] text-slate-300 shadow-lg">
          {hovered.date || hovered.month}: {compactNumber(hovered.value)}
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoveredIndex(-1)}
      >
        <path
          d={`M ${padding} ${height - padding} L ${width - padding} ${
            height - padding
          }`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
        {areaPath ? (
          <path d={areaPath} fill="rgba(165,180,252,0.07)" />
        ) : null}
        {path ? (
          <path
            d={path}
            fill="none"
            stroke="rgba(165,180,252,0.9)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {points.map((point, index) => (
          <circle
            key={`${point.date || point.month}-${index}`}
            cx={point.x}
            cy={point.y}
            r={hoveredIndex === index ? 2.5 : 6}
            fill={
              hoveredIndex === index
                ? "rgba(224,231,255,1)"
                : "transparent"
            }
            onMouseEnter={() => setHoveredIndex(index)}
          />
        ))}
      </svg>
    </div>
  );
}

function AnalyticsSeriesCell({ title, value, data, ariaLabel }) {
  return (
    <div className="min-w-0 bg-black/15 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[9px] uppercase text-slate-600">
          {title}
        </span>
        <strong className="text-sm font-medium text-white">
          {compactNumber(value)}
        </strong>
      </div>
      <MiniLineChart data={data} ariaLabel={ariaLabel} />
    </div>
  );
}

function AnalyticsBreakdown({ title, icon: Icon, items, limit = 4 }) {
  const values = Array.isArray(items) ? items.slice(0, limit) : [];
  const maximum = Math.max(1, ...values.map((item) => Number(item.value || 0)));

  return (
    <div className="min-w-0 bg-black/15 p-3">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className="shrink-0 text-slate-500" />
        <span className="truncate text-[9px] uppercase text-slate-600">
          {title}
        </span>
      </div>
      {values.length ? (
        <div className="mt-2 grid gap-2">
          {values.map((item) => {
            const value = Number(item.value || 0);
            return (
              <div key={`${title}-${item.label}`} className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2 text-[9px]">
                  <span className="truncate text-slate-400">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {compactNumber(value)}
                  </span>
                </div>
                <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-indigo-300/55"
                    style={{ width: `${Math.max(4, (value / maximum) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[9px] text-slate-700">No data yet</p>
      )}
    </div>
  );
}

function ReleaseDetails({ release, userDocId, onBack, onOpenRun }) {
  const fallback = useMemo(() => releaseFallback(release), [release]);
  const runId = fallback.runId;
  const releaseId = fallback.releaseId;
  const [details, setDetails] = useState(fallback);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsRepairing, setAnalyticsRepairing] = useState(false);
  const [analyticsRepairError, setAnalyticsRepairError] = useState("");
  const [error, setError] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const [domainOpen, setDomainOpen] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [expandedDomain, setExpandedDomain] = useState("");
  const [domainAction, setDomainAction] = useState({
    customDomain: "",
    action: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [management, setManagement] = useState(null);
  const [managerInput, setManagerInput] = useState("");
  const managerInputRef = useRef(null);
  const managerActionVersionRef = useRef(0);
  const [managerRequestBusy, setManagerRequestBusy] = useState(false);
  const [managerError, setManagerError] = useState("");
  const [actionModal, setActionModal] = useState("");
  const [updateLaunching, setUpdateLaunching] = useState(false);
  const [updateMessageId, setUpdateMessageId] = useState("");
  const [updateReply, setUpdateReply] = useState(null);
  const [updateError, setUpdateError] = useState("");
  const [articleBusy, setArticleBusy] = useState(false);
  const [articleError, setArticleError] = useState("");
  const [articles, setArticles] = useState([]);
  const [selectedArticleIndex, setSelectedArticleIndex] = useState(0);

  useEffect(() => {
    if (!managerInput && managerInputRef.current) {
      managerInputRef.current.style.height = "";
    }
  }, [managerInput]);

  useEffect(() => {
    const version = Number(management?.lastRunAtMs || 0);
    if (!version) return;
    if (
      managerActionVersionRef.current &&
      managerActionVersionRef.current !== version
    ) {
      setUpdateMessageId("");
      setUpdateReply(null);
      setUpdateError("");
      setArticles([]);
      setArticleError("");
      setSelectedArticleIndex(0);
    }
    managerActionVersionRef.current = version;
  }, [management?.lastRunAtMs]);

  useEffect(() => {
    if (!userDocId || !runId || !updateMessageId) {
      setUpdateReply(null);
      return undefined;
    }

    return onSnapshot(
      doc(
        db,
        ROOT_COLLECTION,
        userDocId,
        "runs",
        runId,
        "messages",
        updateMessageId,
        "agentreply",
        "current"
      ),
      (snapshot) => {
        const nextReply = snapshot.exists() ? snapshot.data() || {} : null;
        setUpdateReply(nextReply);
        if (nextReply && nextReply.status !== "failed") setUpdateError("");
      },
      (snapshotError) => setUpdateError(userFacingFirebaseError(snapshotError))
    );
  }, [runId, updateMessageId, userDocId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.allSettled([
      callApplicationAnalytics({
        action: "overview",
        email: userDocId,
        runid: runId,
        releaseId,
      }),
      callAddCustomDomain({
        action: "list",
        email: userDocId,
        runid: runId,
      }),
    ])
      .then(([analyticsResult, domainsResult]) => {
        if (!active) return;
        const analyticsPayload =
          analyticsResult.status === "fulfilled"
            ? analyticsResult.value
            : null;
        const domainsPayload =
          domainsResult.status === "fulfilled" ? domainsResult.value : null;
        const analyticsDetails = analyticsPayload?.release || fallback;
        const primaryUrl =
          String(domainsPayload?.primaryUrl || "") ||
          analyticsDetails.previewUrl ||
          analyticsDetails.releaseUrl ||
          fallback.previewUrl;

        setDetails({
          ...analyticsDetails,
          previewUrl: primaryUrl,
          releaseUrl: primaryUrl,
          customDomains: domainsPayload
            ? normalizeDomainList(domainsPayload.domains)
            : normalizeDomainList(analyticsDetails.customDomains),
        });
        setAnalytics(analyticsPayload?.analytics || null);

        if (analyticsResult.status === "rejected") {
          setError(
            analyticsResult.reason?.message ||
              "Could not load release analytics."
          );
        } else if (domainsResult.status === "rejected") {
          setError(
            domainsResult.reason?.message ||
              "Could not load the configured domains."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fallback, releaseId, runId, userDocId]);

  useEffect(() => {
    if (!userDocId || !runId) {
      setManagement(null);
      return undefined;
    }
    return onSnapshot(
      doc(
        db,
        ROOT_COLLECTION,
        userDocId,
        "runs",
        runId,
        RELEASE_MANAGER_COLLECTION,
        "current"
      ),
      (snapshot) => {
        setManagement(
          snapshot.exists()
            ? normalizeManagementState(snapshot.data() || {})
            : null
        );
        setManagerError("");
      },
      (snapshotError) => setManagerError(userFacingFirebaseError(snapshotError))
    );
  }, [runId, userDocId]);

  const refreshAnalytics = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const [result, domainsResult] = await Promise.all([
        callApplicationAnalytics({
          action: "overview",
          email: userDocId,
          runid: runId,
          releaseId,
          refresh: true,
        }),
        callAddCustomDomain({
          action: "list",
          email: userDocId,
          runid: runId,
        }),
      ]);
      const nextDetails = result.release || details;
      const primaryUrl =
        String(domainsResult.primaryUrl || "") ||
        nextDetails.previewUrl ||
        details.previewUrl;
      setDetails({
        ...nextDetails,
        previewUrl: primaryUrl,
        releaseUrl: primaryUrl,
        customDomains: normalizeDomainList(domainsResult.domains),
      });
      setAnalytics(result.analytics || null);
    } catch (requestError) {
      setError(requestError.message || "Could not refresh analytics.");
    } finally {
      setRefreshing(false);
    }
  };

  const repairAnalyticsAccess = async () => {
    if (analyticsRepairing) return;
    setAnalyticsRepairing(true);
    setAnalyticsRepairError("");
    setError("");
    try {
      const connection = await requestGoogleCloudAccess(userDocId);
      const repaired = await callRepairGoogleAnalyticsAccess({
        email: userDocId,
        userDocId,
        connection,
      });
      if (!repaired?.ready) {
        throw new Error(
          repaired?.error || "Labor could not restore Analytics access."
        );
      }
      const result = await callApplicationAnalytics({
        action: "overview",
        email: userDocId,
        runid: runId,
        releaseId,
        refresh: true,
      });
      setAnalytics(result.analytics || null);
      if (result.release) setDetails(result.release);
    } catch (requestError) {
      setAnalyticsRepairError(
        requestError.message || "Labor could not restore Analytics access."
      );
    } finally {
      setAnalyticsRepairing(false);
    }
  };

  const downloadSource = async () => {
    if (downloadBusy || !details.sourceAvailable) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const result = await callApplicationAnalytics({
        action: "get_source_download_url",
        email: userDocId,
        runid: runId,
        releaseId: details.releaseId || releaseId,
      });
      const anchor = document.createElement("a");
      anchor.href = result.downloadUrl;
      anchor.download = `${details.name || "application"}-source.zip`;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (requestError) {
      setDownloadError(requestError.message || "Could not download source.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const addCustomDomain = async () => {
    if (!domainInput.trim() || domainBusy) return;
    const submittedDomain = domainInput.trim();
    setDomainBusy(true);
    setDomainError("");
    try {
      const result = await callAddCustomDomain({
        action: "add",
        email: userDocId,
        runid: runId,
        customDomain: submittedDomain,
      });
      setDetails((current) => ({
        ...current,
        customDomains: normalizeDomainList(result.domains),
      }));
      setExpandedDomain(
        String(result.domain?.customDomain || submittedDomain).toLowerCase()
      );
      setDomainInput("");
      setDomainOpen(false);
    } catch (requestError) {
      setDomainError(requestError.message || "Could not add this domain.");
    } finally {
      setDomainBusy(false);
    }
  };

  const runDomainAction = async (action, customDomain) => {
    if (!customDomain || domainAction.action) return;
    setDomainAction({ customDomain, action });
    setDomainError("");
    try {
      const result = await callAddCustomDomain({
        action,
        email: userDocId,
        runid: runId,
        customDomain,
      });
      setDetails((current) => ({
        ...current,
        customDomains: normalizeDomainList(result.domains),
      }));
      if (action === "delete") {
        setDeleteConfirm("");
        setExpandedDomain((current) =>
          current === customDomain ? "" : current
        );
      }
    } catch (requestError) {
      setDomainError(
        requestError.message ||
          (action === "delete"
            ? "Could not delete this domain."
            : "Could not refresh this domain.")
      );
    } finally {
      setDomainAction({ customDomain: "", action: "" });
    }
  };

  const toggleDomain = (customDomain) => {
    if (expandedDomain === customDomain) {
      setExpandedDomain("");
      setDeleteConfirm("");
      return;
    }
    setExpandedDomain(customDomain);
    setDeleteConfirm("");
    runDomainAction("details", customDomain);
  };

  const runManager = async (instructions = "") => {
    if (managerRequestBusy || management?.status === "running") return;
    setManagerRequestBusy(true);
    setManagerError("");
    try {
      await callReleasedAppManagerAgent({
        action: "run",
        email: userDocId,
        runid: runId,
        releaseId: details.releaseId || releaseId,
        instructions: instructions.trim(),
      });
      if (instructions.trim()) setManagerInput("");
    } catch (requestError) {
      setManagerError(
        requestError.message || "Could not run the release manager."
      );
    } finally {
      setManagerRequestBusy(false);
    }
  };

  const submitManagerInstructions = () => {
    const instructions = managerInput.trim();
    if (!instructions) return;
    runManager(instructions);
  };

  const actionableItems = useMemo(
    () => normalizeActionableItems(management),
    [management]
  );

  const openProductUpdate = () => {
    if (!updateMessageId) {
      setUpdateReply(null);
      setUpdateError("");
    }
    setActionModal("product_update");
  };

  const approveProductUpdate = async () => {
    if (updateLaunching) return;
    const recommendation = actionableItems.productUpdate;
    const updateRequest = recommendation.changes.length
      ? recommendation.changes
      : [recommendation.summary].filter(Boolean);
    if (!updateRequest.length) {
      setUpdateError("Run the product review again to create an update plan.");
      return;
    }

    setUpdateLaunching(true);
    setUpdateError("");
    setUpdateReply(null);
    try {
      const runRef = doc(
        db,
        ROOT_COLLECTION,
        userDocId,
        "runs",
        runId
      );
      const runSnapshot = await getDoc(runRef);
      if (!runSnapshot.exists()) {
        throw new Error("The application run no longer exists.");
      }
      const runState = runSnapshot.data() || {};
      if (!runState.latestSourceZip) {
        throw new Error("The latest application source is unavailable.");
      }
      const problemStatement =
        runState.problemStatement ||
        details.description ||
        `Improve ${details.name} using the latest release intelligence.`;
      const potentialSolution = runState.potentialSolution || "";
      const updateReasons = cleanTextList(
        [recommendation.rationale, recommendation.expectedImpact],
        3
      );
      const confirmationRef = await addDoc(collection(runRef, "messages"), {
        text: `Release manager recommendation: ${recommendation.title}`,
        role: "user",
        action: "release_manager_update",
        problemStatement,
        potentialSolution,
        updateRequest,
        updateReasons,
        solutionBlueprint: runState.solutionBlueprint || null,
        gameBlueprint: runState.gameBlueprint || null,
        artworkBlueprint: runState.artworkBlueprint || null,
        agentArchitecture: runState.agentArchitecture || null,
        generationMode: "update",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(confirmationRef, "agentreply", "current"), {
        status: "completed",
        phase: "awaiting_confirmation",
        finalTextMd: [
          "### Release manager update",
          recommendation.summary,
          "",
          "Approved from the released product review.",
        ]
          .filter(Boolean)
          .join("\n"),
        requiresUserInput: false,
        jsonData: {
          actionType: "confirm_update",
          generationMode: "update",
          problemStatement,
          potentialSolution,
          updateRequest,
          updateReasons,
          solutionBlueprint: runState.solutionBlueprint || null,
          gameBlueprint: runState.gameBlueprint || null,
          artworkBlueprint: runState.artworkBlueprint || null,
          agentArchitecture: runState.agentArchitecture || null,
          sourceMessageId: confirmationRef.id,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdatedMs: Date.now(),
      });

      const messageRef = await addDoc(collection(runRef, "messages"), {
        text: "Approve product update",
        role: "user",
        action: "proceed",
        problemStatement,
        potentialSolution,
        updateRequest,
        updateReasons,
        solutionBlueprint: runState.solutionBlueprint || null,
        gameBlueprint: runState.gameBlueprint || null,
        artworkBlueprint: runState.artworkBlueprint || null,
        agentArchitecture: runState.agentArchitecture || null,
        generationMode: "update",
        sourceMessageId: confirmationRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setUpdateMessageId(messageRef.id);
      await setDoc(doc(messageRef, "agentreply", "current"), {
        status: "processing",
        phase: "starting_generation",
        finalTextMd:
          "Applying the approved product update without replacing existing product behavior.",
        requiresUserInput: false,
        jsonData: {
          actionType: "app_generation",
          generationMode: "update",
          problemStatement,
          potentialSolution,
          updateRequest,
          updateReasons,
          solutionBlueprint: runState.solutionBlueprint || null,
          gameBlueprint: runState.gameBlueprint || null,
          artworkBlueprint: runState.artworkBlueprint || null,
          agentArchitecture: runState.agentArchitecture || null,
          sourceMessageId: confirmationRef.id,
          previewUrl: runState.previewUrl || details.previewUrl,
          hostingSiteId: runState.hostingSiteId || "",
          productName: runState.productName || details.name,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdatedMs: Date.now(),
      });
      await setDoc(
        runRef,
        { updatedAt: serverTimestamp() },
        { merge: true }
      );

      await callAppGenerationAgent({
        email: userDocId,
        runid: runId,
        messageid: messageRef.id,
        sourceMessageId: confirmationRef.id,
        problemStatement,
        potentialSolution,
        updateRequest,
        updateReasons,
        solutionBlueprint: runState.solutionBlueprint || null,
        gameBlueprint: runState.gameBlueprint || null,
        artworkBlueprint: runState.artworkBlueprint || null,
        agentArchitecture: runState.agentArchitecture || null,
        generationMode: "update",
      });
    } catch (requestError) {
      setUpdateError(
        requestError.message || "Could not apply the product update."
      );
    } finally {
      setUpdateLaunching(false);
    }
  };

  const generateMarketingArticles = async () => {
    const titles = actionableItems.marketingArticles.titles;
    if (articleBusy || titles.length !== 3) return;
    setActionModal("marketing_articles");
    setArticleBusy(true);
    setArticleError("");
    setArticles([]);
    setSelectedArticleIndex(0);
    try {
      const result = await callReleaseMarketingAgent({
        email: userDocId,
        runid: runId,
        releaseId: details.releaseId || releaseId,
        titles,
      });
      setArticles(Array.isArray(result.articles) ? result.articles : []);
    } catch (requestError) {
      setArticleError(
        requestError.message || "Could not generate the marketing articles."
      );
    } finally {
      setArticleBusy(false);
    }
  };

  const openMarketingArticles = () => {
    if (articles.length) {
      setActionModal("marketing_articles");
      return;
    }
    generateMarketingArticles();
  };

  const customDomains = normalizeDomainList(details.customDomains);
  const managerRunning =
    managerRequestBusy || management?.status === "running";
  const lastRunAtMs = management?.lastRunAtMs || 0;
  const nextRunAtMs = management?.nextRunAtMs || nextDailyRunMs();
  const report = productIntelligenceMarkdown(
    management?.resultMarkdown || ""
  );
  const dailyUsers = Array.isArray(analytics?.dailyActiveUsers)
    ? analytics.dailyActiveUsers
    : [];
  const monthlyUsers = Array.isArray(analytics?.monthlyActiveUsers)
    ? analytics.monthlyActiveUsers
    : [];
  const countries = Array.isArray(analytics?.countries)
    ? analytics.countries
    : [];
  const ageGroups = Array.isArray(analytics?.age) ? analytics.age : [];
  const devices = Array.isArray(analytics?.devices) ? analytics.devices : [];

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-xs text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
      >
        <ArrowLeft size={14} />
        All releases
      </button>

      <div className="tk-release-details-grid mt-4">
        <section className="tk-glass-panel flex min-h-[720px] min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.022]">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-white">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-violet-300/15 bg-violet-300/[0.07] text-violet-100">
                  <Bot size={15} strokeWidth={1.7} />
                </span>
                <div>
                  <h1 className="text-sm font-medium">Product owner</h1>
                  <p className="mt-0.5 text-[10px] text-slate-600">
                    Autonomous daily product review
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
                <span>Last run {formatDateTime(lastRunAtMs)}</span>
                <span>Next run {formatDateTime(nextRunAtMs)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => runManager("")}
              disabled={managerRunning}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={13}
                className={managerRunning ? "animate-spin" : ""}
              />
              Rerun
            </button>
          </header>

          {managerRunning ? (
            <div className="flex items-center gap-2 border-b border-violet-300/10 bg-violet-300/[0.035] px-5 py-2.5 text-[11px] text-violet-100/80 sm:px-6">
              <Loader2 size={12} className="animate-spin" />
              {managerPhaseLabel(management?.phase)}
            </div>
          ) : null}

          {management?.status === "failed" && management.error ? (
            <div className="border-b border-red-300/10 bg-red-300/[0.035] px-5 py-3 text-xs text-red-200/80 sm:px-6">
              {management.error}
            </div>
          ) : null}

          <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
            {report ? (
              <div className="mx-auto w-full max-w-3xl">
                <ManagerMarkdown>{report}</ManagerMarkdown>
              </div>
            ) : managerRunning ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
                <Loader2 size={18} className="animate-spin text-violet-200" />
                <p className="mt-4 text-sm text-slate-300">
                  Reading the released application
                </p>
                <p className="mt-1 text-xs font-light text-slate-600">
                  Analytics and product activity are being assembled.
                </p>
              </div>
            ) : (
              <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-violet-100">
                  <Sparkles size={17} strokeWidth={1.5} />
                </span>
                <h2 className="mt-4 text-sm font-medium text-slate-200">
                  Ready for its first review
                </h2>
                <p className="mt-2 max-w-sm text-xs font-light leading-5 text-slate-600">
                  Run the manager now, or leave it to the next daily schedule.
                </p>
              </div>
            )}
          </div>

          <footer className="border-t border-white/[0.07] bg-black/10 px-4 py-5 sm:px-6">
            <div className="mx-auto flex min-h-[68px] w-full max-w-3xl items-end gap-3 rounded-2xl border border-violet-200/[0.14] bg-white/[0.055] px-4 py-3 shadow-[0_12px_36px_rgba(77,58,150,0.12)]">
              <span className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-200/[0.08] text-violet-100">
                <Bot size={16} strokeWidth={1.6} />
              </span>
              <textarea
                ref={managerInputRef}
                value={managerInput}
                onChange={(event) => setManagerInput(event.target.value)}
                onInput={(event) => {
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${Math.min(
                    event.currentTarget.scrollHeight,
                    144
                  )}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitManagerInstructions();
                  }
                }}
                rows={2}
                placeholder="Ask the release manager what to investigate or improve..."
                className="tk-composer-input tk-scrollbar max-h-36 min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-3 text-sm font-light leading-6 text-white outline-none ring-0 placeholder:text-slate-500 focus:outline-none focus:ring-0 focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={submitManagerInstructions}
                disabled={!managerInput.trim() || managerRunning}
                className="mb-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black transition hover:bg-slate-200 disabled:bg-white/[0.06] disabled:text-slate-700"
                aria-label="Run with instructions"
                title="Run with instructions"
              >
                {managerRunning ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
              </button>
            </div>
            {managerError ? (
              <p className="mx-auto mt-2 w-full max-w-3xl text-xs text-red-300">
                {managerError}
              </p>
            ) : null}
          </footer>
        </section>

        <aside className="tk-glass-panel min-h-[720px] min-w-0 self-start overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.022]">
          <section className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-medium text-white">
                  {details.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-[11px] font-light leading-4 text-slate-600">
                  {details.description || "Released application"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={downloadSource}
                  disabled={downloadBusy || !details.sourceAvailable}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                  aria-label="Download release source"
                  title="Download release source"
                >
                  {downloadBusy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRun?.(runId)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Update application"
                  title="Update application"
                >
                  <ArrowLeft size={13} className="rotate-180" />
                </button>
              </div>
            </div>

            <a
              href={details.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5 text-xs text-slate-300 transition hover:border-white/[0.14] hover:text-white"
            >
              <Globe2 size={12} className="shrink-0 text-cyan-200" />
              <span className="min-w-0 flex-1 truncate">
                {details.previewUrl || "URL pending"}
              </span>
              <ExternalLink size={11} className="shrink-0 text-slate-700" />
            </a>

            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-700">
              <CalendarClock size={11} />
              Released {formatDateTime(details.releasedAtMs, "date pending")}
            </div>
            {downloadError ? (
              <p className="mt-2 text-[10px] text-red-300">{downloadError}</p>
            ) : null}
          </section>

          <section className="border-t border-white/[0.07] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Globe2 size={13} className="text-cyan-200" />
                <h2 className="text-xs font-medium text-white">Domains</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDomainOpen((current) => !current);
                  setDomainInput("");
                  setDomainError("");
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Add custom domain"
                title="Add custom domain"
              >
                {domainOpen ? <X size={12} /> : <Plus size={12} />}
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              <a
                href={details.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[11px] text-slate-400 transition hover:text-white"
              >
                <span className="min-w-0 flex-1 truncate">
                  {details.previewUrl || "URL pending"}
                </span>
                <span className="rounded border border-cyan-300/15 bg-cyan-300/[0.06] px-1.5 py-0.5 text-[8px] text-cyan-100">
                  Primary
                </span>
              </a>

              {customDomains.map((domain) => (
                <CustomDomainSetup
                  key={domain.customDomain}
                  domain={domain}
                  expanded={expandedDomain === domain.customDomain}
                  busyAction={
                    domainAction.customDomain === domain.customDomain
                      ? domainAction.action
                      : ""
                  }
                  deleteConfirm={deleteConfirm === domain.customDomain}
                  onToggle={toggleDomain}
                  onVerify={(customDomain) =>
                    runDomainAction("verify", customDomain)
                  }
                  onDeleteIntent={setDeleteConfirm}
                  onDelete={(customDomain) =>
                    runDomainAction("delete", customDomain)
                  }
                  onCancelDelete={() => setDeleteConfirm("")}
                />
              ))}
            </div>

            {domainOpen ? (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <input
                  value={domainInput}
                  onChange={(event) => {
                    setDomainInput(event.target.value);
                    setDomainError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addCustomDomain();
                  }}
                  placeholder="app.yourcompany.com"
                  className="h-9 w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-700"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={addCustomDomain}
                    disabled={!domainInput.trim() || domainBusy}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-medium text-black transition hover:bg-slate-200 disabled:bg-white/[0.06] disabled:text-slate-700"
                  >
                    {domainBusy ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : null}
                    Add
                  </button>
                </div>
              </div>
            ) : null}
            {domainError ? (
              <p className="mt-2 text-[10px] leading-4 text-red-300">
                {domainError}
              </p>
            ) : null}
          </section>

          <section className="border-t border-white/[0.07] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-violet-200" />
                <h2 className="text-xs font-medium text-white">Analytics</h2>
              </div>
              <button
                type="button"
                onClick={refreshAnalytics}
                disabled={refreshing}
                className="grid h-7 w-7 place-items-center rounded-md text-slate-600 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                aria-label="Refresh analytics"
                title="Refresh analytics"
              >
                <RefreshCw
                  size={11}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>
            </div>

            {loading ? (
              <div className="flex h-44 items-center justify-center text-slate-700">
                <Loader2 size={13} className="animate-spin" />
              </div>
            ) : analytics?.available ? (
              <>
                <div className="tk-release-analytics-grid mt-3 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07]">
                  <AnalyticsSeriesCell
                    title="Daily active"
                    value={latestSeriesValue(dailyUsers)}
                    data={dailyUsers}
                    ariaLabel="Daily active users for the last 30 days"
                  />
                  <AnalyticsSeriesCell
                    title="Monthly active"
                    value={latestSeriesValue(monthlyUsers)}
                    data={monthlyUsers}
                    ariaLabel="Monthly active users for the last five months"
                  />
                </div>

                <div className="tk-release-analytics-grid mt-2 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.07]">
                  <div className="tk-release-analytics-wide">
                    <AnalyticsBreakdown
                      title="Location"
                      icon={MapPin}
                      items={countries}
                      limit={5}
                    />
                  </div>
                  <AnalyticsBreakdown
                    title="Age"
                    icon={Users}
                    items={ageGroups}
                    limit={4}
                  />
                  <AnalyticsBreakdown
                    title="Devices"
                    icon={MonitorSmartphone}
                    items={devices}
                    limit={4}
                  />
                </div>
              </>
            ) : (
              <div className="flex min-h-44 flex-col items-center justify-center px-3 text-center">
                {/function service account needs Viewer access to this GA4 property/i.test(
                  analytics?.error || ""
                ) ? (
                  <>
                    <p className="max-w-xs text-[10px] leading-4 text-slate-600">
                      Labor&apos;s analytics reader is not connected to this GA4
                      property yet.
                    </p>
                    <button
                      type="button"
                      onClick={repairAnalyticsAccess}
                      disabled={analyticsRepairing}
                      className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200/15 bg-violet-200/[0.07] px-3 text-[10px] font-semibold text-violet-100 transition hover:border-violet-200/30 hover:bg-violet-200/[0.11] disabled:cursor-wait disabled:opacity-60"
                    >
                      {analyticsRepairing ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RefreshCw size={11} />
                      )}
                      {analyticsRepairing
                        ? "Restoring analytics..."
                        : "Restore analytics"}
                    </button>
                    {analyticsRepairError ? (
                      <p className="mt-2 max-w-sm text-[10px] leading-4 text-red-300">
                        {analyticsRepairError}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[10px] leading-4 text-slate-700">
                    {analytics?.error ||
                      "Analytics will appear after traffic arrives."}
                  </p>
                )}
              </div>
            )}
            {error ? (
              <p className="mt-2 text-[10px] leading-4 text-red-300">
                {error}
              </p>
            ) : null}
          </section>

          <section className="border-t border-white/[0.07] p-4">
            <div className="flex items-start gap-2">
              <Sparkles size={13} className="mt-0.5 shrink-0 text-violet-200" />
              <div className="min-w-0">
                <h2 className="text-xs font-medium text-white">
                  Best next actions
                </h2>
                <p className="mt-0.5 text-[10px] font-light leading-4 text-slate-600">
                  Nothing changes until you approve it.
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <ReleaseActionRow
                compact
                icon={WandSparkles}
                title="Update the application"
                onApprove={openProductUpdate}
                approveDisabled={
                  updateLaunching ||
                  updateReply?.status === "processing" ||
                  updateReply?.status === "completed" ||
                  (!actionableItems.productUpdate.changes.length &&
                    !actionableItems.productUpdate.summary)
                }
              >
                <p>
                  {actionableItems.productUpdate.summary ||
                    "Rerun the product review to generate a focused update."}
                </p>
                {actionableItems.productUpdate.changes.length ? (
                  <ul className="mt-2 grid gap-1 text-slate-400">
                    {actionableItems.productUpdate.changes.map((change) => (
                      <li key={change} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-200/60" />
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </ReleaseActionRow>

              <ReleaseActionRow
                compact
                icon={Newspaper}
                title="Write marketing articles"
                onApprove={openMarketingArticles}
                approveDisabled={
                  actionableItems.marketingArticles.titles.length !== 3 ||
                  articleBusy
                }
              >
                <p>
                  {actionableItems.marketingArticles.summary ||
                    "Rerun the product review to identify three useful launch stories."}
                </p>
                {actionableItems.marketingArticles.titles.length ? (
                  <ol className="mt-2 grid gap-1 text-slate-400">
                    {actionableItems.marketingArticles.titles.map(
                      (title, index) => (
                        <li key={title}>
                          {index + 1}. {title}
                        </li>
                      )
                    )}
                  </ol>
                ) : null}
              </ReleaseActionRow>

              <ReleaseActionRow
                compact
                icon={Mail}
                title="Execute email marketing"
                comingSoon
                warning
              >
                Targeted, consent-aware campaigns will be available in a later
                release.
              </ReleaseActionRow>

              <ReleaseActionRow
                compact
                icon={CircleDollarSign}
                title="Execute monetization strategy"
                comingSoon
                warning
              >
                Pricing experiments and revenue actions are not enabled yet.
              </ReleaseActionRow>
            </div>
          </section>
        </aside>
      </div>

      {actionModal === "product_update" ? (
        <ReleaseActionModal
          title="Update the application"
          description="The approved changes are applied to the latest source and deployed to the existing product URL."
          onClose={() => setActionModal("")}
        >
          <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {!updateMessageId && !updateLaunching ? (
              <div className="mx-auto max-w-2xl">
                <div className="flex items-start gap-3 rounded-lg border border-violet-200/[0.12] bg-violet-200/[0.035] p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-200/[0.07] text-violet-100">
                    <WandSparkles size={15} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-white">
                      {actionableItems.productUpdate.title}
                    </h3>
                    <p className="mt-1.5 text-xs font-light leading-5 text-slate-400">
                      {actionableItems.productUpdate.summary}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-[10px] uppercase text-slate-600">
                    Changes to apply
                  </p>
                  <div className="mt-2 grid gap-2">
                    {actionableItems.productUpdate.changes.map((change) => (
                      <div
                        key={change}
                        className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5 text-xs font-light leading-5 text-slate-300"
                      >
                        <CheckCircle2
                          size={13}
                          className="mt-0.5 shrink-0 text-emerald-200/70"
                        />
                        {change}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-5 text-xs font-light leading-5 text-slate-600">
                  Existing features and saved data remain in place. The normal
                  generation checks run before deployment.
                </p>
                {updateError ? (
                  <p className="mt-3 text-xs text-red-300">{updateError}</p>
                ) : null}
              </div>
            ) : (
              <div className="mx-auto max-w-3xl">
                <CloudBuildLogPanel
                  reply={updateReply}
                  forceTerminal
                  terminalClassName="h-72"
                  title={
                    updateReply?.status === "completed"
                      ? "Product update deployed"
                      : updateReply?.status === "failed"
                        ? "Product update failed"
                        : "Updating application..."
                  }
                />
                {updateError ? (
                  <p className="mt-3 text-xs text-red-300">{updateError}</p>
                ) : null}
              </div>
            )}
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">
            {updateReply?.status === "completed" ? (
              <button
                type="button"
                onClick={() => setActionModal("")}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-xs font-medium text-black transition hover:bg-slate-200"
              >
                <CheckCircle2 size={13} />
                Close
              </button>
            ) : !updateMessageId ? (
              <>
                <button
                  type="button"
                  onClick={() => setActionModal("")}
                  disabled={updateLaunching}
                  className="h-9 rounded-lg px-3 text-xs text-slate-500 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={approveProductUpdate}
                  disabled={updateLaunching}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-xs font-medium text-black transition hover:bg-slate-200 disabled:bg-white/[0.08] disabled:text-slate-600"
                >
                  {updateLaunching ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <WandSparkles size={13} />
                  )}
                  Confirm update
                </button>
              </>
            ) : null}
          </footer>
        </ReleaseActionModal>
      ) : null}

      {actionModal === "marketing_articles" ? (
        <ReleaseActionModal
          title="Marketing articles"
          description="Three publish-ready drafts grounded in the released product and its launch pages."
          onClose={() => setActionModal("")}
        >
          <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {articleBusy ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                <Loader2 size={18} className="animate-spin text-violet-200" />
                <p className="mt-4 text-sm text-slate-200">
                  Writing three product-specific articles
                </p>
                <p className="mt-1 text-xs font-light text-slate-600">
                  Reading the released source, examples, and use-case pages.
                </p>
              </div>
            ) : articleError ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center px-4 text-center">
                <FilePenLine size={18} className="text-red-200/70" />
                <p className="mt-4 max-w-md text-sm text-red-200">
                  {articleError}
                </p>
                <button
                  type="button"
                  onClick={generateMarketingArticles}
                  className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] px-4 text-xs text-white transition hover:bg-white/[0.09]"
                >
                  <RefreshCw size={13} />
                  Try again
                </button>
              </div>
            ) : articles.length ? (
              <div className="grid min-h-[480px] gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                <nav className="grid content-start gap-1.5">
                  {articles.map((article, index) => (
                    <button
                      key={article.slug || article.title}
                      type="button"
                      onClick={() => setSelectedArticleIndex(index)}
                      className={`rounded-lg border px-3 py-3 text-left text-xs leading-5 transition ${
                        selectedArticleIndex === index
                          ? "border-violet-200/20 bg-violet-200/[0.07] text-white"
                          : "border-transparent text-slate-500 hover:border-white/[0.07] hover:bg-white/[0.03] hover:text-slate-200"
                      }`}
                    >
                      <span className="mb-1 block text-[9px] uppercase text-slate-700">
                        Article {index + 1}
                      </span>
                      {article.title}
                    </button>
                  ))}
                </nav>
                <article className="min-w-0 border-t border-white/[0.07] pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  <ManagerMarkdown>
                    {articles[selectedArticleIndex]?.markdown || ""}
                  </ManagerMarkdown>
                </article>
              </div>
            ) : null}
          </div>
          {!articleBusy && articles.length ? (
            <footer className="flex justify-end border-t border-white/[0.07] px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setActionModal("")}
                className="h-9 rounded-lg bg-white px-4 text-xs font-medium text-black transition hover:bg-slate-200"
              >
                Close
              </button>
            </footer>
          ) : null}
        </ReleaseActionModal>
      ) : null}
    </div>
  );
}

export default ReleaseDetails;
