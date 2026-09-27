import { strict as assert } from "node:assert";
import { test } from "node:test";
import { LicenseAuthority, type LicenseAuthorityStore, type LicenseRecord } from "../src/server/license-authority";

class MemoryLicenses implements LicenseAuthorityStore {
  rows=new Map<string,LicenseRecord>();
  async insert(r:LicenseRecord){if(this.rows.has(r.licenseId))return false;this.rows.set(r.licenseId,structuredClone(r));return true;}
  async findByKeyHash(hash:string){return [...this.rows.values()].find(r=>r.keyHash===hash)??null;}
  async findById(id:string){return this.rows.get(id)??null;}
  async findByInstallationId(installationId:string){return [...this.rows.values()].find(r=>r.installationId===installationId)??null;}
  async claimActivation(id:string,installationId:string,at:string){
    const r=this.rows.get(id);if(!r||r.state!=="active"||Date.parse(r.expiresAt)<=Date.parse(at)||r.installationId)return false;
    r.installationId=installationId;r.activatedAt=at;return true;
  }
  async revoke(id:string,at:string){const r=this.rows.get(id);if(!r||r.state==="revoked")return false;r.state="revoked";r.revokedAt=at;return true;}
}
const fixed=()=>new Date("2026-09-27T12:00:00.000Z");
async function setup(){const pair=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);const store=new MemoryLicenses();return {store,authority:new LicenseAuthority(store,fixed,pair.privateKey),publicKey:pair.publicKey};}
test("issues a one-time secret and stores only its SHA-256 digest",async()=>{
 const {store,authority}=await setup();const issued=await authority.issue("annual");assert.equal(issued.ok,true);if(!issued.ok)return;
 assert.match(issued.data.licenseKey,/^D1N-/);const record=store.rows.get(issued.data.licenseId)!;
 assert.notEqual(record.keyHash,issued.data.licenseKey);assert.equal(record.installationId,null);assert.equal(issued.data.expiresAt,"2027-09-27T12:00:00.000Z");
});
test("activates exactly once for one installation and signs unlimited-site Network entitlement",async()=>{
 const {authority}=await setup();const issued=await authority.issue("99-year");assert.equal(issued.ok,true);if(!issued.ok)return;
 const activated=await authority.activate(issued.data.licenseKey,"inst_0123456789abcdef");assert.equal(activated.ok,true);if(!activated.ok)return;
 assert.equal(activated.data.edition,"network");assert.equal(activated.data.maxSites,null);assert.ok(activated.data.signature.length>0);
 assert.equal((await authority.activate(issued.data.licenseKey,"inst_0123456789abcdef")).ok,true);
 const other=await authority.activate(issued.data.licenseKey,"inst_abcdef0123456789");assert.deepEqual(other,{ok:false,status:409,code:"license_already_activated"});
});
test("rejects unknown keys, malformed inputs, expired licenses, and revoked licenses",async()=>{
 const {authority,store}=await setup();assert.equal((await authority.activate("bad","inst_0123456789abcdef")).ok,false);
 const issued=await authority.issue("annual");assert.equal(issued.ok,true);if(!issued.ok)return;
 assert.equal((await authority.revoke(issued.data.licenseId)).ok,true);
 assert.equal((await authority.activate(issued.data.licenseKey,"inst_0123456789abcdef")).ok,false);
 const row=store.rows.get(issued.data.licenseId)!;row.expiresAt="2020-01-01T00:00:00.000Z";
 const second=await authority.issue("annual");assert.equal(second.ok,true);
 if(second.ok){const rec=store.rows.get(second.data.licenseId)!;rec.expiresAt="2020-01-01T00:00:00.000Z";assert.equal((await authority.activate(second.data.licenseKey,"inst_0123456789abcdef")).ok,false);}
});
