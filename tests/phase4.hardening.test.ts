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
