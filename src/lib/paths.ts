// Une base absolue garde le manifeste et le service worker dans le dossier du site Pages.
export function normalizeBasePath(value = "/"): string {
  const path = value.trim();
  if (!path || path === "/") return "/";
  if (
    !/^\/?[A-Za-z0-9._~!$&'()+,;=@%/-]+\/?$/.test(path) ||
    path.includes("..") ||
    path.includes("//")
  ) {
    throw new Error(
      "PAGES_BASE_PATH doit être un chemin local, par exemple /vinted-manager/.",
    );
  }
  return `/${path.replace(/^\/+|\/+$/g, "")}/`;
}
