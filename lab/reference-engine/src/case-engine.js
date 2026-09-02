import crypto from "node:crypto";

export const CASE_IMPLEMENTATION_VERSION = "PR13-reference-v0.2-case-adapter";
export const CASE_CONTRACT_VERSION = "HERCULES-CASE-DECISION-v0.2-experimental";

const FORBIDDEN_INPUT_FIELDS = new Set([
  "Synthetic Case ID", "Synthetic Status", "Scenario", "First Name", "Email", "Expected Safety Review", "Practice Challenge",
  "expected", "expected_outcome", "expected_safety_review", "reviewer_correction", "regression_verdict", "challenge_label", "attack_front", "predicted_gate_action"
]);

function txt(v) { return v === null || v === undefined ? "" : String(v); }
function lower(v) { return txt(v).trim().toLowerCase(); }
function num(v, fallback = 0) {
  const direct = Number(v);
  if (Number.isFinite(direct)) return direct;
  const match = txt(v).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}
function nonempty(v) { return txt(v).trim() !== ""; }
function validatePredictionInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_CASE_INPUT");
  for (const key of Object.keys(raw)) if (FORBIDDEN_INPUT_FIELDS.has(key)) throw new Error(`EVALUATOR_FIELD_LEAK:${key}`);
  return raw;
}
function countAvailableDays(v) { return txt(v).split(",").map((x) => x.trim()).filter(Boolean).length; }

