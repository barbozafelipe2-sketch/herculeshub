export class HTTPError extends Error {
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
export const requireValue=(ok,status,code)=>{if(!ok)throw new HTTPError(status,code)};
export const iso=(time=Date.now())=>new Date(time).toISOString().replace(/\.\d{3}Z$/,'Z');

