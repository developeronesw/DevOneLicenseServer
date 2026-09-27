import { strict as assert } from "node:assert";
import { test } from "node:test";
import { D1RateLimiter } from "../src/server/rate-limit";
import type { LicenseDatabase } from "../src/server/runtime";

class Db implements LicenseDatabase {
  row = { key:"", window:0, count:0 };
  async first<T>(): Promise<T|null> { return {request_count:this.row.count} as T; }
  async all<T>(): Promise<T[]> { return []; }
  async run(_q:string,...p:unknown[]): Promise<{changes:number}> {
    const key=String(p[0]), window=Number(p[1]);
    if(this.row.key!==key || this.row.window!==window){this.row={key,window,count:1};}
    else this.row.count++;
    return {changes:1};
  }
  async batch(): Promise<void> {}
}
test("D1 rate limiter allows ten requests and blocks the eleventh in a minute",async()=>{
 const limiter=new D1RateLimiter(new Db()), now=Date.parse("2026-09-27T12:00:00.000Z");
 for(let i=0;i<10;i++)assert.equal(await limiter.allow("activation:test",now),true);
 assert.equal(await limiter.allow("activation:test",now),false);
 assert.equal(await limiter.allow("activation:test",now+60_000),true);
});
