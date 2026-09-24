-- =============================================================================
--  PAINEL DA SECRETARIA — Estrutura do banco de dados (Cloudflare D1 / SQLite)
--
--  Executar:
--    Local  : npx wrangler d1 execute secretaria-db --local  --file=./migrations/0001_schema.sql
--    Nuvem  : npx wrangler d1 execute secretaria-db --remote --file=./migrations/0001_schema.sql
--
--  Observações de modelagem:
--   * Valores monetários em REAL (reais, com centavos). O arredondamento para
--     exibição é feito na interface, sempre com 2 casas.
--   * Datas em TEXT no formato ISO 'AAAA-MM-DD' — é o formato que o SQLite
--     compara e ordena corretamente e que o <input type="date"> já devolve.
--   * PRAGMA foreign_keys já vem ativo no D1.
-- =============================================================================

DROP TABLE IF EXISTS aquisicoes;
DROP TABLE IF EXISTS compra_itens;
DROP TABLE IF EXISTS compras;
DROP TABLE IF EXISTS processos;
DROP TABLE IF EXISTS pagamentos_contrato;
DROP TABLE IF EXISTS previsoes_contrato;
DROP TABLE IF EXISTS contratos;
DROP TABLE IF EXISTS emendas;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS setores;

-- -----------------------------------------------------------------------------
-- SETORES — para onde vai a compra, de quem é o contrato, quem toca o processo
--
--   Os setores vêm em dois grupos, e é assim que aparecem nas listas de
--   seleção do sistema:
--     'SMCASP'           setores da Secretaria (CICC, MATBEL, Gabinete…)
--     'Guarda Municipal' bases e unidades da Guarda (Base Norte, Academia…)
--
--   Para criar um terceiro grupo mais adiante basta inserir setores com outro
--   valor em `grupo` — nada mais precisa mudar.
-- -----------------------------------------------------------------------------
CREATE TABLE setores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  sigla      TEXT NOT NULL UNIQUE,
  grupo      TEXT NOT NULL DEFAULT 'SMCASP',
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_setores_grupo ON setores(grupo);

-- -----------------------------------------------------------------------------
-- USUARIOS — quem responde pelos processos e quem entra no sistema
--
--   A mesma tabela guarda as duas coisas de propósito: o servidor que aparece
--   como responsável de um processo é a mesma pessoa que abre o painel. Ter
--   duas tabelas obrigaria a manter os dois cadastros em dia à mão.
--
--   COMO O ACESSO FUNCIONA
--   ----------------------
--   Qualquer pessoa pode se cadastrar, mas o cadastro nasce PENDENTE e não
--   entra em lugar nenhum: um SUPER_ADMIN precisa liberar em /admin/usuarios,
--   escolhendo ali o papel e o setor. É o fluxo de aprovação prévia.
--
--   role   SUPER_ADMIN  vê tudo, escreve tudo e libera/bloqueia contas
--          OPERADOR     vê tudo e lança/corrige dados
--          LEITOR       só consulta — nenhuma escrita passa pela API
--
--   status PENDENTE     pediu acesso e ainda não foi liberado
--          ATIVO        entra normalmente
--          BLOQUEADO    recusado ou suspenso; a senha continua valendo, mas
--                       a sessão não é aberta
--
--   senha_hash guarda PBKDF2-SHA256 no formato
--     pbkdf2$sha256$<iterações>$<sal>$<hash>
--   com sal sorteado por usuário — dois cadastros com a mesma senha geram
--   hashes diferentes, então vazar a tabela não entrega uma senha de uma vez.
--
--   O DEFAULT '' existe para os servidores que só figuram como responsáveis de
--   processo e nunca pediram acesso: eles ficam sem senha, e senha vazia
--   nunca confere no login (worker/auth.ts recusa antes de comparar).
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  senha_hash  TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'LEITOR'
              CHECK (role IN ('SUPER_ADMIN', 'OPERADOR', 'LEITOR')),
  status      TEXT NOT NULL DEFAULT 'PENDENTE'
              CHECK (status IN ('PENDENTE', 'ATIVO', 'BLOQUEADO')),
  id_setor    INTEGER REFERENCES setores(id) ON DELETE SET NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_usuarios_setor  ON usuarios(id_setor);
