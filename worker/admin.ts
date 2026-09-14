// =============================================================================
//  GESTÃO DE USUÁRIOS — as rotas de /api/admin/usuarios.
//
//  Só o SUPER_ADMIN chega aqui: o roteador confere o papel antes de chamar
//  qualquer função deste arquivo.
//
//    GET    /api/admin/usuarios            fila de pendentes + lista de contas
//    PATCH  /api/admin/usuarios/:id        aprova, bloqueia, muda papel/setor
//    POST   /api/admin/usuarios/:id/senha  define uma senha nova
//    DELETE /api/admin/usuarios/:id        apaga o cadastro
//
//  TRÊS TRAVAS QUE EXISTEM PARA NINGUÉM SE TRANCAR DO LADO DE FORA:
//    1. o administrador não muda o próprio papel nem o próprio status;
//    2. o último SUPER_ADMIN ativo não pode ser rebaixado, bloqueado ou
//       apagado — senão o painel de usuários fica sem dono e a fila de
//       pendentes sem quem a atenda;
//    3. o administrador não apaga a própria conta.
// =============================================================================

import { erro, json, type Env } from './db';
import {
  PAPEIS,
  STATUS_USUARIO,
  gerarHashDeSenha,
  MINIMO_SENHA,
  REGRA_SENHA,
  type Papel,
  type StatusUsuario,
  type UsuarioSessao,
} from './auth';

/**
 * A ficha que a tela de gestão mostra. `tem_senha` separa quem realmente pediu
 * acesso de quem só figura como responsável de processo desde a implantação;
 * `processos_responsavel` evita apagar sem querer o nome que assina 30 fichas.
 */
const SELECT_FICHA = `
  SELECT u.id, u.nome, u.email, u.role, u.status, u.id_setor, u.criado_em,
         s.sigla AS setor_sigla,
         s.nome  AS setor_nome,
         (u.senha_hash <> '') AS tem_senha,
         (SELECT COUNT(*) FROM processos p
           WHERE p.id_responsavel = u.id OR p.id_responsavel_2 = u.id)
           AS processos_responsavel
  FROM usuarios u
  LEFT JOIN setores s ON s.id = u.id_setor`;

async function ficha(env: Env, id: number) {
  return await env.DB.prepare(`${SELECT_FICHA} WHERE u.id = ?`).bind(id).first();
}

