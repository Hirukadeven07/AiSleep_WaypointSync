/** The two depots. Ids are the database keys; names are what people see. */
export const DEPOTS: readonly { id: string; name: string }[] = [
  { id: 'depo1', name: 'Peliyagoda' },
  { id: 'depo2', name: 'Kandy' },
];

export const depotName = (id: string | null | undefined) =>
  DEPOTS.find((d) => d.id === id)?.name ?? id ?? '';
