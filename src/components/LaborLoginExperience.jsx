import { useEffect, useRef } from "react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Code2,
  Dna,
  GitBranch,
  Github,
  Lightbulb,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import LaborLogo from "./LaborLogo";
import {
  LABOR_GITHUB_URL,
} from "../lib/laborBrand";
import "../styles/login-experience.css";

const PRODUCT_JOURNEY = [
  {
    title: "Idea",
    text: "Bring yours or let Evolver search",
    icon: Lightbulb,
  },
  {
    title: "Code",
    text: "One complete, coherent build",
    icon: Code2,
  },
  {
    title: "Cloud",
    text: "Deployed into your infrastructure",
    icon: Cloud,
  },
  {
    title: "Release",
    text: "Launch material and production release",
    icon: Rocket,
  },
  {
    title: "Manage",
    text: "Features, customer strategy, and growth",
    icon: RefreshCw,
  },
];

const CONVENTIONAL_WORKFLOW = [
  "You choose the software stack",
  "You divide the product into small tasks",
  "You prompt and review every step",
  "You assemble, deploy, and manage the pieces",
];

const LABOR_WORKFLOW = [
  "Give Labor the complete product idea",
  "One model call generates the complete first version",
  "Labor deploys it into your cloud",
  "Labor releases, extends, and manages the product",
];

const FOREVER_FREE_REASONS = [
  "Solopreneurs should not lose sleep assembling tools that should work for them.",
  "Great entrepreneurs should not be stopped because a builder is missing from the room.",
  "New graduates should be able to turn an idea into something useful without capital or gatekeepers.",
];

function GoogleSignInButton({ busy, onSignIn }) {
  return (
    <button
      type="button"
      onClick={onSignIn}
      disabled={busy}
      aria-busy={busy}
      className="labor-login__google-button group inline-flex h-12 min-w-56 items-center justify-center gap-3 bg-white px-5 text-sm font-semibold text-black transition hover:bg-slate-100 disabled:cursor-wait disabled:bg-white/15 disabled:text-slate-500"
    >
      {busy ? (
        <Loader2 className="animate-spin" size={17} strokeWidth={2} />
      ) : (
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt=""
          className="size-4"
        />
      )}
      {busy ? "Signing you in..." : "Continue with Google"}
      {!busy ? (
        <ArrowRight
          size={14}
          className="text-slate-500 transition-transform group-hover:translate-x-0.5"
        />
      ) : null}
    </button>
  );
}

