import { describe, it, expect } from "bun:test";
import { hardFilter } from "../src/gate.ts";
import type { RepoProfile } from "../src/profile.ts";
import { mkCard } from "./helpers.ts";

const emptySig = { stack: [] as string[], files: [] as string[] };
const profile = (blocked: string[]) => ({ blocked }) as unknown as RepoProfile;

describe("gate hardFilter", () => {
  it("freezes tier C (never enters the route pool)", () => {
    const c = mkCard({ id: "x__tierc", tier: "C" });
    const { kept, dropped } = hardFilter([c], "anything", emptySig);
    expect(kept).toHaveLength(0);
    expect(dropped).toEqual([{ id: "x__tierc", why: "tier-C frozen" }]);
  });

  it("keeps tier A and B", () => {
    const cards = [mkCard({ id: "a__x", tier: "A" }), mkCard({ id: "b__y", tier: "B" })];
    const { kept } = hardFilter(cards, "anything", emptySig);
    expect(kept.map((c) => c.id).sort()).toEqual(["a__x", "b__y"]);
  });

  it("empty stack signals keep the card (unknown repo: retrieval decides)", () => {
    const c = mkCard({ id: "a__x", requires: { stack_any: ["bun"] } });
    expect(hardFilter([c], "task", emptySig).kept).toHaveLength(1);
  });

  it("drops on stack miss and keeps on stack hit (case-insensitive)", () => {
    const c = mkCard({ id: "a__x", requires: { stack_any: ["Bun"] } });
    const miss = hardFilter([c], "task", { stack: ["node"], files: [] });
    expect(miss.dropped).toEqual([{ id: "a__x", why: "requires stack miss" }]);
    const hit = hardFilter([c], "task", { stack: ["bun"], files: [] });
    expect(hit.kept.map((x) => x.id)).toEqual(["a__x"]);
  });

  it("drops on files miss, keeps on suffix hit, keeps when signals unknown", () => {
    const c = mkCard({ id: "a__x", requires: { files_any: ["package.json"] } });
    const miss = hardFilter([c], "task", { stack: [], files: ["src/app.ts"] });
    expect(miss.dropped).toEqual([{ id: "a__x", why: "requires files miss" }]);
    const hit = hardFilter([c], "task", { stack: [], files: ["proj/package.json"] });
    expect(hit.kept.map((x) => x.id)).toEqual(["a__x"]);
    expect(hardFilter([c], "task", emptySig).kept).toHaveLength(1);
  });

  it("typo/typography trap: 'typo' rule does not fire on 'typography' task", () => {
    const c = mkCard({ id: "c__typo", do_not_use_when: ["fix typos"] });
    const { kept, dropped } = hardFilter([c], "fix typography in dashboard layout", emptySig);
    expect(kept.map((x) => x.id)).toEqual(["c__typo"]);
    expect(dropped).toHaveLength(0);
  });

  it("drops when every negative-rule token is present in the task", () => {
    const c = mkCard({ id: "c__typo", do_not_use_when: ["fix typos"] });
    const { dropped } = hardFilter([c], "fix typos in the readme", emptySig);
    expect(dropped).toEqual([{ id: "c__typo", why: "do_not_use_when hit" }]);
  });

  it("keeps when only some negative-rule tokens are present", () => {
    const c = mkCard({ id: "c__x", do_not_use_when: ["fix typos"] });
    const { kept } = hardFilter([c], "fix the dashboard layout", emptySig);
    expect(kept.map((x) => x.id)).toEqual(["c__x"]);
  });

  it("short-word-only negative rules (len<=3) never fire", () => {
    const c = mkCard({ id: "c__x", do_not_use_when: ["fix it"] });
    const { kept } = hardFilter([c], "fix it now please", emptySig);
    expect(kept.map((x) => x.id)).toEqual(["c__x"]);
  });

  it("drops profile-blocked cards", () => {
    const c = mkCard({ id: "a__blocked" });
    const { dropped } = hardFilter([c], "task", emptySig, profile(["a__blocked"]));
    expect(dropped).toEqual([{ id: "a__blocked", why: "profile blocked" }]);
  });

  it("null profile does not block", () => {
    const c = mkCard({ id: "a__x" });
    expect(hardFilter([c], "task", emptySig, null).kept).toHaveLength(1);
  });
});
