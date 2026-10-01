/**
 * Up to two capital letters from a person's name, for avatar circles.
 * Seeded names carry the role in brackets ("Kasun (Driver)"), which is dropped first.
 */
export function initials(name: string) {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
