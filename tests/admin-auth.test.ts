import test from "node:test";
import assert from "node:assert/strict";
import { AdminAuth } from "../src/server/admin-auth";

class Db {
  row: any = null;
  async first<T>(q:string,...p:unknown[]):Promise<T|null>{
    if(q.includes("COUNT(*)")) return {count:this.row?1:0} as T;
    if(q.includes("WHERE username")) return this.row && this.row.username.toLowerCase()===String(p[0]).toLowerCase()?this.row:null;
    return null;
  }
  async run(q:string,...p:unknown[]){ if(q.startsWith("INSERT")){this.row={admin_id:p[0],username:p[1],email:p[2],password_salt:p[3],password_verifier:p[4],created_at:p[5]};return {changes:1};} return {changes:0};}
}
class Kv {
  data=new Map<string,string>();
  async get(k:string){return this.data.get(k)??null}
  async put(k:string,v:string){this.data.set(k,v)}
  async delete(k:string){this.data.delete(k)}
}
test("admin setup creates an account and login session", async()=>{
  const auth=new AdminAuth(new Db() as any,new Kv() as any);
  const result=await auth.setup({username:"admin",email:"admin@example.com",password:"correct horse battery staple",confirm:""});
  assert.equal(result.ok,true);
  assert.ok(result.cookie?.includes("HttpOnly"));
  const status=await auth.configured(); assert.equal(status,true);
});
test("admin setup is one-time", async()=>{
  const db=new Db(); const kv=new Kv(); const auth=new AdminAuth(db as any,kv as any);
  await auth.setup({username:"admin",email:"admin@example.com",password:"correct horse battery staple"});
  const second=await auth.setup({username:"other",email:"other@example.com",password:"another correct password"});
  assert.equal(second.ok,false); if(!second.ok) assert.equal(second.code,"admin_already_configured");
});
