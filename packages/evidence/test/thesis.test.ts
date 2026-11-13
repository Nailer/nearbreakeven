import { describe, expect, it } from "vitest";
import { computeResults } from "../src/metrics.js";
import { thesisDoc, thesisMarkdown } from "../src/thesis.js";
import { fixture } from "./fixture.js";

describe("the thesis text", () => {
  it("takes its numbers from the run, not from hand-typed text", async () => {
    const r = await computeResults(fixture());
    const doc = thesisDoc(r);
    expect(doc.title).toContain("10.0%");
    expect(doc.claim).toContain("10× today's");
    expect(doc.claim).toContain("4 quarters");
  });

  it("states the counter-evidence and the tests that would break it", async () => {
    const doc = thesisDoc(await computeResults(fixture()));
    expect(doc.againstPoints.length).toBeGreaterThanOrEqual(5);
    expect(doc.changeMind.some((x) => x.includes("BROKEN"))).toBe(true);
    expect(doc.cannotMeasure.length).toBeGreaterThan(0);
  });

  it("says when coverage is not growing instead of inventing a date", async () => {
    const doc = thesisDoc(await computeResults(fixture({ revenueLast90: 100 })));
    expect(doc.claim).toContain("no finite time");
  });

  it("writes THESIS.md with the verdict, both hashes and every claim", async () => {
    const r = await computeResults(fixture());
    const md = thesisMarkdown(r, "f".repeat(64));
    expect(md).toContain(`Verdict: **${r.verdict}**`);
    expect(md).toContain(r.snapshotSha256);
    expect(md).toContain("f".repeat(64));
    for (const c of r.claims) expect(md).toContain(`| ${c.id} |`);
  });
});
