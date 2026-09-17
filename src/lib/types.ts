// =============================================================================
//  Tipos compartilhados entre o front-end (React) e o back-end (Worker).
//  Um único lugar para descrever o formato dos dados evita divergência entre
//  o que a API devolve e o que a tela espera.
// =============================================================================

/**
 * Etapas do fluxo interno, na ordem em que o processo caminha.
 * As cinco primeiras são as colunas do quadro; 'Concluído' sai do quadro e vai
 * para a tela de Concluídos.
 */
export const ETAPAS_DO_QUADRO = [
  'CSA',
  'CSF',
  'Acompanhamento',
  'Execução/Entrega',
  'AUDESP/PNCP',
  'Outros',
] as const;

export type EtapaAberta = (typeof ETAPAS_DO_QUADRO)[number];
export type Etapa = EtapaAberta | 'Concluído';

export const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Muito Alta'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

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

export type Modalidade = (typeof MODALIDADES)[number];

export type StatusContrato = 'Vigente' | 'Encerrado' | 'Suspenso';

/**
 * Coluna "Interesse em Renovar" da planilha de contratos: o que a
 * Coordenadoria decidiu fazer quando a vigência terminar.
 */
export const INTERESSES_RENOVAR = ['SIM', 'Dispensa', 'Licitar', 'Não definido'] as const;
export type InteresseRenovar = (typeof INTERESSES_RENOVAR)[number];

/** Rótulos dos doze meses, na ordem das colunas da planilha de pagamentos. */
export const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

export interface Setor {
  id: number;
  nome: string;
  sigla: string;
  /** 'SMCASP' ou 'Guarda Municipal' — separa as listas de seleção. */
  grupo: string;
}

/**
 * Perfil de acesso. A ordem importa nas listas da tela: do que mais pode para
 * o que menos pode.
 *
 *   SUPER_ADMIN  vê tudo, escreve tudo e libera/bloqueia contas
 *   OPERADOR     vê tudo e lança/corrige dados
 *   LEITOR       só consulta
 */
export const PAPEIS = ['SUPER_ADMIN', 'OPERADOR', 'LEITOR'] as const;
export type Papel = (typeof PAPEIS)[number];

/** Como cada perfil aparece escrito nas telas. */
export const NOME_DO_PAPEL: Record<Papel, string> = {
  SUPER_ADMIN: 'Administrador Geral',
  OPERADOR: 'Operador',
  LEITOR: 'Leitor',
};

export const EXPLICACAO_DO_PAPEL: Record<Papel, string> = {
  SUPER_ADMIN: 'Faz tudo e cuida dos acessos das outras pessoas.',
  OPERADOR: 'Consulta e também lança e corrige processos, contratos e emendas.',
  LEITOR: 'Só consulta. Nenhuma tela deixa alterar nada.',
};

/**
 *   PENDENTE   pediu acesso e ainda não foi liberado
 *   ATIVO      entra normalmente
 *   BLOQUEADO  recusado ou suspenso
 */
export const SITUACOES_USUARIO = ['PENDENTE', 'ATIVO', 'BLOQUEADO'] as const;
export type SituacaoUsuario = (typeof SITUACOES_USUARIO)[number];

export const NOME_DA_SITUACAO: Record<SituacaoUsuario, string> = {
  PENDENTE: 'Aguardando liberação',
  ATIVO: 'Ativo',
  BLOQUEADO: 'Bloqueado',
};

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  id_setor: number | null;
  setor_sigla?: string | null;
}

/** Quem está conectado agora — devolvido por /api/sessao. */
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  role: Papel;
  status: SituacaoUsuario;
  id_setor: number | null;
  setor_sigla: string | null;
}

/** A ficha completa que a tela de gestão de usuários mostra. */
export interface UsuarioAdmin extends UsuarioSessao {
  setor_nome?: string | null;
  criado_em: string;
  /** 0 quando a pessoa só figura como responsável e nunca pediu acesso. */
  tem_senha: 0 | 1;
  /** Quantos processos apontam para ela — avisa antes de apagar o cadastro. */
  processos_responsavel: number;
}

/** Resposta de GET /api/admin/usuarios. */
export interface ListaDeUsuarios {
  pendentes: UsuarioAdmin[];
  cadastrados: UsuarioAdmin[];
  /** Id de quem está pedindo, para a tela marcar "(você)". */
  eu: number;
  /** Quantos outros administradores ativos existem além de quem pede. */
  outros_administradores: number;
}

/**
 * Uma linha da planilha de emendas impositivas. O dinheiro anda em duas
 * etapas: "a liquidar" é o que já foi comprometido e ainda não foi pago,
 * "liquidado" é o que já saiu. O saldo é o que sobra dos dois.
 */
