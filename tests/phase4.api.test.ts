import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LicenseAuthority, type LicenseAuthorityStore, type LicenseRecord } from "../src/server/license-authority";

class Store implements LicenseAuthorityStore {
 rows=new Map<string,LicenseRecord>();
 async insert(r:LicenseRecord){this.rows.set(r.licenseId,structuredClone(r));return true;}
 async findByKeyHash(h:string){return [...this.rows.values()].find(r=>r.keyHash===h)??null;}
 async findById(id:string){return this.rows.get(id)??null;}
 async findByInstallationId(id:string){return [...this.rows.values()].find(r=>r.installationId===id)??null;}
 async claimActivation(id:string,installationId:string,at:string){const r=this.rows.get(id);if(!r||r.state!=="active"||r.installationId)return false;r.installationId=installationId;r.activatedAt=at;return true;}
 async revoke(id:string,at:string){const r=this.rows.get(id);if(!r||r.state!=="active")return false;r.state="revoked";r.revokedAt=at;return true;}
}
async function key(){const pair=await crypto.subtle.generateKey({name:"Ed25519",namedCurve:"Ed25519"},true,["sign","verify"]);return pair.privateKey;}
test("refresh returns the signed entitlement for the bound installation",async()=>{
 const now=new Date("2026-09-27T12:00:00.000Z"), store=new Store();
 const signingKey=await key(); const a=new LicenseAuthority(store,()=>now,signingKey);
 const issued=await a.issue("annual"); assert.equal(issued.ok,true);
 if(!issued.ok)return;
 assert.equal((await a.activate(issued.data.licenseKey,"inst_0123456789abcdef")).ok,true);
 const refreshed=await a.refresh("inst_0123456789abcdef");
 assert.equal(refreshed.ok,true); if(refreshed.ok)assert.ok(refreshed.data.signature.length>0);
});
