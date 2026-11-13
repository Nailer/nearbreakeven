import { describe, expect, it } from "vitest";
import { canonical, hashOf, sha256Hex } from "../src/canonical.js";

describe("canonical JSON", () => {
  it("sorts keys at every level", () => {
    expect(canonical({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  });
  it("gives the same bytes whatever the insertion order", () => {
    expect(canonical({ x: 1, y: 2 })).toBe(canonical({ y: 2, x: 1 }));
  });
  it("drops undefined properties and normalizes -0", () => {
    expect(canonical({ a: undefined, b: -0 })).toBe('{"b":0}');
  });
  it("refuses values JSON cannot carry faithfully", () => {
    expect(() => canonical({ a: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonical(undefined)).toThrow(/undefined/);
  });
});

describe("sha256", () => {
  it("matches the standard test vector", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes values through canonical JSON", async () => {
    expect(await hashOf({ b: 2, a: 1 })).toBe(await sha256Hex('{"a":1,"b":2}'));
  });
});
