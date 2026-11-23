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
CREATE TABLE IF NOT EXISTS land_choco_rank (
  player_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  balance INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS land_choco_rank_balance ON land_choco_rank(balance DESC);
CREATE TABLE IF NOT EXISTS land_admin_log (
  id TEXT PRIMARY KEY,
  admin_key TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  target_key TEXT NOT NULL,
  target_name TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS land_admin_log_created ON land_admin_log(created DESC);
