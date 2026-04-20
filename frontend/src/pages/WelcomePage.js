// src/pages/WelcomePage.js
import React, { useState, useRef, useEffect, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import AOS from "aos";
import "aos/dist/aos.css";

const WelcomePage = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const refs = { resume: useRef(null), cover: useRef(null), blog: useRef(null) };

  // Close dropdowns on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (!open) return;
      const r = refs[open];
      if (r?.current && !r.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onDown, { capture: true });
  }, [open]);

  // Keyframes + responsive tweaks
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-welcome-keyframes", "true");
    styleEl.innerHTML = `
      @keyframes logo-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      @keyframes floaty { 0% { transform: translateY(0px) } 50% { transform: translateY(-8px) } 100% { transform: translateY(0px) } }
      .navWrap::-webkit-scrollbar { display: none; }
      .navWrap { -ms-overflow-style: none; scrollbar-width: none; }
      @media (max-width: 980px) {
        .heroGrid { grid-template-columns: 1fr !important; gap: 24px !important; }
        .imageArea { text-align: center !important; }
        .tagline { font-size: clamp(24px, 6vw, 36px) !important; }
        .ctaRow { justify-content: center !important; }
      }
      @media (max-width: 900px) {
        .bandSplit { grid-template-columns: 1fr !important; }
        .bandSplitImage { order: -1; justify-content: center !important; text-align: center !important; }
        .bandSplit[data-image-left="true"] .bandSplitImage { order: -1; }
        .bandSplit[data-image-left="false"] .bandSplitImage { order: -1; }
      }
    `;
    document.head.appendChild(styleEl);
    return () => { if (styleEl && document.head.contains(styleEl)) document.head.removeChild(styleEl); };
  }, []);

  // AOS init
  useEffect(() => {
    AOS.init({ duration: 900, easing: "ease-out-cubic", once: true, offset: 80 });
  }, []);


  const toggle = (name) => setOpen(open === name ? null : name);
  const handleLogin = () => navigate("/login");
  const handleHelp = () => navigate("/help");
  const handleStartFree = () => navigate("/signup");
  const handleLearnMore = () => {
    const el = document.getElementById("features");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brandRow}>
            <span style={styles.logo} aria-hidden>🚀</span>
            <span style={styles.brand}>TalentHireAI</span>
          </div>

          <div className="navWrap" style={styles.navWrap}>
          <nav aria-label="Primary" style={styles.nav}>
             
             
               <Dropdown
                label="Resume"
                items={["Resume Builder", "ATS Scanner", "Version History"]}
                handlers={[
                  () => { const el = document.getElementById("features"); el?.scrollIntoView({ behavior: "smooth" }); },
                  () => { const el = document.getElementById("features"); el?.scrollIntoView({ behavior: "smooth" }); },
                  () => navigate("/signup")
                ]}
                isOpen={open === "resume"}
                toggle={() => toggle("resume")}
                ref={refs.resume}
              />
              
              <Dropdown
                label="Cover Letter"
                items={["Generate Letter", "Templates", "Writing Tips"]}
                handlers={[
                  () => { const el = document.getElementById("features"); el?.scrollIntoView({ behavior: "smooth" }); },
                  () => navigate("/signup"),
                  () => navigate("/signup")
                ]}
                isOpen={open === "cover"}
                toggle={() => toggle("cover")}
                ref={refs.cover}
              />
            </nav>
          </div>

          <div style={styles.actions}>
            <button style={styles.ghostBtn} onClick={handleHelp}>Help</button>
            <button style={styles.solidBtn} onClick={handleLogin}>Login</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section style={styles.heroSection} className="heroGrid">
          <div style={styles.textArea}>
            <div style={styles.badge}>NEW • AI Resume & Cover Letter Suite</div>

            <h1 style={{ ...styles.tagline }} className="tagline">
              Get hired <span style={styles.highlight}>faster</span> with<br />
              <span style={styles.highlightStrong}>AI-powered</span> applications
            </h1>

            <p style={styles.subtitle}>
              Craft ATS-ready resumes and tailored cover letters in minutes. Compare versions, scan job descriptions,
              and boost your match score with one click.
            </p>

            <div style={styles.reviewRow}>
              <div style={styles.stars}>
                {renderStar(true)}
                {renderStar(true)}
                {renderStar(true)}
                {renderStar(true)}
                {renderStar(false, true)}
              </div>
              <span style={styles.ratingText}>4.5 / 5</span>
              <span style={styles.userCount}>— Trusted by 10,000+ job seekers</span>
            </div>

            <div className="ctaRow" style={styles.ctaRow}>
              <button style={styles.primaryCta} onClick={handleStartFree}>Start free</button>
              <button style={styles.secondaryCta} onClick={handleLearnMore}>Learn more</button>
            </div>

            <ul style={styles.miniList} aria-label="Key benefits">
              <li>✔ ATS-friendly resumes</li>
              <li>✔ Keyword tailoring</li>
              <li>✔ One-click cover letters</li>
            </ul>
          </div>

          <div style={{ ...styles.imageArea }} className="imageArea">
            <img
              src="/images/image_1.png"
              alt="Preview of AI resume and cover letter tools"
              style={styles.image}
            />
          </div>
        </section>

        {/* ===== Features ===== */}
        <section id="features" aria-label="Key features">
          {/* 1) AI Resume Builder — (image right) */}
          <FeatureSplit
            dataAos="fade-up"
            delay={0}
            bg="#eef7ff"
            border="1px solid #dbeeff"
            emoji="✨"
            title="AI Resume Builder"
            subtitle="Build resumes that demand attention"
            text="Transform your experience into a powerful, ATS-ready resume. Our AI enhances every detail—from structure and style to keyword precision—so you stand out to recruiters and hiring managers from the very first glance."
            imageSrc="/images/resume_builder.png"
            imageAlt="AI Resume Builder preview"
            imageSide="right"
            imageMaxWidth={380}   // ↓ smaller image
          />

          {/* 2) Cover Letter Wizard — (image left) */}
          <FeatureSplit
            dataAos="fade-up"
            delay={150}
            bg="#fff7ed"
            border="1px solid #ffe7cf"
            emoji="📝"
            title="Cover Letter Wizard"
            subtitle="The smartest cover letter creator you’ll ever use"
            text="Instantly generate tailored cover letters that match your dream role. Our AI aligns tone, structure, and key phrases to connect with recruiters and make your application unforgettable."
            imageSrc="/images/image_3.png"
            imageAlt="Cover Letter Wizard preview"
            imageSide="left"
            imageMaxWidth={420}   // ↓ smaller image
          />

          {/* 3) Job Match Insights — (image right) */}
          <FeatureSplit
            dataAos="fade-up"
            delay={300}
            bg="#f2fbf4"
            border="1px solid #d7f3de"
            emoji="📈"
            title="Job Match Insights"
            subtitle="The ultimate job compatibility scanner"
            text="See exactly how well your resume matches a role before you apply. Our AI identifies missing skills, keywords, and sections—then gives you a clear action plan to boost your chances."
            imageSrc="/images/image_4.png"
            imageAlt="Job Match Insights preview"
            imageSide="right"
            imageMaxWidth={460}   // ↓ smaller image
          />
        </section>
      </main>


      {/* Logos */}
      <section style={styles.logosSection} aria-label="Companies our users interview with">
          <h2 style={styles.logosBadge}>
            Our users’ success stories span these global brands
          </h2>
          <div style={styles.logoTrackWrap}>
            <div style={styles.logoTrack}>
              {logos.concat(logos).map((src, i) => (
                <img key={i} src={src} alt="" style={styles.logoImg} />
              ))}
            </div>
          </div>
        </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerColWrap}>
          <div style={styles.footerCol}>
            <h4 style={styles.footerHead}>TalentHireAI</h4>
            <p style={styles.footerText}>AI tools to craft standout applications and land interviews faster.</p>
          </div>
          <div style={styles.footerCol}>
            <h5 style={styles.footerSubHead}>Products</h5>
            <ul style={styles.linkList}>
              <li><a style={styles.link} href="#resume">Resume Builder</a></li>
              <li><a style={styles.link} href="#cover">Cover Letter Generator</a></li>
              <li><a style={styles.link} href="#ats">ATS Scanner</a></li>
              <li><a style={styles.link} href="#tracker">Job Tracker</a></li>
              <li><a style={styles.link} href="#interview">Interview Prep</a></li>
            </ul>
          </div>
          <div style={styles.footerCol}>
            <h5 style={styles.footerSubHead}>Resources</h5>
            <ul style={styles.linkList}>
              <li><a style={styles.link} href="#blog">Career Blog</a></li>
              <li><a style={styles.link} href="#templates">Templates</a></li>
              <li><a style={styles.link} href="#tips">Tips & Guides</a></li>
              <li><a style={styles.link} href="#faq">FAQ</a></li>
            </ul>
          </div>
          <div style={styles.footerCol}>
            <h5 style={styles.footerSubHead}>Company</h5>
            <ul style={styles.linkList}>
              <li><a style={styles.link} href="#about">About</a></li>
              <li><a style={styles.link} href="#contact">Contact</a></li>
              <li><a style={styles.link} href="#privacy">Privacy</a></li>
              <li><a style={styles.link} href="#terms">Terms</a></li>
            </ul>
          </div>
        </div>
        <div style={styles.footerBottom}>
          <span>© {new Date().getFullYear()} TalentHireAI. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};

