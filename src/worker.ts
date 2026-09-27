import { D1InstallationStore } from "./server/d1-installation-store";
import { InstallationRegistry } from "./server/registry";
import { genericError, jsonResponse } from "./server/http";
import { LICENSE_API_VERSION, LICENSE_ROUTES } from "./server/contracts";
import type { LicenseDatabase } from "./server/runtime";

interface D1Statement { bind(...values: unknown[]): D1Statement; first<T>(): Promise<T|null>; all<T>(): Promise<{results:T[]}>; run(): Promise<{meta:{changes:number;last_row_id?:number}}> }
interface D1Binding { prepare(query:string):D1Statement }
export interface LicenseWorkerEnv { ASSETS:{fetch(request:Request):Promise<Response>}; DB:D1Binding; }

const dbAdapter=(db:D1Binding):LicenseDatabase=>({
 first:async<T>(q:string,...p:unknown[])=>db.prepare(q).bind(...p).first<T>(),
 all:async<T>(q:string,...p:unknown[])=> (await db.prepare(q).bind(...p).all<T>()).results,
 run:async(q:string,...p:unknown[])=>{const r=await db.prepare(q).bind(...p).run();return {changes:r.meta.changes,lastInsertId:r.meta.last_row_id};},
 batch:async()=>{throw new Error("Batch not used by registry adapter");},
});
function success<T>(data:T,id:string):Response{return jsonResponse(200,{ok:true,data,requestId:id});}
function failure(status:400|401|409|404,code:string,id:string):Response{return jsonResponse(status,{ok:false,error:"The request could not be completed.",code,requestId:id});}
async function body(request:Request):Promise<Record<string,unknown>|null>{
 const type=request.headers.get("content-type")||"";
 if(!type.toLowerCase().includes("application/json"))return null;
 const text=await request.text(); if(text.length>8192)return null;
 try{const parsed:unknown=JSON.parse(text);return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;}catch{return null;}
}
export default { async fetch(request:Request,env:LicenseWorkerEnv):Promise<Response>{
 const url=new URL(request.url); const id=crypto.randomUUID();
 if(url.pathname===LICENSE_ROUTES.health&&request.method==="GET")return success({service:"devone-license-server",apiVersion:LICENSE_API_VERSION,status:"ok"},id);
 if(!url.pathname.startsWith("/v1/"))return env.ASSETS.fetch(request);
 if(request.method!=="POST")return failure(400,"invalid_request",id);
 const data=await body(request); if(!data)return failure(400,"invalid_request",id);
 const registry=new InstallationRegistry(new D1InstallationStore(dbAdapter(env.DB)),{now:()=>new Date()});
 let result;
 if(url.pathname===LICENSE_ROUTES.register)result=await registry.register(data as never);
 else if(url.pathname===LICENSE_ROUTES.authenticate){
  result=await registry.authenticate(String(data.installationId||""),String(data.installationSecret||""));
 } else if(url.pathname===LICENSE_ROUTES.deactivate){
  result=await registry.deactivate(String(data.installationId||""),String(data.installationSecret||""));
 } else if(url.pathname===LICENSE_ROUTES.deregister){
  result=await registry.deregister(String(data.installationId||""),String(data.installationSecret||""));
 } else if(url.pathname.startsWith("/v1/installations/")&&request.method==="POST"&&url.pathname.endsWith("/metadata")){
  result=await registry.updateMetadata(String(data.installationId||""),String(data.installationSecret||""),String(data.domain||""),String(data.adminEmail||""));
 } else return failure(501,"not_implemented",id);
 return result.ok?success(result.data,id):failure(result.status,result.code,id);
}};
