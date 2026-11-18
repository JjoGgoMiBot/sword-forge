CREATE TABLE IF NOT EXISTS players (
  key   TEXT PRIMARY KEY,         -- 닉네임 소문자(중복 판정용)
  name  TEXT NOT NULL,            -- 표시용 닉네임
  salt  TEXT NOT NULL,
  hash  TEXT NOT NULL,            -- PBKDF2(비밀번호)
  save  TEXT,                     -- 게임 진행(JSON)
  saved INTEGER DEFAULT 0,        -- 마지막 저장 시각(ms)
  fails INTEGER DEFAULT 0,        -- 연속 비밀번호 실패
  lock_until INTEGER DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (   -- 로그인 토큰(원문은 저장 안 함, SHA-256만)
  hash    TEXT PRIMARY KEY,
  key     TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_key ON tokens(key, created);
