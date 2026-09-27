import { D1InstallationStore } from "./server/d1-installation-store";
import { D1LicenseStore } from "./server/d1-license-store";
import { InstallationRegistry } from "./server/registry";
import { LicenseAuthority } from "./server/license-authority";
import { D1RateLimiter } from "./server/rate-limit";
import { genericError, jsonResponse } from "./server/http";
import { LICENSE_API_VERSION, LICENSE_ROUTES } from "./server/contracts";
import type { LicenseDatabase } from "./server/runtime";

interface D1Statement { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T|null>; all<T>(): Promise<{results:T[]}>; run(): Promise<{meta:{changes:number;last_row_id?:number}}> }
interface D1Binding { prepare(query:string):D1Statement }
export interface LicenseWorkerEnv { ASSETS:{fetch(request:Request):Promise<Response>}; DB:D1Binding; LICENSE_SIGNING_PRIVATE_KEY:string; }

const dbAdapter=(db:D1Binding):LicenseDatabase=>({
 first:async<T>(q:string,...p:unknown[])=>db.prepare(q).bind(...p).first<T>(),
 all:async<T>(q:string,...p:unknown[])=> (await db.prepare(q).bind(...p).all<T>()).results,
 run:async(q:string,...p:unknown[])=>{const r=await db.prepare(q).bind(...p).run();return {changes:r.meta.changes,lastInsertId:r.meta.last_row_id};},
 batch:async()=>{throw new Error("Batch not used by adapters");},
});
function success<T>(data:T,id:string):Response{return jsonResponse(200,{ok:true,data,requestId:id});}
function failure(status:400|401|404|409|410|500|501,code:string,id:string):Response{return jsonResponse(status,{ok:false,error:"The request could not be completed.",code,requestId:id});}
async function body(request:Request):Promise<Record<string,unknown>|null>{
 const type=request.headers.get("content-type")||"";
 if(!type.toLowerCase().includes("application/json"))return null;
 const text=await request.text(); if(text.length>8192)return null;
 try{const parsed:unknown=JSON.parse(text);return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;}catch{return null;}
}
function bytesFromBase64(value:string):Uint8Array { return Uint8Array.from(atob(value), c=>c.charCodeAt(0)); }
async function signingKey(value:string):Promise<CryptoKey>{
 return crypto.subtle.importKey("pkcs8",bytesFromBase64(value),{name:"Ed25519"},false,["sign"]);
}
export default { async fetch(request:Request,env:LicenseWorkerEnv):Promise<Response>{
 const url=new URL(request.url); const id=crypto.randomUUID();
 if(url.pathname===LICENSE_ROUTES.health&&request.method==="GET")return success({service:"devone-license-server",apiVersion:LICENSE_API_VERSION,status:"ok"},id);
 if(!url.pathname.startsWith("/v1/"))return env.ASSETS.fetch(request);
 if(request.method!=="POST")return failure(400,"invalid_request",id);
 const data=await body(request); if(!data)return failure(400,"invalid_request",id);
 const db=dbAdapter(env.DB), registry=new InstallationRegistry(new D1InstallationStore(db),{now:()=>new Date()});
 let result;
 try {
  if(url.pathname===LICENSE_ROUTES.register) result=await registry.register(data as never);
  else if(url.pathname===LICENSE_ROUTES.authenticate) result=await registry.authenticate(String(data.installationId||""),String(data.installationSecret||""));
  else if(url.pathname===LICENSE_ROUTES.deactivate) result=await registry.deactivate(String(data.installationId||""),String(data.installationSecret||""));
  else if(url.pathname===LICENSE_ROUTES.deregister) result=await registry.deregister(String(data.installationId||""),String(data.installationSecret||""));
  else if(url.pathname.endsWith("/metadata")) result=await registry.updateMetadata(String(data.installationId||""),String(data.installationSecret||""),String(data.domain||""),String(data.adminEmail||""));
  else if(url.pathname===LICENSE_ROUTES.activate || url.pathname===LICENSE_ROUTES.refresh) {
   const proof=String(data.proof||""), timestamp=String(data.timestamp||""), installationId=String(data.installationId||"");
   const limiter=new D1RateLimiter(db);
   if(!(await limiter.allow(`${url.pathname}:${installationId}`,Date.now())))return failure(409,"rate_limited",id);
   const proofResult=await registry.verifyProof(installationId,proof,timestamp);
   if(!proofResult.ok)return failure(proofResult.status,proofResult.code,id);
   const key=await signingKey(env.LICENSE_SIGNING_PRIVATE_KEY);
   const authority=new LicenseAuthority(new D1LicenseStore(db),()=>new Date(),key);
   result=url.pathname===LICENSE_ROUTES.activate
     ? await authority.activate(String(data.licenseKey||""),installationId)
     : await authority.refresh(installationId);
  } else return failure(501,"not_implemented",id);
 } catch { return genericError(500,"internal_error",id); }
 return result.ok?success(result.data,id):failure(result.status,result.code,id);
}};