import { createHash, randomUUID } from 'node:crypto';
const stable=v=>Array.isArray(v)?`[${v.map(stable).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`:JSON.stringify(v);
const fingerprint=state=>createHash('sha256').update(stable(state)).digest('hex');
export class IntegrityError extends Error{}; export class ConcurrencyError extends Error{}; export class NamespaceError extends Error{};
export class ReferenceStateStore{
  #state;
  constructor(namespace,snapshot=null){
    if(snapshot){const {fingerprint:supplied,...body}=snapshot;if(supplied!==fingerprint(body)) throw new IntegrityError('snapshot fingerprint mismatch');if(body.clientNamespace!==namespace) throw new NamespaceError('snapshot namespace mismatch');this.#state=structuredClone(body)}
    else this.#state={clientNamespace:namespace,commitId:randomUUID(),baseCommitId:null,revision:0,openGates:[],closedRegistry:[],consumedEventIds:[],liveAdds:[],liveRemoves:[]};
  }
  read(){return structuredClone(this.#state)}
  snapshot(){const body=this.read();return {...body,fingerprint:fingerprint(body)}}
  apply({expectedBaseCommitId,namespace,events=[],gateAdds=[],gateCloses=[]}){
    if(namespace!==this.#state.clientNamespace) throw new NamespaceError('foreign namespace mutation rejected');if(expectedBaseCommitId&&expectedBaseCommitId!==this.#state.commitId) throw new ConcurrencyError('stale writer rejected');
    const next=this.read(),previousCommit=next.commitId,consumed=new Set(next.consumedEventIds);
    for(const e of events){if(e.namespace!==namespace) throw new NamespaceError('foreign event rejected');if(!consumed.has(e.eventId)) consumed.add(e.eventId)}
    for(const gate of gateAdds) if(!next.openGates.some(g=>g.gateEpisodeId===gate.gateEpisodeId)) next.openGates.push(structuredClone(gate));
    for(const close of gateCloses){const i=next.openGates.findIndex(g=>g.gateEpisodeId===close.targetEpisodeId);if(i===-1) continue;const [closed]=next.openGates.splice(i,1);next.closedRegistry.push({...closed,status:'CLOSED',closedAt:close.timestamp,resolutionEventId:close.eventId})}
    next.consumedEventIds=[...consumed];next.baseCommitId=previousCommit;next.commitId=randomUUID();next.revision+=1;next.liveAdds.push(...gateAdds.map(g=>g.gateEpisodeId));next.liveRemoves.push(...gateCloses.map(g=>g.targetEpisodeId));this.#state=next;return this.read();
  }
}
