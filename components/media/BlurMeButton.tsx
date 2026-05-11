"use client";
import { HiEyeSlash } from "react-icons/hi2";

export default function BlurMeButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("blur-me-toggle"))}
      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-lg transition-all border border-white/20 backdrop-blur-sm"
    >
      <HiEyeSlash className="w-5 h-5" />
      Blur Me
    </button>
  );
}
