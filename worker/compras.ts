import { ErroDeValidacao, erro, json, lerCorpo, type Env, type ValorSql } from './db';

interface ItemEntrada {
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface CompraEntrada {
  numero_empenho: string;
  numero_processo: string;
  data_compra: string;
  fornecedor_nome: string;
  fornecedor_documento: string | null;
  id_setor_responsavel: number;
  valor_total: number;
  nota_nome: string | null;
  nota_hash: string | null;
  itens: ItemEntrada[];
}

const SELECT_COMPRA = `
  SELECT c.id, c.numero_empenho, c.numero_processo, c.data_compra,
         c.fornecedor_nome, c.fornecedor_documento, c.id_setor_responsavel,
         c.id_processo, c.id_aquisicao_legada, c.valor_total, c.nota_nome, c.nota_hash,
         s.nome AS setor_nome, s.sigla AS setor_sigla,
         p.objeto AS processo_objeto,
         (SELECT COUNT(*) FROM compra_itens i WHERE i.id_compra = c.id) AS quantidade_itens
    FROM compras c
    LEFT JOIN setores s ON s.id = c.id_setor_responsavel
    LEFT JOIN processos p ON p.id = c.id_processo`;

const centavos = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

function texto(corpo: Record<string, unknown>, campo: string, rotulo: string, obrigatorio = true) {
  const valor = String(corpo[campo] ?? '').trim();
  if (obrigatorio && !valor) throw new ErroDeValidacao(`O campo "${rotulo}" é obrigatório.`);
  if (valor.length > 2000) throw new ErroDeValidacao(`O campo "${rotulo}" é longo demais.`);
  return valor || null;
}

function documentoValido(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '');
  if (!/^(\d)\1+$/.test(digitos)) {
    if (digitos.length === 11) {
      const dv = (base: string, peso: number) => {
        let soma = 0;
        for (const d of base) soma += Number(d) * peso--;
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
      };
      const d1 = dv(digitos.slice(0, 9), 10);
      const d2 = dv(digitos.slice(0, 9) + d1, 11);
      return digitos.endsWith(`${d1}${d2}`);
    }
    if (digitos.length === 14) {
      const dv = (base: string, pesos: number[]) => {
        const soma = [...base].reduce((s, d, i) => s + Number(d) * pesos[i], 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
      };
      const d1 = dv(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const d2 = dv(digitos.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      return digitos.endsWith(`${d1}${d2}`);
    }
  }
  return false;
}

function validarCompra(corpo: Record<string, unknown>): CompraEntrada {
  const numeroEmpenho = texto(corpo, 'numero_empenho', 'Nº do Empenho')!;
  const numeroProcesso = texto(corpo, 'numero_processo', 'Nº do Processo')!;
  const data = texto(corpo, 'data_compra', 'Data')!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
    throw new ErroDeValidacao('Informe uma data válida.');
  }
  const fornecedor = texto(corpo, 'fornecedor_nome', 'Fornecedor')!;
  const documento = texto(corpo, 'fornecedor_documento', 'CNPJ/CPF', false);
  if (documento && !documentoValido(documento)) {
    throw new ErroDeValidacao('O CNPJ/CPF informado não é válido.');
  }
  const setor = Number(corpo.id_setor_responsavel);
  if (!Number.isInteger(setor) || setor <= 0) {
    throw new ErroDeValidacao('Selecione o setor responsável.');
  }
  if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
    throw new ErroDeValidacao('Adicione pelo menos um item à compra.');
  }
  if (corpo.itens.length > 200) throw new ErroDeValidacao('A compra excede o limite de 200 itens.');

  const itens = corpo.itens.map((bruto, indice): ItemEntrada => {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
      throw new ErroDeValidacao(`O item ${indice + 1} é inválido.`);
    }
    const item = bruto as Record<string, unknown>;
    const descricao = String(item.descricao ?? '').trim();
    const quantidade = Number(item.quantidade);
    const unitario = centavos(Number(item.valor_unitario));
    if (!descricao) throw new ErroDeValidacao(`Informe a descrição do item ${indice + 1}.`);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      throw new ErroDeValidacao(`Informe uma quantidade válida no item ${indice + 1}.`);
    }
    if (!Number.isFinite(unitario) || unitario < 0) {
      throw new ErroDeValidacao(`Informe um valor unitário válido no item ${indice + 1}.`);
    }
    const calculado = centavos(quantidade * unitario);
    if (item.valor_total !== undefined && Math.abs(Number(item.valor_total) - calculado) > 0.01) {
      throw new ErroDeValidacao(`O total do item ${indice + 1} não confere com quantidade × valor unitário.`);
    }
    return {
      codigo: String(item.codigo ?? '').trim() || null,
      descricao,
      unidade: String(item.unidade ?? '').trim() || null,
      quantidade,
      valor_unitario: unitario,
      valor_total: calculado,
    };
  });

  const total = centavos(itens.reduce((soma, item) => soma + item.valor_total, 0));
  if (corpo.valor_total !== undefined && Math.abs(Number(corpo.valor_total) - total) > 0.01) {
    throw new ErroDeValidacao('O valor total do empenho não confere com a soma dos itens.');
  }

  return {
    numero_empenho: numeroEmpenho,
    numero_processo: numeroProcesso,
    data_compra: data,
    fornecedor_nome: fornecedor,
    fornecedor_documento: documento,
    id_setor_responsavel: setor,
    valor_total: total,
    nota_nome: texto(corpo, 'nota_nome', 'Nome do arquivo', false),
    nota_hash: texto(corpo, 'nota_hash', 'Identificação do arquivo', false),
    itens,
  };
}

