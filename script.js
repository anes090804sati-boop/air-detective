'use strict';
// Air Detective V4. No paid APIs, no personal-data storage, no automatic complaint submissions.
const $ = (id) => document.getElementById(id);
const KOREA = { minLat: 33.0, maxLat: 39.0, minLon: 124.5, maxLon: 132.0 };
const TYPE_LABEL = {construction:'공사장·토사 비산먼지',road:'도로 재비산먼지',vehicle:'화물차·차량 먼지',demolition:'철거·절단 작업',unknown:'원인 불명'};
const CLASS_LABEL = {construction:'공사 표기 구역',industrial:'공업·산업 관련 시설',quarry:'채석장'};
const COLOR = {construction:'#ba8450',industrial:'#6a7f79',quarry:'#b4a264'};
const PHOTO_LABELS = [
  ['a dusty construction site with excavators and soil','공사장·굴착·토사 작업 장면'],
  ['a large dump truck carrying soil on a road','덤프트럭·토사 운반 장면'],
  ['a dusty unpaved road with passing vehicles','먼지가 있는 도로·차량 장면'],
  ['a building being demolished with rubble','철거·잔해 장면'],
  ['an industrial factory with smokestacks','산업·공장 관련 장면'],
  ['a clear clean urban street','일반 도로·도심 장면'],
  ['a garden with plants and trees','식물·녹지 장면'],
  ['a pile of sand or gravel on the ground','모래·자갈 적치 장면']
];
const state = {loc:{lat:37.5665,lon:126.9780,name:'서울특별시청 근처 (초기 위치)'},weather:null,photoURL:null,photo:null,photoResult:null,nearby:[],analysis:null,map:null,mapLayers:[],mapFeatures:[],mapFeatureGroup:null,mapViewportCache:new Map(),mapLastKey:'',mapRequest:null,mapDataSource:'',mapLastFetchInfo:'',userGeo:null,userMarker:null,nearestMarker:null,nearestLine:null,nearestFound:null,nearestSearchId:0};
let toastHandle, mapMoveHandle, classifierPromise;
function notify(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastHandle);toastHandle=setTimeout(()=>t.classList.remove('show'),4200);}
function kmLabel(m){return m<1000?`약 ${Math.round(m/10)*10}m`:`약 ${(m/1000).toFixed(1)}km`;}
function dist(a,b){const r=6371000,toRad=n=>n*Math.PI/180,dlat=toRad(b.lat-a.lat),dlon=toRad(b.lon-a.lon),h=Math.sin(dlat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dlon/2)**2;return 2*r*Math.asin(Math.sqrt(h));}
function inKorea(p){return p.lat>KOREA.minLat&&p.lat<KOREA.maxLat&&p.lon>KOREA.minLon&&p.lon<KOREA.maxLon;}
function windName(deg){if(!Number.isFinite(deg))return '--';return ['북','북동','동','남동','남','남서','서','북서'][Math.round(deg/45)%8]+'풍';}
function normalize(s){return String(s||'').trim().replace(/\s+/g,' ');}
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
function setBusy(status){$('formStatus').textContent=status||'';}
async function fetchJSON(url,limit=13000,options={}){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),limit);try{const response=await fetch(url,{...options,signal:controller.signal});if(!response.ok)throw Error(`서버 응답 ${response.status}`);return await response.json();}finally{clearTimeout(timeout);}}
async function geocode(query){const url=`https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=kr&q=${encodeURIComponent(query)}`;const rows=await fetchJSON(url);const row=rows?.[0];if(!row)throw Error('국내 검색 결과를 찾지 못했습니다.');return {lat:+row.lat,lon:+row.lon,name:row.display_name.split(',').slice(0,3).join(',')};}
async function reverseGeocode(p){try{const u=`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.lat}&lon=${p.lon}&zoom=16`;const r=await fetchJSON(u,8500);return r.display_name?.split(',').slice(0,3).join(',')||'현재 위치';}catch{return '현재 위치';}}
async function changeLocation(loc,moveMap=false){if(!inKorea(loc)){notify('대한민국 내 위치만 지원합니다.');return;}state.loc=loc;$('locationName').textContent=`⌖ ${loc.name}`;$('coordinateHint').textContent=`분석 기준 좌표: ${loc.lat.toFixed(5)}, ${loc.lon.toFixed(5)}`;await fetchWeather();if(moveMap&&state.map){state.map.setView([loc.lat,loc.lon],14);}}
async function fetchWeather(){const {lat,lon}=state.loc;try{const [aq,met]=await Promise.all([
fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`),
fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,precipitation&timezone=Asia%2FSeoul`)
]);const c=aq.current||{},w=met.current||{};state.weather={pm10:c.pm10,pm25:c.pm2_5,wind:w.wind_speed_10m,dir:w.wind_direction_10m,rain:w.precipitation};$('pm10').textContent=fmt(c.pm10);$('pm25').textContent=fmt(c.pm2_5);$('windSpeed').textContent=fmt(w.wind_speed_10m);$('windDirection').textContent=windName(w.wind_direction_10m);$('rain').textContent=`강수 ${fmt(w.precipitation)} mm`;$('updatedAt').textContent=`조회 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
}catch(e){state.weather=null;['pm10','pm25','windSpeed','windDirection'].forEach(id=>$(id).textContent='--');$('rain').textContent='강수 -- mm';$('updatedAt').textContent='날씨 정보 조회 실패';notify('환경 데이터를 가져오지 못했습니다. 인터넷 연결을 확인해 주세요.');}}
function fmt(v){return typeof v==='number'?v.toFixed(1):'--';}
function mapFeature(elem){const t=elem.tags||{},p=elem.type==='node'?{lat:elem.lat,lon:elem.lon}:elem.center;if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||!inKorea(p))return null;let cat='';if(t.landuse==='construction'||t.building==='construction'||t.highway==='construction'||t.construction)cat='construction';else if(t.landuse==='quarry'||t.industrial==='quarry')cat='quarry';else if(t.landuse==='industrial'||t.industrial)cat='industrial';else return null;const name=t.name||t['name:ko']||((t.description||'').slice(0,55))||`${CLASS_LABEL[cat]} (이름 미등록)`;return {id:`${elem.type}-${elem.id}`,lat:p.lat,lon:p.lon,name,cat,tags:t};}
// Facility data is generated from the official Geofabrik South Korea OSM extract
// by a GitHub Action and committed as one static file. No Overpass requests in browsers.
// Records may be stale or incomplete; they do NOT prove active construction or air pollution.
let facilityDatasetPromise = null;
async function loadFacilityDataset(force=false){
  if(force)facilityDatasetPromise=null;
  if(!facilityDatasetPromise){
    facilityDatasetPromise=(async()=>{
      const response=await fetch('/data/facilities.json'+(force?'?v='+Date.now():''),{cache:force?'reload':'default'});
      if(!response.ok)throw Error(`저장된 시설 자료를 가져오지 못했어요 (HTTP ${response.status}).`);
      const data=await response.json();
      if(data.status!=='ready'||!Array.isArray(data.features))throw Error('전국 시설 데이터가 아직 생성되지 않았어요. GitHub Actions의 「Build facility snapshot」을 한 번 실행해야 합니다.');
      const features=data.features.filter(f=>f&&Number.isFinite(f.lat)&&Number.isFinite(f.lon)&&inKorea(f)&&CLASS_LABEL[f.cat]);
      state.facilityData=features;
      state.mapDataSource='GitHub에 저장된 국내 OSM 시설 스냅샷';
      state.mapLastFetchInfo=`원본 ${features.length.toLocaleString('ko-KR')}개 · ${data.generated_at||'생성일 미확인'}`;
      return features;
    })().catch(err=>{facilityDatasetPromise=null;throw err;});
  }
  return facilityDatasetPromise;
}
async function nearbyPlaces(p){
  const all=await loadFacilityDataset();
  return all.filter(f=>Math.abs(f.lat-p.lat)<.015&&Math.abs(f.lon-p.lon)<.018)
    .map(f=>({...f,distance:dist(p,f)})).filter(f=>f.distance<=1300)
    .sort((a,b)=>a.distance-b.distance).slice(0,7);
}
function getSiteGeopoint(){return state.loc;}
async function resolveSiteLocation(){const entered=normalize($('siteLocation').value);if(!entered)return state.loc;const same=entered===state.loc.name||entered===state.loc.name.split(',')[0]||entered==='현재 조회 위치';if(same)return state.loc;try{const loc=await geocode(entered);return loc;}catch{return null;}}
function getPhotoFile(){return $('photoInput').files?.[0]||null;}
async function runPhotoModel(file,onProgress){if(!file)return null;onProgress('무료 사진 인식 모델을 불러오는 중… (처음에는 수십~수백 MB 다운로드 가능)');if(!classifierPromise){classifierPromise=import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm').then(m=>m.pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{device:'wasm'}));}const classifier=await classifierPromise;onProgress('사진 속 장면을 비교하는 중…');const inputURL=URL.createObjectURL(file);try{const labels=PHOTO_LABELS.map(pair=>pair[0]);const res=await classifier(inputURL,labels);const top=[...res].sort((a,b)=>b.score-a.score).slice(0,3);return top.map(x=>({label:PHOTO_LABELS.find(p=>p[0]===x.label)?.[1]||x.label,score:x.score}));}finally{URL.revokeObjectURL(inputURL);}}
function element(id,text){$(id).textContent=text;}
function writeList(id,arr){const list=$(id);list.replaceChildren();for(const s of arr){const li=document.createElement('li');li.textContent=s;list.appendChild(li);}}
function reportFor(p,nearby,photo){const type=$('dustType').value,description=normalize($('description').value),w=state.weather,place=normalize($('siteLocation').value),source=nearby[0];const wtext=w&&Number.isFinite(w.wind)?`주변 풍속은 약 ${w.wind.toFixed(1)}km/h(${windName(w.dir)})로 나타났습니다. `:'현재 기상자료가 없어 바람의 영향을 따로 확인하지 못했습니다. ';
const photoSentence=photo?.length?`첨부 사진에서 '${photo[0].label}' 장면과 비교적 유사한 시각적 특징을 보였습니다. 이는 사진 분류 모델의 추정이며 실제 상황 확정은 아닙니다. `:getPhotoFile()?`사진은 첨부됐지만 자동 인식 결과를 확보하지 못해 설명 중심으로 분석했습니다. `:'';
const situation=`제보하신 '${place}' 부근에서 '${description.slice(0,180)}'라는 피해가 관찰되었다고 입력하셨습니다. ${TYPE_LABEL[type]} 관련 활동이 먼지 발생에 영향을 주었을 가능성이 있습니다. ${photoSentence}${source?`공개 지도에는 기준 위치에서 ${kmLabel(source.distance)} 떨어진 곳에 '${source.name}'이(가) ${CLASS_LABEL[source.cat]}으로 등록되어 있습니다. 다만 현재 운영·공사 진행 및 원인 여부는 확인되지 않았습니다.`:'주변 시설 정보가 확인되지 않았거나 위치를 정확히 연결하지 못했습니다. 이는 주변에 공사장이 없다는 뜻이 아닙니다.'}`;
const baseCauses={construction:['굴착·토사 운반·자재 적치 과정에서 흙먼지가 발생할 수 있습니다.','방진막, 살수 및 차량 세륜 조치가 충분하지 않으면 먼지 비산이 커질 수 있습니다.'],road:['도로 표면에 쌓인 먼지가 차량 주행이나 바람에 다시 떠오를 수 있습니다.','도로 청소·살수 상태와 주변 공사 차량 운행 등이 영향을 줄 수 있습니다.'],vehicle:['덤프트럭 등 대형 차량의 이동 과정에서 흙먼지 재비산이 생길 수 있습니다.','적재물 관리·세륜 여부, 도로 상태를 확인할 필요가 있습니다.'],demolition:['철거 및 절단 과정에서 분진이 생길 수 있습니다.','잔재물 적치·운반, 살수 및 가림막 설치 상황이 영향을 줄 수 있습니다.'],unknown:['공사·철거·차량 통행·적치물 등 여러 먼지 발생원을 함께 점검할 필요가 있습니다.','먼지 발생 시간과 바람 방향, 실제 작업 모습을 비교하는 것이 도움이 됩니다.']}[type];const causes=[...baseCauses];if(source)causes.push(`주변 등록 시설 '${source.name}' (${kmLabel(source.distance)})은 추가 확인할 후보지입니다. 등록 정보만으로 오염원으로 단정할 수 없습니다.`);causes.push(`${wtext} 건조하거나 바람이 강하면 재비산이 쉬울 수 있지만, 실제 확산 방향은 지형과 건물의 영향을 받습니다.`);
const summary=`현재 입력 내용에 비추어 볼 때 '${TYPE_LABEL[type]}'과(와) 관련된 먼지 발생 가능성을 우선 검토할 수 있습니다. ${source?`주변 ${CLASS_LABEL[source.cat]} 등록 지점도 참고 후보로 볼 수 있으나, 피해와 인과관계는 확인되지 않았습니다. `:''}${wtext}지역 PM10 모델값 ${w?.pm10!=null?w.pm10.toFixed(1)+'µg/m³':'미확인'}은 지역 참고값일 뿐 해당 현장의 직접 측정값이 아닙니다. 사진 인식과 위치 정보만으로 배출 주체, 농도, 법규 위반을 판단할 수 없습니다.`;
const actions=['안전한 장소에서 먼지 발생 날짜·시각·장소, 반복 횟수와 작업 모습을 기록하세요.','노출이 심한 시간에는 먼지 발생 지점에서 거리를 두고, 필요하다면 창문을 닫고 다른 경로를 이용하세요.','관할 지자체에 살수·방진막·세륜·도로 청소 등 저감 조치의 현장 점검을 요청하세요.','사진과 피해 설명을 확인하여 적합한 공식 민원 채널로 직접 접수하세요.'];return{type,place,description,situation,causes,summary,actions,nearby,photo,p};}
function showReport(r){$('analysisEmpty').hidden=true;$('analysisResult').hidden=false;element('analysisTime',new Date().toLocaleString('ko-KR'));element('situationText',r.situation);const nearby=$('nearbyBrief');nearby.replaceChildren();const title=document.createElement('strong');title.textContent=r.nearby.length?'주변 공개 지도 등록 시설 (거리순)':'주변 시설 조회 결과';nearby.append(title);if(r.nearby.length){for(const f of r.nearby.slice(0,4)){const p=document.createElement('p');p.textContent=`· ${kmLabel(f.distance)} / ${f.name} / ${CLASS_LABEL[f.cat]}`;nearby.appendChild(p);}}else{const p=document.createElement('p');p.textContent='표시할 공개 시설 정보 없음 · 조회가 누락되었을 수 있습니다.';nearby.appendChild(p);}writeList('causeList',r.causes);element('summaryText',r.summary);element('imageFinding',r.photo?.length?`사진 인식 결과(유사도 참고): ${r.photo.map(x=>`${x.label} ${Math.round(x.score*100)}%`).join(' / ')}. 서로 비교한 후보 장면 안에서의 점수이며 먼지 농도나 확률을 의미하지 않습니다.`:getPhotoFile()?'사진 인식 결과 없음: 다운로드 실패 또는 사용자가 사진 인식을 선택하지 않았습니다.':'사진이 첨부되지 않아 사진 분석은 수행하지 않았습니다.');writeList('actionList',r.actions);}
// 민원 접수처에 제출할 문장: 보고서의 추론·모델 유사도·추정 시설명은 복제하지 않음.
function draftFor(r){
  const site=r.place||'정확한 피해 장소를 기재해 주세요';
  const description=r.description||'발생한 피해 상황을 구체적으로 입력해 주세요';
  const subject=`${site} 일대 비산먼지로 인한 생활불편 및 현장 점검 요청`;
  const hasPhoto=Boolean(getPhotoFile());
  return `제목: ${subject}

안녕하세요.
${site} 인근에서 발생하는 먼지로 인해 생활상 불편을 겪고 있어 관련 현장의 확인과 개선 조치를 요청드립니다.

1. 민원 발생 장소
${site}

2. 발생 상황 및 피해 내용
${description}

위 내용은 제가 직접 겪었거나 목격한 상황을 바탕으로 작성한 것으로, 먼지의 정확한 발생원과 원인에 대해서는 관계 기관의 확인이 필요합니다.

3. 요청 사항
가. 해당 장소 및 주변의 먼지 발생 상황을 현장 확인해 주시기 바랍니다.
나. 공사장 토사 취급, 차량 이동, 도로 먼지 등 관련 요인을 검토하고 필요한 경우 살수, 방진, 세륜 및 도로 청소 등 적절한 저감 조치를 안내·점검해 주시기 바랍니다.
다. 점검 결과와 실시 예정이거나 완료된 조치, 추가 조치 가능 여부를 회신해 주시기 바랍니다.

4. 첨부 및 추가 확인 사항
${hasPhoto?'현장 사진을 보유하고 있으며 접수 시 별도로 첨부할 예정입니다.':'현장 사진 및 발생 시각 등 추가 증빙은 확인 후 보완할 수 있습니다.'}
발생 일시: [날짜·시간을 직접 입력]
신청인: [성명 또는 접수 시스템의 신청인 정보]

주민의 생활환경 개선을 위한 검토를 부탁드립니다. 감사합니다.

※ 접수 전 장소·일시·피해 내용을 확인하고 필요에 따라 수정해 주세요. 본 문서는 자동 작성된 초안이며 민원을 자동 제출하지 않습니다.`;
}
function recommend(r){let best='epeople',reason='현장 확인과 개선 조치를 공식적으로 요청하는 일반 민원에 적합해요.';const seoul=/서울|강남|강북|강동|강서|관악|광진|구로|금천|노원|도봉|동대문|동작|마포|서대문|서초|성동|성북|송파|양천|영등포|용산|은평|종로|중구|중랑/.test(r.place)||r.p&&(r.p.lat>37.40&&r.p.lat<37.72&&r.p.lon>126.76&&r.p.lon<127.23);if(seoul){best='seoul';reason='제보 위치가 서울권으로 확인되어 서울시의 공식 생활불편 접수 창구를 우선 추천해요.';}else if(['construction','demolition','road','vehicle'].includes(r.type)){best='safety';reason='공사·도로 등 현장 위험 또는 환경 관련 신고에 적합할 수 있어 안전신문고를 우선 추천해요.';}document.querySelectorAll('.channel').forEach(x=>x.classList.toggle('recommended',x.dataset.channel===best));$('recommendMessage').textContent=`✦ 추천: ${$('channelList').querySelector(`[data-channel="${best}"] b`).textContent} — ${reason}`;$('recommendMessage').classList.add('active');}
let analysisInProgress = false;
function setAnalysisStage(number, message){
  const msg=$('analysisLoadingText');
  msg.textContent=message;
  for(let n=1;n<=3;n++){
    const stage=$(`loaderStage${n}`);
    stage.classList.toggle('stage-current',n===number);
    stage.classList.toggle('stage-done',n<number);
  }
  setBusy(message);
}
function showAnalysisLoading(){
  $('analysisEmpty').hidden=true;
  $('analysisResult').hidden=true;
  $('analysisResult').classList.remove('report-reveal');
  $('analysisLoading').hidden=false;
  $('draftText').value='';
  state.analysis=null;
  $('recommendMessage').classList.remove('active');
  $('recommendMessage').textContent='새 분석이 완료되면 적합한 접수처 한 곳을 추천해 드려요.';
  document.querySelectorAll('.channel').forEach(el=>el.classList.remove('recommended'));
  $('analyzeButton').disabled=true;
  $('analyzeButton').textContent='✳ 분석 진행 중…';
  $('reportForm').setAttribute('aria-busy','true');
  setAnalysisStage(1,'피해 위치와 주변 환경을 확인하고 있어요…');
  $('analysisLoading').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function finishAnalysisLoading(){
  $('analysisLoading').hidden=true;
  $('reportForm').removeAttribute('aria-busy');
  $('analyzeButton').disabled=false;
  $('analyzeButton').innerHTML='✳ 현장 분석 시작하기 <span>↗</span>';
  analysisInProgress=false;
}
async function analyze(e){
  e.preventDefault();
  if(analysisInProgress)return;
  if(!$('reportForm').checkValidity()){$('reportForm').reportValidity();return;}
  analysisInProgress=true;
  showAnalysisLoading();
  let p=null,nearby=[],photo=null;
  try{
    p=await resolveSiteLocation();
    setAnalysisStage(2,'주변 공사 구역과 산업시설 등록 정보를 조회하고 있어요…');
    if(p){
      try{nearby=await nearbyPlaces(p);}
      catch(ex){setAnalysisStage(2,'시설 정보를 가져오지 못했어요. 입력 내용으로 계속 분석할게요…');}
    }else{setAnalysisStage(2,'좌표를 확인하지 못했어요. 위치별 거리 정보 없이 분석할게요…');}
    if($('photoConsent').checked&&getPhotoFile()){
      try{photo=await runPhotoModel(getPhotoFile(),message=>setAnalysisStage(2,message));}
      catch(err){console.warn('무료 이미지 모델 사용 불가:',err);setAnalysisStage(2,'사진 인식은 건너뛰고 설명으로 분석하고 있어요…');}
    }
    setAnalysisStage(3,'현장 상황과 대응 방법을 보고서로 정리하고 있어요…');
    // Let the progress screen paint before replacing it with the complete report.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const r=reportFor(p,nearby,photo);
    state.analysis=r;
    showReport(r);
    $('draftText').value=draftFor(r);
    recommend(r);
    finishAnalysisLoading();
    $('analysisResult').classList.add('report-reveal');
    setBusy('분석 완료 · 민원 초안과 추천 접수처를 확인하세요.');
    notify('현장 분석 리포트가 완성됐어요.');
    $('analysisResult').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    finishAnalysisLoading();
    $('analysisEmpty').hidden=false;
    setBusy(`분석 오류: ${err.message}`);
    notify('분석 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}
function usePhoto(file){if(!file)return;if(!file.type.startsWith('image/')||file.size>6*1024*1024){notify('JPG, PNG, WEBP 형식의 6MB 이하 이미지를 선택해 주세요.');$('photoInput').value='';return;}if(state.photoURL)URL.revokeObjectURL(state.photoURL);state.photoURL=URL.createObjectURL(file);$('photoPreview').src=state.photoURL;$('photoPreview').hidden=false;$('removePhoto').hidden=false;}
function clearPhoto(){if(state.photoURL)URL.revokeObjectURL(state.photoURL);state.photoURL=null;$('photoInput').value='';$('photoPreview').hidden=true;$('removePhoto').hidden=true;}
function getGeo(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('위치 지원 안 함'));navigator.geolocation.getCurrentPosition(pos=>resolve({lat:pos.coords.latitude,lon:pos.coords.longitude}),reject,{enableHighAccuracy:false,timeout:13000,maximumAge:300000});});}
async function locate(){
  try{
    notify('브라우저에서 위치 사용을 허용해 주세요.');
    const p=await getGeo();if(!inKorea(p))throw Error('대한민국 외 지역입니다.');
    state.userGeo={lat:p.lat,lon:p.lon};
    drawUserMarker();
    p.name=await reverseGeocode(p);
    await changeLocation(p,true);
    notify('내 위치를 지도에 표시했어요.');
    return p;
  }catch(e){notify('현재 위치를 확인하지 못했어요. 위치 권한·HTTPS 연결을 확인해 주세요.');return null;}
}
function drawUserMarker(){
  if(!state.map||!state.userGeo)return;
  const p=state.userGeo;
  if(state.userMarker)state.map.removeLayer(state.userMarker);
  state.userMarker=L.marker([p.lat,p.lon],{zIndexOffset:1500,icon:L.divIcon({className:'air-user-marker-wrap',html:'<span class="air-user-pulse"></span><span class="air-user-marker"></span>',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(state.map);
  state.userMarker.bindPopup('<strong>📍 내 현재 위치</strong><br>브라우저에서 허용한 위치 정보입니다.');
}
function clearNearestOverlay(){
  if(state.nearestMarker){state.map?.removeLayer(state.nearestMarker);state.nearestMarker=null;}
  if(state.nearestLine){state.map?.removeLayer(state.nearestLine);state.nearestLine=null;}
}
function showNearestPanel(title,detail,notice){
  $('nearestTitle').textContent=title;
  $('nearestDescription').textContent=detail;
  $('nearestNotice').textContent=notice||'등록 정보만으로 공사 진행 여부나 대기오염의 원인을 확인할 수 없습니다.';
}
function showBothLocations(){
  if(!state.map||!state.userGeo||!state.nearestFound)return;
  const p=state.userGeo,f=state.nearestFound;
  state.map.fitBounds(L.latLngBounds([[p.lat,p.lon],[f.lat,f.lon]]).pad(.35),{maxZoom:16,animate:true});
  requestAnimationFrame(repairMapSize);
}
function highlightNearest(f){
  if(!state.map||!state.userGeo)return;
  clearNearestOverlay();
  state.nearestFound=f;
  const p=state.userGeo;
  state.nearestLine=L.polyline([[p.lat,p.lon],[f.lat,f.lon]],{color:'#3f7969',weight:4,dashArray:'7 9',opacity:.85}).addTo(state.map);
  state.nearestMarker=L.marker([f.lat,f.lon],{zIndexOffset:1400,icon:L.divIcon({className:'air-nearest-icon',html:'<span class="air-nearest-pin">🏗️</span>',iconSize:[42,46],iconAnchor:[21,39]})}).addTo(state.map);
  state.nearestMarker.bindPopup(featureInfo(f),{maxWidth:320,minWidth:230});
  state.nearestMarker.bindTooltip('가장 가까운 등록 공사장', {direction:'top',offset:[0,-30]});
  $('mapShowBoth').disabled=false;
  showNearestPanel(`가장 가까운 등록 공사장 · ${kmLabel(f.distance)}`,`${f.name} · 직선거리 ${kmLabel(f.distance)}. 지도에서 초록 점선으로 내 위치와 연결했어요.`,`검색 반경 내 공개 지도 등록 지점 기준입니다. 실제 최단 이동거리나 현재 공사 진행 여부는 확인되지 않았습니다.`);
  showBothLocations();
}
async function findNearestConstruction(){
  if(!state.map)initMap();
  const id=++state.nearestSearchId;
  const btn=$('mapFindNearest');btn.disabled=true;btn.textContent='⌛ 위치와 공사장 검색 중…';
  $('mapShowBoth').disabled=true;
  clearNearestOverlay();state.nearestFound=null;
  showNearestPanel('현재 위치를 확인하는 중…','브라우저의 위치 접근 권한을 허용해 주세요.','위치는 이 페이지에서 검색을 위해 사용되며 별도 서버에 저장하지 않습니다.');
  try{
    const pos=await getGeo();if(!inKorea(pos))throw Error('대한민국 내 위치만 지원합니다.');
    if(id!==state.nearestSearchId)return;
    state.userGeo={lat:pos.lat,lon:pos.lon};drawUserMarker();
    state.map.setView([pos.lat,pos.lon],15);
    showNearestPanel('주변 공사장 정보를 조회하고 있어요…','먼저 반경 1.5km를 검색하고, 결과가 없으면 4km와 8km로 넓혀요.','GitHub에 생성된 시설 자료에서 검색합니다. 실제 공사 중인지 확인한 것은 아닙니다.');
    let found=[];let usedRadius=0;
    for(const radius of [1500,4000,8000]){
      if(id!==state.nearestSearchId)return;
      usedRadius=radius;
      try{
        const results=await overpassConstruction(pos,radius);
        found=results.filter(f=>f.cat==='construction').map(f=>({...f,distance:dist(pos,f)})).filter(f=>f.distance<=radius).sort((a,b)=>a.distance-b.distance);
        if(found.length)break;
      }catch(e){if(radius===8000)throw e;}
    }
    if(id!==state.nearestSearchId)return;
    if(!found.length){showNearestPanel('반경 8km 내 등록 공사장 없음','공개 지도에 등록된 공사장 구역을 찾지 못했어요. 실제 공사장이 없다는 뜻은 아닙니다.',`최대 반경 ${usedRadius/1000}km 검색 · 미등록 공사장 및 조회 누락 가능`);notify('가까운 공사장 등록 지점을 찾지 못했어요.');return;}
    highlightNearest(found[0]);
    notify('가장 가까운 등록 공사장을 표시했어요.');
  }catch(e){showNearestPanel('공사장 조회 실패','위치 권한이나 무료 시설 데이터 서버를 확인하고 다시 시도해 주세요.',`오류: ${e?.message||'알 수 없음'} · API 키를 새로 발급할 필요는 없습니다.`);}
  finally{if(id===state.nearestSearchId){btn.disabled=false;btn.textContent='⌖ 내 위치 · 가장 가까운 공사장 찾기';}}
}
async function overpassConstruction(pos,radius){
 const all=await loadFacilityDataset();
 const latLimit=radius/111320,lonLimit=radius/(111320*Math.cos(pos.lat*Math.PI/180));
 return all.filter(f=>f.cat==='construction'&&Math.abs(f.lat-pos.lat)<=latLimit&&Math.abs(f.lon-pos.lon)<=lonLimit);
}
function repairMapSize(){
  if(!state.map || $('mapView').hidden)return;
  const el=$('facilityMap');
  if(!el || el.clientWidth<50 || el.clientHeight<50)return;
  state.map.invalidateSize({pan:false,animate:false});
}
function setupTabs(){
  const render=(view)=>{
    const m=view==='map';
    $('problemView').hidden=m;$('mapView').hidden=!m;
    $('mapTab').classList.toggle('selected',m);$('problemTab').classList.toggle('selected',!m);
    $('mapTab').setAttribute('aria-selected',String(m));$('problemTab').setAttribute('aria-selected',String(!m));
    if(m){
      initMap();
      requestAnimationFrame(()=>requestAnimationFrame(repairMapSize));
      setTimeout(repairMapSize,150);
      setTimeout(repairMapSize,500);
      setTimeout(()=>loadMap(false),620);
    }
    window.scrollTo({top:0,behavior:'instant'});
  };
  document.querySelectorAll('.main-tab').forEach(b=>b.addEventListener('click',()=>{
    const view=b.dataset.view;history.replaceState(null,'',view==='map'?'#map':'#problem');render(view);
  }));
  window.addEventListener('hashchange',()=>render(location.hash==='#map'?'map':'problem'));
  if(location.hash==='#map')render('map');
}
function initMap(){
  if(state.map)return;
  if(!window.L){$('mapStatus').textContent='지도 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.';return;}
  const m=L.map('facilityMap',{zoomControl:true,minZoom:6,maxZoom:19,preferCanvas:false}).setView([36.35,127.75],7);
  state.map=m;
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    maxZoom:19,keepBuffer:3,updateWhenIdle:true
  }).addTo(m);
  let tileErrors=0;
  tiles.on('tileerror',()=>{if(++tileErrors===4){$('mapStatus').textContent='배경 지도 이미지 일부를 가져오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.';}});
  const el=$('facilityMap');
  if('ResizeObserver' in window){
    const ob=new ResizeObserver(()=>requestAnimationFrame(repairMapSize));
    ob.observe(el);state.mapResizeObserver=ob;
  }
  window.addEventListener('resize',repairMapSize);
  m.on('moveend',()=>{clearTimeout(mapMoveHandle);mapMoveHandle=setTimeout(()=>loadMap(false),520);});
  requestAnimationFrame(()=>requestAnimationFrame(repairMapSize));
  drawUserMarker();
  loadMap(false);
}
function featureInfo(f){
  const t=f.tags||{};
  const operator=t.operator||t['operator:name'];
  const details=[
    ['종류',CLASS_LABEL[f.cat]],
    ['운영·시공 주체',operator],
    ['주소',[t['addr:city'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ')],
    ['등록된 작업·용도',t.construction||t.industrial||t.description],
    ['OSM 갱신 정보','실제 공사 진행 여부 및 대기오염 발생 여부는 확인되지 않음']
  ];
  const root=document.createElement('div');root.className='facility-popup';
  const title=document.createElement('strong');title.textContent=f.name;root.appendChild(title);
  for(const [key,val] of details){if(!val)continue;const row=document.createElement('div');row.className='facility-popup-row';
    const lbl=document.createElement('span');lbl.textContent=key;const value=document.createElement('span');value.textContent=String(val);
    row.append(lbl,value);root.appendChild(row);
  }
  const link=document.createElement('a');link.href=`https://www.openstreetmap.org/${f.id.replace('-', '/')}`;
  link.target='_blank';link.rel='noopener noreferrer';link.textContent='OpenStreetMap 원본 등록 정보 보기 ↗';root.appendChild(link);
  return root;
}
// Register all facility points returned by the public data server in the CURRENT viewport.
// Leaflet.markercluster displays dense places as clickable counts; no artificial 130/220 cap.
function redrawMap(){
  const m=state.map;if(!m)return;
  if(state.mapFeatureGroup){m.removeLayer(state.mapFeatureGroup);state.mapFeatureGroup=null;}
  for(const layer of state.mapLayers)m.removeLayer(layer);
  state.mapLayers=[];
  const allowed=new Set([...document.querySelectorAll('.map-filters input:checked')].map(x=>x.value));
  const b=m.getBounds();
  const visible=state.mapFeatures.filter(f=>allowed.has(f.cat)&&b.contains([f.lat,f.lon]));
  $('facilityCount').replaceChildren();
  $('facilityCount').append(document.createTextNode(visible.length.toLocaleString('ko-KR')+' '));
  const countSuffix=document.createElement('small');countSuffix.textContent='개 등록 장소';$('facilityCount').append(countSuffix);
  const list=$('facilityList');list.replaceChildren();
  const hasClusters=typeof L.markerClusterGroup==='function';
  const group=hasClusters?L.markerClusterGroup({
    chunkedLoading:true,chunkInterval:80,chunkDelay:30,
    showCoverageOnHover:false,spiderfyOnMaxZoom:true,zoomToBoundsOnClick:true,
    maxClusterRadius:46,disableClusteringAtZoom:17,
    iconCreateFunction(cluster){
      const n=cluster.getChildCount(),sz=n>99?62:n>9?54:46;
      return L.divIcon({html:`<span class="air-cluster-bubble ${n>99?'large':n>9?'medium':''}">${n}</span>`,
        className:'air-facility-cluster',iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]});
    }
  }):L.layerGroup();
  state.mapFeatureGroup=group;
  group.addTo(m);
  if(!visible.length){
    const p=document.createElement('p');p.className='empty-list';
    p.textContent=allowed.size===0?'표시할 시설 유형을 선택해 주세요.':'화면 내 등록 시설이 없거나 조회 결과가 아직 없습니다.';
    list.appendChild(p);
  }
  const markers=[];
  for(const f of visible){
    const marker=L.marker([f.lat,f.lon],{
      icon:L.divIcon({className:'',html:`<span class="facility-marker ${f.cat}" aria-hidden="true"></span>`,iconSize:[22,22],iconAnchor:[11,11]})
    });
    marker.bindPopup(featureInfo(f),{maxWidth:330,minWidth:220});
    marker.bindTooltip(f.name,{direction:'top',offset:[0,-8],opacity:.98});
    markers.push(marker);
    // Side list stays manageable; ALL returned facilities remain on the map.
    if(markers.length<=180){
      const row=document.createElement('button');row.type='button';row.className='facility-item';
      const name=document.createElement('b'),sub=document.createElement('small');
      name.textContent=f.name;sub.textContent=CLASS_LABEL[f.cat]+' · 눌러서 상세 보기';
      row.append(name,sub);
      row.addEventListener('click',()=>{
        m.setView([f.lat,f.lon],Math.max(m.getZoom(),16));
        if(hasClusters){group.zoomToShowLayer(marker,()=>marker.openPopup());}
        else marker.openPopup();
      });
      list.appendChild(row);
    }
  }
  if(visible.length>180){
    const more=document.createElement('p');more.className='empty-list';
    more.textContent=`목록은 처음 180개만 보여줘요. 지도에는 ${visible.length.toLocaleString('ko-KR')}개를 모두 배치했어요. 숫자 묶음을 눌러 확대할 수 있어요.`;
    list.appendChild(more);
  }
  group.addLayers?group.addLayers(markers):markers.forEach(marker=>group.addLayer(marker));
}
// The static nationwide snapshot is loaded once and filtered locally on map movement.
// No Overpass API rate limits or server-side proxy are involved in viewing facilities.
async function loadMap(force=false){
 const m=state.map;if(!m||$('mapView').hidden)return;
 const token=Symbol();state.mapRequest=token;
 const enabled=new Set([...document.querySelectorAll('.map-filters input:checked')].map(x=>x.value));
 if(!enabled.size){state.mapFeatures=[];redrawMap();$('mapStatus').textContent='표시할 시설 유형을 하나 이상 선택해 주세요.';return;}
 $('mapStatus').textContent='⌛ 저장된 전국 시설 정보를 읽고 있어요…';
 try{
   const all=await loadFacilityDataset(force);
   if(state.mapRequest!==token)return;
   const bounds=m.getBounds();
   state.mapFeatures=all.filter(f=>enabled.has(f.cat)&&bounds.contains([f.lat,f.lon]));
   redrawMap();
   const count=state.mapFeatures.length;
   $('mapStatus').textContent=`✅ 지도에 등록 시설 ${count.toLocaleString('ko-KR')}개 표시 · ${state.mapLastFetchInfo}. 공개 지도 등록 정보이며 실제 공사 진행 상태와 다를 수 있습니다.`;
 }catch(e){
   if(state.mapRequest!==token)return;
   state.mapFeatures=[];redrawMap();
   $('mapStatus').textContent=`❌ 시설 자료 준비 필요: ${e.message} (실제 시설 0개라는 의미가 아닙니다.)`;
 }
}
function bindEvents(){setupTabs();$('searchLocation').addEventListener('click',async()=>{const q=normalize($('locationQuery').value);if(!q)return notify('지역이나 주소를 입력해 주세요.');try{const p=await geocode(q);await changeLocation(p);notify('지역 정보가 갱신됐어요.');}catch(e){notify(e.message);}});$('locationQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){$('searchLocation').click();}});$('myLocation').addEventListener('click',locate);$('applyLocation').addEventListener('click',()=>{$('siteLocation').value=state.loc.name;notify('현재 조회 위치를 적용했어요.');});$('photoSelect').addEventListener('click',()=>$('photoInput').click());$('photoInput').addEventListener('change',e=>usePhoto(e.target.files[0]));$('removePhoto').addEventListener('click',clearPhoto);$('reportForm').addEventListener('submit',analyze);$('copyDraft').addEventListener('click',async()=>{const val=$('draftText').value;if(!val)return notify('민원 초안을 먼저 작성해 주세요.');try{await navigator.clipboard.writeText(val);notify('민원 초안을 복사했어요.');}catch{notify('복사 권한이 없어요. 내용을 선택해 직접 복사해 주세요.');}});$('downloadDraft').addEventListener('click',()=>{const text=$('draftText').value;if(!text)return notify('민원 초안을 먼저 작성해 주세요.');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='AirDetective_민원초안.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});$('recommendChannel').addEventListener('click',()=>{if(!state.analysis)return notify('분석 결과를 먼저 만들어 주세요.');recommend(state.analysis);notify('추천 접수처를 표시했어요.');});$('mapMyLocation').addEventListener('click',async()=>{const p=await locate();if(p){showNearestPanel('내 위치 확인 완료','가장 가까운 등록 공사장을 찾으려면 아래 검색 버튼을 눌러 주세요.');}});$('mapFindNearest').addEventListener('click',findNearestConstruction);$('mapShowBoth').addEventListener('click',showBothLocations);$('mapSearchButton').addEventListener('click',async()=>{const q=normalize($('mapSearchQuery').value);if(!q)return notify('지역을 입력해 주세요.');try{const p=await geocode(q);await changeLocation(p,true);}catch(e){notify(e.message);}});$('mapSearchQuery').addEventListener('keydown',e=>{if(e.key==='Enter')$('mapSearchButton').click();});$('refreshMap').addEventListener('click',()=>{repairMapSize();loadMap(true);});document.querySelectorAll('.map-filters input').forEach(i=>i.addEventListener('change',()=>{state.mapLastKey='';loadMap(true);}));}
window.addEventListener('DOMContentLoaded',()=>{bindEvents();fetchWeather();});
