import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT)||3000;
const DB=path.join(__dirname,'reports.json');
const supabaseUrl=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const supabaseKey=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const hasDatabase=Boolean(supabaseUrl&&supabaseKey);
const isServerless=Boolean(process.env.VERCEL);
app.disable('x-powered-by');
app.use(express.json({limit:'8mb'}));
app.use(express.static(__dirname,{extensions:['html']}));
const blocked=(message,status=400)=>Object.assign(new Error(message),{status});
const str=(x,max)=>String(x??'').trim().slice(0,max);
const coords=(lat,lon)=>Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))&&Math.abs(Number(lat))<=90&&Math.abs(Number(lon))<=180;
async function supabaseRequest(route,options={}){const response=await fetch(`${supabaseUrl}/rest/v1/${route}`,{...options,headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`,'Content-Type':'application/json',...(options.headers||{})}});if(!response.ok)throw blocked('데이터베이스 오류: 설정 및 reports 테이블을 확인하세요.',502);if(response.status===204)return null;return response.json();}
async function readReports(){if(hasDatabase){const rows=await supabaseRequest('reports?select=id,location,type,description,lat,lon,created_at&order=created_at.desc&limit=500');return rows.map(r=>({...r,createdAt:r.created_at}));}if(isServerless)throw blocked('공유 제보 기능을 사용하려면 Supabase 환경변수를 설정하세요.',503);try{const data=JSON.parse(await fs.readFile(DB,'utf8'));return Array.isArray(data)?data:[];}catch(e){if(e.code==='ENOENT')return [];throw e;}}
let writeQueue=Promise.resolve();
function enqueueWrite(fn){const next=writeQueue.then(fn);writeQueue=next.catch(()=>{});return next;}
const traffic=new Map();
function rateLimit(windowMs,max){return(req,res,next)=>{const key=req.ip||'unknown',now=Date.now();const value=traffic.get(key)||{t:now,n:0};if(now-value.t>windowMs){value.t=now;value.n=0;}value.n++;traffic.set(key,value);if(value.n>max)return res.status(429).json({error:'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'});next();};}
app.get('/api/health',(req,res)=>res.json({ok:true,analysisMode:'free-rules',reportsReady:hasDatabase||!isServerless}));
app.get('/api/reports',async(req,res,next)=>{try{const list=await readReports();res.json(list.slice(-500).reverse());}catch(e){next(e);}});
app.post('/api/reports',rateLimit(60*60*1000,15),async(req,res,next)=>{try{const b=req.body;if(b?.consent!==true)throw blocked('공개 지도 공유 동의가 필요합니다.');const location=str(b.location,300),type=str(b.type,80),description=str(b.description,1500);if(!location||!type||description.length<5||!coords(b.lat,b.lon))throw blocked('제보 내용을 확인해 주세요.');const report={id:crypto.randomUUID(),location,type,description,lat:Math.round(Number(b.lat)*1000)/1000,lon:Math.round(Number(b.lon)*1000)/1000,createdAt:new Date().toISOString()};if(hasDatabase){await supabaseRequest('reports',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:report.id,location:report.location,type:report.type,description:report.description,lat:report.lat,lon:report.lon,created_at:report.createdAt})});}else if(isServerless){throw blocked('공유 제보 기능을 사용하려면 Supabase를 설정해야 합니다.',503);}else{await enqueueWrite(async()=>{const list=await readReports();list.push(report);await fs.writeFile(DB,JSON.stringify(list.slice(-500),null,2),'utf8');});}res.status(201).json({ok:true,id:report.id});}catch(e){next(e);}});
const geocodeCache=new Map();let lastGeocode=0;let geocodeQueue=Promise.resolve();
app.get('/api/geocode',rateLimit(60*1000,20),async(req,res,next)=>{try{const q=str(req.query.q,150);if(q.length<2)throw blocked('검색어를 두 글자 이상 입력해 주세요.');if(geocodeCache.has(q))return res.json(geocodeCache.get(q));const task=geocodeQueue.then(async()=>{const delta=Date.now()-lastGeocode;if(delta<1100)await new Promise(resolve=>setTimeout(resolve,1100-delta));lastGeocode=Date.now();const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('q',q);u.searchParams.set('format','json');u.searchParams.set('limit','5');u.searchParams.set('accept-language','ko');const response=await fetch(u,{headers:{'User-Agent':'AirDetective-EducationalProject/1.0 (contact: '+(process.env.CONTACT_EMAIL||'admin@example.org')+')','Accept':'application/json'}});if(!response.ok)throw blocked('주소 검색 서비스가 응답하지 않습니다.',502);const rows=await response.json();return rows.map(r=>({name:str(r.display_name,260),lat:Number(r.lat),lon:Number(r.lon)}));});geocodeQueue=task.catch(()=>{});const results=await task;geocodeCache.set(q,results);if(geocodeCache.size>120)geocodeCache.delete(geocodeCache.keys().next().value);res.json(results);}catch(e){next(e);}});
app.use((err,req,res,next)=>{console.error('API error:',err.message);res.status(err.status||500).json({error:err.status?err.message:'서버 오류가 발생했습니다. 다시 시도해 주세요.'});});
if(!isServerless)app.listen(PORT,()=>console.log(`Air Detective: http://localhost:${PORT} | 무료 분석: 브라우저`));
export default app;
