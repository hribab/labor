import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowRight,
  Brain,
  Dna,
  GitBranch,
  History,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  X,
} from "lucide-react";

const GENOME = ["A", "T", "G", "C", "A", "T", "G"];
const MUTATED_GENOME = ["A", "T", "A", "C", "A", "T", "G"];

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Observe the environment",
    text: "Labor searches live market changes and turns them into pressures: new capabilities, falling costs, changed behavior and obsolete workflows.",
    icon: Search,
  },
  {
    number: "02",
    title: "Remember every ancestor",
    text: "It reads the Living Forest, the Graveyard and old idea fingerprints. Survivors reveal useful traits. Every rejected idea leaves a death certificate.",
    icon: History,
  },
  {
    number: "03",
    title: "Create variation",
    text: "It maps 36 different habitats and breeds 240 candidate genomes across SaaS, games and AI systems. Each uses different parents, mutations and ways of thinking.",
    icon: Dna,
  },
  {
    number: "04",
    title: "Apply hostile pressure",
    text: "Ten predators attack customer demand, budget, competition, distribution, engineering, regulation and timing. Hidden dependencies and structural duplicates are eliminated.",
    icon: Swords,
  },
  {
    number: "05",
    title: "Let the diverse survive",
    text: "Labor does not keep ten versions of the same fashionable idea. It preserves champions from different habitats: 4 SaaS products, 3 games and 3 AI systems.",
    icon: Trophy,
  },
  {
    number: "06",
    title: "Evolve the Evolver",
    text: "The evidence changes the breeding recipes, predators, scoring weights and Flow Genome. A challenger replaces the old system only if it wins a Shadow Tournament.",
    icon: RefreshCcw,
  },
];

function GenomeStrip({ mutated = false }) {
  const sequence = mutated ? MUTATED_GENOME : GENOME;

  return (
    <div
      className="flex items-center justify-center gap-1.5"
      aria-label={sequence.join(" ")}
    >
      {sequence.map((letter, index) => {
        const changed = mutated && index === 2;
        return (
          <div
            key={`${letter}-${index}`}
            className={`flex size-8 items-center justify-center rounded-lg border font-mono text-xs font-semibold sm:size-9 ${
              changed
                ? "border-fuchsia-300/55 bg-fuchsia-400/20 text-fuchsia-100 shadow-[0_0_24px_rgba(232,121,249,0.22)]"
                : "border-white/[0.10] bg-white/[0.045] text-slate-400"
            }`}
          >
            {letter}
          </div>
        );
      })}
    </div>
  );
}

function MutationVisual() {
  return (
    <figure className="relative overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0d0f17] p-5 sm:p-7">
      <div className="absolute -left-16 -top-20 size-56 rounded-full bg-cyan-400/[0.07] blur-3xl" />
      <div className="absolute -bottom-24 -right-20 size-64 rounded-full bg-fuchsia-500/[0.09] blur-3xl" />

      <div className="relative grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-5 text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">
            <Dna size={13} />
            Human DNA segment
          </div>
          <GenomeStrip />
        </div>

        <div className="flex flex-col items-center gap-1 text-slate-600">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">
            Copy
          </span>
          <ArrowRight
            size={18}
            className="rotate-90 text-violet-300/60 md:rotate-0"
          />
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">
            Change
          </span>
        </div>

        <div className="relative rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/[0.035] px-4 py-5 text-center">
          <div className="absolute -right-2 -top-4 flex items-center gap-1.5 rounded-full border border-violet-300/20 bg-[#17131f] px-2.5 py-1.5 text-[10px] font-medium text-violet-200 shadow-xl">
            <Brain size={12} />
            How? Why?
          </div>
          <div className="mb-4 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-fuchsia-200/60">
            <Sparkles size={13} />
            Same segment · mutated
          </div>
          <GenomeStrip mutated />
        </div>
      </div>

      <figcaption className="relative mt-5 text-center text-[11px] text-slate-500">
        One copied letter changed. The environment—not the genome—will reveal
        whether it matters.
      </figcaption>
    </figure>
  );
}

