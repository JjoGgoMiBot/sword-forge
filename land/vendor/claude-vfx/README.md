# Claude VFX 원본 연결

복사 원본: `C:/Users/admin/Desktop/AI/projects/creative/vfx/`.
`vfx-engine.js`, `presets.js`, `vfx-gl.js`를 수정 없이 포함했다.
네트워크 CDN과 엔진 서버 없이 브라우저에서 실행한다. `land/vfx.js`가 엔진의 실제 `impact`, `update`, `render`, `fromColor` API를 사용한다.
오락관의 카드 배분·결과·발사 연출을 연결하며, 판정·재화 처리는 서버가 계속 담당한다.
움직임 줄이기, 탭 가림, 화면 이탈, 이펙트 교체 시 재생을 중단한다. 화면당 한 캔버스, 입자 80개 이하, 1.45초 한도로 제한한다.
