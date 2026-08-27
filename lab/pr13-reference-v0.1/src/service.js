import { decide, classifyResolution } from './decision.js';
import { ReferenceStateStore } from './state.js';
export class HerculesReferenceService{
 constructor(namespace,snapshot=null){this.store=new ReferenceStateStore(namespace,snapshot)}
 evaluate(input){const current=this.store.read();const merged={...input,activeGates:current.openGates};const decision=decide(merged);const gateAdds=decision.activeGates.filter(g=>!current.openGates.some(x=>x.gateEpisodeId===g.gateEpisodeId));this.store.apply({expectedBaseCommitId:input.expectedBaseCommitId??current.commitId,namespace:input.clientNamespace,events:input.trackEvents,gateAdds});return decision}
 resolve(event,expectedBaseCommitId){const current=this.store.read();const classification=classifyResolution(event,current.openGates);if(!classification.processable) return {accepted:false,reason:classification.reason,state:current};const state=this.store.apply({expectedBaseCommitId:expectedBaseCommitId??current.commitId,namespace:event.namespace,events:[event],gateCloses:[{...event,targetEpisodeId:classification.targetEpisodeId}]});return {accepted:true,state}}
 snapshot(){return this.store.snapshot()}
}
