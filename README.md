# Air Detective — P-NET 01 · 무료 분석 + 상세 핫스팟 지도

## 핵심 기능
- 갈색/베이지 대시보드, 반응형 UI
- **OpenAI API 없이 100% 코드 내 무료 규칙 기반 원인 추정**: 시민의 먼지 유형·설명·주변 바람 및 대기 모델값을 이용. 생성형 AI가 아니고 사진을 자동 해석하지 않습니다.
- **Open-Meteo** 지역 PM10·PM2.5 모델 데이터와 기상 정보 (대상 지점의 직접 측정 아님)
- 제보 후 민원 초안 생성·수정·복사·TXT 내려받기
- **상세 제보 지도**: OSM 기반 확대/축소, 현재 위치, 주소 검색 결과 선택, 지도 클릭 위치 지정, 마커와 팝업, 제보 목록/찾기/정렬, 지도 영역 내 필터, 유형·기간·출처 필터, 지도 전체 제보 보기, 일반/밝은 지도, 밀집도(Leaflet.heat), 지도 상태 통계, 내 제보 JSON 내보내기 및 기기 내 제보 삭제

### 지도와 정보 해석 시 주의
- 마커와 히트맵은 **시민 제보 수·위치**이지 미세먼지 농도, 법 위반, 건강 위험도를 뜻하지 않습니다.
- 지도에 저장하는 좌표는 소수 셋째 자리(약 100m 단위)로 반올림합니다. 사진은 공유 저장하지 않습니다. 입력 설명에 개인정보를 넣지 마세요.
- 오픈 지도/주소 검색/기상 데이터는 외부 무료 서비스의 이용 정책과 트래픽 제한의 영향을 받습니다. 영구 무제한 운영을 보장하지 않습니다.
- 사진은 브라우저에서만 미리보기되며 자동 분석하거나 공유되지 않습니다.

## Vercel + GitHub 기존 프로젝트 업데이트
1. ZIP을 압축 해제하세요.
2. 기존 GitHub 저장소 `air-detective`의 루트에 압축 해제한 **모든 파일/폴더를 동일한 경로로 덮어씁니다**. `index.html`, `style.css`, `script.js`, `server.js`, `api/index.js`, `vercel.json`, `package.json`, `supabase.sql`, `README.md` 등. 새 폴더 하나만 올리면 웹 루트가 잘못될 수 있습니다.
3. GitHub에서 `Commit changes`를 누르세요. 연결된 Vercel 프로젝트는 변경 사항을 자동 재배포합니다.
4. Vercel Deployments에서 Ready 확인 후 `https://air-detective.vercel.app`을 열고 강력 새로고침(Ctrl+Shift+R)하세요.
5. 이미 Vercel에 설정한 `OPENAI_API_KEY`는 **이번 버전에서 필요 없으므로 제거**할 수 있습니다. 과거 채팅으로 공개된 키는 OpenAI 대시보드에서 반드시 폐기하세요.
6. Vercel 로그인 없이 공개하려면 Project Settings → Deployment Protection에서 **Production 도메인 공개**가 되도록 Standard Protection/None(현재 요금제 선택지에 따름)으로 설정하세요.

## 제보 공유 기능 (선택)
서버와 OpenAI API 키 없이도 무료 분석·지도 탐색·내 기기 제보 기능은 작동합니다.

- 기본값(별도 DB 미설정): 공유되지 않고 **localStorage**에 내 기기에서만 저장됩니다. 다른 방문자에게 보이지 않으며 브라우저 삭제 시 사라집니다.
- 모든 방문자가 공개 제보를 공유하려면 **Supabase 무료 플랜** 데이터베이스 연결이 필요합니다.
  1. Supabase에서 프로젝트 만들기 → SQL Editor에서 `supabase.sql` 실행.
  2. Vercel Project Settings → Environment Variables에 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 추가하고 Redeploy.
  3. 비밀 키는 절대 GitHub·HTML·클라이언트 JS에 넣지 마세요.
- DB 없이도 민원 초안 생성·환경 데이터 조회·지도 주소 검색은 가능하지만, Vercel의 API 라우트(`/api/geocode`)가 정상 배포되어야 주소 검색이 작동합니다.
- 운영 환경에선 스팸 방지, 삭제 요청, 게시물 신고, 사용자 데이터 보호 및 서비스 이용 약관이 추가로 필요합니다. 현재 프로젝트는 학습·발표용 MVP입니다.

## 로컬 개발
Node.js 20 이상에서
```
npm install
npm start
```
접속: `http://localhost:3000`

## 파일
- `index.html` 화면 구조
- `style.css` 갈색 테마 및 지도 레이아웃
- `script.js` 무료 규칙 분석, Open-Meteo, Leaflet 상세 지도, 민원 기능
- `server.js` Express 서버와 서버 경유 Nominatim 주소 검색 / 선택적 제보 공유
- `api/index.js` Vercel 서버 함수 진입점
- `vercel.json` `/api/` 재작성
- `supabase.sql` Supabase 선택 설정

무료 분석은 AI 모델 추론이 아닙니다. 분석 결과를 확정적 진단·법 위반 판정으로 사용하지 마세요.
