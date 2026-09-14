-- =============================================================================
--  0003 — CONTROLE DE ACESSO em um banco que JÁ ESTÁ NO AR
--
--  Este arquivo existe para quem já publicou o painel e não quer perder os
--  dados. Ele acrescenta à tabela `usuarios` as três colunas do controle de
--  acesso e cria a conta do administrador geral.
--
--  QUANDO NÃO USAR: se o banco ainda está vazio (ou se você não se importa em
--  recomeçar), rode `npm run db:local` / `npm run db:remote` — o 0001 já cria a
--  tabela na forma nova e o 0002 já traz o administrador. Rodar este arquivo
--  depois daqueles dá erro de "duplicate column name", e é só ignorar.
--
--  Executar:
--    Local  : npx wrangler d1 execute secretaria-db --local  --file=./migrations/0003_acesso.sql
--    Nuvem  : npx wrangler d1 execute secretaria-db --remote --file=./migrations/0003_acesso.sql
--
--  Uma observação sobre o SQLite: ALTER TABLE ADD COLUMN não aceita CHECK. As
--  três colunas entram sem a trava do banco, e quem garante os valores válidos
--  é a API (worker/auth.ts e worker/admin.ts só gravam o que está na lista).
--  Em bancos recriados pelo 0001 o CHECK existe normalmente.
-- =============================================================================

-- Senha em PBKDF2-SHA256, formato pbkdf2$sha256$<repetições>$<sal>$<hash>.
-- Vazio = servidor que só figura como responsável de processo e não entra no
-- sistema; senha vazia nunca confere no login.
ALTER TABLE usuarios ADD COLUMN senha_hash TEXT NOT NULL DEFAULT '';

-- SUPER_ADMIN | OPERADOR | LEITOR
ALTER TABLE usuarios ADD COLUMN role TEXT NOT NULL DEFAULT 'LEITOR';

-- PENDENTE | ATIVO | BLOQUEADO
-- Quem já estava cadastrado antes desta mudança entra como ATIVO: são os
-- responsáveis pelos processos, e deixá-los PENDENTE sumiria com os nomes das
-- telas sem motivo. Sem senha, nenhum deles consegue entrar de fato.
ALTER TABLE usuarios ADD COLUMN status TEXT NOT NULL DEFAULT 'ATIVO';

CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_minusculo ON usuarios(lower(email));

-- ADMINISTRADOR GERAL ---------------------------------------------------------
-- A conta que libera todas as outras. Se o e-mail já existir na tabela, o
-- INSERT é ignorado e o UPDATE seguinte promove a conta que já está lá — assim
-- este arquivo pode ser rodado sem medo de duplicar ninguém.
INSERT OR IGNORE INTO usuarios (nome, email, senha_hash, role, status) VALUES
  ('Administrador Geral',
   'da.smcasp@campinas.sp.gov.br',
   'pbkdf2$sha256$100000$ead7f70bb30cec7d94c0160d9d6e7500$23434298eb9ac8f756809aa898e530adc78b1204383a3689b3b9714d6be1c40c',
   'SUPER_ADMIN', 'ATIVO');

UPDATE usuarios
   SET role = 'SUPER_ADMIN',
       status = 'ATIVO',
       senha_hash = CASE
         WHEN senha_hash = '' THEN
           'pbkdf2$sha256$100000$ead7f70bb30cec7d94c0160d9d6e7500$23434298eb9ac8f756809aa898e530adc78b1204383a3689b3b9714d6be1c40c'
         ELSE senha_hash
       END
 WHERE lower(email) = 'da.smcasp@campinas.sp.gov.br';
