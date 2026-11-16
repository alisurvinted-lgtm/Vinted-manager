import { useRef, useState, type ChangeEvent } from "react";
import {
  ExternalLink,
  FileCheck2,
  Plus,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  checkVintedImportAvailability,
  VINTED_IMPORT_SOURCES,
} from "../lib/vinted-import";
import { Modal } from "./ui";

export function VintedImport({
  onClose,
  onManual,
}: {
  onClose: () => void;
  onManual: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  function checkFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setMessage(checkVintedImportAvailability(file).message);
  }
  return (
    <Modal
      title="Importer depuis Vinted"
      subtitle="Uniquement depuis un export officiel, sans connecter votre compte."
      onClose={onClose}
    >
      <div className="import-state">
        <FileCheck2 size={22} />
        <div>
          <strong>Import de transactions en préparation</strong>
          <p>
            Aucun format d’achats ou de ventes n’est encore pris en charge.
            Aucune transaction ne sera ajoutée avant vérification d’un fichier
            réel.
          </p>
        </div>
      </div>
      <ol className="import-steps">
        <li>
          <strong>Demandez votre copie à Vinted</strong>
          <p>
            Dans Vinted, consultez les paramètres de confidentialité et la
            demande de copie des données du compte. Les libellés peuvent varier
            selon la version.
          </p>
          <a
            href={VINTED_IMPORT_SOURCES.privacy}
            target="_blank"
            rel="noopener noreferrer"
          >
            Consulter l’aide officielle française <ExternalLink size={13} />
          </a>
        </li>
        <li>
          <strong>Conservez l’export sur votre iPhone</strong>
          <p>
            Vinted décrit, dans son aide britannique, une archive ZIP contenant
            notamment des documents HTML, des photos et des PDF. Cela ne
            confirme pas la structure des transactions de votre compte français.
          </p>
          <a
            href={VINTED_IMPORT_SOURCES.accountCopy}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir la description officielle de l’export{" "}
            <ExternalLink size={13} />
          </a>
        </li>
        <li>
          <strong>Un format doit être vérifié avant l’import</strong>
          <p>
            Il faut confirmer les champs réels et distinguer achats, ventes
            finalisées, remboursements et annulations. Un aperçu modifiable et
            un contrôle des doublons seront nécessaires avant tout ajout. Aucun
            prix ni aucune date ne sera deviné.
          </p>
        </li>
      </ol>
      <div className="info-box">
        <ShieldCheck size={20} />
        <p>
          Ne publiez jamais l’archive complète sur GitHub et ne partagez pas vos
          identifiants. Un extrait anonymisé de la structure suffira pour
          préparer la prise en charge. Vos articles et sauvegardes actuels
          restent inchangés.
        </p>
      </div>
      <div className="import-actions">
        <button
          className="button secondary"
          onClick={() => input.current?.click()}
        >
          <Upload size={16} /> Vérifier la disponibilité pour un fichier
        </button>
        <button className="button primary" onClick={onManual}>
          <Plus size={16} /> Ajouter un article manuellement
        </button>
      </div>
      <input
        hidden
        type="file"
        ref={input}
        aria-label="Vérifier un export Vinted"
        onChange={checkFile}
      />
      {message && (
        <p className="import-unavailable" role="status">
          {message}
        </p>
      )}
      <p className="monthly-method">
        À ce stade, seule la taille est vérifiée : le contenu du fichier n’est
        ni lu, ni exécuté, ni enregistré, ni transmis. L’import reste désactivé.
        Les sauvegardes Vinted Manager se restaurent séparément dans les
        paramètres.
      </p>
    </Modal>
  );
}
