# 쪼꼬미랜드

`/land/` is the web town. The repository root remains the existing forge game.

## Shipped scope

- Hand-painted sprite-based Canvas 2.5D town (1600 × 1120), WASD/arrows, normalized diagonal walking, no jump, E at entrances, touch direction keys.
- The existing nickname account is the resident identity. The forge opens with the same account and authoritative save. No replacement or copying of forge balances.
- Avatar and land-only Choco wallet in a per-account SQLite Durable Object. Daily attendance, bounded rescue, quiz rewards, immutable request IDs, ledger and persistent blackjack rounds.
- Slots, blackjack, odd/even, bot RPS, individual horse races and individual quizzes. Shared horse races / player RPS are future work; the UI labels individual modes.
- 78 original Korean tarot cards from the user's existing bot: server-fixed KST daily draw, eight-card spread with three selections, dictionary and history. Existing bot saju/compatibility is accessed in Discord.
- Five public rooms, up to 20 distinct resident connections per room. Real-time presence, server-validated movement, recent chat, reconnection and room isolation.
- Optional Discord text-chat bridge, explicit account linking and administrator ordinary-text / voice-channel linking. Bot and member permissions are both required; private Discord chat is not published into public rooms.

Avatar clothing, hats, skin and accessories persist across devices. The side chat can show a registered ordinary Discord text channel independently from the current world room.

Voice audio currently stays in Discord. The voice button opens the selected Discord voice channel. Speaking-start/stop integration is implemented using the official Embedded App SDK, but remains unavailable until the Discord Activity, OAuth client secret and rpc.voice.read permission are configured. No fake browser microphone status is used. A full Activity launch surface and spatial/proximity voice are not configured by this release.

## Development

Use the existing Wrangler installation or install the repository's server tooling. Initialize **disposable local** D1 with `schema.sql`, `ranking-schema.sql` once if its columns are absent, and `land-schema.sql`. A local `.dev.vars` needs `LAND_SIGNING_KEY`; bridge tests also use `LAND_BRIDGE_SECRET`. Never commit real secrets.

Run a static server for the repository on `127.0.0.1:5188`, and Wrangler with an explicit config and unique dev name on `127.0.0.1:8907`. The land client uses that local API; the embedded forge receives `?land=1` to use it too. The existing forge's standalone dev API stays on 8797.

```powershell
npm test
$env:FORGE_TEST_API='http://127.0.0.1:8907'
npm run test:api
npm run test:land
```

`tests/land-api.test.mjs` needs a **fresh disposable Worker** (`wrangler dev -c server/wrangler.toml --persist-to <빈 폴더>` after applying the four schema files); a preview mock or a reused dev state on 8907 fails it on purpose. The API tests must never target production. SQLite fixture writes only access local `.wrangler/state`.

## Deployment

Keep the existing Worker name `sword-forge-api`. Apply the additive `server/land-schema.sql` migration. Configure `LAND_SIGNING_KEY`, `LAND_BRIDGE_SECRET` and `DISCORD_BOT_TOKEN` as Worker secrets, then deploy the Worker including both new SQLite Durable Object classes. Publish `/land/` with the repository's existing GitHub Pages deployment. Do not remove the new Durable Object classes when changing the forge code.

## Data boundaries

Forge gold/shards/scrolls, land Choco, and existing Discord guild Choco are separate. No exchange or transfers are implemented. Discord account linking proves ownership and grants eligible room access; it does not import or aggregate guild balances. Daily tarot uses a linked Discord identity for subsequent new draws; an already drawn day's card stays fixed.

Cloud sessions are bearer-token based and share the existing GitHub Pages origin's trust boundary. This release does not claim human-proof automation prevention or 20-user load certification. Two real browser clients are covered by browser QA; capacity needs operational measurement.

## Artwork

`assets/town-illustrated-alpha.png` is the original generated gouache/colored-pencil sprite atlas with real alpha. `art-source/illustration-prompts.md` records generation and extraction prompts. Runtime draw ordering, paper-grain terrain, avatar palette variants and walking interpolation live in `scene-illustrated.js`. Blender studies are not used by the shipped renderer.

The shipped look is photoreal: `assets/photo/*.webp` (town atlas in the same 4×2/444px layout, grass and path ground tiles, slot symbols, coin, arcade props, card back) generated with ChatGPT from the prompts in `art-source/photo-prompts.md`. Every photo asset has a painted fallback: `art()` points at `assets/photo/`, a capture-phase image `error` listener swaps a failed WebP back to the matching `assets/*.png`, CSS photo overrides only apply once `html.photo-ok` is set by a probe, and `scene-illustrated.js` falls back to the painted atlas and paper floor if the photo atlas or ground tiles fail (`#stage[data-art]` reports which one is live).

## 관리자 패널 (`land/admin.html`)
- 로그인은 마을과 같은 이름·비밀번호. 관리자 판별은 연결된 디스코드 ID가 Worker 환경값 `LAND_ADMIN_IDS`(쉼표 구분)에 있는지로 서버가 한다. 값은 배포 때 사용자가 직접 비밀값/변수로 설정한다(저장소에 두지 않는다).
- 기능: 주민 검색(이름·디스코드 ID), 초코 지급/회수(회수는 잔액 아래로 못 내려감, 1회 최대 10,000,000), 조작 기록(D1 `land_admin_log`). 관리자 API는 `/land/admin/*`, 관리자가 아니면 403.
- 시험: `tests/land-admin.test.mjs`(단위, `npm test`에 포함), `tests/land-admin-api.test.mjs`(`npm run test:api`에 포함). API 시험은 새로 띄운 로컬 Worker에 `--var LAND_ADMIN_IDS:<ID> --var LAND_BRIDGE_SECRET:<값>`을 주고 `FORGE_TEST_ADMIN_ID`, `FORGE_TEST_BRIDGE_SECRET`, `FORGE_TEST_API`를 맞춰 돌린다. 같은 저장소 상태에서 두 번 돌리면 디스코드 ID가 이미 연결돼 실패하므로 매번 새 `--persist-to`를 쓴다.
