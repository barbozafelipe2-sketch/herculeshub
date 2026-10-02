import { decide } from "./engine.js";

function assertEvaluationSeparated(fixture) {
  if (!fixture || typeof fixture !== "object") throw new Error("INVALID_FIXTURE");
  if (!fixture.input || typeof fixture.input !== "object") throw new Error("MISSING_PREDICTION_INPUT");
  if (!fixture.expected || typeof fixture.expected !== "object") throw new Error("MISSING_EVALUATION_EXPECTED");

  const forbidden = [
    "expected",
    "expected_outcome",
    "expected_safety_review",
    "practice_challenge",
    "scenario",
    "reviewer_correction",
    "regression_verdict",
    "challenge_label"
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(fixture.input, key)) {
      throw new Error(`EVALUATOR_FIELD_LEAK:${key}`);
    }
  }
}

function compareDecision(actual, expected) {
  const differences = [];
  if (expected.authority_class && actual.authority_class !== expected.authority_class) {
    differences.push(`authority_class expected=${expected.authority_class} actual=${actual.authority_class}`);
  }
  if (expected.active_gate_types) {
    const actualTypes = actual.active_gates.map((g) => g.gate_type).sort();
    const expectedTypes = [...expected.active_gate_types].sort();
    if (JSON.stringify(actualTypes) !== JSON.stringify(expectedTypes)) {
      differences.push(`active_gate_types expected=${JSON.stringify(expectedTypes)} actual=${JSON.stringify(actualTypes)}`);
    }
  }
  if (expected.requested_feedback) {
    const actualFeedback = [...actual.requested_feedback].sort();
    const expectedFeedback = [...expected.requested_feedback].sort();
    if (JSON.stringify(actualFeedback) !== JSON.stringify(expectedFeedback)) {
      differences.push(`requested_feedback expected=${JSON.stringify(expectedFeedback)} actual=${JSON.stringify(actualFeedback)}`);
    }
  }
  if (expected.proposed_plan_diff_present !== undefined) {
    const present = actual.proposed_plan_diff !== null;
    if (present !== expected.proposed_plan_diff_present) {
      differences.push(`proposed_plan_diff_present expected=${expected.proposed_plan_diff_present} actual=${present}`);
    }
  }
  return differences;
}

export function runFixture(fixture) {
  assertEvaluationSeparated(fixture);
  const actual = decide(fixture.input);
  const differences = compareDecision(actual, fixture.expected);
  return {
    fixture_id: fixture.fixture_id,
    pass: differences.length === 0,
    differences,
    actual
  };
}

export function runCorpus(fixtures) {
  const results = fixtures.map(runFixture);
  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}
