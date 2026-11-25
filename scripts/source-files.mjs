import { readdir } from "node:fs/promises";
// Sélection fermée commune à la vérification et à la préparation de la publication.
export const sourceRoots = [
  "src",
  "public",
  "tests",
  "e2e",
  "scripts",
  ".github",
];
export const sourceFiles = [
  ".gitignore",
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "README.md",
  "VALIDATION.md",
  "DEPLOIEMENT_GITHUB_PAGES.md",
  "SECURITE.md",
  "VINTED_IMPORT.md",
  "prototypes/gmail-oauth/README.md",
  "prototypes/gmail-oauth/config.json",
  "prototypes/gmail-oauth/index.html",
  "prototypes/gmail-oauth/main.tsx",
  "prototypes/gmail-oauth/session.ts",
  "prototypes/gmail-oauth/google.ts",
  "prototypes/gmail-oauth/gmail-api.ts",
  "prototypes/gmail-oauth/mail-content.ts",
  "prototypes/gmail-oauth/preview-model.ts",
  "prototypes/gmail-oauth/preview.ts",
  "prototypes/gmail-oauth/PreviewPanel.tsx",
  "prototypes/gmail-oauth/style.css",
  "prototypes/gmail-oauth/vite.config.ts",
  "prototypes/gmail-oauth/tsconfig.json",
  "prototypes/gmail-oauth/playwright.config.ts",
  "prototypes/gmail-oauth/browser.spec.ts",
];
export async function publicationFiles() {
  const result = [...sourceFiles];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink())
        throw new Error(`Lien symbolique non publiable : ${file}`);
      if (entry.isDirectory()) await walk(file);
      else result.push(file);
    }
  }
  for (const root of sourceRoots) await walk(root);
  return result.sort();
}
