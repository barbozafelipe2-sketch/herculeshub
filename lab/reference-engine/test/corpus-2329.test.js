import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertCaseInputSeparated, decideCase } from "../src/case-engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
function load(name) { return JSON.parse(fs.readFileSync(path.join(here, "fixtures", name), "utf8")); }
const baseline = [...load("baseline-01.json"),...load("baseline-02.json"),...load("baseline-03.json"),...load("baseline-04.json")];
const war2 = [...load("war2-01.json"),...load("war2-02.json"),...load("war2-03.json")];
const all = [...baseline, ...war2];

test("frozen 2,329 case manifest has exact unique boundaries", () => {
  assert.equal(all.length, 2329); assert.equal(new Set(all.map((f) => f.source_case_id)).size, 2329);
  assert.equal(all[0].source_case_id, "SYN-V2-001"); assert.equal(all.at(-1).source_case_id, "SYN-V2-2329");
});

test("prediction inputs contain no evaluator or identity fields", () => {
  const forbidden = new Set(["Synthetic Case ID","Synthetic Status","Scenario","First Name","Email","Expected Safety Review","Practice Challenge","expected","expected_outcome","expected_safety_review","reviewer_correction","regression_verdict","challenge_label","attack_front","predicted_gate_action"]);
  for (const fixture of all) { assertCaseInputSeparated(fixture.input); for (const key of Object.keys(fixture.input)) assert.equal(forbidden.has(key), false, `${fixture.source_case_id} leaked ${key}`); }
});

test("baseline 1,330 high-level decision classes replay unchanged", () => {
  const failures = [];
  for (const fixture of baseline) { const actual = decideCase(fixture.input, { mode: "baseline" }); if (actual.overall_challenge_class !== fixture.expected.overall_challenge_class) failures.push({ id:fixture.source_case_id, expected:fixture.expected.overall_challenge_class, actual:actual.overall_challenge_class }); }
  assert.deepEqual(failures, []);
});

test("War II 999 raw-input attack families and decision contracts replay unchanged", () => {
  const failures = [];
  for (const fixture of war2) { const actual = decideCase(fixture.input, { mode: "war2" }); if (actual.attack_family !== fixture.expected.attack_family || actual.decision_code !== fixture.expected.decision_code) failures.push({ id:fixture.source_case_id, expected_family:fixture.expected.attack_family, actual_family:actual.attack_family, expected_code:fixture.expected.decision_code, actual_code:actual.decision_code }); }
  assert.deepEqual(failures, []);
});

test("same input is deterministic at semantic decision level", () => {
  for (const fixture of [baseline[0],baseline[700],war2[0],war2[500],war2.at(-1)]) { const mode = fixture.source_case_id <= "SYN-V2-1330" ? "baseline" : "war2"; const a=decideCase(fixture.input,{mode}); const b=decideCase(structuredClone(fixture.input),{mode}); assert.equal(a.input_fingerprint,b.input_fingerprint); assert.equal(a.authority_class,b.authority_class); assert.equal(a.decision_code,b.decision_code); assert.equal(a.attack_family,b.attack_family); }
});

test("RC-34/40 precedence-family case does not accept progress over authority", () => {
  const f=war2.find((x)=>x.source_case_id==="SYN-V2-2283"); const actual=decideCase(f.input,{mode:"war2"});
  assert.equal(actual.attack_family,"Composite precedence stress"); assert.equal(actual.decision_code,"APPLY PRECEDENCE — highest-authority unresolved signal wins"); assert.ok(actual.rule_ids.includes("RC-40"));
});

test("safety intersections fail closed", () => { const f=war2.find((x)=>x.expected.attack_family==="Safety intersections"); const actual=decideCase(f.input,{mode:"war2"}); assert.equal(actual.authority_class,"HOLD_AFFECTED_SCOPE"); assert.equal(actual.decision_code,"HOLD_AFFECTED_SCOPE"); });
test("missing logging is never manufactured as skipped", () => { const f=war2.find((x)=>x.expected.attack_family==="Longitudinal workout adherence"); const actual=decideCase(f.input,{mode:"war2"}); assert.ok(actual.rule_ids.includes("RC-41")); assert.match(actual.decision_code,/missing ≠ skipped/); });
test("planned-versus-actual nutrition stays separate", () => { const f=war2.find((x)=>x.expected.attack_family==="Nutrition substitutions"); const actual=decideCase(f.input,{mode:"war2"}); assert.ok(actual.rule_ids.includes("RC-42")); assert.match(actual.decision_code,/preserve planned \+ actual/); });