export interface Emenda {
  id: number;
  /** Número da emenda na Câmara, ex.: '0038/2026'. */
  codigo: string;
  /** Vereador que destinou o recurso. */
  autor: string;
  ano: number;
  /** Código da natureza da despesa, ex.: '449052'. */
  natureza_despesa: string | null;
  /** Texto integral do que a emenda determina. */
  finalidade: string | null;
  /** Em que a emenda vai ser empregada: Monitoramento, Munição, Drones… */
  objetivo: string | null;
  /** Coluna "Valor" da planilha. */
  valor_recebido: number;
  a_liquidar: number;
  liquidado: number;
  /** Processo do SEI ligado à emenda, quando já existe. */
  processo: string | null;
  /** Campo calculado pela API: valor − a liquidar − liquidado. */
  saldo_disponivel?: number;
}

/**
 * Um contrato, com os campos das duas planilhas de controle. Quase tudo é
 * opcional porque parte dos contratos só aparece em uma das duas: os que vêm
 * do controle de pagamentos não têm número nem vigência, e os que vêm do
 * controle de vigência não têm valores lançados.
 */
export interface Contrato {
  id: number;
  /** Número do processo no SEI — é o que liga as duas planilhas. */
  sei: string | null;
  numero_contrato: string | null;
  numero_ultimo_ajuste: string | null;
  /** Coluna "EMPRESA" da planilha. */
  fornecedor: string;
  objeto: string | null;
  /** Coluna "Data 1º Contrato". */
  data_inicio: string | null;
  /** Coluna "Término" — é o que dispara o alerta de renovação. */
  data_fim_vigencia: string | null;
  duracao: string | null;
  data_base_reajuste: string | null;
  interesse_renovar: InteresseRenovar;
  gestor: string | null;
  fiscal: string | null;
  /** Totalizadores do controle de pagamentos. */
  faturas_futuras: number;
  empenho: number;
  reservado: number;
  sme: number;
  saldo: number;
  /** Valor global do contrato, quando conhecido (as planilhas não trazem). */
  valor_total: number;
  id_setor: number | null;
  status: StatusContrato;
  /** Campos calculados pela API */
  setor_nome?: string | null;
  setor_sigla?: string | null;
  dias_para_vencer?: number | null;
  /** Previsão anual informada, independente dos lançamentos mensais. */
  previsto_ano?: number | null;
  total_lancado_ano?: number;
}

/** Um mês do controle de pagamentos. valor nulo = célula em branco. */
export interface Pagamento {
  id: number;
  id_contrato: number;
  ano: number;
  /** 1 = janeiro … 12 = dezembro. */
  mes: number;
  valor: number | null;
}

export interface Processo {
  id: number;
  /** Número do processo no SEI, ex.: 'PMC.2026.00130127-81'. */
  sei: string | null;
  /** Objeto da contratação — é o nome do processo nas telas. */
  objeto: string;
  descricao: string | null;
  modalidade: Modalidade | null;
  /** 1 = usa recurso de emenda, 0 = não usa. */
  emenda: 0 | 1;
  /** Números de registro nos portais obrigatórios. */
  audesp: string | null;
  pncp: string | null;
  /** Anotação livre do que está sendo feito agora. Editável na própria linha. */
  status: string | null;
  id_responsavel: number | null;
  id_responsavel_2: number | null;
  etapa: Etapa;
  prioridade: Prioridade;
  data_limite: string | null;
  /** Preenchida pela API quando a etapa vira 'Concluído'. */
  data_conclusao: string | null;
  id_setor: number | null;
  /** Campos calculados pela API */
  responsavel_nome?: string | null;
  responsavel_2_nome?: string | null;
  setor_sigla?: string | null;
  setor_nome?: string | null;
  dias_para_prazo?: number | null;
}

export interface Aquisicao {
  id: number;
  item_comprado: string;
  quantidade: number;
  valor_total: number;
  data_compra: string;
  id_setor_destino: number | null;
  id_contrato_origem: number | null;
  /** Campos calculados pela API */
  setor_nome?: string | null;
  setor_sigla?: string | null;
  contrato_numero?: string | null;
}

/** Payload consolidado que alimenta o Dashboard em uma única requisição. */
export interface DashboardData {
  ano: number;
  kpis: {
    /** Soma dos doze meses do ano, nos contratos vigentes. */
    previsto_ano: number;
    total_empenhado: number;
    saldo_emendas: number;
    total_emendas_recebido: number;
    processos_ativos: number;
    processos_atrasados: number;
    total_aquisicoes_ano: number;
    quantidade_aquisicoes_ano: number;
  };
  emendas_por_objetivo: Array<{
    objetivo: string;
    disponivel: number;
    comprometido: number;
  }>;
  contratos_a_vencer: Contrato[];
}

/** Formato único de erro devolvido pela API. */
export interface ApiError {
  erro: string;
  detalhe?: string;
}
