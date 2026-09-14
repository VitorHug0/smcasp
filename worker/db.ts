// =============================================================================
//  Utilidades do back-end: respostas JSON, validação de entrada e montagem
//  segura de INSERT/UPDATE.
//
//  Regra de segurança: nomes de coluna NUNCA vêm do corpo da requisição.
//  Cada recurso declara suas colunas em `recursos.ts`; só o que está na lista
//  entra no SQL, e sempre com parâmetro vinculado (?), nunca concatenado.
// =============================================================================

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  /**
   * Chave que assina o cookie de sessão. Defina em produção com
   * `npx wrangler secret put PAINEL_SEGREDO`. As contas e senhas ficam na
   * tabela `usuarios`, não em variáveis de ambiente.
   */
  PAINEL_SEGREDO?: string;
}

const CABECALHOS_JSON = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), { status, headers: CABECALHOS_JSON });
}

export function erro(mensagem: string, status = 400, detalhe?: string): Response {
  return json({ erro: mensagem, ...(detalhe ? { detalhe } : {}) }, status);
}

/** Erro de validação com mensagem já em português, pronta para a tela. */
export class ErroDeValidacao extends Error {}

// -----------------------------------------------------------------------------
// Definição de campos
// -----------------------------------------------------------------------------

export type TipoCampo = 'texto' | 'numero' | 'inteiro' | 'data' | 'opcao' | 'ref';

export interface Campo {
  nome: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  opcoes?: readonly string[];
  /** Rótulo usado nas mensagens de erro mostradas ao usuário. */
  rotulo: string;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function converter(campo: Campo, bruto: unknown): unknown {
  const vazio = bruto === undefined || bruto === null || bruto === '';

  if (vazio) {
    if (campo.obrigatorio) {
      throw new ErroDeValidacao(`O campo "${campo.rotulo}" é obrigatório.`);
    }
    return null;
  }

  switch (campo.tipo) {
    case 'texto': {
      const texto = String(bruto).trim();
      if (!texto && campo.obrigatorio) {
        throw new ErroDeValidacao(`O campo "${campo.rotulo}" é obrigatório.`);
      }
      if (texto.length > 2000) {
        throw new ErroDeValidacao(`O campo "${campo.rotulo}" é longo demais.`);
      }
      return texto;
    }
    case 'numero': {
      const n = Number(bruto);
      if (!Number.isFinite(n)) {
        throw new ErroDeValidacao(`O campo "${campo.rotulo}" precisa ser um valor numérico.`);
      }
      if (n < 0) {
        throw new ErroDeValidacao(`O campo "${campo.rotulo}" não pode ser negativo.`);
      }
      // Arredonda em centavos para não guardar dízimas de ponto flutuante.
      return Math.round(n * 100) / 100;
    }
    case 'inteiro':
    case 'ref': {
      const n = Number(bruto);
      if (!Number.isInteger(n)) {
        throw new ErroDeValidacao(`O campo "${campo.rotulo}" precisa ser um número inteiro.`);
      }
      return n;
    }
    case 'data': {
      const texto = String(bruto).slice(0, 10);
      if (!RE_DATA.test(texto) || Number.isNaN(Date.parse(texto))) {
        throw new ErroDeValidacao(`O campo "${campo.rotulo}" precisa ser uma data válida.`);
      }
      return texto;
    }
    case 'opcao': {
      const texto = String(bruto);
      if (campo.opcoes && !campo.opcoes.includes(texto)) {
        throw new ErroDeValidacao(
          `O campo "${campo.rotulo}" só aceita: ${campo.opcoes.join(', ')}.`,
        );
      }
      return texto;
    }
  }
}

/** Valida o corpo inteiro (usado no cadastro). */
export function validarCompleto(
  campos: readonly Campo[],
  corpo: Record<string, unknown>,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const campo of campos) {
    saida[campo.nome] = converter(campo, corpo[campo.nome]);
  }
  return saida;
}

/** Valida apenas os campos presentes (usado na edição parcial). */
export function validarParcial(
  campos: readonly Campo[],
  corpo: Record<string, unknown>,
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo.nome in corpo) {
      saida[campo.nome] = converter(campo, corpo[campo.nome]);
    }
  }
  if (Object.keys(saida).length === 0) {
    throw new ErroDeValidacao('Nenhum campo foi enviado para alteração.');
  }
  return saida;
}

// -----------------------------------------------------------------------------
// SQL
// -----------------------------------------------------------------------------

/** Tipos que o D1 aceita como parâmetro vinculado. */
export type ValorSql = string | number | boolean | null | ArrayBuffer;

export function montarInsert(tabela: string, dados: Record<string, unknown>) {
  const colunas = Object.keys(dados);
  const sql =
    `INSERT INTO ${tabela} (${colunas.join(', ')}) ` +
    `VALUES (${colunas.map(() => '?').join(', ')}) RETURNING *`;
  return { sql, valores: colunas.map((c) => dados[c] as ValorSql) };
}

export function montarUpdate(tabela: string, id: number, dados: Record<string, unknown>) {
  const colunas = Object.keys(dados);
  const sql =
    `UPDATE ${tabela} SET ${colunas.map((c) => `${c} = ?`).join(', ')} ` +
    `WHERE id = ? RETURNING *`;
  return { sql, valores: [...colunas.map((c) => dados[c] as ValorSql), id] };
}

/** Traduz erros técnicos do SQLite para algo que o usuário entenda. */
export function mensagemDeBanco(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  if (texto.includes('UNIQUE constraint failed')) {
    return 'Já existe um registro cadastrado com esse código ou número.';
  }
  if (texto.includes('FOREIGN KEY constraint failed')) {
    return 'O setor, contrato ou responsável informado não existe.';
  }
  if (texto.includes('CHECK constraint failed')) {
    return 'Algum valor informado está fora do permitido — confira datas e valores.';
  }
  if (texto.includes('NOT NULL constraint failed')) {
    return 'Faltou preencher um campo obrigatório.';
  }
  return 'Não foi possível salvar. Confira os dados e tente de novo.';
}

export async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  try {
    const corpo = await request.json();
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      throw new Error('formato');
    }
    return corpo as Record<string, unknown>;
  } catch {
    throw new ErroDeValidacao('O conteúdo enviado não é um JSON válido.');
  }
}
