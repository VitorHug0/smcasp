// =============================================================================
//  GAVETA LATERAL DE CHECKLIST DO PROCESSO (Slide-over / Drawer)
//  Exibe o fluxo completo sequencial de acordo com a modalidade (AMIL, Licitação,
//  Adesão ARP, INEX, etc.), agrupado por fases em blocos sanfonados (acordeão),
//  com registro automático de quem concluiu, data/hora e suporte a etapas extras.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import type { Processo, ProcessoChecklistItem, ResumoChecklistProcesso } from '../lib/types';
import { Carregando } from './ui/Estados';
import { Etiqueta } from './ui/Etiqueta';
import { Botao } from './ui/Botao';
import { useAcesso } from '../lib/permissoes';

interface Props {
  processo: Processo | null;
  aberto: boolean;
  aoFechar: () => void;
  aoAtualizarProgresso?: (idProcesso: number, concluidos: number, total: number) => void;
}

type FiltroChecklist = 'todas' | 'pendentes' | 'concluidas';

export function GavetaChecklistProcesso({
  processo,
  aberto,
  aoFechar,
  aoAtualizarProgresso,
}: Props) {
  const { usuario } = useAcesso();
  const [dados, setDados] = useState<ResumoChecklistProcesso | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros e busca
  const [filtro, setFiltro] = useState<FiltroChecklist>('todas');
  const [busca, setBusca] = useState('');

  // Controle de blocos sanfonados (fase -> boolean)
  const [fasesAbertas, setFasesAbertas] = useState<Record<string, boolean>>({});

  // Formulário de etapa extra
  const [criandoExtra, setCriandoExtra] = useState(false);
  const [faseAlvoExtra, setFaseAlvoExtra] = useState('');
  const [tituloExtra, setTituloExtra] = useState('');
  const [detalhesExtra, setDetalhesExtra] = useState('');
  const [setorExtra, setSetorExtra] = useState('CSA');
  const [salvandoExtra, setSalvandoExtra] = useState(false);

  // Copiado feedback
  const [copiado, setCopiado] = useState(false);

  // Referências estáveis para callbacks externos (evita re-render / fetch loops)
  const aoAtualizarProgressoRef = useRef(aoAtualizarProgresso);
  aoAtualizarProgressoRef.current = aoAtualizarProgresso;

  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  const idProcesso = processo?.id;

  // Carrega os dados do checklist quando o idProcesso muda ou a gaveta é aberta
  useEffect(() => {
    if (!aberto || !idProcesso) {
      setDados(null);
      setCarregando(false);
      return;
    }

    let ativo = true;
    setCarregando(true);
    setErro(null);

    api.processos.checklist
      .obter(idProcesso)
      .then((res) => {
        if (!ativo) return;
        setDados(res);

        // Por padrão, abre todas as fases
        const fasesIniciais: Record<string, boolean> = {};
        for (const item of res.itens) {
          fasesIniciais[item.fase] = true;
        }
        setFasesAbertas(fasesIniciais);
        aoAtualizarProgressoRef.current?.(idProcesso, res.concluidos, res.total);
      })
      .catch((e) => {
        if (!ativo) return;
        setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar o checklist.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, idProcesso]);

  // Tecla Escape para fechar gaveta
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFecharRef.current();
    };
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
    };
  }, [aberto]);

  // Agrupamento dos itens por fase
  const fasesAgrupadas = useMemo(() => {
    if (!dados?.itens) return [];

    const mapa = new Map<string, ProcessoChecklistItem[]>();
    const termo = busca.trim().toLowerCase();

    for (const item of dados.itens) {
      // Filtro de status
      if (filtro === 'pendentes' && item.concluido === 1) continue;
      if (filtro === 'concluidas' && item.concluido === 0) continue;

      // Filtro de busca
      if (
        termo &&
        !item.titulo.toLowerCase().includes(termo) &&
        !(item.detalhes ?? '').toLowerCase().includes(termo) &&
        !(item.setor_responsavel ?? '').toLowerCase().includes(termo)
      ) {
        continue;
      }

      const lista = mapa.get(item.fase) ?? [];
      lista.push(item);
      mapa.set(item.fase, lista);
    }

    return Array.from(mapa.entries()).map(([nome, itens]) => {
      const totalFase = dados.itens.filter((i) => i.fase === nome).length;
      const concluidosFase = dados.itens.filter((i) => i.fase === nome && i.concluido === 1).length;
      return {
        nome,
        itens,
        totalFase,
        concluidosFase,
      };
    });
  }, [dados, filtro, busca]);

  // Alterna conclusão do item
  const alternarConclusao = async (item: ProcessoChecklistItem) => {
    if (!processo || !dados) return;

    const novoStatus = item.concluido === 1 ? false : true;
    const antigoDados = { ...dados };

    // Atualização otimista
    const novosItens = dados.itens.map((i) => {
      if (i.id === item.id) {
        return {
          ...i,
          concluido: novoStatus ? 1 : 0,
          concluido_por_nome: novoStatus ? (usuario?.nome ?? 'Usuário') : null,
          concluido_em: novoStatus ? new Date().toISOString() : null,
        };
      }
      return i;
    });

    const novosConcluidos = novosItens.filter((i) => i.concluido === 1).length;
    const novosTotal = novosItens.length;

    setDados({
      ...dados,
      itens: novosItens,
      concluidos: novosConcluidos,
      total: novosTotal,
    });

    aoAtualizarProgressoRef.current?.(processo.id, novosConcluidos, novosTotal);

    try {
      await api.processos.checklist.ajustarItem(processo.id, item.id, {
        concluido: novoStatus,
      });
    } catch {
      setDados(antigoDados);
      aoAtualizarProgressoRef.current?.(processo.id, antigoDados.concluidos, antigoDados.total);
    }
  };

  // Salvar nova etapa extra
  const salvarEtapaExtra = async () => {
    if (!processo || !dados || !tituloExtra.trim()) return;

    setSalvandoExtra(true);
    try {
      const criada = await api.processos.checklist.adicionarItem(processo.id, {
        titulo: tituloExtra.trim(),
        detalhes: detalhesExtra.trim() || undefined,
        fase: faseAlvoExtra || dados.itens[0]?.fase || '2. Fase de Instrução Processual - CSA',
        setor_responsavel: setorExtra,
      });

      const novosItens = [...dados.itens, criada];
      const novosTotal = novosItens.length;
      const novosConcluidos = novosItens.filter((i) => i.concluido === 1).length;

      setDados({
        ...dados,
        itens: novosItens,
        total: novosTotal,
        concluidos: novosConcluidos,
      });

      aoAtualizarProgressoRef.current?.(processo.id, novosConcluidos, novosTotal);

      setTituloExtra('');
      setDetalhesExtra('');
      setCriandoExtra(false);
    } catch {
      alert('Não foi possível adicionar a etapa extra.');
    } finally {
      setSalvandoExtra(false);
    }
  };

  // Excluir etapa personalizada
  const excluirEtapaExtra = async (idItem: number) => {
    if (!processo || !dados) return;
    if (!confirm('Deseja excluir esta etapa personalizada?')) return;

    try {
      await api.processos.checklist.excluirItem(processo.id, idItem);
      const novosItens = dados.itens.filter((i) => i.id !== idItem);
      const novosTotal = novosItens.length;
      const novosConcluidos = novosItens.filter((i) => i.concluido === 1).length;

      setDados({
        ...dados,
        itens: novosItens,
        total: novosTotal,
        concluidos: novosConcluidos,
      });

      aoAtualizarProgressoRef.current?.(processo.id, novosConcluidos, novosTotal);
    } catch {
      alert('Não foi possível excluir a etapa.');
    }
  };

  const copiarSei = () => {
    if (!processo?.sei) return;
    navigator.clipboard.writeText(processo.sei);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  if (!aberto || !processo) return null;

  const porcentagem =
    dados && dados.total > 0 ? Math.round((dados.concluidos / dados.total) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop com desfoque suave */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={aoFechar}
        aria-hidden="true"
      />

      {/* Gaveta Lateral (Slide-over) pela direita */}
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
        <aside
          role="dialog"
          aria-modal="true"
          className="pointer-events-auto flex h-full max-h-screen w-screen max-w-xl flex-col overflow-hidden bg-white shadow-2xl transition-all duration-300 ease-out"
        >
          {/* Cabeçalho da Gaveta */}
          <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-marca-100 px-2.5 py-0.5 text-xs font-bold text-marca-800">
                    <Layers className="size-3.5" />
                    <span>{processo.modalidade ?? 'Processo'}</span>
                  </span>

                  <Etiqueta tom="azul">{processo.etapa}</Etiqueta>

                  {processo.sei && (
                    <button
                      type="button"
                      onClick={copiarSei}
                      title="Copiar número SEI"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95"
                    >
                      <span>{processo.sei}</span>
                      {copiado ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>

                <h2 className="mt-2 text-base font-bold text-slate-900 line-clamp-2">
                  {processo.objeto}
                </h2>

                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <User className="size-3.5 text-slate-400" />
                  <span>Responsável: {processo.responsavel_nome ?? 'Não definido'}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={aoFechar}
                title="Fechar (Esc)"
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 active:scale-95"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Barra de Progresso Geral */}
            <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Progresso do Fluxo</span>
                <span className="font-bold text-marca-700">
                  {dados ? `${dados.concluidos} de ${dados.total} (${porcentagem}%)` : '—'}
                </span>
              </div>

              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    porcentagem === 100
                      ? 'bg-emerald-500'
                      : porcentagem > 50
                        ? 'bg-marca-600'
                        : 'bg-amber-500'
                  }`}
                  style={{ width: `${porcentagem}%` }}
                />
              </div>

              {porcentagem === 100 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <Sparkles className="size-3.5" />
                  <span>Todas as etapas desta modalidade foram concluídas!</span>
                </div>
              )}
            </div>

            {/* Barra de Busca e Filtros Rápidos */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {(['todas', 'pendentes', 'concluidas'] as const).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setFiltro(tipo)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition ${
                      filtro === tipo
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[140px] flex-1 max-w-[200px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Filtrar etapa..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-2 text-xs text-slate-800 placeholder-slate-400 focus:border-marca-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Conteúdo rolável com as Fases e Etapas */}
          <div className="rolagem-suave min-h-0 flex-1 overflow-y-auto p-5 space-y-4 pb-28">
            {carregando ? (
              <Carregando texto="Carregando checklist sequencial..." />
            ) : erro ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
                {erro}
              </div>
            ) : fasesAgrupadas.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle2 className="mx-auto size-12 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  Nenhuma etapa encontrada para este filtro
                </p>
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    className="mt-2 text-xs font-semibold text-marca-600 hover:underline"
                  >
                    Limpar busca
                  </button>
                )}
              </div>
            ) : (
              fasesAgrupadas.map(({ nome, itens, totalFase, concluidosFase }) => {
                const aberta = fasesAbertas[nome] ?? true;
                const faseCompleta = totalFase > 0 && concluidosFase === totalFase;

                return (
                  <div
                    key={nome}
                    className={`overflow-hidden rounded-2xl border transition-all ${
                      faseCompleta
                        ? 'border-emerald-200/80 bg-emerald-50/20'
                        : 'border-slate-200/90 bg-white shadow-xs'
                    }`}
                  >
                    {/* Cabeçalho do Acordeão da Fase */}
                    <button
                      type="button"
                      onClick={() =>
                        setFasesAbertas((prev) => ({
                          ...prev,
                          [nome]: !aberta,
                        }))
                      }
                      className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-left transition hover:bg-slate-100/80"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {aberta ? (
                          <ChevronDown className="size-4 shrink-0 text-slate-400" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-slate-400" />
                        )}
                        <span className="truncate text-sm font-bold text-slate-800">{nome}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            faseCompleta
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200/70 text-slate-700'
                          }`}
                        >
                          {concluidosFase}/{totalFase} {faseCompleta ? '✓' : ''}
                        </span>
                      </div>
                    </button>

                    {/* Itens dentro da Fase */}
                    {aberta && (
                      <div className="divide-y divide-slate-100 p-2">
                        {itens.map((item) => {
                          const estaConcluido = item.concluido === 1;

                          return (
                            <div
                              key={item.id}
                              className={`group relative flex items-start gap-3 rounded-xl p-3 transition ${
                                estaConcluido
                                  ? 'bg-slate-50/50 hover:bg-slate-100/50'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              {/* Botão circular de check */}
                              <button
                                type="button"
                                onClick={() => alternarConclusao(item)}
                                title={estaConcluido ? 'Desmarcar etapa' : 'Concluir etapa'}
                                className={`mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 ${
                                  estaConcluido
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs'
                                    : 'border-slate-300 text-transparent hover:border-marca-600 hover:bg-marca-50 hover:text-marca-600'
                                }`}
                              >
                                <Check className="size-3.5 stroke-[3]" />
                              </button>

                              {/* Conteúdo textual da etapa */}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-400">
                                    {item.chave_item}.
                                  </span>
                                  <span
                                    className={`text-sm font-bold ${
                                      estaConcluido
                                        ? 'text-slate-500 line-through'
                                        : 'text-slate-900'
                                    }`}
                                  >
                                    {item.titulo}
                                  </span>

                                  {item.setor_responsavel && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10.5px] font-semibold text-slate-600">
                                      {item.setor_responsavel}
                                    </span>
                                  )}

                                  {item.personalizado === 1 && (
                                    <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[10.5px] font-semibold text-indigo-700">
                                      Etapa extra
                                    </span>
                                  )}
                                </div>

                                {/* Instruções / Detalhes do PDF */}
                                {item.detalhes && (
                                  <p
                                    className={`mt-1 text-xs leading-relaxed ${
                                      estaConcluido
                                        ? 'text-slate-400 line-through'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    {item.detalhes}
                                  </p>
                                )}

                                {/* Carimbo de conclusão (Quem concluiu e quando) */}
                                {estaConcluido && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-emerald-700">
                                    <span className="inline-flex items-center gap-1">
                                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                                      <span>
                                        Concluído por{' '}
                                        <strong className="font-semibold">
                                          {item.concluido_por_nome ?? 'Usuário'}
                                        </strong>
                                      </span>
                                    </span>

                                    {item.concluido_em && (
                                      <span className="inline-flex items-center gap-1 text-slate-400">
                                        <Clock className="size-3" />
                                        <span>
                                          {new Date(item.concluido_em).toLocaleDateString('pt-BR')}{' '}
                                          às{' '}
                                          {new Date(item.concluido_em).toLocaleTimeString('pt-BR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Ação de exclusão para itens extras */}
                              {item.personalizado === 1 && (
                                <button
                                  type="button"
                                  onClick={() => excluirEtapaExtra(item.id)}
                                  title="Excluir etapa personalizada"
                                  className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Formulário / Botão de Adicionar Etapa Avulsa */}
            {criandoExtra ? (
              <div className="rounded-2xl border border-marca-300 bg-marca-50/30 p-4 shadow-xs">
                <h4 className="text-xs font-bold text-marca-900 uppercase tracking-wide">
                  Nova etapa personalizada para este processo
                </h4>

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Fase do processo
                    </label>
                    <select
                      value={faseAlvoExtra}
                      onChange={(e) => setFaseAlvoExtra(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-marca-500 focus:outline-none"
                    >
                      {fasesAgrupadas.map((f) => (
                        <option key={f.nome} value={f.nome}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Título da etapa *
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={tituloExtra}
                      onChange={(e) => setTituloExtra(e.target.value)}
                      placeholder="Ex.: Cumprir cota 12 do parecer jurídico..."
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-marca-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Orientações / Detalhes da Execução (opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={detalhesExtra}
                      onChange={(e) => setDetalhesExtra(e.target.value)}
                      placeholder="Ex.: Juntar documento comprobatório e colher visto do Diretor..."
                      className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-marca-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Setor</label>
                      <input
                        type="text"
                        value={setorExtra}
                        onChange={(e) => setSetorExtra(e.target.value)}
                        className="mt-1 w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Botao
                        aparencia="neutro"
                        className="!px-3 !py-1.5 !text-xs"
                        onClick={() => setCriandoExtra(false)}
                      >
                        Cancelar
                      </Botao>
                      <Botao
                        aparencia="primario"
                        className="!px-3 !py-1.5 !text-xs"
                        carregando={salvandoExtra}
                        disabled={!tituloExtra.trim()}
                        onClick={salvarEtapaExtra}
                      >
                        Adicionar etapa
                      </Botao>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCriandoExtra(true);
                  if (fasesAgrupadas.length > 0 && !faseAlvoExtra) {
                    setFaseAlvoExtra(fasesAgrupadas[0].nome);
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-600 transition hover:border-marca-500 hover:bg-marca-50 hover:text-marca-700"
              >
                <Plus className="size-4" />
                <span>Adicionar etapa avulsa / personalizada</span>
              </button>
            )}
          </div>

          {/* Rodapé da Gaveta */}
          <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Modalidade:{' '}
              <strong className="text-slate-700">{processo.modalidade ?? 'Padrão'}</strong>
            </span>
            <Botao aparencia="neutro" onClick={aoFechar}>
              Fechar gaveta
            </Botao>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}
