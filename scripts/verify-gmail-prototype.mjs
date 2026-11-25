import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = "prototypes/gmail-oauth/";
const config = JSON.parse(await readFile(`${root}config.json`, "utf8"));
assert.deepEqual(
  Object.keys(config).sort(),
  [
    "enabled",
    "clientId",
    "expectedOrigin",
    "personalModeConfirmed",
    "securityReviewConfirmed",
  ].sort(),
  "Configuration OAuth inattendue.",
);
assert.equal(config.expectedOrigin, "https://alisurvinted-lgtm.github.io");
assert.equal(
  config.clientId,
  "210373554820-k53i9niec2drhtj7t27m3r7lcfbo3lhn.apps.googleusercontent.com",
  "Client public différent de celui fourni par le propriétaire.",
);
assert.equal(
  config.personalModeConfirmed,
  true,
  "Mode personnel non confirmé.",
);
assert.equal(typeof config.enabled, "boolean");
assert.equal(typeof config.securityReviewConfirmed, "boolean");
assert(
  !config.enabled || config.securityReviewConfirmed,
  "Revue de sécurité requise avant activation.",
);
for (const name of [
  "session.ts",
  "google.ts",
  "main.tsx",
  "gmail-api.ts",
  "mail-content.ts",
  "preview-model.ts",
  "preview.ts",
  "PreviewPanel.tsx",
  "transfer.ts",
  "analyze.ts",
  "identifiers.ts",
]) {
  const code = await readFile(root + name, "utf8");
  assert(
    !/\b(indexedDB|localStorage|sessionStorage|Dexie|caches|serviceWorker)\b/.test(
      code,
    ),
    `Accès au stockage interdit dans ${name}`,
  );
  assert(
    !/\bconsole\s*\.|dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/.test(
      code,
    ),
    `Exécution ou journal interdit dans ${name}`,
  );
  assert(
    !/client_secret|refresh_token|\/src\//.test(code),
    `Secret, renouvellement ou accès à l’application comptable dans ${name}`,
  );
}
const protocol = await readFile("protocols/gmail-transfer.ts", "utf8");
assert(
  !/\b(indexedDB|localStorage|sessionStorage|Dexie|caches|serviceWorker|fetch|XMLHttpRequest|WebSocket|sendBeacon)\b|\bconsole\s*\.|dangerouslySetInnerHTML|client_secret|refresh_token/.test(
    protocol,
  ),
  "Le protocole partagé doit rester sans stockage, réseau, secret ou journal.",
);
assert(
  !/lib\/db|lib\/backup|crypto-backup/.test(protocol),
  "Le protocole partagé ne doit pas importer la base ou les sauvegardes.",
);
const app = await readFile("vite.config.ts", "utf8");
assert(
  app.includes("connect-src 'none'"),
  "La CSP de l’application comptable doit rester fermée.",
);
const workflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");
assert(
  workflow.includes("path: .pages-build") &&
    workflow.includes("npm run pages:package"),
  "Assemblage contrôlé requis pour Pages.",
);
console.log(
  `Configuration du client personnel vérifiée ; prototype ${config.enabled ? "activé pour le test manuel" : "désactivé"} ; aucun accès au stockage ni journal.`,
);
