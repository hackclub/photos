"use client";

import Script from "next/script";

const RYBBIT_SITE_ID = "319a457e5e76";
const RYBBIT_SCRIPT_SRC = "/api/script.js";

export default function RybbitScript() {
  return (
    <Script
      src={RYBBIT_SCRIPT_SRC}
      data-site-id={RYBBIT_SITE_ID}
      strategy="afterInteractive"
    />
  );
}
