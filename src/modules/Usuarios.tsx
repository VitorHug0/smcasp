// =============================================================================
//  GESTÃO DE USUÁRIOS  ·  /admin/usuarios
//
//  Tela exclusiva do Administrador Geral. Duas listas, e a de cima é a que
//  importa: quem pediu acesso e ainda está esperando. Ela vem primeiro, com
//  contagem no título, porque uma fila que não se vê é uma fila que não anda.
//
//  Liberar alguém é uma decisão em três partes — a pessoa entra, com qual
//  perfil e por qual setor. Por isso "Aprovar" abre uma janela em vez de
//  liberar direto: um clique só resolveria a primeira parte e deixaria as duas
//  outras no padrão, que quase nunca é o certo.
//
//  A tela toda é uma conveniência: quem decide de fato o que cada perfil pode
//  fazer é a API (worker/router.ts).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  KeyRound,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { Botao } from '../components/ui/Botao';
import { CampoLista, CampoSenha } from '../components/ui/Campo';
import { Carregando, Falha, Vazio, AvisoErro } from '../components/ui/Estados';
import { Etiqueta, type Tom } from '../components/ui/Etiqueta';
import { Modal } from '../components/ui/Modal';
import { dataBR } from '../lib/formato';
import {
  EXPLICACAO_DO_PAPEL,
  NOME_DA_SITUACAO,
  NOME_DO_PAPEL,
  PAPEIS,
  type ListaDeUsuarios,
  type Papel,
  type Setor,
  type SituacaoUsuario,
  type UsuarioAdmin,
} from '../lib/types';

const TOM_DA_SITUACAO: Record<SituacaoUsuario, Tom> = {
  ATIVO: 'verde',
  PENDENTE: 'ambar',
  BLOQUEADO: 'vermelho',
};

const TOM_DO_PAPEL: Record<Papel, Tom> = {
  SUPER_ADMIN: 'azul',
  OPERADOR: 'cinza',
  LEITOR: 'cinza',
};

