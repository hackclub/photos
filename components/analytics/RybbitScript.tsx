"use client";

import Script from "next/script";
import { RYBBIT_SITE_ID } from "@/lib/constants";

const RYBBIT_SCRIPT_SRC = "/api/script.js";

export default function RybbitScript() {
  if (!RYBBIT_SITE_ID) return null;
  return (
    <Script
      src={RYBBIT_SCRIPT_SRC}
      data-site-id={RYBBIT_SITE_ID}
      strategy="afterInteractive"
    />
  );
}
