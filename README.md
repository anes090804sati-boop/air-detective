# Air Detective V4.8 — 공용 Overpass 서버 없이 작동하는 시설 지도

이 버전은 **매번 Overpass를 호출하지 않습니다.** 429 오류를 피하기 위해 GitHub Actions가 공개 OSM 대한민국 추출본(Geofabrik)을 처리하여 `data/facilities.json` 파일로 저장하는 구조입니다.

## 처음 딱 한 번 설정

1. ZIP을 풀어 **`.github/workflows/build-facilities.yml` 및 `scripts/` 폴더를 포함한 모든 파일**을 GitHub 저장소의 동일한 경로에 업로드합니다.
2. **Commit changes**를 누르면 GitHub Actions에서 `Build facility snapshot` 작업이 자동으로 시작됩니다. 시작되지 않으면 GitHub 저장소의 **Actions → Build facility snapshot → Run workflow**를 누르세요.
3. 작업의 `Commit snapshot into repository` 단계에서 권한 오류가 뜨면 **Settings → Actions → General → Workflow permissions**에서 `Read and write permissions`를 허용한 다음 작업을 다시 실행하세요. 조직 정책에 따라 선택할 수 없을 수도 있습니다.
4. 실행이 성공하면 `data/facilities.json`에 실제 등록 시설이 채워지고, 자동 커밋 후 Vercel이 재배포합니다.
5. `https://air-detective.vercel.app/data/facilities.json`에서 `status: ready`와 `features`를 확인합니다. `not_generated`이면 아직 자료 생성이 완료되지 않은 것입니다.

## 작동 방식

- OpenStreetMap의 대한민국 공개 추출 데이터를 읽어 `landuse=construction`, `building=construction`, `highway=construction`, `landuse=industrial`, `landuse=quarry` 객체들의 위치를 뽑습니다.
- 지도 이동과 확대·축소는 **저장된 JSON에서 브라우저 내 필터링**하므로 외부 Overpass 429가 발생하지 않습니다.
- 최초 데이터 생성은 GitHub Actions에서 한 번 실행해야 하고, 주 1회 갱신을 시도합니다. 서버/API 키 결제 필요 없습니다.
- GitHub Actions 실행이나 다운로드 실패 시 이전 스냅샷이 유지됩니다. 최초 실행이 실패했다면 지도에 **자료 생성 필요** 메시지가 나타납니다. 성공하기 전에 마커가 보인다고 주장하지 않습니다.

## 중요한 한계

OSM에 지도 등록되지 않은 공사장은 나오지 않습니다. 현재 공사 중인지도 검증되지 않으며, 산업시설이 실제로 대기를 오염시키고 있다는 뜻이 아닙니다. 전체 공사장과 동일하지 않습니다. © OpenStreetMap contributors · ODbL.

## 업로드 관련

예전의 `api/facilities.js` 및 `server.js`, `package.json`은 V4.8 지도에 사용하지 않습니다. GitHub에서 지워도 됩니다. **새 `vercel.json`을 반드시 적용하세요.**
