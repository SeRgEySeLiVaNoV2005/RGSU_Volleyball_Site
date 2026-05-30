-- ============================================================
-- Схема БД РГСУ Волейбол (Supabase PostgreSQL)
-- Выполнить в SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- Игроки
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  team TEXT NOT NULL CHECK (team IN ('men', 'women')),
  name TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  height TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Активен',
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);

-- Посты
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  team TEXT NOT NULL CHECK (team IN ('men', 'women')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'personal',
  date DATE DEFAULT CURRENT_DATE,
  author TEXT NOT NULL DEFAULT 'admin',
  published BOOLEAN NOT NULL DEFAULT false,
  pinned BOOLEAN NOT NULL DEFAULT false,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_team ON posts(team);

-- Комментарии
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  team TEXT NOT NULL CHECK (team IN ('men', 'women')),
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  date DATE DEFAULT CURRENT_DATE,
  approved BOOLEAN NOT NULL DEFAULT true,
  yandex_user_id TEXT NOT NULL DEFAULT '',
  yandex_photo TEXT NOT NULL DEFAULT '',
  parent_comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- Турниры
CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  team TEXT NOT NULL CHECK (team IN ('men', 'women')),
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed')),
  participants TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tournaments_team ON tournaments(team);

-- Главная страница
CREATE TABLE IF NOT EXISTS homepage (
  id BIGSERIAL PRIMARY KEY,
  team TEXT NOT NULL UNIQUE CHECK (team IN ('men', 'women')),
  hero_title TEXT NOT NULL DEFAULT 'Добро пожаловать, будущие чемпионы',
  hero_subtitle TEXT NOT NULL DEFAULT '',
  button_text TEXT NOT NULL DEFAULT 'Подать заявку',
  button_link TEXT NOT NULL DEFAULT '/about',
  hero_image TEXT NOT NULL DEFAULT '',
  footer_address TEXT NOT NULL DEFAULT '',
  footer_email TEXT NOT NULL DEFAULT '',
  footer_phone TEXT NOT NULL DEFAULT '',
  vk_link TEXT NOT NULL DEFAULT '',
  tg_link TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Настройки
CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  team TEXT NOT NULL UNIQUE CHECK (team IN ('men', 'women')),
  site_title TEXT NOT NULL DEFAULT 'РГСУ ВОЛЕЙБОЛ',
  yandex_app_id TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Служебная таблица отслеживания миграции
CREATE TABLE IF NOT EXISTS migration_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO migration_state (key, value) VALUES ('migration_done', 'false')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Вспомогательные функции
-- ============================================================

-- Сброс sequence после вставки с явными ID
CREATE OR REPLACE FUNCTION reset_sequence(tbl TEXT, col TEXT) RETURNS void AS $$
DECLARE
  seq_name TEXT;
  max_val BIGINT;
BEGIN
  seq_name := tbl || '_' || col || '_seq';
  EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', col, tbl) INTO max_val;
  EXECUTE format('SELECT setval(%L, %s)', seq_name, max_val);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Выполнение произвольного SQL (для миграции)
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT) RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
