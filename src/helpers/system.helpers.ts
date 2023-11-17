export function getSystemTimeZone(): string {
  const envTimeZone = process.env.TIME_ZONE;
  return envTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}
