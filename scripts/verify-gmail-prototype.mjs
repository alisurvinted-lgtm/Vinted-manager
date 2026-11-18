import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = "prototypes/gmail-oauth/";
const config = JSON.parse(await readFile(`${root}config.json`, "utf8"));
assert.deepEqual(
  config,
  {
    enabled: false,
    clientId: "",
    expectedOrigin: "https://alisurvinted-lgtm.github.io",
    personalModeConfirmed: false,
    securityReviewConfirmed: false,
  },
  "Le prototype doit rester désactivé avant validation du client personnel et de la sécurité.",
);
for (const name of ["session.ts", "google.ts", "main.tsx"]) {
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
const app = await readFile("vite.config.ts", "utf8");
assert(
  app.includes("connect-src 'none'"),
  "La CSP de l’application comptable doit rester fermée.",
);
const workflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");
assert(
  workflow.includes("path: dist") && !workflow.includes("gmail:"),
  "Le prototype ne doit pas être publié par Pages.",
);
console.log(
  "Prototype Gmail désactivé ; aucun accès au stockage ni journal ; build et CSP de production séparés.",
);
