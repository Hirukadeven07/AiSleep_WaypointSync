/** The 25 administrative districts of Sri Lanka. */
export const SRI_LANKA_DISTRICTS = [
  'Ampara',
  'Anuradhapura',
  'Badulla',
  'Batticaloa',
  'Colombo',
  'Galle',
  'Gampaha',
  'Hambantota',
  'Jaffna',
  'Kalutara',
  'Kandy',
  'Kegalle',
  'Kilinochchi',
  'Kurunegala',
  'Mannar',
  'Matale',
  'Matara',
  'Monaragala',
  'Mullaitivu',
  'Nuwara Eliya',
  'Polonnaruwa',
  'Puttalam',
  'Ratnapura',
  'Trincomalee',
  'Vavuniya',
] as const;

/** District names compare case- and space-insensitively, so "nuwara eliya" matches "Nuwara Eliya". */
export const districtKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** All 25 districts plus any other name in `extra` (e.g. a spelling the data uses), A to Z. */
export function allDistricts(extra: readonly string[] = []): string[] {
  const byKey = new Map<string, string>();
  // Names the data already uses win, so a filter matches the stored spelling.
  for (const d of extra) if (!byKey.has(districtKey(d))) byKey.set(districtKey(d), d);
  for (const d of SRI_LANKA_DISTRICTS) if (!byKey.has(districtKey(d))) byKey.set(districtKey(d), d);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
