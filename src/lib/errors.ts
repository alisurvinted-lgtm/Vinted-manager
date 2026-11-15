export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.name === "QuotaExceededError")
      return "L’espace de stockage est insuffisant. Exportez une sauvegarde et libérez de l’espace sur votre appareil.";
    // Les erreurs métier sont créées en français avec Error ; les erreurs techniques du navigateur restent masquées.
    if (error.name === "Error") return error.message;
  }
  return fallback;
}
