import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { db } from "../lib/db";
import { SessionLock } from "../lib/session-lock";
import { encryptBackup } from "../lib/crypto-backup";
import { download } from "../lib/backup";
import { ErrorMessage } from "./ui";
export function VaultGate({ children }: { children: ReactNode }) {
  useSyncExternalStore(db.subscribe, db.getSnapshot);
  const [phrase, setPhrase] = useState(""),
    [repeat, setRepeat] = useState(""),
    [accepted, setAccepted] = useState(false),
    [exportBefore, setExportBefore] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const controller = useRef<SessionLock | null>(null);
  const status = db.status;
  const unlocked = db.isUnlocked;
  const minutes = db.autoLockMinutes;
  useEffect(() => {
    void db
      .inspect()
      .catch(() =>
        setError(
          "Le stockage ne peut pas être ouvert. Vos données ne doivent pas être effacées.",
        ),
      );
  }, []);
  useEffect(() => {
    const clear = () => {
      setPhrase("");
      setRepeat("");
      setAccepted(false);
      db.lock();
    };
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) clear();
    };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", show);
    return () => {
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", show);
    };
  }, []);
  useEffect(() => {
    if (!unlocked) return;
    const clock = new SessionLock(() => db.lock(), minutes * 60000);
    controller.current = clock;
    const activity = (event: Event) => {
      if (event.isTrusted) clock.activity();
    };
    const visibility = () => clock.visibility(document.hidden);
    const authorization = (e: Event) =>
      clock.authorization((e as CustomEvent<boolean>).detail === true);
    const frameActivity = () => clock.activity();
    for (const name of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(name, activity, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("vm:authorization", authorization);
    window.addEventListener("vm:activity", frameActivity);
    return () => {
      clock.stop();
      controller.current = null;
      for (const name of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(name, activity);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("vm:authorization", authorization);
      window.removeEventListener("vm:activity", frameActivity);
    };
  }, [unlocked, minutes]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const creating = status === "create" || status === "legacy";
    if (creating && (!accepted || phrase !== repeat)) {
      setError(
        "Confirmez la phrase secrète et l’avertissement avant de continuer.",
      );
      return;
    }
    setBusy(true);
    setSetup(creating);
    try {
      if (creating)
        await db.initialize(
          phrase,
          status === "legacy" && exportBefore
            ? async (backup) => {
                const encrypted = await encryptBackup(backup, phrase);
                download(
                  encrypted,
                  "vinted-manager-avant-migration.vmbackup",
                  "application/json",
                );
              }
            : undefined,
        );
      else await db.unlock(phrase);
      setPhrase("");
      setRepeat("");
      setAccepted(false);
    } catch {
      setError(
        creating
          ? "La migration n’a pas pu être terminée. Les données anciennes sont conservées. Si le coffre a été créé, reprenez avec la même phrase."
          : "Phrase incorrecte, coffre altéré ou migration interrompue. Aucune donnée n’a été remplacée.",
      );
    } finally {
      setPhrase("");
      setRepeat("");
      setBusy(false);
    }
  }
  if (unlocked) return <>{children}</>;
  const creating = status === "create" || status === "legacy";
  return (
    <main className="vault-screen">
      <section className="vault-card">
        <span className="vault-icon">
          <LockKeyhole size={26} />
        </span>
        <p className="eyebrow">VINTED MANAGER · SUR CET APPAREIL</p>
        <h1>
          {db.migrationPending
            ? "Terminer la migration"
            : status === "legacy"
              ? "Protéger mes données"
              : creating
                ? "Créer mon espace chiffré"
                : "Déverrouiller mon espace"}
        </h1>
        {status === "checking" ? (
          <p role="status">Vérification du stockage local…</p>
        ) : status === "error" ? (
          <p>
            Le coffre ne peut pas être ouvert. Conservez les données du site et
            votre sauvegarde ; ne réinitialisez pas Safari.
          </p>
        ) : (
          <form onSubmit={submit}>
            <p>
              {creating
                ? "Votre phrase secrète protège les données comptables enregistrées sur cet appareil. Elle n’est envoyée nulle part."
                : "Votre phrase secrète déverrouille vos données uniquement en mémoire, même hors ligne."}
            </p>
            {status === "legacy" && (
              <p className="info-box">
                Vos articles, frais et historiques seront chiffrés puis vérifiés
                avant le retrait des anciens enregistrements en clair. Une
                interruption peut être reprise avec cette même phrase.
              </p>
            )}
            <label>
              Phrase secrète
              <input
                type="password"
                autoComplete={creating ? "new-password" : "current-password"}
                aria-label="Phrase secrète du coffre"
                value={phrase}
                disabled={busy}
                required
                maxLength={1024}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </label>
            {creating && (
              <>
                <label>
                  Confirmer la phrase secrète
                  <input
                    type="password"
                    autoComplete="new-password"
                    aria-label="Confirmer la phrase du coffre"
                    required
                    maxLength={1024}
                    value={repeat}
                    disabled={busy}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
                <p className="field-help">
                  Au moins 16 caractères, idéalement cinq mots aléatoires.
                  Conservez la phrase séparément de vos sauvegardes.
                </p>
                <label className="vault-check">
                  <input
                    type="checkbox"
                    checked={accepted}
                    disabled={busy}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />{" "}
                  Je comprends qu’une phrase oubliée peut rendre mes données
                  irrécupérables. Aucun service ne peut me la renvoyer.
                </label>
                {status === "legacy" && (
                  <label className="vault-check">
                    <input
                      type="checkbox"
                      checked={exportBefore}
                      disabled={busy}
                      onChange={(e) => setExportBefore(e.target.checked)}
                    />{" "}
                    Exporter une sauvegarde chiffrée avant la migration
                  </label>
                )}
              </>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? setup
                  ? "Chiffrement et vérification…"
                  : "Déverrouillage…"
                : creating
                  ? "Chiffrer et ouvrir mon espace"
                  : "Déverrouiller"}
            </button>
          </form>
        )}
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <p className="vault-footnote">
          <ShieldCheck size={16} />{" "}
          {status === "legacy" || db.migrationPending
            ? "Les données anciennes restent en clair jusqu’à la vérification complète du coffre."
            : creating
              ? "Le chiffrement sera actif après la création de votre phrase."
              : "Vos données persistantes sont chiffrées."}{" "}
          La protection dépend aussi de votre iPhone et du code chargé pendant
          une session déverrouillée.
        </p>
      </section>
    </main>
  );
}
