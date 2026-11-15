import { describe, expect, it } from "vitest";
import { normalizeBasePath } from "../src/lib/paths";
describe("Chemins GitHub Pages", () => {
  it.each([
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["/vinted-manager", "/vinted-manager/"],
    ["vinted-manager/", "/vinted-manager/"],
    ["/vinted-manager/", "/vinted-manager/"],
  ])("normalise %s en %s", (input, expected) =>
    expect(normalizeBasePath(input)).toBe(expected),
  );
  it.each(["https://example.com", "//autre-site/", "/../", "/a/../b/", "/a?b"])(
    "refuse une base non locale : %s",
    (input) => expect(() => normalizeBasePath(input)).toThrow(),
  );
});