CREATE INDEX idx_usuarios_status ON usuarios(status);
-- O login procura pelo e-mail em minúsculas; sem este índice a busca varreria
-- a tabela inteira a cada tentativa.
CREATE UNIQUE INDEX idx_usuarios_email_minusculo ON usuarios(lower(email));

-- -----------------------------------------------------------------------------
-- EMENDAS — repasses parlamentares recebidos e o quanto já foi comprometido
--   saldo disponível = valor_recebido - valor_empenhado (calculado na consulta)
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- EMENDAS — espelha a planilha "EMENDAS IMPOSITIVAS", uma linha por emenda:
--
--   NAT. DESP. | Emenda | Vereador | Finalidade | Objetivo
--   Valor | A liquidar | Liquidado | Saldo | Processo
--
--   O dinheiro anda em duas etapas: o que já foi comprometido mas ainda não
--   foi pago fica em "a liquidar", e o que foi pago vai para "liquidado". O
--   saldo é o que sobra dos dois — por isso ele é calculado na consulta, e não
--   guardado: um número gravado envelhece assim que alguém corrige os outros.
-- -----------------------------------------------------------------------------
CREATE TABLE emendas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Número da emenda na Câmara, ex.: '0038/2026'.
  codigo            TEXT NOT NULL UNIQUE,
  -- Vereador que destinou o recurso.
  autor             TEXT NOT NULL,
  ano               INTEGER NOT NULL,
  -- Código da natureza da despesa, ex.: '449052' (equipamento permanente)
  -- ou '339039' (serviço de instalação).
  natureza_despesa  TEXT,
  -- Texto integral do que a emenda determina, como está na planilha.
  finalidade        TEXT,
  -- Em que a emenda vai ser empregada: Monitoramento, Munição, Drones…
  -- Texto livre de propósito: a cada ano aparecem destinos novos, e uma lista
  -- fechada obrigaria a mexer no código para cadastrar o primeiro deles.
  objetivo          TEXT,
  valor_recebido    REAL NOT NULL DEFAULT 0 CHECK (valor_recebido >= 0),
  a_liquidar        REAL NOT NULL DEFAULT 0 CHECK (a_liquidar >= 0),
  liquidado         REAL NOT NULL DEFAULT 0 CHECK (liquidado >= 0),
  -- Processo do SEI ligado à emenda, quando já existe.
  processo          TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (a_liquidar + liquidado <= valor_recebido)
);
CREATE INDEX idx_emendas_ano      ON emendas(ano);
CREATE INDEX idx_emendas_objetivo ON emendas(objetivo);
CREATE INDEX idx_emendas_autor    ON emendas(autor);

