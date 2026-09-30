export function tripMinutes({
  outboundMin,
  interStopMin,
  allowancesMin,
}: {
  outboundMin: number;
  interStopMin: number;
  allowancesMin: number[];
}): number {
  const service = allowancesMin.reduce((sum, m) => sum + m, 0);
  return outboundMin + interStopMin * Math.max(allowancesMin.length - 1, 0) + service;
}
