// =============================================================================
//  CHECKLISTS DE PROCESSOS (Fluxos Estruturados por Modalidade)
//  Gerenciamento de checklist, registro de conclusão (quem e quando) e etapas extras.
// =============================================================================

import { erro, json, lerCorpo, type Env } from './db';
import type { UsuarioSessao } from './auth';
import { obterTemplatePorModalidade } from '../src/lib/templatesChecklist';
import type { ProcessoChecklistItem } from '../src/lib/types';

/**
 * Garante que o processo tenha seu checklist inicializado com base na modalidade
 * (AMIL, Licitação, Adesão ARP, ARP, INEX ou Padrão) ao ser aberto pela primeira vez.
 */
export async function garantirChecklistInicial(
  env: Env,
  idProcesso: number,
  modalidade: string | null,
): Promise<void> {
  const contagem = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM processo_checklists WHERE id_processo = ?',
  )
    .bind(idProcesso)
    .first<{ total: number }>();

  if (!contagem || contagem.total === 0) {
    const template = obterTemplatePorModalidade(modalidade);

    const inserts = template.map((item) =>
      env.DB.prepare(
        `INSERT INTO processo_checklists (
          id_processo, chave_item, titulo, detalhes, fase, setor_responsavel, concluido, ordem, personalizado
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)`,
      ).bind(
        idProcesso,
        item.chave_item,
        item.titulo,
        item.detalhes,
        item.fase,
        item.setor_responsavel,
        item.ordem,
      ),
    );

    await env.DB.batch(inserts);
  }
}

export async function tratarProcessoChecklist(
  request: Request,
  env: Env,
  idProcesso: number,
  subpartes: string[],
  usuario: UsuarioSessao,
): Promise<Response> {
  const metodo = request.method;

  // Verifica se o processo existe
  const processo = await env.DB.prepare(
    'SELECT id, modalidade, objeto, sei FROM processos WHERE id = ?',
  )
    .bind(idProcesso)
    .first<{ id: number; modalidade: string | null; objeto: string; sei: string | null }>();

  if (!processo) return erro('Processo não encontrado.', 404);

  // ---------------------------------------------------------------------------
  // /api/processos/:id/checklist (GET e POST)
  // ---------------------------------------------------------------------------
  if (subpartes.length === 0) {
    if (metodo === 'GET') {
      await garantirChecklistInicial(env, idProcesso, processo.modalidade);

      const sql = `
        SELECT * FROM processo_checklists
        WHERE id_processo = ?
        ORDER BY ordem ASC, id ASC
      `;
      const { results } = await env.DB.prepare(sql).bind(idProcesso).all<ProcessoChecklistItem>();

      const total = results.length;
      const concluidos = results.filter((item) => item.concluido === 1).length;

      return json({
        itens: results,
        total,
        concluidos,
        modalidade: processo.modalidade ?? '',
      });
    }

    // POST /api/processos/:id/checklist — Adiciona etapa avulsa / personalizada
    if (metodo === 'POST') {
      const corpo = await lerCorpo(request);
      const titulo = String(corpo.titulo ?? '').trim();
      if (!titulo) return erro('O título da etapa é obrigatório.', 400);

      const detalhes = corpo.detalhes ? String(corpo.detalhes).trim() : null;
      const fase = String(corpo.fase ?? '2. Fase de Instrução Processual - CSA').trim();
      const setor = corpo.setor_responsavel ? String(corpo.setor_responsavel).trim() : 'CSA';

      const maxOrdem = await env.DB.prepare(
        'SELECT COALESCE(MAX(ordem), 0) AS proxima FROM processo_checklists WHERE id_processo = ?',
      )
        .bind(idProcesso)
        .first<{ proxima: number }>();

      const proximaOrdem = (maxOrdem?.proxima ?? 0) + 1;
      const chaveItem = `+${proximaOrdem}`;

      const novo = await env.DB.prepare(
        `INSERT INTO processo_checklists (
          id_processo, chave_item, titulo, detalhes, fase, setor_responsavel, concluido, ordem, personalizado
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)
        RETURNING *`,
      )
        .bind(idProcesso, chaveItem, titulo, detalhes, fase, setor, proximaOrdem)
        .first<ProcessoChecklistItem>();

      if (!novo) return erro('Não foi possível adicionar a etapa.', 500);
      return json(novo, 201);
    }

    return erro('Método não permitido.', 405);
  }

  // ---------------------------------------------------------------------------
  // /api/processos/:id/checklist/:itemId (PATCH e DELETE)
  // ---------------------------------------------------------------------------
  if (subpartes.length === 1) {
    const itemId = Number(subpartes[0]);
    if (!Number.isInteger(itemId) || itemId <= 0) return erro('Identificador inválido.', 400);

    if (metodo === 'PATCH') {
      const corpo = await lerCorpo(request);
      const campos: string[] = [];
      const valores: (string | number | null)[] = [];

      if ('concluido' in corpo) {
        const estaConcluido = corpo.concluido ? 1 : 0;
        campos.push('concluido = ?');
        valores.push(estaConcluido);

        if (estaConcluido) {
          campos.push('concluido_por_nome = ?', "concluido_em = datetime('now')");
          valores.push(usuario.nome);
        } else {
          campos.push('concluido_por_nome = NULL', 'concluido_em = NULL');
        }
      }

      if ('titulo' in corpo) {
        const titulo = String(corpo.titulo ?? '').trim();
        if (!titulo) return erro('O título não pode ser vazio.', 400);
        campos.push('titulo = ?');
        valores.push(titulo);
      }

      if ('detalhes' in corpo) {
        campos.push('detalhes = ?');
        valores.push(corpo.detalhes ? String(corpo.detalhes).trim() : null);
      }

      if (campos.length === 0) {
        return erro('Nenhum campo para alterar foi informado.', 400);
      }

      valores.push(itemId, idProcesso);
      const sql = `UPDATE processo_checklists SET ${campos.join(', ')} WHERE id = ? AND id_processo = ? RETURNING *`;
      const atualizado = await env.DB.prepare(sql).bind(...valores).first<ProcessoChecklistItem>();

      if (!atualizado) return erro('Etapa do checklist não encontrada.', 404);
      return json(atualizado);
    }

    if (metodo === 'DELETE') {
      const res = await env.DB.prepare(
        'DELETE FROM processo_checklists WHERE id = ? AND id_processo = ? AND personalizado = 1',
      )
        .bind(itemId, idProcesso)
        .run();

      if (res.meta.changes === 0) {
        return erro('Apenas etapas personalizadas podem ser excluídas.', 400);
      }

      return json({ ok: true });
    }

    return erro('Método não permitido.', 405);
  }

  return erro('Rota não encontrada.', 404);
}
