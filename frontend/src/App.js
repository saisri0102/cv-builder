// frontend/src/App.tsx
// @ts-nocheck
import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

// Layouts
import Layout from "./components/Layout";
import DashboardLayout from "./components/DashboardLayout";

// Pages (eager)
import WelcomePage from "./pages/WelcomePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import HelpPage from "./pages/HelpPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

// Billing
import BillingPage from "./pages/BillingPage";
import SubscriptionBadge from "./components/billing/SubscriptionBadge";

// Features
import ResumeMatcherPage from "./DashboardPages/ResumeMatcherPage";
import EnhanceResumePage from "./DashboardPages/EnhanceResumePage";
import InterviewPrepPage from "./DashboardPages/InterviewPrepPage";
import MyResumesPage from "./DashboardPages/MyResumesPage";
import ResumeCompare from "./components/ResumeCompare";
import ResumeParser from "./components/ResumeParser";
import FeedbackPage from "./api/FeedbackPage";
import ResumeCoverGenerator from "./DashboardPages/ResumeCoverGenerator";
import ProfilePage from "./DashboardPages/ProfilePage";
import JobPostingsPage from "./DashboardPages/JobPostingsPage";
import MockMatePage from "./DashboardPages/MockMate";

// Simple success/cancel pages for Stripe redirects
const BillingSuccessPage = () => (
  <div style={placeholderStyle}>
    <h2>Payment success 🎉</h2>
    <p>Your subscription is active. You can close this tab or return to the app.</p>
  </div>
);

const BillingCancelledPage = () => (
  <div style={placeholderStyle}>
    <h2>Checkout cancelled</h2>
    <p>No charge was made. You can try again anytime from the Billing page.</p>
  </div>
);

// Placeholder Component
const PlaceholderPage = ({ title, message }) => (
  <div style={placeholderStyle}>
    <h2>{title}</h2>
    <p>{message}</p>
  </div>
);

const placeholderStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  background: "linear-gradient(-45deg, #f2f4f8, #e3f2fd, #dbe9f4, #ffffff)",
};

// Top-right Billing link + badge (no TS casts)
const topBarStyle = {
  position: "fixed",
  top: 12,
  right: 12,
  display: "flex",
  alignItems: "center",
  gap: 12,
  zIndex: 1000,
};
const billingBtnStyle = {
  background: "#111",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  fontSize: 14,
};

function App() {
  return (
    <Router>
      {/* Global Billing shortcut */}
      <div style={topBarStyle}>
        <SubscriptionBadge />
        <Link to="/billing" style={billingBtnStyle}>
          Billing
        </Link>
      </div>

      <Suspense fallback={<div style={{ padding: 20 }}>Loading…</div>}>
        <Routes>
          {/* Public pages with global layout */}
          <Route path="/" element={<Layout><WelcomePage /></Layout>} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/login" element={<Layout><LoginPage /></Layout>} />
          <Route path="/signup" element={<Layout><SignupPage /></Layout>} />
          <Route path="/forgot-password" element={<Layout><ForgotPassword /></Layout>} />
          <Route path="/reset-password" element={<Layout><ResetPassword /></Layout>} />
          <Route path="/resume-cover-generator" element={<ResumeCoverGenerator />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings/password" element={<ChangePasswordPage />} />

          {/* Billing routes */}
          <Route path="/billing" element={<Layout><BillingPage /></Layout>} />
          <Route path="/billing/success" element={<Layout><BillingSuccessPage /></Layout>} />
          <Route path="/billing/cancelled" element={<Layout><BillingCancelledPage /></Layout>} />

          {/* Jobs list under dashboard layout */}
          <Route
            path="/dashboard/jobs"
            element={
              <DashboardLayout>
                <JobPostingsPage />
              </DashboardLayout>
            }
          />

          {/* Dashboard landing (with sidebar) */}
          <Route
            path="/dashboard"
            element={
              <DashboardLayout>
                <DashboardPage />
              </DashboardLayout>
            }
          />

          {/* Feature pages — NO SIDEBAR */}
          <Route
            path="/resume-matcher"
            element={
              <DashboardLayout noSidebar>
                <ResumeMatcherPage />
              </DashboardLayout>
            }
          />
          <Route
            path="/enhance-resume"
            element={
              <DashboardLayout noSidebar>
                <EnhanceResumePage />
              </DashboardLayout>
            }
          />
          <Route
            path="/my-resumes"
            element={
              <DashboardLayout noSidebar>
                <MyResumesPage />
              </DashboardLayout>
            }
          />
          <Route
            path="/interview-prep"
            element={
              <DashboardLayout noSidebar>
                <InterviewPrepPage />
              </DashboardLayout>
            }
          />
          <Route
            path="/resume-compare"
            element={
              <DashboardLayout noSidebar>
                <ResumeCompare />
              </DashboardLayout>
            }
          />

          {/* Resume Parser */}
          <Route
            path="/resume-parser"
            element={
              <DashboardLayout noSidebar>
                <ResumeParser />
              </DashboardLayout>
            }
          />
          <Route
            path="/feedback"
            element={
              <DashboardLayout noSidebar>
                <FeedbackPage />
              </DashboardLayout>
            }
          />

          {/* MockMate */}
          <Route
            path="/mockmate"
            element={
              <DashboardLayout noSidebar>
                <MockMatePage />
              </DashboardLayout>
            }
          />

          {/* OAuth placeholders */}
          <Route
            path="/google-login"
            element={<PlaceholderPage title="🔴 Google Login Page" message="Google authentication logic will go here." />}
          />
          <Route
            path="/linkedin-login"
            element={<PlaceholderPage title="🔗 LinkedIn Login Page" message="LinkedIn authentication logic will go here." />}
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <PlaceholderPage
                title="404 – Not Found"
                message="The page you're looking for doesn't exist."
              />
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
