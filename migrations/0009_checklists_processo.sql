-- =============================================================================
--  CHECKLISTS DE PROCESSOS POR MODALIDADE (Fluxos Estruturados)
--  Guarda as etapas cumpridas de cada processo com responsável e data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS processo_checklists (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  id_processo         INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  chave_item          TEXT NOT NULL,
  titulo              TEXT NOT NULL,
  detalhes            TEXT,
  fase                TEXT NOT NULL,
  setor_responsavel   TEXT,
  concluido           INTEGER NOT NULL DEFAULT 0,
  concluido_por_nome  TEXT,
  concluido_em        TEXT,
  ordem               INTEGER NOT NULL DEFAULT 0,
  personalizado       INTEGER NOT NULL DEFAULT 0,
  criado_em           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proc_checklist_proc ON processo_checklists(id_processo);
CREATE INDEX IF NOT EXISTS idx_proc_checklist_fase ON processo_checklists(fase);
CREATE INDEX IF NOT EXISTS idx_proc_checklist_conc ON processo_checklists(concluido);
