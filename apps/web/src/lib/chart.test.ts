import { describe, expect, it } from "vitest";
import { tickLabel } from "../components/Chart";

describe("axis labels", () => {
  it("drop trailing zeros but keep real decimals", () => {
    expect(tickLabel("$600.0K")).toBe("$600K");
    expect(tickLabel("1.00M")).toBe("1M");
    expect(tickLabel("1.50M")).toBe("1.5M");
    expect(tickLabel("$0.00")).toBe("$0");
    expect(tickLabel("$4.40")).toBe("$4.4");
    expect(tickLabel("25%")).toBe("25%");
    expect(tickLabel("100%")).toBe("100%");
  });
});
