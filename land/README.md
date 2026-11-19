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

The API tests must never target production. SQLite fixture writes only access local `.wrangler/state`.

## Deployment

Keep the existing Worker name `sword-forge-api`. Apply the additive `server/land-schema.sql` migration. Configure `LAND_SIGNING_KEY`, `LAND_BRIDGE_SECRET` and `DISCORD_BOT_TOKEN` as Worker secrets, then deploy the Worker including both new SQLite Durable Object classes. Publish `/land/` with the repository's existing GitHub Pages deployment. Do not remove the new Durable Object classes when changing the forge code.

## Data boundaries

Forge gold/shards/scrolls, land Choco, and existing Discord guild Choco are separate. No exchange or transfers are implemented. Discord account linking proves ownership and grants eligible room access; it does not import or aggregate guild balances. Daily tarot uses a linked Discord identity for subsequent new draws; an already drawn day's card stays fixed.

Cloud sessions are bearer-token based and share the existing GitHub Pages origin's trust boundary. This release does not claim human-proof automation prevention or 20-user load certification. Two real browser clients are covered by browser QA; capacity needs operational measurement.

## Artwork

`assets/town-illustrated-alpha.png` is the original generated gouache/colored-pencil sprite atlas with real alpha. `art-source/illustration-prompts.md` records generation and extraction prompts. Runtime draw ordering, paper-grain terrain, avatar palette variants and walking interpolation live in `scene-illustrated.js`. Blender studies are not used by the shipped renderer.