async function obterCompra(env: Env, id: number): Promise<Response> {
  const compra = await env.DB.prepare(`${SELECT_COMPRA} WHERE c.id = ?`).bind(id).first();
  if (!compra) return erro('Compra não encontrada.', 404);
  const { results } = await env.DB.prepare(`
    SELECT id, id_compra, codigo, descricao, unidade, quantidade,
           valor_unitario, valor_total, ordem
      FROM compra_itens WHERE id_compra = ? ORDER BY ordem, id`).bind(id).all();
  return json({ ...compra, itens: results });
}

function insertItem(env: Env, seletorCompra: string, seletorValor: ValorSql, item: ItemEntrada, ordem: number) {
  return env.DB.prepare(`
    INSERT INTO compra_itens
      (id_compra, codigo, descricao, unidade, quantidade, valor_unitario, valor_total, ordem)
    SELECT ${seletorCompra}, ?, ?, ?, ?, ?, ?, ?`)
    .bind(seletorValor, item.codigo, item.descricao, item.unidade, item.quantidade,
      item.valor_unitario, item.valor_total, ordem);
}

async function duplicada(env: Env, compra: CompraEntrada, ignorarId?: number): Promise<Response | null> {
  const existente = await env.DB.prepare(`
    SELECT id FROM compras
     WHERE (numero_empenho = ? COLLATE NOCASE OR (? IS NOT NULL AND nota_hash = ?))
       AND (? IS NULL OR id <> ?) LIMIT 1`)
    .bind(compra.numero_empenho, compra.nota_hash, compra.nota_hash, ignorarId ?? null, ignorarId ?? null)
    .first<{ id: number }>();
  return existente
    ? erro(`Já existe uma compra registrada para o Empenho ${compra.numero_empenho}.`, 409)
    : null;
}

