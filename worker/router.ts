// =============================================================================
//  Roteador da API. Todas as rotas ficam sob /api.
//
//    GET    /api/dashboard?ano=2026     resumo do ano para a tela inicial
//    GET    /api/<recurso>              lista (aceita ?busca=, ?setor=, ?ano=)
//    POST   /api/<recurso>              cadastra
//    GET    /api/<recurso>/:id          um registro
//    PUT    /api/<recurso>/:id          substitui todos os campos
//    PATCH  /api/<recurso>/:id          altera só o que foi enviado
//    DELETE /api/<recurso>/:id          exclui
//
//  Recursos: setores, usuarios, emendas, contratos, processos, aquisicoes
// =============================================================================

import {
  ErroDeValidacao,
  erro,
  json,
  lerCorpo,
  mensagemDeBanco,
  montarInsert,
  montarUpdate,
  validarCompleto,
  validarParcial,
  type Env,
  type ValorSql,
} from './db';
import { RECURSOS } from './recursos';
import { MENSAGENS, sessaoDaRequisicao, tratarCadastro, tratarSessao } from './auth';
import { tratarAdminUsuarios } from './admin';
import { concluirProcessoComCompra, tratarCompras } from './compras';
import type { Contrato, DashboardData } from '../src/lib/types';

/** Métodos que mexem nos dados. GET e HEAD são leitura e passam para todo mundo. */
const METODOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Recursos cuja escrita é assunto do administrador, não do operador. `usuarios`
 * está aqui porque mudar o e-mail de alguém pela porta dos fundos seria uma
 * forma de contornar o painel de acessos.
 */
const SO_ADMINISTRADOR = new Set(['usuarios', 'setores']);

export async function tratarApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const partes = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  try {
    if (partes.length === 0) {
      return json({ nome: 'API Painel da Secretaria', versao: '1.0.0' });
    }

    // Entrar, sair e pedir acesso são as únicas rotas abertas — todo o resto
    // exige sessão.
    if (partes[0] === 'sessao') return await tratarSessao(request, env);
    if (partes[0] === 'cadastro') return await tratarCadastro(request, env);

    // Sem esta trava, a tela de login seria só enfeite: bastaria abrir
    // /api/contratos no navegador para ver tudo sem entrar. `sessaoDaRequisicao`
    // relê o status no banco, então conta bloqueada para aqui mesmo com o
    // cookie de 30 dias na mão.
    const usuario = await sessaoDaRequisicao(request, env);
    if (!usuario) return erro(MENSAGENS.semSessao, 401);

    // Gestão de contas: só o administrador geral.
    if (partes[0] === 'admin') {
      if (usuario.role !== 'SUPER_ADMIN') return erro(MENSAGENS.semPermissao, 403);
      if (partes[1] !== 'usuarios') return erro('Rota não encontrada.', 404);
      return await tratarAdminUsuarios(request, env, partes.slice(2), usuario);
    }

    // LEITOR consulta e pronto. A trava é aqui, e não só nos botões da tela:
    // esconder o botão evita o clique por engano, mas não impede ninguém de
    // chamar a API direto.
    if (METODOS_DE_ESCRITA.has(request.method)) {
      if (usuario.role === 'LEITOR') {
        return erro(
          'Seu acesso é somente para consulta. Peça ao administrador o perfil de Operador.',
          403,
        );
      }
      if (SO_ADMINISTRADOR.has(partes[0]) && usuario.role !== 'SUPER_ADMIN') {
        return erro(
          'Cadastro de setores e de usuários é feito pelo Administrador Geral.',
          403,
        );
      }
    }

    if (partes[0] === 'dashboard') {
      if (request.method !== 'GET') return erro('Método não permitido.', 405);
      return json(await montarDashboard(env, url.searchParams.get('ano')));
    }

    if (partes[0] === 'compras') {
      return await tratarCompras(request, env, partes.slice(1));
    }

    if (partes[0] === 'processos' && partes.length === 3 && partes[2] === 'concluir-compra') {
      const id = Number(partes[1]);
      if (!Number.isInteger(id) || id <= 0) return erro('Identificador inválido.', 400);
      return await concluirProcessoComCompra(request, env, id);
    }

    const recurso = RECURSOS[partes[0]];
    if (!recurso) return erro('Recurso não encontrado.', 404);

    // ---- coleção -----------------------------------------------------------
    if (partes.length === 1) {
      if (request.method === 'GET') return await listar(env, partes[0], url.searchParams);
      if (request.method === 'POST') return await criar(env, partes[0], request);
      return erro('Método não permitido.', 405);
    }

    // ---- registro ----------------------------------------------------------
    if (partes.length === 2) {
      const id = Number(partes[1]);
      if (!Number.isInteger(id) || id <= 0) return erro('Identificador inválido.', 400);

      if (request.method === 'GET') return await obter(env, partes[0], id);
      if (request.method === 'PUT') return await alterar(env, partes[0], id, request, false);
      if (request.method === 'PATCH') return await alterar(env, partes[0], id, request, true);
      if (request.method === 'DELETE') return await excluir(env, partes[0], id);
      return erro('Método não permitido.', 405);
    }

    return erro('Rota não encontrada.', 404);
  } catch (e) {
    if (e instanceof ErroDeValidacao) return erro(e.message, 422);
    console.error('Falha na API:', e);
    // Violação de regra do banco (código repetido, setor inexistente…) é erro
    // de quem preencheu o formulário, não do servidor.
    const texto = e instanceof Error ? e.message : String(e);
    const status = texto.includes('constraint failed') ? 409 : 500;
    return erro(mensagemDeBanco(e), status);
  }
}

