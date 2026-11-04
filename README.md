# Air Detective — P-NET 01 (갈색 테마 / 웹 배포용)

공사장·도로 먼지 피해 기록, 지역 기상·대기질 모델 정보, OpenAI 사진/설명 분석, 민원 초안 및 시민 제보 지도를 제공하는 웹앱입니다.

## 보안: 반드시 먼저 확인하세요

- 채팅/공개 저장소 등에 올린 OpenAI API 키는 **즉시 폐기(Revoke)** 하고 새 키를 만드세요.
- **키를 채팅으로 전송하거나 `index.html`/`script.js`/GitHub에 넣지 마세요.**
- 새 키는 Vercel 프로젝트의 **Settings → Environment Variables → `OPENAI_API_KEY`** 에만 입력하세요.
- 공개 앱은 AI 요청 비용을 발생시킵니다. OpenAI 사용량 한도를 설정하고 Vercel Firewall/CAPTCHA 등 악용 방어를 추가하세요. 현재 간단한 메모리 기반 요청 제한은 서버리스 환경에서 완전한 방어가 아닙니다.

## Vercel에 배포

1. 이 폴더 내용을 새 **GitHub 비공개 저장소**에 업로드합니다. `.env` 파일은 업로드하지 마세요.
2. https://vercel.com/new 에서 GitHub 저장소를 Import 합니다.
3. Framework Preset은 **Other**, Root Directory는 파일이 들어 있는 폴더 루트, Build Command/Output Directory는 기본값으로 둡니다.
4. **Settings → Environment Variables**에서 아래 값을 등록합니다.
   - `OPENAI_API_KEY`: 새로 발급받은 OpenAI API 키(필수: AI 분석)
   - `OPENAI_MODEL`: `gpt-4.1-mini` (선택)
   - `SUPABASE_URL`: Supabase 프로젝트 URL(필수: 제보 공유)
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase 서버 전용 `service_role` 키(필수: 제보 공유; 절대 브라우저에 노출 금지)
   - `CONTACT_EMAIL`: Nominatim 사용 정책을 위한 실제 운영자 연락 이메일(주소 검색 시 권장)
5. Supabase https://supabase.com 에서 프로젝트를 생성하고 SQL Editor에서 `supabase.sql`을 실행합니다.
6. Vercel에서 **Deploy** 후 생성된 `https://...vercel.app` 링크를 공유합니다. 환경변수 추가/변경 시 **Redeploy** 해주세요.

**참고**: Supabase는 2026년 새로운 `sb_secret_...` 방식의 키를 제공합니다. 이 프로젝트는 기존 JWT 형식 `service_role` 키를 대상으로 REST API 요청을 작성했습니다. 프로젝트 대시보드에서 Legacy API Keys를 통해 발급되는지 확인하세요. 새 키 방식만 사용한다면 서버의 인증 헤더 처리를 그 방식에 맞게 변경해야 합니다.

### 테스트

- 배포 주소에서 `/api/health`를 열면 `aiReady`와 `reportsReady` 확인 가능
- `aiReady: true` = OpenAI 서버 설정 완료
- `reportsReady: true` = Supabase 관련 환경변수 존재(실제 테이블/권한 검사는 별도)
- 사이트에서 지역 검색, AI 분석, 제보 공유가 동작하는지 직접 확인하세요.

## 로컬 실행

Node.js 20 이상 필요:

```bash
npm install
cp .env.example .env  # Windows에서는 복사 명령이나 탐색기 사용
# .env에 키 입력
npm start
```

브라우저에서 http://localhost:3000 접속. 로컬에서 Supabase가 없을 경우 제보를 `reports.json`에 임시 저장합니다. Vercel에서는 데이터베이스 없는 제보 공유를 차단해 휘발성 저장을 방지합니다.

## 데이터 / 제약

- **Open-Meteo**: PM10·PM2.5 및 기상 정보(지역 모델/자료, 현장 실측 아님). 서비스 이용 약관과 API 제한을 확인하세요.
- **OpenStreetMap/Leaflet**: 지도, **Nominatim**: 주소 검색. 공개 서비스는 제공자 사용 정책·호출 한도를 준수해야 합니다.
- **AirKorea 연동 미구현**: 현재 앱의 PM 수치를 AirKorea 관측소 값으로 오인하면 안 됩니다.
- **공개 지도**: 공유 동의 시 제보 장소·유형·설명·좌표(소수 셋째 자리 반올림)를 저장·공개합니다. 사진은 저장하거나 공개하지 않습니다. 개인 신원, 상세 주소 및 민감정보가 설명에 들어가지 않도록 주의하세요.
- AI 원인 분석은 추정이며 법 위반·실측 오염을 확정하지 않습니다. 민원은 초안만 제공합니다.
- **현재 상태: 시연용 MVP**. 실제 시민 대상 서비스 운영에는 제보 삭제 및 신고 처리, 부적절한 게시물 차단, 악용 방지, 보존 기간·개인정보 안내 등이 추가로 필요합니다.

## 폴더

- `index.html` — 메인 화면
- `style.css` — 갈색/크림색 반응형 디자인
- `script.js` — 지도, 데이터 호출, 사진 선택, 민원 작성
- `server.js` — Express API, OpenAI, Supabase REST
- `api/index.js` + `vercel.json` — Vercel 서버리스 라우팅
- `supabase.sql` — 공유 제보 테이블 생성
