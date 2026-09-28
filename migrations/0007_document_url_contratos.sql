-- Link externo opcional para o documento do contrato.
-- A coluna nullable preserva todos os contratos já cadastrados.
ALTER TABLE contratos
ADD COLUMN document_url TEXT
CHECK (
  document_url IS NULL
  OR document_url LIKE 'http://%'
  OR document_url LIKE 'https://%'
);
