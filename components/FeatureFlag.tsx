import type { ReactNode } from "react";

interface FeatureFlagProps {
  flag: () => Promise<boolean>;
  children: ReactNode;
  fallback?: ReactNode;
}
export async function FeatureFlag({
  flag,
  children,
  fallback = null,
}: FeatureFlagProps) {
  const enabled = await flag();
  return enabled ? children : fallback;
}
