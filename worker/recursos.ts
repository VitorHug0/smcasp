// =============================================================================
//  Descrição de cada recurso da API: quais colunas existem, como validá-las e
//  qual consulta de leitura usar (com os JOINs que a tela precisa).
// =============================================================================

import type { Campo } from './db';

/**
 * Etapas do fluxo interno, na ordem em que o processo caminha.
 * As cinco primeiras são as colunas do quadro; 'Concluído' sai do quadro e
 * aparece na tela de Concluídos.
 */
/** Modalidades de contratação aceitas no cadastro de processo. */
export const MODALIDADES = [
  'AMIL',
  'CREDENCIAMENTO',
  'ARP',
  'Adesão ARP',
  'Reajuste',
  'LICITAÇÃO',
  'PRORROGAÇÃO',
  'INEX',
] as const;

export const ETAPAS = [
  'CSA',
  'CSF',
  'Acompanhamento',
  'Execução/Entrega',
  'AUDESP/PNCP',
  'Outros',
  'Concluído',
] as const;

export const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Muito Alta'] as const;

/**
 * Decisão da Coordenadoria sobre o que fazer quando a vigência terminar — é a
 * coluna "Interesse em Renovar" da planilha de contratos.
 */
export const INTERESSES_RENOVAR = ['SIM', 'Dispensa', 'Licitar', 'Não definido'] as const;

export interface Recurso {
  tabela: string;
  campos: readonly Campo[];
  /** SELECT usado nas listagens, já com os nomes de setor/responsável. */
  select: string;
  /** Ordenação padrão da listagem. */
  ordem: string;
  /**
   * Apelido da tabela dentro do SELECT, usado para buscar um registro pelo id.
   * Sem isso, valeria a primeira letra do nome da tabela — o que dá errado em
   * `pagamentos_contrato`, cujo apelido é `pg`, e em `setores`, que não tem.
   */
  apelido?: string;
}

const TOTAL_LANCADO_ANO = `(SELECT COALESCE(SUM(pg.valor), 0) FROM pagamentos_contrato pg
  WHERE pg.id_contrato = c.id AND pg.ano = CAST(strftime('%Y', 'now') AS INTEGER))`;
const PREVISTO_ANO = `(SELECT pr.valor FROM previsoes_contrato pr WHERE pr.id_contrato = c.id
  AND pr.ano = CAST(strftime('%Y', 'now') AS INTEGER))`;
const FATURAS_FUTURAS = `ROUND(COALESCE(${PREVISTO_ANO}, 0) - ${TOTAL_LANCADO_ANO}, 2)`;

