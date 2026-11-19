CREATE TABLE IF NOT EXISTS land_discord_links (
  player_key TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  linked INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS land_link_codes (
  hash TEXT PRIMARY KEY,
  player_key TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS land_codes_player ON land_link_codes(player_key);
CREATE TABLE IF NOT EXISTS land_channels (
  room TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
