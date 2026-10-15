import { useState } from "react";

const Arrow = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M3.5 10h12m-5-5 5 5-5 5" />
  </svg>
);

export function JusoorDispatch() {
  const [dialog, setDialog] = useState<"apply" | "signin" | null>(null);
  const [arabic, setArabic] = useState(false);

  const copy = arabic
    ? {
        brand: "جسور",
        program: "برنامج ريادة الأعمال",
        headlineOne: "عملٌ يصنع",
        headlineTwo: "خطوةً تالية.",
        description: "مساحة خاصة لفريق يدعم المؤسسين من التواصل والحضانة إلى يوم العرض والمنح.",
        apply: "قدّم إلى البرنامج",
        applied: "سبق أن قدّمت؟ تابع تقدّمك",
        team: "دخول فريق البرنامج",
        side: "كل مؤسس.\\nكل خطوة تالية.",
        journey: "تواصل ← حضانة ← منح",
        privacy: "تقدّم المؤسسين خاص بمقدّم الطلب. يتطلب وصول الفريق موافقة المسؤول.",
      }
    : {
        brand: "Jusoor",
        program: "JUSOOR ENTREPRENEURSHIP PROGRAM",
        headlineOne: "Good work,",
        headlineTwo: "moving forward.",
        description: "A private workspace for the team supporting founders from outreach and incubation to pitch day and grants.",
        apply: "Apply to a program",
        applied: "Already applied? Sign in to track progress",
        team: "Program team sign in",
        side: "Every founder.\\nEvery next step.",
        journey: "OUTREACH  ←  INCUBATION  ←  GRANTS",
        privacy: "Founder progress is private to the applicant. Staff workspace access requires admin approval.",
      };

  return (
    <main className="jd-page" dir={arabic ? "rtl" : "ltr"}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .jd-page {
          --paper: #f7eee4; --paper-deep: #f0e0d1; --ink: #192f40; --muted: #536775;
          --red: #c74935; --blue: #245c70; --line: #d8c8b8;
          min-height: 100dvh; color: var(--ink); background: var(--paper);
          font-family: 'DM Sans', sans-serif; position: relative; overflow: hidden;
          isolation: isolate;
        }
        .jd-page:before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:.19;
          background-image: radial-gradient(#9c7257 .55px, transparent .55px); background-size: 7px 7px; }
        .jd-page * { box-sizing:border-box; }
        .jd-header { width:min(1240px, calc(100% - 72px)); height:104px; margin:auto; display:flex; align-items:center; justify-content:space-between; }
        .jd-brand { color:inherit; display:flex; align-items:center; gap:12px; text-decoration:none; }
        .jd-mark { display:grid; place-items:center; width:38px; height:38px; color:#f9eee4; background:var(--blue); border-radius:50% 50% 50% 10px; font:600 18px 'Fraunces',serif; transform:rotate(-5deg); }
        .jd-brand-copy b { display:block; font:700 17px 'Fraunces',serif; letter-spacing:-.04em; }
        .jd-brand-copy small { display:block; font:500 8px 'IBM Plex Mono',monospace; letter-spacing:.16em; margin-top:3px; color:var(--muted); }
        .jd-language { border:1px solid var(--line); color:var(--ink); background:rgba(255,250,245,.56); border-radius:999px; padding:9px 14px; font:600 11px 'DM Sans',sans-serif; cursor:pointer; transition:transform .2s, background .2s; }
        .jd-language:hover { background:#fff9f2; transform:translateY(-2px); }
        .jd-main { width:min(1240px, calc(100% - 72px)); min-height:calc(100dvh - 104px); margin:auto; display:grid; grid-template-columns:minmax(0,1fr) 340px; align-items:center; gap:70px; padding:28px 0 105px; }
        .jd-copy { max-width:790px; animation:jd-arrive .7s cubic-bezier(.2,.7,.2,1) both; }
        .jd-eyebrow { display:flex; align-items:center; gap:10px; color:var(--red); font:500 10px 'IBM Plex Mono',monospace; letter-spacing:.13em; }
        .jd-eyebrow:before { content:""; width:25px; height:1px; background:var(--red); }
        .jd-copy h1 { margin:25px 0 18px; font:600 clamp(54px,7.5vw,98px)/.95 'Fraunces', Georgia, serif; letter-spacing:-.065em; }
        .jd-copy h1 span { display:block; color:var(--red); font-style:italic; font-weight:500; }
        .jd-copy > p { max-width:535px; margin:0; color:var(--muted); font-size:16px; line-height:1.75; }
        .jd-actions { display:flex; align-items:center; flex-wrap:wrap; gap:14px 22px; margin-top:30px; }
        .jd-primary { display:inline-flex; align-items:center; gap:12px; border:0; border-radius:3px 15px 3px 15px; padding:14px 17px 14px 19px; background:var(--blue); color:#fff5e9; font:700 12px 'DM Sans',sans-serif; cursor:pointer; transition:transform .2s, background .2s; }
        .jd-primary:hover { transform:translateY(-2px); background:#173f51; }
        .jd-primary svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.8; }
        .jd-text-link { border:0; padding:5px 0; color:var(--blue); background:transparent; text-decoration:none; font:600 11px 'DM Sans',sans-serif; cursor:pointer; }
        .jd-text-link:hover { color:var(--red); }
        .jd-privacy { display:flex; align-items:flex-start; gap:10px; max-width:410px; margin-top:34px; padding-top:15px; border-top:1px solid var(--line); color:#6c7b80; font-size:10px; line-height:1.65; }
        .jd-privacy svg { flex:none; width:15px; height:15px; stroke:var(--blue); fill:none; stroke-width:1.7; }
        .jd-side { position:relative; min-height:316px; padding:0 0 0 30px; border-left:1px solid #b9a797; display:flex; flex-direction:column; justify-content:center; animation:jd-arrive .8s .12s both; }
        .jd-side-index { color:var(--red); font:500 10px 'IBM Plex Mono',monospace; letter-spacing:.08em; }
        .jd-side h2 { white-space:pre-line; margin:22px 0 27px; font:600 34px/1.08 'Fraunces',serif; letter-spacing:-.04em; }
        .jd-side-foot { color:var(--muted); font:500 8px 'IBM Plex Mono',monospace; letter-spacing:.1em; }
        .jd-orbit { position:absolute; top:-7px; right:-29px; width:66px; height:66px; border:1px solid rgba(199,73,53,.55); border-radius:50%; }
        .jd-orbit:before,.jd-orbit:after { content:""; position:absolute; border:1px solid rgba(199,73,53,.33); border-radius:50%; inset:7px; }
        .jd-orbit:after { inset:15px; background:var(--red); border:0; }
        .jd-side:after { content:""; position:absolute; right:-4px; bottom:-45px; width:96px; height:96px; opacity:.65; background:linear-gradient(135deg,transparent 48%,var(--paper-deep) 49%); z-index:-1; }
        .jd-dialog-backdrop { position:fixed; inset:0; z-index:5; display:grid; place-items:center; padding:24px; background:rgba(19,39,52,.42); animation:jd-fade .18s ease-out; }
        .jd-dialog { position:relative; width:min(420px,100%); padding:31px; background:#fff8f0; border:1px solid var(--line); box-shadow:0 20px 70px rgba(30,39,41,.2); animation:jd-arrive .25s ease-out both; }
        .jd-dialog-kicker { color:var(--red); font:500 9px 'IBM Plex Mono',monospace; letter-spacing:.13em; }
        .jd-dialog h3 { margin:13px 0 8px; font:600 30px/1.04 'Fraunces',serif; letter-spacing:-.04em; }
        .jd-dialog p { color:var(--muted); font-size:13px; line-height:1.6; }
        .jd-close { position:absolute; right:14px; top:14px; border:0; background:transparent; color:var(--ink); font-size:22px; cursor:pointer; }
        @keyframes jd-arrive { from { opacity:0; transform:translateY(9px); } to { opacity:1; transform:translateY(0); } }
        @keyframes jd-fade { from { opacity:0; } to { opacity:1; } }
        @media(max-width:760px) {
          .jd-header,.jd-main { width:calc(100% - 40px); }
          .jd-header { height:78px; }
          .jd-main { min-height:calc(100dvh - 78px); grid-template-columns:1fr; gap:44px; align-content:center; padding:36px 0 58px; }
          .jd-copy h1 { font-size:clamp(50px,12vw,78px); }
          .jd-copy > p { font-size:14px; }
          .jd-actions { gap:9px 16px; }
          .jd-side { min-height:150px; padding-left:20px; }
          .jd-side h2 { font-size:27px; margin:13px 0 15px; }
          .jd-orbit { width:50px; height:50px; right:10px; top:4px; }
        }
        @media(prefers-reduced-motion:reduce) { .jd-page *, .jd-page *:before, .jd-page *:after { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
      `}</style>
      <header className="jd-header">
        <a className="jd-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Jusoor home">
          <span className="jd-mark">ج</span>
          <span className="jd-brand-copy"><b>{copy.brand}</b><small>PROGRAM HUB</small></span>
        </a>
        <button className="jd-language" onClick={() => setArabic((value) => !value)} aria-label={arabic ? "Switch to English" : "التبديل إلى العربية"}>
          {arabic ? "English · EN" : "文  العربية"}
        </button>
      </header>

      <section className="jd-main">
        <div className="jd-copy">
          <div className="jd-eyebrow">{copy.program}</div>
          <h1>{copy.headlineOne}<span>{copy.headlineTwo}</span></h1>
          <p>{copy.description}</p>
          <div className="jd-actions">
            <button className="jd-primary" onClick={() => setDialog("apply")}>{copy.apply}<Arrow /></button>
            <button className="jd-text-link" onClick={() => setDialog("signin")}>{copy.applied}</button>
            <button className="jd-text-link" onClick={() => setDialog("signin")}>{copy.team}</button>
          </div>
          <div className="jd-privacy">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.4c0 3.7-2.3 6.4-6 8.1-3.7-1.7-6-4.4-6-8.1V5l6-2.5Z" /><path d="m7.2 9.8 1.8 1.8 3.8-4" /></svg>
            <span>{copy.privacy}</span>
          </div>
        </div>

        <aside className="jd-side">
          <span className="jd-orbit" aria-hidden="true" />
          <div className="jd-side-index">01 — PROGRAM OPERATIONS</div>
          <h2>{copy.side.replace("\\n", "\n")}</h2>
          <div className="jd-side-foot">{copy.journey}</div>
        </aside>
      </section>

      {dialog && (
        <div className="jd-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className="jd-dialog" role="dialog" aria-modal="true" aria-labelledby="jd-dialog-title">
            <button className="jd-close" onClick={() => setDialog(null)} aria-label="Close dialog">×</button>
            <div className="jd-dialog-kicker">{dialog === "apply" ? "JUSOOR PROGRAMS" : "PRIVATE WORKSPACE"}</div>
            <h3 id="jd-dialog-title">{dialog === "apply" ? "Start with a program." : "Welcome back."}</h3>
            <p>{dialog === "apply" ? "Explore the current program opportunities and submit an application to begin your founder journey." : "Use the sign-in link provided by Jusoor to continue to your private workspace."}</p>
            <button className="jd-primary" onClick={() => setDialog(null)}>Got it <Arrow /></button>
          </section>
        </div>
      )}
    </main>
  );
}

export default JusoorDispatch;
