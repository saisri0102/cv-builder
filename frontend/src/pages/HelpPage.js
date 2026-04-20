import React, { useState, useEffect } from "react";

const HelpPage = () => {
  useEffect(() => { document.title = "Help • TalentHireAI"; }, []);
  const [query, setQuery] = useState("");
  // track open accordion item using a composite key "Group-Index"
  const [openKey, setOpenKey] = useState("General-0");

  // ===== Grouped FAQs =====
  const faqGroups = {
    "General": [
      { q: "What makes a resume ATS-friendly here?",
        a: "Use clean structure (Work Experience, Skills, Education), simple fonts, no images for text, quantified bullets, and include keywords from the JD." },
      { q: "Do you support multiple languages?",
        a: "English is fully supported. Other languages may work for rewriting, but keyword matching is most accurate in English." },
      { q: "Time zones and date formatting?",
        a: "We use your browser’s locale. If dates look off, check your OS/timezone settings." },
    ],

    "Upload & Resume": [
      { q: "How do I upload my resume?",
        a: "Click Resume → Upload Resume. We accept PDF, DOCX, and TXT up to 5MB. After upload, you can enhance it, compare against a job description, or save it to your library." },
      { q: "Images look blurry or don’t load.",
        a: "Use SVG or high-resolution PNG. If hosted locally, confirm the path (e.g., /images/logo.svg) and clear cache (Cmd/Ctrl + Shift + R)." },
      { q: "How do I get stronger bullet points?",
        a: "Use action verb → task → impact → metric. Example: “Automated reconciliation, cutting close by 2 days (-28%).”." },
    ],

    "AI Resume Builder": [
      { q: "How does the AI Resume Builder improve my document?",
        a: "Our AI rewrites bullets to highlight impact, adds missing skills, and keeps ATS compliance. You control rewrite strength and keyword injection." },
      { q: "Can the AI adapt tone?",
        a: "Yes. Lower rewrite strength for concise tone; increase for storytelling and impact." },
      { q: "Will AI change factual details?",
        a: "No. Facts you provide are preserved. Always review drafts for accuracy." },
    ],

    "Cover Letters": [
      { q: "How can I generate a cover letter?",
        a: "Go to Cover Letter → Generate. Provide the role, company, and (optional) job description. A tailored letter is created for you to refine and download." },
      { q: "My cover letter starts with placeholders.",
        a: "It’s a starter template. Add recruiter name, company, and job title to auto-personalize and replace placeholders." },
    ],

    "Compare & Match": [
      { q: "Compare won’t read my PDF.",
        a: "Scanned (image-only) PDFs aren’t parsable. Use DOCX/TXT or OCR the PDF to make text selectable before uploading." },
      { q: "Match score seems low—what should I change?",
        a: "Add missing skills, mirror important nouns/verbs from the JD, and quantify outcomes (e.g., “Cut processing time by 23%”)." },
      { q: "Can I compare multiple JDs to the same resume?",
        a: "Yes. Run the compare for each JD and adjust your resume. Save role-specific versions in your library (e.g., Data Analyst, BI Analyst)." },
    ],

    "Downloads & Exports": [
      { q: "I can’t download as PDF/DOCX.",
        a: "Allow downloads/pop-ups for this site, then hard refresh (Cmd/Ctrl + Shift + R). If needed, try Chrome/Edge/Firefox/Safari 16+." },
      { q: "PDF output layout isn’t perfect.",
        a: "Avoid complex tables and columns. Prefer simple lists and headings. For exact layouts, export DOCX and finalize in Word/Google Docs." },
      { q: "Can I export all of my resumes at once?",
        a: "Currently, resumes are exported individually. Bulk export is on our roadmap—contact support if urgent." },
    ],


    "Billing & Plans": [
      { q: "Do you offer a free plan?",
        a: "Yes, with core features and limits. Paid plans unlock higher usage, advanced rewriting, and faster processing." },
      { q: "What happens if I hit usage limits?",
        a: "You’ll see a notice. Wait for reset or upgrade. Contact support for temporary boosts." },
      { q: "Refunds or cancellations?",
        a: "Monthly plans can be canceled anytime effective next cycle. Email support for refund questions with your order details." },
    ],

    "Technical": [
      { q: "Which browsers are supported?",
        a: "Latest Chrome, Edge, Firefox, and Safari 16+. Older browsers may have reduced functionality." },
      { q: "The site feels slow—any tips?",
        a: "Close heavy tabs, check your network, and avoid large files. If it persists, send logs/screenshots to support." },
      { q: "I see console errors or a blank page.",
        a: "Hard refresh, clear cache, or try incognito. If it continues, send a screenshot of the console (Cmd/Ctrl + Option/Alt + I)." },
    ],

    "Privacy & Data": [
      { q: "Is my data private and secure?",
        a: "Yes. Files are processed only to provide requested features. Transfers are encrypted, and you can delete files any time from the library." },
      { q: "How do I delete my data?",
        a: "Go to My Resumes → select a document → Delete. For full account deletion, email support@TalentHireAI.app." },
    ],

    "Support": [
      { q: "How fast do you reply to support emails?",
        a: "Within 24h on business days. Include steps, screenshots, and sample files for faster resolution." },
    ],
  };

  // Flattened search: filter questions per group; hide empty groups while searching
  const filterGroups = (groups, q) => {
    if (!q?.trim()) return groups;
    const out = {};
    const needle = q.toLowerCase();
    Object.entries(groups).forEach(([group, items]) => {
      const f = items.filter(({ q, a }) =>
        q.toLowerCase().includes(needle) || a.toLowerCase().includes(needle)
      );
      if (f.length) out[group] = f;
    });
    return out;
  };
  const visibleGroups = filterGroups(faqGroups, query);

  const toggle = (group, idx) => {
    const key = `${group}-${idx}`;
    setOpenKey(openKey === key ? "" : key);
  };

  const quickLinks = [
    { emoji: "✨", title: "General", target: "group-General" },
    { emoji: "⬆️", title: "Upload & Resume", target: "group-Upload & Resume" },
    { emoji: "🧠", title: "AI Resume Builder", target: "group-AI Resume Builder" },
    { emoji: "📝", title: "Cover Letters", target: "group-Cover Letters" },
    { emoji: "📈", title: "Compare & Match", target: "group-Compare & Match" },
    { emoji: "📤", title: "Downloads & Exports", target: "group-Downloads & Exports" },
    { emoji: "💳", title: "Billing & Plans", target: "group-Billing & Plans" },
    { emoji: "🛠️", title: "Technical", target: "group-Technical" },
    { emoji: "🔒", title: "Privacy & Data", target: "group-Privacy & Data" },
    { emoji: "📧", title: "Support", target: "group-Support" },
  ];

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="h-page">
      <style>{css}</style>

      {/* HERO */}
      <header className="h-hero">
        <div className="h-hero-inner">
          <div className="h-badge">HELP CENTER</div>
          <h1 className="h-title">How can we help?</h1>
          <p className="h-subtitle">Quick guides, FAQs, and troubleshooting tips for TalentHireAI.</p>

          <div className="h-search-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="h-search-icon">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.71.71l.27.28v.79L20 21.5L21.5 20zM10 15a5 5 0 110-10a5 5 0 010 10z"/>
            </svg>
            <input
              type="search"
              placeholder="Search help (e.g., upload, ATS, cover letter, PDF)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-search"
            />
          </div>

          {/* Quick links to groups */}
          <div className="h-quick-grid">
            {quickLinks.map(({ emoji, title, target }) => (
              <button key={title} className="h-tile" onClick={() => scrollToId(target)}>
                <span className="h-tile-emoji" aria-hidden>{emoji}</span>
                <span className="h-tile-title">{title}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="h-main">
        {/* Quick Start (kept) */}
        <section id="quick-start" className="h-card">
          <h2 className="h-h2">Quick start</h2>
          <ol className="h-list">
            <li><b>Upload:</b> Resume → Upload Resume (PDF/DOCX/TXT, ≤ 5MB).</li>
            <li><b>Enhance:</b> Improve clarity, impact, and ATS alignment.</li>
            <li><b>Tailor:</b> Compare with a job description to add missing skills.</li>
            <li><b>Cover letter:</b> Generate a matching letter in seconds.</li>
            <li><b>Save & Export:</b> Download as PDF/DOCX or save to your library.</li>
          </ol>
        </section>

        {/* Grouped FAQs */}
        {Object.entries(visibleGroups).map(([group, items]) => (
          <section key={group} id={`group-${group}`} className="h-card">
            <div className="h-sec-head">
              <h2 className="h-h2">{group}</h2>
              <span className="h-muted">{items.length} article{items.length === 1 ? "" : "s"}</span>
            </div>

            <div className="h-accordion">
              {items.map(({ q, a }, idx) => {
                const key = `${group}-${idx}`;
                const isOpen = openKey === key;
                return (
                  <div key={key} className={`h-acc-item ${isOpen ? "open" : ""}`}>
                    <button
                      className={`h-acc-btn ${isOpen ? "is-open" : ""}`}
                      onClick={() => toggle(group, idx)}
                      aria-expanded={isOpen}
                    >
                      <span>{q}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="h-chevron">
                        <path fill="currentColor" d="M7 10l5 5 5-5z"/>
                      </svg>
                    </button>
                    <div className="h-acc-panel" style={{ maxHeight: isOpen ? 320 : 0 }}>
                      <p className="h-acc-body">{a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Troubleshoot + Contact (unchanged) */}
        <section id="troubleshoot" className="h-grid-2">
          <div className="h-card">
            <h3 className="h-h3">Troubleshooting</h3>
            <ul className="h-bullets">
              <li><b>Page won’t load:</b> Hard refresh (Cmd/Ctrl + Shift + R) and retry.</li>
              <li><b>File rejected:</b> Use PDF/DOCX/TXT ≤ 5MB. Avoid scanned-only PDFs.</li>
              <li><b>Parsing oddities:</b> Remove complex tables or export from Word as “Web Page, Filtered” then re-save.</li>
              <li><b>Download blocked:</b> Allow pop-ups/downloads for this site in your browser.</li>
            
            </ul>
          </div>

          <div id="contact" className="h-card h-contact">
            
            <h3 className="h-h3">Contact support</h3>
            <p className="h-p">Couldn’t find an answer? Include screenshots and steps to reproduce.</p>
            <ul className="h-contact-list">
              <li>📧 <a className="h-link" href="mailto:support@TalentHireAI.app">support@TalentHireAI.app</a></li>
              <li>🐞 Report a bug from inside the app</li>
              <li>📚 Career Blog tips (coming soon)</li>
            </ul>
            <a className="btn btn-primary" href="mailto:support@TalentHireAI.app">
              <span className="btn-ico" aria-hidden>✉️</span> Email Support
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};

/* ---------- CSS (same visual language you already use) ---------- */
const css = `
:root{
  --bg:#f2f7fc; --ink:#0f2a3d; --muted:#64748b; --brand:#2aa5ff; --brand-ink:#0b1722;
  --card:#ffffff; --stroke:#dbeeff; --stroke-soft:#e6eef8;
}
*{box-sizing:border-box}
.h-page{ min-height:100vh; background:linear-gradient(180deg,#e6f0f8 0%,#f7fbff 100%); font-family: Segoe UI, system-ui, -apple-system, Arial, sans-serif; color:var(--ink); padding-bottom:40px; }
.h-hero{ background:linear-gradient(120deg,#13293d 0%, #1a3c58 60%, #204c70 100%); color:#eaf4ff; padding:88px 16px 26px; box-shadow:0 12px 28px rgba(0,0,0,.2); }
.h-hero-inner{ max-width:1050px; margin:0 auto; }
.h-badge{ display:inline-block; padding:6px 10px; border-radius:999px; background:rgba(42,165,255,.18); border:1px solid rgba(42,165,255,.35); color:#d6ecff; font-weight:800; letter-spacing:.5px; font-size:12px; }
.h-title{ margin:10px 0 6px; font-weight:900; letter-spacing:.2px; font-size:clamp(28px,4vw,40px) }
.h-subtitle{ margin:0 0 16px; color:#c9def2; font-size:16px; line-height:1.6 }
.h-search-wrap{ position:relative; max-width:680px; display:flex; align-items:center; background:#0e2233; border:1px solid rgba(255,255,255,.18); border-radius:12px; padding:10px 12px; box-shadow:0 8px 24px rgba(0,0,0,.22); }
.h-search-icon{ color:#cfe3f5; margin-right:8px; opacity:.85 }
.h-search{ flex:1; background:transparent; border:none; outline:none; color:#eaf4ff; font-size:15px; }
.h-search::placeholder{ color:#a9c4de }
.h-quick-grid{ margin-top:16px; display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
.h-tile{ background:#11314a; color:#eaf4ff; border:1px solid rgba(255,255,255,.14); border-radius:14px; padding:12px 14px; display:flex; align-items:center; gap:10px; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease, background .15s ease; box-shadow:0 10px 20px rgba(0,0,0,.18); }
.h-tile:hover{ transform:translateY(-2px); box-shadow:0 12px 24px rgba(0,0,0,.22); background:#153d5c; }
.h-tile-emoji{ font-size:18px } .h-tile-title{ font-weight:800; letter-spacing:.2px }
.h-main{ max-width:1050px; margin:0 auto; padding:18px 16px 24px }
.h-card{ background:var(--card); border:1px solid var(--stroke); border-radius:18px; padding:18px; box-shadow:0 14px 36px rgba(0,0,0,.08); margin-bottom:18px; }
.h-sec-head{ display:flex; align-items:baseline; justify-content:space-between; gap:10px }
.h-h2{ margin:0 0 8px 0; font-size:22px; font-weight:900; color:var(--ink); letter-spacing:.2px }
.h-h3{ margin:0 0 8px 0; font-size:18px; font-weight:800; color:var(--ink) }
.h-muted{ font-size:13px; color:var(--muted) }
.h-list{ margin:8px 0 0 18px; line-height:1.7; color:#334155 } .h-bullets{ margin:8px 0 0 18px; line-height:1.7; color:#334155 }
.h-grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:18px } @media (max-width: 900px){ .h-grid-2{ grid-template-columns:1fr } }
.h-contact{ position:relative; background:linear-gradient(180deg,#f3faff 0%, #ffffff 60%); border:1px solid #cfe0ef; }
.h-float-badge{ position:absolute; top:-12px; left:16px; background:#2aa5ff; color:#0b1722; font-weight:900; font-size:12px; padding:6px 10px; border-radius:999px; border:1px solid rgba(0,0,0,.06); box-shadow:0 6px 18px rgba(42,165,255,.35); }
.h-accordion{ margin-top:8px }
.h-acc-item{ border:1px solid var(--stroke-soft); border-radius:14px; background:#fff; margin-bottom:10px; overflow:hidden }
.h-acc-btn{ width:100%; text-align:left; padding:14px 16px; font-size:15px; font-weight:900; border:none; background:linear-gradient(180deg,#fafcff 0%, #f3f8ff 100%); display:flex; align-items:center; justify-content:space-between; cursor:pointer; }
.h-acc-btn.is-open{ background:linear-gradient(180deg,#eef7ff 0%, #e7f2ff 100%); border-bottom:1px solid var(--stroke) }
.h-chevron{ transition:transform .2s ease }
.h-acc-item.open .h-chevron{ transform:rotate(180deg) }
.h-acc-panel{ overflow:hidden; transition:max-height .22s ease }
.h-acc-body{ margin:0; padding:10px 0 4px; color:#475569; line-height:1.6 }
.btn{ display:inline-flex; align-items:center; gap:8px; border-radius:12px; font-weight:900; letter-spacing:.2px; text-decoration:none; cursor:pointer; transition: transform .12s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease; }
.btn-ico{ font-size:16px; line-height:1 }
.btn-primary{ background:linear-gradient(180deg,#2aa5ff 0%, #1998f7 100%); color:#0b1722; border:1px solid rgba(0,0,0,.06); padding:12px 18px; box-shadow:0 10px 28px rgba(42,165,255,.28), inset 0 1px 0 rgba(255,255,255,.35); }
.btn-primary:hover{ transform:translateY(-1px); box-shadow:0 12px 30px rgba(42,165,255,.34) }
.btn-primary:active{ transform:translateY(0) }
.btn-primary:focus{ outline:2px solid #bfe5ff; outline-offset:2px }
`;

export default HelpPage;
