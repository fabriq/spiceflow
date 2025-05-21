export function parseStringifiedValue(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
