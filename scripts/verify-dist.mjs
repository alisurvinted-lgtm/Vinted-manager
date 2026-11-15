import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Liste fermée : un export comptable accidentellement copié dans public/ bloque la publication.
const allowed =
  /^(index\.html|manifest\.webmanifest|sw\.js|workbox-[\w-]+\.js|favicon\.svg|_headers|\.nojekyll|icons\/(icon-192|icon-512|maskable-512|apple-touch-icon)\.png|assets\/[\w.-]+\.(js|css))$/;
async function filesIn(dir, prefix = "") {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    assert(
      !entry.isSymbolicLink(),
      `Lien symbolique interdit dans le site : ${name}`,
    );
    if (entry.isDirectory())
      files.push(...(await filesIn(path.join(dir, entry.name), `${name}/`)));
    else files.push(name);
  }
  return files;
}
const files = await filesIn("dist");
for (const file of files)
  assert(allowed.test(file), `Fichier non publiable dans dist/ : ${file}`);
const manifest = JSON.parse(
  await readFile("dist/manifest.webmanifest", "utf8"),
);
const base = manifest.scope;
assert(/^\/(?:[^/]+\/)*$/.test(base), "Scope PWA absolu invalide");
assert.equal(manifest.start_url, base);
assert.equal(manifest.id, base);
assert.equal(manifest.display, "standalone");
const origin = "https://verification.github.io";
const manifestURL = new URL(`${base}manifest.webmanifest`, origin);
for (const icon of manifest.icons) {
  const url = new URL(icon.src, manifestURL);
  assert.equal(url.origin, origin);
  assert(url.pathname.startsWith(base), `Icône hors du site : ${icon.src}`);
  assert(
    files.includes(url.pathname.slice(base.length)),
    `Icône absente : ${icon.src}`,
  );
}
const html = await readFile("dist/index.html", "utf8");
assert(
  html.includes('http-equiv="Content-Security-Policy"'),
  "CSP absente du document",
);
assert(
  html.replaceAll("&#39;", "'").includes("connect-src 'none'"),
  "Connexions réseau non bloquées par la CSP",
);
assert(
  !html.replaceAll("&#39;", "'").includes("script-src 'self' 'unsafe-inline'"),
  "Scripts inline autorisés",
);
for (const file of files.filter((f) =>
  /\.(?:js|html|css|webmanifest)$/.test(f),
)) {
  const content = await readFile(`dist/${file}`, "utf8");
  assert(
    !content.includes("__VM_PRIVATE_TEST__") &&
      !content.includes("__VM_SECRET_TEST__"),
    `Donnée de test dans le build : ${file}`,
  );
  assert(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/.test(
      content,
    ),
    `Signature de secret dans le build : ${file}`,
  );
}
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const url = new URL(match[1], new URL(base, origin));
  assert.equal(url.origin, origin, "Ressource externe interdite");
  assert(
    url.pathname.startsWith(base),
    `Ressource hors de la base Pages : ${match[1]}`,
  );
  assert(
    files.includes(url.pathname.slice(base.length)),
    `Ressource absente : ${match[1]}`,
  );
}
const sw = await readFile("dist/sw.js", "utf8");
assert(
  sw.includes(`${base}index.html`),
  "Repli hors ligne hors de la base Pages",
);
console.log(
  `Publication vérifiée : ${files.length} fichiers statiques autorisés ; base PWA ${base} ; aucun fichier de données comptables.`,
);
