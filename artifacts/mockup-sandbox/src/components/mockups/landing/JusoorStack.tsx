import { useState } from "react";

export function JusoorStack() {
  const [dialog, setDialog] = useState<"apply" | "signin" | null>(null);
  const [arabic, setArabic] = useState(false);
  const copy = arabic
    ? {
        brand: "جسور",
        program: "برنامج ريادة الأعمال",
        first: "عملٌ يصنع",
        second: "خطوةً تالية.",
        description: "مساحة خاصة لفريق يدعم المؤسسين من التواصل والحضانة إلى يوم العرض والمنح.",
        apply: "قدّم إلى البرنامج",
        applied: "سبق أن قدّمت؟ تابع تقدّمك",
        team: "دخول فريق البرنامج",
        privacy: "تقدّم المؤسسين خاص بمقدّم الطلب. يتطلب وصول الفريق موافقة المسؤول.",
      }
    : {
        brand: "Jusoor",
        program: "JUSOOR ENTREPRENEURSHIP PROGRAM",
        first: "Good work,",
        second: "moving forward.",
        description: "A private workspace for the team supporting founders from outreach and incubation to pitch day and grants.",
        apply: "Apply to a program",
        applied: "Already applied? Sign in to track progress",
        team: "Program team sign in",
        privacy: "Founder progress is private to the applicant. Staff workspace access requires admin approval.",
      };

  return (
    <main className="js-page" dir={arabic ? "rtl" : "ltr"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .js-page {
          --paper:#f7eee4; --paper2:#eddfd1; --ink:#192f40; --muted:#586b76;
          --red:#c74935; --blue:#245c70; --line:#d8c8b8;
          min-height:100dvh; color:var(--ink); background:var(--paper);
          font-family:'DM Sans',sans-serif; position:relative; overflow:hidden; isolation:isolate;
        }
        .js-page:before { content:""; position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.17; background-image:radial-gradient(#9c7257 .55px,transparent .55px); background-size:7px 7px; }
        .js-page * { box-sizing:border-box; }
        .js-top { width:min(1390px,calc(100% - 88px)); height:92px; margin:auto; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); }
        .js-brand { display:flex; align-items:center; gap:11px; color:inherit; text-decoration:none; }
        .js-mark { display:grid; place-items:center; width:38px; height:38px; background:var(--blue); color:#fff5e9; border-radius:50% 50% 50% 9px; font:600 18px 'Fraunces',serif; transform:rotate(-5deg); }
        .js-brand b { display:block; font:700 17px 'Fraunces',serif; letter-spacing:-.04em; }
        .js-brand small { display:block; margin-top:3px; color:var(--muted); font:500 8px 'IBM Plex Mono',monospace; letter-spacing:.16em; }
        .js-lang { padding:9px 14px; border:1px solid var(--line); border-radius:999px; background:#fff9f2a6; color:var(--ink); font:600 11px 'DM Sans',sans-serif; cursor:pointer; transition:transform .2s,background .2s; }
        .js-lang:hover { transform:translateY(-2px); background:#fff9f2; }
        .js-content { width:min(1390px,calc(100% - 88px)); margin:auto; }
        .js-hero { position:relative; padding:72px 0 65px; text-align:center; animation:js-rise .65s cubic-bezier(.2,.7,.2,1) both; }
        .js-eyebrow { display:flex; justify-content:center; align-items:center; gap:12px; color:var(--red); font:500 10px 'IBM Plex Mono',monospace; letter-spacing:.14em; }
        .js-eyebrow:before,.js-eyebrow:after { content:""; width:30px; height:1px; background:var(--red); }
        .js-hero h1 { margin:24px 0 18px; font:600 clamp(64px,8.1vw,112px)/.87 'Fraunces',Georgia,serif; letter-spacing:-.075em; }
        .js-hero h1 span { color:var(--red); font-style:italic; font-weight:500; }
        .js-description { max-width:560px; margin:0 auto; color:var(--muted); font-size:15px; line-height:1.75; }
        .js-sequence { display:flex; justify-content:center; gap:9px; align-items:center; margin:27px auto 0; color:#73828a; font:500 9px 'IBM Plex Mono',monospace; letter-spacing:.11em; }
        .js-sequence i { width:4px; height:4px; border-radius:50%; background:var(--red); }
        .js-entry { display:grid; grid-template-columns:1.25fr 1fr 1fr; min-height:195px; border-top:1px solid #b9a797; border-bottom:1px solid #b9a797; animation:js-rise .75s .08s both; }
        .js-entry-main { display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:28px 40px 30px 0; }
        .js-index { color:var(--red); font:500 9px 'IBM Plex Mono',monospace; letter-spacing:.13em; }
        .js-entry-main strong { margin-top:13px; font:600 29px/1.05 'Fraunces',serif; letter-spacing:-.04em; }
        .js-entry-main p { max-width:370px; margin:8px 0 0; color:var(--muted); font-size:11px; line-height:1.6; }
        .js-route { display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:28px 32px; border-left:1px solid #c8b8a9; }
        .js-route:last-child { border-right:1px solid #c8b8a9; }
        .js-route-label { color:var(--muted); font:500 9px 'IBM Plex Mono',monospace; letter-spacing:.12em; }
        .js-route button { margin-top:13px; cursor:pointer; text-align:left; }
        .js-apply { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; border:0; border-radius:3px 14px 3px 14px; padding:15px 17px; background:var(--blue); color:#fff5e9; font:700 12px 'DM Sans',sans-serif; transition:transform .2s,background .2s; }
        .js-apply:hover { transform:translateY(-2px); background:#173f51; }
        .js-arrow { font-size:18px; font-weight:400; }
        .js-text { border:0; padding:4px 0; background:transparent; color:var(--blue); font:600 12px 'DM Sans',sans-serif; }
        .js-text:hover { color:var(--red); }
        .js-foot { display:flex; align-items:flex-start; justify-content:space-between; gap:30px; padding:23px 0 36px; color:#6c7b80; font-size:10px; line-height:1.65; animation:js-rise .8s .15s both; }
        .js-privacy { display:flex; align-items:flex-start; gap:10px; max-width:470px; }
        .js-privacy svg { flex:none; width:16px; height:16px; stroke:var(--blue); fill:none; stroke-width:1.7; }
        .js-foot-note { color:var(--muted); font:500 9px 'IBM Plex Mono',monospace; letter-spacing:.08em; text-align:right; }
        .js-dialog-bg { position:fixed; inset:0; z-index:5; display:grid; place-items:center; padding:22px; background:#13273470; animation:js-fade .18s ease-out; }
        .js-dialog { position:relative; width:min(420px,100%); padding:31px; border:1px solid var(--line); background:#fff8f0; box-shadow:0 20px 70px #1e272933; animation:js-rise .25s ease-out both; }
        .js-dialog small { color:var(--red); font:500 9px 'IBM Plex Mono',monospace; letter-spacing:.13em; }
        .js-dialog h2 { margin:13px 0 8px; font:600 30px/1.04 'Fraunces',serif; letter-spacing:-.04em; }
        .js-dialog p { color:var(--muted); font-size:13px; line-height:1.6; }
        .js-close { position:absolute; right:14px; top:12px; border:0; background:transparent; color:var(--ink); font-size:22px; cursor:pointer; }
        @keyframes js-rise { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:translateY(0); } }
        @keyframes js-fade { from { opacity:0; } to { opacity:1; } }
        @media(max-width:760px) {
          .js-top,.js-content { width:calc(100% - 40px); }
          .js-top { height:76px; }
          .js-hero { padding:54px 0 42px; }
          .js-hero h1 { font-size:clamp(58px,13vw,84px); }
          .js-description { font-size:13px; }
          .js-sequence { font-size:8px; }
          .js-entry { grid-template-columns:1fr; }
          .js-entry-main { padding:24px 0; }
          .js-route { padding:20px 0; border-left:0; border-top:1px solid #c8b8a9; }
          .js-route:last-child { border-right:0; }
          .js-foot { flex-direction:column; gap:14px; padding-top:18px; }
          .js-foot-note { text-align:left; }
        }
        @media(prefers-reduced-motion:reduce) { .js-page *, .js-page *:before, .js-page *:after { animation-duration:.01ms!important; transition-duration:.01ms!important; } }
      `}</style>
      <header className="js-top">
        <a className="js-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Jusoor home">
          <span className="js-mark">ج</span>
          <span><b>{copy.brand}</b><small>PROGRAM HUB</small></span>
        </a>
        <button className="js-lang" onClick={() => setArabic((value) => !value)} aria-label={arabic ? "Switch to English" : "التبديل إلى العربية"}>
          {arabic ? "English · EN" : "文  العربية"}
        </button>
      </header>
      <div className="js-content">
        <section className="js-hero">
          <div className="js-eyebrow">{copy.program}</div>
          <h1>{copy.first}<br /><span>{copy.second}</span></h1>
          <p className="js-description">{copy.description}</p>
          <div className="js-sequence"><span>OUTREACH</span><i /><span>INCUBATION</span><i /><span>GRANTS</span></div>
        </section>
        <section className="js-entry" aria-label="Choose your next step">
          <div className="js-entry-main">
            <span className="js-index">01 — PROGRAM OPERATIONS</span>
            <strong>Every founder.<br />Every next step.</strong>
            <p>One place for applications, founder progress, and the team behind the work.</p>
          </div>
          <div className="js-route">
            <span className="js-route-label">FOR NEW FOUNDERS</span>
            <button className="js-apply" onClick={() => setDialog("apply")}><span>{copy.apply}</span><span className="js-arrow">↗</span></button>
          </div>
          <div className="js-route">
            <span className="js-route-label">RETURNING TO JUSOOR</span>
            <button className="js-text" onClick={() => setDialog("signin")}>{copy.applied} →</button>
            <button className="js-text" onClick={() => setDialog("signin")}>{copy.team} →</button>
          </div>
        </section>
        <footer className="js-foot">
          <div className="js-privacy">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.4c0 3.7-2.3 6.4-6 8.1-3.7-1.7-6-4.4-6-8.1V5l6-2.5Z" /><path d="m7.2 9.8 1.8 1.8 3.8-4" /></svg>
            <span>{copy.privacy}</span>
          </div>
          <span className="js-foot-note">A PRIVATE SPACE FOR<br />JUSOOR FOUNDERS &amp; STAFF</span>
        </footer>
      </div>
      {dialog && (
        <div className="js-dialog-bg" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className="js-dialog" role="dialog" aria-modal="true" aria-labelledby="js-dialog-title">
            <button className="js-close" onClick={() => setDialog(null)} aria-label="Close dialog">×</button>
            <small>{dialog === "apply" ? "JUSOOR PROGRAMS" : "PRIVATE WORKSPACE"}</small>
            <h2 id="js-dialog-title">{dialog === "apply" ? "Start with a program." : "Welcome back."}</h2>
            <p>{dialog === "apply" ? "Explore the current program opportunities and submit an application to begin your founder journey." : "Use the sign-in link provided by Jusoor to continue to your private workspace."}</p>
            <button className="js-apply" onClick={() => setDialog(null)}><span>Got it</span><span className="js-arrow">↗</span></button>
          </section>
        </div>
      )}
    </main>
  );
}

export default JusoorStack;
