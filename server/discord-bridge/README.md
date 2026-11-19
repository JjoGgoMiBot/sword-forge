# Optional Discord adapter

Runs beside the existing Python bot, using its current `DISCORD_TOKEN`. It never reads or modifies the bot's economy or birth-data databases and never bulk-overwrites application commands. It registers only:

- `/랜드`: open the town.
- `/랜드연결 코드`: link the current Discord user to the web resident; response is ephemeral.
- `/랜드방연결 채널`: administrator / Manage Guild action that enables an ordinary text channel or voice channel's text bridge.
- `/랜드방해제 채널`: stop the bridge and close that private room's sockets.

The bridge adds missing commands if the main bot's existing command sync removes them after restart. The original bot does not need a restart to add the adapter.

## Running

Use a Python environment with `discord.py`, `aiohttp`, and `python-dotenv` (the existing bot environment supplies these). Pass one JSON configuration line through **stdin**, not command-line flags:

```
{"api":"https://your-worker.example","secret":"<LAND_BRIDGE_SECRET>","dotenv":"<existing-bot-env-path>","state":"<private-state-directory>/bridge.sqlite"}
```

Protect this configuration. Keep the secret in an operating-system secret store; the task's local operator scripts use Windows user-bound DPAPI encryption. `bridge.sqlite` stores delivery mappings and a temporary inbound retry queue, so keep it private and outside Git. Ordinary logs omit message text and secrets.

The bot needs Message Content Intent and the target channel's View Channel, Read Message History and Send Messages permissions. Voice channels additionally require Connect. Each web user must separately have the relevant permissions; bot access does not grant users access.

## Delivery rules

Land posts use `[마을 · 작성자]` with all mentions disabled. Users are not impersonated with user tokens or webhooks. The bridge ignores bot-authored incoming messages to prevent relay loops; attachment-only messages, reactions and stickers are outside v1 scope.

Outgoing messages have deterministic nonces plus durable local delivery mappings. An ambiguous delivery older than two minutes is checked against recent Discord history; if it cannot be confirmed it is flagged rather than blindly reposted. Incoming creates/edits/deletes use a durable queue and server acknowledgments. The server stores at most 200 completed chat messages per room; pending deliveries are retained until resolved.

Voice audio is handled by Discord itself. This adapter relays **text** in ordinary text channels and voice channels, not audio, transcription or spatial voice.

The adapter must stay running for the Discord relay to work. Public land chat, games and saved data continue on Cloudflare independently. The task does not create an automatic startup task or purchase hosting for this process.
