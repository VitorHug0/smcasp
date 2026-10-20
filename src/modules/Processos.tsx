// =============================================================================
//  MÓDULO 2 — Processos em andamento, no formato da planilha
//
//  Uma tabela só, com os processos em linhas, separados por faixas escuras que
//  indicam a fase em que cada um está:
//    CSA → CSF → Acompanhamento → Execução/Entrega → AUDESP/PNCP → Outros
//
//  Tudo se edita no lugar, sem abrir janela: status, AUDESP, PNCP, modalidade,
//  emenda, prioridade e os dois responsáveis. A coluna "Mover para" leva o
//  processo a outra fase ou o conclui — e concluído sai daqui para a tela de
//  Concluídos.
// =============================================================================

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { usePodeEditar } from '../lib/permissoes';
import { exportarParaExcel } from '../lib/exportarProcessos';
import { opcoesDeSetor } from '../lib/setores';
import { dataBR, hojeISO } from '../lib/formato';
import { Avatar } from '../components/Avatar';
import { BotaoCopiar } from '../components/BotaoCopiar';
import { Botao } from '../components/ui/Botao';
import { Modal } from '../components/ui/Modal';
import { CampoLista, CampoTexto } from '../components/ui/Campo';
import { SelecaoNaLinha, TextoEditavel } from '../components/ui/CelulaEditavel';
import { AvisoErro, Carregando, Falha } from '../components/ui/Estados';
import { DESFECHOS_PROCESSO, ETAPAS_DO_QUADRO, MODALIDADES, PRIORIDADES } from '../lib/types';
import { processarNotaEmpenho } from '../lib/notaEmpenho';
import {
  FormularioCompra,
  dadosDoFormulario,
  estadoCompraInicial,
  validarFormularioCompra,
  type FormularioCompraEstado,
} from '../components/compras/FormularioCompra';
import { GavetaChecklistProcesso } from '../components/GavetaChecklistProcesso';
import type { DesfechoProcesso, Etapa, EtapaAberta, Modalidade, Prioridade, Processo, Setor, Usuario } from '../lib/types';

/** As faixas da planilha, na ordem em que o processo caminha. */
export const ETAPAS: Array<{ chave: EtapaAberta; titulo: string; faixa: string }> = [
  { chave: 'CSA', titulo: 'CSA', faixa: 'Coordenadoria Setorial Administrativa' },
  { chave: 'CSF', titulo: 'CSF', faixa: 'Coordenadoria Setorial Financeira' },
  { chave: 'Acompanhamento', titulo: 'Acompanhamento', faixa: 'Acompanhamento' },
  { chave: 'Execução/Entrega', titulo: 'Execução / Entrega', faixa: 'Execução / Entrega' },
  { chave: 'AUDESP/PNCP', titulo: 'AUDESP / PNCP', faixa: 'AUDESP / PNCP' },
  { chave: 'Outros', titulo: 'Outros', faixa: 'Outros' },
];

const COLUNAS_DA_TABELA = 10;

/** Cor do texto e fundo da prioridade. */
const COR_PRIORIDADE: Record<Prioridade, string> = {
  'Muito Alta': 'text-red-700 bg-red-50 ring-red-200/80 font-bold',
  Alta: 'text-red-700 bg-red-50/70 ring-red-200/60 font-semibold',
  Média: 'text-amber-800 bg-amber-50 ring-amber-200 font-medium',
  Baixa: 'text-slate-600 bg-slate-100 ring-slate-200 font-normal',
};

type FiltroRapido = 'todos' | 'atrasados' | 'emenda' | 'prioridade_alta';

interface Props {
  setores: Setor[];
  usuarios: Usuario[];
  usuarioAtualId: number;
  somenteMinhasDemandas: boolean;
  aoMudarMinhasDemandas: (ativo: boolean) => void;
  /** Chamado quando o usuário quer ver o processo que acabou de concluir. */
  aoAbrirConcluidos: () => void;
}

