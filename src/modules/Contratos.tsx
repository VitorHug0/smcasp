// =============================================================================
//  MÓDULO 4a — Contratos
//
//  A tela espelha as duas planilhas de controle da Coordenadoria, que tratam
//  do mesmo contrato por ângulos diferentes — e por isso são duas visões aqui,
//  não duas telas:
//
//    "Vigência e renovação"  -> lista intuitiva com prazos, renovação e fiscalização
//    "Pagamentos <ano>"      -> quanto sai por mês e como está o saldo
//
//  O que liga as duas é o número do processo no SEI, exatamente como na
//  planilha. Contrato que aparece só em uma delas fica sem os campos da outra,
//  em vez de ser preenchido com zero — assim ninguém confunde "não informado"
//  com "nenhum valor".
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  ExternalLink,
  FileText,
  LayoutGrid,
  LayoutList,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { calcularPagamentos } from '../lib/pagamentos';
import { useDados } from '../hooks/useDados';
import { usePodeEditar } from '../lib/permissoes';
import { opcoesDeSetor } from '../lib/setores';
import { dataBR, moeda, paraNumero, textoPrazo, valorSimples } from '../lib/formato';
import { BotaoCopiar } from '../components/BotaoCopiar';
import { Botao } from '../components/ui/Botao';
import { Modal } from '../components/ui/Modal';
import { CampoDinheiro, CampoLista, CampoTexto } from '../components/ui/Campo';
import { ValorEditavel } from '../components/ui/CelulaEditavel';
import { Etiqueta, tomDoPrazo, type Tom } from '../components/ui/Etiqueta';
import { AvisoErro, Carregando, Falha, Vazio } from '../components/ui/Estados';
import { INTERESSES_RENOVAR, MESES_CURTOS } from '../lib/types';
import type {
  Contrato,
  InteresseRenovar,
  Pagamento,
  Setor,
  StatusContrato,
} from '../lib/types';

/** Ano do controle de pagamentos. A planilha é sempre de um ano por vez. */
const ANO_PAGAMENTOS = new Date().getFullYear();

/**
 * Cor de cada decisão de renovação. Verde/âmbar/vermelho ficam reservados para
 * prazo, então aqui a escala é outra: o que exige providência (licitar) chama
 * mais atenção que o que já está resolvido.
 */
const TOM_RENOVAR: Record<InteresseRenovar, Tom> = {
  SIM: 'verde',
  Licitar: 'ambar',
  Dispensa: 'azul',
  'Não definido': 'cinza',
};

const ROTULO_RENOVAR: Record<InteresseRenovar, string> = {
  SIM: 'Renovar',
  Licitar: 'Licitar',
  Dispensa: 'Dispensa',
  'Não definido': 'A definir',
};

/** Saldo que a planilha calcula: o que entrou menos o que ainda vai faturar. */
const saldoCalculado = (c: Contrato): number =>
  (c.empenho ?? 0) + (c.reservado ?? 0) + (c.sme ?? 0) - (c.faturas_futuras ?? 0);

function urlHttpValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type Visao = 'vigencia' | 'pagamentos';
type ModoExibicao = 'lista' | 'grade';

type ColunaOrdenacao =
  | 'fornecedor'
  | 'data_fim_vigencia'
  | 'interesse_renovar'
  | 'previsto_ano'
  | 'saldo';

// =============================================================================

