import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/organise.js';
function response() { return {code:0,body:null,status(n){this.code=n;return this;},json(b){this.body=b;return this;},setHeader(){}}; }
test('proxy rejects unsigned callers before attempting Preview access',async()=>{
 const res=response(); await handler({method:'POST',headers:{},body:{}},res);assert.equal(res.code,401);
});
test('proxy forwards short-lived platform identity and user bearer only to CDVRS AI',async()=>{
 const savedFetch=globalThis.fetch;
 const platformToken = 'e30.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.test';
 process.env.CDVRS_AI_URL='https://test-preview.vercel.app';process.env.VERCEL_OIDC_TOKEN=platformToken;
 const calls=[];globalThis.fetch=async(url,options)=>{
  calls.push({url:String(url),options});
  return {status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>({summary:'Plan',actions:[]})};
 };
 try {
  const res=response();await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{message:'Plan'}},res);
  assert.equal(res.code,200);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://test-preview.vercel.app/api/planner/organise');
  assert.equal(calls[0].options.headers.Authorization,'Bearer fixture');
  assert.equal(calls[0].options.headers['x-vercel-trusted-oidc-idp-token'],platformToken);
  assert.deepEqual(res.body.actions,[]);
 } finally {globalThis.fetch=savedFetch;delete process.env.CDVRS_AI_URL;delete process.env.VERCEL_OIDC_TOKEN;}
});
