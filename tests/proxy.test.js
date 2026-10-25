import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/organise.js';
function response() { return {code:0,body:null,status(n){this.code=n;return this;},json(b){this.body=b;return this;},setHeader(){}}; }
test('proxy rejects unsigned callers before attempting Preview access',async()=>{
 const res=response(); await handler({method:'POST',headers:{},body:{}},res);assert.equal(res.code,401);
});
test('proxy establishes deployment-scoped access and forwards the user bearer only to CDVRS AI',async()=>{
 const savedFetch=globalThis.fetch;
 process.env.CDVRS_AI_URL='https://test-preview.vercel.app';process.env.CDVRS_AI_PREVIEW_BYPASS='test-share';
 const calls=[];globalThis.fetch=async(url,options)=>{
  calls.push({url:String(url),options});
  if(options.redirect==='manual')return {headers:{getSetCookie:()=>['_vercel_jwt=test-cookie; Secure; HttpOnly']}};
  return {status:200,json:async()=>({summary:'Plan',actions:[]})};
 };
 try {
  const res=response();await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{message:'Plan'}},res);
  assert.equal(res.code,200);assert.equal(calls.length,2);assert.ok(calls[0].url.includes('_vercel_share=test-share'));
  assert.equal(calls[0].options.headers,undefined);assert.equal(calls[1].options.headers.Authorization,'Bearer fixture');
  assert.equal(calls[1].options.headers.Cookie,'_vercel_jwt=test-cookie');assert.deepEqual(res.body.actions,[]);
 } finally {globalThis.fetch=savedFetch;delete process.env.CDVRS_AI_URL;delete process.env.CDVRS_AI_PREVIEW_BYPASS;}
});
