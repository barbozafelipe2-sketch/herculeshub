export const IMPLEMENTATION_VERSION = 'PR13-REF-v0.1.0';
export const CONTRACT_VERSION = 'TRACK-EVOLVE-CANDIDATE-v0.2';
export const SCHEMA_VERSION = 'pr13-input-v0.1';

export const Authority = Object.freeze({AUTO_LOG:'AUTO_LOG',AUTO_PROMPT:'AUTO_PROMPT',MAINTAIN:'MAINTAIN',BOUNDED_IN_PLAN:'BOUNDED_IN_PLAN',PROPOSE_FOR_REVIEW:'PROPOSE_FOR_REVIEW',HOLD_AFFECTED_SCOPE:'HOLD_AFFECTED_SCOPE'});

const allowedTopLevel = new Set(['clientNamespace','intakeSnapshotId','activePlanVersionId','sourceSchemaVersion','activeGates','trackEvents','expectedBaseCommitId']);
const forbiddenEvaluatorKeys = new Set(['expected','expectedOutcome','expectedSafetyReview','reviewerCorrection','reviewerOutcome','regressionVerdict','challengeLabel','practiceChallenge','answerKey','hiddenAnswer','engineExpected']);
const assertString=(v,n)=>{if(typeof v!=='string'||v.trim()==='') throw new TypeError(`${n} must be a non-empty string`)};

export function validatePredictionInput(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new TypeError('input must be an object');
  for(const key of Object.keys(input)){if(!allowedTopLevel.has(key)) throw new TypeError(`unexpected prediction field: ${key}`);if(forbiddenEvaluatorKeys.has(key)) throw new TypeError(`evaluator field forbidden in prediction input: ${key}`)}
  assertString(input.clientNamespace,'clientNamespace');assertString(input.intakeSnapshotId,'intakeSnapshotId');assertString(input.activePlanVersionId,'activePlanVersionId');assertString(input.sourceSchemaVersion,'sourceSchemaVersion');
  if(!Array.isArray(input.activeGates)) throw new TypeError('activeGates must be an array');if(!Array.isArray(input.trackEvents)) throw new TypeError('trackEvents must be an array');if(input.expectedBaseCommitId!=null) assertString(input.expectedBaseCommitId,'expectedBaseCommitId');
  for(const gate of input.activeGates) validateGate(gate,input.clientNamespace);for(const event of input.trackEvents) validateEvent(event,input.clientNamespace);return structuredClone(input);
}
export function validateGate(gate,namespace){if(!gate||typeof gate!=='object') throw new TypeError('gate must be an object');for(const f of ['gateEpisodeId','gateType','status','affectedScope','sourceEventId','openedAt','resolutionRequirement']) assertString(gate[f],`gate.${f}`);if(gate.namespace!==undefined&&gate.namespace!==namespace) throw new Error('gate namespace mismatch');if(!['OPEN','CLOSED'].includes(gate.status)) throw new Error(`unsupported gate status: ${gate.status}`)}
export function validateEvent(event,namespace){if(!event||typeof event!=='object') throw new TypeError('event must be an object');for(const f of ['eventId','namespace','type','timestamp']) assertString(event[f],`event.${f}`);if(event.namespace!==namespace) throw new Error('event namespace mismatch');for(const key of Object.keys(event)) if(forbiddenEvaluatorKeys.has(key)) throw new TypeError(`evaluator field forbidden in event: ${key}`)}