function LaborNeedVisual() {
  return (
    <figure className="grid gap-3 md:grid-cols-2">
      <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Agent
        </div>
        <div className="mt-6 flex items-center gap-3">
          <div className="rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
            Exact goal
          </div>
          <div className="h-px flex-1 bg-white/[0.10]" />
          <ArrowRight size={14} className="-ml-3 text-slate-600" />
          <div className="rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
            Expected result
          </div>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          The destination exists before the work begins.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-[22px] border border-violet-300/20 bg-violet-400/[0.055] p-5 sm:p-6">
        <div className="absolute -right-16 -top-16 size-44 rounded-full bg-violet-400/15 blur-3xl" />
        <div className="relative text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/70">
          Evolver
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <div className="rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-2 text-xs text-violet-100">
            Direction
          </div>
          <GitBranch size={18} className="text-violet-300/60" />
          <svg
            viewBox="0 0 180 72"
            className="h-[72px] min-w-0 flex-1"
            aria-hidden="true"
          >
            <path
              d="M2 36 C58 36 62 8 176 8"
              fill="none"
              stroke="rgba(196,181,253,.48)"
            />
            <path
              d="M2 36 C70 36 75 25 176 25"
              fill="none"
              stroke="rgba(196,181,253,.32)"
            />
            <path
              d="M2 36 C70 36 75 47 176 47"
              fill="none"
              stroke="rgba(103,232,249,.32)"
            />
            <path
              d="M2 36 C58 36 62 64 176 64"
              fill="none"
              stroke="rgba(103,232,249,.20)"
            />
            {[8, 25, 47, 64].map((y) => (
              <circle
                key={y}
                cx="176"
                cy={y}
                r="3"
                fill="rgba(221,214,254,.8)"
              />
            ))}
          </svg>
        </div>
        <p className="relative mt-3 text-xs leading-5 text-violet-100/55">
          The destination emerges only after variation, pressure and survival.
        </p>
      </div>
    </figure>
  );
}

function InfinitePathsVisual() {
  return (
    <figure className="relative overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#090b12] px-3 py-5 sm:px-6 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(124,58,237,0.10),transparent_32%),radial-gradient(circle_at_85%_50%,rgba(34,211,238,0.06),transparent_30%)]" />
      <svg
        viewBox="0 0 920 230"
        className="relative h-auto w-full"
        role="img"
        aria-label="One starting direction branching toward many unknown destinations"
      >
        <defs>
          <linearGradient id="evolver-path" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.85" />
            <stop offset="62%" stopColor="#c4b5fd" stopOpacity="0.50" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.12" />
          </linearGradient>
          <filter
            id="evolver-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M70 115 C160 115 220 115 302 115"
          fill="none"
          stroke="url(#evolver-path)"
          strokeWidth="2"
        />
        <path
          d="M302 115 C410 115 455 24 855 24"
          fill="none"
          stroke="url(#evolver-path)"
          strokeWidth="1.4"
        />
        <path
          d="M302 115 C430 115 480 70 885 70"
          fill="none"
          stroke="url(#evolver-path)"
          strokeWidth="1.4"
        />
        <path
          d="M302 115 C470 115 560 115 900 115"
          fill="none"
          stroke="url(#evolver-path)"
          strokeWidth="1.6"
        />
        <path
          d="M302 115 C430 115 480 160 885 160"
          fill="none"
          stroke="url(#evolver-path)"
          strokeWidth="1.4"
        />
        <path
          d="M302 115 C410 115 455 206 855 206"
          fill="none"
          stroke="url(#evolver-path)"
          strokeWidth="1.4"
        />

        <circle
          cx="70"
          cy="115"
          r="13"
          fill="#0b0d15"
          stroke="#8b5cf6"
          strokeOpacity=".6"
        />
        <circle
          cx="70"
          cy="115"
          r="4"
          fill="#ddd6fe"
          filter="url(#evolver-glow)"
        />
        <circle
          cx="302"
          cy="115"
          r="5"
          fill="#a78bfa"
          filter="url(#evolver-glow)"
        />

        {[24, 70, 115, 160, 206].map((y, index) => (
          <g key={y} opacity={0.82 - index * 0.08}>
            <circle
              cx={
                index === 0 || index === 4
                  ? 855
                  : index === 1 || index === 3
                    ? 885
                    : 900
              }
              cy={y}
              r="4"
              fill="#67e8f9"
            />
            <circle
              cx={
                index === 0 || index === 4
                  ? 855
                  : index === 1 || index === 3
                    ? 885
                    : 900
              }
              cy={y}
              r="10"
              fill="none"
              stroke="#67e8f9"
              strokeOpacity=".12"
            />
          </g>
        ))}

        <circle r="5" fill="#f5f3ff" filter="url(#evolver-glow)">
          <animateMotion
            dur="5.5s"
            repeatCount="indefinite"
            path="M70 115 C160 115 220 115 302 115 C430 115 480 70 885 70"
          />
        </circle>

        <text
          x="70"
          y="153"
          textAnchor="middle"
          fill="rgba(196,181,253,.75)"
          fontSize="12"
          fontFamily="ui-monospace, monospace"
        >
          0 → 1
        </text>
        <text
          x="302"
          y="145"
          textAnchor="middle"
          fill="rgba(148,163,184,.65)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          NEXT STEP
        </text>
        <text
          x="786"
          y="116"
          textAnchor="middle"
          fill="rgba(148,163,184,.50)"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          POSSIBLE FUTURES
        </text>
      </svg>
      <figcaption className="relative mt-2 text-center text-xs text-slate-500">
        One starting direction. Many possible futures. No prewritten
        destination.
      </figcaption>
    </figure>
  );
}