export function Usuarios({ setores }: { setores: Setor[] }) {
  const [dados, setDados] = useState<ListaDeUsuarios | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  /** Quem está no modal e para quê. */
  const [aprovando, setAprovando] = useState<UsuarioAdmin | null>(null);
  const [trocandoSenha, setTrocandoSenha] = useState<UsuarioAdmin | null>(null);
  const [confirmando, setConfirmando] = useState<{
    usuario: UsuarioAdmin;
    acao: 'recusar' | 'bloquear' | 'excluir';
  } | null>(null);

  const recarregar = useCallback(() => {
    setCarregando(true);
    api.admin.usuarios
      .listar()
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) =>
        setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar os usuários.'),
      )
      .finally(() => setCarregando(false));
  }, []);

  useEffect(recarregar, [recarregar]);

  /** Todas as alterações passam por aqui: uma mensagem de erro, um recarregar. */
  const executar = useCallback(
    async (acao: () => Promise<unknown>, textoDeSucesso: string) => {
      setAviso(null);
      try {
        await acao();
        recarregar();
        setAviso(textoDeSucesso);
      } catch (e) {
        setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir a alteração.');
      }
    },
    [recarregar],
  );

  const cadastrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = dados?.cadastrados ?? [];
    if (!termo) return lista;
    return lista.filter((u) =>
      `${u.nome} ${u.email} ${u.setor_sigla ?? ''}`.toLowerCase().includes(termo),
    );
  }, [dados, busca]);

  if (carregando && !dados) return <Carregando texto="Carregando os usuários…" />;
  if (erro && !dados) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;
  if (!dados) return null;

  const opcoesDeSetor = setores.map((s) => ({ valor: s.id, texto: s.nome, grupo: s.grupo }));

  return (
    <div className="space-y-6">
      {erro && <AvisoErro mensagem={erro} />}
      {aviso && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-800">
          <Check className="size-4 shrink-0" />
          {aviso}
        </p>
      )}

      {/* ---- FILA DE APROVAÇÕES ------------------------------------------- */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
          <UserCheck className="size-5 text-amber-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">Aprovações pendentes</h2>
            <p className="text-sm text-slate-500">
              Quem pediu acesso e está esperando liberação.
            </p>
          </div>
          {dados.pendentes.length > 0 && (
            <Etiqueta tom="ambar">
              {dados.pendentes.length} {dados.pendentes.length === 1 ? 'pedido' : 'pedidos'}
            </Etiqueta>
          )}
        </header>

        {dados.pendentes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Nenhum pedido de acesso na fila.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {dados.pendentes.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <Avatar nome={u.nome} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{u.nome}</p>
                  <p className="truncate text-sm text-slate-500">{u.email}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Pediu o setor <strong>{u.setor_nome ?? 'não informado'}</strong> em{' '}
                    {dataBR(u.criado_em?.slice(0, 10))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Botao
                    aparencia="primario"
                    icone={<Check className="size-4" />}
                    onClick={() => setAprovando(u)}
                  >
                    Aprovar
                  </Botao>
                  <Botao
                    aparencia="perigo"
                    icone={<Ban className="size-4" />}
                    onClick={() => setConfirmando({ usuario: u, acao: 'recusar' })}
                  >
                    Recusar
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- CONTAS JÁ CADASTRADAS ---------------------------------------- */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-4">
          <Users className="size-5 text-marca-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">Usuários cadastrados</h2>
            <p className="text-sm text-slate-500">
              Perfil, setor e situação de cada conta. Toda alteração vale na hora.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por nome ou e-mail"
              aria-label="Procurar usuários"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
          </div>
        </header>

        {cadastrados.length === 0 ? (
          <Vazio
            titulo="Nenhum usuário encontrado"
            texto="Ajuste a busca para ver as contas cadastradas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Pessoa</th>
                  <th className="px-3 py-3">Setor</th>
                  <th className="px-3 py-3">Perfil de acesso</th>
                  <th className="px-3 py-3">Situação</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cadastrados.map((u) => {
                  const souEu = u.id === dados.eu;
                  return (
                    <tr key={u.id} className="align-middle hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar nome={u.nome} tamanho="pequeno" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {u.nome}
                              {souEu && (
                                <span className="ml-1.5 text-xs font-medium text-slate-400">
                                  (você)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                            {/* Cadastro antigo que nunca definiu senha: aparece
                                nas listas de responsável, mas não entra. */}
                            {!u.tem_senha && (
                              <p className="mt-0.5 text-xs text-slate-400">
                                Sem senha — só figura como responsável de processo
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <select
                          value={u.id_setor ?? ''}
                          aria-label={`Setor de ${u.nome}`}
                          onChange={(e) =>
                            executar(
                              () =>
                                api.admin.usuarios.ajustar(u.id, {
                                  id_setor: e.target.value ? Number(e.target.value) : null,
                                }),
                              `Setor de ${u.nome} atualizado.`,
                            )
                          }
                          className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-marca-500 focus:outline-none"
                        >
                          <option value="">Sem setor</option>
                          {setores.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-3 py-3">
                        {/* O administrador não muda o próprio perfil: se o
                            fizesse por engano, perderia esta tela e ninguém
                            poderia devolvê-la a ele. */}
                        {souEu ? (
                          <Etiqueta tom={TOM_DO_PAPEL[u.role]} icone={<ShieldCheck className="size-3.5" />}>
                            {NOME_DO_PAPEL[u.role]}
                          </Etiqueta>
                        ) : (
                          <select
                            value={u.role}
                            aria-label={`Perfil de ${u.nome}`}
                            onChange={(e) =>
                              executar(
                                () =>
                                  api.admin.usuarios.ajustar(u.id, {
                                    role: e.target.value as Papel,
                                  }),
                                `${u.nome} agora é ${NOME_DO_PAPEL[e.target.value as Papel]}.`,
                              )
                            }
                            className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-marca-500 focus:outline-none"
                          >
                            {PAPEIS.map((p) => (
                              <option key={p} value={p}>
                                {NOME_DO_PAPEL[p]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <Etiqueta tom={TOM_DA_SITUACAO[u.status]}>
                          {NOME_DA_SITUACAO[u.status]}
                        </Etiqueta>
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTrocandoSenha(u)}
                            title="Definir uma senha nova"
                            aria-label={`Definir senha de ${u.nome}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            <KeyRound className="size-4" />
                          </button>

                          {u.status === 'ATIVO' ? (
                            <button
                              type="button"
                              disabled={souEu}
                              onClick={() => setConfirmando({ usuario: u, acao: 'bloquear' })}
                              title={souEu ? 'Você não pode bloquear a sua conta' : 'Bloquear o acesso'}
                              aria-label={`Bloquear ${u.nome}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Ban className="size-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                u.tem_senha
                                  ? executar(
                                      () =>
                                        api.admin.usuarios.ajustar(u.id, { status: 'ATIVO' }),
                                      `${u.nome} voltou a ter acesso.`,
                                    )
                                  : setTrocandoSenha(u)
                              }
                              title="Reativar o acesso"
                              aria-label={`Reativar ${u.nome}`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <RotateCcw className="size-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={souEu}
                            onClick={() => setConfirmando({ usuario: u, acao: 'excluir' })}
                            title={souEu ? 'Você não pode apagar a sua conta' : 'Apagar o cadastro'}
                            aria-label={`Apagar ${u.nome}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalDeLiberacao
        usuario={aprovando}
        opcoesDeSetor={opcoesDeSetor}
        aoFechar={() => setAprovando(null)}
        aoLiberar={(papel, idSetor) => {
          const alvo = aprovando!;
          setAprovando(null);
          executar(
            () =>
              api.admin.usuarios.ajustar(alvo.id, {
                status: 'ATIVO',
                role: papel,
                id_setor: idSetor,
              }),
            `${alvo.nome} foi liberado como ${NOME_DO_PAPEL[papel]}.`,
          );
        }}
      />

      <ModalDeSenha
        usuario={trocandoSenha}
        aoFechar={() => setTrocandoSenha(null)}
        aoDefinir={(senha) => {
          const alvo = trocandoSenha!;
          setTrocandoSenha(null);
          executar(
            () => api.admin.usuarios.definirSenha(alvo.id, senha),
            `Senha de ${alvo.nome} definida. Avise a pessoa por um canal seguro.`,
          );
        }}
      />

      <ModalDeConfirmacao
        pedido={confirmando}
        aoFechar={() => setConfirmando(null)}
        aoConfirmar={() => {
          const { usuario, acao } = confirmando!;
          setConfirmando(null);
          if (acao === 'excluir') {
            executar(
              () => api.admin.usuarios.excluir(usuario.id),
              `Cadastro de ${usuario.nome} apagado.`,
            );
          } else {
            executar(
              () => api.admin.usuarios.ajustar(usuario.id, { status: 'BLOQUEADO' }),
              acao === 'recusar'
                ? `Pedido de ${usuario.nome} recusado.`
                : `${usuario.nome} foi bloqueado.`,
            );
          }
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Janela de liberação
// -----------------------------------------------------------------------------

/**
 * O perfil vem como cartões, e não como lista de seleção, porque a diferença
 * entre Operador e Leitor precisa estar escrita na hora de escolher — é a
 * decisão que dá trabalho desfazer depois.
 */
function ModalDeLiberacao({
  usuario,
  opcoesDeSetor,
  aoFechar,
  aoLiberar,
}: {
  usuario: UsuarioAdmin | null;
  opcoesDeSetor: Array<{ valor: number; texto: string; grupo?: string }>;
  aoFechar: () => void;
  aoLiberar: (papel: Papel, idSetor: number | null) => void;
}) {
  const [papel, setPapel] = useState<Papel>('LEITOR');
  const [idSetor, setIdSetor] = useState('');

  // Reabre sempre com o setor que a pessoa pediu no cadastro e com o perfil
  // mais restrito — liberar demais por distração é o erro mais caro aqui.
  useEffect(() => {
    if (usuario) {
      setPapel('LEITOR');
      setIdSetor(usuario.id_setor ? String(usuario.id_setor) : '');
    }
  }, [usuario]);

  if (!usuario) return null;

  return (
    <Modal
      aberto
      titulo={`Liberar o acesso de ${usuario.nome}`}
      descricao={usuario.email}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao aparencia="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            icone={<Check className="size-4" />}
            onClick={() => aoLiberar(papel, idSetor ? Number(idSetor) : null)}
          >
            Liberar acesso
          </Botao>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">
            Perfil de acesso <span className="text-red-600">*</span>
          </legend>
          <div className="space-y-2">
            {PAPEIS.map((p) => (
              <label
                key={p}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors
                  ${
                    papel === p
                      ? 'border-marca-500 bg-marca-50 ring-2 ring-marca-100'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
              >
                <input
                  type="radio"
                  name="papel"
                  value={p}
                  checked={papel === p}
                  onChange={() => setPapel(p)}
                  className="mt-0.5 size-4 cursor-pointer text-marca-600 focus:ring-2 focus:ring-marca-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">
                    {NOME_DO_PAPEL[p]}
                  </span>
                  <span className="block text-xs leading-relaxed text-slate-600">
                    {EXPLICACAO_DO_PAPEL[p]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <CampoLista
          rotulo="Setor"
          valor={idSetor}
          aoMudar={setIdSetor}
          opcoes={opcoesDeSetor}
          vazio="Sem setor"
          ajuda={
            usuario.setor_nome
              ? `No cadastro, a pessoa informou: ${usuario.setor_nome}.`
              : 'A pessoa não informou setor no cadastro.'
          }
        />
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Janela de senha
// -----------------------------------------------------------------------------

function ModalDeSenha({
  usuario,
  aoFechar,
  aoDefinir,
}: {
  usuario: UsuarioAdmin | null;
  aoFechar: () => void;
  aoDefinir: (senha: string) => void;
}) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setSenha('');
    setErro(null);
  }, [usuario]);

  if (!usuario) return null;

  return (
    <Modal
      aberto
      titulo={`Definir senha de ${usuario.nome}`}
      descricao={usuario.email}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao aparencia="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            icone={<KeyRound className="size-4" />}
            onClick={() => {
              if (senha.length < 8) {
                setErro('A senha precisa ter ao menos 8 caracteres.');
                return;
              }
              aoDefinir(senha);
            }}
          >
            Salvar senha
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <AvisoErro mensagem={erro} />}
        <CampoSenha
          rotulo="Senha nova"
          obrigatorio
          valor={senha}
          aoMudar={setSenha}
          autoComplete="new-password"
          ajuda="Ao menos 8 caracteres. A senha antiga deixa de valer na hora."
        />
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          Combine a senha com a pessoa por telefone ou pessoalmente, e peça que ela troque
          depois de entrar. Senha enviada por e-mail fica no e-mail para sempre.
        </p>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Confirmações
// -----------------------------------------------------------------------------

function ModalDeConfirmacao({
  pedido,
  aoFechar,
  aoConfirmar,
}: {
  pedido: { usuario: UsuarioAdmin; acao: 'recusar' | 'bloquear' | 'excluir' } | null;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  if (!pedido) return null;
  const { usuario, acao } = pedido;

  const textos = {
    recusar: {
      titulo: `Recusar o pedido de ${usuario.nome}?`,
      corpo:
        'A conta fica bloqueada e a pessoa vê "acesso suspenso" ao tentar entrar. ' +
        'O cadastro continua na lista, e você pode liberar depois se mudar de ideia.',
      botao: 'Recusar pedido',
    },
    bloquear: {
      titulo: `Bloquear ${usuario.nome}?`,
      corpo:
        'O acesso é cortado na hora, mesmo que a pessoa esteja com o painel aberto ' +
        'ou tenha marcado "manter conectado". Para devolver o acesso basta reativar.',
      botao: 'Bloquear acesso',
    },
    excluir: {
      titulo: `Apagar o cadastro de ${usuario.nome}?`,
      corpo:
        usuario.processos_responsavel > 0
          ? `Esta pessoa é responsável por ${usuario.processos_responsavel} ` +
            `${usuario.processos_responsavel === 1 ? 'processo' : 'processos'}. ` +
            'Os processos continuam no sistema, mas ficam sem responsável até que ' +
            'alguém seja colocado no lugar. Isso não tem como ser desfeito.'
          : 'O cadastro some da lista e a pessoa precisaria se cadastrar de novo. ' +
            'Isso não tem como ser desfeito.',
      botao: 'Apagar cadastro',
    },
  }[acao];

  return (
    <Modal
      aberto
      titulo={textos.titulo}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao aparencia="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            aparencia="perigo"
            icone={acao === 'excluir' ? <Trash2 className="size-4" /> : <Ban className="size-4" />}
            onClick={aoConfirmar}
          >
            {textos.botao}
          </Botao>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-600">{textos.corpo}</p>
    </Modal>
  );
}
