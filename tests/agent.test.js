import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/agent.js';
import { readDataLines } from '../src/lib/stream.js';
test('agent proxy rejects missing authorization before network access',async()=>{
 const res={status(n){this.code=n;return this;},json(v){this.body=v;}};await handler({method:'POST',headers:{},body:{}},res);assert.equal(res.code,401);
});
test('agent proxy forwards stream chunks immediately without buffering and keeps credentials server-side',async()=>{
 const original=globalThis.fetch;process.env.CDVRS_AI_URL='https://agent-preview.vercel.app';const chunks=[];let end=false;
 const events=['data: {"type":"delta","text":"Hello"}\n\n','data: {"type":"done","message":"Hello"}\n\n'];
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://agent-preview.vercel.app/api/planner/chat');assert.equal(options.headers.Authorization,'Bearer fixture');return {status:200,headers:new Headers({'content-type':'text/event-stream'}),body:(async function*(){yield Buffer.from(events[0]);assert.equal(chunks.length,1);yield Buffer.from(events[1]);})()};};
 const res={headersSent:false,writableEnded:false,on(){},setHeader(){},status(n){this.code=n;return this;},flushHeaders(){this.headersSent=true;},write(c){chunks.push(c.toString());},end(){end=true;this.writableEnded=true;}};
 try{await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{operation:'send'}},res);assert.equal(res.code,200);assert.deepEqual(chunks,events);assert.equal(end,true);}finally{globalThis.fetch=original;delete process.env.CDVRS_AI_URL;}
});
test('section chat stream parser preserves split UTF-8 chunks and complete events',async()=>{
 const encoded=new TextEncoder().encode('data: {"type":"delta","text":"Create 🎵"}\n\ndata: {"type":"done","message":"Done"}\n\n');let offset=0;
 const body=new ReadableStream({pull(c){if(offset===encoded.length)return c.close();c.enqueue(encoded.slice(offset,++offset));}});const items=[];for await(const line of readDataLines(body))items.push(JSON.parse(line));assert.equal(items[0].text,'Create 🎵');assert.equal(items[1].type,'done');
});