export function Contratos({
  setores,
  aoMudar,
  buscaInicial = '',
}: {
  setores: Setor[];
  aoMudar: () => void;
  /** Empresa escolhida na lista da visão geral, já procurada ao abrir. */
  buscaInicial?: string;
}) {
  const podeEditar = usePodeEditar();
  const { dados, carregando, erro, recarregar } = useDados<Contrato[]>(() =>
    api.contratos.listar(),
  );
  const [visao, setVisao] = useState<Visao>('vigencia');
  const [modoExibicao, setModoExibicao] = useState<ModoExibicao>('lista');
  const [busca, setBusca] = useState(buscaInicial);
  const [renovar, setRenovar] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroPrazo, setFiltroPrazo] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<Contrato | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  // Ordenação da tabela (padrão: data de vencimento mais próxima primeiro)
  const [ordem, setOrdem] = useState<{ coluna: ColunaOrdenacao; desc: boolean }>({
    coluna: 'data_fim_vigencia',
    desc: false,
  });

  const lista = dados ?? [];

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const filtrados = lista.filter((c) => {
      const casaBusca =
        !t ||
        [c.sei, c.numero_contrato, c.fornecedor, c.objeto, c.gestor, c.fiscal, c.setor_sigla, c.setor_nome].some(
          (campo) => (campo ?? '').toLowerCase().includes(t),
        );
      const casaRenovar = !renovar || c.interesse_renovar === renovar;
      const casaStatus = !filtroStatus || c.status === filtroStatus;

      let casaPrazo = true;
      if (filtroPrazo === 'vencendo') {
        casaPrazo = c.dias_para_vencer != null && c.dias_para_vencer <= 90 && c.status === 'Vigente';
      } else if (filtroPrazo === 'licitar') {
        casaPrazo = c.interesse_renovar === 'Licitar';
      } else if (filtroPrazo === 'definir') {
        casaPrazo = c.interesse_renovar === 'Não definido';
      }

      return casaBusca && casaRenovar && casaStatus && casaPrazo;
    });

    return [...filtrados].sort((a, b) => {
      let resultado = 0;
      switch (ordem.coluna) {
        case 'fornecedor':
          resultado = (a.fornecedor || '').localeCompare(b.fornecedor || '', 'pt-BR');
          break;
        case 'data_fim_vigencia': {
          // Contratos sem data vão para o final
          const dataA = a.data_fim_vigencia || '9999-99-99';
          const dataB = b.data_fim_vigencia || '9999-99-99';
          resultado = dataA.localeCompare(dataB);
          break;
        }
        case 'interesse_renovar':
          resultado = (a.interesse_renovar || '').localeCompare(b.interesse_renovar || '', 'pt-BR');
          break;
        case 'previsto_ano':
          resultado = (a.previsto_ano ?? 0) - (b.previsto_ano ?? 0);
          break;
        case 'saldo':
          resultado = (a.saldo ?? 0) - (b.saldo ?? 0);
          break;
      }
      return ordem.desc ? -resultado : resultado;
    });
  }, [lista, busca, renovar, filtroStatus, filtroPrazo, ordem]);

  function alternarOrdem(coluna: ColunaOrdenacao) {
    setOrdem((atual) =>
      atual.coluna === coluna
        ? { coluna, desc: !atual.desc }
        : { coluna, desc: false },
    );
  }

  function alternarExpansao(id: number) {
    setExpandidos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function expandirOuRecolherTodos() {
    if (expandidos.size === filtrada.length) {
      setExpandidos(new Set());
    } else {
      setExpandidos(new Set(filtrada.map((c) => c.id)));
    }
  }

  function abrirNovo() {
    setEmEdicao(null);
    setModalAberto(true);
  }

  function abrirEdicao(c: Contrato) {
    setEmEdicao(c);
    setModalAberto(true);
  }

  async function excluir(c: Contrato) {
    if (!confirm(`Excluir o contrato de ${c.fornecedor}?`)) return;
    try {
      await api.contratos.excluir(c.id);
      recarregar();
      aoMudar();
    } catch {
      alert('Não foi possível excluir o contrato.');
    }
  }

  const temFiltroAtivo = Boolean(busca || renovar || filtroStatus || filtroPrazo);

  function limparFiltros() {
    setBusca('');
    setRenovar('');
    setFiltroStatus('');
    setFiltroPrazo(null);
  }

  if (carregando && !dados) return <Carregando texto="Carregando os contratos…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;

  return (
    <div className="space-y-4">
      {/* Alternância entre as duas visões */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs">
          <AbaVisao
            ativa={visao === 'vigencia'}
            icone={<CalendarClock className="size-4" />}
            aoClicar={() => setVisao('vigencia')}
          >
            Vigência e Gestão de Contratos
          </AbaVisao>
          <AbaVisao
            ativa={visao === 'pagamentos'}
            icone={<Coins className="size-4" />}
            aoClicar={() => setVisao('pagamentos')}
          >
            Controle de Pagamentos {ANO_PAGAMENTOS}
          </AbaVisao>
        </div>

        {visao === 'vigencia' && podeEditar && (
          <Botao aparencia="primario" icone={<Plus className="size-4" />} onClick={abrirNovo}>
            Novo contrato
          </Botao>
        )}
      </div>

      {visao === 'vigencia' && (
        <>
          {/* Cartões de Indicadores e Filtros Rápidos */}
          <ResumoVigenciaCards
            contratos={lista}
            filtroRapido={filtroPrazo}
            aoSelecionarFiltro={(filtro) => setFiltroPrazo(filtro)}
          />

          {/* Barra de Busca e Filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <div className="flex min-w-[280px] flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por empresa, SEI, nº de contrato, objeto, gestor ou fiscal…"
                  aria-label="Procurar contratos"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    title="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={renovar}
                onChange={(e) => setRenovar(e.target.value)}
                aria-label="Filtrar por interesse em renovar"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
              >
                <option value="">Todas as renovações</option>
                {INTERESSES_RENOVAR.map((i) => (
                  <option key={i} value={i}>
                    {i === 'Não definido' ? 'Renovação a definir' : `Renovação: ${i}`}
                  </option>
                ))}
              </select>

              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                aria-label="Filtrar por situação contratual"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
              >
                <option value="">Todas as situações</option>
                <option value="Vigente">Vigente</option>
                <option value="Suspenso">Suspenso</option>
                <option value="Encerrado">Encerrado</option>
              </select>

              {temFiltroAtivo && (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="size-3.5" />
                  Limpar filtros
                </button>
              )}

              {/* Alternador de exibição Lista / Grade */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setModoExibicao('lista')}
                  title="Exibir em lista tabular"
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    modoExibicao === 'lista'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutList className="size-3.5" />
                  <span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoExibicao('grade')}
                  title="Exibir em cartões"
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    modoExibicao === 'grade'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="size-3.5" />
                  <span className="hidden sm:inline">Grade</span>
                </button>
              </div>
            </div>
          </div>

          {filtrada.length === 0 ? (
            <Vazio
              titulo="Nenhum contrato encontrado"
              texto={
                temFiltroAtivo
                  ? 'Nenhum contrato corresponde aos filtros aplicados. Tente ajustar os termos de busca.'
                  : podeEditar
                    ? 'Nenhum contrato cadastrado ainda. Cadastre um novo contrato para iniciar o acompanhamento.'
                    : 'Nenhum contrato cadastrado no momento.'
              }
              acao={
                temFiltroAtivo ? (
                  <Botao aparencia="neutro" onClick={limparFiltros}>
                    Limpar filtros
                  </Botao>
                ) : podeEditar ? (
                  <Botao aparencia="primario" icone={<Plus className="size-4" />} onClick={abrirNovo}>
                    Novo contrato
                  </Botao>
                ) : undefined
              }
            />
          ) : modoExibicao === 'lista' ? (
            <TabelaContratos
              contratos={filtrada}
              setores={setores}
              ordem={ordem}
              aoOrdenar={alternarOrdem}
              expandidos={expandidos}
              aoAlternarExpansao={alternarExpansao}
              aoExpandirTodos={expandirOuRecolherTodos}
              aoSalvarPrevisao={recarregar}
              aoEditar={abrirEdicao}
              aoExcluir={excluir}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {filtrada.map((c) => (
                <CartaoContrato
                  key={c.id}
                  contrato={c}
                  aoSalvarPrevisao={recarregar}
                  aoEditar={() => abrirEdicao(c)}
                  aoExcluir={() => excluir(c)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {visao === 'pagamentos' && (
        <PlanilhaPagamentos
          contratos={filtrada}
          aoMudarContrato={(atualizado) => {
            recarregar();
            return atualizado;
          }}
        />
      )}

      <ModalContrato
        aberto={modalAberto}
        contrato={emEdicao}
        setores={setores}
        aoFechar={() => setModalAberto(false)}
        aoSalvar={() => {
          setModalAberto(false);
          recarregar();
          aoMudar();
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------

function AbaVisao({
  ativa,
  icone,
  children,
  aoClicar,
}: {
  ativa: boolean;
  icone: React.ReactNode;
  children: React.ReactNode;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-current={ativa ? 'page' : undefined}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold
        transition-colors ${
          ativa
            ? 'bg-marca-600 text-white shadow-xs'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
    >
      {icone}
      {children}
    </button>
  );
}

/** Quatro cartões modernos no topo que resumem a situação e servem de filtros rápidos. */
function ResumoVigenciaCards({
  contratos,
  filtroRapido,
  aoSelecionarFiltro,
}: {
  contratos: Contrato[];
  filtroRapido: string | null;
  aoSelecionarFiltro: (filtro: string | null) => void;
}) {
  const total = contratos.length;
  const vencendo = contratos.filter(
    (c) => c.dias_para_vencer != null && c.dias_para_vencer <= 90 && c.status === 'Vigente',
  ).length;
  const aLicitar = contratos.filter((c) => c.interesse_renovar === 'Licitar').length;
  const aDefinir = contratos.filter((c) => c.interesse_renovar === 'Não definido').length;
  const totalPrevisto = contratos.reduce((acc, c) => acc + (c.previsto_ano ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(null)}
        title="Ver todos os contratos"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-marca-400 hover:shadow-sm ${
          filtroRapido === null ? 'border-marca-500/50 ring-2 ring-marca-500/10' : 'border-slate-200'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total de Contratos
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{total}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalPrevisto > 0 ? `Previsto: ${moeda(totalPrevisto)}` : 'Cadastrados no sistema'}
          </p>
        </div>
        <div className="rounded-lg bg-marca-50 p-2.5 text-marca-600 ring-1 ring-marca-200/60">
          <FileText className="size-5" />
        </div>
      </button>

      {/* Vencendo em 90 dias */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(filtroRapido === 'vencendo' ? null : 'vencendo')}
        title="Filtrar contratos vencendo em até 90 dias"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-red-400 hover:shadow-sm ${
          filtroRapido === 'vencendo'
            ? 'border-red-500 bg-red-50/30 ring-2 ring-red-500/20'
            : 'border-slate-200'
        }`}
      >
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Vencendo em até 90 dias
            </p>
            {vencendo > 0 && (
              <span className="inline-flex size-2 rounded-full bg-red-500" />
            )}
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight text-red-600">{vencendo}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {vencendo > 0 ? 'Requerem providência imediata' : 'Nenhum contrato no prazo crítico'}
          </p>
        </div>
        <div className={`rounded-lg p-2.5 ring-1 ${vencendo > 0 ? 'bg-red-50 text-red-600 ring-red-200' : 'bg-slate-50 text-slate-400 ring-slate-200'}`}>
          <AlertTriangle className="size-5" />
        </div>
      </button>

      {/* A Licitar */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(filtroRapido === 'licitar' ? null : 'licitar')}
        title="Filtrar contratos com interesse em licitar"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-amber-400 hover:shadow-sm ${
          filtroRapido === 'licitar'
            ? 'border-amber-500 bg-amber-50/30 ring-2 ring-amber-500/20'
            : 'border-slate-200'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Para Licitar
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-amber-700">{aLicitar}</p>
          <p className="mt-0.5 text-xs text-slate-500">Nova contratação necessária</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 ring-1 ring-amber-200">
          <RefreshCw className="size-5" />
        </div>
      </button>

      {/* A Definir */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(filtroRapido === 'definir' ? null : 'definir')}
        title="Filtrar contratos com renovação a definir"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-slate-400 hover:shadow-sm ${
          filtroRapido === 'definir'
            ? 'border-slate-600 bg-slate-50/70 ring-2 ring-slate-600/20'
            : 'border-slate-200'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Renovação a Definir
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-800">{aDefinir}</p>
          <p className="mt-0.5 text-xs text-slate-500">Decisão pendente</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600 ring-1 ring-slate-200">
          <Clock className="size-5" />
        </div>
      </button>
    </div>
  );
}

// =============================================================================
//  NOVO: Componente de Lista Tabular de Contratos
// =============================================================================

function TabelaContratos({
  contratos,
  setores,
  ordem,
  aoOrdenar,
  expandidos,
  aoAlternarExpansao,
  aoExpandirTodos,
  aoSalvarPrevisao,
  aoEditar,
  aoExcluir,
}: {
  contratos: Contrato[];
  setores: Setor[];
  ordem: { coluna: ColunaOrdenacao; desc: boolean };
  aoOrdenar: (coluna: ColunaOrdenacao) => void;
  expandidos: Set<number>;
  aoAlternarExpansao: (id: number) => void;
  aoExpandirTodos: () => void;
  aoSalvarPrevisao: () => void;
  aoEditar: (c: Contrato) => void;
  aoExcluir: (c: Contrato) => void;
}) {
  const podeEditar = usePodeEditar();
  const mapaSetores = useMemo(() => new Map(setores.map((s) => [s.id, s])), [setores]);

  const todosExpandidos = contratos.length > 0 && expandidos.size === contratos.length;

  // Totalizadores da tabela exibida
  const totalPrevisto = contratos.reduce((acc, c) => acc + (c.previsto_ano ?? 0), 0);
  const totalSaldo = contratos.reduce((acc, c) => acc + (c.saldo ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[28%]" />
            <col className="w-[17%]" />
            <col className="w-[14%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th className="px-2 py-3 text-center">
                <button
                  type="button"
                  onClick={aoExpandirTodos}
                  title={todosExpandidos ? 'Recolher todas as linhas' : 'Expandir todas as linhas'}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  {todosExpandidos ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </button>
              </th>

              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => aoOrdenar('fornecedor')}
                  className="inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Empresa / Contrato
                  <IconeOrdenacao ativa={ordem.coluna === 'fornecedor'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3">
                Objeto / SEI
              </th>

              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => aoOrdenar('data_fim_vigencia')}
                  className="inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Término / Prazo
                  <IconeOrdenacao ativa={ordem.coluna === 'data_fim_vigencia'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => aoOrdenar('interesse_renovar')}
                  className="inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Renovação
                  <IconeOrdenacao ativa={ordem.coluna === 'interesse_renovar'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => aoOrdenar('previsto_ano')}
                  className="ml-auto inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Previsto {ANO_PAGAMENTOS}
                  <IconeOrdenacao ativa={ordem.coluna === 'previsto_ano'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => aoOrdenar('saldo')}
                  className="ml-auto inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Saldo Atual
                  <IconeOrdenacao ativa={ordem.coluna === 'saldo'} desc={ordem.desc} />
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {contratos.map((c) => {
              const expandido = expandidos.has(c.id);
              const dias = c.dias_para_vencer ?? null;
              const encerrado = c.status !== 'Vigente';
              const divergeSaldo = Math.abs(saldoCalculado(c) - (c.saldo ?? 0)) > 0.01;
              const setorObj = c.id_setor ? mapaSetores.get(c.id_setor) : null;
              const rotuloSetor = setorObj
                ? setorObj.sigla === setorObj.nome
                  ? setorObj.nome
                  : `${setorObj.sigla} — ${setorObj.nome}`
                : c.setor_sigla || 'Não informado';

              return (
                <LinhaItemContrato
                  key={c.id}
                  contrato={c}
                  expandido={expandido}
                  dias={dias}
                  encerrado={encerrado}
                  divergeSaldo={divergeSaldo}
                  rotuloSetor={rotuloSetor}
                  podeEditar={podeEditar}
                  aoAlternarExpansao={() => aoAlternarExpansao(c.id)}
                  aoSalvarPrevisao={aoSalvarPrevisao}
                  aoEditar={() => aoEditar(c)}
                  aoExcluir={() => aoExcluir(c)}
                />
              );
            })}
          </tbody>

          {/* Rodapé com totais da lista */}
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
            <tr>
              <td className="px-2 py-3 text-center" />
              <td className="px-3 py-3 text-xs uppercase tracking-wider text-slate-600" colSpan={4}>
                Total de {contratos.length} {contratos.length === 1 ? 'contrato listado' : 'contratos listados'}
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-slate-900">
                {moeda(totalPrevisto)}
              </td>
              <td
                className={`px-3 py-3 text-right font-mono text-sm tabular-nums ${
                  totalSaldo < 0 ? 'text-red-700' : 'text-emerald-700'
                }`}
              >
                {moeda(totalSaldo)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LinhaItemContrato({
  contrato,
  expandido,
  dias,
  encerrado,
  divergeSaldo,
  rotuloSetor,
  podeEditar,
  aoAlternarExpansao,
  aoSalvarPrevisao,
  aoEditar,
  aoExcluir,
}: {
  contrato: Contrato;
  expandido: boolean;
  dias: number | null;
  encerrado: boolean;
  divergeSaldo: boolean;
  rotuloSetor: string;
  podeEditar: boolean;
  aoAlternarExpansao: () => void;
  aoSalvarPrevisao: () => void;
  aoEditar: () => void;
  aoExcluir: () => void;
}) {
  return (
    <>
      <tr
        onClick={aoAlternarExpansao}
        className={`group cursor-pointer transition-colors ${
          expandido ? 'bg-blue-50/40' : 'hover:bg-slate-50/80'
        }`}
      >
        {/* Botão de Expansão */}
        <td className="px-2 py-3 text-center align-top">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              aoAlternarExpansao();
            }}
            aria-label={expandido ? 'Recolher detalhes' : 'Expandir detalhes'}
            className="rounded p-1 text-slate-400 transition-transform hover:bg-slate-200 hover:text-slate-700 group-hover:text-slate-600"
          >
            <ChevronDown
              className={`size-4 transition-transform duration-200 ${
                expandido ? 'rotate-180 text-marca-600' : ''
              }`}
            />
          </button>
        </td>

        {/* Empresa & Identificação */}
        <td className="px-3 py-3 align-top">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-slate-900 group-hover:text-marca-700">
              {contrato.fornecedor}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {contrato.numero_contrato ? (
              <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                Contrato {contrato.numero_contrato}
              </span>
            ) : (
              <span className="text-slate-400">Sem nº</span>
            )}

            {contrato.status !== 'Vigente' && (
              <Etiqueta tom="cinza">{contrato.status}</Etiqueta>
            )}

            {contrato.document_url && (
              <a
                href={contrato.document_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Abrir documento original do contrato"
                className="inline-flex items-center gap-1 font-semibold text-marca-600 hover:text-marca-800 hover:underline"
              >
                <ExternalLink className="size-3" />
                Doc
              </a>
            )}
          </div>
        </td>

        {/* Objeto / SEI */}
        <td className="px-3 py-3 align-top">
          {contrato.sei ? (
            <div onClick={(e) => e.stopPropagation()}>
              <BotaoCopiar
                texto={contrato.sei}
                className="-ml-1 font-mono text-xs text-slate-600"
              />
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}

          {contrato.objeto && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={contrato.objeto}>
              {contrato.objeto}
            </p>
          )}
        </td>

        {/* Término / Prazo */}
        <td className="px-3 py-3 align-top">
          <p className="font-semibold text-slate-900">{dataBR(contrato.data_fim_vigencia)}</p>
          <div className="mt-1">
            {contrato.data_fim_vigencia ? (
              <Etiqueta tom={encerrado ? 'cinza' : tomDoPrazo(dias)}>
                {textoPrazo(dias)}
              </Etiqueta>
            ) : (
              <span className="text-xs text-slate-400">Não informado</span>
            )}
          </div>
        </td>

        {/* Renovação */}
        <td className="px-3 py-3 align-top">
          <Etiqueta tom={TOM_RENOVAR[contrato.interesse_renovar]}>
            {ROTULO_RENOVAR[contrato.interesse_renovar]}
          </Etiqueta>
          {(contrato.gestor || contrato.fiscal) && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500" title={`Gestor: ${contrato.gestor || '—'} · Fiscal: ${contrato.fiscal || '—'}`}>
              <UserCheck className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{contrato.gestor || contrato.fiscal}</span>
            </p>
          )}
        </td>

        {/* Previsto no Ano */}
        <td className="px-3 py-3 text-right align-top">
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-800">
            {contrato.previsto_ano != null ? moeda(contrato.previsto_ano) : '—'}
          </span>
          {contrato.previsto_ano != null && (
            <p className="text-[11px] text-slate-500">
              ~{moeda(contrato.previsto_ano / 12)}/mês
            </p>
          )}
        </td>

        {/* Saldo */}
        <td className="px-3 py-3 text-right align-top">
          <div className="flex items-center justify-end gap-1">
            <span
              className={`font-mono text-sm font-bold tabular-nums ${
                contrato.saldo < 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              {moeda(contrato.saldo)}
            </span>
            {divergeSaldo && (
              <span
                title={`Aviso: a planilha traz ${moeda(contrato.saldo)}, mas a soma empenho + reservado + SME − faturas dá ${moeda(saldoCalculado(contrato))}.`}
                className="text-amber-500"
              >
                <AlertTriangle className="size-3.5" />
              </span>
            )}
          </div>

          <div
            className="mt-1 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {podeEditar && (
              <>
                <button
                  type="button"
                  onClick={aoEditar}
                  title="Editar dados do contrato"
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={aoExcluir}
                  title="Excluir contrato"
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Linha de Detalhes Expansível */}
      {expandido && (
        <tr className="border-b-2 border-slate-200 bg-slate-50/70">
          <td colSpan={7} className="px-5 py-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    {contrato.fornecedor}
                    {contrato.numero_contrato && (
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        (Contrato {contrato.numero_contrato})
                      </span>
                    )}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Processo SEI: {contrato.sei || 'Não informado'} · Situação: {contrato.status}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {contrato.document_url && (
                    <a
                      href={contrato.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-marca-700 hover:bg-slate-50 hover:text-marca-900"
                    >
                      <ExternalLink className="size-3.5" />
                      Documento Oficial ↗
                    </a>
                  )}
                  {podeEditar && (
                    <Botao aparencia="neutro" className="!px-3 !py-1.5 !text-xs" icone={<Pencil className="size-3.5" />} onClick={aoEditar}>
                      Editar ficha
                    </Botao>
                  )}
                </div>
              </div>

              {/* 3 Colunas de Dados Detalhados */}
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
                {/* 1. Vigência e Ajustes */}
                <div className="space-y-2 rounded-lg bg-slate-50/70 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Vigência e Prazos
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <Dado rotulo="1º Contrato">{dataBR(contrato.data_inicio)}</Dado>
                    <Dado rotulo="Término">{dataBR(contrato.data_fim_vigencia)}</Dado>
                    <Dado rotulo="Duração">{contrato.duracao || '—'}</Dado>
                    <Dado rotulo="Reajuste">{dataBR(contrato.data_base_reajuste)}</Dado>
                    <Dado rotulo="Último ajuste">{contrato.numero_ultimo_ajuste || '—'}</Dado>
                    <Dado rotulo="Prazo restante">
                      <span className="font-semibold text-slate-800">{textoPrazo(dias)}</span>
                    </Dado>
                  </dl>
                </div>

                {/* 2. Gestão e Setor */}
                <div className="space-y-2 rounded-lg bg-slate-50/70 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Responsáveis e Setor
                  </p>
                  <dl className="space-y-1.5 text-xs">
                    <Dado rotulo="Gestor">{contrato.gestor || 'Não informado'}</Dado>
                    <Dado rotulo="Fiscal">{contrato.fiscal || 'Não informado'}</Dado>
                    <Dado rotulo="Setor">{rotuloSetor}</Dado>
                    {contrato.objeto && (
                      <div>
                        <dt className="text-[11px] text-slate-500">Objeto</dt>
                        <dd className="mt-0.5 text-slate-800">{contrato.objeto}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* 3. Controle Financeiro */}
                <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3.5">
                  <PrevisaoContrato contrato={contrato} aoSalvar={aoSalvarPrevisao} />

                  <dl className="space-y-1 border-t border-blue-200/60 pt-2 text-xs">
                    <LinhaValor rotulo={`Total lançado em ${ANO_PAGAMENTOS}`} valor={contrato.total_lancado_ano ?? 0} />
                    <LinhaValor rotulo="Empenho" valor={contrato.empenho} />
                    <LinhaValor rotulo="Reservado" valor={contrato.reservado} />
                    <LinhaValor rotulo="SME" valor={contrato.sme} />
                    <LinhaValor
                      rotulo="Saldo"
                      valor={contrato.saldo}
                      tom={contrato.saldo < 0 ? 'text-red-700' : 'text-emerald-700 font-bold'}
                      aviso={
                        divergeSaldo
                          ? `A planilha traz ${moeda(contrato.saldo)}; o cálculo empenho + reservado + SME − faturas dá ${moeda(saldoCalculado(contrato))}.`
                          : undefined
                      }
                    />
                  </dl>
                </div>
              </div>

              {podeEditar && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <button
                    type="button"
                    onClick={aoExcluir}
                    className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-800 hover:underline"
                  >
                    <Trash2 className="size-3.5" />
                    Excluir este contrato
                  </button>
                  <button
                    type="button"
                    onClick={aoAlternarExpansao}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Fechar detalhes
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function IconeOrdenacao({ ativa, desc }: { ativa: boolean; desc: boolean }) {
  if (!ativa) {
    return <span className="opacity-30">↕</span>;
  }
  return desc ? <ArrowDown className="size-3 text-marca-600" /> : <ArrowUp className="size-3 text-marca-600" />;
}

// -----------------------------------------------------------------------------

function CartaoContrato({
  contrato,
  aoSalvarPrevisao,
  aoEditar,
  aoExcluir,
}: {
  contrato: Contrato;
  aoSalvarPrevisao: () => void;
  aoEditar: () => void;
  aoExcluir: () => void;
}) {
  const podeEditar = usePodeEditar();
  const dias = contrato.dias_para_vencer ?? null;
  const encerrado = contrato.status !== 'Vigente';
  const previsto = contrato.previsto_ano ?? 0;
  const divergeSaldo = Math.abs(saldoCalculado(contrato) - (contrato.saldo ?? 0)) > 0.01;

  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Etiqueta tom={TOM_RENOVAR[contrato.interesse_renovar]}>
              {ROTULO_RENOVAR[contrato.interesse_renovar]}
            </Etiqueta>
            {contrato.numero_contrato ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Contrato {contrato.numero_contrato}
              </span>
            ) : (
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Sem número de contrato
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-base font-bold text-slate-900">
            {contrato.fornecedor}
          </h3>
          {contrato.objeto && (
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{contrato.objeto}</p>
          )}
        </div>
        {podeEditar && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={aoEditar}
              aria-label={`Editar o contrato de ${contrato.fornecedor}`}
              title="Editar o contrato por completo"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={aoExcluir}
              aria-label={`Excluir o contrato de ${contrato.fornecedor}`}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* SEI copiável: é por ele que se pesquisa no sistema da Prefeitura */}
      {contrato.sei && (
        <div className="mt-3">
          <BotaoCopiar texto={contrato.sei} />
        </div>
      )}

      {contrato.document_url && (
        <a
          href={contrato.document_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-marca-700 hover:text-marca-900 hover:underline"
        >
          <ExternalLink className="size-4" />
          Abrir contrato ↗
        </a>
      )}

      {/* Vigência */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Dado rotulo="Término">
          <span className="font-semibold text-slate-900">{dataBR(contrato.data_fim_vigencia)}</span>
        </Dado>
        <Dado rotulo="Vigência restante">
          {contrato.data_fim_vigencia ? (
            <Etiqueta tom={encerrado ? 'cinza' : tomDoPrazo(dias)}>{textoPrazo(dias)}</Etiqueta>
          ) : (
            <span className="text-slate-400">Não informada</span>
          )}
        </Dado>
        <Dado rotulo="Data do 1º contrato">{dataBR(contrato.data_inicio)}</Dado>
        <Dado rotulo="Duração">{contrato.duracao || '—'}</Dado>
        <Dado rotulo="Data-base de reajuste">{dataBR(contrato.data_base_reajuste)}</Dado>
        <Dado rotulo="Nº do último ajuste">{contrato.numero_ultimo_ajuste || '—'}</Dado>
      </dl>

      {/* Gestor e fiscal */}
      {(contrato.gestor || contrato.fiscal) && (
        <div className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
          {contrato.gestor && (
            <p className="flex items-start gap-2">
              <UserCheck className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span>
                <span className="text-slate-500">Gestor: </span>
                <span className="font-medium text-slate-800">{contrato.gestor}</span>
              </span>
            </p>
          )}
          {contrato.fiscal && (
            <p className="flex items-start gap-2">
              <UserCheck className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span>
                <span className="text-slate-500">Fiscal: </span>
                <span className="font-medium text-slate-800">{contrato.fiscal}</span>
              </span>
            </p>
          )}
        </div>
      )}

      {/* Números do controle de pagamentos */}
      <div className="mt-auto pt-3">
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <PrevisaoContrato contrato={contrato} aoSalvar={aoSalvarPrevisao} />
        </div>
        {previsto > 0 || contrato.empenho > 0 || contrato.saldo !== 0 ? (
          <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            <LinhaValor rotulo={`Total lançado em ${ANO_PAGAMENTOS}`} valor={contrato.total_lancado_ano ?? 0} />
            <LinhaValor rotulo="Empenhado" valor={contrato.empenho} />
            <LinhaValor
              rotulo="Saldo"
              valor={contrato.saldo}
              tom={contrato.saldo < 0 ? 'text-red-700' : 'text-emerald-700'}
              aviso={
                divergeSaldo
                  ? `A planilha traz ${moeda(contrato.saldo)}; empenho + reservado + SME − faturas futuras dá ${moeda(saldoCalculado(contrato))}.`
                  : undefined
              }
            />
          </dl>
        ) : (
          <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
            Sem valores lançados no controle de pagamentos de {ANO_PAGAMENTOS}.
          </p>
        )}
      </div>
    </li>
  );
}

function PrevisaoContrato({ contrato, aoSalvar }: { contrato: Contrato; aoSalvar: () => void }) {
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const podeEditar = usePodeEditar();
  const previsto = contrato.previsto_ano ?? null;

  async function salvar(valor: number | null) {
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      setFalha('Informe um valor previsto maior ou igual a zero.');
      return;
    }
    setSalvando(true);
    setFalha(null);
    try {
      await api.previsoes.salvar(contrato.id, ANO_PAGAMENTOS, valor);
      aoSalvar();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível salvar a previsão.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-600">Previsto para {ANO_PAGAMENTOS}</p>
          <fieldset disabled={salvando} aria-label={`Previsão anual de ${contrato.fornecedor}`}>
            <ValorEditavel valor={previsto} aoSalvar={salvar} comMoeda destaque />
          </fieldset>
          <p className="text-[10px] text-slate-500">
            {salvando ? 'Salvando…' : podeEditar ? 'Clique no valor para alterar' : 'Valor informado'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600">Estimativa mensal</p>
          <p className="py-1 font-semibold tabular-nums text-blue-800">
            {previsto === null ? '—' : moeda(previsto / 12)}
          </p>
          <p className="text-[10px] text-slate-500">Média mensal de referência</p>
        </div>
      </div>
      {falha && <p role="alert" className="mt-2 text-xs text-red-700">{falha}</p>}
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/** Rótulo à esquerda, valor em reais à direita — sem risco de colisão. */
function LinhaValor({
  rotulo,
  valor,
  tom = 'text-slate-900',
  aviso,
}: {
  rotulo: string;
  valor: number;
  tom?: string;
  /** Quando presente, mostra o triângulo de atenção com esta explicação. */
  aviso?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1 text-slate-500">
        {rotulo}
        {aviso && (
          <span title={aviso}>
            <AlertTriangle className="size-3 text-amber-600" />
          </span>
        )}
      </dt>
      <dd className={`font-semibold tabular-nums ${tom}`}>{moeda(valor)}</dd>
    </div>
  );
}

// =============================================================================
//  Visão 2 — planilha de pagamentos, com os doze meses editáveis na linha
// =============================================================================

/** Índice: id do contrato -> mês (1-12) -> lançamento daquele mês. */
type PorMes = Map<number, Map<number, Pagamento>>;

function PlanilhaPagamentos({
  contratos,
  aoMudarContrato,
}: {
  contratos: Contrato[];
  aoMudarContrato: (c: Contrato) => Contrato;
}) {
  const [porMes, setPorMes] = useState<PorMes | null>(null);
  const [locais, setLocais] = useState<Contrato[]>(contratos);
  const [falha, setFalha] = useState<string | null>(null);
  const tabelaRef = useRef<HTMLDivElement>(null);
  const mesesRef = useRef<(HTMLTableCellElement | null)[]>([]);
  const destinoMesRef = useRef<{ indice: number; esquerda: number } | null>(null);
  const [mesAtivo, setMesAtivo] = useState(0);
  const [topoPlanilha, setTopoPlanilha] = useState(0);
  const carregandoPlanilha = !porMes && !falha;

  useEffect(() => {
    const tabela = tabelaRef.current;
    if (!tabela) return;
    let ultimaEsquerda = -1;

    const atualizarMes = () => {
      const inicio = tabela.getBoundingClientRect().left + tabela.clientLeft + 380;
      let ativo = 0;
      mesesRef.current.forEach((mes, i) => {
        if (mes && mes.getBoundingClientRect().left <= inicio + 1) ativo = i;
      });
      if (tabela.scrollLeft > 0 && tabela.scrollLeft >= tabela.scrollWidth - tabela.clientWidth - 1) {
        ativo = MESES_CURTOS.length - 1;
      }
      setMesAtivo(ativo);
    };

    const sincronizarTabela = () => {
      const destino = destinoMesRef.current;
      if (destino && Math.abs(tabela.scrollLeft - destino.esquerda) <= 1) {
        setMesAtivo(destino.indice);
        destinoMesRef.current = null;
      } else if (tabela.scrollLeft !== ultimaEsquerda) {
        atualizarMes();
      }
      ultimaEsquerda = tabela.scrollLeft;
    };

    const medir = () => {
      setTopoPlanilha(cabecalhoPagina?.getBoundingClientRect().height ?? 0);
      sincronizarTabela();
    };

    const cabecalhoPagina = tabela.closest('main')?.previousElementSibling;
    const observador = new ResizeObserver(medir);
    observador.observe(tabela);
    if (cabecalhoPagina) observador.observe(cabecalhoPagina);
    if (tabela.firstElementChild) observador.observe(tabela.firstElementChild);
    tabela.addEventListener('scroll', sincronizarTabela, { passive: true });
    medir();

    return () => {
      observador.disconnect();
      tabela.removeEventListener('scroll', sincronizarTabela);
    };
  }, [carregandoPlanilha]);

  function irParaMes(indice: number) {
    const tabela = tabelaRef.current;
    const mes = mesesRef.current[indice];
    if (!tabela || !mes) return;
    const esquerda = Math.max(
      0,
      Math.min(
        tabela.scrollWidth - tabela.clientWidth,
        tabela.scrollLeft +
          mes.getBoundingClientRect().left -
          tabela.getBoundingClientRect().left -
          tabela.clientLeft -
          380,
      ),
    );
    destinoMesRef.current = { indice, esquerda };
    setMesAtivo(indice);
    tabela.scrollTo({
      left: esquerda,
      behavior: 'smooth',
    });
  }

  useEffect(() => setLocais(contratos), [contratos]);

  useEffect(() => {
    let ativo = true;
    api.pagamentos
      .listar(ANO_PAGAMENTOS)
      .then((linhas) => {
        if (!ativo) return;
        const mapa: PorMes = new Map();
        for (const p of linhas) {
          if (!mapa.has(p.id_contrato)) mapa.set(p.id_contrato, new Map());
          mapa.get(p.id_contrato)!.set(p.mes, p);
        }
        setPorMes(mapa);
      })
      .catch((e) =>
        setFalha(
          e instanceof ErroDaApi ? e.message : 'Não foi possível carregar os pagamentos do ano.',
        ),
      );
    return () => {
      ativo = false;
    };
  }, []);

  async function salvarMes(contrato: Contrato, mes: number, valor: number | null) {
    const existente = porMes?.get(contrato.id)?.get(mes);
    const anterior = porMes;
    setPorMes((atual) => {
      const copia: PorMes = new Map(atual ?? []);
      const doContrato = new Map(copia.get(contrato.id) ?? []);
      if (existente) doContrato.set(mes, { ...existente, valor });
      else doContrato.set(mes, { id: -mes, id_contrato: contrato.id, ano: ANO_PAGAMENTOS, mes, valor });
      copia.set(contrato.id, doContrato);
      return copia;
    });

    try {
      const salvo =
        existente && existente.id > 0
          ? await api.pagamentos.ajustar(existente.id, { valor })
          : await api.pagamentos.criar({
              id_contrato: contrato.id,
              ano: ANO_PAGAMENTOS,
              mes,
              valor,
            });
      setPorMes((atual) => {
        const copia: PorMes = new Map(atual ?? []);
        const doContrato = new Map(copia.get(contrato.id) ?? []);
        doContrato.set(mes, salvo);
        copia.set(contrato.id, doContrato);
        return copia;
      });
      aoMudarContrato(contrato);
      setFalha(null);
    } catch (e) {
      setPorMes(anterior);
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível gravar o valor do mês.');
    }
  }

  async function salvarCampo(contrato: Contrato, campo: keyof Contrato, valor: number | null) {
    const anterior = locais;
    setLocais((atual) =>
      atual.map((c) => (c.id === contrato.id ? { ...c, [campo]: valor ?? 0 } : c)),
    );
    try {
      const salvo = await api.contratos.ajustar(contrato.id, { [campo]: valor ?? 0 });
      setLocais((atual) => atual.map((c) => (c.id === contrato.id ? salvo : c)));
      aoMudarContrato(salvo);
      setFalha(null);
    } catch (e) {
      setLocais(anterior);
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível gravar o valor.');
    }
  }

  if (!porMes && !falha) return <Carregando texto="Carregando o controle de pagamentos…" />;

  const totalDoContrato = (c: Contrato): number => {
    const meses = porMes?.get(c.id);
    if (!meses) return 0;
    let soma = 0;
    for (const p of meses.values()) soma += p.valor ?? 0;
    return soma;
  };

  const ordenados = locais.map((c) => ({
    ...c,
    ...calcularPagamentos(c.previsto_ano ?? 0, totalDoContrato(c), c.empenho, c.reservado, c.sme),
  }));

  const somaMes = (mes: number): number =>
    ordenados.reduce((t, c) => t + (porMes?.get(c.id)?.get(mes)?.valor ?? 0), 0);
  const somaCampo = (campo: 'faturas_futuras' | 'empenho' | 'reservado' | 'sme' | 'saldo'): number =>
    ordenados.reduce((t, c) => t + (c[campo] ?? 0), 0);

  return (
    <div className="space-y-3">
      {falha && <AvisoErro mensagem={falha} />}
      <details className="rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer list-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
          <strong className="text-slate-900">{ordenados.length}</strong>{' '}
          {ordenados.length === 1 ? 'contrato' : 'contratos'} · Pagamentos {ANO_PAGAMENTOS} ·{' '}
          <span className="font-medium text-blue-700">ⓘ Como funciona</span>
        </summary>
        <p className="mt-2">
          Informe a previsão anual na aba de Vigência e renovação. Preencha os meses com os valores
          de cada período, Empenho, Reservado e SME. As colunas azuis são calculadas automaticamente.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Total lançado = soma dos meses · Faturas futuras = Previsto para o ano − Total lançado ·
          Saldo = Empenho + Reservado + SME − Faturas futuras.
        </p>
      </details>

      <div
        className="sticky isolate flex flex-col rounded-xl border border-slate-200 bg-white shadow-xs"
        style={{ top: topoPlanilha, maxHeight: `calc(100dvh - ${topoPlanilha + 16}px)` }}
      >
        <nav aria-label="Navegar pelos meses de pagamentos" className="z-30 flex shrink-0 flex-wrap gap-0.5 rounded-t-xl border-b border-slate-200 bg-white px-2 py-1.5">
          {MESES_CURTOS.map((mes, i) => (
            <button
              key={mes}
              type="button"
              aria-pressed={mesAtivo === i}
              onClick={() => irParaMes(i)}
              className={`rounded px-2 py-1 text-[11px] font-medium uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
                mesAtivo === i
                  ? 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              {mes}
            </button>
          ))}
        </nav>

        <div
          ref={tabelaRef}
          className="min-h-0 max-h-[60dvh] overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          tabIndex={0}
          role="region"
          aria-label="Planilha de pagamentos com rolagem horizontal e vertical"
        >
          <table className="w-[2630px] min-w-[2630px] table-fixed border-separate border-spacing-0 text-left text-[13px]">
            <colgroup>
              <col className="w-[190px]" />
              <col className="w-[190px]" />
              {MESES_CURTOS.map((m) => (
                <col key={m} className="w-[120px]" />
              ))}
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[130px]" />
              <col className="w-[160px]" />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-800 text-[10.5px] uppercase tracking-wide text-white">
                <th className="sticky left-0 z-20 whitespace-nowrap border-r border-slate-600 bg-slate-800 px-2 py-2.5 font-bold">
                  Empresa
                </th>
                <th className="sticky left-[190px] z-20 whitespace-nowrap border-r-2 border-slate-500 bg-slate-800 px-2 py-2.5 font-bold shadow-[5px_0_8px_-5px_#0f172a]">
                  Processo
                </th>
                {MESES_CURTOS.map((m, i) => (
                  <th
                    key={m}
                    ref={(elemento) => {
                      mesesRef.current[i] = elemento;
                    }}
                    className={`whitespace-nowrap border-r border-slate-600 px-1.5 py-2.5 text-right font-bold ${
                      mesAtivo === i ? 'bg-blue-100 text-blue-950' : 'bg-slate-800'
                    }`}
                  >
                    {m}/{String(ANO_PAGAMENTOS).slice(2)}
                  </th>
                ))}
                {['Total lançado', 'Faturas futuras', 'Empenho', 'Reservado', 'SME', 'Saldo'].map((t) => (
                  <th
                    key={t}
                    className={`border-r border-slate-600 px-1.5 py-2.5 text-right font-bold leading-tight last:border-r-0 ${
                      ['Total lançado', 'Faturas futuras', 'Saldo'].includes(t) ? 'bg-blue-900' : 'bg-slate-800'
                    }`}
                  >
                    {t}
                    {['Total lançado', 'Faturas futuras', 'Saldo'].includes(t) && (
                      <span className="mt-1 block text-[9px] font-normal normal-case text-blue-200">
                        Automático
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenados.map((c) => (
                <LinhaPagamento
                  key={c.id}
                  contrato={c}
                  meses={porMes?.get(c.id)}
                  mesAtivo={mesAtivo}
                  total={totalDoContrato(c)}
                  aoSalvarMes={(mes, valor) => salvarMes(c, mes, valor)}
                  aoSalvarCampo={(campo, valor) => salvarCampo(c, campo, valor)}
                />
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-slate-100 shadow-[0_-4px_8px_-6px_#0f172a]">
              <tr className="bg-slate-100 text-[12px] font-bold text-slate-900">
                <td
                  className="sticky left-0 z-10 border-r-2 border-t-2 border-slate-300 bg-slate-100 px-2 py-2.5 shadow-[5px_0_8px_-5px_#0f172a]"
                  colSpan={2}
                >
                  Total de {ordenados.length}{' '}
                  {ordenados.length === 1 ? 'contrato' : 'contratos'}
                </td>
                {MESES_CURTOS.map((m, i) => (
                  <td
                    key={m}
                    className={`border-r border-t-2 border-slate-300 px-1.5 py-2.5 text-right tabular-nums ${
                      mesAtivo === i ? 'bg-blue-50' : ''
                    } ${tomDoValorPagamento(somaMes(i + 1))}`}
                  >
                    {valorSimples(somaMes(i + 1))}
                  </td>
                ))}
                <td
                  className={`border-r border-t-2 border-slate-300 px-1.5 py-2.5 text-right tabular-nums ${tomDoValorPagamento(
                    ordenados.reduce((t, c) => t + totalDoContrato(c), 0),
                  )}`}
                >
                  {valorSimples(ordenados.reduce((t, c) => t + totalDoContrato(c), 0))}
                </td>
                {(['faturas_futuras', 'empenho', 'reservado', 'sme'] as const).map((campo) => (
                  <td
                    key={campo}
                    className={`border-r border-t-2 border-slate-300 px-1.5 py-2.5 text-right tabular-nums ${tomDoValorPagamento(
                      somaCampo(campo),
                    )}`}
                  >
                    {valorSimples(somaCampo(campo))}
                  </td>
                ))}
                <td
                  className={`border-t-2 border-slate-300 px-1.5 py-2.5 text-right tabular-nums ${tomDoValorPagamento(
                    somaCampo('saldo'),
                  )}`}
                >
                  {moeda(somaCampo('saldo'))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function tomDoValorPagamento(valor: number | null | undefined): string {
  if (valor == null) return '!text-slate-400';
  if (valor < 0) return 'text-red-700 font-medium';
  if (valor === 0) return 'text-slate-500';
  return 'text-slate-800';
}

function LinhaPagamento({
  contrato,
  meses,
  mesAtivo,
  total,
  aoSalvarMes,
  aoSalvarCampo,
}: {
  contrato: Contrato;
  meses: Map<number, Pagamento> | undefined;
  mesAtivo: number;
  total: number;
  aoSalvarMes: (mes: number, valor: number | null) => void;
  aoSalvarCampo: (campo: keyof Contrato, valor: number | null) => void;
}) {
  const celula = 'border-b border-r border-slate-200 px-1 py-1 align-top';
  return (
    <tr className="group even:bg-slate-50/50 hover:bg-blue-50/50">
      <td className={`${celula} sticky left-0 z-10 bg-white px-2 group-hover:bg-blue-50`}>
        <p className="font-semibold leading-snug text-slate-900">{contrato.fornecedor}</p>
        {contrato.numero_contrato && (
          <p className="text-[11px] text-slate-500">Contrato {contrato.numero_contrato}</p>
        )}
      </td>
      <td className={`${celula} sticky left-[190px] z-10 border-r-2 border-r-slate-300 bg-white px-2 shadow-[5px_0_8px_-5px_#0f172a] group-hover:bg-blue-50`}>
        {contrato.sei ? (
          <BotaoCopiar texto={contrato.sei} className="font-mono text-[11px]" />
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      {MESES_CURTOS.map((m, i) => (
        <td key={m} className={`${celula} ${mesAtivo === i ? 'bg-blue-50 group-hover:bg-blue-100/70' : ''}`}>
          <ValorEditavel
            className={tomDoValorPagamento(meses?.get(i + 1)?.valor)}
            valor={meses?.get(i + 1)?.valor ?? null}
            aoSalvar={(valor) => aoSalvarMes(i + 1, valor)}
          />
        </td>
      ))}

      <td className={`${celula} bg-blue-50 text-right font-semibold tabular-nums ${tomDoValorPagamento(total)}`}>
        <span className="block px-1.5 py-1" title="Soma dos doze meses">
          {valorSimples(total)}
        </span>
      </td>
      <td className={`${celula} bg-blue-50 text-right font-semibold tabular-nums ${tomDoValorPagamento(contrato.faturas_futuras)}`}>
        <span className="block px-1.5 py-1" title="Previsto para o ano − Total lançado">
          {valorSimples(contrato.faturas_futuras)}
        </span>
      </td>
      <td className={celula}>
        <ValorEditavel
          className={tomDoValorPagamento(contrato.empenho)}
          valor={contrato.empenho}
          aoSalvar={(v) => aoSalvarCampo('empenho', v)}
        />
      </td>
      <td className={celula}>
        <ValorEditavel
          className={tomDoValorPagamento(contrato.reservado)}
          valor={contrato.reservado}
          aoSalvar={(v) => aoSalvarCampo('reservado', v)}
        />
      </td>
      <td className={celula}>
        <ValorEditavel
          className={tomDoValorPagamento(contrato.sme)}
          valor={contrato.sme}
          aoSalvar={(v) => aoSalvarCampo('sme', v)}
        />
      </td>
      <td className={`border-b border-slate-200 bg-blue-50 px-2 py-2 text-right align-top font-bold tabular-nums ${tomDoValorPagamento(contrato.saldo)}`}>
        <span title="Empenho + Reservado + SME − Faturas futuras">{moeda(contrato.saldo)}</span>
      </td>
    </tr>
  );
}

// =============================================================================
//  Cadastro e edição completa do contrato
// =============================================================================

function ModalContrato({
  aberto,
  contrato,
  setores,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  contrato: Contrato | null;
  setores: Setor[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const inicial = {
    sei: contrato?.sei ?? '',
    numero_contrato: contrato?.numero_contrato ?? '',
    numero_ultimo_ajuste: contrato?.numero_ultimo_ajuste ?? '',
    fornecedor: contrato?.fornecedor ?? '',
    objeto: contrato?.objeto ?? '',
    document_url: contrato?.document_url ?? '',
    data_inicio: contrato?.data_inicio ?? '',
    data_fim_vigencia: contrato?.data_fim_vigencia ?? '',
    duracao: contrato?.duracao ?? '',
    data_base_reajuste: contrato?.data_base_reajuste ?? '',
    interesse_renovar: contrato?.interesse_renovar ?? 'Não definido',
    gestor: contrato?.gestor ?? '',
    fiscal: contrato?.fiscal ?? '',
    empenho: contrato ? String(contrato.empenho) : '0',
    reservado: contrato ? String(contrato.reservado) : '0',
    sme: contrato ? String(contrato.sme) : '0',
    id_setor: contrato?.id_setor ? String(contrato.id_setor) : '',
    status: contrato?.status ?? 'Vigente',
  };

  const [form, setForm] = useState(inicial);
  const [chave, setChave] = useState(contrato?.id ?? 0);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (chave !== (contrato?.id ?? 0)) {
    setChave(contrato?.id ?? 0);
    setForm(inicial);
    setErros({});
    setFalha(null);
  }

  const mudar = (campo: keyof typeof inicial) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  async function enviar() {
    const e: Record<string, string> = {};
    if (!form.fornecedor.trim()) e.fornecedor = 'Informe a empresa contratada.';
    if (form.document_url.trim() && !urlHttpValida(form.document_url.trim())) {
      e.document_url = 'Informe uma URL válida começando com http:// ou https://.';
    }
    if (
      form.data_inicio &&
      form.data_fim_vigencia &&
      form.data_fim_vigencia < form.data_inicio
    ) {
      e.data_fim_vigencia = 'O término não pode ser antes da data do 1º contrato.';
    }
    setErros(e);
    if (Object.keys(e).length) return;

    setSalvando(true);
    setFalha(null);
    const dados = {
      sei: form.sei.trim() || null,
      numero_contrato: form.numero_contrato.trim() || null,
      numero_ultimo_ajuste: form.numero_ultimo_ajuste.trim() || null,
      fornecedor: form.fornecedor.trim(),
      objeto: form.objeto.trim() || null,
      document_url: form.document_url.trim() || null,
      data_inicio: form.data_inicio || null,
      data_fim_vigencia: form.data_fim_vigencia || null,
      duracao: form.duracao.trim() || null,
      data_base_reajuste: form.data_base_reajuste || null,
      interesse_renovar: form.interesse_renovar as InteresseRenovar,
      gestor: form.gestor.trim() || null,
      fiscal: form.fiscal.trim() || null,
      empenho: paraNumero(form.empenho),
      reservado: paraNumero(form.reservado),
      sme: paraNumero(form.sme),
      valor_total: contrato?.valor_total ?? 0,
      id_setor: form.id_setor ? Number(form.id_setor) : null,
      status: form.status as StatusContrato,
    };
    try {
      if (contrato) await api.contratos.alterar(contrato.id, dados);
      else await api.contratos.criar(dados);
      aoSalvar();
    } catch (err) {
      setFalha(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar o contrato.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      largura="grande"
      titulo={contrato ? `Editar contrato — ${contrato.fornecedor}` : 'Novo contrato'}
      descricao="Preencha os dados do contrato. Os valores mês a mês são lançados na visão de Pagamentos."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao aparencia="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao aparencia="primario" onClick={enviar} carregando={salvando}>
            {contrato ? 'Salvar alterações' : 'Cadastrar contrato'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {falha && <AvisoErro mensagem={falha} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo="Empresa"
            obrigatorio
            valor={form.fornecedor}
            aoMudar={mudar('fornecedor')}
            erro={erros.fornecedor}
            placeholder="Ex.: SABEMI (Seguro)"
          />
          <CampoTexto
            rotulo="Número do processo (SEI)"
            valor={form.sei}
            aoMudar={mudar('sei')}
            placeholder="PMC.2026.00027617-29"
            ajuda="É o número que liga o contrato ao controle de pagamentos."
          />
        </div>

        <CampoTexto
          rotulo="Objeto (o que a empresa fornece)"
          linhas={2}
          valor={form.objeto}
          aoMudar={mudar('objeto')}
          placeholder="Ex.: Locação de veículos"
        />

        <CampoTexto
          rotulo="Link do contrato"
          tipo="url"
          valor={form.document_url}
          aoMudar={mudar('document_url')}
          erro={erros.document_url}
          placeholder="https://…"
          ajuda="Cole o link externo do documento no OneDrive, SharePoint ou outro serviço."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo="Número do contrato"
            valor={form.numero_contrato}
            aoMudar={mudar('numero_contrato')}
            placeholder="Ex.: 265/23"
            ajuda="Deixe em branco quando ainda não houver contrato assinado."
          />
          <CampoTexto
            rotulo="Número do último ajuste"
            valor={form.numero_ultimo_ajuste}
            aoMudar={mudar('numero_ultimo_ajuste')}
            placeholder="Ex.: 236/25"
          />
          <CampoTexto
            rotulo="Data do 1º contrato"
            tipo="date"
            valor={form.data_inicio}
            aoMudar={mudar('data_inicio')}
          />
          <CampoTexto
            rotulo="Término"
            tipo="date"
            valor={form.data_fim_vigencia}
            aoMudar={mudar('data_fim_vigencia')}
            erro={erros.data_fim_vigencia}
            ajuda="É essa data que aciona o alerta de renovação."
          />
          <CampoTexto
            rotulo="Duração"
            valor={form.duracao}
            aoMudar={mudar('duracao')}
            placeholder="Ex.: 12 meses"
            ajuda="Duração do último ajuste, como está na planilha."
          />
          <CampoTexto
            rotulo="Data-base de reajuste"
            tipo="date"
            valor={form.data_base_reajuste}
            aoMudar={mudar('data_base_reajuste')}
          />
          <CampoLista
            rotulo="Interesse em renovar"
            valor={form.interesse_renovar}
            aoMudar={mudar('interesse_renovar')}
            vazio="Selecione"
            opcoes={INTERESSES_RENOVAR.map((i) => ({ valor: i, texto: i }))}
          />
          <CampoLista
            rotulo="Situação"
            valor={form.status}
            aoMudar={mudar('status')}
            vazio="Selecione"
            opcoes={[
              { valor: 'Vigente', texto: 'Vigente' },
              { valor: 'Suspenso', texto: 'Suspenso' },
              { valor: 'Encerrado', texto: 'Encerrado' },
            ]}
          />
          <CampoTexto
            rotulo="Gestor"
            valor={form.gestor}
            aoMudar={mudar('gestor')}
            placeholder="Nome de quem responde pelo contrato"
          />
          <CampoTexto
            rotulo="Fiscal"
            valor={form.fiscal}
            aoMudar={mudar('fiscal')}
            placeholder="Separe vários nomes por barra"
          />
          <CampoLista
            rotulo="Setor responsável"
            valor={form.id_setor}
            aoMudar={mudar('id_setor')}
            vazio="Não informado"
            opcoes={opcoesDeSetor(setores)}
          />
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1.5 text-sm font-semibold text-slate-700">
            Controle de pagamentos
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CampoDinheiro
              rotulo="Empenho"
              valor={form.empenho}
              aoMudar={mudar('empenho')}
            />
            <CampoDinheiro
              rotulo="Reservado"
              valor={form.reservado}
              aoMudar={mudar('reservado')}
            />
            <CampoDinheiro rotulo="SME" valor={form.sme} aoMudar={mudar('sme')} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Total lançado, faturas futuras e saldo são calculados automaticamente a partir da previsão anual, dos meses e dos valores acima.
          </p>
        </fieldset>
      </div>
    </Modal>
  );
}
