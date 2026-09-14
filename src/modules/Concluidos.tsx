// =============================================================================
//  MÓDULO 2b — Processos concluídos
//
//  Aqui não há quadro: o histórico é lido em linhas, como uma planilha.
//  Dá para ordenar clicando no cabeçalho, filtrar por setor e por modalidade,
//  e reabrir um processo devolvendo-o à etapa escolhida do quadro.
// =============================================================================

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Search } from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { usePodeEditar } from '../lib/permissoes';
import { rotuloDoSetor, setoresPorGrupo } from '../lib/setores';
import { dataBR, numero } from '../lib/formato';
import { Avatar } from '../components/Avatar';
import { BotaoCopiar } from '../components/BotaoCopiar';
import { Etiqueta } from '../components/ui/Etiqueta';
import { AvisoErro, Carregando, Falha, Vazio } from '../components/ui/Estados';
import { ETAPAS, ModalProcesso } from './Processos';
import { MODALIDADES } from '../lib/types';
import type { Etapa, Processo, Setor, Usuario } from '../lib/types';

type Coluna =
  | 'sei'
  | 'objeto'
  | 'modalidade'
  | 'audesp'
  | 'pncp'
  | 'setor'
  | 'responsavel'
  | 'data_limite'
  | 'data_conclusao';

const COLUNAS: Array<{ chave: Coluna; titulo: string }> = [
  { chave: 'sei', titulo: 'SEI' },
  { chave: 'objeto', titulo: 'Objeto' },
  { chave: 'modalidade', titulo: 'Modalidade' },
  // AUDESP e PNCP ficam à vista: são os números que se procura depois que o
  // processo já foi concluído, para conferir a publicação obrigatória.
  { chave: 'audesp', titulo: 'AUDESP' },
  { chave: 'pncp', titulo: 'PNCP' },
  { chave: 'setor', titulo: 'Setor' },
  { chave: 'responsavel', titulo: 'Responsável' },
  { chave: 'data_limite', titulo: 'Prazo' },
  { chave: 'data_conclusao', titulo: 'Conclusão' },
];

/** Quantos dias o processo passou do prazo. Negativo = terminou adiantado. */
function atraso(p: Processo): number | null {
  if (!p.data_limite || !p.data_conclusao) return null;
  const limite = Date.parse(p.data_limite.slice(0, 10) + 'T00:00:00Z');
  const fim = Date.parse(p.data_conclusao.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(limite) || Number.isNaN(fim)) return null;
  return Math.round((fim - limite) / 86_400_000);
}

