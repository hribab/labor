import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Globe2,
  Loader2,
  Rocket,
  X,
} from "lucide-react";

import { db } from "../lib/firebase";
import {
  callAddCustomDomain,
  callReleaseTheApp,
} from "../lib/agent";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "../lib/laborBrand";
import CloudBuildLogPanel from "./CloudBuildLogPanel";
import CustomDomainSetup from "./CustomDomainSetup";

function normalizeReleaseReply(data) {
  if (!data) return null;
  return {
    status: String(data.status || "processing"),
    phase: String(data.phase || ""),
    finalTextMd: String(data.finalTextMd || ""),
    requiresUserInput: Boolean(data.requiresUserInput),
    error: String(data.error || ""),
    jsonData: data.jsonData || {},
    updatedAtMs:
      Number(data.updatedAtMs || data.lastUpdatedMs || 0) ||
      Number(data.updatedAt?.seconds || 0) * 1000,
  };
}

function normalizeDomainList(value) {
  return Array.isArray(value)
    ? value.filter((item) => item?.customDomain)
    : [];
}

function SectionStatus({ tone = "neutral", children }) {
  const tones = {
    success: "text-emerald-300",
    warning: "text-amber-200",
    danger: "text-red-300",
    neutral: "text-slate-500",
  };
  return (
    <span className={`text-[10px] font-medium ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

function ReleaseSection({
  id,
  title,
  description,
  icon: Icon,
  open,
  onToggle,
  status,
  children,
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0, lightX: 50, lightY: 0 });

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    setTilt({
      x: (0.5 - y) * 0.8,
      y: (x - 0.5) * 0.8,
      lightX: Math.round(x * 100),
      lightY: Math.round(y * 100),
    });
  };

  return (
    <section
      className="tk-glass-card relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] transition-[border-color,transform] duration-200 hover:border-white/[0.14]"
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() =>
        setTilt({ x: 0, y: 0, lightX: 50, lightY: 0 })
      }
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: `radial-gradient(circle at ${tilt.lightX}% ${tilt.lightY}%, rgba(255,255,255,0.08), transparent 34%)`,
        }}
      />
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-black/20 text-slate-300">
          <Icon size={15} strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{title}</span>
            {status}
          </span>
          <span className="mt-0.5 block text-xs font-light leading-5 text-slate-500">
            {description}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-600 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="relative border-t border-white/[0.06] px-4 pb-4 pt-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ToggleRow({ label, detail, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        <span className="mt-0.5 block text-xs font-light leading-5 text-slate-500">
          {detail}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-white/10 transition peer-checked:bg-emerald-400/70 peer-focus-visible:ring-2 peer-focus-visible:ring-white/40">
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function ReleaseApplicationModal({
  open,
  onClose,
  userDocId,
  runId,
  previewUrl,
  productName,
  onReleased,
}) {
  const [openSection, setOpenSection] = useState("domain");
  const [customDomain, setCustomDomain] = useState("");
  const [domains, setDomains] = useState([]);
  const [domainFormOpen, setDomainFormOpen] = useState(false);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [expandedDomain, setExpandedDomain] = useState("");
  const [domainAction, setDomainAction] = useState({
    customDomain: "",
    action: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [stripeKey, setStripeKey] = useState("");
  const [stripeState, setStripeState] = useState("idle");
  const [stripeError, setStripeError] = useState("");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [seoEnabled, setSeoEnabled] = useState(true);
  const [releaseId, setReleaseId] = useState("");
  const [releaseReply, setReleaseReply] = useState(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState("");
  const releasedCallbackRef = useRef("");

  const releaseWorking = ["queued", "processing", "thinking", "running"].includes(
    releaseReply?.status
  );
  const releaseCompleted = releaseReply?.status === "completed";
  const searchIndexing = releaseReply?.jsonData?.searchIndexing || null;
  const searchIndexingStatus = String(
    searchIndexing?.status || ""
  ).toLowerCase();
  const searchIndexingNeedsAttention =
    releaseCompleted &&
    ["failed", "partial"].includes(searchIndexingStatus);
  const connectedDomainCount = domains.filter(
    (item) => item.status === "connected"
  ).length;
  const configuration = useMemo(
    () => ({
      customDomain: "",
      customDomainSkipped: true,
      stripePublishableKey: stripeState === "saved" ? stripeKey.trim() : "",
      stripeSkipped: stripeState !== "saved",
      analyticsEnabled,
      seoEnabled,
    }),
    [
      analyticsEnabled,
      seoEnabled,
      stripeKey,
      stripeState,
    ]
  );
  const stripeNeedsDecision =
    Boolean(stripeKey.trim()) &&
    !["saved", "skipped"].includes(stripeState);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !userDocId || !runId) return undefined;
    let active = true;
    setCustomDomain("");
    setDomainFormOpen(false);
    setExpandedDomain("");
    setDeleteConfirm("");
    setDomainsLoading(true);
    setDomainError("");
    callAddCustomDomain({
      action: "list",
      email: userDocId,
      runid: runId,
    })
      .then((result) => {
        if (active) setDomains(normalizeDomainList(result.domains));
      })
      .catch((error) => {
        if (active) {
          setDomainError(
            error.message || "Could not load the configured domains."
          );
        }
      })
      .finally(() => {
        if (active) setDomainsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, runId, userDocId]);

  useEffect(() => {
    if (!open || !userDocId || !runId || releaseId) return undefined;
    return onSnapshot(
      doc(db, ROOT_COLLECTION, userDocId, "releases", runId),
      (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() || {} : {};
        if (
          ["queued", "processing", "running"].includes(String(data.status || "")) &&
          data.latestReleaseId
        ) {
          setReleaseId(String(data.latestReleaseId));
        }
      }
    );
  }, [open, releaseId, runId, userDocId]);

  useEffect(() => {
    if (!userDocId || !runId || !releaseId) {
      setReleaseReply(null);
      return undefined;
    }
    return onSnapshot(
      doc(
        db,
        ROOT_COLLECTION,
        userDocId,
        "runs",
        runId,
        "releases",
        releaseId
      ),
      (snapshot) => {
        const nextReply = normalizeReleaseReply(
          snapshot.exists() ? snapshot.data() || {} : null
        );
        setReleaseReply(nextReply);
        if (
          nextReply?.status === "completed" &&
          releasedCallbackRef.current !== releaseId
        ) {
          releasedCallbackRef.current = releaseId;
          onReleased?.(nextReply.jsonData || {});
        }
      },
      (error) => setReleaseError(error.message)
    );
  }, [onReleased, releaseId, runId, userDocId]);

  if (!open) return null;

  const toggleSection = (id) => {
    setOpenSection((current) => (current === id ? "" : id));
  };

  const addDomain = async () => {
    if (!customDomain.trim() || domainBusy) return;
    const submittedDomain = customDomain.trim();
    setDomainBusy(true);
    setDomainError("");
    setReleaseError("");
    try {
      const result = await callAddCustomDomain({
        action: "add",
        email: userDocId,
        runid: runId,
        customDomain: submittedDomain,
      });
      setDomains(normalizeDomainList(result.domains));
      setExpandedDomain(
        String(result.domain?.customDomain || submittedDomain).toLowerCase()
      );
      setCustomDomain("");
      setDomainFormOpen(false);
    } catch (error) {
      setDomainError(error.message || "Could not add this domain.");
    } finally {
      setDomainBusy(false);
    }
  };

  const runDomainAction = async (action, customDomainName) => {
    if (!customDomainName || domainAction.action) return;
    setDomainAction({ customDomain: customDomainName, action });
    setDomainError("");
    try {
      const result = await callAddCustomDomain({
        action,
        email: userDocId,
        runid: runId,
        customDomain: customDomainName,
      });
      setDomains(normalizeDomainList(result.domains));
      if (action === "delete") {
        setDeleteConfirm("");
        setExpandedDomain((current) =>
          current === customDomainName ? "" : current
        );
      }
    } catch (error) {
      setDomainError(
        error.message ||
          (action === "delete"
            ? "Could not delete this domain."
            : "Could not refresh this domain.")
      );
    } finally {
      setDomainAction({ customDomain: "", action: "" });
    }
  };

  const toggleDomain = (customDomainName) => {
    if (expandedDomain === customDomainName) {
      setExpandedDomain("");
      setDeleteConfirm("");
      return;
    }
    setExpandedDomain(customDomainName);
    setDeleteConfirm("");
    runDomainAction("details", customDomainName);
  };

  const saveStripeKey = () => {
    const key = stripeKey.trim();
    if (!/^pk_(?:test|live)_[A-Za-z0-9_]{8,}$/.test(key)) {
      setStripeError("Use a Stripe publishable key beginning with pk_test_ or pk_live_.");
      return;
    }
    setStripeError("");
    setReleaseError("");
    setStripeState("saved");
    setOpenSection("launch");
  };

  const skipStripe = () => {
    setStripeKey("");
    setStripeError("");
    setStripeState("skipped");
    setReleaseError("");
    setOpenSection("launch");
  };

  const confirmRelease = async () => {
    if (releaseBusy || releaseWorking) return;
    if (stripeNeedsDecision) {
      setOpenSection("payments");
      setReleaseError("Save the Stripe key, or skip payments.");
      return;
    }
    setReleaseBusy(true);
    setReleaseError("");
    try {
      const result = await callReleaseTheApp({
        email: userDocId,
        runid: runId,
        configuration,
      });
      setReleaseId(String(result.releaseId || ""));
    } catch (error) {
      setReleaseError(error.message || "Could not start this release.");
    } finally {
      setReleaseBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-3 py-4 backdrop-blur-xl sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="release-app-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close release window"
      />
      <div className="tk-glass-float relative flex max-h-[min(880px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d]/95">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Rocket size={16} className="text-violet-200" strokeWidth={1.6} />
              <h2 id="release-app-title" className="text-base font-medium text-white">
                Release {productName || "application"}
              </h2>
            </div>
            <p className="mt-1 text-xs font-light text-slate-500">
              Domain, payments, and launch essentials. Everything optional stays optional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-3">
            <ReleaseSection
              id="domain"
              title="Domains"
              description="Your Firebase URL stays primary. Add aliases whenever you need them."
              icon={Globe2}
              open={openSection === "domain"}
              onToggle={toggleSection}
              status={
                domains.length ? (
                  <SectionStatus
                    tone={
                      connectedDomainCount === domains.length
                        ? "success"
                        : "danger"
                    }
                  >
                    {connectedDomainCount === domains.length
                      ? `${domains.length} connected`
                      : `${domains.length - connectedDomainCount} need setup`}
                  </SectionStatus>
                ) : (
                  <SectionStatus>Firebase URL</SectionStatus>
                )
              }
            >
              <div className="grid gap-2.5">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="tk-glass-input flex min-w-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3 transition hover:border-white/[0.14]"
                >
                  <Globe2 size={13} className="shrink-0 text-cyan-200" />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                    {previewUrl}
                  </span>
                  <span className="rounded-md border border-cyan-300/15 bg-cyan-300/[0.07] px-1.5 py-0.5 text-[9px] font-medium text-cyan-100">
                    Primary
                  </span>
                  <ExternalLink size={11} className="shrink-0 text-slate-600" />
                </a>

                {domainsLoading ? (
                  <div className="flex h-12 items-center justify-center text-slate-600">
                    <Loader2 size={13} className="animate-spin" />
                  </div>
                ) : (
                  domains.map((domain) => (
                    <CustomDomainSetup
                      key={domain.customDomain}
                      domain={domain}
                      expanded={expandedDomain === domain.customDomain}
                      busyAction={
                        domainAction.customDomain === domain.customDomain
                          ? domainAction.action
                          : ""
                      }
                      deleteConfirm={
                        deleteConfirm === domain.customDomain
                      }
                      onToggle={toggleDomain}
                      onVerify={(customDomainName) =>
                        runDomainAction("verify", customDomainName)
                      }
                      onDeleteIntent={setDeleteConfirm}
                      onDelete={(customDomainName) =>
                        runDomainAction("delete", customDomainName)
                      }
                      onCancelDelete={() => setDeleteConfirm("")}
                    />
                  ))
                )}

                {domainError && !domainFormOpen ? (
                  <p className="text-xs text-red-300">{domainError}</p>
                ) : null}

                {domainFormOpen ? (
                  <div className="mt-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                    <input
                      value={customDomain}
                      onChange={(event) => {
                        setCustomDomain(event.target.value);
                        setDomainError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addDomain();
                      }}
                      placeholder="app.yourcompany.com"
                      className="tk-glass-input h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-white/25"
                    />
                    {domainError ? (
                      <p className="mt-2 text-xs text-red-300">{domainError}</p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDomainFormOpen(false);
                          setCustomDomain("");
                          setDomainError("");
                        }}
                        className="h-9 px-3 text-xs text-slate-500 transition hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addDomain}
                        disabled={!customDomain.trim() || domainBusy}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-xs font-medium text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-600"
                      >
                        {domainBusy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : null}
                        Continue
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDomainFormOpen(true);
                      setDomainError("");
                    }}
                    className="mt-1 justify-self-start text-xs text-cyan-200/80 transition hover:text-cyan-100"
                  >
                    Add custom domain
                  </button>
                )}
              </div>
            </ReleaseSection>

            <ReleaseSection
              id="payments"
              title="Payments"
              description="Add a Stripe publishable key now, or connect billing later."
              icon={CreditCard}
              open={openSection === "payments"}
              onToggle={toggleSection}
              status={
                stripeState === "saved" ? (
                  <SectionStatus tone="success">Configured</SectionStatus>
                ) : stripeState === "skipped" ? (
                  <SectionStatus tone="danger">Not set up yet</SectionStatus>
                ) : null
              }
            >
              {stripeState === "saved" ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-slate-400">
                    {"*".repeat(Math.min(24, Math.max(8, stripeKey.length - 4)))}
                    {stripeKey.slice(-4)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setStripeState("idle")}
                    className="text-xs text-slate-500 hover:text-white"
                  >
                    Edit
                  </button>
                </div>
              ) : stripeState === "skipped" ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-red-200/70">Not set up yet</span>
                  <button
                    type="button"
                    onClick={() => setStripeState("idle")}
                    className="text-xs text-slate-500 hover:text-white"
                  >
                    Add key
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={stripeKey}
                    onChange={(event) => {
                      setStripeKey(event.target.value);
                      setStripeError("");
                    }}
                    placeholder="pk_live_..."
                    autoComplete="off"
                    className="tk-glass-input h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 font-mono text-xs text-white outline-none transition placeholder:text-slate-700 focus:border-white/25"
                  />
                  <p className="mt-2 text-[11px] font-light leading-5 text-slate-600">
                    This saves the browser-safe key. Checkout and server-side Stripe configuration can be added later.
                  </p>
                  {stripeError ? (
                    <p className="mt-2 text-xs text-red-300">{stripeError}</p>
                  ) : null}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={skipStripe}
                      className="h-9 px-3 text-xs text-slate-500 transition hover:text-slate-200"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={saveStripeKey}
                      disabled={!stripeKey.trim()}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-xs font-medium text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-600"
                    >
                      <Check size={13} />
                      Save
                    </button>
                  </div>
                </>
              )}
            </ReleaseSection>

            <ReleaseSection
              id="launch"
              title="Launch plan"
              description="Prepare measurement and useful public pages."
              icon={Rocket}
              open={openSection === "launch"}
              onToggle={toggleSection}
              status={<SectionStatus tone="success">Ready</SectionStatus>}
            >
              <div className="divide-y divide-white/[0.06]">
                <ToggleRow
                  label="Firebase Analytics"
                  detail="Enable GA4 measurement in the released application."
                  checked={analyticsEnabled}
                  onChange={setAnalyticsEnabled}
                />
                <ToggleRow
                  label="SEO and launch pages"
                  detail="Create launch pages and submit the sitemap to Google Search."
                  checked={seoEnabled}
                  onChange={setSeoEnabled}
                />
              </div>
            </ReleaseSection>
          </div>

          {releaseReply ? (
            <CloudBuildLogPanel
              reply={releaseReply}
              className="mt-4"
              forceTerminal={releaseWorking || Boolean(releaseReply?.jsonData?.buildId)}
              terminalClassName="h-44"
              title={
                releaseCompleted
                  ? "Release complete"
                  : releaseReply.status === "failed"
                    ? "Release failed"
                    : "Publishing release..."
              }
            />
          ) : null}

          {searchIndexingNeedsAttention ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2.5 text-xs font-light leading-5 text-amber-100/80">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                The app is live, but Google Search submission failed. Check the
                domain status in Releases.
              </span>
            </div>
          ) : null}

          {releaseCompleted ? (
            <a
              href={releaseReply?.jsonData?.releaseUrl || previewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15"
            >
              Open released application
              <ExternalLink size={13} />
            </a>
          ) : null}

          {releaseError ? (
            <div className="mt-4 rounded-lg border border-red-300/15 bg-red-300/[0.07] px-3 py-2.5 text-xs text-red-200">
              {releaseError}
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-4">
          <p className="max-w-sm text-[10px] font-light leading-4 text-slate-600">
            Launch pages use your configured model. Release changes are applied to future source updates for this run.
          </p>
          <button
            type="button"
            onClick={releaseCompleted ? onClose : confirmRelease}
            disabled={releaseBusy || releaseWorking}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-xs font-medium text-black transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-600"
          >
            {releaseBusy || releaseWorking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : releaseCompleted ? (
              <Check size={14} />
            ) : (
              <Rocket size={14} />
            )}
            {releaseWorking
              ? "Releasing..."
              : releaseCompleted
                ? "Close"
                : "Confirm"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ReleaseApplicationModal;
