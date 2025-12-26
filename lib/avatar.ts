import md5 from "md5";
import {
  AVATAR_COLORS,
  CACHET_API_URL,
  DICEBEAR_API_URL,
  GRAVATAR_URL,
  LIBRAVATAR_URL,
} from "@/lib/constants";
export { AVATAR_COLORS };
export function getDiceBearUrl(seed: string) {
  const colorIndex =
    seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    AVATAR_COLORS.length;
  const color = AVATAR_COLORS[colorIndex];
  return `${DICEBEAR_API_URL}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${color}`;
}
export function getSlackAvatarUrl(slackId: string) {
  return `${CACHET_API_URL}/users/${slackId}/r`;
}
export function getGravatarUrl(email: string, size: number = 400) {
  const hash = md5(email.trim().toLowerCase());
  return `${GRAVATAR_URL}/${hash}?d=mp&s=${size}`;
}
export function getLibravatarUrl(email: string, size: number = 400) {
  const hash = md5(email.trim().toLowerCase());
  return `${LIBRAVATAR_URL}/${hash}?d=mp&s=${size}`;
}
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
