-- Atualização aditiva: mantém os contratos e lançamentos existentes.
CREATE TABLE IF NOT EXISTS previsoes_contrato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_contrato INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  valor REAL CHECK (valor IS NULL OR valor >= 0),
  UNIQUE (id_contrato, ano)
);