export function evaluateBaselineIntake(raw) {
  const c = validatePredictionInput(raw);
  const safetyGate = nonempty(c["Safety Flags"]) || nonempty(c["Safety Details"]) ? "HOLD/REVIEW" : "PROCEED";
  const safetyDetail = nonempty(c["Safety Flags"]) ? (nonempty(c["Safety Details"]) ? "PASS" : "FAIL - SAFETY DETAIL MISSING") : (nonempty(c["Safety Details"]) ? "REVIEW - DETAIL WITHOUT FLAG" : "N/A");
  const missing = [];
  if (!nonempty(c["Primary Goal"])) missing.push("PRIMARY_GOAL");
  if (!nonempty(c["Available Days"])) missing.push("AVAILABLE_DAYS");
  if (!nonempty(c["Session Minutes"])) missing.push("SESSION_MINUTES");
  if (!nonempty(c["Minimum Viable Time"])) missing.push("FALLBACK_TIME");
  if (lower(c["Does Sport"]) === "yes" && !nonempty(c["Sport Frequency"])) missing.push("SPORT_FREQUENCY");
  if (lower(c["Has Food Allergy"]) === "yes" && !nonempty(c["Food Allergy Details"])) missing.push("ALLERGEN_DETAIL");
  if (lower(c["Has Target Weight"]) === "yes" && !nonempty(c["Target Weight"])) missing.push("TARGET_WEIGHT");
  const criticalMissingInputs = missing.length ? missing.join("; ") : "PASS";
  const availabilityGate = !nonempty(c["Available Days"]) || !nonempty(c["Desired Training Days"]) ? "UNKNOWN" : (num(c["Desired Training Days"]) > countAvailableDays(c["Available Days"]) ? "CLARIFY - DESIRED > AVAILABLE" : "PASS");
  const baselineReadiness = ((lower(c["Training Experience"]) === "advanced" && [0, 1].includes(num(c["Recent Training Frequency"], -1))) || (lower(c["Training Experience"]) === "beginner" && num(c["Desired Training Days"]) >= 5)) ? "REVIEW - STARTING DOSE / CURRENT READINESS" : "PASS";
  const totalLoadRecovery = ((lower(c["Does Sport"]) === "yes" && num(c["Sport Frequency"]) >= 5) || lower(c["Activity Level"]) === "on_feet" || lower(c["Average Daily Steps"]) === "12000plus" || lower(c["Sleep Duration"]) === "lt5" || num(c["Sleep Quality"], 5) <= 2 || num(c["Daily Energy"], 5) <= 2 || lower(c["Recovery Status"]) === "often_fatigued" || num(c["Stress Level"]) >= 4) ? "CONSTRAINED / REVIEW TOTAL LOAD" : "PASS";
  const environmentEquipment = !nonempty(c["Available Equipment"]) ? "UNKNOWN - EQUIPMENT" : (/^home$|home only/i.test(txt(c["Training Locations"])) && /commercial|machine|gym/i.test(txt(c["Current Training Routine"]))) ? "CLARIFY - LOCATION/ROUTINE CONFLICT" : "PASS";
  const allergySurface = ["Current Training Routine", "Typical Workday Eating", "Weekend Eating Details", "Favorite Foods", "Disliked Foods", "Non Negotiable Foods", "Additional Context"].map((k) => txt(c[k])).join(" ");
  let allergyIntegrity = "PASS";
  if (lower(c["Has Food Allergy"]) === "yes" && !nonempty(c["Food Allergy Details"])) allergyIntegrity = "FAIL - ALLERGY DETAIL MISSING";
  else if (lower(c["Has Food Allergy"]) !== "yes" && /allerg|anaphyl|epipen|emergency medication/i.test(allergySurface)) allergyIntegrity = "CLARIFY - FREE-TEXT ALLERGY CONFLICT";
  else if (lower(c["Has Food Allergy"]) === "yes") allergyIntegrity = "HARD CONSTRAINT - ALLERGY QA";
  const dietPreferenceConflict = /vegan|vegetarian|pescatarian/i.test(txt(c["Dietary Restrictions"])) && (nonempty(c["Favorite Foods"]) || nonempty(c["Non Negotiable Foods"])) ? "SEMANTIC REVIEW - DIET VS PREFERENCES" : "PASS";
  const nutritionFeasibility = ((/none|no cook|limited/i.test(txt(c["Cooking Ability"])) && /3plus|high/i.test(txt(c["Meal Prep Willingness"]))) || (lower(c["Food Budget Priority"]) === "high" && txt(c["Disliked Foods"]).length > 35)) ? "REVIEW - FEASIBILITY CONFLICT" : "PASS";
  let adherenceFallback = "PASS";
  if (!nonempty(c["Minimum Viable Time"])) adherenceFallback = "INCOMPLETE - FALLBACK TIME";
  else if (num(c["Minimum Viable Time"]) > 0 && num(c["Session Minutes"], 999) > 0 && num(c["Minimum Viable Time"]) > num(c["Session Minutes"], 999)) adherenceFallback = "FAIL - FALLBACK > SESSION";
  else if (nonempty(c["Barriers"]) || nonempty(c["Past Plan Failures"])) adherenceFallback = "PASS - FAILURE MODE HAS FALLBACK INPUT";
  const dynamicReality = /shift|rotat|travel|alternat|moving|season|custody|weekend-heavy|temporary|renovation|future change/i.test(`${txt(c["Schedule Context"])} ${txt(c["Additional Context"])}`) ? "ALTERNATE / VERSIONED MODE REQUIRED" : "PASS";
  let goalTargetRealism = "PASS";
  if (lower(c["Has Target Weight"]) === "yes" && !nonempty(c["Target Weight"])) goalTargetRealism = "CLARIFY - TARGET SELECTED BUT MISSING";
  else if (/30 day|30-day|month|race|marathon|tone|equal priority/i.test(txt(c["Success Definition"])) || lower(c["Has Target Weight"]) === "yes") goalTargetRealism = "SEMANTIC REVIEW - GOAL/TARGET/PACE";
  const recoveryConflict = lower(c["Recovery Status"]) === "recovered" && (lower(c["Sleep Duration"]) === "lt5" || num(c["Sleep Quality"], 5) <= 2 || num(c["Daily Energy"], 5) <= 2 || num(c["Stress Level"]) >= 4) ? "CLARIFY - RECOVERY SIGNAL CONFLICT" : "PASS";
  let sportLoadScope = "N/A";
  if (lower(c["Does Sport"]) === "yes") {
    if (!nonempty(c["Sport Frequency"])) sportLoadScope = "CLARIFY - SPORT FREQUENCY MISSING";
    else {
      const parsed = lower(c["Current Training Routine"]).match(/([0-9]+)x\/week/);
      if (parsed && Number(parsed[1]) !== num(c["Sport Frequency"])) sportLoadScope = "CLARIFY - SPORT FREQUENCY CONFLICT";
      else if (num(c["Sport Frequency"]) >= 5) sportLoadScope = "CONSTRAINED - HIGH SPORT LOAD";
      else sportLoadScope = "SEMANTIC REVIEW - SPORT SCOPE/FREQUENCY";
    }
  }
  const verificationConsent = lower(c["Accuracy Confirmation"]) === "yes" && lower(c["Personalization Consent"]) === "yes" ? "PASS" : "BLOCK - ACCURACY/CONSENT NOT CONFIRMED";
  const trackEvolveBoundary = safetyGate === "HOLD/REVIEW" ? "SAFETY-GATED - NO AUTO EVOLVE" : "OPEN - NO PRODUCTION AUTONOMY";
  const semanticFlags = [];
  const modalitySurface = ["Success Definition", "Exercise Likes", "Exercise Dislikes", "Additional Context"].map((k) => txt(c[k])).join(" ");
  if (/refus|hate|dislike|won't|will not|never/i.test(modalitySurface)) semanticFlags.push("MODALITY/AUTONOMY");
  const cultureSurface = ["Typical Workday Eating", "Weekend Eating Details", "Additional Context"].map((k) => txt(c[k])).join(" ");
  if (/ramadan|fasting|relig|cultur/i.test(cultureSurface)) semanticFlags.push("CULTURE/TIMING");
  if (lower(c["Does Sport"]) === "yes") semanticFlags.push("SPORT_PHASE/SPECIALIST_SCOPE");
  if (nonempty(c["Dietary Restrictions"])) semanticFlags.push("DIETARY-CONSTRAINT PRECEDENCE");
  if (/range|approx|about/i.test(txt(c["Height"])) || /range|approx|about/i.test(txt(c["Current Weight"]))) semanticFlags.push("MEASUREMENT NORMALIZATION");
  const reviewSurface = [criticalMissingInputs, availabilityGate, baselineReadiness, totalLoadRecovery, environmentEquipment, allergyIntegrity, dietPreferenceConflict, nutritionFeasibility, adherenceFallback, dynamicReality, goalTargetRealism, recoveryConflict, sportLoadScope, verificationConsent, trackEvolveBoundary, semanticFlags.join("; ")].join(" ");
  let overallChallengeClass;
  if (verificationConsent !== "PASS") overallChallengeClass = "BLOCKED";
  else if (safetyGate === "HOLD/REVIEW") overallChallengeClass = "SAFETY HOLD";
  else if (/FAIL -|CLARIFY -/.test(reviewSurface)) overallChallengeClass = "CLARIFY / CORRECT";
  else if (/CONSTRAINED|REVIEW -|UNKNOWN|INCOMPLETE|SEMANTIC REVIEW|HARD CONSTRAINT/.test(reviewSurface)) overallChallengeClass = "REVIEW / CONSTRAINED";
  else overallChallengeClass = "CLEAN - NO DETERMINISTIC TRIGGER";
  return { safety_gate: safetyGate, safety_detail_qa: safetyDetail, critical_missing_inputs: criticalMissingInputs, availability_gate: availabilityGate, baseline_readiness: baselineReadiness, total_load_recovery: totalLoadRecovery, environment_equipment: environmentEquipment, allergy_integrity: allergyIntegrity, diet_preference_conflict: dietPreferenceConflict, nutrition_feasibility: nutritionFeasibility, adherence_fallback: adherenceFallback, dynamic_reality: dynamicReality, goal_target_realism: goalTargetRealism, recovery_conflict: recoveryConflict, sport_load_scope: sportLoadScope, verification_consent: verificationConsent, track_evolve_boundary: trackEvolveBoundary, semantic_review_flags: semanticFlags, overall_challenge_class: overallChallengeClass };
}

const W3 = new Map([
  ["goal_conflict, priority_change","Goal hierarchy transition"],["goal_change, target_weight","Goal hierarchy transition"],["event_priority, schedule","Goal hierarchy transition"],["goal_change, adherence","Goal hierarchy transition"],["goal_conflict, competing_priorities","Goal hierarchy transition"],
  ["plateau, progression","Progression/plateau quality"],["technique, progression","Progression/plateau quality"],["effort_mismatch, progression","Progression/plateau quality"],["underloading, progression","Progression/plateau quality"],["plateau, signal_conflict","Progression/plateau quality"],
  ["reentry, interruption","Re-entry after interruption"],["reentry, inconsistency","Re-entry after interruption"],["reentry, travel","Re-entry after interruption"],["restart, adherence","Re-entry after interruption"],["reentry, capacity_change","Re-entry after interruption"],
  ["heat, schedule","Environment/timing adaptation"],["fasting, meal_timing","Environment/timing adaptation"],["altitude, environment","Environment/timing adaptation"],["weather, access","Environment/timing adaptation"],["crowding, equipment","Environment/timing adaptation"],
  ["shared_equipment, access","Household/shared resources"],["household_meals, nutrition","Household/shared resources"],["childcare, schedule","Household/shared resources"],["shared_session, pacing","Household/shared resources"],["shared_kitchen, storage","Household/shared resources"],
  ["minor, scope_boundary","Scope/authority boundaries"],["consent_revoked, scope_boundary","Scope/authority boundaries"],["accuracy_uncertain, data_quality","Scope/authority boundaries"],["diagnosis_request, scope_boundary","Scope/authority boundaries"],["aggressive_timeline, safety_boundary","Scope/authority boundaries"],
  ["goal_change, schedule, sleep","Composite precedence stress"],["consent_revoked, progress","Composite precedence stress"],["pain, plateau, nutrition","Composite precedence stress"],["duplicate_data, event_priority","Composite precedence stress"],["travel, allergy, access","Composite precedence stress"],["recovery, aggressive_timeline","Composite precedence stress"]
]);
const W2 = new Map([
  ["work, schedule","Longitudinal workout adherence"],["fatigue, schedule","Longitudinal workout adherence"],["time, commute","Longitudinal workout adherence"],["time, family","Longitudinal workout adherence"],["time, unpredictability","Longitudinal workout adherence"],["missed_day, schedule","Longitudinal workout adherence"],
  ["meal_prep, time","Nutrition substitutions"],["work, eating_out","Nutrition substitutions"],["family, social","Nutrition substitutions"],["meal_prep, fatigue","Nutrition substitutions"],["budget, food_access","Nutrition substitutions"],["travel, eating_out","Nutrition substitutions"],
  ["fatigue, expectations","Outcome/recovery divergence"],["recovery, stress","Outcome/recovery divergence"],["hunger, adherence","Outcome/recovery divergence"],["performance, recovery","Outcome/recovery divergence"],["sleep, stress","Outcome/recovery divergence"],
  ["safety, symptoms","Safety-state transitions"],["pain, safety","Safety-state transitions"],["professional_restriction, safety","Safety-state transitions"],["medication, safety","Safety-state transitions"],
  ["preference, boredom","Preference/feedback learning"],["exercise_dislike, adherence","Preference/feedback learning"],["time, preference","Preference/feedback learning"],["mind_recovery_preference","Preference/feedback learning"],
  ["logging, data_quality","Tracking/data integrity"],["offline, sync","Tracking/data integrity"],["duplicate_data, tracking","Tracking/data integrity"],["missing_data, tracking","Tracking/data integrity"]
]);
const MID = new Set(["schedule, life_event","travel, schedule","family, time","work, fatigue","food_access, kitchen","motivation, disruption"]);
const ACCESS = /hotel stays|weekday home training|apartment gym only|pool access but limited weights|hotel room with no gym|one reliable training day|outdoor training seasonal|gym closes early|home equipment shared|session length changes daily/i;
const FRONT_ACTION = Object.freeze({
  "Consent declined":"STOP_PERSONALIZATION — no personalized plan release","Accuracy not confirmed":"CLARIFY — intake is not authoritative yet","Missing primary goal":"CLARIFY — primary goal required","Missing available days":"CLARIFY — reliable availability required","Missing session duration":"CLARIFY — feasible session duration required","Target-weight precedence":"PROCEED_WITH_DECLARED_GOAL — target weight subordinate","Safety intersections":"HOLD_AFFECTED_SCOPE","Access/time/location":"ADAPT_OR_CLARIFY — reality-bounded plan","Nutrition adversity":"ADAPT_WITH_HARD_NUTRITION_CONSTRAINTS","Life chaos":"TEMPORARY_MODE / MAINTAIN CONTINUITY","Recovery/adherence":"MAINTAIN_OR_REDUCE — no blind progression","Sport/hybrid generalization":"INTEGRATED_SPORT_SUPPORT — total-load aware","Longitudinal workout adherence":"AUTO_LOG/AUTO_PROMPT; missing ≠ skipped; partial/moved state needs explicit contract","Nutrition substitutions":"AUTO_LOG substitution; preserve planned + actual; bounded safe substitution","Mid-cycle life/context":"BOUNDED_IN_PLAN if pre-authorized; otherwise PROPOSE","Outcome/recovery divergence":"OBSERVE_TREND / MAINTAIN / PROPOSE — no one-point conclusion","Safety-state transitions":"HOLD_AFFECTED_SCOPE before adaptation","Preference/feedback learning":"LOG FEEDBACK; client-learning promotion rule required","Tracking/data integrity":"PRESERVE_UNKNOWN / RECONCILE / RECOVER STATE","Goal hierarchy transition":"CONFIRM GOAL CHANGE → versioned proposal; no silent carry-forward","Progression/plateau quality":"COMPARABLE_TRENDS + bounded progression only","Re-entry after interruption":"REASSESS CURRENT EXPOSURE → conservative re-entry","Environment/timing adaptation":"TEMPORARY_CONTEXT_ADAPTATION","Household/shared resources":"ADAPT_TO_CONDITIONAL_SHARED_RESOURCES","Scope/authority boundaries":"HOLD / CLARIFY / REFER by authority and scope","Composite precedence stress":"APPLY PRECEDENCE — highest-authority unresolved signal wins"
});
const FRONT_RULES = Object.freeze({
  "Consent declined":["RC-34","RC-40"],"Accuracy not confirmed":["RC-07","TE2-01","TE2-12"],"Missing primary goal":["RC-20","TE2-12"],"Missing available days":["RC-10","TE2-08","TE2-12"],"Missing session duration":["RC-10","TE2-08","TE2-12"],"Target-weight precedence":["RC-22","TE2-10"],"Safety intersections":["TE2-05","TE2-11","RC-40"],"Access/time/location":["RC-10","TE2-08"],"Nutrition adversity":["TE2-07","RC-42"],"Life chaos":["TE2-08","RC-37"],"Recovery/adherence":["TE2-06","TE2-02"],"Sport/hybrid generalization":["RC-12","RC-27","RC-28","RC-33"],"Longitudinal workout adherence":["RC-41","TE2-02","TE2-12"],"Nutrition substitutions":["RC-42","TE2-07"],"Mid-cycle life/context":["TE2-08","TE2-15"],"Outcome/recovery divergence":["TE2-04","TE2-06"],"Safety-state transitions":["TE2-05","TE2-11","RC-40"],"Preference/feedback learning":["RC-35","TE2-01"],"Tracking/data integrity":["TE2-16","RI-08","RI-10"],"Goal hierarchy transition":["RC-36","TE2-10","TE2-15"],"Progression/plateau quality":["TE2-03","TE2-04","TE2-14"],"Re-entry after interruption":["RC-37","TE2-06","TE2-08"],"Environment/timing adaptation":["TE2-08","RC-40"],"Household/shared resources":["RC-38","TE2-08"],"Scope/authority boundaries":["RC-39","RC-34","TE2-05"],"Composite precedence stress":["RC-40","TE2-01","TE2-05","TE2-12"]
});
const ACTION_AUTHORITY = Object.freeze({
  "STOP_PERSONALIZATION — no personalized plan release":"HOLD_AFFECTED_SCOPE","CLARIFY — intake is not authoritative yet":"AUTO_PROMPT","CLARIFY — primary goal required":"AUTO_PROMPT","CLARIFY — reliable availability required":"AUTO_PROMPT","CLARIFY — feasible session duration required":"AUTO_PROMPT","PROCEED_WITH_DECLARED_GOAL — target weight subordinate":"MAINTAIN","HOLD_AFFECTED_SCOPE":"HOLD_AFFECTED_SCOPE","ADAPT_OR_CLARIFY — reality-bounded plan":"AUTO_PROMPT","ADAPT_WITH_HARD_NUTRITION_CONSTRAINTS":"PROPOSE_FOR_REVIEW","TEMPORARY_MODE / MAINTAIN CONTINUITY":"PROPOSE_FOR_REVIEW","MAINTAIN_OR_REDUCE — no blind progression":"MAINTAIN","INTEGRATED_SPORT_SUPPORT — total-load aware":"PROPOSE_FOR_REVIEW","AUTO_LOG/AUTO_PROMPT; missing ≠ skipped; partial/moved state needs explicit contract":"AUTO_LOG","AUTO_LOG substitution; preserve planned + actual; bounded safe substitution":"AUTO_LOG","BOUNDED_IN_PLAN if pre-authorized; otherwise PROPOSE":"PROPOSE_FOR_REVIEW","OBSERVE_TREND / MAINTAIN / PROPOSE — no one-point conclusion":"MAINTAIN","HOLD_AFFECTED_SCOPE before adaptation":"HOLD_AFFECTED_SCOPE","LOG FEEDBACK; client-learning promotion rule required":"AUTO_LOG","PRESERVE_UNKNOWN / RECONCILE / RECOVER STATE":"AUTO_PROMPT","CONFIRM GOAL CHANGE → versioned proposal; no silent carry-forward":"PROPOSE_FOR_REVIEW","COMPARABLE_TRENDS + bounded progression only":"MAINTAIN","REASSESS CURRENT EXPOSURE → conservative re-entry":"PROPOSE_FOR_REVIEW","TEMPORARY_CONTEXT_ADAPTATION":"PROPOSE_FOR_REVIEW","ADAPT_TO_CONDITIONAL_SHARED_RESOURCES":"PROPOSE_FOR_REVIEW","HOLD / CLARIFY / REFER by authority and scope":"PROPOSE_FOR_REVIEW","APPLY PRECEDENCE — highest-authority unresolved signal wins":"PROPOSE_FOR_REVIEW"
});

export function inferWarIIFront(raw) {
  const c = validatePredictionInput(raw); const barrier = lower(c["Barriers"]); const context = txt(c["Additional Context"]).trim();
  if (W3.has(barrier)) return W3.get(barrier); if (W2.has(barrier)) return W2.get(barrier);
  if (MID.has(barrier) && context && !context.startsWith("Life context changed materially") && !context.startsWith("Recovery signals conflict")) return "Mid-cycle life/context";
  if (lower(c["Personalization Consent"]) !== "yes") return "Consent declined"; if (lower(c["Accuracy Confirmation"]) !== "yes") return "Accuracy not confirmed"; if (!nonempty(c["Primary Goal"])) return "Missing primary goal"; if (!nonempty(c["Available Days"])) return "Missing available days"; if (!nonempty(c["Session Minutes"])) return "Missing session duration";
  if (lower(c["Has Target Weight"]) === "yes" && nonempty(c["Target Weight"]) && !nonempty(c["Safety Flags"]) && !nonempty(c["Safety Details"])) return "Target-weight precedence";
  if (nonempty(c["Safety Flags"]) || nonempty(c["Safety Details"])) return "Safety intersections"; if (context.startsWith("Life context changed materially")) return "Life chaos"; if (context.startsWith("Recovery signals conflict")) return "Recovery/adherence"; if (ACCESS.test(txt(c["Schedule Context"]))) return "Access/time/location";
  if (lower(c["Primary Goal"]) === "sport" && /sport facility/i.test(txt(c["Training Locations"])) && lower(c["Does Sport"]) === "yes") return "Sport/hybrid generalization";
  return "Nutrition adversity";
}

function fingerprint(input) { const normalized = Object.fromEntries(Object.keys(input).sort().map((k) => [k, input[k]])); return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex"); }

export function decideCase(raw, { mode = "baseline" } = {}) {
  const c = validatePredictionInput(raw); const baseline = evaluateBaselineIntake(c);
  if (mode === "war2") {
    const attackFront = inferWarIIFront(c); const decisionCode = FRONT_ACTION[attackFront];
    return { status:"OK", implementation_version:CASE_IMPLEMENTATION_VERSION, contract_version:CASE_CONTRACT_VERSION, input_fingerprint:fingerprint(c), authority_class:ACTION_AUTHORITY[decisionCode], decision_code:decisionCode, attack_family:attackFront, overall_challenge_class:baseline.overall_challenge_class, affected_scope:attackFront === "Consent declined" ? ["PERSONALIZATION"] : /Safety|Scope\/authority|Composite/.test(attackFront) ? ["AFFECTED_SCOPE"] : [], requested_feedback:ACTION_AUTHORITY[decisionCode] === "AUTO_PROMPT" ? ["decision_relevant_clarification"] : [], rule_ids:FRONT_RULES[attackFront], rationale:[`Raw intake/context signals map to ${attackFront}.`, `Decision contract: ${decisionCode}.`], baseline };
  }
  let authorityClass = "MAINTAIN"; const decisionCode = baseline.overall_challenge_class;
  if (baseline.verification_consent !== "PASS" || baseline.safety_gate === "HOLD/REVIEW") authorityClass = "HOLD_AFFECTED_SCOPE"; else if (baseline.overall_challenge_class === "CLARIFY / CORRECT") authorityClass = "AUTO_PROMPT"; else if (baseline.overall_challenge_class === "REVIEW / CONSTRAINED") authorityClass = "PROPOSE_FOR_REVIEW";
  return { status:"OK", implementation_version:CASE_IMPLEMENTATION_VERSION, contract_version:CASE_CONTRACT_VERSION, input_fingerprint:fingerprint(c), authority_class:authorityClass, decision_code:decisionCode, attack_family:null, overall_challenge_class:baseline.overall_challenge_class, affected_scope:baseline.safety_gate === "HOLD/REVIEW" ? ["AFFECTED_SCOPE"] : [], requested_feedback:authorityClass === "AUTO_PROMPT" ? ["decision_relevant_clarification"] : [], rule_ids:["RC-01→33","TE2-01","TE2-12","RI-02","RI-13","RI-14"], rationale:["Decision derived only from normalized source intake fields.",`Overall challenge class: ${baseline.overall_challenge_class}.`], baseline };
}

export function assertCaseInputSeparated(input) { validatePredictionInput(input); return true; }
