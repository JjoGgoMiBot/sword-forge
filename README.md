# 검 강화하기

GitHub Pages frontend + Cloudflare Worker/D1 account game.

## Rules v3

- Opening success probabilities: 95 → 94 → 92 → 90 → 87%. Final +19 → +20 base chance: 0.1%.
- `game-core.js` is the single rules implementation, shared by the browser and Worker.
- Low-level +1/+2 sales return at most 70% of the actual gold spent on that weapon. Free rolls and great successes cannot bypass this cap. Sales grant no smith XP.
- Costs grow at ×1.32 per level, with a starting 80G cost. Trade grants +1.5% sale value and −1.2% cost per point.
- Mine: 5 rounds / 260G. Chores: 4 rounds / 180G. Gold below 1,000 increases wages by 50%.
- Jobs have randomized targets and positions, 0.9s minimum per step, a 14s deadline, 5s failure/cancel cooldown, 6s completion cooldown, and 30 admissions per 10 minutes. Invalid or repeated steps pay nothing.
- Unlimited charity, coin gambling, low-level sale XP, and accumulating more than two free rolls were removed. Protection costs 80 shards; destruction shards and event shard rewards were reduced.

## Account integrity

The Worker authenticates `/action`, draws outcomes using Web Crypto, calculates all economic changes and persists them with compare-and-swap against the complete previous save. Revisions reject stale-device actions; request IDs make network retries idempotent. `/save` rejects arbitrary snapshots, including those from old clients. `/register` starts a fresh 3,000G account, ignoring submitted progress. Existing accounts migrate their last server-held progress once; old snapshots are not retroactively proven legitimate.

Anonymous play remains local. Web Locks serialize local actions across supported tabs. Offline saves cannot be made tamper-proof. Random jobs and server pacing deter fixed click macros and reward replay; they do not guarantee blocking an adaptive bot that reads prompts. No invasive device tracking or third-party CAPTCHA is used.

## Validation

`npm test` runs economic and exploit regression tests. `npm run balance` simulates 2,000 fresh-smith excursions per sale target with a seeded RNG; it declines events, uses no protection and stops on target or destruction. It is a diagnostic, not a guarantee of every build's long-term profitability.

For local server integration tests:

1. Install `server` dev dependencies and initialize disposable D1: `wrangler d1 execute sword-forge --local --file schema.sql`.
2. Run `wrangler dev --port 8797` from `server/`.
3. Run `npm run test:api` from the repository root. The test targets only loopback and creates disposable local accounts.

## Deployment

Back up current progress with `wrangler d1 execute sword-forge --remote --file backup-v2.sql` from `server/` before deploying v3. This creates `player_saves_pre_v3` once, preserving progress without copying password hashes/tokens. Deploy the Worker (`wrangler deploy`) and publish the matching frontend plus `game-core.js` on the GitHub Pages branch. Already-open old pages must refresh; obsolete snapshot saves intentionally fail. Never place Worker credentials or real account tokens in the repository.
