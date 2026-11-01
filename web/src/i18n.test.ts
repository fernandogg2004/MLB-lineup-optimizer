import { describe, expect, it } from "vitest";
import { dictionaries } from "./i18n";

describe("translations", () => {
  const en = dictionaries.en;
  const es = dictionaries.es;
  it("Spanish defines every English key with a non-empty string", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(typeof es[k], k).toBe("string");
      if (en[k].length > 0) expect(es[k].length, k).toBeGreaterThan(0);
    }
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it("placeholders match between languages", () => {
    const ph = (s: string) => (s.match(/\{[a-z_]+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(es[k]), k).toEqual(ph(en[k]));
  });
  it("list-valued strings have the same number of items", () => {
    expect(es["method.limits_items"].split("|").length).toBe(en["method.limits_items"].split("|").length);
  });
});
