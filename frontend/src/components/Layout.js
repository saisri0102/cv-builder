// Layout.jsx
import React from "react";
import { useLocation } from "react-router-dom";

const Layout = ({ children }) => {
  const location = useLocation();

  // Add every page that should not have margins/sidebars here
  const fullWidthPages = ["/", "/login", "/resume-matcher", "/enhance-resume"];
  const isFullWidth = fullWidthPages.includes(location.pathname);

  return (
    <div
      style={{
        padding: isFullWidth ? "0" : "20px",
        maxWidth: isFullWidth ? "100%" : "1200px",
        margin: isFullWidth ? "0" : "0 auto",
        width: "100%",
      }}
    >
      {/* If you have a global header and you want to hide it on full-width pages, keep this conditional. */}
      <header style={{ marginBottom: isFullWidth ? "0" : "20px" }}>
        {/* header content (optional) */}
      </header>
      {children}
    </div>
  );
};

export default Layout;
