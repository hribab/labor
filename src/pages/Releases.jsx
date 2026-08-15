import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ExternalLink,
  Loader2,
  Rocket,
} from "lucide-react";

import ReleaseDetails from "../components/ReleaseDetails";
import { db, userFacingFirebaseError } from "../lib/firebase";
import { LABOR_DATA_ROOT_COLLECTION as ROOT_COLLECTION } from "../lib/laborBrand";

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function formatReleaseDate(release) {
  const ms =
    Number(release.releasedAtMs || release.createdAtMs || 0) ||
    timestampMs(release.updatedAt);
  if (!ms) return "Release date pending";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function releaseTone(status) {
  if (status === "completed") {
    return "border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200";
  }
  if (status === "failed") {
    return "border-red-300/15 bg-red-300/[0.07] text-red-200";
  }
  return "border-amber-300/15 bg-amber-300/[0.07] text-amber-100";
}

function Releases({ userDocId, onOpenRun }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");

  useEffect(() => {
    if (!userDocId) {
      setReleases([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    return onSnapshot(
      collection(db, ROOT_COLLECTION, userDocId, "releases"),
      (snapshot) => {
        setReleases(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() || {}),
          }))
        );
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        setError(userFacingFirebaseError(snapshotError));
        setLoading(false);
      }
    );
  }, [userDocId]);

  const sortedReleases = useMemo(
    () =>
      releases.slice().sort((left, right) => {
        const rightTime =
          Number(right.releasedAtMs || right.createdAtMs || 0) ||
          timestampMs(right.updatedAt);
        const leftTime =
          Number(left.releasedAtMs || left.createdAtMs || 0) ||
          timestampMs(left.updatedAt);
        return rightTime - leftTime;
      }),
    [releases]
  );
  const selectedRelease = useMemo(
    () =>
      selectedRunId
        ? sortedReleases.find(
            (release) => String(release.runId || release.id) === selectedRunId
          ) || null
        : null,
    [selectedRunId, sortedReleases]
  );

  if (selectedRelease) {
    return (
      <div className="tk-page-surface tk-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#0A0A0A] px-5 pb-16 pt-20 sm:px-8">
        <ReleaseDetails
          key={String(selectedRelease.runId || selectedRelease.id)}
          release={selectedRelease}
          userDocId={userDocId}
          onBack={() => setSelectedRunId("")}
          onOpenRun={onOpenRun}
        />
      </div>
    );
  }

  return (
    <div className="tk-page-surface tk-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#0A0A0A] px-5 pb-16 pt-20 sm:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-end justify-between gap-4 border-b border-white/[0.07] pb-5">
          <div>
            <div className="flex items-center gap-2 text-white">
              <Rocket size={18} className="text-violet-200" strokeWidth={1.6} />
              <h1 className="text-xl font-medium">Releases</h1>
            </div>
            <p className="mt-2 text-sm font-light text-slate-500">
              Public versions of your generated applications.
            </p>
          </div>
          <span className="text-xs text-slate-600">
            {sortedReleases.length} total
          </span>
        </header>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" />
            Loading releases
          </div>
        ) : error ? (
          <div className="mt-6 rounded-lg border border-red-300/15 bg-red-300/[0.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : !sortedReleases.length ? (
          <div className="flex min-h-[42vh] flex-col items-center justify-center text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-500">
              <Rocket size={18} strokeWidth={1.5} />
            </span>
            <h2 className="mt-4 text-sm font-medium text-slate-200">
              No releases yet
            </h2>
            <p className="mt-1 text-xs font-light text-slate-600">
              Open a live application and choose Release.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {sortedReleases.map((release) => {
              const status = String(release.status || "queued").toLowerCase();
              const releaseUrl = String(
                release.previewUrl || release.releaseUrl || ""
              );
              const customDomainCount = Array.isArray(release.customDomains)
                ? release.customDomains.length
                : Number(release.customDomainCount || 0);
              return (
                <article
                  key={release.id}
                  className="tk-glass-card flex min-h-56 flex-col rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:border-white/[0.14] hover:bg-white/[0.035]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-medium text-white">
                        {release.productName || "Generated application"}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-xs font-light leading-5 text-slate-500">
                        {release.productDescription || "Released application"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium capitalize ${releaseTone(
                        status
                      )}`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="mt-5 min-w-0">
                    <div className="text-[10px] uppercase text-slate-700">URL</div>
                    {releaseUrl ? (
                      <a
                        href={releaseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-300 transition hover:text-white"
                      >
                        <span className="truncate">{releaseUrl}</span>
                        <ExternalLink size={12} className="shrink-0" />
                      </a>
                    ) : (
                      <span className="mt-1 block text-xs text-slate-600">
                        Pending
                      </span>
                    )}
                  </div>

                  <div className="mt-4 text-xs font-light text-slate-600">
                    {formatReleaseDate(release)}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                    <span className="text-[10px] text-slate-700">
                      {customDomainCount
                        ? `${customDomainCount} custom ${
                            customDomainCount === 1 ? "domain" : "domains"
                          }`
                        : "Firebase Hosting"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedRunId(String(release.runId || release.id))
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      View
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

export default Releases;
