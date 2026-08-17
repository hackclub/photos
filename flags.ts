import { vercelAdapter } from "@flags-sdk/vercel";
import { flag } from "flags/next";
import { type FlagEntities, identify } from "@/lib/identify";

export const maintenanceMode = flag<boolean, FlagEntities>({
  key: "maintenance-mode",
  adapter: vercelAdapter,
  defaultValue: false,
  description: "Show the maintenance page instead of the application.",
  options: [
    { label: "Off", value: false },
    { label: "On", value: true },
  ],
  identify,
});
export const signage = flag<boolean, FlagEntities>({
  key: "signage",
  adapter: vercelAdapter,
  defaultValue: false,
  description: "Enable the event signage display routes.",
  options: [
    { label: "Off", value: false },
    { label: "On", value: true },
  ],
  identify,
});
export const comingSoon = flag<boolean, FlagEntities>({
  key: "coming-soon",
  adapter: vercelAdapter,
  defaultValue: false,
  description: "Show the coming soon page instead of the application.",
  options: [
    { label: "Off", value: false },
    { label: "On", value: true },
  ],
  identify,
});
