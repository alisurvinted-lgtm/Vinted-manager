export function isMonth(value: string): boolean {
  return /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value);
}
export function monthLabel(month: string): string {
  if (!isMonth(month))
    throw new Error("Choisissez un mois et une année valides.");
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-15T12:00:00Z`));
}
// Dates civiles Europe/Paris ; aucun jour fictif « 31 » pour février ou avril.
export function monthRange(month: string) {
  if (!isMonth(month))
    throw new Error("Choisissez un mois et une année valides.");
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${lastDay}` };
}
export function moveMonth(month: string, offset: number): string | null {
  if (!isMonth(month) || !Number.isSafeInteger(offset))
    throw new Error("Période invalide.");
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  const nextYear = Math.floor(index / 12);
  if (nextYear < 1900 || nextYear > 9999) return null;
  return `${nextYear}-${String((index % 12) + 1).padStart(2, "0")}`;
}
