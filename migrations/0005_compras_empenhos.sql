-- =============================================================================
--  0005 — uma Compra por Nota de Empenho, com itens normalizados
--
--  Migration incremental: não altera nem apaga a tabela histórica aquisicoes.
--  Registros antigos continuam preservados nela; novos lançamentos usam as
--  tabelas abaixo, que exigem os dados completos na API.
-- =============================================================================

CREATE TABLE IF NOT EXISTS compras (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_empenho         TEXT COLLATE NOCASE,
  numero_processo        TEXT,
  data_compra            TEXT NOT NULL,
  fornecedor_nome        TEXT,
  fornecedor_documento   TEXT,
  id_setor_responsavel   INTEGER REFERENCES setores(id) ON DELETE RESTRICT,
  id_processo            INTEGER REFERENCES processos(id) ON DELETE RESTRICT,
  id_aquisicao_legada    INTEGER UNIQUE REFERENCES aquisicoes(id) ON DELETE SET NULL,
  valor_total            REAL NOT NULL CHECK (valor_total >= 0),
  nota_nome              TEXT,
  nota_hash              TEXT,
  criado_em              TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (numero_empenho)
);

CREATE INDEX IF NOT EXISTS idx_compras_processo ON compras(id_processo);
CREATE INDEX IF NOT EXISTS idx_compras_numero_processo ON compras(numero_processo);
CREATE INDEX IF NOT EXISTS idx_compras_setor ON compras(id_setor_responsavel);
CREATE INDEX IF NOT EXISTS idx_compras_data ON compras(data_compra);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compras_nota_hash
  ON compras(nota_hash) WHERE nota_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS compra_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  id_compra       INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  codigo          TEXT,
  descricao       TEXT NOT NULL,
  unidade         TEXT,
  quantidade      REAL NOT NULL CHECK (quantidade > 0),
  valor_unitario  REAL NOT NULL CHECK (valor_unitario >= 0),
  valor_total     REAL NOT NULL CHECK (valor_total >= 0),
  ordem           INTEGER NOT NULL DEFAULT 0,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compra_itens_compra ON compra_itens(id_compra, ordem, id);

CREATE TRIGGER IF NOT EXISTS trg_compras_atualizado
AFTER UPDATE ON compras
FOR EACH ROW
BEGIN
  UPDATE compras SET atualizado_em = datetime('now') WHERE id = OLD.id;
END;

-- Cada aquisição do modelo anterior vira uma compra histórica com um item.
-- Campos que não existiam antes permanecem NULL e são exibidos como tal; nada
-- é inventado. Ao editar, a API exige que a ficha seja completada.
INSERT INTO compras
  (numero_empenho, numero_processo, data_compra, fornecedor_nome,
   id_setor_responsavel, valor_total, id_aquisicao_legada)
SELECT NULL, NULL, a.data_compra, NULL, a.id_setor_destino, a.valor_total, a.id
  FROM aquisicoes a
 WHERE NOT EXISTS (SELECT 1 FROM compras c WHERE c.id_aquisicao_legada = a.id);

INSERT INTO compra_itens
  (id_compra, descricao, quantidade, valor_unitario, valor_total, ordem)
SELECT c.id, a.item_comprado, a.quantidade,
       ROUND(CASE WHEN a.quantidade > 0 THEN a.valor_total / a.quantidade ELSE 0 END, 2),
       a.valor_total, 0
  FROM aquisicoes a
  JOIN compras c ON c.id_aquisicao_legada = a.id
 WHERE NOT EXISTS (SELECT 1 FROM compra_itens i WHERE i.id_compra = c.id);
