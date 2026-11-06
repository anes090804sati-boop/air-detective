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
// Route search reuses the previously generated GitHub OSM facility snapshot.
// It does not perform actual road navigation or retrieve real-time works schedules.
state.route={mode:'browse',start:null,end:null,pick:null,results:null,lineLength:0,radius:200,layer:null,markersGroup:null};
let routeSearchInProgress=false;
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
async function geocode(query){const url=`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&accept-language=ko&limit=3&countrycodes=kr&q=${encodeURIComponent(query)}`;const rows=await fetchJSON(url);const row=rows?.[0];if(!row)throw Error('국내 검색 결과를 찾지 못했습니다.');return {lat:+row.lat,lon:+row.lon,name:row.display_name.split(',').slice(0,3).join(','),address:row.address||{}};}
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
// V4.10: third complaint card follows the *reported incident site*, not the user's current position.
// Other provinces do not all operate a portal called '응답소'; link to the relevant official
// provincial/metro government site and clearly label direct submission vs information page.
const LOCAL_CHANNELS=[
 {id:'seoul',label:'서울시 응답소',region:'서울특별시',keys:['서울특별시','서울시','서울'],url:'https://eungdapso.seoul.go.kr/',direct:true,description:'서울 지역 생활불편·환경 민원 바로가기'},
 {id:'busan',label:'부산민원120',region:'부산광역시',keys:['부산광역시','부산시','부산'],url:'https://www.busan.go.kr/minwon/minwon02',direct:true,description:'부산광역시 공식 통합민원신청'},
 {id:'daegu',label:'대구시 민원 안내',region:'대구광역시',keys:['대구광역시','대구시','대구'],url:'https://www.daegu.go.kr/',description:'대구시 공식 홈페이지 · 두드리소 등 민원 메뉴 확인'},
 {id:'incheon',label:'인천시 민원 안내',region:'인천광역시',keys:['인천광역시','인천시','인천'],url:'https://www.incheon.go.kr/',description:'인천시 공식 홈페이지 · 민원신청 메뉴 확인'},
 {id:'gwangju',label:'광주시 민원 안내',region:'광주광역시',keys:['광주광역시','광주광역'],url:'https://www.gwangju.go.kr/',description:'광주광역시 공식 홈페이지 · 민원접수 메뉴 확인'},
 {id:'daejeon',label:'대전시 민원신청',region:'대전광역시',keys:['대전광역시','대전시','대전'],url:'https://www.daejeon.go.kr/drh/DrhContentsHtmlView.do?menuSeq=1464',direct:true,description:'대전광역시 공식 민원신청·조회 안내'},
 {id:'ulsan',label:'울산시 민원 안내',region:'울산광역시',keys:['울산광역시','울산시','울산'],url:'https://www.ulsan.go.kr/',description:'울산시 공식 홈페이지 · 울산시에 바란다 메뉴 확인'},
 {id:'sejong',label:'세종시 민원 안내',region:'세종특별자치시',keys:['세종특별자치시','세종시','세종'],url:'https://www.sejong.go.kr/',description:'세종시 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'gyeonggi',label:'경기도 민원 안내',region:'경기도',keys:['경기도','경기'],url:'https://www.gg.go.kr/',description:'경기도 공식 홈페이지 · 관할 시·군 민원 담당기관 확인'},
 {id:'gangwon',label:'강원특별자치도 민원 안내',region:'강원특별자치도',keys:['강원특별자치도','강원도','강원'],url:'https://state.gwd.go.kr/',description:'강원특별자치도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'chungbuk',label:'충청북도 민원 안내',region:'충청북도',keys:['충청북도','충북'],url:'https://www.chungbuk.go.kr/',description:'충청북도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'chungnam',label:'충청남도 민원 안내',region:'충청남도',keys:['충청남도','충남'],url:'https://www.chungnam.go.kr/',description:'충청남도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'jeonbuk',label:'전북특별자치도 민원 안내',region:'전북특별자치도',keys:['전북특별자치도','전라북도','전북'],url:'https://www.jeonbuk.go.kr/',description:'전북특별자치도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'jeonnam',label:'전라남도 민원 안내',region:'전라남도',keys:['전라남도','전남'],url:'https://www.jeonnam.go.kr/',description:'전라남도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'gyeongbuk',label:'경상북도 민원 안내',region:'경상북도',keys:['경상북도','경북'],url:'https://www.gb.go.kr/',description:'경상북도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'gyeongnam',label:'경상남도 민원 안내',region:'경상남도',keys:['경상남도','경남'],url:'https://www.gyeongnam.go.kr/',description:'경상남도 공식 홈페이지 · 민원 메뉴 확인'},
 {id:'jeju',label:'제주특별자치도 민원 안내',region:'제주특별자치도',keys:['제주특별자치도','제주도','제주'],url:'https://www.jeju.go.kr/',description:'제주특별자치도 공식 홈페이지 · 민원 메뉴 확인'}
];
function regionFromText(text){
 const value=String(text||'').trim();if(!value)return null;
 const hits=LOCAL_CHANNELS.flatMap(region=>region.keys.filter(key=>value.includes(key)).map(key=>({region,key})));
 if(!hits.length)return null;
 // A full province name beats a shorter, ambiguous city fragment (e.g. '경기도 광주시').
 hits.sort((a,b)=>b.key.length-a.key.length);
 return hits[0].region;
}
function regionForReport(r){
 // Explicitly entered province wins, then structured geocoding result, then fallback display name.
 const explicit=regionFromText(r.place);
 if(explicit)return explicit;
 const address=r.p?.address||{};
 const admin=[address.state,address.province,address.region,address.city,address.municipality,address.state_district].filter(Boolean);
 for(const part of admin){const matched=regionFromText(part);if(matched)return matched;}
 return regionFromText(r.p?.name);
}
function updateLocalComplaintChannel(r){
 const card=document.querySelector('[data-channel="seoul"]');
 if(!card)return null;
 const title=card.querySelector('b'),description=card.querySelector('small');
 const region=r&&regionForReport(r);
 if(!region){
   title.textContent=r?'관할 지자체 확인 필요':'서울시 응답소';
   description.textContent=r?'피해 장소의 시·도를 확인할 수 없어요. 국민신문고에서 관할 기관을 선택하세요.':'서울 지역 생활불편·환경 민원';
   card.href=r?'https://www.epeople.go.kr/':'https://eungdapso.seoul.go.kr/';
   card.dataset.region='unknown';
   return null;
 }
 title.textContent=region.label;
 description.textContent=region.description;
 card.href=region.url;
 card.dataset.region=region.id;
 return region;
}
function recommend(r){
 const region=updateLocalComplaintChannel(r);
 let best='epeople',reason='현장 확인과 개선 조치를 공식적으로 요청하는 일반 민원에 적합해요.';
 if(region?.id==='seoul'){
   best='seoul';reason='피해 장소가 서울특별시로 확인되어 서울시 응답소를 안내해요.';
 }else if(region?.direct){
   best='seoul';reason=`피해 장소가 ${region.region}(으)로 확인되어 해당 지역의 공식 민원 창구를 안내해요.`;
 }else if(['construction','demolition','road','vehicle'].includes(r.type)){
   best='safety';reason='공사·도로 관련 현장 위험 또는 환경 신고는 안전신문고가 적합할 수 있어요.';
 }else if(region){
   best='epeople';reason=`${region.region} 지역은 세 번째 카드의 지자체 안내도 확인할 수 있어요. 공식 접수는 국민신문고에서 관할 기관을 선택할 수 있습니다.`;
 }else{
   reason='피해 장소를 구체적으로 입력하지 않아 관할 지자체를 확정할 수 없습니다. 국민신문고에서 관할 기관을 직접 선택해 주세요.';
 }
 document.querySelectorAll('.channel').forEach(x=>x.classList.toggle('recommended',x.dataset.channel===best));
 const name=document.querySelector(`[data-channel="${best}"] b`)?.textContent||'국민신문고';
 $('recommendMessage').textContent=`✦ 추천: ${name} — ${reason}`;
 $('recommendMessage').classList.add('active');
}
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
  updateLocalComplaintChannel(null);
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
  m.on('click',handleRouteMapClick);
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
  const m=state.map;if(!m||state.route.mode==='route')return;
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
      icon:L.divIcon({className:'air-facility-icon',html:`<span class="air-facility-pin ${f.cat}" aria-hidden="true">${f.cat==='construction'?'🏗':f.cat==='industrial'?'🏭':'⛏'}</span>`,iconSize:[38,44],iconAnchor:[19,39],popupAnchor:[0,-31]})
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
 const m=state.map;if(!m||$('mapView').hidden||state.route.mode==='route')return;
 const token=Symbol();state.mapRequest=token;
 const enabled=new Set([...document.querySelectorAll('.map-filters input:checked')].map(x=>x.value));
 if(!enabled.size){state.mapFeatures=[];redrawMap();$('mapStatus').textContent='표시할 시설 유형을 하나 이상 선택해 주세요.';return;}
 $('mapStatus').textContent='⌛ 저장된 전국 시설 정보를 읽고 있어요…';
 try{
   const all=await loadFacilityDataset(force);
   if(state.mapRequest!==token||state.route.mode==='route')return;
   const bounds=m.getBounds();
   state.mapFeatures=all.filter(f=>enabled.has(f.cat)&&bounds.contains([f.lat,f.lon]));
   redrawMap();
   const count=state.mapFeatures.length;
   $('mapStatus').textContent=`✅ 지도에 등록 시설 ${count.toLocaleString('ko-KR')}개 표시 · ${state.mapLastFetchInfo}. 공개 지도 등록 정보이며 실제 공사 진행 상태와 다를 수 있습니다.`;
 }catch(e){
   if(state.mapRequest!==token||state.route.mode==='route')return;
   state.mapFeatures=[];redrawMap();
   $('mapStatus').textContent=`❌ 시설 자료 준비 필요: ${e.message} (실제 시설 0개라는 의미가 아닙니다.)`;
 }
}

// ---------- V4.9: searchable start/end and visually distinct corridor construction markers ----------
function setRouteStatus(message){$('routeStatus').textContent=message;}
function routeInput(which){return $(which==='start'?'routeStartInput':'routeEndInput');}
function setRoutePick(which){
  if(state.route.mode!=='route')setMapMode('route');
  state.route.pick=which;
  $('routePickHint').hidden=false;
  $('routePickHint').textContent=`지도를 클릭하면 ${which==='start'?'출발지':'도착지'}가 선택돼요. (선택 후에는 경로 확인 버튼을 눌러 주세요.)`;
  $('routePickStart').classList.toggle('picking',which==='start');
  $('routePickEnd').classList.toggle('picking',which==='end');
  notify(`${which==='start'?'출발지':'도착지'}로 사용할 지점을 지도에서 클릭하세요.`);
}
function clearRoutePick(){
  state.route.pick=null;
  $('routePickHint').hidden=true;
  $('routePickStart').classList.remove('picking');
  $('routePickEnd').classList.remove('picking');
}
function invalidateRouteResult(){
  state.route.results=null;
  removeRouteOverlays();
  $('routeStats').hidden=true;
  $('routeCount').innerHTML='0 <small>개 등록 지점</small>';
  $('routeFacilityList').replaceChildren();
  const empty=document.createElement('p');empty.className='empty-list';
  empty.textContent='출발지와 도착지를 지정하고 검색하면 여기에 결과가 나와요.';
  $('routeFacilityList').appendChild(empty);
  setRouteStatus('경로를 선택한 뒤 「공사장 위치 확인하기」를 눌러 주세요.');
}
function setRouteLocation(which,point,label){
  const dest={lat:point.lat,lon:point.lon,name:label||'지도 선택 위치'};
  state.route[which]=dest;
  const inp=routeInput(which);inp.value=label||`${point.lat.toFixed(5)}, ${point.lon.toFixed(5)} (지도 지정)`;
  invalidateRouteResult();clearRoutePick();
}
function handleRouteMapClick(e){
  const which=state.route.pick;
  if(state.route.mode!=='route'||!which)return;
  const pt={lat:e.latlng.lat,lon:e.latlng.lng};
  if(!inKorea(pt)){notify('현재는 대한민국 내 위치만 선택할 수 있어요.');return;}
  setRouteLocation(which,pt,`지도 선택 · ${pt.lat.toFixed(5)}, ${pt.lon.toFixed(5)}`);
  notify(which==='start'?'출발지를 지정했어요.':'도착지를 지정했어요.');
}
function removeRouteOverlays(){
  if(state.map&&state.route.layer&&state.map.hasLayer(state.route.layer))state.map.removeLayer(state.route.layer);
  state.route.layer=null;state.route.markersGroup=null;
}
function setMapMode(mode){
  const route=mode==='route', m=state.map;
  state.route.mode=route?'route':'browse';clearRoutePick();
  $('mapBrowseMode').classList.toggle('active',!route);
  $('mapRouteMode').classList.toggle('active',route);
  $('mapBrowseMode').setAttribute('aria-pressed',String(!route));
  $('mapRouteMode').setAttribute('aria-pressed',String(route));
  $('mapBrowseControls').hidden=route;
  $('mapRouteControls').hidden=!route;
  $('browseSidebar').hidden=route;
  $('routeSidebar').hidden=!route;
  $('browseMapKey').hidden=route;
  $('routeMapKey').hidden=!route;
  $('mapMyLocation').hidden=route;
  // There is only ONE Leaflet map. Switching modes never destroys its tile layer.
  if(!m)return;
  if(route){
    if(state.mapFeatureGroup&&m.hasLayer(state.mapFeatureGroup))m.removeLayer(state.mapFeatureGroup);
    if(state.nearestMarker&&m.hasLayer(state.nearestMarker))m.removeLayer(state.nearestMarker);
    if(state.nearestLine&&m.hasLayer(state.nearestLine))m.removeLayer(state.nearestLine);
    if(state.route.results)drawRouteOverlays();
  }else{
    removeRouteOverlays();
    if(state.nearestMarker&&!m.hasLayer(state.nearestMarker))state.nearestMarker.addTo(m);
    if(state.nearestLine&&!m.hasLayer(state.nearestLine))state.nearestLine.addTo(m);
    loadMap(false);
  }
  requestAnimationFrame(repairMapSize);
}
// Equirectangular local metric projection. For route-local visualization only.
function linePointDistanceMeters(point,a,b){
  const r=111195,cos=Math.cos(((a.lat+b.lat)/2)*Math.PI/180);
  const vx=(b.lon-a.lon)*r*cos,vy=(b.lat-a.lat)*r;
  const wx=(point.lon-a.lon)*r*cos,wy=(point.lat-a.lat)*r;
  const denom=vx*vx+vy*vy;
  const t=denom?Math.max(0,Math.min(1,(wx*vx+wy*vy)/denom)):0;
  return {meters:Math.hypot(wx-t*vx,wy-t*vy),progress:t};
}
function corridorPolygon(a,b,radius){
  const c=Math.max(0.05,Math.cos((a.lat+b.lat)/2*Math.PI/180)),k=111195;
  const vx=(b.lon-a.lon)*c*k,vy=(b.lat-a.lat)*k;
  const length=Math.hypot(vx,vy)||1;
  const dx=-vy/length*radius,dy=vx/length*radius;
  const offset=(p,sign)=>[p.lat+sign*dy/k,p.lon+sign*dx/(k*c)];
  return [offset(a,1),offset(b,1),offset(b,-1),offset(a,-1)];
}
function makeRouteEndpoint(point,label,kind){
  const marker=L.marker([point.lat,point.lon],{
    zIndexOffset:1500,icon:L.divIcon({className:'air-route-endpoint-wrap',
      html:`<span class="air-route-endpoint ${kind}">${kind==='start'?'A':'B'}</span>`,
      iconSize:[38,44],iconAnchor:[19,38]})
  });
  const popup=document.createElement('div');
  const title=document.createElement('strong');title.textContent=`${kind==='start'?'출발지':'도착지'} · ${label}`;
  popup.appendChild(title);marker.bindPopup(popup);return marker;
}
function makeRouteWarning(f,offset){
  const marker=L.marker([f.lat,f.lon],{zIndexOffset:800,
    icon:L.divIcon({className:'air-route-warning-wrap',
      html:'<span class="air-route-warning" aria-hidden="true">!</span>',
      iconSize:[34,38],iconAnchor:[17,33],popupAnchor:[0,-25]})});
  const popup=document.createElement('div');popup.className='route-popup';
  const p=document.createElement('p');p.textContent=`직선 구간에서 약 ${kmLabel(offset)} 떨어진 등록 지점 · 실제 공사 진행 여부 미확인`;
  popup.appendChild(p);popup.appendChild(featureInfo(f));
  marker.bindPopup(popup,{maxWidth:340});marker.bindTooltip(f.name,{direction:'top',offset:[0,-20]});
  return marker;
}
function drawRouteOverlays(){
  const m=state.map,r=state.route;
  if(!m||r.mode!=='route'||!r.results||!r.start||!r.end)return;
  removeRouteOverlays();
  const layer=L.layerGroup().addTo(m);
  r.layer=layer;
  // Shaded straight-line search corridor, not a road route.
  L.polygon(corridorPolygon(r.start,r.end,r.radius),{color:'#c15b4c',weight:1,dashArray:'4 5',fillColor:'#df9d91',fillOpacity:.16,interactive:false}).addTo(layer);
  L.polyline([[r.start.lat,r.start.lon],[r.end.lat,r.end.lon]],{color:'#426d54',weight:4,dashArray:'8 7',opacity:.95,interactive:false}).addTo(layer);
  makeRouteEndpoint(r.start,r.start.name,'start').addTo(layer);
  makeRouteEndpoint(r.end,r.end.name,'end').addTo(layer);
  const hasCluster=typeof L.markerClusterGroup==='function';
  const group=hasCluster?L.markerClusterGroup({maxClusterRadius:38,disableClusteringAtZoom:17,showCoverageOnHover:false,chunkedLoading:true,
    iconCreateFunction:c=>{const n=c.getChildCount();return L.divIcon({className:'air-route-cluster-wrap',html:`<span class="air-route-warning-cluster">${n}</span>`,iconSize:[48,48],iconAnchor:[24,24]});}
  }):L.layerGroup();
  layer.addLayer(group);r.markersGroup=group;
  const list=$('routeFacilityList');list.replaceChildren();
  const markers=[];
  // Display in the actual start-to-end order (not sorted by latitude or API order).
  for(const item of r.results){
    const f=item.facility;
    const marker=makeRouteWarning(f,item.lineDistance);
    markers.push(marker);
    if(markers.length<=150){
      const row=document.createElement('button');row.type='button';row.className='facility-item route-facility-item';
      const name=document.createElement('b');name.textContent=`⚑ ${f.name}`;
      const detail=document.createElement('small');detail.textContent=`시작에서 직선 약 ${kmLabel(item.progress*r.lineLength)} 지점 · 직선까지 ${kmLabel(item.lineDistance)}`;
      row.append(name,detail);
      row.addEventListener('click',()=>{
        m.setView([f.lat,f.lon],Math.max(16,m.getZoom()));
        if(hasCluster)group.zoomToShowLayer(marker,()=>marker.openPopup());else marker.openPopup();
      });list.appendChild(row);
    }
  }
  if(markers.length){if(group.addLayers)group.addLayers(markers);else markers.forEach(mk=>group.addLayer(mk));}
  else{const note=document.createElement('p');note.className='empty-list';note.textContent='선택한 직선 구간 주변에서 공사장으로 등록된 시설을 찾지 못했어요. 미등록·오래된 데이터일 수 있습니다.';list.appendChild(note);}
  if(r.results.length>150){const more=document.createElement('p');more.className='empty-list';more.textContent=`목록에는 먼저 150개만 표시하지만 지도에는 ${r.results.length.toLocaleString('ko-KR')}개를 모두 표시해요.`;list.appendChild(more);}
}
function updateRouteSummary(results,start,end,radius){
  $('routeCount').replaceChildren(document.createTextNode(`${results.length.toLocaleString('ko-KR')} `));
  const suffix=document.createElement('small');suffix.textContent='개 등록 지점';$('routeCount').append(suffix);
  const stats=$('routeStats');stats.replaceChildren();stats.hidden=false;
  for(const line of [`출발 ↔ 도착 직선거리: ${kmLabel(dist(start,end))}`,`탐색 기준: 직선 양옆 ${radius}m`]){
    const item=document.createElement('div');item.textContent=line;stats.appendChild(item);
  }
  setRouteStatus(results.length?
    `✅ 직선 구간 주변 등록 공사장 ${results.length.toLocaleString('ko-KR')}곳을 붉게 표시했어요. 빨간 마커나 목록을 눌러 자세히 볼 수 있어요.`:
    '조회는 완료됐지만 이 직선 구간 주변에 등록된 공사장을 찾지 못했어요. 실제 공사장이 없다는 뜻은 아닙니다.');
}
async function buildRouteSearch(){
  const rawStart=normalize($('routeStartInput').value),rawEnd=normalize($('routeEndInput').value);
  if(!rawStart||!rawEnd){setRouteStatus('출발지와 도착지를 모두 지정해 주세요.');notify('출발지와 도착지를 먼저 선택해 주세요.');return;}
  if(routeSearchInProgress)return;
  routeSearchInProgress=true;
  const btn=$('routeSearchButton');btn.disabled=true;btn.textContent='⌛ 위치·시설 확인 중…';
  clearRoutePick();
  try{
    setRouteStatus('입력한 장소를 확인하고 있어요…');
    let a=state.route.start,b=state.route.end;
    const needsStartLookup=!a;
    if(!a){a=await geocode(rawStart);state.route.start=a;}
    if(!b){if(needsStartLookup)await delay(1100);b=await geocode(rawEnd);state.route.end=b;}
    if(!inKorea(a)||!inKorea(b))throw Error('대한민국 내 위치만 지원합니다.');
    const length=dist(a,b);
    if(length<50)throw Error('출발지와 도착지가 너무 가까워요. 50m 이상 떨어진 두 지점을 선택해 주세요.');
    const radius=Number($('routeRadius').value)||200;
    setRouteStatus('저장된 공사장 목록에서 직선 주변 지점을 확인하고 있어요…');
    const sites=await loadFacilityDataset();
    const latPad=(radius+100)/111195;
    const lonPad=(radius+100)/(111195*Math.max(.05,Math.cos((a.lat+b.lat)*Math.PI/360)));
    const latMin=Math.min(a.lat,b.lat)-latPad,latMax=Math.max(a.lat,b.lat)+latPad;
    const lonMin=Math.min(a.lon,b.lon)-lonPad,lonMax=Math.max(a.lon,b.lon)+lonPad;
    const selected=[];
    for(const f of sites){
      if(f.cat!=='construction'||f.lat<latMin||f.lat>latMax||f.lon<lonMin||f.lon>lonMax)continue;
      const measure=linePointDistanceMeters(f,a,b);
      if(measure.meters<=radius){selected.push({facility:f,lineDistance:measure.meters,progress:measure.progress});}
    }
    selected.sort((x,y)=>x.progress-y.progress||x.lineDistance-y.lineDistance);
    state.route.start=a;state.route.end=b;state.route.radius=radius;
    state.route.lineLength=length;state.route.results=selected;
    updateRouteSummary(selected,a,b,radius);
    drawRouteOverlays();
    state.map.fitBounds([[a.lat,a.lon],[b.lat,b.lon]],{padding:[65,65],maxZoom:15});
    requestAnimationFrame(repairMapSize);
  }catch(e){
    setRouteStatus(`❌ 검색 실패: ${e?.message||'알 수 없는 오류'}`);
    notify('장소 또는 시설 자료를 확인하지 못했어요.');
  }finally{routeSearchInProgress=false;btn.disabled=false;btn.textContent='공사장 위치 확인하기 ↗';}
}
function bindRouteEvents(){
  $('mapBrowseMode').addEventListener('click',()=>setMapMode('browse'));
  $('mapRouteMode').addEventListener('click',()=>setMapMode('route'));
  $('routePickStart').addEventListener('click',()=>setRoutePick('start'));
  $('routePickEnd').addEventListener('click',()=>setRoutePick('end'));
  for(const which of ['start','end'])routeInput(which).addEventListener('input',()=>{
    state.route[which]=null;invalidateRouteResult();
  });
  $('routeStartMyLocation').addEventListener('click',async()=>{
    try{
      const geo=await getGeo();
      if(!inKorea(geo))throw Error('대한민국 내 위치만 지원합니다.');
      state.userGeo={lat:geo.lat,lon:geo.lon};drawUserMarker();
      setRouteLocation('start',geo,'내 현재 위치');
      if(state.map)state.map.setView([geo.lat,geo.lon],Math.max(state.map.getZoom(),13));
      notify('현재 위치를 출발지로 지정했어요.');
    }catch(e){notify('위치 권한을 확인하거나 지도에서 출발지를 지정해 주세요.');}
  });
  $('routeSwap').addEventListener('click',()=>{
    const a=state.route.start,b=state.route.end,startInput=$('routeStartInput'),endInput=$('routeEndInput');
    const startText=startInput.value;startInput.value=endInput.value;endInput.value=startText;
    state.route.start=b;state.route.end=a;
    invalidateRouteResult();notify('출발지와 도착지를 바꿨어요.');
  });
  $('routeClear').addEventListener('click',()=>{
    state.route.start=null;state.route.end=null;
    $('routeStartInput').value='';$('routeEndInput').value='';
    clearRoutePick();invalidateRouteResult();
  });
  $('routeRadius').addEventListener('change',()=>{
    if(state.route.results&&state.route.start&&state.route.end){
      // Recalculate from the in-memory dataset without another geocoding/API call.
      buildRouteSearch();
    }
  });
  $('routeSearchForm').addEventListener('submit',e=>{e.preventDefault();buildRouteSearch();});
}

function bindEvents(){setupTabs();$('searchLocation').addEventListener('click',async()=>{const q=normalize($('locationQuery').value);if(!q)return notify('지역이나 주소를 입력해 주세요.');try{const p=await geocode(q);await changeLocation(p);notify('지역 정보가 갱신됐어요.');}catch(e){notify(e.message);}});$('locationQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){$('searchLocation').click();}});$('myLocation').addEventListener('click',locate);$('applyLocation').addEventListener('click',()=>{$('siteLocation').value=state.loc.name;notify('현재 조회 위치를 적용했어요.');});$('photoSelect').addEventListener('click',()=>$('photoInput').click());$('photoInput').addEventListener('change',e=>usePhoto(e.target.files[0]));$('removePhoto').addEventListener('click',clearPhoto);$('reportForm').addEventListener('submit',analyze);$('copyDraft').addEventListener('click',async()=>{const val=$('draftText').value;if(!val)return notify('민원 초안을 먼저 작성해 주세요.');try{await navigator.clipboard.writeText(val);notify('민원 초안을 복사했어요.');}catch{notify('복사 권한이 없어요. 내용을 선택해 직접 복사해 주세요.');}});$('downloadDraft').addEventListener('click',()=>{const text=$('draftText').value;if(!text)return notify('민원 초안을 먼저 작성해 주세요.');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='AirDetective_민원초안.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});$('recommendChannel').addEventListener('click',()=>{if(!state.analysis)return notify('분석 결과를 먼저 만들어 주세요.');recommend(state.analysis);notify('추천 접수처를 표시했어요.');});$('mapMyLocation').addEventListener('click',async()=>{const p=await locate();if(p){showNearestPanel('내 위치 확인 완료','가장 가까운 등록 공사장을 찾으려면 아래 검색 버튼을 눌러 주세요.');}});$('mapFindNearest').addEventListener('click',findNearestConstruction);$('mapShowBoth').addEventListener('click',showBothLocations);$('mapSearchButton').addEventListener('click',async()=>{const q=normalize($('mapSearchQuery').value);if(!q)return notify('지역을 입력해 주세요.');try{const p=await geocode(q);await changeLocation(p,true);}catch(e){notify(e.message);}});$('mapSearchQuery').addEventListener('keydown',e=>{if(e.key==='Enter')$('mapSearchButton').click();});$('refreshMap').addEventListener('click',()=>{repairMapSize();loadMap(true);});document.querySelectorAll('.map-filters input').forEach(i=>i.addEventListener('change',()=>{state.mapLastKey='';loadMap(true);}));bindRouteEvents();}
window.addEventListener('DOMContentLoaded',()=>{bindEvents();fetchWeather();});
