import { Suspense, useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { ALL_ENTRIES, DESIGN_SYSTEM, NAV_GROUPS, OVERVIEW_ENTRY } from "./registry";

function readPage() {
  const id = new URLSearchParams(window.location.hash.slice(1)).get("page");
  return ALL_ENTRIES.some(entry => entry.id === id) ? id! : OVERVIEW_ENTRY.id;
}

export function DesignSystemBrowser() {
  const [selected, setSelected] = useState(readPage);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const onHash = () => setSelected(readPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    return () => { document.documentElement.classList.remove("dark"); document.documentElement.style.colorScheme = ""; };
  }, [dark]);
  const active = ALL_ENTRIES.find(entry => entry.id === selected) ?? OVERVIEW_ENTRY;
  const Page = active.Page;
  const filtered = NAV_GROUPS.map(group => ({ ...group, entries: group.entries.filter(entry => `${group.name} ${entry.name} ${entry.description}`.toLowerCase().includes(query.toLowerCase())) })).filter(group => group.entries.length);
  const select = (id: string) => {
    setSelected(id);
    window.location.hash = new URLSearchParams({ page: id }).toString();
    document.querySelector<HTMLDetailsElement>("[data-mobile-nav]")?.removeAttribute("open");
    window.scrollTo(0, 0);
    requestAnimationFrame(() => document.getElementById("guide-content")?.focus());
  };
  const nav = <nav aria-label="Design system sections" className="space-y-5 p-5">
    <button type="button" onClick={() => select("overview")} aria-current={selected === "overview" ? "page" : undefined}
      className="w-full px-3 py-2 text-start text-sm hover:bg-background aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">Overview</button>
    {filtered.map(group => <section key={group.name}>
      <h2 className="mb-2 px-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{group.name}</h2>
      {group.entries.map(entry => <button key={entry.id} type="button" onClick={() => select(entry.id)} aria-current={selected === entry.id ? "page" : undefined}
        className="block w-full border-s border-border px-3 py-2 text-start text-[13px] hover:bg-background aria-[current=page]:border-primary aria-[current=page]:bg-background aria-[current=page]:font-semibold aria-[current=page]:text-primary focus-visible:outline-2 focus-visible:outline-ring">{entry.name}</button>)}
    </section>)}
    {!filtered.length && query && <p className="text-sm text-muted-foreground" role="status">No matching sections.</p>}
  </nav>;
  return <div className="min-h-dvh bg-background text-foreground md:grid md:grid-cols-[248px_minmax(0,1fr)]">
    <a href="#guide-content" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:bg-card focus:p-3">Skip to content</a>
    <aside className="border-b border-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-e md:border-b-0">
      <div className="border-b border-border p-6">
        <p className="font-sans text-2xl font-semibold leading-snug tracking-normal">Program<br className="hidden md:block" /> Editorial</p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Design system / 01</p>
      </div>
      <div className="px-5 pt-5"><label htmlFor="guide-search" className="sr-only">Search design system</label><input id="guide-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a foundation or component…" className="w-full border border-input bg-background px-3 py-2.5 text-xs outline-offset-2 focus:outline-2 focus:outline-ring" /></div>
      <div className="hidden min-h-0 flex-1 overflow-y-auto md:block">{nav}</div>
      <details data-mobile-nav className="md:hidden"><summary className="cursor-pointer p-5 text-sm font-semibold">Browse sections · {active.name}</summary>{nav}</details>
      <p className="hidden border-t border-border p-5 text-xs leading-relaxed text-muted-foreground md:block">Extracted from your selected mockup.<br />Not applied to app screens.</p>
    </aside>
    <div className="min-w-0">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 md:px-12">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">System guide <span aria-hidden="true" className="mx-2">/</span> {active.name}</p>
        <Button variant="pill" aria-pressed={dark} onClick={() => setDark(value => !value)}>{dark ? "Light palette" : "Dark palette · derived"}</Button>
      </header>
      <main id="guide-content" tabIndex={-1} className="mx-auto max-w-[1200px] px-5 py-10 outline-none md:px-12 md:py-14">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground"><span>{DESIGN_SYSTEM.description}</span><span>{dark ? "Derived dark mode" : "Source-extracted light mode"}</span></div>
        <Suspense fallback={<p role="status">Loading section…</p>}><Page /></Suspense>
        <footer className="mt-16 border-t border-border pt-5 text-xs text-muted-foreground">Program Editorial · Five source-derived component families · Application pending approval</footer>
      </main>
    </div>
  </div>;
}
