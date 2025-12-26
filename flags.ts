import { growthbookAdapter } from "@flags-sdk/growthbook";
import { flag } from "flags/next";
import { after } from "next/server";
import { identify } from "@/lib/identify";

growthbookAdapter.setTrackingCallback((experiment, result) => {
  after(async () => {});
});
export const maintenanceMode = flag({
  key: "maintenance-mode",
  adapter: growthbookAdapter.feature<boolean>(),
  defaultValue: false,
  identify,
});
export const signage = flag({
  key: "signage",
  adapter: growthbookAdapter.feature<boolean>(),
  defaultValue: false,
  identify,
});
export const comingSoon = flag({
  key: "coming-soon",
  adapter: growthbookAdapter.feature<boolean>(),
  defaultValue: false,
  identify,
});
