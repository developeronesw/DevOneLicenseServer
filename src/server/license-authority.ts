import type { LicenseTerm, NetworkEntitlement, LicenseFeature } from "./contracts";

const encoder = new TextEncoder();
const FEATURES: LicenseFeature[] = ["multisite", "network_admin", "network_users", "network_domains", "network_extensions"];

export interface LicenseRecord {
  licenseId: string;
  keyHash: string;
  term: LicenseTerm;
  state: "active" | "revoked";
  issuedAt: string;
  expiresAt: string;
  installationId: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
}
export interface LicenseAuthorityStore {
  insert(record: LicenseRecord): Promise<boolean>;
  findByKeyHash(hash: string): Promise<LicenseRecord | null>;
  findById(id: string): Promise<LicenseRecord | null>;
  findByInstallationId(installationId: string): Promise<LicenseRecord | null>;
  /** Must atomically claim only an unassigned, active, unexpired license. */
  claimActivation(id: string, installationId: string, at: string): Promise<boolean>;
  revoke(id: string, at: string): Promise<boolean>;
}
export type AuthorityResult<T> = {ok:true; data:T}|{ok:false; status:400|401|404|409|410; code:string};

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function sha256(value: string): Promise<string> {
  return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
function randomToken(bytes=32): string {
  return base64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function addTerm(date: Date, term: LicenseTerm): Date {
  const result = new Date(date);
  if (term === "annual") result.setUTCFullYear(result.getUTCFullYear()+1);
  else if (term === "99-year") result.setUTCFullYear(result.getUTCFullYear()+99);
  else return new Date("9999-12-31T23:59:59.999Z");
  return result;
}
export class LicenseAuthority {
  constructor(
    private readonly store: LicenseAuthorityStore,
    private readonly now: ()=>Date,
    private readonly signingPrivateKey: CryptoKey,
  ) {}
  async issue(term: LicenseTerm): Promise<AuthorityResult<{licenseId:string; licenseKey:string; issuedAt:string; expiresAt:string}>> {
    if (term !== "annual" && term !== "lifetime" && term !== "99-year") return {ok:false,status:400,code:"invalid_term"};
    const issued = this.now();
    const key = "D1N-"+randomToken(32);
    const id = crypto.randomUUID();
    const issuedAt = issued.toISOString();
    const expiresAt = addTerm(issued,term).toISOString();
    const record: LicenseRecord = {licenseId:id,keyHash:await sha256(key),term,state:"active",issuedAt,expiresAt,installationId:null,activatedAt:null,revokedAt:null};
    if (!(await this.store.insert(record))) return {ok:false,status:409,code:"issue_conflict"};
    // The cleartext key is returned once and is never persisted.
    return {ok:true,data:{licenseId:id,licenseKey:key,issuedAt,expiresAt}};
  }
  private async entitlement(record: LicenseRecord): Promise<NetworkEntitlement> {
    const unsigned={licenseId:record.licenseId,product:"devone-cms" as const,edition:"network" as const,maxSites:null,features:FEATURES,issuedAt:record.issuedAt,expiresAt:record.expiresAt,term:record.term};
    const bytes=await crypto.subtle.sign({name:"Ed25519"},this.signingPrivateKey,encoder.encode(JSON.stringify(unsigned)));
    return {...unsigned,signature:base64(new Uint8Array(bytes))};
  }

  async activate(licenseKey:string, installationId:string): Promise<AuthorityResult<NetworkEntitlement>> {
    if (typeof licenseKey!=="string" || !/^D1N-[A-Za-z0-9_-]{40,60}$/.test(licenseKey) || typeof installationId!=="string" || !/^[A-Za-z0-9_-]{16,128}$/.test(installationId)) {
      return {ok:false,status:400,code:"invalid_activation"};
    }
    const record=await this.store.findByKeyHash(await sha256(licenseKey));
    if (!record) return {ok:false,status:404,code:"license_not_found"};
    if (record.state!=="active") return {ok:false,status:410,code:"license_unavailable"};
    if (Date.parse(record.expiresAt)<=this.now().getTime()) return {ok:false,status:410,code:"license_expired"};
    if (record.installationId && record.installationId!==installationId) return {ok:false,status:409,code:"license_already_activated"};
    if (!record.installationId && !(await this.store.claimActivation(record.licenseId,installationId,this.now().toISOString()))) {
      return {ok:false,status:409,code:"license_already_activated"};
    }
    const current=await this.store.findByKeyHash(await sha256(licenseKey));
    if(!current||current.state!=="active"||current.installationId!==installationId)return{ok:false,status:409,code:"license_state_conflict"};
    return{ok:true,data:await this.entitlement(current)};
  }
  async refresh(installationId:string):Promise<AuthorityResult<NetworkEntitlement>> {
    if(typeof installationId!=="string"||!/^[A-Za-z0-9_-]{16,128}$/.test(installationId))return{ok:false,status:400,code:"invalid_refresh"};
    const record=await this.store.findByInstallationId(installationId);
    if(!record)return{ok:false,status:404,code:"license_not_found"};
    if(record.state!=="active")return{ok:false,status:410,code:"license_unavailable"};
    if(Date.parse(record.expiresAt)<=this.now().getTime())return{ok:false,status:410,code:"license_expired"};
    return{ok:true,data:await this.entitlement(record)};
  }

  async revoke(licenseId:string):Promise<AuthorityResult<{licenseId:string;state:"revoked"}>> {
    if(typeof licenseId!=="string" || !/^[0-9a-f-]{36}$/i.test(licenseId)) return {ok:false,status:400,code:"invalid_license_id"};
    const record=await this.store.findById(licenseId);
    if(!record)return {ok:false,status:404,code:"license_not_found"};
    if(record.state==="revoked")return {ok:true,data:{licenseId,state:"revoked"}};
    if(!(await this.store.revoke(licenseId,this.now().toISOString())))return {ok:false,status:409,code:"license_state_conflict"};
    return {ok:true,data:{licenseId,state:"revoked"}};
  }
}