export function Concluidos({ setores, usuarios }: { setores: Setor[]; usuarios: Usuario[] }) {
  const { dados, carregando, erro, recarregar } = useDados<Processo[]>(() =>
    api.processos.listar('concluidos'),
  );
  const [emEdicao, setEmEdicao] = useState<Processo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [modalidadeFiltro, setModalidadeFiltro] = useState('');
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({
    coluna: 'data_conclusao',
    desc: true,
  });
  const [falha, setFalha] = useState<string | null>(null);
  const [reabrindo, setReabrindo] = useState<number | null>(null);

  const lista = dados ?? [];

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = lista.filter((p) => {
      const casaBusca =
        !termo ||
        [p.objeto, p.sei, p.audesp, p.pncp, p.status, p.responsavel_nome, p.setor_nome].some(
          (campo) => (campo ?? '').toLowerCase().includes(termo),
        );
      return (
        casaBusca &&
        (!setorFiltro || String(p.id_setor ?? '') === setorFiltro) &&
        (!modalidadeFiltro || p.modalidade === modalidadeFiltro)
      );
    });

    const valor = (p: Processo): string => {
      switch (ordem.coluna) {
        case 'sei': return p.sei ?? 'zzz';
        case 'objeto': return p.objeto.toLocaleLowerCase('pt-BR');
        case 'modalidade': return (p.modalidade ?? 'zzz').toLocaleLowerCase('pt-BR');
        case 'audesp': return p.audesp ?? 'zzz';
        case 'pncp': return p.pncp ?? 'zzz';
        case 'setor': return (p.setor_sigla ?? 'zzz').toLocaleLowerCase('pt-BR');
        case 'responsavel': return (p.responsavel_nome ?? 'zzz').toLocaleLowerCase('pt-BR');
        case 'data_limite': return p.data_limite ?? '';
        case 'data_conclusao': return p.data_conclusao ?? '';
      }
    };

    return [...filtradas].sort((a, b) => {
      const r = valor(a).localeCompare(valor(b), 'pt-BR');
      return ordem.desc ? -r : r;
    });
  }, [lista, busca, setorFiltro, modalidadeFiltro, ordem]);

  // Leitor abre a ficha para ver, mas não reabre processo nem salva nada.
  const podeEditar = usePodeEditar();

  const noPrazo = linhas.filter((p) => (atraso(p) ?? 0) <= 0).length;
  const comEmenda = linhas.filter((p) => p.emenda === 1).length;

  async function reabrir(processo: Processo, etapa: Etapa) {
    setFalha(null);
    setReabrindo(processo.id);
    try {
      await api.processos.ajustar(processo.id, { etapa });
      recarregar();
    } catch (e) {
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível reabrir o processo.');
    } finally {
      setReabrindo(null);
    }
  }

  function ordenarPor(coluna: Coluna) {
    setOrdem((atual) =>
      atual.coluna === coluna
        ? { coluna, desc: !atual.desc }
        : { coluna, desc: coluna.startsWith('data') },
    );
  }

  const classeFiltro =
    'cursor-pointer rounded-lg border border-slate-300 px-3 py-2.5 text-base ' +
    'focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100';

  if (carregando) return <Carregando texto="Buscando o histórico de processos…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar por SEI, objeto, AUDESP, PNCP, responsável ou setor…"
            aria-label="Procurar processos concluídos"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
          />
        </div>
        <select
          value={setorFiltro}
          onChange={(e) => setSetorFiltro(e.target.value)}
          aria-label="Filtrar por setor"
          className={classeFiltro}
        >
          <option value="">Todos os setores</option>
          {setoresPorGrupo(setores).map(([grupo, itens]) => (
            <optgroup key={grupo} label={grupo}>
              {itens.map((s) => (
                <option key={s.id} value={s.id}>
                  {rotuloDoSetor(s)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={modalidadeFiltro}
          onChange={(e) => setModalidadeFiltro(e.target.value)}
          aria-label="Filtrar por modalidade"
          className={classeFiltro}
        >
          <option value="">Todas as modalidades</option>
          {MODALIDADES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {falha && <AvisoErro mensagem={falha} />}

      {aviso && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <Check className="size-4 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Fechar aviso"
            className="rounded-md px-2 py-1 text-emerald-700 hover:bg-emerald-100"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-sm text-slate-600">
        <span>
          <strong className="text-slate-900">{numero(linhas.length)}</strong>{' '}
          {linhas.length === 1 ? 'processo concluído' : 'processos concluídos'}
        </span>
        <span>
          Entregues no prazo: <strong className="text-emerald-700">{numero(noPrazo)}</strong>
          {linhas.length > 0 && ` (${Math.round((noPrazo / linhas.length) * 100)}%)`}
        </span>
        <span>
          Com recurso de emenda: <strong className="text-slate-900">{numero(comEmenda)}</strong>
        </span>
      </div>

      {linhas.length === 0 ? (
        <Vazio
          titulo="Nenhum processo concluído por aqui"
          texto="Assim que um processo for concluído no quadro, ele aparece nesta lista."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            {/* Larguras fixas: é o que dá à tela a leitura de planilha, com
                todas as linhas na mesma altura em vez de blocos de texto. */}
            <table className="w-full min-w-[1500px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[11.5%]" />
                <col className="w-[13%]" />
                <col className="w-[9.5%]" />
                <col className="w-[9.5%]" />
                <col className="w-[9.5%]" />
                <col className="w-[6.5%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[8.5%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[4.5%]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {COLUNAS.map((c) => {
                    const ativa = ordem.coluna === c.chave;
                    return (
                      <th key={c.chave} className="px-3 py-2.5 font-semibold">
                        <button
                          type="button"
                          onClick={() => ordenarPor(c.chave)}
                          aria-label={`Ordenar por ${c.titulo}`}
                          className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-slate-800 ${
                            ativa ? 'text-slate-900' : ''
                          }`}
                        >
                          {c.titulo}
                          {ativa &&
                            (ordem.desc ? (
                              <ArrowDown className="size-3.5" />
                            ) : (
                              <ArrowUp className="size-3.5" />
                            ))}
                        </button>
                      </th>
                    );
                  })}
                  <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Entrega</th>
                  {podeEditar && (
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                      Reabrir
                    </th>
                  )}
                  <th className="whitespace-nowrap px-2 py-2.5 text-center font-semibold">Ver</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p, i) => {
                  const dias = atraso(p);
                  return (
                    <tr
                      key={p.id}
                      className={`border-t border-slate-100 ${i % 2 ? 'bg-slate-50/60' : ''} hover:bg-marca-50`}
                    >
                      <td className="px-3 py-2.5">
                        {p.sei ? (
                          <BotaoCopiar
                            texto={p.sei}
                            rotulo="Copiar o número do processo"
                            className="-ml-1 font-mono text-[11px] text-slate-600"
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="truncate font-semibold text-slate-900" title={p.objeto}>
                          {p.objeto}
                        </p>
                        {p.status && (
                          <p className="truncate text-xs text-slate-500" title={p.status}>
                            {p.status}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.modalidade ? (
                          <span className="text-xs font-semibold text-slate-700">
                            {p.modalidade}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {p.emenda === 1 && (
                          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            Emenda
                          </span>
                        )}
                      </td>
                      {/* AUDESP e PNCP: copiáveis, como o SEI — são colados
                          nos portais na hora de conferir a publicação. */}
                      <td className="px-3 py-2.5">
                        {p.audesp ? (
                          <BotaoCopiar
                            texto={p.audesp}
                            rotulo="Copiar o número do AUDESP"
                            className="-ml-1 font-mono text-[11px] text-slate-600"
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.pncp ? (
                          <BotaoCopiar
                            texto={p.pncp}
                            rotulo="Copiar o número do PNCP"
                            className="-ml-1 font-mono text-[11px] text-slate-600"
                          />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.setor_sigla ? (
                          <Etiqueta tom="azul">{p.setor_sigla}</Etiqueta>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar nome={p.responsavel_nome} tamanho="pequeno" />
                          <span className="truncate text-slate-700" title={p.responsavel_nome ?? ''}>
                            {p.responsavel_nome ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-600">
                        {dataBR(p.data_limite)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold tabular-nums text-slate-900">
                        {dataBR(p.data_conclusao)}
                      </td>
                      <td className="px-3 py-2.5">
                        {dias === null ? (
                          <span className="text-slate-400">—</span>
                        ) : dias <= 0 ? (
                          <Etiqueta tom="verde">No prazo</Etiqueta>
                        ) : (
                          <Etiqueta tom="vermelho">
                            {dias} {dias === 1 ? 'dia' : 'dias'} de atraso
                          </Etiqueta>
                        )}
                      </td>
                      {podeEditar && (
                      <td className="px-3 py-2.5 text-right">
                        <label>
                          <span className="sr-only">Reabrir {p.objeto} na etapa</span>
                          <select
                            value=""
                            disabled={reabrindo === p.id}
                            onChange={(e) => {
                              if (e.target.value) void reabrir(p, e.target.value as Etapa);
                            }}
                            className="w-full cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <option value="">Reabrir em…</option>
                            {ETAPAS.map((etapa) => (
                              <option key={etapa.chave} value={etapa.chave}>
                                {etapa.titulo}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                      )}
                      {/* Abre a ficha completa: mostra tudo o que a linha não
                          cabe (emenda, 2º responsável, anotação de status) e
                          deixa corrigir qualquer campo, AUDESP e PNCP inclusive. */}
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => setEmEdicao(p)}
                          title={podeEditar ? 'Ver e editar todas as informações' : 'Ver todas as informações'}
                          aria-label={`Ver todas as informações de ${p.objeto}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-marca-50 hover:text-marca-700"
                        >
                          <Pencil className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mesma ficha usada no quadro de processos, para que ver e corrigir um
          concluído funcione igual a corrigir um em andamento. */}
      <ModalProcesso
        aberto={emEdicao !== null}
        processo={emEdicao}
        setores={setores}
        usuarios={usuarios}
        aoFechar={() => setEmEdicao(null)}
        aoSalvar={(salvo) => {
          setEmEdicao(null);
          // Se deixou de ser concluído, saiu desta lista: recarregar é o que
          // mantém a tela honesta sem precisar remover a linha na mão.
          recarregar();
          if (salvo.etapa !== 'Concluído') {
            setFalha(null);
            setAviso(`${salvo.objeto} voltou para o quadro, na fase ${salvo.etapa}.`);
          }
        }}
      />
    </div>
  );
}
