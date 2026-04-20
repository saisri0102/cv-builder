import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL) ||
  "";

const hasTTS = typeof window !== "undefined" && "speechSynthesis" in window;
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

const DEFAULT_QUESTIONS = [
  "Tell me about yourself.",
  "Why are you interested in this role?",
  "Describe a challenging problem you solved recently.",
  "How do you prioritize tasks under a tight deadline?",
  "Tell me about a time you worked in a team and resolved a conflict.",
];

/* ---------- Robust voice loader ---------- */
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function ensureVoicesReady(timeoutMs = 1500) {
  if (!hasTTS) return [];
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (voices && voices.length) return voices;

  let resolveFn;
  const done = new Promise((res) => (resolveFn = res));
  const onVoices = () => { try { synth.onvoiceschanged = null; } catch {} resolveFn(); };
  try { synth.onvoiceschanged = onVoices; } catch {}
  const poll = (async () => { for (let i = 0; i < 12; i++) { voices = synth.getVoices(); if (voices?.length) return; await wait(100); } })();
  await Promise.race([done, poll, wait(timeoutMs)]);
  return synth.getVoices() || [];
}

export default function MockMate() {
  // Text chat (fallback)
  const [userInput, setUserInput] = useState("");
  const [conversation, setConversation] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);

  // Voice interview state
  const [running, setRunning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);

  const [questions] = useState(DEFAULT_QUESTIONS);
  const [qIndex, setQIndex] = useState(0);
  const currentQuestion = questions[qIndex] || "No more questions.";
  const progressText = `Question ${Math.min(qIndex + 1, questions.length)} of ${questions.length}`;

  // transcripts
  const [assistantLines, setAssistantLines] = useState([]); // {text, ts}
  const [userLines, setUserLines] = useState([]);           // {text, ts, q}
  const [userInterim, setUserInterim] = useState("");

  // feedback
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [lastFeedback, setLastFeedback] = useState(null);

  // refs
  const recRef = useRef(null);
  const cancelSpeakRef = useRef(null);
  const lastSpokenRef = useRef("");

  // helpers
  const addAssistantLine = useCallback((text) => {
    setAssistantLines((prev) => [...prev, { text, ts: Date.now() }]);
  }, []);

  const addUserFinal = useCallback((text) => {
    const t = String(text || "").trim();
    if (!t) return;
    setUserLines((prev) => [...prev, { text: t, ts: Date.now(), q: currentQuestion }]);
  }, [currentQuestion]);

  /* ---------------------- TTS ---------------------- */
  const speak = useCallback(async (text, opts = {}) => {
    if (!hasTTS) throw new Error("TTS not supported in this browser.");
    const s = String(text || "").trim();
    if (!s) return;
    try { window.speechSynthesis.cancel(); } catch {}
    const voices = await ensureVoicesReady();
    const utter = new SpeechSynthesisUtterance(s);
    utter.rate   = typeof opts.rate === "number" ? opts.rate : 1.0;
    utter.pitch  = typeof opts.pitch === "number" ? opts.pitch : 1.0;
    utter.volume = typeof opts.volume === "number" ? opts.volume : 1.0;
    const picked =
      voices.find(v => /en(-|_)?(US|GB|IN)?/i.test(v.lang)) ||
      voices.find(v => v.default) ||
      voices[0];
    if (picked) utter.voice = picked;

    return new Promise((resolve, reject) => {
      utter.onstart = () => setSpeaking(true);
      utter.onend   = () => { setSpeaking(false); resolve(); };
      utter.onerror = (e) => { setSpeaking(false); reject(e?.error || e); };
      try { window.speechSynthesis.speak(utter); } catch (e) { setSpeaking(false); reject(e); }
    });
  }, []);

  /* ---------------------- STT ---------------------- */
  const startRecognition = useCallback(() => {
    if (!SR) return;
    stopRecognition();
    const rec = new SR();
    rec.interimResults = true;
    rec.continuous = true;
    rec.lang = "en-US";

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    rec.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript || "";
        if (res.isFinal) finalChunk += txt; else interim += txt;
      }
      setUserInterim(interim || "");
      if (finalChunk.trim()) addUserFinal(finalChunk);
    };

    try { rec.start(); recRef.current = rec; } catch { setListening(false); }
  }, [addUserFinal]);

  const stopRecognition = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try { rec.onresult = null; rec.onend = null; rec.onerror = null; rec.stop(); } catch {}
    recRef.current = null;
    setListening(false);
    setUserInterim("");
  }, []);

  /* ---------------------- Flow ---------------------- */
  const askCurrent = useCallback(async () => {
    const q = String(currentQuestion || "");
    if (!q) return;
    if (lastSpokenRef.current === q) return;
    lastSpokenRef.current = q;

    stopRecognition();
    addAssistantLine(q);
    try { await speak(q); } catch (e) { console.warn("TTS failed:", e); }
  }, [currentQuestion, speak, addAssistantLine, stopRecognition]);

  const handleStart = useCallback(async () => {
    if (!hasTTS || !SR) {
      alert("Your browser lacks full speech features. Voice mode may not work—use text chat below.");
      return;
    }
    try { await ensureVoicesReady(); } catch {}
    setRunning(true);
    setAssistantLines([]);
    setUserLines([]);
    setUserInterim("");
    setLastScore(null);
    setLastFeedback(null);
    setQIndex(0);
    lastSpokenRef.current = "";
    askCurrent();
  }, [askCurrent]);

  const handleStop = useCallback(() => {
    setRunning(false);
    stopRecognition();
    try { window.speechSynthesis?.cancel(); } catch {}
    cancelSpeakRef.current?.();
  }, [stopRecognition]);

  const handleNext = useCallback(() => {
    const next = Math.min(qIndex + 1, questions.length - 1);
    setQIndex(next);
    setLastScore(null);
    setLastFeedback(null);
    lastSpokenRef.current = "";
  }, [qIndex, questions.length]);

  useEffect(() => {
    if (!running) return;
    if (!speaking) startRecognition();
    else stopRecognition();
  }, [speaking, running, startRecognition, stopRecognition]);

  useEffect(() => {
    if (!running) return;
    askCurrent();
  }, [qIndex, running, askCurrent]);

  useEffect(() => {
    return () => {
      stopRecognition();
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, [stopRecognition]);

  /* ---------------------- Feedback ---------------------- */
  const requestFeedback = useCallback(async (question, answer) => {
    if (!API_URL) return;
    try {
      setLoadingFeedback(true);
      const res = await fetch(`${API_URL}/api/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "interview",
          question,
          answer_transcript: answer,
          target_role: "General",
          rubric: { dimensions: ["Relevance", "Structure", "Impact", "Clarity"], return_score: true },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Feedback error");
      setLastScore(data?.score ?? null);
      setLastFeedback(data);
    } catch {
      setLastScore(null);
      setLastFeedback(null);
    } finally {
      setLoadingFeedback(false);
    }
  }, []);

  useEffect(() => {
    if (!running || userLines.length === 0) return;
    const last = userLines[userLines.length - 1];
    requestFeedback(last.q, last.text);
  }, [userLines, running, requestFeedback]);

  /* ---------------------- Text fallback ---------------------- */
  const handleSend = async () => {
    const msg = userInput.trim();
    if (!msg) return;
    setLoadingChat(true);
    try {
      const response = await fetch(`${API_URL}/api/interview-assistant`, {
        method: "POST",
        body: JSON.stringify({ message: msg }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || "Network error");
      setConversation((prev) => [
        ...prev,
        { role: "user", text: msg },
        { role: "ai", text: data.reply || "No response from AI." },
      ]);
      setUserInput("");
    } catch {
      alert("Failed to get response from MockMate.");
    } finally {
      setLoadingChat(false);
    }
  };

  const supportMsg = useMemo(() => {
    if (hasTTS && SR) return "";
    if (!hasTTS && !SR) return "Speech Synthesis and Recognition are not supported in this browser.";
    if (!hasTTS) return "Speech Synthesis is not supported in this browser.";
    if (!SR) return "Speech Recognition is not supported (try Chrome/Edge).";
    return "";
  }, []);

  return (
    <div style={sx.page}>
      {/* Header */}
      <header style={sx.header}>
        <div>
          <h1 style={sx.h1}>MockMate</h1>
        </div>
        <p style={sx.sub}>
          Voice Interview Simulation — the assistant asks out loud, you answer by speaking. Live transcript included.
        </p>
        <div style={sx.badgesRow}>
          <Badge tone={running ? "success" : "muted"}>Session: {running ? "Running" : "Stopped"}</Badge>
          <Badge tone={speaking ? "info" : "muted"}>Assistant: {speaking ? "Speaking" : "Idle"}</Badge>
          <Badge tone={listening ? "warn" : "muted"}>Mic: {listening ? "Listening" : "Off"}</Badge>
          {!!supportMsg && <Badge tone="error">{supportMsg}</Badge>}
        </div>
      </header>

      {/* NEW: two-column layout */}
      <main style={sx.mainCols}>
        {/* LEFT stack */}
        <div style={sx.leftStack}>
          {/* Controls */}
          <section style={sx.card}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {!running ? (
                <button style={sx.btnPrimary} onClick={handleStart} disabled={!hasTTS || !SR}>
                  Start
                </button>
              ) : (
                <button style={sx.btnDanger} onClick={handleStop}>
                  Stop
                </button>
              )}
              <button
                style={sx.btnSecondary}
                onClick={handleNext}
                disabled={!running || qIndex >= questions.length - 1}
              >
                Next
              </button>
              <button
                style={sx.btnGhost}
                onClick={async () => {
                  try { await speak("Hi! If you can hear this, text to speech is working."); }
                  catch { alert("Text to speech failed in this browser."); }
                }}
              >
                Test Voice
              </button>
              <div style={{ marginLeft: "auto", color: "#6b7280" }}>{progressText}</div>
            </div>
          </section>

          {/* Current Question (just below controls) */}
          <section style={{ ...sx.card, borderTop: "3px solid #93c5fd" }}>
            <div style={sx.cardTitle}>Current Question</div>
            <div style={{ fontSize: 16 }}>{currentQuestion}</div>
          </section>

          {/* Assistant spoken (tall, grows) */}
          <section style={sx.cardTall}>
            <div style={sx.cardTitle}>Assistant (spoken)</div>
            <div style={sx.scroller}>
              {assistantLines.length === 0 ? (
                <div style={sx.muted}>No questions spoken yet.</div>
              ) : (
                assistantLines.map((l, i) => <Bubble key={l.ts + ":" + i} who="assistant" text={l.text} />)
              )}
            </div>
          </section>

          {/* Feedback (short) */}
          <section style={{ ...sx.card, borderTop: "3px solid #14b8a6" }}>
            <div style={sx.cardHeader}>
              <div style={sx.cardTitle}>AI Feedback (per answer)</div>
              {loadingFeedback && <span style={sx.spinner}>⏳</span>}
            </div>
            <div style={{ ...sx.innerScroll, maxHeight: 160 }}>
              {!lastFeedback ? (
                <div style={sx.muted}>Answer a question to see feedback here.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start" }}>
                  <div style={sx.scorePill}>{typeof lastScore === "number" ? lastScore.toFixed(1) : "-"}</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {Array.isArray(lastFeedback?.strengths) && lastFeedback.strengths.length > 0 && (
                      <div>
                        <div style={sx.kicker}>Strengths</div>
                        <div style={sx.bullets}>
                          {lastFeedback.strengths.map((s, i) => <div key={i}>• {s}</div>)}
                        </div>
                      </div>
                    )}
                    {Array.isArray(lastFeedback?.gaps) && lastFeedback.gaps.length > 0 && (
                      <div>
                        <div style={sx.kicker}>Areas to Improve</div>
                        <div style={sx.bullets}>
                          {lastFeedback.gaps.map((g, i) => <div key={i}>• {g}</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Text Chat (fallback) below feedback */}
          <section style={{ ...sx.card, borderTop: "3px solid #14b8a6" }}>
            <div style={sx.cardHeader}>
              <div style={sx.cardTitle}>Text Chat (fallback)</div>
            </div>
            <div style={{ ...sx.innerScroll, maxHeight: 180 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {conversation.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      background: m.role === "user" ? "#eff6ff" : "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      padding: 10,
                      borderRadius: 10,
                    }}
                  >
                    <strong>{m.role === "user" ? "You" : "MockMate"}:</strong> {m.text}
                  </div>
                ))}
              </div>
            </div>
            <div style={sx.inputRow}>
              <input
                placeholder="Type here if voice isn’t available…"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                disabled={loadingChat}
                style={sx.input}
                aria-label="Chat input"
              />
              <button onClick={handleSend} disabled={loadingChat || !userInput.trim()} style={sx.btnSecondary}>
                {loadingChat ? "Sending…" : "Send"}
              </button>
            </div>
          </section>
        </div>

        {/* RIGHT column: Live transcript fills the rest */}
        <div style={sx.rightCol}>
          <section style={sx.cardFill}>
            <div style={sx.cardTitle}>You (live transcript)</div>
            <div style={sx.scroller}>
              {!!userInterim && <Bubble who="you" text={userInterim} interim />}
              {userLines.length === 0 && !userInterim && <div style={sx.muted}>Your spoken answers will appear here.</div>}
              {userLines.map((l, i) => <Bubble key={l.ts + ":" + i} who="you" text={l.text} />)}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ------------ small UI helpers ------------ */
function Badge({ children, tone = "muted" }) {
  const palette = {
    muted:   { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
    success: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
    info:    { bg: "#eff6ff", text: "#1e3a8a", border: "#bfdbfe" },
    warn:    { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
    error:   { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
  }[tone] || {};
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        padding: "6px 12px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      {children}
    </span>
  );
}

function Bubble({ who = "assistant", text = "", interim = false }) {
  const isYou = who === "you";
  return (
    <div
      title={interim ? "Interim (live)" : ""}
      style={{
        border: `1px solid ${isYou ? "#e9d5ff" : "#e5e7eb"}`,
        background: isYou ? (interim ? "#f5f3ff" : "#faf5ff") : "#f9fafb",
        padding: 10,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
        {isYou ? "You" : "Assistant"} {interim ? "(live…)" : ""}
      </div>
      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
    </div>
  );
}

const SHORT_ROW_HEIGHT = "clamp(100px, 15vh, 200px)";

const sx = {
  page: {
    width: "100%",
    height: "100vh",
    margin: 0,
    padding: "12px 16px",
    background: "#f1f5f9",
    boxSizing: "border-box",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },

  header: {
    flex: "0 0 auto",
    padding: "14px 16px",
    marginBottom: 8,
    background: "linear-gradient(180deg, #f0f9ff, #eef2ff)",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(2, 6, 23, 0.05)",
  },
  h1: { fontSize: 28, fontWeight: 800, margin: "0 0 4px 0", color: "#0f172a" },
  sub: { color: "#334155", margin: "6px 0 0 0" },
  badgesRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },

  /* NEW two-column layout */
  mainCols: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(360px, 520px) 1fr",
    gap: 10,
    overflow: "hidden",
  },

  leftStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 0,
  },

  rightCol: {
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },

  /* Cards */
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontWeight: 600, marginBottom: 6 },

  /* Tall left card that grows (Assistant spoken) */
  cardTall: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderTop: "3px solid #94a3b8",
    borderRadius: 12,
    padding: 12,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    flex: "1 1 0%", // grow to fill remaining left height
  },

  /* Right side fill card (Live transcript) */
  cardFill: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderTop: "3px solid #94a3b8",
    borderRadius: 12,
    padding: 12,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
  },

  scroller: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  innerScroll: {
    flex: "0 0 auto",
    overflowY: "auto",
    overflowX: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  scorePill: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    fontSize: 18,
    color: "white",
    background: "#0d9488",
  },
  kicker: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3, color: "#6b7280", marginBottom: 4 },
  bullets: { display: "grid", gap: 4 },

  inputRow: {
    display: "flex",
    gap: 8,
    paddingTop: 8,
    borderTop: "1px solid #f1f5f9",
    flex: "0 0 auto",
    background: "white",
  },

  btnPrimary: {
    padding: "10px 16px",
    border: "1px solid #2563eb",
    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
    color: "white",
    borderRadius: 10,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(37, 99, 235, 0.25)",
    fontWeight: 600,
  },
  btnSecondary: {
    padding: "10px 16px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  },
  btnGhost: {
    padding: "10px 16px",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#0f172a",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  },
  btnDanger: {
    padding: "10px 16px",
    border: "1px solid #dc2626",
    background: "linear-gradient(135deg, #ef4444, #dc2626)",
    color: "white",
    borderRadius: 10,
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(220, 38, 38, 0.22)",
    fontWeight: 600,
  },

  muted: { color: "#6b7280" },
  spinner: { fontSize: 14 },
  input: {
    flex: 1,
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    outline: "none",
    background: "white",
  },
};