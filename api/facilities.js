// Air Detective V4.7: same-origin serverless proxy for public OSM Overpass queries.
// No private API key, database, or location logging. Only vetted OSM categories.
const ENDPOINTS=[
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
const VALID_TAGS=/\["(?:landuse|building|highway)"="(?:construction|industrial|quarry)"\]/g;
function allowedQuery(q){
 if(typeof q!=='string'||q.length>2500||q.length<30)return false;
 if(!/^\[out:json\]\[timeout:(?:\d{1,2})\];\(.*\);out center;$/s.test(q))return false;
 if(!VALID_TAGS.test(q))return false;
 VALID_TAGS.lastIndex=0;
 const stripped=q.replace(VALID_TAGS,'').replace(/\[out:json\]\[timeout:\d{1,2}\];|nwr|around|out center|[-+0-9.,;:()\s]/g,'');
 return !stripped && !/[<>]/.test(q);
}
module.exports=async (req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Access-Control-Allow-Origin','https://air-detective.vercel.app');
 if(req.method!=='POST')return res.status(405).json({error:'POST만 허용합니다.'});
 const q=req.body?.query;
 if(!allowedQuery(q))return res.status(400).json({error:'지원되지 않는 시설 검색식입니다.'});
 const errors=[];
 for(const endpoint of ENDPOINTS){
   const controller=new AbortController();const tm=setTimeout(()=>controller.abort(),8500);
   try{
     const response=await fetch(endpoint,{
       method:'POST',body:new URLSearchParams({data:q}),signal:controller.signal,
       headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'application/json'}
     });
     if(!response.ok)throw Error('HTTP '+response.status);
     const payload=await response.json();
     if(!Array.isArray(payload.elements))throw Error('응답 형식 오류');
     res.setHeader('Cache-Control','s-maxage=90, stale-while-revalidate=300');
     return res.status(200).json({elements:payload.elements,source:new URL(endpoint).hostname});
   }catch(e){errors.push(new URL(endpoint).hostname+': '+(e.name==='AbortError'?'응답 시간 초과':e.message));}
   finally{clearTimeout(tm);}
 }
 return res.status(502).json({error:'공개 OSM 시설 서버들이 응답하지 않습니다.',details:errors});
};