async function criar(env: Env, corpo: Record<string, unknown>, idProcesso: number | null) {
  const compra = validarCompra(corpo);
  const repetida = await duplicada(env, compra);
  if (repetida) return repetida;

  const comandos = [env.DB.prepare(`
    INSERT INTO compras
      (numero_empenho, numero_processo, data_compra, fornecedor_nome,
       fornecedor_documento, id_setor_responsavel, id_processo, valor_total, nota_nome, nota_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(compra.numero_empenho, compra.numero_processo, compra.data_compra,
      compra.fornecedor_nome, compra.fornecedor_documento, compra.id_setor_responsavel,
      idProcesso, compra.valor_total, compra.nota_nome, compra.nota_hash),
    ...compra.itens.map((item, ordem) => insertItem(
      env,
      `(SELECT id FROM compras WHERE numero_empenho = ? COLLATE NOCASE)`,
      compra.numero_empenho,
      item,
      ordem,
    )),
  ];
  await env.DB.batch(comandos);
  const salvo = await env.DB.prepare('SELECT id FROM compras WHERE numero_empenho = ? COLLATE NOCASE')
    .bind(compra.numero_empenho).first<{ id: number }>();
  return salvo ? obterCompra(env, salvo.id) : erro('Não foi possível criar a compra.', 500);
}

async function editar(env: Env, id: number, corpo: Record<string, unknown>) {
  const existe = await env.DB.prepare('SELECT id FROM compras WHERE id = ?').bind(id).first();
  if (!existe) return erro('Compra não encontrada.', 404);
  const compra = validarCompra(corpo);
  const repetida = await duplicada(env, compra, id);
  if (repetida) return repetida;
  const comandos = [
    env.DB.prepare(`UPDATE compras SET numero_empenho = ?, numero_processo = ?, data_compra = ?,
      fornecedor_nome = ?, fornecedor_documento = ?, id_setor_responsavel = ?, valor_total = ?
      WHERE id = ?`).bind(compra.numero_empenho, compra.numero_processo, compra.data_compra,
      compra.fornecedor_nome, compra.fornecedor_documento, compra.id_setor_responsavel,
      compra.valor_total, id),
    env.DB.prepare('DELETE FROM compra_itens WHERE id_compra = ?').bind(id),
    ...compra.itens.map((item, ordem) => insertItem(env, '?', id, item, ordem)),
  ];
  await env.DB.batch(comandos);
  return obterCompra(env, id);
}

export async function concluirProcessoComCompra(
  request: Request,
  env: Env,
  idProcesso: number,
): Promise<Response> {
  if (request.method !== 'POST') return erro('Método não permitido.', 405);
  const processo = await env.DB.prepare('SELECT id, sei, etapa FROM processos WHERE id = ?')
    .bind(idProcesso).first<{ id: number; sei: string | null; etapa: string }>();
  if (!processo) return erro('Processo não encontrado.', 404);
  if (processo.etapa === 'Concluído') return erro('Este processo já está concluído.', 409);

  const corpo = await lerCorpo(request);
  const compra = validarCompra(corpo);
  const atual = String(processo.sei ?? '').trim().toLocaleUpperCase('pt-BR');
  const informado = compra.numero_processo.trim().toLocaleUpperCase('pt-BR');
  if (!atual || atual !== informado) {
    return erro(
      `O número do processo identificado na Nota de Empenho não corresponde ao processo atual. Processo atual: ${processo.sei ?? 'não informado'}. Processo identificado: ${compra.numero_processo}.`,
      409,
    );
  }
  const repetida = await duplicada(env, compra);
  if (repetida) return repetida;

  const comandos = [env.DB.prepare(`
    INSERT INTO compras
      (numero_empenho, numero_processo, data_compra, fornecedor_nome,
       fornecedor_documento, id_setor_responsavel, id_processo, valor_total, nota_nome, nota_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(compra.numero_empenho, compra.numero_processo, compra.data_compra,
      compra.fornecedor_nome, compra.fornecedor_documento, compra.id_setor_responsavel,
      idProcesso, compra.valor_total, compra.nota_nome, compra.nota_hash),
    ...compra.itens.map((item, ordem) => insertItem(
      env,
      `(SELECT id FROM compras WHERE numero_empenho = ? COLLATE NOCASE)`,
      compra.numero_empenho,
      item,
      ordem,
    )),
    env.DB.prepare(`UPDATE processos SET etapa = 'Concluído', data_conclusao = date('now')
      WHERE id = ? AND etapa <> 'Concluído'`).bind(idProcesso),
  ];
  await env.DB.batch(comandos);
  const salvo = await env.DB.prepare('SELECT id FROM compras WHERE numero_empenho = ? COLLATE NOCASE')
    .bind(compra.numero_empenho).first<{ id: number }>();
  return salvo ? obterCompra(env, salvo.id) : erro('Não foi possível concluir o processo.', 500);
}

export async function tratarCompras(request: Request, env: Env, partes: string[]): Promise<Response> {
  if (partes.length === 0) {
    if (request.method === 'GET') {
      const busca = new URL(request.url).searchParams.get('busca')?.trim() ?? '';
      const condicao = busca
        ? ` WHERE c.numero_empenho LIKE ? OR c.numero_processo LIKE ? OR c.fornecedor_nome LIKE ?`
        : '';
      const valores = busca ? [`%${busca}%`, `%${busca}%`, `%${busca}%`] : [];
      const { results } = await env.DB.prepare(
        `${SELECT_COMPRA}${condicao} ORDER BY c.data_compra DESC, c.id DESC LIMIT 500`,
      ).bind(...valores).all();
      return json(results);
    }
    if (request.method === 'POST') return criar(env, await lerCorpo(request), null);
    return erro('Método não permitido.', 405);
  }

  const id = Number(partes[0]);
  if (!Number.isInteger(id) || id <= 0 || partes.length !== 1) return erro('Rota não encontrada.', 404);
  if (request.method === 'GET') return obterCompra(env, id);
  if (request.method === 'PUT') return editar(env, id, await lerCorpo(request));
  if (request.method === 'DELETE') {
    const vinculada = await env.DB.prepare('SELECT id_processo FROM compras WHERE id = ?').bind(id)
      .first<{ id_processo: number | null }>();
    if (!vinculada) return erro('Compra não encontrada.', 404);
    if (vinculada.id_processo) {
      return erro('Esta compra foi criada ao concluir um processo e não pode ser excluída.', 409);
    }
    const resultado = await env.DB.prepare('DELETE FROM compras WHERE id = ?').bind(id).run();
    return resultado.meta.changes ? json({ ok: true }) : erro('Compra não encontrada.', 404);
  }
  return erro('Método não permitido.', 405);
}