export const RECURSOS: Record<string, Recurso> = {
  setores: {
    tabela: 'setores',
    campos: [
      { nome: 'nome', tipo: 'texto', obrigatorio: true, rotulo: 'Nome do setor' },
      { nome: 'sigla', tipo: 'texto', obrigatorio: true, rotulo: 'Sigla' },
      // Texto livre de propósito: criar um terceiro grupo depois não exige
      // mexer no código, basta cadastrar setores com outro grupo.
      { nome: 'grupo', tipo: 'texto', rotulo: 'Grupo' },
    ],
    select: `SELECT id, nome, sigla, grupo FROM setores`,
    // SMCASP primeiro, bases da Guarda depois; dentro do grupo, em ordem
    // alfabética — é uma lista de 17 itens, e achar pelo nome é o que importa.
    ordem: `CASE grupo WHEN 'SMCASP' THEN 0 ELSE 1 END, nome COLLATE NOCASE`,
  },

  usuarios: {
    tabela: 'usuarios',
    campos: [
      { nome: 'nome', tipo: 'texto', obrigatorio: true, rotulo: 'Nome' },
      { nome: 'email', tipo: 'texto', obrigatorio: true, rotulo: 'E-mail' },
      { nome: 'id_setor', tipo: 'ref', rotulo: 'Setor' },
    ],
    select: `
      SELECT u.id, u.nome, u.email, u.id_setor, s.sigla AS setor_sigla
      FROM usuarios u
      LEFT JOIN setores s ON s.id = u.id_setor`,
    ordem: 'u.nome COLLATE NOCASE',
  },

  emendas: {
    tabela: 'emendas',
    campos: [
      { nome: 'codigo', tipo: 'texto', obrigatorio: true, rotulo: 'Número da emenda' },
      { nome: 'autor', tipo: 'texto', obrigatorio: true, rotulo: 'Vereador' },
      { nome: 'ano', tipo: 'inteiro', obrigatorio: true, rotulo: 'Ano' },
      { nome: 'natureza_despesa', tipo: 'texto', rotulo: 'Natureza da despesa' },
      { nome: 'finalidade', tipo: 'texto', rotulo: 'Finalidade' },
      { nome: 'objetivo', tipo: 'texto', rotulo: 'Objetivo' },
      { nome: 'valor_recebido', tipo: 'numero', obrigatorio: true, rotulo: 'Valor' },
      { nome: 'a_liquidar', tipo: 'numero', rotulo: 'A liquidar' },
      { nome: 'liquidado', tipo: 'numero', rotulo: 'Liquidado' },
      { nome: 'processo', tipo: 'texto', rotulo: 'Processo' },
    ],
    // O saldo é calculado aqui, e não guardado: gravado, ele envelheceria
    // assim que alguém corrigisse "a liquidar" ou "liquidado".
    select: `
      SELECT e.id, e.codigo, e.autor, e.ano, e.natureza_despesa, e.finalidade,
             e.objetivo, e.valor_recebido, e.a_liquidar, e.liquidado, e.processo,
             (e.valor_recebido - e.a_liquidar - e.liquidado) AS saldo_disponivel
      FROM emendas e`,
    ordem: 'e.ano DESC, e.codigo',
  },

  contratos: {
    tabela: 'contratos',
    campos: [
      { nome: 'sei', tipo: 'texto', rotulo: 'Número do processo (SEI)' },
      { nome: 'numero_contrato', tipo: 'texto', rotulo: 'Número do contrato' },
      { nome: 'numero_ultimo_ajuste', tipo: 'texto', rotulo: 'Número do último ajuste' },
      { nome: 'fornecedor', tipo: 'texto', obrigatorio: true, rotulo: 'Empresa' },
      { nome: 'objeto', tipo: 'texto', rotulo: 'Objeto do contrato' },
      { nome: 'data_inicio', tipo: 'data', rotulo: 'Data do 1º contrato' },
      { nome: 'data_fim_vigencia', tipo: 'data', rotulo: 'Término' },
      { nome: 'duracao', tipo: 'texto', rotulo: 'Duração' },
      { nome: 'data_base_reajuste', tipo: 'data', rotulo: 'Data-base de reajuste' },
      {
        nome: 'interesse_renovar',
        tipo: 'opcao',
        opcoes: INTERESSES_RENOVAR,
        rotulo: 'Interesse em renovar',
      },
      { nome: 'gestor', tipo: 'texto', rotulo: 'Gestor' },
      { nome: 'fiscal', tipo: 'texto', rotulo: 'Fiscal' },
      { nome: 'empenho', tipo: 'numero', rotulo: 'Empenho' },
      { nome: 'reservado', tipo: 'numero', rotulo: 'Reservado' },
      { nome: 'sme', tipo: 'numero', rotulo: 'SME' },
      { nome: 'valor_total', tipo: 'numero', rotulo: 'Valor global do contrato' },
      { nome: 'id_setor', tipo: 'ref', rotulo: 'Setor responsável' },
      {
        nome: 'status',
        tipo: 'opcao',
        opcoes: ['Vigente', 'Encerrado', 'Suspenso'],
        rotulo: 'Situação',
      },
    ],
    // Previsão informada e lançamentos mensais são independentes e por ano.
    select: `
      SELECT c.id, c.sei, c.numero_contrato, c.numero_ultimo_ajuste,
             c.fornecedor, c.objeto,
             c.data_inicio, c.data_fim_vigencia, c.duracao, c.data_base_reajuste,
             c.interesse_renovar, c.gestor, c.fiscal,
             ${FATURAS_FUTURAS} AS faturas_futuras, c.empenho, c.reservado, c.sme,
             ROUND(c.empenho + c.reservado + c.sme - (${FATURAS_FUTURAS}), 2) AS saldo,
             c.valor_total, c.id_setor, c.status,
             s.nome  AS setor_nome,
             s.sigla AS setor_sigla,
             CASE WHEN c.data_fim_vigencia IS NULL THEN NULL
                  ELSE CAST(julianday(c.data_fim_vigencia) - julianday(date('now'))
                            AS INTEGER)
             END AS dias_para_vencer,
             ${TOTAL_LANCADO_ANO} AS total_lancado_ano,
             ${PREVISTO_ANO} AS previsto_ano
      FROM contratos c
      LEFT JOIN setores s ON s.id = c.id_setor`,
    // Como na planilha: quem termina antes aparece primeiro. Contrato sem
    // término (os que só existem no controle de pagamentos) vai para o fim.
    ordem: `CASE c.status WHEN 'Vigente' THEN 0 WHEN 'Suspenso' THEN 1 ELSE 2 END,
            c.data_fim_vigencia IS NULL, c.data_fim_vigencia, c.fornecedor COLLATE NOCASE`,
  },

  // Valores mês a mês do controle de pagamentos. Recurso próprio para que a
  // tela possa corrigir um mês só, sem reenviar o contrato inteiro.
  previsoes: {
    tabela: 'previsoes_contrato',
    apelido: 'pr',
    campos: [
      { nome: 'id_contrato', tipo: 'ref', obrigatorio: true, rotulo: 'Contrato' },
      { nome: 'ano', tipo: 'inteiro', obrigatorio: true, rotulo: 'Ano' },
      { nome: 'valor', tipo: 'numero', rotulo: 'Previsto anual' },
    ],
    select: 'SELECT pr.id, pr.id_contrato, pr.ano, pr.valor FROM previsoes_contrato pr',
    ordem: 'pr.ano DESC, pr.id_contrato',
  },
  pagamentos: {
    tabela: 'pagamentos_contrato',
    apelido: 'pg',
    campos: [
      { nome: 'id_contrato', tipo: 'ref', obrigatorio: true, rotulo: 'Contrato' },
      { nome: 'ano', tipo: 'inteiro', obrigatorio: true, rotulo: 'Ano' },
      { nome: 'mes', tipo: 'inteiro', obrigatorio: true, rotulo: 'Mês' },
      { nome: 'valor', tipo: 'numero', rotulo: 'Valor' },
    ],
    select: `
      SELECT pg.id, pg.id_contrato, pg.ano, pg.mes, pg.valor
      FROM pagamentos_contrato pg`,
    ordem: 'pg.id_contrato, pg.mes',
  },

  processos: {
    tabela: 'processos',
    campos: [
      { nome: 'sei', tipo: 'texto', rotulo: 'Número SEI' },
      { nome: 'objeto', tipo: 'texto', obrigatorio: true, rotulo: 'Objeto' },
      { nome: 'descricao', tipo: 'texto', rotulo: 'Descrição' },
      { nome: 'modalidade', tipo: 'opcao', opcoes: MODALIDADES, rotulo: 'Modalidade' },
      { nome: 'emenda', tipo: 'inteiro', rotulo: 'Emenda' },
      { nome: 'audesp', tipo: 'texto', rotulo: 'AUDESP' },
      { nome: 'pncp', tipo: 'texto', rotulo: 'PNCP' },
      { nome: 'status', tipo: 'texto', rotulo: 'Status' },
      { nome: 'id_responsavel', tipo: 'ref', rotulo: 'Responsável' },
      { nome: 'id_responsavel_2', tipo: 'ref', rotulo: '2º responsável' },
      {
        nome: 'etapa',
        tipo: 'opcao',
        opcoes: ETAPAS,
        rotulo: 'Etapa',
      },
      {
        nome: 'prioridade',
        tipo: 'opcao',
        opcoes: PRIORIDADES,
        rotulo: 'Prioridade',
      },
      { nome: 'data_limite', tipo: 'data', rotulo: 'Data limite' },
      { nome: 'id_setor', tipo: 'ref', rotulo: 'Setor' },
    ],
    select: `
      SELECT p.id, p.sei, p.objeto, p.descricao, p.modalidade, p.emenda,
             p.audesp, p.pncp, p.status,
             p.id_responsavel, p.id_responsavel_2, p.etapa, p.prioridade,
             p.data_limite, p.data_conclusao, p.id_setor,
             u.nome  AS responsavel_nome,
             u2.nome AS responsavel_2_nome,
             s.sigla AS setor_sigla,
             s.nome  AS setor_nome,
             CASE WHEN p.data_limite IS NULL THEN NULL
                  ELSE CAST(julianday(p.data_limite) - julianday(date('now')) AS INTEGER)
             END AS dias_para_prazo
      FROM processos p
      LEFT JOIN usuarios u  ON u.id  = p.id_responsavel
      LEFT JOIN usuarios u2 ON u2.id = p.id_responsavel_2
      LEFT JOIN setores  s  ON s.id  = p.id_setor`,
    // Concluídos por último; entre os abertos, prioridade e depois prazo.
    ordem: `CASE WHEN p.etapa = 'Concluído' THEN 1 ELSE 0 END,
            CASE WHEN p.etapa = 'Concluído' THEN p.data_conclusao END DESC,
            CASE p.prioridade
              WHEN 'Muito Alta' THEN 1 WHEN 'Alta' THEN 2
              WHEN 'Média' THEN 3 ELSE 4 END,
            p.data_limite IS NULL, p.data_limite, p.id`,
  },

  aquisicoes: {
    tabela: 'aquisicoes',
    campos: [
      { nome: 'item_comprado', tipo: 'texto', obrigatorio: true, rotulo: 'Item comprado' },
      { nome: 'quantidade', tipo: 'inteiro', obrigatorio: true, rotulo: 'Quantidade' },
      { nome: 'valor_total', tipo: 'numero', obrigatorio: true, rotulo: 'Valor total' },
      { nome: 'data_compra', tipo: 'data', obrigatorio: true, rotulo: 'Data da compra' },
      { nome: 'id_setor_destino', tipo: 'ref', rotulo: 'Setor de destino' },
      { nome: 'id_contrato_origem', tipo: 'ref', rotulo: 'Contrato de origem' },
    ],
    select: `
      SELECT a.id, a.item_comprado, a.quantidade, a.valor_total, a.data_compra,
             a.id_setor_destino, a.id_contrato_origem,
             s.nome  AS setor_nome,
             s.sigla AS setor_sigla,
             c.numero_contrato AS contrato_numero
      FROM aquisicoes a
      LEFT JOIN setores   s ON s.id = a.id_setor_destino
      LEFT JOIN contratos c ON c.id = a.id_contrato_origem`,
    ordem: 'a.data_compra DESC, a.id DESC',
  },
};