function ProductJourney() {
  return (
    <div className="labor-login__journey" aria-label="Labor product lifecycle">
      <div className="labor-login__journey-line" aria-hidden="true" />
      {PRODUCT_JOURNEY.map(({ title, text, icon: Icon }, index) => (
        <div
          key={title}
          className="labor-login__journey-step"
          style={{ "--labor-step": index }}
        >
          <div className="labor-login__journey-icon">
            <Icon size={17} strokeWidth={1.7} />
          </div>
          <div className="mt-3 text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 max-w-36 text-[11px] leading-4 text-slate-500">
            {text}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowColumn({ label, title, items, labor = false }) {
  const iconClass = labor
    ? "border-violet-200/25 bg-violet-300/10 text-violet-100"
    : "border-white/10 bg-white/[0.035] text-slate-500";
  const checkClass = labor ? "text-violet-200" : "text-slate-600";

  return (
    <div
      className={[
        "labor-login__workflow",
        labor ? "is-labor" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <div
          className={[
            "flex size-8 items-center justify-center rounded-full border",
            iconClass,
          ].join(" ")}
        >
          {labor ? (
            <Sparkles size={14} strokeWidth={1.7} />
          ) : (
            <GitBranch size={14} strokeWidth={1.7} />
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-semibold leading-7 text-white sm:text-2xl">
        {title}
      </h3>
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3">
            <CheckCircle2
              size={15}
              strokeWidth={1.7}
              className={["mt-0.5 shrink-0", checkClass].join(" ")}
            />
            <span className="text-sm leading-5 text-slate-400">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LaborLoginExperience({ busy, error, onSignIn }) {
  const signInRef = useRef(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      signInRef.current?.querySelector("button")?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="labor-login fixed inset-0 z-[100] overflow-y-auto p-2 sm:p-5">
      <main className="relative mx-auto flex min-h-full w-full max-w-[1120px] items-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="labor-login-title"
          aria-describedby="labor-login-intro"
          className="labor-login__surface my-auto flex max-h-[calc(100vh-1rem)] w-full flex-col overflow-hidden text-left text-white sm:max-h-[calc(100vh-2.5rem)]"
        >
          <div className="labor-login__masthead flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="labor-login__brand-mark flex size-8 items-center justify-center rounded-full">
                <LaborLogo
                  decorative
                  className="size-5 object-contain drop-shadow-[0_0_8px_rgba(255,38,54,0.28)]"
                />
              </div>
              <span className="text-sm font-semibold text-white">Labor</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span className="hidden items-center gap-2 sm:inline-flex">
                <span className="labor-login__live-dot" aria-hidden="true" />
                Free forever
              </span>
              <a
                href={LABOR_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
              >
                <Github size={13} strokeWidth={1.7} />
                GitHub
              </a>
            </div>
          </div>

          <div className="tk-scrollbar min-h-0 flex-1 overflow-y-auto">
            <article>
              <header className="labor-login__hero px-5 pb-12 pt-12 text-center sm:px-10 sm:pb-16 sm:pt-16 lg:px-16">
                <div className="labor-login__eyebrow mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-100">
                  <ShieldCheck size={12} strokeWidth={1.8} />
                  Fully open source. Free forever.
                </div>
                <h1
                  id="labor-login-title"
                  className="mt-6 text-6xl font-semibold leading-none tracking-normal text-white sm:text-7xl lg:text-[88px]"
                >
                  Labor
                </h1>
                <p className="mt-5 text-2xl font-semibold leading-8 tracking-normal text-white sm:text-4xl sm:leading-[1.15]">
                  Build it. Release it. Keep it alive.
                </p>
                <p
                  id="labor-login-intro"
                  className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base sm:leading-7"
                >
                  Labor is an autonomous coding agent that takes a product from
                  idea to production. It writes the software, deploys it into
                  your cloud, prepares the release, and manages what comes next.
                  No subscription, premium tier, or paid feature gates.
                </p>

                <div ref={signInRef} className="mt-8 inline-flex">
                  <GoogleSignInButton busy={busy} onSignIn={onSignIn} />
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-500">
                  <Cloud size={12} strokeWidth={1.7} />
                  Your code, infrastructure, and releases stay in your cloud.
                </div>
                <nav
                  aria-label="Labor links"
                  className="mt-4 flex items-center justify-center gap-4 text-[11px] font-medium text-slate-500"
                >
                  <a
                    href={LABOR_GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
                  >
                    <Github size={12} strokeWidth={1.7} />
                    Source
                  </a>
                  <span aria-hidden="true" className="text-white/15">
                    /
                  </span>
                  <a
                    href="/privacy"
                    className="transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
                  >
                    Privacy
                  </a>
                  <span aria-hidden="true" className="text-white/15">
                    /
                  </span>
                  <a
                    href="/terms"
                    className="transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
                  >
                    Terms
                  </a>
                </nav>

                {error ? (
                  <div
                    role="alert"
                    className="labor-login__error mx-auto mt-6 max-w-xl px-4 py-3 text-sm text-red-100"
                  >
                    {error}
                  </div>
                ) : null}

                <div className="mt-12 sm:mt-16">
                  <ProductJourney />
                </div>
              </header>

              <section className="labor-login__section px-5 py-12 sm:px-10 sm:py-16 lg:px-16">
                <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                      Beyond code generation
                    </div>
                    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-white sm:text-4xl">
                      Code is 1%. Getting people to use it is the other 99%.
                    </h2>
                  </div>
                  <div className="space-y-5 text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">
                    <p>
                      Most coding tools are made for developers building software
                      one feature at a time. Labor is made for executives,
                      builders, and entrepreneurs who want to launch a complete
                      product. Give Labor the idea. It generates the first version
                      in one model call, deploys it, releases it, and helps real
                      customers find and use it.
                    </p>
                    <p className="font-medium text-slate-200">
                      Think of it as an autonomous product owner with an
                      engineering team, release process, and growth loop built in.
                    </p>
                    <div className="labor-login__ownership-line flex items-center gap-3 py-4 text-xs font-semibold uppercase tracking-[0.13em] text-slate-300">
                      <BrainCircuit size={15} className="text-cyan-200/80" />
                      Strategy
                      <ArrowRight size={12} className="text-slate-600" />
                      Product
                      <ArrowRight size={12} className="text-slate-600" />
                      Production
                      <ArrowRight size={12} className="text-slate-600" />
                      Growth
                    </div>
                  </div>
                </div>
              </section>

              <section className="labor-login__section px-5 py-12 sm:px-10 sm:py-16 lg:px-16">
                <div className="mx-auto max-w-3xl text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/75">
                    A different assumption
                  </div>
                  <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-white sm:text-4xl">
                    Single Shot Product Generation.
                  </h2>
                  <div className="mx-auto mt-5 max-w-2xl space-y-4 text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">
                    <p>
                      Labor is built on a simple bet: models will become advanced
                      enough to generate a full, complex product in a single model
                      call. Instead of giving the model one tiny ticket at a
                      time, Labor gives it the whole product and asks for the
                      complete first version.
                    </p>
                    <p>
                      The first versions of many major operating systems and
                      software stacks were well under one million lines of code.
                    </p>
                    <p className="font-semibold text-white">
                      Labor asks model for the complete first system, not task 1 of 1,000.
                    </p>
                  </div>
                </div>

                <div className="labor-login__comparison mt-10 grid md:grid-cols-2">
                  <WorkflowColumn
                    label="Conventional coding tools"
                    title="You manage every piece."
                    items={CONVENTIONAL_WORKFLOW}
                  />
                  <WorkflowColumn
                    labor
                    label="Labor · Single Shot"
                    title="Labor generates the whole first version."
                    items={LABOR_WORKFLOW}
                  />
                </div>
              </section>

              <section className="labor-login__section labor-login__evolver px-5 py-12 sm:px-10 sm:py-16 lg:px-16">
                <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
                  <div className="labor-login__zero-one" aria-hidden="true">
                    <div className="labor-login__zero-node">0</div>
                    <div className="labor-login__zero-path">
                      <span />
                    </div>
                    <div className="labor-login__one-node">1</div>
                    <div className="labor-login__branches">
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="labor-login__future-nodes">
                      <b />
                      <b />
                      <b />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200/75">
                      <Dna size={13} strokeWidth={1.7} />
                      Evolver · 0 → 1
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold leading-8 tracking-normal text-white sm:text-3xl sm:leading-9">
                      A system that learns how to search.
                    </h2>
                    <p className="mt-5 text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">
                      An <strong className="font-semibold text-white">Evolver</strong>{" "}
                      is software that starts with a direction, not a fixed answer.
                      It explores different paths, keeps what works, remembers what
                      fails, and changes how it searches next time.
                    </p>

                    <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                      <div className="grid gap-1 py-4 sm:grid-cols-[86px_1fr] sm:gap-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-200/70">
                          Direction
                        </div>
                        <p className="text-sm leading-5 text-slate-400">
                          Start with one next step,{" "}
                          <strong className="font-semibold text-slate-200">
                            0 → 1
                          </strong>
                          , instead of choosing the final destination.
                        </p>
                      </div>
                      <div className="grid gap-1 py-4 sm:grid-cols-[86px_1fr] sm:gap-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-200/70">
                          Evolution
                        </div>
                        <p className="text-sm leading-5 text-slate-400">
                          Create possibilities → test them → keep the survivors →
                          remember and improve.
                        </p>
                      </div>
                      <div className="grid gap-1 py-4 sm:grid-cols-[86px_1fr] sm:gap-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-200/70">
                          In Labor
                        </div>
                        <p className="text-sm leading-5 text-slate-400">
                          Evolver searches for software worth building. Labor then
                          builds, deploys, releases, and manages the surviving ideas.
                        </p>
                      </div>
                    </div>

                    <div className="labor-login__hypothesis mt-7 px-5 py-5">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-violet-200/80">
                        <Sparkles size={13} />
                        The hypothesis
                      </div>
                      <p className="mt-3 text-sm font-medium leading-6 text-slate-200">
                        As Labor learns across generations, it may discover a
                        breakthrough product that a fixed idea prompt would never
                        produce.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="labor-login__section px-5 py-12 sm:px-10 sm:py-16 lg:px-16">
                <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75">
                      The Forever Free Pledge
                    </div>
                    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-white sm:text-4xl">
                      Labor will never have a premium tier.
                    </h2>
                    <p className="mt-5 text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">
                      Every official Labor capability will remain available to
                      everyone in the public repository. The source is open so
                      the promise can be inspected, improved, and carried forward
                      by the community.
                    </p>
                    <a
                      href={LABOR_GITHUB_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white transition hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
                    >
                      <Github size={15} strokeWidth={1.7} />
                      Read the source
                      <ArrowRight size={13} className="text-violet-200/70" />
                    </a>
                  </div>

                  <div>
                    <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                      {FOREVER_FREE_REASONS.map((reason, index) => (
                        <div
                          key={reason}
                          className="grid gap-2 py-5 sm:grid-cols-[36px_1fr] sm:gap-4"
                        >
                          <span className="font-mono text-xs text-emerald-200/55">
                            0{index + 1}
                          </span>
                          <p className="text-sm font-medium leading-6 text-slate-300 sm:text-base sm:leading-7">
                            {reason}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-5 text-xs leading-5 text-slate-600">
                      Labor costs $0. The model and cloud providers you connect
                      may bill their usage directly to your accounts.
                    </p>
                  </div>
                </div>
              </section>

              <footer className="labor-login__footer px-5 py-12 text-center sm:px-10 sm:py-16">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-violet-200/20 bg-violet-300/[0.08] text-violet-100">
                  <Sparkles size={16} />
                </div>
                <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/70">
                  The builder economy
                </div>
                <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-semibold leading-8 tracking-normal text-white sm:text-3xl sm:leading-10">
                  The future belongs to people who keep building.
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">
                  You do not need permission, a giant team, or a perfect plan.
                  Every meaningful product began with someone willing to make the
                  first version and put it into the world.
                </p>

                <div className="labor-login__builder-loop mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 sm:gap-4">
                  <span>Build</span>
                  <ArrowRight size={12} className="text-violet-200/50" />
                  <span>Ship</span>
                  <ArrowRight size={12} className="text-violet-200/50" />
                  <span>Listen</span>
                  <ArrowRight size={12} className="text-violet-200/50" />
                  <span>Build again</span>
                </div>

                <p className="mx-auto mt-8 max-w-xl text-base font-semibold leading-7 text-violet-100">
                  Labor gives you leverage. Your courage gives it direction.
                  <span className="ml-1 text-white">Keep building.</span>
                </p>
              </footer>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
