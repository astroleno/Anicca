// @vitest-environment node
import { describe, expect, it } from "vitest";
import { combinedGates } from "./summarize-dialectic-quality-r8.mjs";

const historical = ["holdout-04", "holdout-05", "holdout-06"];
const completedHistory = historical.map((id) => row(id));

function row(id, { outcome = "synthesis", before = false, after = false, hardBlock } = {}) {
  return { id, before: { judgment: { serious: before } },
    after: { reading: { outcome }, judgment: { serious: after, hardBlock } } };
}

function evaluate(rows, before, after, readablePass = true) {
  return combinedGates(rows, { readablePass, confirmationReadability: { before, after, cases: 8 } });
}

describe("round eight combined acceptance", () => {
  it.each([
    [5, 6, 7, false], [5, 7, 7, true], [8, 7, 8, false], [8, 8, 8, true]
  ])("checks confirmation readability %i → %i against a minimum of %i", (before, after, minimum, pass) => {
    expect(evaluate(completedHistory, before, after)).toMatchObject({
      readablePass: pass,
      confirmationReadability: { minimum, pass }
    });
  });

  it("also enforces the previous readability thresholds", () => {
    expect(evaluate(completedHistory, 5, 8, false).readablePass).toBe(false);
  });

  it("cannot verify quality when a historical serious case is unavailable", () => {
    const rows = [row(historical[0], { outcome: "unavailable" }), ...completedHistory.slice(1)];
    expect(evaluate(rows, 5, 8)).toMatchObject({
      readablePass: false, qualityPass: null,
      historicalSeriousReadability: { required: historical, missing: [historical[0]] }
    });
  });

  it("passes the serious-error gate with all historical cases readable and no candidate serious findings", () => {
    expect(evaluate(completedHistory, 5, 7)).toMatchObject({
      readablePass: true, qualityPass: true, hardVetoes: [], needsReview: []
    });
  });

  it("blocks a recurring serious finding on a historical case", () => {
    const rows = [row(historical[0], { before: true, after: true }), ...completedHistory.slice(1)];
    expect(evaluate(rows, 5, 8)).toMatchObject({
      readablePass: true, qualityPass: false, hardVetoes: [historical[0]], needsReview: []
    });
  });

  it("blocks a new severe error without a hard-veto classification", () => {
    const rows = [...completedHistory, row("confirmation-01", { after: true })];
    expect(evaluate(rows, 5, 8)).toMatchObject({
      readablePass: true, qualityPass: false, hardVetoes: [], needsReview: []
    });
  });

  it("blocks a recurring explicit hard veto outside the historical cases", () => {
    const rows = [...completedHistory, row("confirmation-04", {
      before: true, after: true, hardBlock: "irreversible_without_prerequisites"
    })];
    expect(evaluate(rows, 5, 8)).toMatchObject({
      readablePass: true, qualityPass: false, hardVetoes: ["confirmation-04"], needsReview: []
    });
  });

  it("reserves recurring serious findings without a known classification for the reviewer", () => {
    const rows = [...completedHistory, row("confirmation-08", { before: true, after: true })];
    expect(evaluate(rows, 5, 8)).toMatchObject({
      readablePass: true, qualityPass: null, hardVetoes: [], needsReview: ["confirmation-08"]
    });
  });
});
