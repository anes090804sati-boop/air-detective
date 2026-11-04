'use strict';
const $ = id => document.getElementById(id);
const state = { lat:37.5665, lon:126.9780, place:'서울특별시청 부근', air:null, weather:null, image:null, analysis:null, reports:[], map:null, selectedMarker:null, reportMarkers:null };
let toastTimer;
function toast(message){ const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500); }
function coordinate(lat,lon){return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;}
function qualityLevel(v,type){if(!Number.isFinite(v))return {label:'자료 없음',cls:'neutral'}; const limits=type==='pm10'?[30,80,150]:[15,35,75]; if(v<=limits[0])return {label:'좋음',cls:'good'};if(v<=limits[1])return {label:'보통',cls:'moderate'};if(v<=limits[2])return {label:'나쁨',cls:'bad'};return {label:'매우 나쁨',cls:'verybad'};}
function compass(deg){if(!Number.isFinite(deg))return '풍향 정보 없음';return ['북','북동','동','남동','남','남서','서','북서'][Math.round(deg/45)%8]+'풍';}
function setStatus(id,v,type){const q=qualityLevel(v,type);$(id).textContent=q.label;$(id).className='status '+q.cls;}
function formatValue(v){return Number.isFinite(v)?Math.round(v*10)/10:'--';}
async function fetchJson(url, options={}){const r=await fetch(url,options);let data;try{data=await r.json();}catch{throw new Error('서버 응답을 읽을 수 없습니다.');}if(!r.ok)throw new Error(data.error||'요청 실패');return data;}
async function loadEnvironment(){const {lat,lon}=state;const airUrl=`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=Asia%2FSeoul`;const weatherUrl=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m&timezone=Asia%2FSeoul`;try{const [air,weather]=await Promise.all([fetchJson(airUrl),fetchJson(weatherUrl)]);if(state.lat!==lat||state.lon!==lon)return;state.air=air.current;state.weather=weather.current;$('pm10').textContent=formatValue(Number(air.current?.pm10));$('pm25').textContent=formatValue(Number(air.current?.pm2_5));setStatus('pm10Status',Number(air.current?.pm10),'pm10');setStatus('pm25Status',Number(air.current?.pm2_5),'pm25');$('wind').textContent=formatValue(Number(weather.current?.wind_speed_10m));$('windDir').textContent=compass(Number(weather.current?.wind_direction_10m));$('temperature').textContent=formatValue(Number(weather.current?.temperature_2m));$('rainfall').textContent='강수 '+formatValue(Number(weather.current?.precipitation))+' mm';$('updatedAt').textContent='자료 기준 '+String(air.current?.time||weather.current?.time||'').replace('T',' '); }catch(e){state.air=null;state.weather=null;['pm10','pm25','wind','temperature'].forEach(id=>$(id).textContent='--');$('pm10Status').textContent=$('pm25Status').textContent='불러오기 실패';$('windDir').textContent='정보 없음';$('rainfall').textContent='정보 없음';$('updatedAt').textContent='연결 오류';toast('환경 정보 조회 실패: '+e.message);}}
function moveTo(lat,lon,label,zoom=15){lat=Number(lat);lon=Number(lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;state.lat=lat;state.lon=lon;state.place=label||`위도 ${lat.toFixed(4)}, 경도 ${lon.toFixed(4)}`;$('locationLabel').textContent=state.place;$('reportLocation').value=state.place;$('coordText').textContent='선택 좌표: '+coordinate(lat,lon);state.map?.setView([lat,lon],zoom);state.selectedMarker?.setLatLng([lat,lon]);loadEnvironment();}
async function searchLocation(){const q=$('locationQuery').value.trim();if(q.length<2){toast('두 글자 이상의 지역명이나 주소를 입력해 주세요.');return;}const btn=$('searchLocation');btn.disabled=true;try{const data=await fetchJson('/api/geocode?q='+encodeURIComponent(q));if(!data.length)throw new Error('검색된 위치가 없습니다. 더 자세한 주소를 입력해 보세요.');moveTo(data[0].lat,data[0].lon,data[0].name,15);toast('검색한 위치로 이동했습니다.');}catch(e){toast('주소 검색: '+e.message);}finally{btn.disabled=false;}}
function initLocation(){ $('searchLocation').addEventListener('click',searchLocation);$('locationQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchLocation();}});$('myLocation').addEventListener('click',()=>{if(!navigator.geolocation){toast('이 브라우저는 위치 기능을 지원하지 않습니다.');return;}navigator.geolocation.getCurrentPosition(p=>{moveTo(p.coords.latitude,p.coords.longitude,'현재 위치 (정확한 주소 확인 전)',15);toast('현재 위치로 이동했습니다.');},()=>toast('위치 권한이 거부되었거나 위치를 찾지 못했습니다.'),{enableHighAccuracy:false,timeout:10000});});$('useMapPoint').addEventListener('click',()=>{$('reportLocation').value=state.place;toast('선택된 지도 위치를 적용했습니다.');});}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('이미지를 읽지 못했습니다.'));reader.readAsDataURL(file);});}
function loadPhoto(){ $('photoInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f){state.image=null;return;}if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5*1024*1024){e.target.value='';toast('5MB 이하 JPG, PNG, WEBP 이미지만 가능합니다.');return;}try{state.image=await fileToDataUrl(f);$('photoPreview').src=state.image;$('photoPreview').hidden=false;$('photoIcon').hidden=true;$('photoTitle').textContent=f.name;}catch(err){toast(err.message);}});}
function safeText(v,max=300){return String(v??'').slice(0,max);}
function renderAnalysis(a){$('analysisEmpty').hidden=true;$('analysisResult').hidden=false;$('analysisMode').textContent='무료 규칙 기반 현장 분석 · 추정 결과 (사진 자동 판독 없음)';$('analysisHeading').textContent=safeText(a.title,150);$('analysisSummary').textContent=safeText(a.summary,1200);for(const [id,items] of [['analysisCauses',a.causes],['analysisActions',a.actions]]){const ul=$(id);ul.replaceChildren();for(const item of (Array.isArray(items)?items:[]).slice(0,6)){const li=document.createElement('li');li.textContent=safeText(item,500);ul.append(li);}}}
function buildComplaint(data,a){const now=new Date().toLocaleString('ko-KR');const location=safeText(data.location,300), description=safeText(data.description,1500);const actions=Array.isArray(a?.actions)?a.actions.slice(0,3).map(x=>' - '+safeText(x,250)).join('\n'):'';return `[민원 제목] ${location} 인근 먼지 발생 관련 현장 확인 및 조치 요청\n\n[민원 내용]\n안녕하세요. 아래 장소에서 발생한 먼지와 관련하여 현장 확인 및 적절한 조치를 요청드립니다.\n\n1. 발생 장소: ${location}\n2. 발생 유형(제보자 선택): ${safeText(data.type,100)}\n3. 작성 일시: ${now} (실제 발생 시간과는 다를 수 있음)\n4. 피해 및 목격 내용:\n${description}\n\n5. 참고 사항: 주변 공기질 수치는 지역 모델 데이터로, 해당 현장에서 직접 측정한 수치가 아닙니다. 규칙 기반 분석은 원인 확인을 위한 참고 자료일 뿐 위반 사실을 입증하지 않습니다.\n\n6. 요청 사항:\n - 해당 장소의 먼지 발생 상황 확인\n - 필요시 비산먼지 저감조치 이행 여부 점검\n - 검토 결과 및 가능한 조치 사항 안내\n\n[참고용 대응 안내]\n${actions||' - 현장 상황 기록과 관할 환경 담당 부서 문의'}\n\n감사합니다.\n\n※ 제출 전에 실제 발생 시간·주소·사실관계·필요한 증빙을 직접 확인하고 수정해 주세요.`;}
// 비용 없이 브라우저에서 실행되는 규칙 기반 참고 분석. 사진 자체는 판독하지 않습니다.
function analyzeFree(data){
  const desc=data.description.toLowerCase();
  const causes=[];
  const actions=[
    '가능하면 안전한 거리에서 날짜·시간·작업 유형·먼지가 날리는 상황을 기록하세요. 사람 얼굴·차량번호는 공개하지 마세요.',
    '현장 근처에서 먼지가 심할 때는 접근을 피하고, 주변 주민·보행자의 안전을 우선하세요.',
    '관할 시·군·구 환경 담당 부서 또는 국민신문고에 현장 확인을 요청할 수 있습니다.'
  ];
  const add=(text)=>{if(!causes.includes(text))causes.push(text)};
  if(/공사|철거|토사|굴착|레미콘|시멘트|콘크리트|덤프|흙/.test(data.type+' '+desc)){
    add('공사·철거·토사 취급 과정에서 흙먼지나 자재 분진이 날릴 가능성');
    actions.push('공사현장 주변의 살수·방진막·차량 덮개 등 먼지 저감 조치 여부를 관찰해 기록하세요.');
  }
  if(/도로|차량|트럭|버스|화물|타이어|차가|교통/.test(data.type+' '+desc)){
    add('도로에 쌓인 먼지가 차량 통행과 바람에 의해 다시 떠오를 가능성');
    actions.push('차량 통행이 많은 시간대와 먼지가 심해지는 시점을 함께 기록해 보세요.');
  }
  if(/바람|강풍|날리|흩날/.test(desc))add('바람 때문에 이미 쌓여 있던 먼지가 주변으로 퍼질 가능성');
  if(/연기|매연|냄새|탄 냄새/.test(desc))add('먼지 외에 배출가스나 냄새 문제도 있을 가능성(현장 조사 전 단정 불가)');
  if(!causes.length)add('제보 장소 주변의 작업·차량 통행·지표면 상태 등 여러 요인이 원인일 가능성');
  const wind=Number(data.weather?.wind_speed_10m);
  const rain=Number(data.weather?.precipitation);
  const pm10=Number(data.air?.pm10);
  const pm25=Number(data.air?.pm2_5);
  const detail=[];
  if(data.weather && Number.isFinite(wind)){
    detail.push('주변 풍속 '+wind.toFixed(1)+' km/h');
    if(wind>=20)causes.push('풍속이 상대적으로 높아 쌓인 먼지가 재비산하기 쉬운 조건일 가능성');
  }
  if(data.weather && Number.isFinite(rain))detail.push('최근 제공 강수량 '+rain.toFixed(1)+' mm');
  if(data.air && Number.isFinite(pm10))detail.push('지역 모델 PM10 '+pm10.toFixed(1)+' µg/m³');
  if(data.air && Number.isFinite(pm25))detail.push('지역 모델 PM2.5 '+pm25.toFixed(1)+' µg/m³');
  const summary='선택한 유형과 목격 설명을 바탕으로 의심 가능한 상황을 분류했습니다. '+(detail.length?'참고 환경자료: '+detail.join(', ')+'. ':'')+'이 값은 현장 직접 측정치가 아니며, 실제 발생 원인·오염 농도·법 위반 여부를 확정할 수 없습니다. 업로드한 사진은 자동 판독하지 않습니다.';
  return {title:data.type+' · 현장 상황 참고 분석',summary,causes:causes.slice(0,5),actions:actions.slice(0,6)};
}
const LOCAL_REPORTS_KEY='air-detective-local-reports-v1';
function getLocalReports(){try{const d=JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY)||'[]');return Array.isArray(d)?d:[];}catch{return [];}}
function saveLocalReport(data){const list=getLocalReports();list.unshift({id:crypto.randomUUID?.()||String(Date.now()),location:data.location,type:data.type,description:data.description,lat:Math.round(data.lat*1000)/1000,lon:Math.round(data.lon*1000)/1000,createdAt:new Date().toISOString()});localStorage.setItem(LOCAL_REPORTS_KEY,JSON.stringify(list.slice(0,100)));}
async function submitReport(e){
  e.preventDefault();
  const data={location:$('reportLocation').value.trim(),type:$('dustType').value,description:$('damageDescription').value.trim(),lat:state.lat,lon:state.lon,weather:state.weather?{wind_speed_10m:state.weather.wind_speed_10m,wind_direction_10m:state.weather.wind_direction_10m,precipitation:state.weather.precipitation}:null,air:state.air?{pm10:state.air.pm10,pm2_5:state.air.pm2_5}:null};
  if(!data.location||!data.type||data.description.length<5){toast('장소·유형과 5자 이상의 피해 설명을 입력해 주세요.');return;}
  const result=analyzeFree(data);
  state.analysis=result;renderAnalysis(result);
  $('complaintDraft').value=buildComplaint(data,result);
  if($('shareConsent').checked){
    try{
      const health=await fetchJson('/api/health');
      if(health.reportsReady){
        await fetchJson('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,consent:true})});
        toast('무료 분석 완료 · 공개 제보 지도에 등록했어요.');
      } else {saveLocalReport(data);toast('무료 분석 완료 · 제보는 이 브라우저에만 저장됐어요 (공개되지 않음).');}
    }catch(err){saveLocalReport(data);toast('분석 완료 · 서버 저장이 불가능하여 이 브라우저에만 저장했어요.');}
    await loadReports();
  }else toast('무료 분석 및 민원 초안 생성 완료! (제보는 저장하지 않았어요)');
  $('analysisResult').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function maskLocation(s){return safeText(s,22).replace(/\d+(?:-\d+)?/g,'*');}
function initDraft(){ $('copyComplaint').addEventListener('click',async()=>{const txt=$('complaintDraft').value;if(!txt.trim()){toast('복사할 민원 초안이 없습니다.');return;}try{await navigator.clipboard.writeText(txt);toast('민원 초안을 복사했습니다.');}catch{ $('complaintDraft').select();document.execCommand('copy');toast('민원 초안을 복사했습니다.');}});$('downloadComplaint').addEventListener('click',()=>{const text=$('complaintDraft').value;if(!text.trim()){toast('저장할 민원 초안이 없습니다.');return;}const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='AirDetective_민원초안.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);});}
function initNav(){const links=document.querySelectorAll('[data-nav]');const update=()=>{let target='home';for(const id of ['home','report','hotspots','complaint']){const el=$(id);if(el&&el.getBoundingClientRect().top<160)target=id;}links.forEach(a=>a.classList.toggle('active',a.dataset.nav===target));};window.addEventListener('scroll',update,{passive:true});document.querySelectorAll('.sidebar a').forEach(a=>a.addEventListener('click',()=>document.querySelector('.sidebar').classList.remove('open')));$('menuToggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));}
document.addEventListener('DOMContentLoaded',()=>{initNav();initMap();initLocation();loadPhoto();initDraft();$('reportForm').addEventListener('submit',submitReport);loadEnvironment();loadReports();});

// ───── P-NET 01 · 무료 상세 제보 지도 ─────
// 생성형 AI / 유료 키 없이 작동합니다. 지도와 데이터 출처는 각각 표시합니다.
const mapUI={baseLayers:{},mode:'pins',heatLayer:null,reportLayers:null,markers:new Map(),remoteReady:false,remoteCount:0,selectedReport:null,searchResults:[],searchBusy:false};
const TYPE_COLORS={'공사장 비산먼지':'#9d6340','철거·토사 운반':'#9d6340','도로 재비산먼지':'#d28a40','화물차·차량 먼지':'#d28a40','원인 불명':'#81807c'};
function mapColor(type){return TYPE_COLORS[type]||'#81807c';}
function isLocalReport(r){return r._source==='local';}
function makeEl(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function validPoint(r){return Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))&&Math.abs(Number(r.lat))<=90&&Math.abs(Number(r.lon))<=180;}
function reportDate(s){const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'날짜 미상';}
function shortDescription(s,len=140){return safeText(s,len);}
function distanceMeters(a,b,c,d){const rad=Math.PI/180,x=(c-a)*rad,y=(d-b)*rad*Math.cos((a+c)*rad/2);return Math.hypot(x,y)*6371000;}
function filteredReports(visibleOnly=false){const type=$('mapTypeFilter').value,days=$('mapDateFilter').value,source=$('mapSourceFilter').value,keyword=$('mapKeyword').value.trim().toLowerCase();const cutoff=days==='all'?0:Date.now()-Number(days)*86400000;return state.reports.filter(r=>{if(!validPoint(r))return false;if(type!=='all'&&r.type!==type)return false;if(source==='local'&&!isLocalReport(r))return false;if(source==='public'&&isLocalReport(r))return false;if(cutoff&&!(new Date(r.createdAt).getTime()>=cutoff))return false;if(keyword&&!`${r.type} ${r.location} ${r.description}`.toLowerCase().includes(keyword))return false;if(visibleOnly&&!state.map.getBounds().contains([Number(r.lat),Number(r.lon)]))return false;return true;});}
function initMap(){
  state.map=L.map('map',{zoomControl:false,scrollWheelZoom:true,preferCanvas:true}).setView([state.lat,state.lon],13);
  L.control.zoom({position:'bottomright'}).addTo(state.map);
  const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  const light=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors &copy; CARTO'});
  mapUI.baseLayers={street,light};street.addTo(state.map);
  state.reportMarkers=L.layerGroup().addTo(state.map);mapUI.reportLayers=state.reportMarkers;
  state.selectedMarker=L.circleMarker([state.lat,state.lon],{radius:10,color:'#503629',fillColor:'#e8c8a1',fillOpacity:1,weight:3}).addTo(state.map).bindTooltip('내가 선택한 제보 위치',{direction:'top'});
  state.map.on('click',e=>{moveTo(e.latlng.lat,e.latlng.lng,`지도에서 선택한 위치 (${coordinate(e.latlng.lat,e.latlng.lng)})`,state.map.getZoom());$('mapPickedCoord').textContent=coordinate(e.latlng.lat,e.latlng.lng);toast('제보 위치를 선택했습니다. 위쪽 제보 입력란에 적용돼요.');});
  state.map.on('moveend zoomend',()=>{updateMapInfo();updateMapList();});
  setTimeout(()=>{state.map.invalidateSize();updateMapInfo();},250);
}
function initAdvancedMap(){
 const refresh=()=>renderMapAll();
 for(const id of ['mapTypeFilter','mapDateFilter','mapSourceFilter'])$(id).addEventListener('change',refresh);
 $('mapKeyword').addEventListener('input',refresh);
 $('mapWithinBounds').addEventListener('change',updateMapList);
 $('mapSort').addEventListener('change',updateMapList);
 $('mapLayerFilter').addEventListener('change',e=>{for(const layer of Object.values(mapUI.baseLayers))state.map.removeLayer(layer);mapUI.baseLayers[e.target.value].addTo(state.map);mapUI.baseLayers[e.target.value].bringToBack();});
 $('mapModePins').addEventListener('click',()=>setMapMode('pins'));
 $('mapModeHeat').addEventListener('click',()=>setMapMode('heat'));
 $('mapReset').addEventListener('click',()=>{for(const id of ['mapTypeFilter','mapDateFilter','mapSourceFilter'])$(id).value='all';$('mapKeyword').value='';$('mapWithinBounds').checked=true;$('mapSort').value='newest';setMapMode('pins');renderMapAll();toast('지도 필터를 초기화했습니다.');});
 $('mapFitReports').addEventListener('click',()=>{const rows=filteredReports();if(!rows.length){toast('현재 필터에 해당하는 제보가 없습니다.');return;}const bounds=L.latLngBounds(rows.map(r=>[Number(r.lat),Number(r.lon)]));state.map.fitBounds(bounds.pad(.25),{maxZoom:16});});
 $('mapMyLocation').addEventListener('click',()=>$('myLocation').click());
 $('mapRefresh').addEventListener('click',async()=>{await loadReports();toast('제보 목록을 다시 불러왔습니다.');});
 $('mapSearchButton').addEventListener('click',searchMapAddress);
 $('mapSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchMapAddress();}if(e.key==='Escape')$('mapSearchResults').hidden=true;});
 $('mapExport').addEventListener('click',()=>{const items=getLocalReports();const blob=new Blob([JSON.stringify(items,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='air-detective-my-reports.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`내 기기 제보 ${items.length}건을 저장했어요.`);});
 document.addEventListener('click',e=>{if(!e.target.closest('.map-search'))$('mapSearchResults').hidden=true;});
 window.addEventListener('resize',()=>state.map?.invalidateSize());
 updateMapInfo();
}
function updateMapInfo(){if(!state.map)return;const c=state.map.getCenter();$('mapZoomLabel').textContent=`확대 단계 ${state.map.getZoom()}`;$('mapCenterLabel').textContent=`${c.lat.toFixed(4)}°, ${c.lng.toFixed(4)}°`;$('mapBoundsCount').textContent=filteredReports(true).length.toLocaleString('ko-KR');}
function setMapMode(mode){mapUI.mode=mode;for(const [name,id] of [['pins','mapModePins'],['heat','mapModeHeat']]){$(id).classList.toggle('active',name===mode);$(id).setAttribute('aria-pressed',String(name===mode));}renderMapAll();}
function renderMapAll(){if(!state.map||!state.reportMarkers)return;const items=filteredReports();const heatMode=mapUI.mode==='heat';state.reportMarkers.clearLayers();mapUI.markers.clear();if(mapUI.heatLayer){state.map.removeLayer(mapUI.heatLayer);mapUI.heatLayer=null;}
 if(heatMode&&typeof L.heatLayer==='function'&&items.length){mapUI.heatLayer=L.heatLayer(items.map(r=>[Number(r.lat),Number(r.lon),.7]),{radius:25,blur:20,maxZoom:16,minOpacity:.25,gradient:{.2:'#ecd6ae',.45:'#c99160',.75:'#a55e37',1:'#6f342a'}}).addTo(state.map);}
 if(!heatMode||!mapUI.heatLayer){for(const r of items){const marker=L.circleMarker([Number(r.lat),Number(r.lon)],{radius:9,weight:2,color:'#fff8ee',fillColor:mapColor(r.type),fillOpacity:.95});const popup=makeEl('div','report-popup');popup.append(makeEl('strong','',safeText(r.type,80)));popup.append(makeEl('small','',`${isLocalReport(r)?'내 기기 저장':'공개 제보'} · ${reportDate(r.createdAt)}`));popup.append(makeEl('p','',shortDescription(r.description,240)));const detail=makeEl('button','popup-detail','제보 자세히 보기 →');detail.type='button';detail.addEventListener('click',()=>focusReport(r.id));popup.append(detail);marker.bindPopup(popup,{maxWidth:275});marker.addTo(state.reportMarkers);mapUI.markers.set(r.id,marker);}}
 $('mapVisibleCount').textContent=items.length.toLocaleString('ko-KR');$('mapWeekCount').textContent=state.reports.filter(r=>validPoint(r)&&new Date(r.createdAt).getTime()>Date.now()-7*86400000).length.toLocaleString('ko-KR');updateMapInfo();updateMapList();
 $('mapStatusMessage').textContent=heatMode?'밀집도는 시민 제보가 모여 있는 위치를 보여줍니다. 위험도나 실제 오염 농도가 아닙니다.':`지도에서 ${items.length}건의 제보를 표시 중입니다. 마커 클릭으로 자세한 정보를 확인하세요.`;
}
function updateMapList(){if(!state.map)return;const inBounds=$('mapWithinBounds').checked;const items=filteredReports(inBounds);const sort=$('mapSort').value;items.sort((a,b)=>sort==='oldest'?new Date(a.createdAt)-new Date(b.createdAt):sort==='distance'?distanceMeters(state.map.getCenter().lat,state.map.getCenter().lng,a.lat,a.lon)-distanceMeters(state.map.getCenter().lat,state.map.getCenter().lng,b.lat,b.lon):new Date(b.createdAt)-new Date(a.createdAt));$('mapListCount').textContent=`${items.length}건`;$('mapBoundsCount').textContent=filteredReports(true).length.toLocaleString('ko-KR');const list=$('recentReports');list.replaceChildren();if(!items.length){list.append(makeEl('div','map-list-empty','선택한 조건에 맞는 제보가 없습니다. 필터를 바꾸거나 지도 영역을 이동해 보세요.'));return;}
 for(const r of items.slice(0,120)){const card=makeEl('article','map-report-item');if(mapUI.selectedReport===r.id)card.classList.add('selected');card.append(makeEl('span','map-item-chip',isLocalReport(r)?'내 기기 제보':'공개 제보'));card.append(makeEl('h4','',safeText(r.type,70)));card.append(makeEl('p','',shortDescription(r.description,160)));card.append(makeEl('small','',`${reportDate(r.createdAt)} · ${maskLocation(r.location)}`));const buttons=makeEl('div','map-item-buttons');const focus=makeEl('button','map-zoom-report','지도에서 보기 ↗');focus.type='button';focus.addEventListener('click',()=>focusReport(r.id));buttons.append(focus);if(isLocalReport(r)){const del=makeEl('button','map-delete-report','삭제');del.type='button';del.addEventListener('click',()=>{if(!confirm('이 기기에 저장된 제보를 삭제할까요?'))return;localStorage.setItem(LOCAL_REPORTS_KEY,JSON.stringify(getLocalReports().filter(x=>x.id!==r.id)));loadReports();toast('내 기기 제보를 삭제했습니다.');});buttons.append(del);}card.append(buttons);list.append(card);}
}
function focusReport(id){const r=state.reports.find(x=>x.id===id);if(!r)return;mapUI.selectedReport=id;state.map.flyTo([Number(r.lat),Number(r.lon)],Math.max(16,state.map.getZoom()),{duration:.55});if(mapUI.mode==='heat')setMapMode('pins');setTimeout(()=>{mapUI.markers.get(id)?.openPopup();updateMapList();},650);}
async function searchMapAddress(){if(mapUI.searchBusy)return;const q=$('mapSearch').value.trim();if(q.length<2){toast('지역명이나 주소를 두 글자 이상 입력해 주세요.');return;}mapUI.searchBusy=true;$('mapSearchButton').disabled=true;const box=$('mapSearchResults');box.hidden=false;box.replaceChildren(makeEl('div','map-search-loading','장소 검색 중…'));try{const results=await fetchJson('/api/geocode?q='+encodeURIComponent(q));box.replaceChildren();if(!results.length){box.append(makeEl('div','map-search-loading','검색된 주소가 없습니다.'));return;}for(const item of results){const btn=makeEl('button','map-search-option',item.name);btn.type='button';btn.addEventListener('click',()=>{moveTo(item.lat,item.lon,item.name,16);$('mapSearch').value=item.name;box.hidden=true;document.getElementById('hotspots').scrollIntoView({behavior:'smooth',block:'start'});});box.append(btn);}}catch(e){box.replaceChildren(makeEl('div','map-search-loading','검색 실패: '+e.message));}finally{mapUI.searchBusy=false;$('mapSearchButton').disabled=false;}}
async function loadReports(){let remote=[],hasRemote=false;try{const h=await fetchJson('/api/health');if(h.reportsReady){remote=await fetchJson('/api/reports');hasRemote=true;}}catch(e){console.warn('공유 제보 확인 실패:',e.message);}const locals=getLocalReports().map(r=>({...r,_source:'local'}));const remotes=(Array.isArray(remote)?remote:[]).map(r=>({...r,_source:'public'}));state.reports=[...remotes,...locals].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));mapUI.remoteReady=hasRemote;mapUI.remoteCount=remotes.length;$('reportCount').textContent=hasRemote?`공개 ${remotes.length}건 · 내 기기 ${locals.length}건`:`내 기기 ${locals.length}건 · 공유 미연결`;$('mapDataStatus').textContent=hasRemote?'공유 연결됨':'내 기기 전용';renderMapAll();}
document.addEventListener('DOMContentLoaded',initAdvancedMap);
