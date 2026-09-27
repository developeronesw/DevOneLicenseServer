import { strict as assert } from "node:assert";
import { test } from "node:test";
import { InstallationRegistry, type InstallationStore } from "../src/server/registry";
import type { InstallationRecord } from "../src/server/contracts";

type Stored=InstallationRecord & {secretSalt:string;secretVerifier:string};
class Store implements InstallationStore {
 rows=new Map<string,Stored>();
 async get(id:string){return this.rows.get(id)??null;}
 async insert(r:Stored){if(this.rows.has(r.installationId))return false;this.rows.set(r.installationId,structuredClone(r));return true;}
 async update(r:Stored){this.rows.set(r.installationId,structuredClone(r));}
}
test("malformed JSON-shaped registration input returns validation error instead of throwing",async()=>{
 const registry=new InstallationRegistry(new Store(),{now:()=>new Date("2026-09-27T12:00:00.000Z")});
 const result=await registry.register({installationId:"inst_0123456789abcdef",installationSecret:"a".repeat(48),domain:"https://example.com",adminEmail:42} as never);
 assert.deepEqual(result,{ok:false,status:400,code:"invalid_registration"});
});
test("installation proof requires the registered secret and a fresh timestamp",async()=>{
 const store=new Store();
 const registry=new InstallationRegistry(store,{now:()=>new Date("2026-09-27T12:00:00.000Z")});
 const secret="a".repeat(48), installationId="inst_0123456789abcdef";
 assert.equal((await registry.register({installationId,installationSecret:secret,domain:"https://example.com",adminEmail:"admin@example.com"})).ok,true);
 assert.equal((await registry.verifyProof(installationId,secret,"2026-09-27T11:59:59.000Z")).ok,true);
 assert.equal((await registry.verifyProof(installationId,"wrong-secret","2026-09-27T11:59:59.000Z")).code,"proof_invalid");
 assert.equal((await registry.verifyProof(installationId,secret,"2026-09-27T11:40:00.000Z")).code,"proof_expired");
});