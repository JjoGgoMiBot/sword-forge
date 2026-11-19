# 검 강화하기

GitHub Pages frontend + Cloudflare Worker/D1 account game.

## Rules v3

- Opening success probabilities: 95 → 94 → 92 → 90 → 87%. Levels +0 through +12 retain the previous curve. From +13: 20 → 11.5 → 6.5 → 3.5 → 1.8 → 1 → 0.5%. Final destruction stays 12%; long-term difficulty comes from lower success rates, downgrades, rebuilding and earned resources rather than longer animations.
- Dexterity, smith-condition and pity bonuses retain their full relative effect in the endgame. Focus converts prevented destruction into maintenance, so investing in it also helps protection-scroll users.
- `game-core.js` is the single rules implementation, shared by the browser and Worker.
- Low-level +1/+2 sales return at most 70% of the actual gold spent on that weapon. Free rolls and great successes cannot bypass this cap. Sales grant no smith XP.
- Costs grow at ×1.32 per level, with a starting 80G cost. Trade grants +1.5% sale value and −1.2% cost per point.
- Mine: 5 rounds / 260G. Chores: 4 rounds / 180G. Gold below 1,000 increases wages by 50%.
- Jobs have randomized targets and positions, 0.9s minimum per step, a 14s deadline, 5s failure/cancel cooldown, 6s completion cooldown, and 30 admissions per 10 minutes. Invalid or repeated steps pay nothing.
- `art/work/` contains 13 original SVG drawings for 12 job materials/tools and a pickaxe. The same item drawing appears beside its name in the order and the six choices; names and accessible button labels remain present.
- Unlimited charity, coin gambling, low-level sale XP, and accumulating more than two free rolls were removed. Protection costs 80 shards; destruction shards and event shard rewards were reduced.

## Account integrity

The Worker authenticates `/action`, draws outcomes using Web Crypto, calculates all economic changes and persists them with compare-and-swap against the complete previous save. Revisions reject stale-device actions; request IDs make network retries idempotent. `/save` rejects arbitrary snapshots, including those from old clients. `/register` starts a fresh 3,000G account, ignoring submitted progress. Existing accounts migrate their last server-held progress once; old snapshots are not retroactively proven legitimate.

Login is required to play. Web Locks serialize local actions across supported tabs. Browser storage is only a cache: other-tab updates trigger an authenticated reload and never import balances. Random jobs and server pacing deter fixed click macros and reward replay; they do not guarantee blocking an adaptive bot that reads prompts. No invasive device tracking or third-party CAPTCHA is used.

Job targets and choice labels are machine-readable in the authenticated response. Consequently a simple API/DOM bot can solve them: randomized layouts are not proof of human input. Quotas and server timing limit payouts; there is currently no server-verified human challenge. The shared GitHub Pages origin also means other scripts hosted under that same origin are within the local-storage token trust boundary. Dedicated platform authentication/domain isolation should precede sensitive cross-service integration.

Security hardening reserves each login guess atomically before password verification (five attempts, five-minute lock), requires 6–8 digits for new accounts while retaining legacy 4–8 digit logins, expires tokens after 30 days and revokes the current token on logout. Hashed-IP endpoint budgets and account-action budgets persist in D1; rejected bursts do not increment counters indefinitely, and an isolate cache avoids repeated D1 calls for already blocked clients. Responses are non-cacheable and request bodies are bounded while streaming. These application limits do not replace edge DDoS protection or database quota monitoring.

The 2026-11-20 hardening adds strict action fields/types, structured UUIDs, JSON-only request bodies, safe handling of prototype-named routes and malformed credentials, and a final token check inside the conditional economic write. Only a successful server enhancement that raises the weapon level establishes a ranked peak; selling, settings, jobs and +19 cracks do not rank inherited snapshots. Existing stored balances and previously recorded rankings are preserved; their historical legitimacy cannot be established retroactively from a snapshot.

New passwords use versioned PBKDF2-SHA256 at 100,000 iterations. Legacy 20,000-iteration hashes upgrade on successful login without resetting passwords. A rollback must retain `password.js` and its verifier once any account has upgraded. The front page uses a hash-based CSP, with inline HTML event attributes removed. After editing its inline JavaScript run `npm run update:csp`; the security suite verifies the hash.

Star blessing and Focus both convert avoided destruction into maintenance. Empty event claims, no-op protection settings and cancelling nonexistent jobs are rejected. A session generation guard prevents old asynchronous responses from replacing a new login/logout session. Unauthenticated public notification relaying is disabled; announcements are local-tab only until server attestation is implemented.

## Validation

`npm test` runs economic and exploit regression tests. `npm run balance` simulates 2,000 fresh-smith excursions per sale target with a seeded RNG; it declines events, uses no protection and stops on target or destruction. It is a diagnostic, not a guarantee of every build's long-term profitability.

`npm run test:security` runs the numbered 001–100 review matrix plus six additional ranking/session regressions against the actual Worker handler and disposable in-memory SQLite. This is a repeatable set of checks, not a claim that every possible attack has been enumerated. Real local workerd/D1 integration remains a separate check; set `FORGE_TEST_API` and `FORGE_TEST_DB_DIR` to isolate it from other dev sessions.

`npm run balance:progression` computes expected attempts and upgrade fees over `(weapon level, pity)` states. It models fixed untrained / legal smith-level-40 builds, the randomized weapon branches, downgrades, great successes and destruction. It compares absent versus always-stocked protection. Events, scroll acquisition, income farming and animation time are excluded; these results must not be presented as measured total play time. Late-stage sales were reduced alongside the improved odds to prevent the previous billion-gold rewards overwhelming the economy.

`npm run balance:lifetime -- --runs 10 --out result.json` runs the actual shared reducer from a fresh 3,000G / smith-level-1 game to the first +20, with seeded random draws and a virtual clock. It allocates earned stat points, farms and sells +8/+10/+12 weapons for funds, mines if necessary, buys protection from earned shards, optionally buys affordable merchant scrolls and resolves events. It respects work quotas and cooldowns. The model adds 150ms network latency, a 1s manual response/restart and actual animation durations; it assumes correct work answers and no breaks. It is one reproducible play strategy, not optimal play or measured user play time. Random outcomes have a broad tail: a long-term goal is not a guaranteed minimum number of hours for every player.

For local server integration tests:

1. Install `server` dev dependencies and initialize disposable D1: `wrangler d1 execute sword-forge --local --file schema.sql`.
2. Run `wrangler dev --port 8797` from `server/`.
3. Run `npm run test:api` from the repository root with Node 22+ (`node:sqlite` enabled). The tests target only loopback and create disposable local accounts. Security tests modify only this checkout's local SQLite fixtures to verify legacy PINs and token expiration.

## Deployment

Back up current progress with `wrangler d1 execute sword-forge --remote --file backup-v2.sql` from `server/` before deploying v3. This creates `player_saves_pre_v3` once, preserving progress without copying password hashes/tokens. Deploy the Worker (`wrangler deploy`) and publish the matching frontend plus `game-core.js` on the GitHub Pages branch. Already-open old pages must refresh; obsolete snapshot saves intentionally fail. Never place Worker credentials or real account tokens in the repository.

Before deploying security hardening to an existing database, run `wrangler d1 execute sword-forge --remote --file security-schema.sql` from `server/`. This adds only the request-budget table/index; existing player records remain intact.
