export function parisDate(input: Date | number = Date.now()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) throw new Error("Date invalide.");
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((v) => [v.type, v.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export function parisMonthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Mois invalide.");
  const [year, m] = month.split("-").map(Number);
  function midnight(y: number, number: number) {
    const utc = new Date(Date.UTC(y, number - 1, 1));
    const target = utc.getTime();
    let result = target;
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date(result))
          .map((v) => [v.type, v.value]),
      );
      const localAsUTC = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      result += target - localAsUTC;
    }
    return result;
  }
  return { start: midnight(year, m), end: midnight(year, m + 1) };
}
