# Air Detective — P-NET 01 | 지도 없는 무료 버전

## 포함 기능
- 갈색/베이지 반응형 디자인
- 지역/주소 검색과 현재 위치 기반 Open-Meteo PM10, PM2.5 및 날씨 조회
- 먼지 피해 장소·유형·설명·증거 사진 선택 및 미리보기
- 무료 규칙 기반 먼지 원인 추정 (OpenAI API, 비용, 크레딧 불필요)
- 민원 초안 생성·수정·복사·TXT 다운로드

## 제거된 기능
- 핫스팟 지도 전체, 지도 관련 메뉴, 지도 SDK(Leaflet), 지도 마커 및 히트맵
- 제보 공유 및 위치를 지도에 저장하는 옵션
- 제보는 기본적으로 서버에 저장되지 않습니다. 사진은 브라우저 미리보기용이며 AI 판독하지 않습니다.

## 기존 GitHub/Vercel 배포 업데이트
1. ZIP 파일을 압축 해제합니다.
2. GitHub `air-detective` 저장소의 루트에 `index.html`, `style.css`, `script.js`, `README.md`를 새 파일로 교체하고 커밋합니다. `api/index.js`, `server.js`, `package.json`, `vercel.json`도 동봉되어 있으므로 필요하면 함께 교체합니다.
3. 기존 `supabase.sql`은 지도/공유 제보에만 사용했으므로 GitHub에서 제거해도 됩니다. 삭제하지 않더라도 웹 기능에는 영향을 주지 않습니다.
4. Vercel Deployments에서 새 커밋이 Ready인지 확인 후 `https://air-detective.vercel.app`에서 Ctrl+Shift+R로 강력 새로고침합니다.
5. OpenAI API 키와 Supabase 키는 이 버전에서 필요 없습니다. Vercel 환경변수에서 제거할 수 있습니다. 과거 채팅에 공개된 OpenAI 키는 폐기하세요.

## 주의
- 규칙 기반 분석이지 사진을 판독하는 생성형 AI가 아닙니다.
- Open-Meteo 데이터는 지역 모델값이며 특정 현장의 직접 측정값이 아닙니다.
- 주소 검색에 `/api/geocode` 엔드포인트가 사용되므로 Vercel 서버 함수가 정상 동작해야 합니다.

로컬 실행: `npm install` 후 `npm start` (Node.js 20 이상)
