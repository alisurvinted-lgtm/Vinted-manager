import assert from "node:assert/strict";
import { readdir, readFile, cp, mkdir, rm } from "node:fs/promises";
const prototype = ".prototype-build/gmail-oauth";
const prefix = "/Vinted-manager/gmail-prototype/";
const config = JSON.parse(
  await readFile("prototypes/gmail-oauth/config.json", "utf8"),
);
assert(
  config.enabled &&
    config.personalModeConfirmed &&
    config.securityReviewConfirmed,
  "Client personnel non validé pour le test.",
);
const files = [];
async function inspect(folder, path = "") {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), "Lien interdit dans l’artefact prototype.");
    if (entry.isDirectory()) {
      assert(path === "" && entry.name === "assets");
      await inspect(`${folder}/${entry.name}`, `${entry.name}/`);
    } else files.push(path + entry.name);
  }
}
await inspect(prototype);
assert.equal(
  files.length,
  4,
  "Le prototype doit contenir uniquement HTML, manifeste, JS et CSS.",
);
assert(files.includes("index.html") && files.includes("manifest.webmanifest"));
assert.equal(
  files.filter((f) => /^assets\/index-[\w-]+\.js$/.test(f)).length,
  1,
);
assert.equal(
  files.filter((f) => /^assets\/index-[\w-]+\.css$/.test(f)).length,
  1,
);
const html = await readFile(`${prototype}/index.html`, "utf8");
const csp = html
  .match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]
  ?.replaceAll("&#39;", "'");
assert(
  csp &&
    !csp.includes("unsafe-") &&
    !csp.includes("*") &&
    csp.includes("form-action 'none'"),
  "CSP du prototype invalide.",
);
const permitted = {
  "default-src": ["'none'"],
  "script-src": ["'self'", "https://accounts.google.com/gsi/client"],
  "style-src": ["'self'"],
  "img-src": ["'self'"],
  "connect-src": [
    "https://accounts.google.com/gsi/",
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    "https://oauth2.googleapis.com/revoke",
  ],
  "frame-src": [
    "https://accounts.google.com/gsi/",
    "https://accounts.google.com/o/oauth2/iframe",
  ],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};
const parsed = Object.fromEntries(
  csp
    .split(";")
    .map((s) => s.trim().split(/\s+/))
    .filter(([k]) => k)
    .map(([k, ...v]) => [k, v]),
);
assert.deepEqual(
  parsed,
  permitted,
  "Permissions CSP différentes de la liste autorisée.",
);
const manifest = JSON.parse(
  await readFile(`${prototype}/manifest.webmanifest`, "utf8"),
);
assert.equal(manifest.start_url, prefix);
assert.equal(manifest.scope, prefix);
assert.equal(manifest.id, prefix);
assert.equal(manifest.display, "standalone");
for (const file of files) {
  const text = await readFile(`${prototype}/${file}`, "utf8");
  if (file.endsWith(".js"))
    assert(
      text.includes(config.clientId) &&
        text.includes("https://www.googleapis.com/auth/gmail.readonly"),
      "Client OAuth compilé incorrect.",
    );
  assert(
    !/__VM_(?:PRIVATE|SECRET)_TEST__|-----BEGIN [A-Z ]*PRIVATE KEY-----|client_secret|refresh_token|\bgithub_pat_[A-Za-z0-9_]{20,}/.test(
      text,
    ),
    `Contenu interdit : ${file}`,
  );
}
await rm(".pages-build", { recursive: true, force: true });
await mkdir(".pages-build");
await cp("dist", ".pages-build", { recursive: true });
await cp(prototype, ".pages-build/gmail-prototype", { recursive: true });
console.log(
  "Pages assemblé : application comptable vérifiée et 4 fichiers de test Gmail ; aucune donnée locale.",
);
