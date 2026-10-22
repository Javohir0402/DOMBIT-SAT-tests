'use strict';
// SAT Practice Platform – zero-dependency Node.js server (Node 18+)
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000;
const FILE=path.join(process.env.DATA_DIR||__dirname,'data.json');
let D={users:[],tests:[],results:[]};
try{D=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}
const hash=pw=>{const s=crypto.randomBytes(16).toString('hex');return s+':'+crypto.scryptSync(pw,s,32).toString('hex')};
const check=(pw,h)=>{const[s,x]=h.split(':');return crypto.timingSafeEqual(crypto.scryptSync(pw,s,32),Buffer.from(x,'hex'))};
const persist=()=>{fs.writeFileSync(FILE+'.tmp',JSON.stringify(D));fs.renameSync(FILE+'.tmp',FILE)};
const SEED=JSON.parse(fs.readFileSync(path.join(__dirname,'seed-test.json'),'utf8'));
if(!D.users.length){
 for(const[id,role]of[['admin','admin'],['s1','student'],['e1','examinee']])D.users.push({uid:crypto.randomUUID(),id,role,h:hash('1')});
 if(!D.tests.length)D.tests.push(SEED);
 console.log('First run: created accounts admin / s1 / e1 (password 1) and a sample mock test (password 1). Change the passwords in Accounts.')}
