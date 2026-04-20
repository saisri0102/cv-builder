// src/DashboardPages/FeedbackPage.js
import React, { useEffect, useState } from "react";
import {
  createFeedback,
  getAllFeedback,
  updateFeedback,
  deleteFeedback,
} from "../api/feedback"; // ⬅️ adjust path if needed

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [form, setForm] = useState({ question: "", answer: "", feedback: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFeedback() {
    setLoading(true);
    setError("");
    try {
      const data = await getAllFeedback(); // ⬅️ returns array directly
      setFeedbacks(Array.isArray(data) ? data : []);
    } catch (err) {
      setError("Failed to load feedback. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.question.trim() || !form.answer.trim() || !form.feedback.trim()) {
      setError("All fields are required.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateFeedback(editingId, form);
        setEditingId(null);
      } else {
        await createFeedback(form);
      }
      setForm({ question: "", answer: "", feedback: "" });
      await loadFeedback();
    } catch (err) {
      setError("Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(fb) {
    setForm({
      question: fb.question || "",
      answer: fb.answer || "",
      feedback: fb.feedback || "",
    });
    setEditingId(fb.id);
    setError("");
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to delete this feedback?")) return;
    setError("");
    try {
      await deleteFeedback(id);
      await loadFeedback();
    } catch (err) {
      setError("Failed to delete feedback. Please try again.");
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ marginTop: 0 }}>Feedback Manager</h2>

      {error && (
        <div style={{ color: "#b91c1c", background: "#fee2e2", padding: 10, borderRadius: 6, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 24, border: "1px solid #e5e7eb", padding: 16, borderRadius: 8, background: "#fff" }}>
        <label>
          Question:
          <input
            style={inputStyle}
            placeholder="Question"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            disabled={submitting}
          />
        </label>

        <label>
          Answer:
          <textarea
            style={textareaStyle}
            placeholder="Answer"
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            disabled={submitting}
          />
        </label>

        <label>
          Feedback:
          <textarea
            style={textareaStyle}
            placeholder="Feedback"
            value={form.feedback}
            onChange={(e) => setForm({ ...form, feedback: e.target.value })}
            disabled={submitting}
          />
        </label>

        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? "Please wait..." : editingId ? "Update" : "Submit"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ question: "", answer: "", feedback: "" });
            }}
            style={{ ...buttonStyle, marginLeft: 8, backgroundColor: "#6b7280" }}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
      </form>

      <h3>All Feedback</h3>

      {loading ? (
        <p>Loading feedback...</p>
      ) : feedbacks.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No feedback found.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {feedbacks.map((fb) => (
            <li key={fb.id} style={listItemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div><b>ID:</b> {fb.id}</div>
                {fb.created_at && <div style={{ color: "#6b7280" }}><b>Created:</b> {formatDate(fb.created_at)}</div>}
              </div>
              <div style={{ marginTop: 8 }}><b>Q:</b> {fb.question}</div>
              <div style={{ marginTop: 8 }}><b>A:</b> <pre style={preStyle}>{fb.answer}</pre></div>
              <div style={{ marginTop: 8 }}><b>Feedback:</b> <pre style={preStyle}>{fb.feedback}</pre></div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => handleEdit(fb)} disabled={submitting} style={smallButtonStyle}>
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(fb.id)}
                  disabled={submitting}
                  style={{ ...smallButtonStyle, marginLeft: 10, backgroundColor: "#e74c3c" }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ========== helpers & styles ========== */
function formatDate(d) {
  try {
    const dt = new Date(d);
    return dt.toLocaleString();
  } catch {
    return d;
  }
}

const inputStyle = {
  display: "block",
  width: "100%",
  padding: 8,
  margin: "8px 0 16px",
  borderRadius: 4,
  border: "1px solid #ccc",
  fontSize: 16,
};

const textareaStyle = {
  ...inputStyle,
  height: 100,
  resize: "vertical",
};

const buttonStyle = {
  padding: "10px 16px",
  fontSize: 15,
  borderRadius: 6,
  border: "none",
  backgroundColor: "#007bff",
  color: "white",
  cursor: "pointer",
};

const smallButtonStyle = {
  padding: "6px 12px",
  fontSize: 14,
  borderRadius: 6,
  border: "none",
  backgroundColor: "#3498db",
  color: "white",
  cursor: "pointer",
};

const listItemStyle = {
  padding: "12px",
  marginBottom: "12px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  backgroundColor: "#fff",
};

const preStyle = {
  whiteSpace: "pre-wrap",
  margin: 0,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: 8,
};
