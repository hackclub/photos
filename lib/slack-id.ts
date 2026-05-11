export function normalizeSlackId(slackId: string) {
  return slackId.trim().toUpperCase();
}

export function isValidSlackId(slackId: string) {
  return /^U[A-Z0-9]{8,}$/.test(normalizeSlackId(slackId));
}

export function parseSlackIds(input: string | string[]) {
  const values = Array.isArray(input) ? input : input.split(/[\s,;]+/);
  return Array.from(
    new Set(
      values
        .map(normalizeSlackId)
        .filter((value) => value.length > 0 && isValidSlackId(value)),
    ),
  );
}