/** Quantos SUPER_ADMIN ativos existem além deste. */
async function outrosAdministradores(env: Env, id: number): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM usuarios
      WHERE role = 'SUPER_ADMIN' AND status = 'ATIVO' AND id <> ?`,
  )
    .bind(id)
    .first<{ total: number }>();
  return r?.total ?? 0;
}

export async function tratarAdminUsuarios(
  request: Request,
  env: Env,
  partes: string[],
  quemPede: UsuarioSessao,
): Promise<Response> {
  // ---- GET /api/admin/usuarios ----------------------------------------------
  if (partes.length === 0) {
    if (request.method !== 'GET') return erro('Método não permitido.', 405);

    const [pendentes, cadastrados] = await env.DB.batch([
      env.DB.prepare(`${SELECT_FICHA} WHERE u.status = 'PENDENTE' ORDER BY u.criado_em, u.id`),
      // Contas de verdade primeiro (as que têm senha), e dentro disso os
      // bloqueados por último — a lista serve para trabalhar, não para arquivo.
      env.DB.prepare(
        `${SELECT_FICHA} WHERE u.status <> 'PENDENTE'
          ORDER BY CASE u.status WHEN 'ATIVO' THEN 0 ELSE 1 END,
                   (u.senha_hash = ''),
                   u.nome COLLATE NOCASE`,
      ),
    ]);

    return json({
      pendentes: pendentes.results,
      cadastrados: cadastrados.results,
      /** Para a tela avisar antes de o administrador se rebaixar sozinho. */
      eu: quemPede.id,
      outros_administradores: await outrosAdministradores(env, quemPede.id),
    });
  }

  const id = Number(partes[0]);
  if (!Number.isInteger(id) || id <= 0) return erro('Identificador inválido.', 400);

  const alvo = await env.DB.prepare(
    `SELECT id, nome, email, role, status, senha_hash FROM usuarios WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      nome: string;
      email: string;
      role: Papel;
      status: StatusUsuario;
      senha_hash: string;
    }>();
  if (!alvo) return erro('Usuário não encontrado.', 404);

  // ---- POST /api/admin/usuarios/:id/senha -----------------------------------
  if (partes.length === 2 && partes[1] === 'senha') {
    if (request.method !== 'POST') return erro('Método não permitido.', 405);

    const corpo = await lerJson(request);
    if (corpo instanceof Response) return corpo;

    const senha = String(corpo.senha ?? '');
    if (senha.length < MINIMO_SENHA) return erro(REGRA_SENHA, 422);
    if (senha.length > 200) return erro('A senha é longa demais.', 422);

    await env.DB.prepare(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`)
      .bind(await gerarHashDeSenha(senha), id)
      .run();

    return json({ ok: true, usuario: await ficha(env, id) });
  }

  if (partes.length !== 1) return erro('Rota não encontrada.', 404);

  // ---- PATCH /api/admin/usuarios/:id ----------------------------------------
  if (request.method === 'PATCH') {
    const corpo = await lerJson(request);
    if (corpo instanceof Response) return corpo;

    const mudancas: Record<string, string | number | null> = {};

    if ('nome' in corpo) {
      const nome = String(corpo.nome ?? '').trim();
      if (nome.length < 3) return erro('Escreva o nome completo.', 422);
      if (nome.length > 120) return erro('O nome é longo demais.', 422);
      mudancas.nome = nome;
    }

    if ('role' in corpo) {
      const papel = String(corpo.role ?? '');
      if (!PAPEIS.includes(papel as Papel)) {
        return erro(`O perfil de acesso só aceita: ${PAPEIS.join(', ')}.`, 422);
      }
      if (id === quemPede.id && papel !== quemPede.role) {
        return erro('Você não pode mudar o seu próprio perfil de acesso.', 409);
      }
      if (
        alvo.role === 'SUPER_ADMIN' &&
        papel !== 'SUPER_ADMIN' &&
        (await outrosAdministradores(env, id)) === 0
      ) {
        return erro(
          'Este é o último administrador do sistema. Promova outra pessoa a ' +
            'Administrador Geral antes de mudar este perfil.',
          409,
        );
      }
      mudancas.role = papel;
    }

    if ('status' in corpo) {
      const situacao = String(corpo.status ?? '');
      if (!STATUS_USUARIO.includes(situacao as StatusUsuario)) {
        return erro(`A situação só aceita: ${STATUS_USUARIO.join(', ')}.`, 422);
      }
      if (id === quemPede.id && situacao !== 'ATIVO') {
        return erro('Você não pode bloquear a sua própria conta.', 409);
      }
      if (
        alvo.role === 'SUPER_ADMIN' &&
        situacao !== 'ATIVO' &&
        (await outrosAdministradores(env, id)) === 0
      ) {
        return erro('Este é o último administrador ativo — ele não pode ser bloqueado.', 409);
      }
      // Liberar quem nunca definiu senha não adianta nada: a pessoa não tem
      // como entrar. Melhor dizer isso agora do que ela descobrir na porta.
      if (situacao === 'ATIVO' && !alvo.senha_hash) {
        return erro(
          'Esta pessoa ainda não definiu uma senha. Peça que ela se cadastre em ' +
            '"Criar conta", ou defina uma senha por aqui antes de liberar.',
          409,
        );
      }
      mudancas.status = situacao;
    }

    if ('id_setor' in corpo) {
      const bruto = corpo.id_setor;
      const idSetor = bruto === '' || bruto == null ? null : Number(bruto);
      if (idSetor !== null) {
        if (!Number.isInteger(idSetor)) return erro('Escolha um setor da lista.', 422);
        const setor = await env.DB.prepare(`SELECT id FROM setores WHERE id = ?`)
          .bind(idSetor)
          .first();
        if (!setor) return erro('Escolha um setor da lista.', 422);
      }
      mudancas.id_setor = idSetor;
    }

    const colunas = Object.keys(mudancas);
    if (colunas.length === 0) return erro('Nenhum campo foi enviado para alteração.', 422);

    // Os nomes de coluna vêm da lista fechada acima, nunca do corpo da
    // requisição — é a mesma regra do resto da API.
    await env.DB.prepare(
      `UPDATE usuarios SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    )
      .bind(...colunas.map((c) => mudancas[c]), id)
      .run();

    return json({ ok: true, usuario: await ficha(env, id) });
  }

  // ---- DELETE /api/admin/usuarios/:id ---------------------------------------
  if (request.method === 'DELETE') {
    if (id === quemPede.id) return erro('Você não pode apagar a sua própria conta.', 409);
    if (alvo.role === 'SUPER_ADMIN' && (await outrosAdministradores(env, id)) === 0) {
      return erro('Este é o último administrador do sistema e não pode ser apagado.', 409);
    }

    // Os processos em que a pessoa figura como responsável não somem junto: a
    // chave estrangeira é ON DELETE SET NULL, então o processo continua lá,
    // sem responsável, esperando alguém no lugar.
    await env.DB.prepare(`DELETE FROM usuarios WHERE id = ?`).bind(id).run();
    return json({ ok: true, id });
  }

  return erro('Método não permitido.', 405);
}

async function lerJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const corpo = await request.json();
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error('formato');
    return corpo as Record<string, unknown>;
  } catch {
    return erro('Não foi possível ler os dados enviados.', 400);
  }
}
