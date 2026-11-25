import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publicationFiles, sourceFiles } from "./source-files.mjs";
const files = await publicationFiles();
const secret =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAKIA[A-Z0-9]{16}\b/;
for (const file of files) {
  assert(
    sourceFiles.includes(file) ||
      /^(src|protocols|tests|e2e|scripts)\/[\w./-]+\.(ts|tsx|mjs|css)$/.test(
        file,
      ) ||
      /^public\/(favicon\.svg|_headers|icons\/(icon-192|icon-512|maskable-512|apple-touch-icon)\.png)$/.test(
        file,
      ) ||
      file === ".github/workflows/deploy-pages.yml",
    `Fichier source non autorisé : ${file}`,
  );
  if (file.endsWith(".png")) continue;
  const text = await readFile(file, "utf8");
  assert(
    !secret.test(text),
    `Signature de secret détectée dans ${file}. Le contenu n’est pas affiché.`,
  );
  if (file.startsWith("src/") || file.startsWith("protocols/")) {
    assert(
      !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(
        text,
      ),
      `API réseau dans le code applicatif : ${file}`,
    );
    assert(
      !/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/.test(
        text,
      ),
      `Exécution HTML/JS dynamique non autorisée : ${file}`,
    );
    assert(
      !/\b(?:localStorage|sessionStorage)\b/.test(text),
      `Stockage non nécessaire dans ${file}`,
    );
    assert(
      !/\bconsole\s*\./.test(text),
      `Journal applicatif non autorisé : ${file}`,
    );
    assert(
      !text.includes("__VM_PRIVATE_TEST__") &&
        !text.includes("__VM_SECRET_TEST__"),
      `Donnée de test dans le code applicatif : ${file}`,
    );
  }
}
console.log(
  `Sources vérifiées : ${files.length} fichiers sélectionnés ; aucune signature de secret ni API réseau dans le code applicatif.`,
);
