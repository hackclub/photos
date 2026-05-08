export { getSlackAvatarUrl } from "@/lib/user-display";

export function getInitials(name: string) {
  return name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "?";
}