/* ============== Small components ============== */
const FeatureSplit = ({
  bg, border, emoji, title, subtitle, text, imageSrc, imageAlt,
  imageSide = "right", dataAos = "fade-up", delay = 0, imageMaxWidth = 440
}) => {
  const imageLeft = imageSide === "left";
  return (
    <div
      data-aos={dataAos}
      data-aos-delay={delay}
      style={{ ...styles.bandRow, background: bg, borderTop: border, borderBottom: border }}
    >
      <div
        style={{
          ...styles.bandSplit,
          gridTemplateColumns: imageLeft ? "0.95fr 1.05fr" : "1.05fr 0.95fr"
        }}
        className="bandSplit"
        data-image-left={imageLeft}
      >
        {/* Left cell */}
        {imageLeft ? (
          <div style={{ ...styles.bandSplitImage }} className="bandSplitImage">
            <img
              src={imageSrc}
              alt={imageAlt}
              style={{ ...styles.splitImage, maxWidth: imageMaxWidth }}
              data-aos="zoom-in"
              data-aos-delay={delay + 100}
            />
          </div>
        ) : (
          <div style={styles.bandContent}>
            <div style={styles.bandIcon} aria-hidden>{emoji}</div>
            <h3 style={styles.bandTitle}>{title}</h3>
            {subtitle ? <p style={styles.bandSubtitle}>{subtitle}</p> : null}
            <p style={styles.bandText}>{text}</p>
          </div>
        )}

        {/* Right cell */}
        {imageLeft ? (
          <div style={styles.bandContent}>
            <div style={styles.bandIcon} aria-hidden>{emoji}</div>
            <h3 style={styles.bandTitle}>{title}</h3>
            {subtitle ? <p style={styles.bandSubtitle}>{subtitle}</p> : null}
            <p style={styles.bandText}>{text}</p>
          </div>
        ) : (
          <div style={{ ...styles.bandSplitImage }} className="bandSplitImage">
            <img
              src={imageSrc}
              alt={imageAlt}
              style={{ ...styles.splitImage, maxWidth: imageMaxWidth }}
              data-aos="zoom-in"
              data-aos-delay={delay + 100}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const Dropdown = forwardRef(({ label, items, handlers, isOpen, toggle }, ref) => (
  <div ref={ref} style={styles.ddWrap}>
    <button onClick={toggle} style={styles.ddBtn} aria-haspopup="menu" aria-expanded={isOpen}>
      {label} <span aria-hidden>▾</span>
    </button>
    {isOpen && (
      <div style={styles.ddMenu} role="menu">
        {items.map((txt, i) => (
          <button key={txt} onClick={handlers[i]} style={styles.ddItem} role="menuitem">
            {txt}
          </button>
        ))}
      </div>
    )}
  </div>
));
Dropdown.displayName = "Dropdown";

/* ============== assets (logos) ============== */
const logos = [
  "https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_(2019).png",
  "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg",
  "https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/c/cd/Adobe_Corporate_Logo.png",
  "https://upload.wikimedia.org/wikipedia/commons/5/5f/TheHomeDepot.svg",   // Home Depot
  "https://upload.wikimedia.org/wikipedia/commons/2/29/Salesforce.com_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/6/64/Cisco_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/5/53/X_logo_2023_original.svg",
  "https://upload.wikimedia.org/wikipedia/commons/4/42/YouTube_icon_%282013-2017%29.png",
  "https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg",
  "https://upload.wikimedia.org/wikipedia/commons/4/41/Visa_Logo.png",
  "https://upload.wikimedia.org/wikipedia/commons/0/04/Mastercard-logo.png",
  "https://upload.wikimedia.org/wikipedia/commons/c/ca/Walmart_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/4/48/EBay_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/9/9a/Target_logo.svg",
  "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg",
  "https://upload.wikimedia.org/wikipedia/commons/2/2e/Bank_of_America_logo.svg",
  
];

/* ============== styles ============== */
const headerHeight = 64;

const styles = {
  page: {
    fontFamily: "Segoe UI, system-ui, -apple-system, Arial, sans-serif",
    minHeight: "100vh",
    background: "linear-gradient(180deg, #e6f0f8 0%, #f7fbff 100%)",
  },

  /* Header */
  header: {
    position: "fixed",
    top: 0, left: 0, right: 0,
    height: headerHeight,
    background: "#13293d",
    color: "#fff",
    boxShadow: "0 2px 12px rgba(0,0,0,.25)",
    zIndex: 1000,
  },
  headerInner: {
    width: "100%",
    margin: 0,
    height: "100%",
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  brandRow: { display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto", minWidth: 0, marginLeft: 20 },
  logo: { fontSize: 20 },
  brand: { fontWeight: 800, letterSpacing: 0.2, fontSize: 18, whiteSpace: "nowrap" },

  navWrap: { flex: "1 1 auto", minWidth: 0, overflowX: "auto", whiteSpace: "nowrap" },
  nav: { display: "inline-flex", alignItems: "center", gap: 6 },

  actions: { display: "flex", gap: 8, flex: "0 0 auto", marginRight: 40 },
  ghostBtn: {
    background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.25)",
    padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, whiteSpace: "nowrap",
  },
  solidBtn: {
    background: "#2aa5ff", color: "#0b1722", border: "1px solid rgba(255,255,255,.15)",
    padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap",
  },

  ddWrap: { position: "relative", display: "inline-block" },
  ddBtn: {
    background: "transparent", color: "#fff", border: "none",
    padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14, whiteSpace: "nowrap",
  },
  ddMenu: {
    position: "absolute", top: "110%", left: 0, background: "#fff",
    border: "1px solid rgba(0,0,0,.12)", borderRadius: 8, minWidth: 220,
    boxShadow: "0 10px 30px rgba(0,0,0,.35)", overflow: "hidden", zIndex: 1001,
  },
  ddItem: {
    width: "100%", textAlign: "left", background: "transparent",
    border: "none", padding: "10px 14px", cursor: "pointer", fontSize: 14,
  },

  /* Hero */
  heroSection: {
    marginTop: headerHeight + 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    alignItems: "center",
    padding: "36px 20px",
    gap: "28px",
  },
  textArea: { textAlign: "left", maxWidth: 680 },
  badge: {
    display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
    padding: "6px 10px", borderRadius: 999, color: "#0b1722",
    background: "rgba(42,165,255,.18)", border: "1px solid rgba(42,165,255,.35)", marginBottom: 10,
  },
  tagline: { fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, margin: 0, lineHeight: 1.05, color: "#1f3b4d" },
  highlight: { color: "#2aa5ff" },
  highlightStrong: {
    color: "#0f2a3d", background: "linear-gradient(90deg, #b9e3ff 0%, #e6f6ff 100%)",
    padding: "0 6px", borderRadius: 8,
  },
  subtitle: { marginTop: 14, fontSize: "clamp(15px, 1.5vw, 18px)", color: "#4a4a4a", lineHeight: 1.6, maxWidth: 560 },

  reviewRow: { marginTop: 18, display: "flex", alignItems: "center", gap: 12, fontSize: 18, flexWrap: "wrap" },
  stars: { display: "flex", alignItems: "center" },
  ratingText: { fontWeight: 700, color: "#333", fontSize: 16 },
  userCount: { color: "#555", fontSize: 15 },

  ctaRow: { display: "flex", gap: 12, marginTop: 18, alignItems: "center" },
  primaryCta: {
    background: "#2aa5ff", color: "#0b1722", padding: "12px 18px",
    borderRadius: 10, border: "1px solid rgba(0,0,0,.06)", fontWeight: 800,
    cursor: "pointer", boxShadow: "0 8px 30px rgba(42,165,255,.25)",
  },
  secondaryCta: {
    background: "transparent", color: "#1f3b4d", padding: "12px 18px",
    borderRadius: 10, border: "1px solid rgba(31,59,77,.25)", fontWeight: 700, cursor: "pointer",
  },
  miniList: {
    marginTop: 14, display: "flex", gap: 16, padding: 0,
    listStyle: "none", color: "#425a6a", fontSize: 14, flexWrap: "wrap",
  },

  imageArea: { textAlign: "right" },
  image: { maxWidth: "100%", height: "auto", borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,.12)", animation: "floaty 7s ease-in-out infinite" },

  /* Logos */
  logosSection: {
    marginTop: 8, overflow: "hidden", width: "100%",
    padding: "22px 0 10px", background: "transparent",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  logosBadge: {
    textAlign: "center", fontSize: "clamp(16px, 2vw, 20px)", fontWeight: 700,
    color: "#fff", background: "#13293d", padding: "10px 18px",
    borderRadius: "999px", border: "2px solid #2aa5ff", margin: "0 0 18px 0",
  },
  logoTrackWrap: { width: "200%", display: "block" },
  logoTrack: { display: "flex", gap: 40, width: "200%", animation: "logo-scroll 22s linear infinite" },
  logoImg: { height: 40, objectFit: "contain", filter: "none", opacity: 0.95, transition: "opacity .2s, transform .2s" },

  /* Full-width band base */
  bandRow: {
    width: "100vw",
    position: "relative",
    left: "50%",
    right: "50%",
    marginLeft: "-50vw",
    marginRight: "-50vw",
    padding: "24px 0", // slightly smaller vertical padding
  },

  /* Split band (text/image grid) */
  bandSplit: {
    maxWidth: 1150,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "1.05fr 0.95fr",
    alignItems: "center",         // center BOTH columns vertically
    gap: 20,                      // slightly tighter gap
    padding: "0 16px",
  },
  // Image wrapper uses flex so image sits centered vertically
  bandSplitImage: {
    textAlign: "right",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  splitImage: {
    maxWidth: "440px",            // global default smaller image
    width: "100%",
    height: "auto",
    borderRadius: 16,
    boxShadow: "0 14px 34px rgba(0,0,0,.12)",
    animation: "floaty 8s ease-in-out infinite",
  },

  // Text wrapper uses flex so copy is vertically centered
  bandContent: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  bandIcon: { fontSize: 36, marginBottom: 6 },
  bandTitle: { margin: "0 0 2px 0", fontSize: 24, color: "#1f3b4d", fontWeight: 800 },
  bandSubtitle: { margin: "0 0 8px 0", fontSize: 15, color: "#0f2a3d", fontWeight: 700 },
  bandText: { margin: 0, color: "#475569", lineHeight: 1.6, fontSize: 16 },

  /* Footer */
  footer: { background: "#0f2233", color: "#cfe3f5" },
  footerColWrap: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 20, padding: "28px 16px" },
  footerCol: { minWidth: 0 },
  footerHead: { margin: 0, fontSize: 18, fontWeight: 800 },
  footerSubHead: { margin: "0 0 10px 0", fontSize: 14, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" },
  footerText: { margin: "8px 0 0 0", fontSize: 14, color: "#b7cbe0", lineHeight: 1.5 },
  linkList: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 },
  link: { color: "#cfe3f5", textDecoration: "none" },
  footerBottom: { borderTop: "1px solid rgba(255,255,255,.08)", padding: "12px 16px", fontSize: 13, color: "#a9c4de" },
};

/* Stars */
const renderStar = (full = false, half = false) => {
  const gold = "#f5b50a";
  if (full) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={gold} style={{ marginRight: 3 }}>
        <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.868 1.48 8.303L12 18.896l-7.416 4.581 1.48-8.303L0 9.306l8.332-1.151z" />
      </svg>
    );
  }
  if (half) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" style={{ marginRight: 3 }}>
        <defs>
          <linearGradient id="half-grad">
            <stop offset="50%" stopColor={gold} />
            <stop offset="50%" stopColor="#ccc" />
          </linearGradient>
        </defs>
        <path
          d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.868 1.48 8.303L12 18.896l-7.416 4.581 1.48-8.303L0 9.306l8.332-1.151z"
          fill="url(#half-grad)"
        />
      </svg>
    );
  }
  return null;
};

export default WelcomePage;
