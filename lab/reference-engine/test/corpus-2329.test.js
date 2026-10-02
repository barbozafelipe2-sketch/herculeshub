import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertCaseInputSeparated, decideCase } from "../src/case-engine.js";

const externalBundle = process.env.HERCULES_CASE_REPLAY_BUNDLE;

function runFrozenBundle(bundle) {
  const baseline = bundle.baseline;
  const war2 = bundle.war2;
  const all = [...baseline, ...war2];
  assert.equal(all.length, 2329);
  assert.equal(new Set(all.map((f) => f.source_case_id)).size, 2329);
  assert.equal(all[0].source_case_id, "SYN-V2-001");
  assert.equal(all.at(-1).source_case_id, "SYN-V2-2329");

  const baselineFailures = [];
  for (const fixture of baseline) {
    assertCaseInputSeparated(fixture.input);
    const actual = decideCase(fixture.input, { mode: "baseline" });
    if (actual.overall_challenge_class !== fixture.expected.overall_challenge_class) {
      baselineFailures.push({ id: fixture.source_case_id, expected: fixture.expected.overall_challenge_class, actual: actual.overall_challenge_class });
    }
  }

  const warFailures = [];
  for (const fixture of war2) {
    assertCaseInputSeparated(fixture.input);
    const actual = decideCase(fixture.input, { mode: "war2" });
    if (actual.attack_family !== fixture.expected.attack_family || actual.decision_code !== fixture.expected.decision_code) {
      warFailures.push({ id: fixture.source_case_id, expected_family: fixture.expected.attack_family, actual_family: actual.attack_family, expected_code: fixture.expected.decision_code, actual_code: actual.decision_code });
    }
  }

  assert.deepEqual(baselineFailures, []);
  assert.deepEqual(warFailures, []);
  return { total: all.length, baseline: baseline.length, war2: war2.length };
}

test("case adapter rejects evaluator and identity leakage", () => {
  assert.throws(() => decideCase({ "Scenario": "forbidden" }));
  assert.throws(() => decideCase({ "Practice Challenge": "forbidden" }));
  assert.throws(() => decideCase({ "Synthetic Case ID": "SYN-V2-001" }));
});

test("case adapter is deterministic on source-only input", () => {
  const input = {
    "Primary Goal": "strength",
    "Available Days": "mon, wed, fri",
    "Desired Training Days": "3",
    "Session Minutes": "45",
    "Minimum Viable Time": "20",
    "Accuracy Confirmation": "yes",
    "Personalization Consent": "yes"
  };
  const a = decideCase(input, { mode: "baseline" });
  const b = decideCase(structuredClone(input), { mode: "baseline" });
  assert.equal(a.input_fingerprint, b.input_fingerprint);
  assert.equal(a.overall_challenge_class, b.overall_challenge_class);
  assert.equal(a.authority_class, b.authority_class);
});

test("full 2,329 frozen corpus replay from lab-owned bundle", { skip: !externalBundle }, () => {
  const bundle = JSON.parse(fs.readFileSync(externalBundle, "utf8"));
  const result = runFrozenBundle(bundle);
  assert.deepEqual(result, { total: 2329, baseline: 1330, war2: 999 });
});

export { runFrozenBundle };
