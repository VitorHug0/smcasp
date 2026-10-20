// =============================================================================
//  MÓDULO DE TAREFAS (Estilo Google Tasks) — API no Cloudflare Worker
//  Cada usuário gerencia de forma 100% isolada suas listas e tarefas.
// =============================================================================

import { erro, json, lerCorpo, type Env } from './db';
import type { UsuarioSessao } from './auth';

export interface ListaTarefasRegistro {
  id: number;
  id_usuario: number;
  titulo: string;
  ordem: number;
  padrao: number;
  criado_em: string;
  total_pendentes?: number;
  total_concluidas?: number;
}

export interface TarefaRegistro {
  id: number;
  id_usuario: number;
  id_lista: number;
  titulo: string;
  detalhes: string | null;
  data_vencimento: string | null;
  com_estrela: number;
  concluida: number;
  concluida_em: string | null;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  lista_titulo?: string;
}

/**
 * Garante que o usuário possua ao menos as três listas padrão do Google Tasks
 * ("Minhas tarefas", "Agendada", "Pessoal") ao abrir a tela pela primeira vez.
 */
async function garantirListasIniciais(env: Env, idUsuario: number): Promise<void> {
  const contagem = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM listas_tarefas WHERE id_usuario = ?',
  )
    .bind(idUsuario)
    .first<{ total: number }>();

  if (!contagem || contagem.total === 0) {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO listas_tarefas (id_usuario, titulo, ordem, padrao) VALUES (?, ?, 1, 1)',
      ).bind(idUsuario, 'Minhas tarefas'),
      env.DB.prepare(
        'INSERT INTO listas_tarefas (id_usuario, titulo, ordem, padrao) VALUES (?, ?, 2, 0)',
      ).bind(idUsuario, 'Agendada'),
      env.DB.prepare(
        'INSERT INTO listas_tarefas (id_usuario, titulo, ordem, padrao) VALUES (?, ?, 3, 0)',
      ).bind(idUsuario, 'Pessoal'),
    ]);
  }
}

