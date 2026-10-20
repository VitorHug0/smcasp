-- =============================================================================
--  MÓDULO DE TAREFAS PESSOAIS (Estilo Google Tasks)
--  Cada usuário tem suas próprias listas e tarefas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS listas_tarefas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL,
  ordem      INTEGER NOT NULL DEFAULT 0,
  padrao     INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listas_tarefas_usuario ON listas_tarefas(id_usuario);
CREATE INDEX IF NOT EXISTS idx_listas_tarefas_ordem   ON listas_tarefas(ordem);

CREATE TABLE IF NOT EXISTS tarefas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  id_usuario      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  id_lista        INTEGER NOT NULL REFERENCES listas_tarefas(id) ON DELETE CASCADE,
  titulo          TEXT NOT NULL,
  detalhes        TEXT,
  data_vencimento TEXT,
  com_estrela     INTEGER NOT NULL DEFAULT 0,
  concluida       INTEGER NOT NULL DEFAULT 0,
  concluida_em    TEXT,
  ordem           INTEGER NOT NULL DEFAULT 0,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tarefas_usuario       ON tarefas(id_usuario);
CREATE INDEX IF NOT EXISTS idx_tarefas_lista         ON tarefas(id_lista);
CREATE INDEX IF NOT EXISTS idx_tarefas_concluida     ON tarefas(concluida);
CREATE INDEX IF NOT EXISTS idx_tarefas_estrela       ON tarefas(com_estrela);
CREATE INDEX IF NOT EXISTS idx_tarefas_vencimento    ON tarefas(data_vencimento);
