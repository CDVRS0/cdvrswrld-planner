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
test('approved handoff uses the dedicated AI endpoint and returns a conversation link without the bypass',async()=>{
 const savedFetch=globalThis.fetch;
 process.env.CDVRS_AI_URL='https://handoff-preview.vercel.app';
 const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return {status:200,ok:true,json:async()=>({conversationId:'89eafdc7-082d-47ea-a235-d105db372128'})};};
 try {
  const res=response();await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{operation:'handoff',approved:true,text:'Selected context'}},res);
  assert.equal(calls[0].url,'https://handoff-preview.vercel.app/api/planner/handoff');assert.equal(JSON.parse(calls[0].options.body).text,'Selected context');
  assert.equal(res.body.url,'https://handoff-preview.vercel.app/?conversation=89eafdc7-082d-47ea-a235-d105db372128');assert.ok(!res.body.url.includes('_vercel_share'));
 } finally {globalThis.fetch=savedFetch;delete process.env.CDVRS_AI_URL;}
});