// -----------------------------------------------------------------------------
// Operações genéricas
// -----------------------------------------------------------------------------

/** Colunas de texto onde a busca livre (?busca=) procura, por recurso. */
const COLUNAS_DE_BUSCA: Record<string, string[]> = {
  setores: ['nome', 'sigla'],
  usuarios: ['u.nome', 'u.email'],
  emendas: ['e.codigo', 'e.autor', 'e.objetivo', 'e.finalidade', 'e.processo'],
  contratos: [
    'c.sei',
    'c.numero_contrato',
    'c.numero_ultimo_ajuste',
    'c.fornecedor',
    'c.objeto',
    'c.gestor',
    'c.fiscal',
  ],
  processos: ['p.sei', 'p.objeto', 'p.descricao', 'p.status', 'p.audesp', 'p.pncp'],
  aquisicoes: ['a.item_comprado'],
};

/**
 * Coluna de setor usada pelo filtro ?setor=, por recurso. Emendas ficaram de
 * fora: elas passaram a ser organizadas por objetivo, não por setor de destino.
 */
const COLUNA_SETOR: Record<string, string> = {
  usuarios: 'u.id_setor',
  contratos: 'c.id_setor',
  processos: 'p.id_setor',
  aquisicoes: 'a.id_setor_destino',
};