-- -----------------------------------------------------------------------------
-- CONTRATOS — espelha as duas planilhas de controle da Coordenadoria:
--
--   "CONTRATOS | CONTROLE"      -> vigência, renovação, gestor e fiscal
--   "Controle CSF 2 Pagamentos" -> totalizadores do ano (as colunas da direita)
--
--   Os valores mês a mês ficam na tabela pagamentos_contrato, logo abaixo.
--
--   Quase tudo é opcional de propósito: parte dos contratos aparece só em uma
--   das duas planilhas. Os que vêm só do controle de pagamentos não têm número
--   de contrato nem datas de vigência; os que vêm só do controle de vigência
--   não têm valores. Exigir campo por campo travaria o cadastro do que existe
--   de verdade.
-- -----------------------------------------------------------------------------
CREATE TABLE contratos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Número do processo no SEI — é o que liga as duas planilhas entre si.
  sei                TEXT,
  numero_contrato    TEXT UNIQUE,
  -- Número do termo de ajuste/prorrogação mais recente, quando houve.
  numero_ultimo_ajuste TEXT,
  fornecedor         TEXT NOT NULL,
  objeto             TEXT,

  -- Vigência. data_fim_vigencia é a coluna "Término" da planilha e é o que
  -- alimenta o alerta de renovação; a vigência restante em dias é calculada.
  data_inicio        TEXT,
  data_fim_vigencia  TEXT,
  -- Duração do último ajuste, como está escrito na planilha ("12 meses").
  duracao            TEXT,
  -- Data-base de reajuste: quando o preço pode ser corrigido.
  data_base_reajuste TEXT,

  -- Decisão da Coordenadoria sobre o fim da vigência.
  interesse_renovar  TEXT NOT NULL DEFAULT 'Não definido'
                     CHECK (interesse_renovar IN
                       ('SIM', 'Dispensa', 'Licitar', 'Não definido')),

  gestor             TEXT,
  fiscal             TEXT,

  -- Totalizadores do controle de pagamentos (colunas da direita da planilha).
  --   faturas_futuras  o que ainda vai ser faturado no ano
  --   empenho          valor empenhado
  --   reservado        valor reservado
  --   sme              saldo de movimentação de empenho
  --   saldo            como está na planilha (ver observação no seed)
  faturas_futuras    REAL NOT NULL DEFAULT 0,
  empenho            REAL NOT NULL DEFAULT 0,
  reservado          REAL NOT NULL DEFAULT 0,
  sme                REAL NOT NULL DEFAULT 0,
  saldo              REAL NOT NULL DEFAULT 0,

  -- Valor global do contrato, quando conhecido. As planilhas não trazem esse
  -- número (elas trabalham com o previsto do ano), então fica opcional.
  valor_total        REAL NOT NULL DEFAULT 0 CHECK (valor_total >= 0),

  id_setor           INTEGER REFERENCES setores(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'Vigente'
                     CHECK (status IN ('Vigente', 'Encerrado', 'Suspenso')),
  criado_em          TEXT NOT NULL DEFAULT (datetime('now')),
  -- Com data faltando o CHECK devolve NULL, que o SQLite aceita — é o que
  -- permite cadastrar contrato sem vigência preenchida.
  CHECK (data_fim_vigencia >= data_inicio)
);
CREATE INDEX idx_contratos_setor      ON contratos(id_setor);
CREATE INDEX idx_contratos_vigencia   ON contratos(data_fim_vigencia);
CREATE INDEX idx_contratos_status     ON contratos(status);
CREATE INDEX idx_contratos_sei        ON contratos(sei);
CREATE INDEX idx_contratos_renovar    ON contratos(interesse_renovar);

-- -----------------------------------------------------------------------------
-- PAGAMENTOS_CONTRATO — uma linha por contrato/mês, como as colunas jan…dez
--   da planilha de pagamentos.
--
--   Guardar mês a mês em linhas (e não em doze colunas fixas) é o que permite
--   virar o ano sem mexer no banco: 2027 entra como ano novo, e o de 2026 fica
--   guardado para consulta.
--
--   valor NULL = célula em branco na planilha (mês sem previsão lançada), que
--   é diferente de 0,00 (mês sem pagamento).
-- -----------------------------------------------------------------------------
CREATE TABLE pagamentos_contrato (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  id_contrato  INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  ano          INTEGER NOT NULL,
  mes          INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor        REAL,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (id_contrato, ano, mes)
);
CREATE INDEX idx_pagamentos_contrato ON pagamentos_contrato(id_contrato);
CREATE INDEX idx_pagamentos_ano      ON pagamentos_contrato(ano);
CREATE TABLE previsoes_contrato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_contrato INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
  valor REAL CHECK (valor IS NULL OR valor >= 0),
  UNIQUE (id_contrato, ano)
);