export function Processos({
  setores,
  usuarios,
  usuarioAtualId,
  somenteMinhasDemandas,
  aoMudarMinhasDemandas,
  aoAbrirConcluidos,
}: Props) {
  // Perfil de Leitor: a planilha continua inteira na tela, só não abre para
  // edição. As células cuidam disso sozinhas; aqui somem os botões.
  const podeEditar = usePodeEditar();
  const { dados, carregando, erro, recarregar } = useDados<Processo[]>(() =>
    api.processos.listar('abertos'),
  );
  const [lista, setLista] = useState<Processo[] | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Processo | null>(null);

  // Gaveta Lateral de Checklist do Processo (Slide-over)
  const [processoChecklist, setProcessoChecklist] = useState<Processo | null>(null);

  // Aviso Suave de Tramitação com Checklist Pendente
  const [avisoTransicao, setAvisoTransicao] = useState<{
    processo: Processo;
    novaEtapa: Etapa;
  } | null>(null);

  const [falhaAoSalvar, setFalhaAoSalvar] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{ objeto: string; desfecho?: DesfechoProcesso } | null>(null);
  const [paraConcluir, setParaConcluir] = useState<Processo | null>(null);
  const [apagado, setApagado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [responsavelFiltro, setResponsavelFiltro] = useState('');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todos');
  const [etapasRecolhidas, setEtapasRecolhidas] = useState<Set<EtapaAberta>>(() => new Set());
  const [exportando, setExportando] = useState(false);
  const [exportado, setExportado] = useState<number | null>(null);

  useEffect(() => {
    if (dados) setLista(dados);
  }, [dados]);
  const processos = lista ?? dados ?? [];

  const contadores = useMemo(() => {
    let atrasados = 0;
    let emenda = 0;
    let prioridadeAlta = 0;
    for (const p of processos) {
      if (typeof p.dias_para_prazo === 'number' && p.dias_para_prazo < 0) atrasados++;
      if (p.emenda === 1) emenda++;
      if (p.prioridade === 'Alta' || p.prioridade === 'Muito Alta') prioridadeAlta++;
    }
    return {
      todos: processos.length,
      atrasados,
      emenda,
      prioridadeAlta,
    };
  }, [processos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return processos.filter((p) => {
      const casaBusca =
        !termo ||
        (p.sei ?? '').toLowerCase().includes(termo) ||
        p.objeto.toLowerCase().includes(termo) ||
        (p.status ?? '').toLowerCase().includes(termo) ||
        (p.audesp ?? '').toLowerCase().includes(termo) ||
        (p.pncp ?? '').toLowerCase().includes(termo);
      const casaResponsavel =
        !responsavelFiltro ||
        String(p.id_responsavel ?? '') === responsavelFiltro ||
        String(p.id_responsavel_2 ?? '') === responsavelFiltro;
      const casaPrioridade = !prioridadeFiltro || p.prioridade === prioridadeFiltro;
      const casaMinhasDemandas =
        !somenteMinhasDemandas ||
        p.id_responsavel === usuarioAtualId ||
        p.id_responsavel_2 === usuarioAtualId;
      const casaFiltroRapido =
        filtroRapido === 'todos' ||
        (filtroRapido === 'atrasados' && typeof p.dias_para_prazo === 'number' && p.dias_para_prazo < 0) ||
        (filtroRapido === 'emenda' && p.emenda === 1) ||
        (filtroRapido === 'prioridade_alta' && (p.prioridade === 'Alta' || p.prioridade === 'Muito Alta'));

      return casaBusca && casaResponsavel && casaPrioridade && casaMinhasDemandas && casaFiltroRapido;
    });
  }, [
    processos,
    busca,
    responsavelFiltro,
    prioridadeFiltro,
    somenteMinhasDemandas,
    usuarioAtualId,
    filtroRapido,
  ]);

  const alternarEtapa = (chave: EtapaAberta) => {
    setEtapasRecolhidas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  };

  const expandirTodas = () => setEtapasRecolhidas(new Set());
  const recolherTodas = () => setEtapasRecolhidas(new Set(ETAPAS.map((e) => e.chave)));

  const porEtapa = useMemo(() => {
    const mapa = new Map<EtapaAberta, Processo[]>();
    for (const e of ETAPAS) mapa.set(e.chave, []);
    for (const p of filtrados) {
      if (p.etapa !== 'Concluído') mapa.get(p.etapa as EtapaAberta)?.push(p);
    }
    return mapa;
  }, [filtrados]);

  async function executarAjuste(processo: Processo, mudanca: Partial<Processo>) {
    const anterior = processos;
    setFalhaAoSalvar(null);

    const virouConcluido = mudanca.etapa === 'Concluído';
    setLista(
      virouConcluido
        ? processos.filter((p) => p.id !== processo.id)
        : processos.map((p) => (p.id === processo.id ? { ...p, ...mudanca } : p)),
    );

    try {
      const atualizado = await api.processos.ajustar(processo.id, mudanca);
      if (virouConcluido) setConcluido({ objeto: processo.objeto, desfecho: processo.desfecho ?? undefined });
      else setLista((atual) => (atual ?? []).map((p) => (p.id === atualizado.id ? atualizado : p)));
    } catch (e) {
      setLista(anterior);
      setFalhaAoSalvar(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar a alteração.');
    }
  }

  async function ajustar(processo: Processo, mudanca: Partial<Processo>) {
    // Aviso suave ao tentar mover de etapa quando ainda há itens pendentes no checklist
    if (mudanca.etapa && mudanca.etapa !== processo.etapa) {
      const total = processo.checklist_total ?? 0;
      const concluidos = processo.checklist_concluidos ?? 0;
      if (total > 0 && concluidos < total) {
        setAvisoTransicao({
          processo,
          novaEtapa: mudanca.etapa,
        });
        return;
      }
    }
    await executarAjuste(processo, mudanca);
  }

  const atualizarProgressoChecklist = useCallback(
    (idProcesso: number, concluidos: number, total: number) => {
      setLista((atual) => {
        if (!atual) return atual;
        const index = atual.findIndex((p) => p.id === idProcesso);
        if (index === -1) return atual;
        const item = atual[index];
        if (item.checklist_concluidos === concluidos && item.checklist_total === total) {
          return atual;
        }
        const nova = [...atual];
        nova[index] = { ...item, checklist_concluidos: concluidos, checklist_total: total };
        return nova;
      });
    },
    [],
  );

  const fecharChecklist = useCallback(() => {
    setProcessoChecklist(null);
  }, []);

  function abrirNovo() {
    setEmEdicao(null);
    setModalAberto(true);
  }

  function abrirEdicao(p: Processo) {
    setEmEdicao(p);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEmEdicao(null);
  }

  /**
   * Exporta o que está à vista, não o banco inteiro: quem filtrou por
   * responsável e depois exportou espera receber aquelas linhas, e não uma
   * planilha que não confere com a tela.
   */
  async function exportar() {
    if (exportando) return;
    setExportando(true);
    setFalhaAoSalvar(null);
    setExportado(null);
    try {
      const quantas = await exportarParaExcel(filtrados, ETAPAS);
      setExportado(quantas);
    } catch {
      setFalhaAoSalvar(
        'Não foi possível gerar a planilha. Tente de novo; se persistir, avise a CSA.',
      );
    } finally {
      setExportando(false);
    }
  }

  if (carregando && !lista) return <Carregando texto="Abrindo a planilha de processos…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;

  const filtrando = Boolean(busca || responsavelFiltro || prioridadeFiltro || somenteMinhasDemandas);
  const classeFiltro =
    'cursor-pointer rounded-lg border border-slate-300 px-3 py-2.5 text-base ' +
    'focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100';

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------- ferramentas */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por SEI, objeto, status, AUDESP ou PNCP…"
              aria-label="Procurar processos"
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
            />
          </div>
          <select
            value={responsavelFiltro}
            onChange={(e) => setResponsavelFiltro(e.target.value)}
            aria-label="Filtrar por responsável"
            className={classeFiltro}
          >
            <option value="">Todos os responsáveis</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <select
            value={prioridadeFiltro}
            onChange={(e) => setPrioridadeFiltro(e.target.value)}
            aria-label="Filtrar por prioridade"
            className={classeFiltro}
          >
            <option value="">Todas as prioridades</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Botao
            aparencia={somenteMinhasDemandas ? 'primario' : 'neutro'}
            icone={<UserCheck className="size-4" />}
            onClick={() => aoMudarMinhasDemandas(!somenteMinhasDemandas)}
            aria-pressed={somenteMinhasDemandas}
            title={somenteMinhasDemandas ? 'Mostrar todos os processos' : 'Mostrar somente processos atribuídos a mim'}
          >
            Minhas Demandas
          </Botao>
          <Botao
            aparencia="neutro"
            icone={<FileSpreadsheet className="size-4" />}
            onClick={exportar}
            carregando={exportando}
            disabled={filtrados.length === 0}
            title={
              filtrados.length === 0
                ? 'Não há processos na tela para exportar'
                : `Baixar em Excel os ${filtrados.length} processos que estão na tela`
            }
          >
            Exportar Excel
          </Botao>

          {podeEditar && (
            <Botao aparencia="primario" icone={<Plus className="size-4" />} onClick={abrirNovo}>
              Novo processo
            </Botao>
          )}
        </div>

        {/* Chips de filtros rápidos com contadores dinâmicos */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 hidden font-semibold text-slate-500 sm:inline">Filtro rápido:</span>

            <button
              type="button"
              onClick={() => setFiltroRapido('todos')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-all ${
                filtroRapido === 'todos'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              <span>Todos</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  filtroRapido === 'todos' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {contadores.todos}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroRapido(filtroRapido === 'atrasados' ? 'todos' : 'atrasados')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-all ${
                filtroRapido === 'atrasados'
                  ? 'bg-red-600 text-white shadow-xs ring-2 ring-red-300'
                  : contadores.atrasados > 0
                    ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200/80'
              }`}
            >
              <AlertTriangle className="size-3.5" />
              <span>Atrasados</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  filtroRapido === 'atrasados'
                    ? 'bg-red-700 text-white'
                    : contadores.atrasados > 0
                      ? 'bg-red-200 text-red-800'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {contadores.atrasados}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroRapido(filtroRapido === 'emenda' ? 'todos' : 'emenda')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-all ${
                filtroRapido === 'emenda'
                  ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                  : 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>Com Emenda</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  filtroRapido === 'emenda' ? 'bg-emerald-700 text-white' : 'bg-emerald-200 text-emerald-900'
                }`}
              >
                {contadores.emenda}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFiltroRapido(filtroRapido === 'prioridade_alta' ? 'todos' : 'prioridade_alta')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-all ${
                filtroRapido === 'prioridade_alta'
                  ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-300'
                  : 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>Prioridade Alta</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  filtroRapido === 'prioridade_alta' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
                }`}
              >
                {contadores.prioridadeAlta}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {filtrando && (
              <button
                type="button"
                onClick={() => {
                  setBusca('');
                  setResponsavelFiltro('');
                  setPrioridadeFiltro('');
                  setFiltroRapido('todos');
                  aoMudarMinhasDemandas(false);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="size-3.5" />
                Limpar filtros
              </button>
            )}

            <div className="flex items-center gap-1 border-l border-slate-200 pl-2 text-xs text-slate-500">
              <button
                type="button"
                onClick={expandirTodas}
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800"
                title="Expandir todas as fases"
              >
                Expandir todas
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={recolherTodas}
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800"
                title="Recolher todas as fases"
              >
                Recolher todas
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
        <p>
          <strong className="text-slate-900">{filtrados.length}</strong>{' '}
          {filtrados.length === 1 ? 'processo em andamento' : 'processos em andamento'}
          {filtrando && ' (com filtros aplicados)'} ·{' '}
          {podeEditar
            ? 'clique em qualquer célula para editar; o número do SEI se copia com um clique.'
            : 'seu acesso é somente para consulta; o número do SEI se copia com um clique.'}
        </p>
      </div>

      {falhaAoSalvar && <AvisoErro mensagem={falhaAoSalvar} />}

      {exportado !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <Check className="size-4 shrink-0" />
          <span className="flex-1">
            Planilha gerada com <strong>{exportado}</strong>{' '}
            {exportado === 1 ? 'processo' : 'processos'} — confira a pasta de downloads.
          </span>
          <button
            type="button"
            onClick={() => setExportado(null)}
            aria-label="Fechar aviso"
            className="rounded-md px-2 py-1 text-emerald-700 hover:bg-emerald-100"
          >
            Fechar
          </button>
        </div>
      )}

      {apagado && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          <Trash2 className="size-4 shrink-0" />
          <span className="flex-1">
            <strong>{apagado}</strong> foi apagado e saiu do sistema.
          </span>
          <button
            type="button"
            onClick={() => setApagado(null)}
            aria-label="Fechar aviso"
            className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-200"
          >
            Fechar
          </button>
        </div>
      )}

      {concluido && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <Check className="size-4 shrink-0" />
          <span className="flex-1">
            <strong>{concluido.objeto}</strong> foi encerrado
            {concluido.desfecho ? <> como <strong>{concluido.desfecho}</strong></> : null} e saiu desta lista.
          </span>
          <button
            type="button"
            onClick={aoAbrirConcluidos}
            className="font-bold text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
          >
            Ver em Encerrados
          </button>
          <button
            type="button"
            onClick={() => setConcluido(null)}
            aria-label="Fechar aviso"
            className="rounded-md px-2 py-1 text-emerald-700 hover:bg-emerald-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------- planilha */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="rolagem-suave overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left text-[12px]">
            <colgroup>
              <col className="w-[125px]" />  {/* 1. SEI */}
              <col className="w-[20%] min-w-[170px]" /> {/* 2. Objeto e Setor */}
              <col className="w-[85px]" />   {/* 3. Modalidade */}
              <col className="w-[50px]" />   {/* 4. Emenda */}
              <col className="w-[105px]" />  {/* 5. Publicações */}
              <col className="w-[18%] min-w-[130px]" /> {/* 6. Status */}
              <col className="w-[88px]" />   {/* 7. Prazo */}
              <col className="w-[78px]" />   {/* 8. Prioridade */}
              <col className="w-[115px]" />  {/* 9. Responsáveis */}
              <col className="w-[125px]" />  {/* 10. Ações */}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-2 py-2 font-bold">SEI</th>
                <th className="px-2 py-2 font-bold">Objeto / Setor</th>
                <th className="px-2 py-2 font-bold">Modalidade</th>
                <th className="px-2 py-2 text-center font-bold">Emenda</th>
                <th className="px-2 py-2 font-bold">Publicações</th>
                <th className="px-2 py-2 font-bold">Status</th>
                <th className="px-2 py-2 font-bold">Prazo</th>
                <th className="px-2 py-2 font-bold">Prioridade</th>
                <th className="px-2 py-2 font-bold">Responsáveis</th>
                <th className="sticky right-0 z-20 border-l border-slate-200 bg-slate-50 px-2 py-2 text-center font-bold shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)]">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {ETAPAS.map((etapa) => {
                const itens = porEtapa.get(etapa.chave) ?? [];
                const estaRecolhido = etapasRecolhidas.has(etapa.chave);

                return (
                  <Fragment key={etapa.chave}>
                    {/* Cabeçalho da fase discreto em slate suave com Accordion */}
                    <tr className="border-t border-slate-200">
                      <th
                        colSpan={COLUNAS_DA_TABELA}
                        scope="colgroup"
                        onClick={() => alternarEtapa(etapa.chave)}
                        className="group cursor-pointer select-none border-y border-slate-200 bg-slate-100/80 px-3 py-2 text-left transition-colors hover:bg-slate-200/70"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded text-slate-500 transition-colors group-hover:text-slate-800">
                              {estaRecolhido ? (
                                <ChevronRight className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </span>
                            <span className="text-[12px] font-bold uppercase tracking-wider text-slate-800">
                              {etapa.faixa}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-2xs">
                              {itens.length} {itens.length === 1 ? 'processo' : 'processos'}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600">
                            {estaRecolhido ? 'Clique para expandir' : 'Clique para recolher'}
                          </span>
                        </div>
                      </th>
                    </tr>

                    {!estaRecolhido && (
                      itens.length === 0 ? (
                        <tr>
                          <td
                            colSpan={COLUNAS_DA_TABELA}
                            className="border-b border-slate-200 px-3 py-3 text-center text-xs text-slate-400"
                          >
                            {filtrando ? 'Nenhum processo encontrado nesta fase com os filtros aplicados' : 'Nenhum processo nesta fase'}
                          </td>
                        </tr>
                      ) : (
                        itens.map((p) => (
                          <LinhaProcesso
                            key={p.id}
                            processo={p}
                            usuarios={usuarios}
                            aoAjustar={ajustar}
                            aoConcluir={() => setParaConcluir(p)}
                            aoEditar={() => abrirEdicao(p)}
                            aoAbrirChecklist={() => setProcessoChecklist(p)}
                          />
                        ))
                      )
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ModalProcesso
        aberto={modalAberto}
        processo={emEdicao}
        setores={setores}
        usuarios={usuarios}
        aoFechar={fecharModal}
        aoSalvar={(salvo) => {
          setLista(
            emEdicao
              ? processos.map((p) => (p.id === salvo.id ? salvo : p))
              : [salvo, ...processos],
          );
          fecharModal();
        }}
        aoExcluir={(removido) => {
          setLista(processos.filter((p) => p.id !== removido.id));
          fecharModal();
          setApagado(removido.objeto);
        }}
      />
      <ModalConclusao
        processo={paraConcluir}
        setores={setores}
        aoFechar={() => setParaConcluir(null)}
        aoConcluir={(desfecho) => {
          if (!paraConcluir) return;
          setLista(processos.filter((p) => p.id !== paraConcluir.id));
          setConcluido({ objeto: paraConcluir.objeto, desfecho });
          setParaConcluir(null);
        }}
      />

      {/* Gaveta Lateral de Checklist (Slide-over / Drawer) */}
      <GavetaChecklistProcesso
        processo={processoChecklist}
        aberto={Boolean(processoChecklist)}
        aoFechar={fecharChecklist}
        aoAtualizarProgresso={atualizarProgressoChecklist}
      />

      {/* Aviso Suave de Tramitação com Itens Pendentes no Checklist */}
      {avisoTransicao && (
        <Modal
          aberto={Boolean(avisoTransicao)}
          aoFechar={() => setAvisoTransicao(null)}
          titulo="Checklist com Etapas Pendentes"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-950">
                  Atenção: ainda restam itens pendentes no checklist deste processo!
                </p>
                <p className="mt-1 text-amber-900 leading-relaxed">
                  O processo{' '}
                  <strong className="text-amber-950">
                    {avisoTransicao.processo.sei ? `${avisoTransicao.processo.sei} — ` : ''}
                    {avisoTransicao.processo.objeto}
                  </strong>{' '}
                  está sendo movimentado de{' '}
                  <span className="font-semibold">{avisoTransicao.processo.etapa}</span> para{' '}
                  <span className="font-semibold text-marca-700">{avisoTransicao.novaEtapa}</span>, mas ainda possui{' '}
                  <span className="font-bold underline text-amber-950">
                    {(avisoTransicao.processo.checklist_total ?? 0) -
                      (avisoTransicao.processo.checklist_concluidos ?? 0)}{' '}
                    etapa(s) pendente(s)
                  </span>{' '}
                  ({avisoTransicao.processo.checklist_concluidos ?? 0} de{' '}
                  {avisoTransicao.processo.checklist_total ?? 0} concluídas).
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Deseja abrir a gaveta lateral de checklist para conferir os passos da fase atual ou prefere tramitar o processo mesmo assim?
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <Botao
                aparencia="neutro"
                type="button"
                onClick={() => setAvisoTransicao(null)}
              >
                Cancelar
              </Botao>
              <Botao
                aparencia="neutro"
                type="button"
                icone={<ClipboardList className="size-4" />}
                onClick={() => {
                  const p = avisoTransicao.processo;
                  setAvisoTransicao(null);
                  setProcessoChecklist(p);
                }}
              >
                Conferir Checklist
              </Botao>
              <Botao
                aparencia="primario"
                type="button"
                onClick={async () => {
                  const { processo, novaEtapa } = avisoTransicao;
                  setAvisoTransicao(null);
                  await executarAjuste(processo, { etapa: novaEtapa });
                }}
              >
                Tramitar mesmo assim
              </Botao>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componentes de linha e células com edição limpa
// -----------------------------------------------------------------------------

/** Próxima etapa no fluxo sequencial comum. */
const PROXIMA_ETAPA: Record<EtapaAberta, Etapa> = {
  CSA: 'CSF',
  CSF: 'Acompanhamento',
  Acompanhamento: 'Execução/Entrega',
  'Execução/Entrega': 'AUDESP/PNCP',
  'AUDESP/PNCP': 'Concluído',
  Outros: 'Concluído',
};

function LinhaProcesso({
  processo,
  usuarios,
  aoAjustar,
  aoConcluir,
  aoEditar,
  aoAbrirChecklist,
}: {
  processo: Processo;
  usuarios: Usuario[];
  aoAjustar: (p: Processo, m: Partial<Processo>) => void;
  aoConcluir: () => void;
  aoEditar: () => void;
  aoAbrirChecklist: () => void;
}) {
  const podeEditar = usePodeEditar();
  const dias = processo.dias_para_prazo ?? null;
  const estaAtrasado = dias !== null && dias < 0;

  const celula = 'border-b border-slate-200 px-2 py-2 align-top transition-colors';
  const primeiraCelula = `${celula} ${
    estaAtrasado ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-transparent'
  }`;
  const linhaDestaque = estaAtrasado
    ? 'bg-red-50/20 hover:bg-red-50/40'
    : 'bg-white hover:bg-slate-50/80';

  return (
    <tr className={`group ${linhaDestaque}`}>
      {/* 1. SEI */}
      <td className={primeiraCelula}>
        {processo.sei ? (
          <BotaoCopiar
            texto={processo.sei}
            rotulo="Copiar número do processo"
            className="w-full font-mono text-[11.5px] font-medium text-slate-800"
          />
        ) : (
          <span className="px-1 text-slate-300">—</span>
        )}
      </td>

      {/* 2. Objeto e Setor */}
      <td className={celula}>
        <div className="space-y-1">
          <p
            className="font-semibold leading-snug text-slate-900 text-[12px] line-clamp-2"
            title={processo.objeto}
          >
            {processo.objeto}
          </p>
          {processo.setor_sigla && (
            <span
              title={processo.setor_nome ?? undefined}
              className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700 ring-1 ring-inset ring-slate-200"
            >
              {processo.setor_sigla}
            </span>
          )}
        </div>
      </td>

      {/* 3. Modalidade */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Modalidade"
          valor={processo.modalidade ?? ''}
          opcoes={MODALIDADES.map((m) => ({ valor: m, texto: m }))}
          aoMudar={(v) => aoAjustar(processo, { modalidade: (v || null) as Modalidade | null })}
          className="text-[11.5px] font-medium text-slate-700"
        />
      </td>

      {/* 4. Emenda */}
      <td className={`${celula} text-center`}>
        {podeEditar ? (
          <button
            type="button"
            onClick={() => aoAjustar(processo, { emenda: processo.emenda === 1 ? 0 : 1 })}
            title={processo.emenda === 1 ? 'Clique para remover recurso de emenda' : 'Clique para marcar como recurso de emenda'}
            className="inline-flex items-center justify-center rounded transition-transform hover:scale-105"
          >
            {processo.emenda === 1 ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Emenda
              </span>
            ) : (
              <span className="text-slate-300 hover:text-slate-500">—</span>
            )}
          </button>
        ) : processo.emenda === 1 ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Emenda
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      {/* 5. Publicações (AUDESP / PNCP unificados) */}
      <td className={celula}>
        <CelulaPublicacoes
          processo={processo}
          podeEditar={podeEditar}
          aoAjustar={aoAjustar}
        />
      </td>

      {/* 6. Status */}
      <td className={celula}>
        <TextoEditavel
          valor={processo.status}
          aoSalvar={(v) => aoAjustar(processo, { status: v })}
          className="text-[12px] text-slate-800"
        />
      </td>

      {/* 7. Prazo (separado do status com destaque visual claro) */}
      <td className={celula}>
        <CelulaPrazo
          processo={processo}
          dias={dias}
          podeEditar={podeEditar}
          aoAjustar={aoAjustar}
        />
      </td>

      {/* 8. Prioridade */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Prioridade"
          valor={processo.prioridade}
          semVazio
          opcoes={PRIORIDADES.map((p) => ({ valor: p, texto: p }))}
          aoMudar={(v) => aoAjustar(processo, { prioridade: (v || 'Baixa') as Prioridade })}
          className={`rounded-full px-2 py-0.5 text-[10.5px] uppercase ring-1 ring-inset ${COR_PRIORIDADE[processo.prioridade]}`}
        />
      </td>

      {/* 9. Responsáveis (1º e 2º unificados) */}
      <td className={celula}>
        <CelulaResponsaveis
          processo={processo}
          usuarios={usuarios}
          podeEditar={podeEditar}
          aoAjustar={aoAjustar}
        />
      </td>

      {/* 10. Ações compactas (Fixas à direita para nunca sumirem da visão do usuário) */}
      <td
        className={`${celula} text-center sticky right-0 z-10 transition-colors shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 ${
          estaAtrasado
            ? 'bg-red-50/95 group-hover:bg-red-100/90'
            : 'bg-white group-hover:bg-slate-50'
        }`}
      >
        <MenuAcoesProcesso
          processo={processo}
          podeEditar={podeEditar}
          aoAjustar={aoAjustar}
          aoConcluir={aoConcluir}
          aoEditar={aoEditar}
          aoAbrirChecklist={aoAbrirChecklist}
        />
      </td>
    </tr>
  );
}

// -----------------------------------------------------------------------------
// Componente de Responsáveis Unificado
// -----------------------------------------------------------------------------

function CelulaResponsaveis({
  processo,
  usuarios,
  podeEditar,
  aoAjustar,
}: {
  processo: Processo;
  usuarios: Usuario[];
  podeEditar: boolean;
  aoAjustar: (p: Processo, m: Partial<Processo>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const u1 = usuarios.find((u) => u.id === processo.id_responsavel);
  const u2 = usuarios.find((u) => u.id === processo.id_responsavel_2);

  const temResponsavel = Boolean(u1 || u2);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={!podeEditar}
        onClick={() => podeEditar && setAberto((a) => !a)}
        title={
          podeEditar
            ? temResponsavel
              ? 'Clique para gerenciar responsáveis'
              : 'Clique para atribuir responsável'
            : undefined
        }
        className={`group flex w-full flex-col gap-1 rounded-md p-1 text-left transition-colors ${
          podeEditar ? 'hover:bg-slate-100/80 cursor-pointer' : 'cursor-default'
        }`}
      >
        {!temResponsavel ? (
          <span className="text-slate-300 group-hover:text-slate-500">—</span>
        ) : (
          <>
            {u1 && (
              <div className="flex items-center gap-1.5" title={`Responsável: ${u1.nome}`}>
                <Avatar nome={u1.nome} tamanho="pequeno" />
                <span className="max-w-[110px] truncate text-[11px] font-medium text-slate-800">
                  {u1.nome}
                </span>
              </div>
            )}
            {u2 && (
              <div className="flex items-center gap-1.5" title={`2º Responsável: ${u2.nome}`}>
                <Avatar nome={u2.nome} tamanho="pequeno" />
                <span className="max-w-[110px] truncate text-[10.5px] text-slate-500">
                  {u2.nome}
                </span>
              </div>
            )}
          </>
        )}
      </button>

      {/* Popover flutuante para atribuir 1º e 2º responsável independentes */}
      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-800">Definir Responsáveis</span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              1º Responsável (Titular)
            </label>
            <select
              value={processo.id_responsavel ?? ''}
              onChange={(e) =>
                aoAjustar(processo, {
                  id_responsavel: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-marca-500 focus:outline-none"
            >
              <option value="">Sem responsável</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              2º Responsável (Apoio)
            </label>
            <select
              value={processo.id_responsavel_2 ?? ''}
              onChange={(e) =>
                aoAjustar(processo, {
                  id_responsavel_2: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-marca-500 focus:outline-none"
            >
              <option value="">Nenhum</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componente de Publicações (AUDESP e PNCP unificados)
// -----------------------------------------------------------------------------

function CelulaPublicacoes({
  processo,
  podeEditar,
  aoAjustar,
}: {
  processo: Processo;
  podeEditar: boolean;
  aoAjustar: (p: Processo, m: Partial<Processo>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [audesp, setAudesp] = useState(processo.audesp ?? '');
  const [pncp, setPncp] = useState(processo.pncp ?? '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAudesp(processo.audesp ?? '');
    setPncp(processo.pncp ?? '');
  }, [processo.audesp, processo.pncp]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        salvar();
      }
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
      if (e.key === 'Enter') salvar();
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto, audesp, pncp]);

  function salvar() {
    setAberto(false);
    const novoAudesp = audesp.trim() || null;
    const novoPncp = pncp.trim() || null;
    if (novoAudesp !== (processo.audesp ?? null) || novoPncp !== (processo.pncp ?? null)) {
      aoAjustar(processo, { audesp: novoAudesp, pncp: novoPncp });
    }
  }

  const temPublicacao = Boolean(processo.audesp || processo.pncp);

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => podeEditar && setAberto(true)}
        className={`group flex min-h-6 flex-col gap-1 rounded-md p-1 transition-colors ${
          podeEditar ? 'hover:bg-slate-100/80 cursor-pointer' : 'cursor-default'
        }`}
        title={podeEditar ? 'Clique para editar AUDESP / PNCP' : undefined}
      >
        {!temPublicacao ? (
          <span className="text-slate-300 group-hover:text-slate-500">—</span>
        ) : (
          <>
            {processo.audesp && (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                <span className="font-bold text-slate-500">AUDESP:</span>
                <span className="truncate">{processo.audesp}</span>
              </span>
            )}
            {processo.pncp && (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
                <span className="font-bold text-sky-600">PNCP:</span>
                <span className="truncate">{processo.pncp}</span>
              </span>
            )}
          </>
        )}
      </div>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-800">Publicações e Registros</span>
            <button
              type="button"
              onClick={salvar}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              Número AUDESP
            </label>
            <input
              type="text"
              value={audesp}
              onChange={(e) => setAudesp(e.target.value)}
              placeholder="Ex.: 46379400600012026"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-marca-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-600">
              Número PNCP
            </label>
            <input
              type="text"
              value={pncp}
              onChange={(e) => setPncp(e.target.value)}
              placeholder="Ex.: PNC.2024.00074585-59"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-marca-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              className="rounded bg-marca-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-marca-700"
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componente de Prazo com Apresentação Visual Clara
// -----------------------------------------------------------------------------

function CelulaPrazo({
  processo,
  dias,
  podeEditar,
  aoAjustar,
}: {
  processo: Processo;
  dias: number | null;
  podeEditar: boolean;
  aoAjustar: (p: Processo, m: Partial<Processo>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(processo.data_limite ?? '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(processo.data_limite ?? '');
  }, [processo.data_limite]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  function salvar(novaData: string | null) {
    setAberto(false);
    if (novaData !== (processo.data_limite ?? null)) {
      aoAjustar(processo, { data_limite: novaData });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={!podeEditar}
        onClick={() => podeEditar && setAberto((a) => !a)}
        title={podeEditar ? 'Clique para ajustar a data limite' : undefined}
        className={`group flex w-full flex-col gap-0.5 rounded-md p-1 text-left transition-colors ${
          podeEditar ? 'hover:bg-slate-100/80 cursor-pointer' : 'cursor-default'
        }`}
      >
        {processo.data_limite ? (
          <>
            <span className="font-semibold text-slate-800 text-[11.5px]">
              {dataBR(processo.data_limite)}
            </span>
            {dias !== null && (
              <span>
                {dias < 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-300">
                    <AlertTriangle className="size-3" />
                    Atrasado há {Math.abs(dias)}d
                  </span>
                ) : dias === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-300">
                    <Clock className="size-3" />
                    Vence hoje
                  </span>
                ) : dias <= 7 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                    Vence em {dias}d
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                    Faltam {dias}d
                  </span>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-300 group-hover:text-slate-500">—</span>
        )}
      </button>

      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-800">Data Limite</span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-marca-500 focus:outline-none"
          />

          <div className="flex justify-between pt-1">
            <button
              type="button"
              onClick={() => salvar(null)}
              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Remover prazo
            </button>
            <button
              type="button"
              onClick={() => salvar(data || null)}
              className="rounded bg-marca-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-marca-700"
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componente de Ações e Movimentação Contextual
// -----------------------------------------------------------------------------

function MenuAcoesProcesso({
  processo,
  podeEditar,
  aoAjustar,
  aoConcluir,
  aoEditar,
  aoAbrirChecklist,
}: {
  processo: Processo;
  podeEditar: boolean;
  aoAjustar: (p: Processo, m: Partial<Processo>) => void;
  aoConcluir: () => void;
  aoEditar: () => void;
  aoAbrirChecklist: () => void;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [posicaoMenu, setPosicaoMenu] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const alternarMenu = () => {
    if (menuAberto) {
      setMenuAberto(false);
      return;
    }
    if (!botaoRef.current) return;
    const rect = botaoRef.current.getBoundingClientRect();
    const espacoAbaixo = window.innerHeight - rect.bottom;
    const alturaEstimadaMenu = 260;

    // Se estiver muito perto do rodapé da tela, abre para cima
    if (espacoAbaixo < alturaEstimadaMenu && rect.top > alturaEstimadaMenu) {
      setPosicaoMenu({
        bottom: window.innerHeight - rect.top + 4,
        right: window.innerWidth - rect.right,
      });
    } else {
      setPosicaoMenu({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setMenuAberto(true);
  };

  useEffect(() => {
    if (!menuAberto) return;
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(alvo) &&
        botaoRef.current &&
        !botaoRef.current.contains(alvo)
      ) {
        setMenuAberto(false);
      }
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuAberto(false);
    }
    function aoRolar() {
      setMenuAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [menuAberto]);

  const proximaEtapa = PROXIMA_ETAPA[processo.etapa as EtapaAberta];

  if (!podeEditar) {
    return (
      <button
        type="button"
        onClick={aoAbrirChecklist}
        title={
          typeof processo.checklist_total === 'number' && processo.checklist_total > 0
            ? `Checklist: ${processo.checklist_concluidos ?? 0} de ${processo.checklist_total} concluídas`
            : 'Ver checklist'
        }
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
      >
        <ClipboardList className="size-3.5" />
        {typeof processo.checklist_total === 'number' && processo.checklist_total > 0 && (
          <span className="text-[11px] font-medium tabular-nums">
            {processo.checklist_concluidos ?? 0}/{processo.checklist_total}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center justify-center gap-0.5">
      {/* Botão de Avanço Rápido inequívoco */}
      {proximaEtapa && (
        <button
          type="button"
          onClick={() => {
            if (proximaEtapa === 'Concluído') aoConcluir();
            else aoAjustar(processo, { etapa: proximaEtapa });
          }}
          title={
            proximaEtapa === 'Concluído'
              ? 'Encerrar este processo'
              : `Avançar para a fase: ${proximaEtapa}`
          }
          className="rounded-md p-1 text-slate-400 hover:bg-marca-50 hover:text-marca-700 transition-colors"
        >
          {proximaEtapa === 'Concluído' ? (
            <Check className="size-3.5 text-emerald-600" />
          ) : (
            <ArrowRight className="size-3.5" />
          )}
        </button>
      )}

      {/* Botão de Checklist Sequencial com Progresso (Ideia A) */}
      <button
        type="button"
        onClick={aoAbrirChecklist}
        aria-label={`Ver checklist do processo ${processo.objeto}`}
        title={
          typeof processo.checklist_total === 'number' && processo.checklist_total > 0
            ? `Checklist: ${processo.checklist_concluidos ?? 0} de ${processo.checklist_total} etapas concluídas`
            : 'Abrir fluxo de checklist'
        }
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors ${
          (processo.checklist_total ?? 0) > 0 &&
          (processo.checklist_concluidos ?? 0) === processo.checklist_total
            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
            : (processo.checklist_concluidos ?? 0) > 0
            ? 'bg-marca-50 text-marca-700 hover:bg-marca-100 border border-marca-200/60'
            : (processo.checklist_total ?? 0) > 0
            ? 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <ClipboardList className="size-3.5 shrink-0" />
        {typeof processo.checklist_total === 'number' && processo.checklist_total > 0 ? (
          <span className="text-[10.5px] font-semibold tabular-nums">
            {processo.checklist_concluidos ?? 0}/{processo.checklist_total}
          </span>
        ) : (
          <span className="text-[10.5px] text-slate-500">Checklist</span>
        )}
      </button>

      {/* Botão de Edição Completa */}
      <button
        type="button"
        onClick={aoEditar}
        aria-label={`Editar o processo ${processo.objeto}`}
        title="Editar processo completo"
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <Pencil className="size-3.5" />
      </button>

      {/* Menu Contextual de 3 Pontos */}
      <button
        ref={botaoRef}
        type="button"
        onClick={alternarMenu}
        aria-label="Mais opções de movimentação"
        title="Mover para outra fase ou encerrar"
        className={`rounded-md p-1 transition-colors ${
          menuAberto
            ? 'bg-slate-200 text-slate-800'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        <MoreHorizontal className="size-3.5" />
      </button>

      {/* Menu suspenso renderizado no Portal (fica acima de todas as linhas e colunas sticky) */}
      {menuAberto &&
        posicaoMenu &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: posicaoMenu.top !== undefined ? `${posicaoMenu.top}px` : undefined,
              bottom: posicaoMenu.bottom !== undefined ? `${posicaoMenu.bottom}px` : undefined,
              right: `${posicaoMenu.right}px`,
            }}
            className="z-50 w-52 rounded-xl border border-slate-200 bg-white py-1.5 text-xs shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95"
          >
            <div className="px-3 py-1 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
              Mover para:
            </div>

            {ETAPAS.filter((e) => e.chave !== processo.etapa).map((e) => (
              <button
                key={e.chave}
                type="button"
                onClick={() => {
                  setMenuAberto(false);
                  aoAjustar(processo, { etapa: e.chave });
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                <span>{e.titulo}</span>
                {e.chave === proximaEtapa && (
                  <span className="text-[10px] font-semibold text-marca-600">Sugerida</span>
                )}
              </button>
            ))}

            <div className="my-1 border-t border-slate-100" />

            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                aoAbrirChecklist();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
            >
              <ClipboardList className="size-3.5 text-slate-400" />
              <span>Abrir checklist…</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                aoConcluir();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <Check className="size-3.5 text-emerald-600" />
              <span>Encerrar processo…</span>
            </button>

            <div className="my-1 border-t border-slate-100" />

            <button
              type="button"
              onClick={() => {
                setMenuAberto(false);
                aoEditar();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50"
            >
              <Pencil className="size-3.5 text-slate-400" />
              <span>Editar completo</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Encerramento do processo
// -----------------------------------------------------------------------------

function ModalConclusao({ processo, setores, aoFechar, aoConcluir }: {
  processo: Processo | null;
  setores: Setor[];
  aoFechar: () => void;
  aoConcluir: (desfecho: DesfechoProcesso) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [form, setForm] = useState<FormularioCompraEstado>(() => estadoCompraInicial());
  const [hash, setHash] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [desfecho, setDesfecho] = useState<DesfechoProcesso | ''>('');
  const [substituidoPor, setSubstituidoPor] = useState('');
  const chave = processo?.id ?? 0;
  const [chaveAnterior, setChaveAnterior] = useState(chave);
  if (chaveAnterior !== chave) {
    setChaveAnterior(chave); setArquivo(null); setForm(estadoCompraInicial()); setHash('');
    setAvisos([]); setErros({}); setFalha(null); setConferindo(false);
    setDesfecho(''); setSubstituidoPor('');
  }

  async function processar() {
    if (!arquivo) { setFalha('Selecione a Nota de Empenho em PDF.'); return; }
    setProcessando(true); setFalha(null);
    try {
      const resultado = await processarNotaEmpenho(arquivo);
      setForm(estadoCompraInicial(resultado.dados));
      setHash(resultado.hash);
      setAvisos(resultado.dados.avisos);
      setConferindo(true);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível processar o PDF.');
    } finally { setProcessando(false); }
  }

  const divergente = Boolean(
    conferindo && processo?.sei && form.numero_processo.trim() &&
    processo.sei.trim().toLocaleUpperCase('pt-BR') !== form.numero_processo.trim().toLocaleUpperCase('pt-BR'),
  );

  async function confirmar() {
    if (!processo || !arquivo) return;
    const encontrados = validarFormularioCompra(form);
    if (divergente) encontrados.numero_processo = 'O número deve corresponder ao processo atual.';
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    setConfirmando(true); setFalha(null);
    try {
      await api.processos.concluirComCompra(processo.id, {
        ...dadosDoFormulario(form), nota_nome: arquivo.name, nota_hash: hash,
      });
      aoConcluir('Concluído com compra');
    } catch (e) {
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir o processo. Nenhum dado foi alterado.');
    } finally { setConfirmando(false); }
  }

  async function confirmarSemCompra() {
    if (!processo || !desfecho || desfecho === 'Concluído com compra') return;
    if (desfecho === 'Substituído por outro processo' && !substituidoPor.trim()) {
      setFalha('Informe o número do processo que substituiu este.');
      return;
    }
    setConfirmando(true); setFalha(null);
    try {
      await api.processos.concluir(processo.id, desfecho, substituidoPor);
      aoConcluir(desfecho);
    } catch (e) {
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível encerrar o processo. Nenhum dado foi alterado.');
    } finally { setConfirmando(false); }
  }

  function escolherDesfecho(valor: string) {
    setDesfecho(valor as DesfechoProcesso | '');
    setFalha(null); setConferindo(false); setArquivo(null); setHash('');
    setAvisos([]); setErros({});
    if (valor !== 'Substituído por outro processo') setSubstituidoPor('');
  }

  return <Modal aberto={processo !== null} largura="grande" titulo="Encerrar processo"
    descricao="Escolha como o processo foi encerrado. Somente a conclusão com compra exige Nota de Empenho." aoFechar={aoFechar}
    rodape={<><Botao aparencia="neutro" onClick={aoFechar}>Cancelar</Botao>
      {desfecho === 'Concluído com compra' ? (
        conferindo ? <Botao aparencia="primario" onClick={confirmar} carregando={confirmando}>Confirmar compra e encerrar</Botao> :
          <Botao aparencia="primario" onClick={processar} carregando={processando} disabled={!arquivo}>Processar Nota de Empenho</Botao>
      ) : (
        <Botao aparencia="primario" onClick={confirmarSemCompra} carregando={confirmando}
          disabled={!desfecho || (desfecho === 'Substituído por outro processo' && !substituidoPor.trim())}>
          Confirmar encerramento
        </Botao>
      )}
    </>}>
    <div className="space-y-5">
      {falha && <AvisoErro mensagem={falha} />}
      <CampoLista rotulo="Desfecho" obrigatorio valor={desfecho} aoMudar={escolherDesfecho}
        vazio="Selecione como o processo terminou"
        opcoes={DESFECHOS_PROCESSO.map((item) => ({ valor: item, texto: item }))} />

      {desfecho === 'Substituído por outro processo' && (
        <CampoTexto rotulo="Processo substituto" obrigatorio valor={substituidoPor}
          aoMudar={(valor) => { setSubstituidoPor(valor); setFalha(null); }}
          placeholder="PMC.2026.00130127-81"
          ajuda="Informe o número do processo que passou a tratar deste assunto." />
      )}

      {desfecho && desfecho !== 'Concluído com compra' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <strong>{processo?.objeto}</strong> sairá do quadro com o desfecho <strong>{desfecho}</strong>.
          Nenhuma compra ou Nota de Empenho será criada.
        </div>
      )}

      {desfecho === 'Concluído com compra' && (!conferindo ? <div>
        <p className="mb-4 text-sm text-slate-700">Anexe a Nota de Empenho para concluir <strong>{processo?.objeto}</strong> com compra.</p>
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-marca-400 hover:bg-marca-50/40">
          <FileUp className="size-8 text-marca-600" />
          <span className="font-semibold text-slate-800">{arquivo?.name ?? 'Selecionar PDF'}</span>
          <span className="text-xs text-slate-500">PDF com texto nativo, até 5 MB. OCR não é realizado.</span>
          <input type="file" accept="application/pdf,.pdf" className="sr-only"
            onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setFalha(null); }} />
        </label>
      </div> : <>
        {avisos.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Alguns dados não puderam ser confirmados automaticamente.</p>
          <p className="mt-1">Revise: {avisos.join(', ')}.</p>
        </div>}
        {divergente && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-bold">ATENÇÃO — o processo da Nota não corresponde ao processo atual.</p>
          <p className="mt-1">Processo atual: <strong>{processo?.sei ?? 'não informado'}</strong><br />Processo identificado: <strong>{form.numero_processo || 'não identificado'}</strong></p>
        </div>}
        <FormularioCompra form={form} aoMudar={setForm} setores={setores} erros={erros} processoBloqueado />
      </>)}
    </div>
  </Modal>;
}

// -----------------------------------------------------------------------------
// Cadastro
// -----------------------------------------------------------------------------

export function ModalProcesso({
  aberto,
  processo,
  setores,
  usuarios,
  aoFechar,
  aoSalvar,
  aoExcluir,
}: {
  aberto: boolean;
  /** Presente = edição completa de um processo existente; ausente = cadastro. */
  processo: Processo | null;
  setores: Setor[];
  usuarios: Usuario[];
  aoFechar: () => void;
  aoSalvar: (p: Processo) => void;
  /** Ausente = a tela não oferece exclusão, e o botão de apagar não aparece. */
  aoExcluir?: (p: Processo) => void;
}) {
  const vazio = {
    sei: '',
    objeto: '',
    modalidade: '',
    emenda: '0',
    audesp: '',
    pncp: '',
    status: '',
    prioridade: 'Média',
    id_setor: '',
    data_limite: hojeISO(),
    etapa: ETAPAS_DO_QUADRO[0] as string,
    id_responsavel: '',
    id_responsavel_2: '',
  };

  const inicial = processo
    ? {
        sei: processo.sei ?? '',
        objeto: processo.objeto,
        modalidade: processo.modalidade ?? '',
        emenda: processo.emenda === 1 ? '1' : '0',
        audesp: processo.audesp ?? '',
        pncp: processo.pncp ?? '',
        status: processo.status ?? '',
        prioridade: processo.prioridade,
        id_setor: processo.id_setor ? String(processo.id_setor) : '',
        data_limite: processo.data_limite ?? '',
        etapa: processo.etapa,
        id_responsavel: processo.id_responsavel ? String(processo.id_responsavel) : '',
        id_responsavel_2: processo.id_responsavel_2 ? String(processo.id_responsavel_2) : '',
      }
    : vazio;

  // Quem só consulta abre esta ficha para LER: é dela que saem o AUDESP, o
  // PNCP e a anotação de status, que não cabem na linha da planilha. Os campos
  // ficam desativados e o botão de salvar some.
  const podeEditar = usePodeEditar();

  const [form, setForm] = useState(inicial);
  const [chave, setChave] = useState(processo?.id ?? 0);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Troca de processo em edição (ou volta para cadastro) recarrega o formulário.
  if (chave !== (processo?.id ?? 0)) {
    setChave(processo?.id ?? 0);
    setForm(inicial);
    setErros({});
    setFalha(null);
    setConfirmandoExclusao(false);
  }

  const mudar = (campo: keyof typeof vazio) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  async function enviar() {
    const novosErros: Record<string, string> = {};
    if (!form.objeto.trim()) novosErros.objeto = 'Informe o objeto da contratação.';
    setErros(novosErros);
    if (Object.keys(novosErros).length) return;

    setSalvando(true);
    setFalha(null);
    const dados = {
      sei: form.sei.trim() || null,
      objeto: form.objeto.trim(),
      modalidade: (form.modalidade || null) as Modalidade | null,
      emenda: (form.emenda === '1' ? 1 : 0) as 0 | 1,
      audesp: form.audesp.trim() || null,
      pncp: form.pncp.trim() || null,
      status: form.status.trim() || null,
      prioridade: form.prioridade as Prioridade,
      id_setor: form.id_setor ? Number(form.id_setor) : null,
      data_limite: form.data_limite || null,
      etapa: form.etapa as Etapa,
      id_responsavel: form.id_responsavel ? Number(form.id_responsavel) : null,
      id_responsavel_2: form.id_responsavel_2 ? Number(form.id_responsavel_2) : null,
    };
    try {
      const salvo = processo
        ? await api.processos.alterar(processo.id, dados)
        : await api.processos.criar(dados);
      if (!processo) setForm(vazio);
      aoSalvar(salvo);
    } catch (e) {
      setFalha(
        e instanceof ErroDaApi
          ? e.message
          : `Não foi possível ${processo ? 'salvar as alterações do' : 'cadastrar o'} processo.`,
      );
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!processo) return;
    setExcluindo(true);
    setFalha(null);
    try {
      await api.processos.excluir(processo.id);
      setConfirmandoExclusao(false);
      aoExcluir?.(processo);
    } catch (e) {
      setConfirmandoExclusao(false);
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível apagar o processo.');
    } finally {
      setExcluindo(false);
    }
  }

  // Fechar com a confirmação de exclusão à mostra não pode deixá-la armada:
  // reabrir a mesma ficha traria o "Sim, apagar" já na tela, sem que ninguém
  // tivesse pedido para apagar nada.
  function fechar() {
    setConfirmandoExclusao(false);
    aoFechar();
  }

  const podeApagar = podeEditar && processo !== null && aoExcluir !== undefined;

  return (
    <Modal
      aberto={aberto}
      largura="grande"
      titulo={
        !podeEditar
          ? `Processo — ${processo?.objeto ?? ''}`
          : processo
            ? `Editar processo — ${processo.objeto}`
            : 'Novo processo'
      }
      descricao={
        !podeEditar
          ? 'Todas as informações do processo. Seu acesso é somente para consulta.'
          : processo
            ? 'Altere o que for preciso e salve. O SEI continua copiável na planilha.'
            : 'Só o objeto é obrigatório. O resto pode ser completado depois, na própria linha.'
      }
      aoFechar={fechar}
      rodape={
        /* A confirmação toma o rodapé inteiro, em vez de abrir uma segunda
           janela por cima desta: a pergunta nasce onde o dedo já está, e some
           a chance de fechar a de cima achando que fechou a de baixo. */
        confirmandoExclusao ? (
          <>
            <p className="mr-auto flex items-center gap-2 text-sm font-semibold text-red-700">
              <AlertTriangle className="size-4 shrink-0" />
              Apagar de vez? Isso não tem como ser desfeito.
            </p>
            <Botao
              aparencia="neutro"
              onClick={() => setConfirmandoExclusao(false)}
              disabled={excluindo}
            >
              Voltar
            </Botao>
            <Botao
              aparencia="perigo"
              icone={<Trash2 className="size-4" />}
              onClick={apagar}
              carregando={excluindo}
            >
              Sim, apagar
            </Botao>
          </>
        ) : podeEditar ? (
          <>
            {podeApagar && (
              <Botao
                aparencia="perigo"
                icone={<Trash2 className="size-4" />}
                className="mr-auto"
                onClick={() => setConfirmandoExclusao(true)}
              >
                Apagar processo
              </Botao>
            )}
            <Botao aparencia="neutro" onClick={fechar}>
              Cancelar
            </Botao>
            <Botao aparencia="primario" onClick={enviar} carregando={salvando}>
              {processo ? 'Salvar alterações' : 'Cadastrar processo'}
            </Botao>
          </>
        ) : (
          <Botao aparencia="neutro" onClick={fechar}>
            Fechar
          </Botao>
        )
      }
    >
      {/* fieldset desativado desliga todo campo que estiver dentro, sem
          precisar repetir a mesma propriedade em cada um deles. */}
      <fieldset disabled={!podeEditar} className="min-w-0">
      <div className="space-y-4">
        {falha && <AvisoErro mensagem={falha} />}

        {/* A data de conclusão é preenchida pela API, não se digita — então
            aparece como informação, e não como campo. */}
        {processo?.etapa === 'Concluído' && (
          <div className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
            <p className="flex items-center gap-2">
              <Check className="size-4 shrink-0" />
              <strong>{processo.desfecho ?? 'Processo concluído'}</strong> em{' '}
              <strong className="font-semibold">{dataBR(processo.data_conclusao)}</strong>
            </p>
            {processo.substituido_por && (
              <p className="mt-1 pl-6">Processo substituto: <strong>{processo.substituido_por}</strong></p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo="SEI"
            valor={form.sei}
            aoMudar={mudar('sei')}
            placeholder="PMC.2026.00130127-81"
            ajuda="Número do processo no SEI."
          />
          <CampoLista
            rotulo="Modalidade"
            valor={form.modalidade}
            aoMudar={mudar('modalidade')}
            vazio="Ainda não definida"
            opcoes={MODALIDADES.map((m) => ({ valor: m, texto: m }))}
          />
        </div>

        <CampoTexto
          rotulo="Objeto"
          obrigatorio
          valor={form.objeto}
          aoMudar={mudar('objeto')}
          erro={erros.objeto}
          placeholder="Ex.: Caixas Herméticas"
          ajuda="O que está sendo contratado. É o nome do processo na planilha."
        />

        <CampoTexto
          rotulo="Status"
          valor={form.status}
          aoMudar={mudar('status')}
          placeholder="Ex.: Pesquisa de Preços até 01/09"
          ajuda="O que está sendo feito agora. Dá para reescrever a qualquer momento na linha."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoLista
            rotulo="Usa recurso de emenda?"
            valor={form.emenda}
            aoMudar={mudar('emenda')}
            vazio="Selecione"
            opcoes={[
              { valor: '0', texto: 'Não' },
              { valor: '1', texto: 'Sim' },
            ]}
          />
          <CampoLista
            rotulo="Prioridade"
            valor={form.prioridade}
            aoMudar={mudar('prioridade')}
            vazio="Selecione"
            opcoes={PRIORIDADES.map((p) => ({ valor: p, texto: p }))}
          />
          <CampoTexto
            rotulo="AUDESP"
            valor={form.audesp}
            aoMudar={mudar('audesp')}
            placeholder="Número no AUDESP"
          />
          <CampoTexto
            rotulo="PNCP"
            valor={form.pncp}
            aoMudar={mudar('pncp')}
            placeholder="Número no PNCP"
          />
          <CampoLista
            rotulo="Responsável"
            valor={form.id_responsavel}
            aoMudar={mudar('id_responsavel')}
            vazio="Definir depois"
            opcoes={usuarios.map((u) => ({ valor: u.id, texto: u.nome }))}
          />
          <CampoLista
            rotulo="2º responsável"
            valor={form.id_responsavel_2}
            aoMudar={mudar('id_responsavel_2')}
            vazio="Nenhum"
            opcoes={usuarios.map((u) => ({ valor: u.id, texto: u.nome }))}
          />
          <CampoLista
            rotulo="Setor"
            valor={form.id_setor}
            aoMudar={mudar('id_setor')}
            vazio="Sem setor"
            opcoes={opcoesDeSetor(setores)}
          />
          <CampoTexto
            rotulo="Data limite"
            tipo="date"
            valor={form.data_limite}
            aoMudar={mudar('data_limite')}
            ajuda="Aparece em vermelho quando o prazo estoura."
          />
          {/* "Concluído" só permanece disponível ao editar um registro já
              encerrado. Processos abertos usam obrigatoriamente o fluxo da
              Nota de Empenho na planilha. */}
          <CampoLista
            rotulo={processo ? 'Fase' : 'Começa em qual fase?'}
            valor={form.etapa}
            aoMudar={mudar('etapa')}
            vazio="Selecione"
            opcoes={[
              ...ETAPAS.map((e) => ({ valor: e.chave as string, texto: e.faixa })),
              ...(processo?.etapa === 'Concluído'
                ? [{ valor: 'Concluído', texto: '✓ Concluído' }]
                : []),
            ]}
            ajuda={
              processo?.etapa === 'Concluído'
                ? 'Troque a fase para devolver o processo ao quadro.'
                : undefined
            }
          />
        </div>
      </div>
      </fieldset>
    </Modal>
  );
}