async function listar(env: Env, nome: string, params: URLSearchParams): Promise<Response> {
  const recurso = RECURSOS[nome];
  const condicoes: string[] = [];
  const valores: unknown[] = [];

  const busca = (params.get('busca') ?? '').trim();
  if (busca && COLUNAS_DE_BUSCA[nome]) {
    const alvo = COLUNAS_DE_BUSCA[nome];
    condicoes.push(`(${alvo.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    for (let i = 0; i < alvo.length; i++) valores.push(`%${busca}%`);
  }

  const setor = params.get('setor');
  if (setor && COLUNA_SETOR[nome] && Number.isInteger(Number(setor))) {
    condicoes.push(`${COLUNA_SETOR[nome]} = ?`);
    valores.push(Number(setor));
  }

  if (nome === 'contratos') {
    const status = params.get('status');
    if (status) {
      condicoes.push('c.status = ?');
      valores.push(status);
    }
    const renovar = params.get('renovar');
    if (renovar) {
      condicoes.push('c.interesse_renovar = ?');
      valores.push(renovar);
    }
  }

  // A tela de pagamentos pede um ano por vez: ?ano=2026.
  if (nome === 'pagamentos') {
    const anoPagamento = params.get('ano');
    if (anoPagamento && Number.isInteger(Number(anoPagamento))) {
      condicoes.push('pg.ano = ?');
      valores.push(Number(anoPagamento));
    }
    const contrato = params.get('contrato');
    if (contrato && Number.isInteger(Number(contrato))) {
      condicoes.push('pg.id_contrato = ?');
      valores.push(Number(contrato));
    }
  }

  if (nome === 'processos') {
    const etapa = params.get('etapa');
    if (etapa) {
      condicoes.push('p.etapa = ?');
      valores.push(etapa);
    }
    const modalidade = params.get('modalidade');
    if (modalidade) {
      condicoes.push('p.modalidade = ?');
      valores.push(modalidade);
    }
    const emenda = params.get('emenda');
    if (emenda === '0' || emenda === '1') {
      condicoes.push('p.emenda = ?');
      valores.push(Number(emenda));
    }
    // ?situacao=abertos devolve só o que está no quadro;
    // ?situacao=concluidos devolve só o que já foi encerrado.
    const situacao = params.get('situacao');
    if (situacao === 'abertos') condicoes.push(`p.etapa <> 'Concluído'`);
    if (situacao === 'concluidos') condicoes.push(`p.etapa = 'Concluído'`);
  }

  const ano = params.get('ano');
  if (ano && Number.isInteger(Number(ano))) {
    if (nome === 'emendas') {
      condicoes.push('e.ano = ?');
      valores.push(Number(ano));
    } else if (nome === 'aquisicoes') {
      condicoes.push(`strftime('%Y', a.data_compra) = ?`);
      valores.push(String(ano));
    }
  }

  // Pagamentos são doze linhas por contrato, então o teto precisa ser mais
  // alto que o das outras listas para caber um ano inteiro de uma vez.
  const teto = nome === 'pagamentos' ? 5000 : 500;
  const sql =
    `${recurso.select} ` +
    (condicoes.length ? `WHERE ${condicoes.join(' AND ')} ` : '') +
    `ORDER BY ${recurso.ordem} LIMIT ${teto}`;

  const { results } = await env.DB.prepare(sql)
    .bind(...(valores as ValorSql[]))
    .all();
  return json(results);
}

async function obter(env: Env, nome: string, id: number): Promise<Response> {
  const recurso = RECURSOS[nome];
  // 'setores' consulta a tabela sem apelido; os outros usam o apelido
  // declarado no recurso, ou a primeira letra da tabela por convenção.
  const prefixo =
    nome === 'setores' ? '' : `${recurso.apelido ?? recurso.tabela[0]}.`;
  const registro = await env.DB.prepare(`${recurso.select} WHERE ${prefixo}id = ?`)
    .bind(id)
    .first();
  if (!registro) return erro('Registro não encontrado.', 404);
  return json(registro);
}

async function criar(env: Env, nome: string, request: Request): Promise<Response> {
  const recurso = RECURSOS[nome];
  const corpo = await lerCorpo(request);
  if (nome === 'processos' && corpo.etapa === 'Concluído') {
    throw new ErroDeValidacao('Conclua o processo anexando e confirmando a Nota de Empenho.');
  }
  const dados = validarCompleto(recurso.campos, corpo);
  validarRegras(nome, dados);
  ajustarDataDeConclusao(nome, dados);

  if (nome === 'previsoes') {
    const criado = await env.DB.prepare(`INSERT INTO previsoes_contrato (id_contrato, ano, valor)
      VALUES (?, ?, ?) ON CONFLICT(id_contrato, ano) DO UPDATE SET valor = excluded.valor RETURNING id`)
      .bind(dados.id_contrato as number, dados.ano as number, dados.valor as number | null)
      .first<{ id: number }>();
    return criado ? obter(env, nome, criado.id) : erro('Não foi possível salvar a previsão.', 500);
  }

  const { sql, valores } = montarInsert(recurso.tabela, limparNulos(dados));
  const criado = await env.DB.prepare(sql).bind(...valores).first<{ id: number }>();
  if (!criado) return erro('Não foi possível cadastrar o registro.', 500);
  return await obter(env, nome, criado.id);
}

async function alterar(
  env: Env,
  nome: string,
  id: number,
  request: Request,
  parcial: boolean,
): Promise<Response> {
  const recurso = RECURSOS[nome];
  const corpo = await lerCorpo(request);
  if (nome === 'processos' && corpo.etapa === 'Concluído') {
    const atual = await env.DB.prepare('SELECT etapa FROM processos WHERE id = ?').bind(id)
      .first<{ etapa: string }>();
    if (atual?.etapa !== 'Concluído') {
      throw new ErroDeValidacao('Conclua o processo anexando e confirmando a Nota de Empenho.');
    }
  }
  const dados = parcial
    ? validarParcial(recurso.campos, corpo)
    : validarCompleto(recurso.campos, corpo);

  if (!parcial) validarRegras(nome, dados);
  ajustarDataDeConclusao(nome, dados);

  const { sql, valores } = montarUpdate(recurso.tabela, id, dados);
  const alterado = await env.DB.prepare(sql)
    .bind(...(valores as ValorSql[]))
    .first<{ id: number }>();
  if (!alterado) return erro('Registro não encontrado.', 404);
  return await obter(env, nome, id);
}

async function excluir(env: Env, nome: string, id: number): Promise<Response> {
  const recurso = RECURSOS[nome];
  const r = await env.DB.prepare(`DELETE FROM ${recurso.tabela} WHERE id = ?`).bind(id).run();
  if (!r.meta.changes) return erro('Registro não encontrado.', 404);
  return json({ ok: true, id });
}

/** Remove chaves nulas para que os DEFAULT do schema entrem em ação. */
function limparNulos(dados: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor !== null) saida[chave] = valor;
  }
  return saida;
}

/**
 * Preenche ou limpa a data de conclusão sozinha, para que ninguém precise
 * lembrar de anotá-la ao arrastar o cartão para "Concluído".
 */
function ajustarDataDeConclusao(nome: string, dados: Record<string, unknown>): void {
  if (nome !== 'processos' || !('etapa' in dados)) return;
  dados.data_conclusao = dados.etapa === 'Concluído' ? new Date().toISOString().slice(0, 10) : null;
}

/** Regras que dependem de mais de um campo ao mesmo tempo. */
function validarRegras(nome: string, dados: Record<string, unknown>): void {
  if (nome === 'processos' && dados.emenda !== null && dados.emenda !== undefined) {
    if (dados.emenda !== 0 && dados.emenda !== 1) {
      throw new ErroDeValidacao('O campo "Emenda" só aceita sim ou não.');
    }
  }
  if (nome === 'emendas') {
    const valor = Number(dados.valor_recebido ?? 0);
    const comprometido = Number(dados.a_liquidar ?? 0) + Number(dados.liquidado ?? 0);
    if (comprometido > valor) {
      throw new ErroDeValidacao(
        'A liquidar mais liquidado não pode passar do valor da emenda.',
      );
    }
  }
  if (nome === 'contratos') {
    const inicio = String(dados.data_inicio ?? '');
    const fim = String(dados.data_fim_vigencia ?? '');
    if (inicio && fim && fim < inicio) {
      throw new ErroDeValidacao('O término não pode ser anterior à data do 1º contrato.');
    }
  }
  if (nome === 'pagamentos') {
    const mes = Number(dados.mes ?? 0);
    if (dados.mes !== undefined && dados.mes !== null && (mes < 1 || mes > 12)) {
      throw new ErroDeValidacao('O mês precisa estar entre 1 (janeiro) e 12 (dezembro).');
    }
  }
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------

async function montarDashboard(env: Env, anoParam: string | null): Promise<DashboardData> {
  const ano = Number(anoParam) || new Date().getUTCFullYear();

  const [kpisContratos, kpisEmendas, kpisProcessos, kpisAquisicoes, porObjetivo, aVencer] =
    await env.DB.batch([
      // Os contratos reais não trazem "valor pago": a planilha da Coordenadoria
      // controla o previsto do ano (soma dos meses) e o quanto está empenhado.
      env.DB.prepare(`
        SELECT COALESCE((SELECT SUM(pg.valor) FROM previsoes_contrato pg
                          JOIN contratos c2 ON c2.id = pg.id_contrato
                         WHERE pg.ano = ? AND c2.status = 'Vigente'), 0)
                 AS previsto_ano,
               COALESCE(SUM(empenho), 0) AS total_empenhado
        FROM contratos WHERE status = 'Vigente'`).bind(ano),
      env.DB.prepare(`
        SELECT COALESCE(SUM(valor_recebido), 0)                            AS recebido,
               COALESCE(SUM(valor_recebido - a_liquidar - liquidado), 0)   AS saldo
        FROM emendas WHERE ano = ?`).bind(ano),
      env.DB.prepare(`
        SELECT COUNT(*) AS ativos,
               SUM(CASE WHEN data_limite IS NOT NULL AND data_limite < date('now')
                        THEN 1 ELSE 0 END) AS atrasados
        FROM processos WHERE etapa <> 'Concluído'`),
      env.DB.prepare(`
        SELECT COALESCE(SUM(valor_total), 0) AS total, COUNT(*) AS quantidade
          FROM compras WHERE strftime('%Y', data_compra) = ?`).bind(String(ano)),
      // Emendas agrupadas pelo objetivo — é como a planilha da Câmara as
      // organiza, e é a pergunta que a Coordenadoria faz: quanto do dinheiro
      // é para monitoramento, quanto para munição, quanto para drones.
      env.DB.prepare(`
        SELECT COALESCE(NULLIF(TRIM(e.objetivo), ''), 'Sem objetivo')      AS objetivo,
               COALESCE(SUM(e.valor_recebido - e.a_liquidar - e.liquidado), 0)
                 AS disponivel,
               COALESCE(SUM(e.a_liquidar + e.liquidado), 0)                AS comprometido
        FROM emendas e
        WHERE e.ano = ?
        GROUP BY 1
        ORDER BY (disponivel + comprometido) DESC`).bind(ano),
      env.DB.prepare(`
        ${RECURSOS.contratos.select}
        WHERE c.status = 'Vigente'
          AND date(c.data_fim_vigencia) <= date('now', '+90 days')
        ORDER BY c.data_fim_vigencia
        LIMIT 20`),
    ]);

  const c = (kpisContratos.results[0] ?? {}) as Record<string, number>;
  const e = (kpisEmendas.results[0] ?? {}) as Record<string, number>;
  const p = (kpisProcessos.results[0] ?? {}) as Record<string, number>;
  const a = (kpisAquisicoes.results[0] ?? {}) as Record<string, number>;

  return {
    ano,
    kpis: {
      previsto_ano: c.previsto_ano ?? 0,
      total_empenhado: c.total_empenhado ?? 0,
      saldo_emendas: e.saldo ?? 0,
      total_emendas_recebido: e.recebido ?? 0,
      processos_ativos: p.ativos ?? 0,
      processos_atrasados: p.atrasados ?? 0,
      total_aquisicoes_ano: a.total ?? 0,
      quantidade_aquisicoes_ano: a.quantidade ?? 0,
    },
    emendas_por_objetivo: porObjetivo.results as DashboardData['emendas_por_objetivo'],
    contratos_a_vencer: aVencer.results as unknown as Contrato[],
  };
}
