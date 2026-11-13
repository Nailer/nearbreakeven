import { describe, expect, it } from "vitest";
import { compact, dateLabel, monthLabel, pct, shortHash, usd } from "./data";

describe("formatting on the site", () => {
  it("formats dollars at every scale", () => {
    expect(usd(37_614_087_536)).toBe("$37.61B");
    expect(usd(1_836_360)).toBe("$1.84M");
    expect(usd(131_476)).toBe("$131.5K");
    expect(usd(0)).toBe("$0");
    expect(usd(0.0686)).toBe("$0.0686");
  });
  it("formats shares, counts and dates", () => {
    expect(pct(0.1566)).toBe("15.7%");
    expect(compact(2_017_705)).toBe("2.02M");
    expect(compact(63_923)).toBe("63.9K");
    expect(monthLabel("2025-11")).toBe("Nov 25");
    expect(dateLabel("2026-02-12")).toBe("12 Feb 2026");
  });
  it("shortens a hash but keeps both ends", () => {
    const h = "784a00b915b0fd20b1c06abc6f826408f68e367b1d8dec7f23d247548c053be3";
    expect(shortHash(h)).toBe("784a00b915…053be3");
  });
});