function EvolverSummaryVisual() {
  const nodes = ["Direction", "Variation", "Pressure", "Survivors"];

  return (
    <figure className="relative overflow-hidden rounded-[28px] border border-violet-300/15 bg-violet-400/[0.045] p-5 sm:p-8">
      <div className="absolute -left-20 -top-28 size-72 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="absolute -bottom-28 -right-20 size-72 rounded-full bg-cyan-400/[0.08] blur-3xl" />

      <div className="relative text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200/65">
          Evolver, in one picture
        </div>
        <p className="mx-auto mt-3 max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-4xl">
          The result is not the end.
          <span className="block text-violet-200">
            It rewrites the beginning.
          </span>
        </p>
      </div>

      <div className="relative mt-7 grid grid-cols-2 items-center gap-2 sm:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto]">
        {nodes.map((node, index) => (
          <div key={node} className="contents">
            <div
              className={`rounded-full border px-3 py-3 text-center text-xs font-medium sm:px-5 ${
                index === 0
                  ? "border-violet-300/30 bg-violet-300/10 text-violet-100"
                  : index === nodes.length - 1
                    ? "border-cyan-300/25 bg-cyan-300/[0.07] text-cyan-100"
                    : "border-white/[0.09] bg-black/20 text-slate-300"
              }`}
            >
              {node}
            </div>
            {index < nodes.length - 1 ? (
              <div className="hidden items-center sm:flex" aria-hidden="true">
                <div className="h-px flex-1 bg-gradient-to-r from-violet-300/25 to-cyan-300/15" />
                <ArrowRight size={12} className="text-violet-300/50" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="relative mx-auto mt-4 flex max-w-xl items-center justify-center gap-3 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-300/[0.045] px-4 py-3 text-center">
        <RefreshCcw size={15} className="shrink-0 text-fuchsia-200/70" />
        <span className="text-xs font-medium text-fuchsia-100/80">
          Changed system creates the next generation
        </span>
        <ArrowDown size={13} className="text-fuchsia-200/45" />
      </div>
    </figure>
  );
}

export default function LaborReferenceMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);

  const closeDialog = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function closeOnEscape(event) {
      if (event.key === "Escape") closeDialog();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeDialog, open]);

  const modal = open ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#030409]/85 p-2 backdrop-blur-md sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="evolver-article-title"
        aria-describedby="evolver-article-intro"
        className="relative flex max-h-[94vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-white/[0.11] bg-[#090a10] text-left text-white shadow-[0_40px_140px_rgba(0,0,0,0.80)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#090a10]/90 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-full border border-violet-300/25 bg-violet-400/10">
              <Dna size={13} className="text-violet-200" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Evolver · How it works
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeDialog}
            aria-label="Close Evolver article"
            className="flex size-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-slate-400 transition hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overscroll-contain overflow-y-auto">
          <article className="px-5 pb-12 pt-8 sm:px-9 sm:pb-16 sm:pt-12 lg:px-12">
            <header className="mx-auto max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-200/65">
                A new kind of autonomous software
              </div>
              <h1
                id="evolver-article-title"
                className="mt-4 text-[clamp(2.45rem,6vw,5rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-white"
              >
                It begins with a direction.
                <span className="mt-2 block bg-gradient-to-r from-violet-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">
                  Not a destination.
                </span>
              </h1>
              <p
                id="evolver-article-intro"
                className="mt-7 text-base leading-7 text-slate-300 sm:text-lg sm:leading-8"
              >
                An <strong className="font-semibold text-white">Evolver</strong>{" "}
                is a new type of autonomous software system that changes across
                generations, the way a species does. An AI agent is normally
                given an achievable goal and works toward it. An Evolver is
                given only
                <strong className="font-semibold text-violet-200">
                  {" "}
                  0 → 1
                </strong>
                —the first meaningful step.
              </p>
              <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
                That first step sets a direction. From there, the system can
                travel toward outcomes its creator never specified.
              </p>
            </header>

            <section className="mx-auto mt-12 max-w-4xl sm:mt-16">
              <MutationVisual />
              <div className="mx-auto mt-7 max-w-3xl">
                <p className="text-base leading-7 text-slate-300 sm:text-[17px] sm:leading-8">
                  In human DNA, a mutation is a change in the sequence: a letter
                  can be replaced, added, removed, copied or rearranged.{" "}
                  <strong className="font-semibold text-white">
                    The change has no goal.
                  </strong>{" "}
                  Many mutations do nothing, some cause harm, and a few improve
                  survival or reproduction in a particular environment. If a
                  helpful change can pass to children, its carriers may leave
                  more descendants and the change becomes more common.
                </p>
                <p className="mt-4 text-base font-medium leading-7 text-violet-100 sm:text-[17px] sm:leading-8">
                  Mutation creates possibilities. Selection changes which
                  possibilities continue. An Evolver applies this logic to
                  software.
                </p>
              </div>
            </section>

            <section className="mx-auto mt-14 max-w-4xl border-t border-white/[0.07] pt-12 sm:mt-20 sm:pt-16">
              <div className="mx-auto max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/60">
                  Why Labor needs an Evolver
                </div>
                <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-5xl">
                  You cannot command your way to an idea nobody has imagined.
                </h2>
              </div>

              <div className="mt-8">
                <LaborNeedVisual />
              </div>

              <div className="mx-auto mt-7 max-w-3xl">
                <p className="text-base leading-7 text-slate-300 sm:text-[17px] sm:leading-8">
                  Labor’s first direction is{" "}
                  <strong className="font-semibold text-white">
                    idea generation
                  </strong>
                  . It is not told which final idea to reach. It is told to keep
                  searching for software worth building, test each possibility,
                  remember what survives and change how the next generation is
                  created.
                </p>
                <p className="mt-4 text-base leading-7 text-slate-400 sm:text-[17px] sm:leading-8">
                  We control the starting direction and the rules of its
                  environment. We do not control which exact idea emerges, which
                  market it enters or how far the search eventually travels.
                </p>
              </div>

              <div className="mt-9">
                <InfinitePathsVisual />
              </div>
            </section>

            <section className="mx-auto mt-14 max-w-4xl border-t border-white/[0.07] pt-12 sm:mt-20 sm:pt-16">
              <div className="mx-auto max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-200/65">
                  One generation inside Labor
                </div>
                <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-5xl">
                  How direction becomes evolution.
                </h2>
              </div>

              <div className="mx-auto mt-9 max-w-3xl divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {HOW_IT_WORKS.map(({ number, title, text, icon: Icon }) => (
                  <div
                    key={number}
                    className="grid gap-3 py-6 sm:grid-cols-[54px_1fr] sm:gap-5 sm:py-7"
                  >
                    <div className="flex items-center gap-3 sm:block">
                      <div className="flex size-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.035] text-violet-200/70">
                        <Icon size={15} strokeWidth={1.7} />
                      </div>
                      <span className="font-mono text-[10px] text-slate-600 sm:mt-2 sm:block sm:text-center">
                        {number}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold tracking-[-0.02em] text-white sm:text-lg">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-[15px] sm:leading-7">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mx-auto mt-7 flex max-w-3xl items-start gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-5">
                <ShieldCheck
                  size={17}
                  className="mt-0.5 shrink-0 text-cyan-200/70"
                />
                <p className="text-sm leading-6 text-cyan-50/65">
                  The ten survivors are then built, deployed and released. Their
                  real outcomes become evidence for future generations. A
                  generated idea is never mistaken for proven market success.
                </p>
              </div>
            </section>

            <section className="mx-auto mt-14 max-w-4xl sm:mt-20">
              <EvolverSummaryVisual />
            </section>

            <footer className="mx-auto mt-10 max-w-3xl border-t border-white/[0.07] pt-9 sm:mt-14 sm:pt-11">
              <p className="text-lg leading-8 text-slate-300 sm:text-xl sm:leading-9">
                Labor uses the Evolver architecture for idea generation, but
                idea generation is only one possible use. The same architecture
                could evolve research strategies, product designs, simulations,
                workflows and other software systems.
              </p>
              <p className="mt-5 text-lg font-medium leading-8 text-white sm:text-xl sm:leading-9">
                An Evolver keeps changing within the direction we started. We
                choose its first step.
                <span className="text-violet-200">
                  {" "}
                  We do not control its final destination.
                </span>
              </p>
            </footer>
          </article>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white transition hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
      >
        How it works
        <ArrowRight size={12} className="text-violet-200/70" />
      </button>
      {typeof document !== "undefined" && modal
        ? createPortal(modal, document.body)
        : null}
    </>
  );
}