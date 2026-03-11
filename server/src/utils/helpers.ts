/**
 * Get patient initials safely (handles empty strings).
 */
export function safeInitials(firstName: string, lastName: string): string {
  const f = firstName?.trim();
  const l = lastName?.trim();
  return `${f ? f[0].toUpperCase() : '?'}${l ? l[0].toUpperCase() : '?'}`;
}