export async function tratarTarefas(
  request: Request,
  env: Env,
  partes: string[],
  usuario: UsuarioSessao,
): Promise<Response> {
  const metodo = request.method;
  const url = new URL(request.url);

  // ---------------------------------------------------------------------------
  // /api/tarefas/listas...
  // ---------------------------------------------------------------------------
  if (partes[0] === 'listas') {
    // GET /api/tarefas/listas — lista todas as listas do usuário com contadores
    if (partes.length === 1 && metodo === 'GET') {
      await garantirListasIniciais(env, usuario.id);

      const sql = `
        SELECT
          l.id,
          l.id_usuario,
          l.titulo,
          l.ordem,
          l.padrao,
          l.criado_em,
          COUNT(CASE WHEN t.concluida = 0 THEN 1 END) AS total_pendentes,
          COUNT(CASE WHEN t.concluida = 1 THEN 1 END) AS total_concluidas
        FROM listas_tarefas l
        LEFT JOIN tarefas t ON t.id_lista = l.id AND t.id_usuario = l.id_usuario
        WHERE l.id_usuario = ?
        GROUP BY l.id
        ORDER BY l.ordem ASC, l.id ASC
      `;
      const { results } = await env.DB.prepare(sql).bind(usuario.id).all<ListaTarefasRegistro>();
      return json(results);
    }

    // POST /api/tarefas/listas — cria uma nova lista
    if (partes.length === 1 && metodo === 'POST') {
      const corpo = await lerCorpo(request);
      const titulo = String(corpo.titulo ?? '').trim();
      if (!titulo) return erro('O título da lista é obrigatório.', 400);
      if (titulo.length > 80) return erro('O título não pode ter mais de 80 caracteres.', 400);

      const maxOrdem = await env.DB.prepare(
        'SELECT COALESCE(MAX(ordem), 0) AS proxima FROM listas_tarefas WHERE id_usuario = ?',
      )
        .bind(usuario.id)
        .first<{ proxima: number }>();

      const ordem = (maxOrdem?.proxima ?? 0) + 1;

      const novaLista = await env.DB.prepare(
        `INSERT INTO listas_tarefas (id_usuario, titulo, ordem, padrao)
         VALUES (?, ?, ?, 0)
         RETURNING *`,
      )
        .bind(usuario.id, titulo, ordem)
        .first<ListaTarefasRegistro>();

      if (!novaLista) return erro('Não foi possível criar a lista.', 500);

      return json({ ...novaLista, total_pendentes: 0, total_concluidas: 0 }, 201);
    }

    // PATCH /api/tarefas/listas/:id — renomeia ou reordena uma lista
    if (partes.length === 2 && metodo === 'PATCH') {
      const idLista = Number(partes[1]);
      if (!Number.isInteger(idLista) || idLista <= 0) return erro('Identificador inválido.', 400);

      const corpo = await lerCorpo(request);
      const camposParaAtualizar: string[] = [];
      const valores: (string | number)[] = [];

      if ('titulo' in corpo) {
        const titulo = String(corpo.titulo ?? '').trim();
        if (!titulo) return erro('O título da lista não pode ser vazio.', 400);
        if (titulo.length > 80) return erro('O título não pode ter mais de 80 caracteres.', 400);
        camposParaAtualizar.push('titulo = ?');
        valores.push(titulo);
      }

      if ('ordem' in corpo && Number.isInteger(Number(corpo.ordem))) {
        camposParaAtualizar.push('ordem = ?');
        valores.push(Number(corpo.ordem));
      }

      if (camposParaAtualizar.length === 0) {
        return erro('Nenhum campo para alterar foi enviado.', 400);
      }

      valores.push(idLista, usuario.id);
      const sql = `UPDATE listas_tarefas SET ${camposParaAtualizar.join(', ')} WHERE id = ? AND id_usuario = ? RETURNING *`;
      const atualizada = await env.DB.prepare(sql).bind(...valores).first<ListaTarefasRegistro>();

      if (!atualizada) return erro('Lista não encontrada.', 404);
      return json(atualizada);
    }

    // DELETE /api/tarefas/listas/:id — remove a lista e suas tarefas
    if (partes.length === 2 && metodo === 'DELETE') {
      const idLista = Number(partes[1]);
      if (!Number.isInteger(idLista) || idLista <= 0) return erro('Identificador inválido.', 400);

      const totalListas = await env.DB.prepare(
        'SELECT COUNT(*) as total FROM listas_tarefas WHERE id_usuario = ?',
      )
        .bind(usuario.id)
        .first<{ total: number }>();

      if ((totalListas?.total ?? 0) <= 1) {
        return erro('Você não pode excluir sua única lista de tarefas.', 400);
      }

      // Deleta tarefas e a lista em um lote (batch) seguro
      await env.DB.batch([
        env.DB.prepare('DELETE FROM tarefas WHERE id_lista = ? AND id_usuario = ?').bind(
          idLista,
          usuario.id,
        ),
        env.DB.prepare('DELETE FROM listas_tarefas WHERE id = ? AND id_usuario = ?').bind(
          idLista,
          usuario.id,
        ),
      ]);

      return json({ ok: true });
    }

    return erro('Rota não encontrada.', 404);
  }

  // ---------------------------------------------------------------------------
  // /api/tarefas/limpar-concluidas (POST)
  // ---------------------------------------------------------------------------
  if (partes[0] === 'limpar-concluidas' && metodo === 'POST') {
    const corpo = (await lerCorpo(request).catch(() => ({}))) as Record<string, unknown>;
    const idLista = corpo.id_lista ? Number(corpo.id_lista) : null;

    if (idLista) {
      await env.DB.prepare(
        'DELETE FROM tarefas WHERE id_usuario = ? AND id_lista = ? AND concluida = 1',
      )
        .bind(usuario.id, idLista)
        .run();
    } else {
      await env.DB.prepare('DELETE FROM tarefas WHERE id_usuario = ? AND concluida = 1')
        .bind(usuario.id)
        .run();
    }

    return json({ ok: true });
  }

  // ---------------------------------------------------------------------------
  // /api/tarefas (GET e POST)
  // ---------------------------------------------------------------------------
  if (partes.length === 0) {
    if (metodo === 'GET') {
      await garantirListasIniciais(env, usuario.id);

      const idLista = url.searchParams.get('id_lista');
      const comEstrela = url.searchParams.get('com_estrela');
      const concluida = url.searchParams.get('concluida');
      const busca = url.searchParams.get('busca')?.trim().toLowerCase();

      let sql = `
        SELECT
          t.*,
          l.titulo AS lista_titulo
        FROM tarefas t
        JOIN listas_tarefas l ON l.id = t.id_lista
        WHERE t.id_usuario = ?
      `;
      const params: (string | number)[] = [usuario.id];

      if (idLista) {
        sql += ' AND t.id_lista = ?';
        params.push(Number(idLista));
      }

      if (comEstrela === '1' || comEstrela === 'true') {
        sql += ' AND t.com_estrela = 1';
      }

      if (concluida === '0' || concluida === 'false') {
        sql += ' AND t.concluida = 0';
      } else if (concluida === '1' || concluida === 'true') {
        sql += ' AND t.concluida = 1';
      }

      if (busca) {
        sql += ' AND (lower(t.titulo) LIKE ? OR lower(COALESCE(t.detalhes, "")) LIKE ?)';
        const buscaSql = `%${busca}%`;
        params.push(buscaSql, buscaSql);
      }

      // Pendentes primeiro por ordem, depois as mais recentes; Concluídas ao final
      sql += ' ORDER BY t.concluida ASC, t.ordem ASC, t.id DESC';

      const { results } = await env.DB.prepare(sql).bind(...params).all<TarefaRegistro>();
      return json(results);
    }

    if (metodo === 'POST') {
      const corpo = await lerCorpo(request);
      const titulo = String(corpo.titulo ?? '').trim();
      if (!titulo) return erro('O título da tarefa é obrigatório.', 400);
      if (titulo.length > 500) return erro('O título não pode ter mais de 500 caracteres.', 400);

      const idListaBruto = Number(corpo.id_lista);
      let idLista = idListaBruto;

      // Se não passou lista, pega a lista padrão do usuário
      if (!Number.isInteger(idLista) || idLista <= 0) {
        await garantirListasIniciais(env, usuario.id);
        const padrao = await env.DB.prepare(
          'SELECT id FROM listas_tarefas WHERE id_usuario = ? ORDER BY padrao DESC, ordem ASC LIMIT 1',
        )
          .bind(usuario.id)
          .first<{ id: number }>();
        if (!padrao) return erro('Nenhuma lista de tarefas encontrada.', 404);
        idLista = padrao.id;
      } else {
        // Valida se a lista pertence ao usuário
        const existe = await env.DB.prepare(
          'SELECT id FROM listas_tarefas WHERE id = ? AND id_usuario = ?',
        )
          .bind(idLista, usuario.id)
          .first<{ id: number }>();
        if (!existe) return erro('A lista informada não pertence a este usuário.', 403);
      }

      const detalhes = corpo.detalhes ? String(corpo.detalhes).trim() : null;
      const dataVencimento = corpo.data_vencimento ? String(corpo.data_vencimento).trim() : null;
      const comEstrela = corpo.com_estrela ? 1 : 0;

      const maxOrdem = await env.DB.prepare(
        'SELECT COALESCE(MAX(ordem), 0) AS proxima FROM tarefas WHERE id_usuario = ? AND id_lista = ?',
      )
        .bind(usuario.id, idLista)
        .first<{ proxima: number }>();

      const ordem = (maxOrdem?.proxima ?? 0) + 1;

      const novaTarefa = await env.DB.prepare(
        `INSERT INTO tarefas (
          id_usuario, id_lista, titulo, detalhes, data_vencimento, com_estrela, concluida, ordem
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        RETURNING *`,
      )
        .bind(usuario.id, idLista, titulo, detalhes, dataVencimento, comEstrela, ordem)
        .first<TarefaRegistro>();

      if (!novaTarefa) return erro('Não foi possível criar a tarefa.', 500);

      // Busca com o nome da lista
      const listaInfo = await env.DB.prepare(
        'SELECT titulo FROM listas_tarefas WHERE id = ?',
      ).bind(idLista).first<{ titulo: string }>();

      return json({ ...novaTarefa, lista_titulo: listaInfo?.titulo }, 201);
    }

    return erro('Método não permitido.', 405);
  }

  // ---------------------------------------------------------------------------
  // /api/tarefas/:id (PATCH, DELETE)
  // ---------------------------------------------------------------------------
  if (partes.length === 1) {
    const idTarefa = Number(partes[0]);
    if (!Number.isInteger(idTarefa) || idTarefa <= 0) return erro('Identificador inválido.', 400);

    if (metodo === 'PATCH') {
      const corpo = await lerCorpo(request);
      const campos: string[] = [];
      const valores: (string | number | null)[] = [];

      if ('titulo' in corpo) {
        const titulo = String(corpo.titulo ?? '').trim();
        if (!titulo) return erro('O título da tarefa não pode ser vazio.', 400);
        if (titulo.length > 500) return erro('O título é muito longo.', 400);
        campos.push('titulo = ?');
        valores.push(titulo);
      }

      if ('detalhes' in corpo) {
        const detalhes = corpo.detalhes === null ? null : String(corpo.detalhes).trim();
        campos.push('detalhes = ?');
        valores.push(detalhes);
      }

      if ('data_vencimento' in corpo) {
        const dataVenc = corpo.data_vencimento ? String(corpo.data_vencimento).trim() : null;
        campos.push('data_vencimento = ?');
        valores.push(dataVenc);
      }

      if ('com_estrela' in corpo) {
        campos.push('com_estrela = ?');
        valores.push(corpo.com_estrela ? 1 : 0);
      }

      if ('concluida' in corpo) {
        const estaConcluida = corpo.concluida ? 1 : 0;
        campos.push('concluida = ?');
        valores.push(estaConcluida);

        if (estaConcluida) {
          campos.push("concluida_em = datetime('now')");
        } else {
          campos.push('concluida_em = NULL');
        }
      }

      if ('id_lista' in corpo) {
        const novoIdLista = Number(corpo.id_lista);
        const listaValida = await env.DB.prepare(
          'SELECT id FROM listas_tarefas WHERE id = ? AND id_usuario = ?',
        )
          .bind(novoIdLista, usuario.id)
          .first();
        if (!listaValida) return erro('Lista de destino inválida.', 400);
        campos.push('id_lista = ?');
        valores.push(novoIdLista);
      }

      if ('ordem' in corpo && Number.isInteger(Number(corpo.ordem))) {
        campos.push('ordem = ?');
        valores.push(Number(corpo.ordem));
      }

      if (campos.length === 0) {
        return erro('Nenhum campo para alterar foi enviado.', 400);
      }

      campos.push("atualizado_em = datetime('now')");

      valores.push(idTarefa, usuario.id);
      const sql = `UPDATE tarefas SET ${campos.join(', ')} WHERE id = ? AND id_usuario = ? RETURNING *`;
      const tarefaAtualizada = await env.DB.prepare(sql).bind(...valores).first<TarefaRegistro>();

      if (!tarefaAtualizada) return erro('Tarefa não encontrada.', 404);

      // Retorna com título da lista
      const listaInfo = await env.DB.prepare(
        'SELECT titulo FROM listas_tarefas WHERE id = ?',
      ).bind(tarefaAtualizada.id_lista).first<{ titulo: string }>();

      return json({ ...tarefaAtualizada, lista_titulo: listaInfo?.titulo });
    }

    if (metodo === 'DELETE') {
      const res = await env.DB.prepare('DELETE FROM tarefas WHERE id = ? AND id_usuario = ?')
        .bind(idTarefa, usuario.id)
        .run();

      if (res.meta.changes === 0) return erro('Tarefa não encontrada.', 404);
      return json({ ok: true });
    }

    return erro('Método não permitido.', 405);
  }

  return erro('Rota não encontrada.', 404);
}
