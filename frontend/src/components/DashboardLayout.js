// src/components/DashboardLayout.js
import React from "react";
import { Outlet } from "react-router-dom";

const baseLayout = { minHeight: "100vh", display: "grid" };
const mainBase = { background: "#fff" };

const DashboardLayout = ({ children, noSidebar }) => {
  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; background:#fafafa; }
      `}</style>

      <div
        style={{
          ...baseLayout,
          gridTemplateColumns: "1fr", // always full width now
        }}
      >
        <main
          style={{
            ...mainBase,
            padding: 20,
          }}
        >
          <div style={{ width: "100%" }}>
            {/* If a parent passes children, render them; otherwise render nested route */}
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </>
  );
};

export default DashboardLayout;
