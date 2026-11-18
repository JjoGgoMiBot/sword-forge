-- One-time rollback snapshot of progress only. No password hashes or tokens.
CREATE TABLE IF NOT EXISTS player_saves_pre_v3 AS SELECT key,save,saved FROM players;
