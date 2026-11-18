-- Server-verified peak weapon level for the public ranking.
-- Starts at 0 for everyone: only levels reached through server-rolled /action count
-- (legacy client-trusted saves are not ranked, and no achievement time is invented).
ALTER TABLE players ADD COLUMN best INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN best_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS players_rank ON players(best DESC, best_at ASC, key ASC);
