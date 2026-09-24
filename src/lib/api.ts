// =============================================================================
//  Cliente HTTP da aplicação. Concentra o tratamento de erro num lugar só,
//  para que toda tela mostre a mesma mensagem amigável quando algo falha.
// =============================================================================

import type {
  Aquisicao,
  Compra,
  DadosCompra,
  Contrato,
  DashboardData,
  Emenda,
  ListaDeUsuarios,
  Pagamento,
  Papel,
  Processo,
  Setor,
  SituacaoUsuario,
  Usuario,
  UsuarioAdmin,
  UsuarioSessao,
} from './types';

export class ErroDaApi extends Error {
  constructor(
    mensagem: string,
    public status: number,
    /**
     * Só no login: 'PENDENTE' ou 'BLOQUEADO'. É o que distingue "a senha está
     * errada" de "a senha está certa, mas a conta ainda não foi liberada" —
     * casos que levam a telas diferentes.
     */
    public situacao?: SituacaoUsuario,
  ) {
    super(mensagem);
  }
}

/**
 * Avisado quando o servidor recusa por falta de sessão (401). O App usa isso
 * para voltar à tela de login sem que a pessoa fique numa tela que não carrega.
 */
let aoPerderSessao: (() => void) | null = null;
export function quandoPerderSessao(acao: () => void): void {
  aoPerderSessao = acao;
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      ...opcoes,
      // O cookie de sessão é HttpOnly: o navegador o envia sozinho, e o
      // JavaScript da página nunca o lê.
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(opcoes.headers ?? {}) },
    });
  } catch {
    throw new ErroDaApi('Sem conexão com o servidor. Verifique a internet e tente de novo.', 0);
  }

  // 401 nas rotas de entrada é resposta esperada (senha errada) e é tratada
  // pela própria tela; nas demais, quer dizer que a sessão caiu.
  const rotaDeEntrada = caminho.startsWith('/sessao') || caminho.startsWith('/cadastro');
  if (resposta.status === 401 && !rotaDeEntrada) {
    aoPerderSessao?.();
  }

  if (!resposta.ok) {
    let mensagem = 'Não foi possível concluir a operação.';
    let situacao: SituacaoUsuario | undefined;
    try {
      const corpo = (await resposta.json()) as { erro?: string; situacao?: SituacaoUsuario };
      if (corpo?.erro) mensagem = corpo.erro;
      situacao = corpo?.situacao;
    } catch {
      /* resposta sem JSON — mantém a mensagem padrão */
    }
    throw new ErroDaApi(mensagem, resposta.status, situacao);
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

const corpo = (dados: unknown) => ({ body: JSON.stringify(dados) });

export interface EstadoDaSessao {
  autenticado: boolean;
  usuario?: UsuarioSessao;
}

/** O que o formulário de "Criar conta" envia. */
export interface DadosDeCadastro {
  nome: string;
  email: string;
  senha: string;
  id_setor: number | '';
}

export const api = {
  /** Entrar, sair e saber quem está conectado. */
  sessao: {
    verificar: () => pedir<EstadoDaSessao>('/sessao'),
    entrar: (email: string, senha: string, manter: boolean) =>
      pedir<EstadoDaSessao>('/sessao', { method: 'POST', ...corpo({ email, senha, manter }) }),
    sair: () => pedir<{ ok: true }>('/sessao', { method: 'DELETE' }),
  },

  /** Pedir acesso. É a única parte da API que responde sem sessão. */
  cadastro: {
    /** Setores para a lista do formulário — /api/setores exigiria estar dentro. */
    setores: () => pedir<{ setores: Setor[] }>('/cadastro').then((r) => r.setores),
    enviar: (dados: DadosDeCadastro) =>
      pedir<{ ok: true; situacao: 'PENDENTE'; mensagem: string }>('/cadastro', {
        method: 'POST',
        ...corpo(dados),
      }),
  },

  /** Gestão de contas — só responde para o Administrador Geral. */
  admin: {
    usuarios: {
      listar: () => pedir<ListaDeUsuarios>('/admin/usuarios'),
      /** Aprovar é isto: status ATIVO junto com o papel e o setor escolhidos. */
      ajustar: (
        id: number,
        d: { role?: Papel; status?: SituacaoUsuario; id_setor?: number | null; nome?: string },
      ) =>
        pedir<{ ok: true; usuario: UsuarioAdmin }>(`/admin/usuarios/${id}`, {
          method: 'PATCH',
          ...corpo(d),
        }),
      definirSenha: (id: number, senha: string) =>
        pedir<{ ok: true; usuario: UsuarioAdmin }>(`/admin/usuarios/${id}/senha`, {
          method: 'POST',
          ...corpo({ senha }),
        }),
      excluir: (id: number) => pedir<{ ok: true }>(`/admin/usuarios/${id}`, { method: 'DELETE' }),
    },
  },

  dashboard: (ano?: number) =>
    pedir<DashboardData>(`/dashboard${ano ? `?ano=${ano}` : ''}`),

  setores: {
    listar: () => pedir<Setor[]>('/setores'),
    criar: (d: Partial<Setor>) => pedir<Setor>('/setores', { method: 'POST', ...corpo(d) }),
  },

  usuarios: {
    listar: () => pedir<Usuario[]>('/usuarios'),
    criar: (d: Partial<Usuario>) => pedir<Usuario>('/usuarios', { method: 'POST', ...corpo(d) }),
  },

  emendas: {
    listar: (busca = '') => pedir<Emenda[]>(`/emendas?busca=${encodeURIComponent(busca)}`),
    criar: (d: Partial<Emenda>) => pedir<Emenda>('/emendas', { method: 'POST', ...corpo(d) }),
    alterar: (id: number, d: Partial<Emenda>) =>
      pedir<Emenda>(`/emendas/${id}`, { method: 'PUT', ...corpo(d) }),
    excluir: (id: number) => pedir<void>(`/emendas/${id}`, { method: 'DELETE' }),
  },

  contratos: {
    listar: (busca = '') => pedir<Contrato[]>(`/contratos?busca=${encodeURIComponent(busca)}`),
    criar: (d: Partial<Contrato>) =>
      pedir<Contrato>('/contratos', { method: 'POST', ...corpo(d) }),
    alterar: (id: number, d: Partial<Contrato>) =>
      pedir<Contrato>(`/contratos/${id}`, { method: 'PUT', ...corpo(d) }),
    /** Corrige um campo só, sem reenviar o contrato inteiro. */
    ajustar: (id: number, d: Partial<Contrato>) =>
      pedir<Contrato>(`/contratos/${id}`, { method: 'PATCH', ...corpo(d) }),
    excluir: (id: number) => pedir<void>(`/contratos/${id}`, { method: 'DELETE' }),
  },

  /** Valores mês a mês do controle de pagamentos. */
  previsoes: {
    salvar: (id_contrato: number, ano: number, valor: number | null) =>
      pedir('/previsoes', { method: 'POST', ...corpo({ id_contrato, ano, valor }) }),
  },
  pagamentos: {
    listar: (ano: number) => pedir<Pagamento[]>(`/pagamentos?ano=${ano}`),
    /** Lança um mês que ainda não existia na planilha. */
    criar: (d: Partial<Pagamento>) =>
      pedir<Pagamento>('/pagamentos', { method: 'POST', ...corpo(d) }),
    /** Corrige o valor de um mês já lançado. */
    ajustar: (id: number, d: Partial<Pagamento>) =>
      pedir<Pagamento>(`/pagamentos/${id}`, { method: 'PATCH', ...corpo(d) }),
  },

  processos: {
    /** situacao: 'abertos' = só o quadro · 'concluidos' = só os encerrados. */
    listar: (situacao?: 'abertos' | 'concluidos') =>
      pedir<Processo[]>(`/processos${situacao ? `?situacao=${situacao}` : ''}`),
    criar: (d: Partial<Processo>) =>
      pedir<Processo>('/processos', { method: 'POST', ...corpo(d) }),
    /** Usado pelo quadro: muda só o status ou só o responsável. */
    ajustar: (id: number, d: Partial<Processo>) =>
      pedir<Processo>(`/processos/${id}`, { method: 'PATCH', ...corpo(d) }),
    /** Usado pelo botão "Editar": substitui o processo por completo. */
    alterar: (id: number, d: Partial<Processo>) =>
      pedir<Processo>(`/processos/${id}`, { method: 'PUT', ...corpo(d) }),
    excluir: (id: number) => pedir<void>(`/processos/${id}`, { method: 'DELETE' }),
    concluirComCompra: (id: number, d: DadosCompra) =>
      pedir<Compra>(`/processos/${id}/concluir-compra`, { method: 'POST', ...corpo(d) }),
  },

  compras: {
    listar: (busca = '') => pedir<Compra[]>(`/compras?busca=${encodeURIComponent(busca)}`),
    obter: (id: number) => pedir<Compra>(`/compras/${id}`),
    criar: (d: DadosCompra) => pedir<Compra>('/compras', { method: 'POST', ...corpo(d) }),
    alterar: (id: number, d: DadosCompra) =>
      pedir<Compra>(`/compras/${id}`, { method: 'PUT', ...corpo(d) }),
    excluir: (id: number) => pedir<void>(`/compras/${id}`, { method: 'DELETE' }),
  },

  aquisicoes: {
    listar: (busca = '') => pedir<Aquisicao[]>(`/aquisicoes?busca=${encodeURIComponent(busca)}`),
    criar: (d: Partial<Aquisicao>) =>
      pedir<Aquisicao>('/aquisicoes', { method: 'POST', ...corpo(d) }),
    excluir: (id: number) => pedir<void>(`/aquisicoes/${id}`, { method: 'DELETE' }),
  },
};