-- -----------------------------------------------------------------------------
-- PROCESSOS — quadro do fluxo interno
--
--   A coluna "etapa" diz onde o processo está no caminho que ele percorre
--   dentro da Secretaria. As cinco primeiras etapas são as colunas do quadro;
--   'Concluído' sai do quadro e vai para a tela de Concluídos.
--
--     CSA              Coordenadoria Setorial Administrativa
--     CSF              Coordenadoria Setorial Financeira
--     Acompanhamento   fiscalização do que foi contratado
--     Execução/Entrega entrega do bem ou do serviço
--     AUDESP/PNCP      prestação de contas e publicação obrigatória
--     Concluído        encerrado
--
--   data_conclusao é preenchida pela API no momento em que a etapa vira
--   'Concluído', e limpa se o processo for reaberto.
-- -----------------------------------------------------------------------------
CREATE TABLE processos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Número do processo no SEI, ex.: 'PMC.2026.00130127-81'.
  sei             TEXT,
  -- Objeto da contratação, ex.: 'Caixas Herméticas'. É o nome do processo
  -- no cartão do quadro e na planilha de concluídos.
  objeto          TEXT NOT NULL,
  descricao       TEXT,

  modalidade      TEXT CHECK (modalidade IS NULL OR modalidade IN
                    ('AMIL', 'CREDENCIAMENTO', 'ARP', 'Adesão ARP',
                     'Reajuste', 'LICITAÇÃO', 'PRORROGAÇÃO', 'INEX')),
  -- 1 = a contratação usa recurso de emenda; 0 = não usa.
  emenda          INTEGER NOT NULL DEFAULT 0 CHECK (emenda IN (0, 1)),
  -- Números de registro nos portais obrigatórios.
  audesp          TEXT,
  pncp            TEXT,
  -- Anotação livre: o que está sendo feito agora. Editável na própria linha.
  status          TEXT,

  -- Dois responsáveis, como nas duas colunas "RESPONSÁVEL" da planilha.
  id_responsavel   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  id_responsavel_2 INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,

  etapa           TEXT NOT NULL DEFAULT 'CSA'
                  CHECK (etapa IN ('CSA', 'CSF', 'Acompanhamento',
                                   'Execução/Entrega', 'AUDESP/PNCP', 'Outros',
                                   'Concluído')),
  prioridade      TEXT NOT NULL DEFAULT 'Média'
                  CHECK (prioridade IN ('Baixa', 'Média', 'Alta', 'Muito Alta')),
  data_limite     TEXT,
  data_conclusao  TEXT,
  id_setor        INTEGER REFERENCES setores(id) ON DELETE SET NULL,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_processos_etapa        ON processos(etapa);
CREATE INDEX idx_processos_responsavel  ON processos(id_responsavel);
CREATE INDEX idx_processos_responsavel2 ON processos(id_responsavel_2);
CREATE INDEX idx_processos_setor       ON processos(id_setor);
CREATE INDEX idx_processos_prazo       ON processos(data_limite);
CREATE INDEX idx_processos_conclusao   ON processos(data_conclusao);
CREATE INDEX idx_processos_modalidade  ON processos(modalidade);
CREATE INDEX idx_processos_sei         ON processos(sei);

-- Mantém "atualizado_em" correto sem depender do código da aplicação.
CREATE TRIGGER trg_processos_atualizado
AFTER UPDATE ON processos
FOR EACH ROW
BEGIN
  UPDATE processos SET atualizado_em = datetime('now') WHERE id = OLD.id;
END;

-- -----------------------------------------------------------------------------
-- AQUISICOES — o que foi comprado e para qual setor foi entregue
-- -----------------------------------------------------------------------------
CREATE TABLE aquisicoes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  item_comprado      TEXT NOT NULL,
  quantidade         INTEGER NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  valor_total        REAL NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  data_compra        TEXT NOT NULL,
  id_setor_destino   INTEGER REFERENCES setores(id) ON DELETE SET NULL,
  id_contrato_origem INTEGER REFERENCES contratos(id) ON DELETE SET NULL,
  criado_em          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_aquisicoes_setor    ON aquisicoes(id_setor_destino);
CREATE INDEX idx_aquisicoes_contrato ON aquisicoes(id_contrato_origem);
CREATE INDEX idx_aquisicoes_data     ON aquisicoes(data_compra);

-- -----------------------------------------------------------------------------
-- COMPRAS / EMPENHOS — uma linha por empenho; seus itens ficam normalizados.
-- A API recalcula os totais e grava Compra + itens em uma única transação.
-- -----------------------------------------------------------------------------
CREATE TABLE compras (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_empenho         TEXT COLLATE NOCASE UNIQUE,
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
  atualizado_em          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_compras_processo        ON compras(id_processo);
CREATE INDEX idx_compras_numero_processo ON compras(numero_processo);
CREATE INDEX idx_compras_setor           ON compras(id_setor_responsavel);
CREATE INDEX idx_compras_data            ON compras(data_compra);
CREATE UNIQUE INDEX idx_compras_nota_hash ON compras(nota_hash) WHERE nota_hash IS NOT NULL;

CREATE TABLE compra_itens (
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
CREATE INDEX idx_compra_itens_compra ON compra_itens(id_compra, ordem, id);

CREATE TRIGGER trg_compras_atualizado
AFTER UPDATE ON compras
FOR EACH ROW
BEGIN
  UPDATE compras SET atualizado_em = datetime('now') WHERE id = OLD.id;
END;
