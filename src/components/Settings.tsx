import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Check,
  Download,
  FileSpreadsheet,
  HardDrive,
  Info,
  LockKeyhole,
  Share,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { db, saveRate } from "../lib/db";
import { errorMessage } from "../lib/errors";
import {
  createBackup,
  download,
  parseBackup,
  restoreBackup,
  salesCSV,
  type Backup,
} from "../lib/backup";
import {
  backupFileType,
  decryptBackup,
  encryptBackup,
  MAX_ENCRYPTED_BYTES,
} from "../lib/crypto-backup";
import { parseRate, rateLabel } from "../lib/accounting";
import {
  today,
  type Article,
  type Settings as Preferences,
} from "../lib/model";
import { ErrorMessage, Modal } from "./ui";

export function Settings({
  settings,
  articles,
  onClose,
}: {
  settings: Preferences;
  articles: Article[];
  onClose: () => void;
}) {
  const [recovery, setRecovery] = useState(false),
    [exportRecovery, setExportRecovery] = useState(false);
  useEffect(() => {
    void db
      .hasMigrationRecovery()
      .then(setRecovery)
      .catch(() => {});
  }, []);
  const [rate, setRate] = useState(rateLabel(settings.rateBps));
  const [error, setError] = useState("");
  const [success, notify] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"export" | "import" | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [encryptedFile, setEncryptedFile] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  function resetMessages() {
    setError("");
    notify("");
  }
  function closeSecretForm() {
    setPassphrase("");
    setRepeat("");
    setEncryptedFile("");
    setMode(null);
  }
  async function recordExport() {
    await db.transaction("rw", async (tx) => {
      const current = (await tx.settings.get("preferences")) ?? settings;
      await tx.settings.put({
        ...current,
        lastExportAt: new Date().toISOString(),
      });
    });
  }
  async function changeRate(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      await saveRate(parseRate(rate));
      notify("Taux de cotisations enregistré.");
    } catch (e) {
      setError(errorMessage(e, "Impossible de modifier le taux."));
    } finally {
      setBusy(false);
    }
  }
  async function restoreConfirmed(backup: Backup, plain: boolean) {
    const warning = plain
      ? "Attention : ce fichier JSON n’est pas chiffré. Toute personne qui le possède peut lire vos données.\n\n"
      : "Le contenu de la sauvegarde chiffrée a été vérifié.\n\n";
    if (
      !window.confirm(
        `${warning}${backup.version === 1 ? "Cette ancienne sauvegarde ne contient pas le suivi des imports Gmail. Après restauration, vérifiez les doublons avant toute nouvelle importation.\n\n" : ""}Remplacer toutes les données de cet appareil par cette sauvegarde (${backup.articles.length} article${backup.articles.length > 1 ? "s" : ""}) ? Exportez d’abord les données actuelles si nécessaire.`,
      )
    )
      return;
    await restoreBackup(backup);
    setRate(rateLabel(backup.settings.rateBps));
    notify("Sauvegarde restaurée.");
  }
  async function exportPlain() {
    if (
      !window.confirm(
        "Exporter un JSON NON CHIFFRÉ ? Ce fichier contiendra tous vos articles, montants et opérations lisibles. Préférez la sauvegarde chiffrée et ne publiez jamais ce fichier sur GitHub.",
      )
    )
      return;
    resetMessages();
    setBusy(true);
    try {
      const backup = await createBackup();
      download(
        JSON.stringify(backup, null, 2),
        `vinted-manager-${today()}.json`,
        "application/json",
      );
      await recordExport();
      notify("JSON non chiffré exporté. Conservez-le à l’abri.");
    } catch {
      setError("L’export a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  async function exportCSV() {
    if (
      !window.confirm(
        "Exporter les ventes en CSV NON CHIFFRÉ ? Les montants et bénéfices seront lisibles par toute personne disposant de ce fichier. Ne le publiez jamais sur GitHub.",
      )
    )
      return;
    resetMessages();
    try {
      download(
        salesCSV(articles, settings.rateBps),
        `ventes-vinted-${today()}.csv`,
        "text/csv;charset=utf-8",
      );
      notify("Ventes exportées en CSV non chiffré.");
    } catch {
      setError("L’export CSV a échoué.");
    }
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    closeSecretForm();
    resetMessages();
    setBusy(true);
    try {
      if (file.size > MAX_ENCRYPTED_BYTES)
        throw new Error("Le fichier dépasse 30 Mo.");
      const json = await file.text();
      if (backupFileType(json) === "encrypted") {
        setEncryptedFile(json);
        setMode("import");
      } else await restoreConfirmed(parseBackup(json), true);
    } catch (e) {
      setError(
        errorMessage(
          e,
          "Import impossible. Les données existantes sont conservées.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function submitSecret(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    if (mode === "export" && passphrase !== repeat) {
      setError("Les deux phrases secrètes ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "export") {
        const data = exportRecovery
          ? await db.migrationRecovery()
          : await createBackup();
        if (!data) throw new Error("Aucune copie de migration disponible.");
        const content = await encryptBackup(data, passphrase);
        download(
          content,
          `vinted-manager-${today()}.vmbackup`,
          "application/octet-stream",
        );
        if (!exportRecovery) await recordExport();
        notify(
          "Sauvegarde chiffrée exportée. Conservez sa phrase secrète séparément.",
        );
      } else {
        const backup = await decryptBackup(encryptedFile, passphrase);
        await restoreConfirmed(backup, false);
      }
      closeSecretForm();
    } catch (e) {
      setError(
        errorMessage(
          e,
          "Opération impossible. Les données existantes sont conservées.",
        ),
      );
    } finally {
      setPassphrase("");
      setRepeat("");
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Paramètres"
      subtitle="Votre application, à votre façon."
      onClose={onClose}
      closeDisabled={busy}
    >
      <section className="settings-section">
        <h3>Protection de l’espace</h3>
        <label>
          Verrouillage après inactivité
          <select
            aria-label="Délai de verrouillage"
            value={settings.autoLockMinutes ?? 5}
            onChange={async (e) => {
              const minutes = Number(e.target.value);
              if (![1, 5, 15].includes(minutes)) return;
              try {
                await db.transaction("rw", async (tx) => {
                  const current =
                    (await tx.settings.get("preferences")) ?? settings;
                  await tx.settings.put({
                    ...current,
                    autoLockMinutes: minutes as 1 | 5 | 15,
                  });
                });
                notify("Délai de verrouillage enregistré.");
              } catch {
                setError("Impossible de modifier ce délai.");
              }
            }}
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </label>
        <p className="field-help">
          En arrière-plan, l’espace se verrouille après 30 secondes. Le retour
          d’une autorisation Google dispose d’un délai limité à cinq minutes. La
          fermeture ou le rechargement verrouille immédiatement.
        </p>
        <button className="button secondary" onClick={() => db.lock()}>
          Verrouiller maintenant
        </button>
      </section>
      <section className="settings-section">
        <h3>Cotisations estimées</h3>
        <p>
          Le taux s’applique à toutes les ventes, y compris les ventes passées.
          Les résultats restent des estimations de gestion, pas un bénéfice
          fiscal officiel.
        </p>
        <form onSubmit={changeRate} className="rate-form">
          <label>
            Taux de cotisations
            <span className="money-input">
              <input
                inputMode="decimal"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                maxLength={6}
              />
              <span>%</span>
            </span>
          </label>
          <button className="button primary" disabled={busy}>
            <Check size={16} /> Enregistrer
          </button>
        </form>
      </section>
      <section className="settings-section">
        <div className="section-title">
          <h3>Sauvegardes & données</h3>
          <span className="count-pill">
            {articles.length} article{articles.length > 1 ? "s" : ""}
          </span>
        </div>
        <p>
          Vos données restent dans ce navigateur, sur cet appareil. Exportez
          régulièrement une sauvegarde chiffrée.
        </p>
        <div className="settings-actions">
          <button
            className="settings-action"
            aria-label="Exporter une sauvegarde chiffrée"
            disabled={busy}
            onClick={() => {
              closeSecretForm();
              resetMessages();
              setExportRecovery(false);
              setMode("export");
            }}
          >
            <span className="settings-action-icon">
              <ShieldCheck size={20} />
            </span>
            <span>
              <strong>Exporter une sauvegarde chiffrée</strong>
              <small>AES-256-GCM · Protégée par votre phrase secrète</small>
            </span>
            <Download size={17} />
          </button>
          <button
            className="settings-action"
            aria-label="Importer une sauvegarde"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <span className="settings-action-icon">
              <Upload size={20} />
            </span>
            <span>
              <strong>Importer une sauvegarde</strong>
              <small>Fichier chiffré .vmbackup ou ancien JSON</small>
            </span>
            <Upload size={17} />
          </button>
        </div>
        {recovery && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              closeSecretForm();
              resetMessages();
              setExportRecovery(true);
              setMode("export");
            }}
          >
            Exporter la copie de sécurité de migration
          </button>
        )}
        {mode && (
          <form
            className="secret-form"
            onSubmit={submitSecret}
            autoComplete="off"
          >
            <h3>
              <LockKeyhole size={16} />
              {mode === "export"
                ? "Protéger la sauvegarde"
                : "Ouvrir la sauvegarde chiffrée"}
            </h3>
            <p>
              {mode === "export"
                ? "Au moins 16 caractères. Préférez cinq mots aléatoires ou plus. Conservez la phrase séparément : sans elle, aucune récupération du fichier n’est possible. Dans Fichiers, choisissez « Sur mon iPhone » pour éviter iCloud Drive."
                : "La phrase reste sur cet appareil, le temps du déchiffrement. Aucun remplacement ne sera fait sans votre confirmation."}
            </p>
            <label>
              Phrase secrète
              <input
                type="password"
                required
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={1024}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={busy}
              />
            </label>
            {mode === "export" && (
              <label>
                Confirmer la phrase secrète
                <input
                  type="password"
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={1024}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            <div>
              <button
                type="button"
                className="button secondary"
                onClick={closeSecretForm}
                disabled={busy}
              >
                Annuler
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy
                  ? "Traitement local…"
                  : mode === "export"
                    ? "Chiffrer et exporter"
                    : "Déchiffrer et vérifier"}
              </button>
            </div>
          </form>
        )}
        <details className="legacy-backups">
          <summary>Ancien format et CSV non chiffrés</summary>
          <p>
            Ces exports sont lisibles sans phrase secrète. Utilisez-les
            uniquement si nécessaire.
          </p>
          <div className="settings-actions">
            <button
              className="settings-action"
              aria-label="Exporter un JSON non chiffré"
              disabled={busy}
              onClick={exportPlain}
            >
              <span className="settings-action-icon">
                <Download size={20} />
              </span>
              <span>
                <strong>Exporter un JSON non chiffré</strong>
                <small>Ancien format · Données lisibles</small>
              </span>
            </button>
            <button
              className="settings-action"
              aria-label="Exporter les ventes en CSV"
              disabled={busy || !articles.some((a) => a.status === "sold")}
              onClick={exportCSV}
            >
              <span className="settings-action-icon">
                <FileSpreadsheet size={20} />
              </span>
              <span>
                <strong>Exporter les ventes en CSV</strong>
                <small>Non chiffré · Pour votre tableur</small>
              </span>
            </button>
          </div>
        </details>
        <input
          ref={fileRef}
          type="file"
          accept=".vmbackup,.json,application/json,application/octet-stream"
          aria-label="Fichier de sauvegarde"
          onChange={importFile}
          hidden
        />
        {settings.lastExportAt && (
          <p className="last-backup">
            Dernier export :{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(settings.lastExportAt))}
          </p>
        )}
      </section>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && (
        <p className="settings-success" role="status">
          <Check size={16} />
          {success}
        </p>
      )}
      <div className="info-box">
        <HardDrive size={19} />
        <p>
          Les données persistantes sont chiffrées avant écriture. Les clés
          restent en mémoire pendant le déverrouillage. Protégez aussi votre
          iPhone et Safari : le chiffrement ne protège pas d’un script
          malveillant actif pendant une session ouverte. Les phrases secrètes ne
          sont jamais conservées par l’application.
        </p>
      </div>
      <section className="settings-section install-help">
        <h3>
          <Share size={17} /> Installer sur iPhone
        </h3>
        <p>
          Ouvrez l’adresse HTTPS de l’application dans Safari, touchez{" "}
          <strong>Partager</strong>, puis <strong>Sur l’écran d’accueil</strong>
          . Après un premier chargement complet, l’application fonctionne hors
          ligne.
        </p>
      </section>
      <p className="settings-footnote">
        <Info size={14} /> Vinted Manager est un outil personnel indépendant de
        Vinted.
      </p>
    </Modal>
  );
}