else if(!D.users.some(u=>u.role==='admin')){D.users.push({uid:crypto.randomUUID(),id:'admin',role:'admin',h:hash('1')});console.log('No admin found: created admin / 1')}
persist();
const sess=new Map(),fails=new Map();
const send=(res,c,o)=>{res.writeHead(c,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(o))};
const readBody=req=>new Promise((yes,no)=>{let n=0;const b=[];req.on('data',c=>{n+=c.length;if(n>60e6){no('big');req.destroy()}else b.push(c)});req.on('end',()=>{try{yes(JSON.parse(Buffer.concat(b).toString()||'{}'))}catch(e){no('bad')}})});
const auth=req=>{const u=sess.get(req.headers['x-token']);return u&&D.users.find(x=>x.uid===u)};
const norm=s=>String(s).replace(/\s/g,'').toLowerCase();
const mod=(t,q)=>Math.min(q.mod||1,t.mods||1);
const order=t=>{const o=[];for(const c of['english','math'])for(const m of[1,2])o.push(...t.qs.filter(q=>q.sec===c&&mod(t,q)===m));return o};
const strip=q=>{const{ans,...r}=q;return r};
const correct=(q,a)=>q.type==='mc'?a===q.ans:a!=null&&Array.isArray(q.ans)&&q.ans.some(x=>norm(x)===norm(a));
http.createServer(async(req,res)=>{try{
 const url=req.url.split('?')[0];
 if(req.method==='GET'){
  if(url==='/'||url==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  if(url==='/api/ping')return send(res,200,{ok:1});
  res.writeHead(404);return res.end()}
 if(req.method!=='POST'){res.writeHead(405);return res.end()}
 const b=await readBody(req);
 if(url==='/api/login'){
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();
  const f=fails.get(ip)||{n:0,t:0};if(Date.now()-f.t>600000)f.n=0;if(f.n>=10)return send(res,429,{error:'locked'});
  const u=D.users.find(x=>x.id.toLowerCase()===String(b.id||'').trim().toLowerCase());
  if(!u||!check(String(b.pw||'').trim(),u.h)){f.n++;f.t=Date.now();fails.set(ip,f);return send(res,401,{error:'login'})}
  fails.delete(ip);const tok=crypto.randomBytes(24).toString('hex');sess.set(tok,u.uid);
  return send(res,200,{token:tok,user:{id:u.id,role:u.role,uid:u.uid}})}
 const me=auth(req);if(!me)return send(res,401,{error:'auth'});
 if(url==='/api/state'){
  if(me.role==='admin')return send(res,200,{users:D.users.map(u=>({uid:u.uid,id:u.id,role:u.role,pw:''})),tests:D.tests,results:D.results});
  return send(res,200,{users:[],tests:D.tests.map(t=>({id:t.id,title:t.title,type:t.type,qs:new Array(t.qs.length).fill(0)})),results:me.role==='student'?D.results.filter(r=>r.uid===me.uid):[]})}
 if(url==='/api/admin/save'){
  if(me.role!=='admin')return send(res,403,{error:'forbidden'});
  if(!Array.isArray(b.users)||!Array.isArray(b.tests))return send(res,400,{error:'bad data'});
  const out=[],seen=new Set();
  for(const u of b.users){const id=String(u.id||'').trim();
   if(!id||!u.uid||!['admin','student','examinee'].includes(u.role)||seen.has(id.toLowerCase()))return send(res,400,{error:'invalid accounts'});
   seen.add(id.toLowerCase());const old=D.users.find(x=>x.uid===u.uid);let h=old&&old.h;if(u.pw)h=hash(String(u.pw));
   if(!h)return send(res,400,{error:'password required'});out.push({uid:u.uid,id,role:u.role,h})}
  const self=out.find(u=>u.uid===me.uid);if(!self||self.role!=='admin')return send(res,400,{error:'you must stay an admin'});
  D.users=out;D.tests=b.tests;persist();return send(res,200,{ok:1})}
 if(url==='/api/start'){
  const t=D.tests.find(x=>x.id===b.id);if(!t)return send(res,404,{error:'none'});
  if(String(b.pw||'')!==t.pw)return send(res,403,{error:'pw'});if(!t.qs.length)return send(res,400,{error:'empty'});
  return send(res,200,{t:{id:t.id,title:t.title,type:t.type,mods:t.mods||1,tEn:t.tEn||0,tMa:t.tMa||0,ref:t.ref||'',refImg:t.refImg||''},qs:order(t).map(strip)})}
 if(url==='/api/submit'){
  const t=D.tests.find(x=>x.id===b.id);if(!t)return send(res,404,{error:'none'});
  const qs=order(t),mk=String(b.mk||''),sec=mk.slice(0,-1),m=+mk.slice(-1),a=b.a||{};
  const idx=qs.map((q,k)=>k).filter(k=>qs[k].sec===sec&&mod(t,qs[k])===m);if(!idx.length)return send(res,400,{error:'module'});
  const aid=String(b.aid||'').slice(0,40);if(!aid)return send(res,400,{error:'attempt'});
  let r=D.results.find(x=>x.aid===aid&&x.uid===me.uid);
  if(r&&r.done.includes(mk))return send(res,409,{error:'done'});
  if(m===2&&qs.some(q=>q.sec===sec&&mod(t,q)===1)&&!(r&&r.done.includes(sec+'1')))return send(res,409,{error:'order'});
  if(!r){r={aid,uid:me.uid,u:me.id,role:me.role,t:t.title,e:'—',m:'—',v:0,d:Date.now(),items:[],mm:[],done:[]};D.results.push(r)}
  let c=0;
  idx.forEach(k=>{const q=qs[k],x=a[k],g=x==null||x===''?null:(typeof x==='string'?x.slice(0,200):x),o=g!=null&&correct(q,g);if(o)c++;r.items.push({sec,mod:m,type:q.type,g,c:q.type==='mc'?q.ans:q.ans.join(' ; '),ok:o,n:k})});
  r.mm.push({sec,mod:m,c,n:idx.length});r.done.push(mk);r.v=Math.max(r.v,+b.v||0);
  ['english','math'].forEach((sc,i)=>{const tk=r.mm.filter(z=>z.sec===sc);if(tk.length)r[i?'m':'e']=tk.reduce((s,z)=>s+z.c,0)+'/'+tk.reduce((s,z)=>s+z.n,0)});
  persist();return send(res,200,{ok:1})}
 send(res,404,{error:'unknown'});
}catch(e){try{send(res,500,{error:String(e)})}catch(_){}}}).listen(PORT,()=>console.log('SAT platform running on http://localhost:'+PORT));
