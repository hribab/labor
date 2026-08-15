import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import {
  LABOR_GITHUB_URL,
  LABOR_PRODUCTION_URL,
} from "../lib/laborBrand";
import LaborLogo from "./LaborLogo";
import "../styles/legal.css";

const LEGAL_ROUTES = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

function useLegalMetadata({ title, description, path }) {
  useEffect(() => {
    const previousTitle = document.title;
    const absoluteUrl = new URL(path, LABOR_PRODUCTION_URL).href;
    const updates = [
      ['meta[name="description"]', "content", description],
      ['meta[property="og:title"]', "content", `${title} | Labor`],
      ['meta[property="og:description"]', "content", description],
      ['meta[property="og:url"]', "content", absoluteUrl],
      ['meta[name="twitter:title"]', "content", `${title} | Labor`],
      ['meta[name="twitter:description"]', "content", description],
      ['link[rel="canonical"]', "href", absoluteUrl],
    ];
    const previousValues = updates.map(([selector, attribute, value]) => {
      const element = document.querySelector(selector);
      const previousValue = element?.getAttribute(attribute) ?? null;
      if (element) element.setAttribute(attribute, value);
      return { element, attribute, previousValue };
    });

    document.title = `${title} | Labor`;

    return () => {
      document.title = previousTitle;
      previousValues.forEach(({ element, attribute, previousValue }) => {
        if (!element) return;
        if (previousValue === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, previousValue);
      });
    };
  }, [description, path, title]);
}

export function LegalSection({ id, number, title, children }) {
  return (
    <section id={id} className="labor-legal__section">
      <div className="labor-legal__section-heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      <div className="labor-legal__prose">{children}</div>
    </section>
  );
}

export function LegalList({ children }) {
  return <ul className="labor-legal__list">{children}</ul>;
}

export default function LegalDocument({
  title,
  eyebrow,
  summary,
  description,
  path,
  updated,
  toc,
  children,
}) {
  useLegalMetadata({ title, description, path });

  return (
    <div className="labor-legal min-h-screen text-slate-300">
      <header className="labor-legal__header">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-5 px-5 sm:px-8">
          <a
            href="/"
            className="inline-flex min-w-0 items-center gap-2.5 text-white transition hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
          >
            <LaborLogo
              decorative
              className="size-7 shrink-0 object-contain drop-shadow-[0_0_10px_rgba(255,38,54,0.24)]"
            />
            <span className="text-sm font-semibold">Labor</span>
          </a>

          <nav aria-label="Legal pages" className="flex items-center gap-5">
            {LEGAL_ROUTES.map((item) => {
              const active = item.href === path;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200",
                    active
                      ? "text-white"
                      : "text-slate-500 hover:text-slate-200",
                  ].join(" ")}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-16">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
        >
          <ArrowLeft size={13} strokeWidth={1.8} />
          Back to Labor
        </a>

        <div className="mt-9 max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/75">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
            {summary}
          </p>
          <p className="mt-5 text-xs text-slate-600">Last updated {updated}</p>
        </div>

        <div className="mt-14 grid items-start gap-12 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-20">
          <aside className="labor-legal__toc lg:sticky lg:top-24">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              On this page
            </p>
            <nav aria-label={`${title} sections`} className="mt-4">
              {toc.map((item) => (
                <a key={item.id} href={`#${item.id}`}>
                  <span>{item.number}</span>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 border-t border-white/[0.09]">
            {children}
          </article>
        </div>
      </main>

      <footer className="labor-legal__footer">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-7 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Labor. Build it, release it, keep it alive.</span>
          <div className="flex items-center gap-5">
            <a href={LABOR_GITHUB_URL} target="_blank" rel="noreferrer">
              Source
            </a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:hari@onroad.app">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
