import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, normalizeUrl, urlHost } from "./url";

describe("normalizeUrl", () => {
  it("laat volledige http(s)-URL's door", () => {
    expect(normalizeUrl("https://www.technischeunie.nl/artikel/4604218")).toBe(
      "https://www.technischeunie.nl/artikel/4604218",
    );
    expect(normalizeUrl("http://elektramat.nl/x")).toBe("http://elektramat.nl/x");
  });

  it("plakt https:// voor invoer zonder schema", () => {
    expect(normalizeUrl("elektramat.nl/aardlekautomaat")).toBe("https://elektramat.nl/aardlekautomaat");
    expect(normalizeUrl("  tu.nl/123  ")).toBe("https://tu.nl/123");
  });

  it("weigert gevaarlijke of niet-web-schema's in plaats van ze te repareren", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,x")).toBeNull();
    expect(normalizeUrl("ftp://example.com/bestand")).toBeNull();
  });

  it("geeft null bij lege of onbruikbare invoer", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("http://")).toBeNull();
  });
});

describe("isSafeHttpUrl", () => {
  it("accepteert alleen http en https", () => {
    expect(isSafeHttpUrl("https://a.nl")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("geen url")).toBe(false);
  });
});

describe("urlHost", () => {
  it("geeft de hostname zonder www als korte weergavenaam", () => {
    expect(urlHost("https://www.technischeunie.nl/artikel/1")).toBe("technischeunie.nl");
    expect(urlHost("https://elektramat.nl/x")).toBe("elektramat.nl");
  });
});
