// =============================================================================
//  MÓDULO 4b — Emendas impositivas
//
//  Espelha a planilha "EMENDAS IMPOSITIVAS": controle por emenda, com o
//  vereador que a destinou, o objetivo, a finalidade escrita por extenso e o
//  caminho do dinheiro em duas etapas — o que está a liquidar (comprometido,
//  ainda não pago) e o que já foi liquidado. O saldo é o que sobra dos dois.
//
//  As emendas são organizadas por OBJETIVO (Monitoramento, Munição, Drones…),
//  e não por setor de destino: é assim que a Câmara as classifica e é a
//  pergunta que a Coordenadoria faz sobre elas.
// =============================================================================

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Landmark,
  LayoutGrid,
  LayoutList,
  Pencil,
  PiggyBank,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { usePodeEditar } from '../lib/permissoes';
import { moeda, paraNumero } from '../lib/formato';
import { BotaoCopiar } from '../components/BotaoCopiar';
import { Botao } from '../components/ui/Botao';
import { Modal } from '../components/ui/Modal';
import { CampoDinheiro, CampoTexto } from '../components/ui/Campo';
import { Etiqueta } from '../components/ui/Etiqueta';
import { AvisoErro, Carregando, Falha, Vazio } from '../components/ui/Estados';
import type { Emenda } from '../lib/types';

/** Saldo pela conta da planilha: valor − a liquidar − liquidado. */
const saldoDe = (e: Emenda): number => e.valor_recebido - e.a_liquidar - e.liquidado;

type ModoExibicao = 'lista' | 'grade';

type ColunaOrdenacao =
  | 'codigo'
  | 'autor'
  | 'objetivo'
  | 'progresso'
  | 'valor_recebido'
  | 'saldo';

export function Emendas({
  aoMudar,
  objetivoInicial = '',
}: {
  aoMudar: () => void;
  /** Objetivo escolhido no gráfico da visão geral, já aplicado ao abrir. */
  objetivoInicial?: string;
}) {
  const podeEditar = usePodeEditar();
  const { dados, carregando, erro, recarregar } = useDados<Emenda[]>(() => api.emendas.listar());
  const [busca, setBusca] = useState('');
  const [objetivoFiltro, setObjetivoFiltro] = useState(objetivoInicial);
  const [filtroSaldo, setFiltroSaldo] = useState<string | null>(null);
  const [modoExibicao, setModoExibicao] = useState<ModoExibicao>('lista');
  const [emEdicao, setEmEdicao] = useState<Emenda | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  // Ordenação da tabela (padrão: código da emenda)
  const [ordem, setOrdem] = useState<{ coluna: ColunaOrdenacao; desc: boolean }>({
    coluna: 'codigo',
    desc: false,
  });

  const lista = dados ?? [];

  /** Objetivos já usados, para o filtro e para as sugestões do formulário. */
  const objetivos = useMemo(() => {
    const vistos = new Set<string>();
    for (const e of lista) {
      const o = (e.objetivo ?? '').trim();
      if (o) vistos.add(o);
    }
    return [...vistos].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [lista]);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const filtrados = lista.filter((e) => {
      const casaBusca =
        !t ||
        [e.codigo, e.autor, e.objetivo, e.finalidade, e.processo, e.natureza_despesa].some(
          (campo) => (campo ?? '').toLowerCase().includes(t),
        );
      const casaObjetivo = !objetivoFiltro || (e.objetivo ?? '') === objetivoFiltro;

      const saldo = saldoDe(e);
      let casaSaldo = true;
      if (filtroSaldo === 'com-saldo') {
        casaSaldo = saldo > 0.01;
      } else if (filtroSaldo === 'sem-saldo') {
        casaSaldo = saldo <= 0.01;
      }

      return casaBusca && casaObjetivo && casaSaldo;
    });

    return [...filtrados].sort((a, b) => {
      let resultado = 0;
      const saldoA = saldoDe(a);
      const saldoB = saldoDe(b);
      const comprometidoA = a.valor_recebido > 0 ? (a.a_liquidar + a.liquidado) / a.valor_recebido : 0;
      const comprometidoB = b.valor_recebido > 0 ? (b.a_liquidar + b.liquidado) / b.valor_recebido : 0;

      switch (ordem.coluna) {
        case 'codigo':
          resultado = (a.codigo || '').localeCompare(b.codigo || '', 'pt-BR', { numeric: true });
          break;
        case 'autor':
          resultado = (a.autor || '').localeCompare(b.autor || '', 'pt-BR');
          break;
        case 'objetivo':
          resultado = (a.objetivo || '').localeCompare(b.objetivo || '', 'pt-BR');
          break;
        case 'progresso':
          resultado = comprometidoA - comprometidoB;
          break;
        case 'valor_recebido':
          resultado = a.valor_recebido - b.valor_recebido;
          break;
        case 'saldo':
          resultado = saldoA - saldoB;
          break;
      }
      return ordem.desc ? -resultado : resultado;
    });
  }, [lista, busca, objetivoFiltro, filtroSaldo, ordem]);

  const totais = useMemo(
    () =>
      filtrada.reduce(
        (acc, e) => ({
          valor: acc.valor + e.valor_recebido,
          aLiquidar: acc.aLiquidar + e.a_liquidar,
          liquidado: acc.liquidado + e.liquidado,
          saldo: acc.saldo + saldoDe(e),
        }),
        { valor: 0, aLiquidar: 0, liquidado: 0, saldo: 0 },
      ),
    [filtrada],
  );

  function alternarOrdem(coluna: ColunaOrdenacao) {
    setOrdem((atual) =>
      atual.coluna === coluna ? { coluna, desc: !atual.desc } : { coluna, desc: false },
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
      setExpandidos(new Set(filtrada.map((e) => e.id)));
    }
  }

  async function excluir(e: Emenda) {
    if (!confirm(`Excluir a emenda ${e.codigo}?`)) return;
    try {
      await api.emendas.excluir(e.id);
      recarregar();
      aoMudar();
    } catch {
      alert('Não foi possível excluir a emenda.');
    }
  }

  const temFiltroAtivo = Boolean(busca || objetivoFiltro || filtroSaldo);

  function limparFiltros() {
    setBusca('');
    setObjetivoFiltro('');
    setFiltroSaldo(null);
  }

  if (carregando) return <Carregando texto="Carregando as emendas…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;

  return (
    <div className="space-y-4">
      {/* Indicadores no topo e Filtros Rápidos */}
      <ResumoEmendasCards
        totais={totais}
        quantidade={filtrada.length}
        filtroRapido={filtroSaldo}
        aoSelecionarFiltro={(filtro) => setFiltroSaldo(filtro)}
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
              placeholder="Buscar por número, vereador, objetivo, finalidade, processo ou ND…"
              aria-label="Procurar emendas"
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
            value={objetivoFiltro}
            onChange={(e) => setObjetivoFiltro(e.target.value)}
            aria-label="Filtrar por objetivo"
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
          >
            <option value="">Todos os objetivos</option>
            {objetivos.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          <select
            value={filtroSaldo ?? ''}
            onChange={(e) => setFiltroSaldo(e.target.value || null)}
            aria-label="Filtrar por disponibilidade de saldo"
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
          >
            <option value="">Todos os saldos</option>
            <option value="com-saldo">Com saldo livre</option>
            <option value="sem-saldo">Totalmente comprometidas</option>
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

          {podeEditar && (
            <Botao
              aparencia="primario"
              icone={<Plus className="size-4" />}
              onClick={() => {
                setEmEdicao(null);
                setModalAberto(true);
              }}
            >
              Nova emenda
            </Botao>
          )}
        </div>
      </div>

      {filtrada.length === 0 ? (
        <Vazio
          titulo="Nenhuma emenda encontrada"
          texto={
            temFiltroAtivo
              ? 'Nenhuma emenda corresponde aos filtros aplicados. Tente ajustar os termos de busca.'
              : podeEditar
                ? 'Nenhuma emenda cadastrada ainda. Cadastre uma emenda para acompanhar o saldo por objetivo.'
                : 'Nenhuma emenda cadastrada no momento.'
          }
          acao={
            temFiltroAtivo ? (
              <Botao aparencia="neutro" onClick={limparFiltros}>
                Limpar filtros
              </Botao>
            ) : podeEditar ? (
              <Botao
                aparencia="primario"
                icone={<Plus className="size-4" />}
                onClick={() => {
                  setEmEdicao(null);
                  setModalAberto(true);
                }}
              >
                Nova emenda
              </Botao>
            ) : undefined
          }
        />
      ) : modoExibicao === 'lista' ? (
        <TabelaEmendas
          emendas={filtrada}
          totais={totais}
          ordem={ordem}
          aoOrdenar={alternarOrdem}
          expandidos={expandidos}
          aoAlternarExpansao={alternarExpansao}
          aoExpandirTodos={expandirOuRecolherTodos}
          aoEditar={(e) => {
            setEmEdicao(e);
            setModalAberto(true);
          }}
          aoExcluir={excluir}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtrada.map((e) => (
            <CartaoEmenda
              key={e.id}
              emenda={e}
              aoEditar={() => {
                setEmEdicao(e);
                setModalAberto(true);
              }}
              aoExcluir={() => excluir(e)}
            />
          ))}
        </ul>
      )}

      <ModalEmenda
        aberto={modalAberto}
        emenda={emEdicao}
        objetivosConhecidos={objetivos}
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
//  Cartões de Resumo e Filtro Rápido no topo
// -----------------------------------------------------------------------------

function ResumoEmendasCards({
  totais,
  quantidade,
  filtroRapido,
  aoSelecionarFiltro,
}: {
  totais: { valor: number; aLiquidar: number; liquidado: number; saldo: number };
  quantidade: number;
  filtroRapido: string | null;
  aoSelecionarFiltro: (filtro: string | null) => void;
}) {
  const percentualLiquidado =
    totais.valor > 0 ? Math.round((totais.liquidado / totais.valor) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Total das Emendas */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(null)}
        title="Ver todas as emendas"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-marca-400 hover:shadow-sm ${
          filtroRapido === null ? 'border-marca-500/50 ring-2 ring-marca-500/10' : 'border-slate-200'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Recebido
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {moeda(totais.valor)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {quantidade} {quantidade === 1 ? 'emenda cadastrada' : 'emendas cadastradas'}
          </p>
        </div>
        <div className="rounded-lg bg-marca-50 p-2.5 text-marca-600 ring-1 ring-marca-200/60">
          <Landmark className="size-5" />
        </div>
      </button>

      {/* Saldo Disponível */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(filtroRapido === 'com-saldo' ? null : 'com-saldo')}
        title="Filtrar emendas com saldo disponível"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-emerald-400 hover:shadow-sm ${
          filtroRapido === 'com-saldo'
            ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20'
            : 'border-slate-200'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Saldo Disponível
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-emerald-700">
            {moeda(totais.saldo)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Recurso livre para destinação</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-200">
          <PiggyBank className="size-5" />
        </div>
      </button>

      {/* A Liquidar */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(null)}
        className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition-all"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            A Liquidar
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-marca-700">
            {moeda(totais.aLiquidar)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Comprometido, aguardando pagamento</p>
        </div>
        <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 ring-1 ring-blue-200">
          <Clock className="size-5" />
        </div>
      </button>

      {/* Liquidado */}
      <button
        type="button"
        onClick={() => aoSelecionarFiltro(filtroRapido === 'sem-saldo' ? null : 'sem-saldo')}
        title="Filtrar emendas totalmente executadas"
        className={`group flex items-start justify-between rounded-xl border bg-white p-4 text-left shadow-xs transition-all hover:border-slate-400 hover:shadow-sm ${
          filtroRapido === 'sem-saldo'
            ? 'border-slate-600 bg-slate-50/70 ring-2 ring-slate-600/20'
            : 'border-slate-200'
        }`}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Liquidado ({percentualLiquidado}%)
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {moeda(totais.liquidado)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Valor já pago e executado</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600 ring-1 ring-slate-200">
          <CheckCircle2 className="size-5" />
        </div>
      </button>
    </div>
  );
}

// =============================================================================
//  NOVO: Componente de Lista Tabular de Emendas
// =============================================================================

function TabelaEmendas({
  emendas,
  totais,
  ordem,
  aoOrdenar,
  expandidos,
  aoAlternarExpansao,
  aoExpandirTodos,
  aoEditar,
  aoExcluir,
}: {
  emendas: Emenda[];
  totais: { valor: number; aLiquidar: number; liquidado: number; saldo: number };
  ordem: { coluna: ColunaOrdenacao; desc: boolean };
  aoOrdenar: (coluna: ColunaOrdenacao) => void;
  expandidos: Set<number>;
  aoAlternarExpansao: (id: number) => void;
  aoExpandirTodos: () => void;
  aoEditar: (e: Emenda) => void;
  aoExcluir: (e: Emenda) => void;
}) {
  const podeEditar = usePodeEditar();
  const todosExpandidos = emendas.length > 0 && expandidos.size === emendas.length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[23%]" />
            <col className="w-[20%]" />
            <col className="w-[19%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
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
                  onClick={() => aoOrdenar('codigo')}
                  className="inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Emenda / Vereador
                  <IconeOrdenacao ativa={ordem.coluna === 'codigo'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => aoOrdenar('objetivo')}
                  className="inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Objetivo / Processo
                  <IconeOrdenacao ativa={ordem.coluna === 'objetivo'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3">Finalidade</th>

              <th className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => aoOrdenar('progresso')}
                  className="inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Execução
                  <IconeOrdenacao ativa={ordem.coluna === 'progresso'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => aoOrdenar('valor_recebido')}
                  className="ml-auto inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Valor Total
                  <IconeOrdenacao ativa={ordem.coluna === 'valor_recebido'} desc={ordem.desc} />
                </button>
              </th>

              <th className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={() => aoOrdenar('saldo')}
                  className="ml-auto inline-flex items-center gap-1.5 uppercase hover:text-slate-900"
                >
                  Saldo Livre
                  <IconeOrdenacao ativa={ordem.coluna === 'saldo'} desc={ordem.desc} />
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {emendas.map((e) => {
              const expandido = expandidos.has(e.id);
              const saldo = saldoDe(e);
              const comprometido = e.a_liquidar + e.liquidado;
              const percentual =
                e.valor_recebido > 0
                  ? Math.min(100, Math.round((comprometido / e.valor_recebido) * 100))
                  : 0;
              const semSaldo = saldo <= 0.01;

              return (
                <LinhaItemEmenda
                  key={e.id}
                  emenda={e}
                  expandido={expandido}
                  saldo={saldo}
                  comprometido={comprometido}
                  percentual={percentual}
                  semSaldo={semSaldo}
                  podeEditar={podeEditar}
                  aoAlternarExpansao={() => aoAlternarExpansao(e.id)}
                  aoEditar={() => aoEditar(e)}
                  aoExcluir={() => aoExcluir(e)}
                />
              );
            })}
          </tbody>

          {/* Rodapé com totais da lista */}
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
            <tr>
              <td className="px-2 py-3 text-center" />
              <td className="px-3 py-3 text-xs uppercase tracking-wider text-slate-600" colSpan={4}>
                Total de {emendas.length} {emendas.length === 1 ? 'emenda listada' : 'emendas listadas'}
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-slate-900">
                {moeda(totais.valor)}
              </td>
              <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-emerald-700">
                {moeda(totais.saldo)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LinhaItemEmenda({
  emenda,
  expandido,
  saldo,
  comprometido,
  percentual,
  semSaldo,
  podeEditar,
  aoAlternarExpansao,
  aoEditar,
  aoExcluir,
}: {
  emenda: Emenda;
  expandido: boolean;
  saldo: number;
  comprometido: number;
  percentual: number;
  semSaldo: boolean;
  podeEditar: boolean;
  aoAlternarExpansao: () => void;
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
        <td className="px-2 py-3.5 text-center align-top">
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

        {/* Emenda & Vereador */}
        <td className="px-3 py-3.5 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-marca-50 px-2 py-0.5 text-xs font-bold text-marca-700 ring-1 ring-inset ring-marca-200">
              Emenda {emenda.codigo}
            </span>
            <span className="text-xs text-slate-500">· {emenda.ano}</span>
            {emenda.natureza_despesa && (
              <span className="text-[11px] font-medium text-slate-500">
                · ND {emenda.natureza_despesa}
              </span>
            )}
          </div>
          <p className="mt-1 font-bold text-slate-900 group-hover:text-marca-700">
            {emenda.autor}
          </p>
        </td>

        {/* Objetivo & Processo */}
        <td className="px-3 py-3.5 align-top">
          <div>
            {emenda.objetivo ? (
              <Etiqueta tom="azul">{emenda.objetivo}</Etiqueta>
            ) : (
              <Etiqueta tom="cinza">Sem objetivo</Etiqueta>
            )}
          </div>
          {emenda.processo && (
            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
              <BotaoCopiar
                texto={emenda.processo}
                rotulo="Copiar número do processo"
                className="-ml-1 font-mono text-xs text-slate-600"
              />
            </div>
          )}
        </td>

        {/* Finalidade */}
        <td className="px-3 py-3.5 align-top">
          {emenda.finalidade ? (
            <p
              className="line-clamp-2 text-xs leading-relaxed text-slate-600"
              title={emenda.finalidade}
            >
              {emenda.finalidade}
            </p>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Execução / Barra de Progresso */}
        <td className="px-3 py-3.5 align-top">
          <div className="flex items-center gap-2" title={`Comprometido: ${moeda(comprometido)} (${percentual}%)`}>
            <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200 sm:w-24">
              <div
                className={`h-full rounded-full transition-all ${
                  percentual >= 100 ? 'bg-slate-700' : 'bg-marca-600'
                }`}
                style={{ width: `${percentual}%` }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums text-slate-700">
              {percentual}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {semSaldo ? (
              <span className="font-medium text-amber-700">Totalmente comprometida</span>
            ) : (
              <span>Livre: {moeda(saldo)}</span>
            )}
          </p>
        </td>

        {/* Valor Total */}
        <td className="px-3 py-3.5 text-right align-top">
          <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
            {moeda(emenda.valor_recebido)}
          </span>
          <p className="text-[11px] text-slate-500">
            Liquidado: {moeda(emenda.liquidado)}
          </p>
        </td>

        {/* Saldo Livre */}
        <td className="px-3 py-3.5 text-right align-top">
          <span
            className={`font-mono text-sm font-bold tabular-nums ${
              semSaldo ? 'text-slate-500' : 'text-emerald-700'
            }`}
          >
            {moeda(saldo)}
          </span>

          <div
            className="mt-1 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {podeEditar && (
              <>
                <button
                  type="button"
                  onClick={aoEditar}
                  title="Editar emenda"
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={aoExcluir}
                  title="Excluir emenda"
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
                    Emenda Impositiva nº {emenda.codigo} · {emenda.autor}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ano {emenda.ano}
                    {emenda.natureza_despesa && ` · Natureza da despesa: ${emenda.natureza_despesa}`}
                    {emenda.processo && ` · Processo SEI: ${emenda.processo}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {podeEditar && (
                    <Botao
                      aparencia="neutro"
                      className="!px-3 !py-1.5 !text-xs"
                      icone={<Pencil className="size-3.5" />}
                      onClick={aoEditar}
                    >
                      Editar emenda
                    </Botao>
                  )}
                </div>
              </div>

              {/* 3 Colunas de Dados Detalhados */}
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3">
                {/* 1. Origem e Classificação */}
                <div className="space-y-2 rounded-lg bg-slate-50/70 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Origem e Classificação
                  </p>
                  <dl className="space-y-1.5 text-xs">
                    <div>
                      <dt className="text-slate-500">Vereador Proponente</dt>
                      <dd className="font-semibold text-slate-900">{emenda.autor}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Objetivo</dt>
                      <dd className="mt-0.5">
                        <Etiqueta tom="azul">{emenda.objetivo || 'Não definido'}</Etiqueta>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Natureza da Despesa (ND)</dt>
                      <dd className="font-medium text-slate-800">
                        {emenda.natureza_despesa || 'Não informada'}
                        {emenda.natureza_despesa === '449052' && ' (Equipamento)'}
                        {emenda.natureza_despesa === '339039' && ' (Instalação/Serviços)'}
                      </dd>
                    </div>
                    {emenda.processo && (
                      <div>
                        <dt className="text-slate-500">Processo Administrativo</dt>
                        <dd className="mt-0.5 font-mono text-slate-800">
                          <BotaoCopiar texto={emenda.processo} />
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* 2. Finalidade Integral */}
                <div className="space-y-2 rounded-lg bg-slate-50/70 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Finalidade / Descrição da Câmara
                  </p>
                  <div className="max-h-44 overflow-y-auto text-xs leading-relaxed text-slate-700">
                    {emenda.finalidade ? (
                      <p className="whitespace-pre-wrap">{emenda.finalidade}</p>
                    ) : (
                      <span className="italic text-slate-400">Nenhuma finalidade informada.</span>
                    )}
                  </div>
                </div>

                {/* 3. Execução Orçamentária */}
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Execução Orçamentária
                    </p>
                    <span className="text-xs font-bold tabular-nums text-slate-700">
                      {percentual}% comprometido
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-marca-600 transition-all"
                      style={{ width: `${percentual}%` }}
                    />
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <dt className="text-[11px] text-slate-500">Valor Recebido</dt>
                      <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                        {moeda(emenda.valor_recebido)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <dt className="text-[11px] text-slate-500">A Liquidar</dt>
                      <dd className="mt-0.5 font-mono text-sm font-bold text-marca-700">
                        {moeda(emenda.a_liquidar)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <dt className="text-[11px] text-slate-500">Liquidado</dt>
                      <dd className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                        {moeda(emenda.liquidado)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                      <dt className="text-[11px] text-slate-500">Saldo Livre</dt>
                      <dd
                        className={`mt-0.5 font-mono text-sm font-bold ${
                          semSaldo ? 'text-slate-500' : 'text-emerald-700'
                        }`}
                      >
                        {moeda(saldo)}
                      </dd>
                    </div>
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
                    Excluir esta emenda
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
  return desc ? (
    <ArrowDown className="size-3 text-marca-600" />
  ) : (
    <ArrowUp className="size-3 text-marca-600" />
  );
}

// -----------------------------------------------------------------------------
//  Visualização Clássica em Cartões
// -----------------------------------------------------------------------------

function CartaoEmenda({
  emenda,
  aoEditar,
  aoExcluir,
}: {
  emenda: Emenda;
  aoEditar: () => void;
  aoExcluir: () => void;
}) {
  const podeEditar = usePodeEditar();
  const saldo = saldoDe(emenda);
  const comprometido = emenda.a_liquidar + emenda.liquidado;
  const percentual =
    emenda.valor_recebido > 0
      ? Math.min(100, Math.round((comprometido / emenda.valor_recebido) * 100))
      : 0;
  const semSaldo = saldo <= 0.01;

  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Emenda {emenda.codigo} · {emenda.ano}
            {emenda.natureza_despesa && ` · ND ${emenda.natureza_despesa}`}
          </p>
          <h3 className="mt-0.5 truncate text-base font-bold text-slate-900">{emenda.autor}</h3>
        </div>
        {podeEditar && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={aoEditar}
              title="Editar a emenda por completo"
              aria-label={`Editar a emenda ${emenda.codigo}`}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={aoExcluir}
              aria-label={`Excluir a emenda ${emenda.codigo}`}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {emenda.objetivo ? (
          <Etiqueta tom="azul">{emenda.objetivo}</Etiqueta>
        ) : (
          <Etiqueta tom="cinza">Sem objetivo definido</Etiqueta>
        )}
        <Etiqueta tom={semSaldo ? 'ambar' : 'verde'}>
          {semSaldo ? 'Totalmente comprometida' : `Saldo: ${moeda(saldo)}`}
        </Etiqueta>
      </div>

      {emenda.finalidade && (
        <p className="mt-3 line-clamp-3 text-sm leading-snug text-slate-600" title={emenda.finalidade}>
          {emenda.finalidade}
        </p>
      )}

      {emenda.processo && (
        <div className="mt-3">
          <p className="text-xs text-slate-500">Processo</p>
          <BotaoCopiar
            texto={emenda.processo}
            rotulo="Copiar o processo"
            className="-ml-1 font-mono text-xs text-slate-700"
          />
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-marca-500 transition-all"
            style={{ width: `${percentual}%` }}
            role="progressbar"
            aria-valuenow={percentual}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Percentual da emenda já comprometido"
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
          <ValorDaFicha rotulo="Valor" valor={emenda.valor_recebido} />
          <ValorDaFicha rotulo="A liquidar" valor={emenda.a_liquidar} tom="text-marca-700" />
          <ValorDaFicha rotulo="Liquidado" valor={emenda.liquidado} />
          <ValorDaFicha rotulo="Saldo" valor={saldo} tom="text-emerald-700" />
        </div>
      </div>
    </li>
  );
}

function ValorDaFicha({
  rotulo,
  valor,
  tom = 'text-slate-900',
}: {
  rotulo: string;
  valor: number;
  tom?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-slate-500">{rotulo}</p>
      <p className={`truncate font-bold tabular-nums ${tom}`} title={moeda(valor)}>
        {moeda(valor)}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Cadastro e edição completa de emenda
// -----------------------------------------------------------------------------

function ModalEmenda({
  aberto,
  emenda,
  objetivosConhecidos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  emenda: Emenda | null;
  /** Objetivos já cadastrados, oferecidos como sugestão no campo. */
  objetivosConhecidos: string[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const inicial = {
    codigo: emenda?.codigo ?? '',
    autor: emenda?.autor ?? '',
    ano: String(emenda?.ano ?? new Date().getFullYear()),
    natureza_despesa: emenda?.natureza_despesa ?? '',
    objetivo: emenda?.objetivo ?? '',
    finalidade: emenda?.finalidade ?? '',
    valor_recebido: emenda ? String(emenda.valor_recebido) : '',
    a_liquidar: emenda ? String(emenda.a_liquidar) : '0',
    liquidado: emenda ? String(emenda.liquidado) : '0',
    processo: emenda?.processo ?? '',
  };

  const [form, setForm] = useState(inicial);
  const [chave, setChave] = useState(emenda?.id ?? 0);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (chave !== (emenda?.id ?? 0)) {
    setChave(emenda?.id ?? 0);
    setForm(inicial);
    setErros({});
    setFalha(null);
  }

  const mudar = (campo: keyof typeof inicial) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const saldo =
    paraNumero(form.valor_recebido) - paraNumero(form.a_liquidar) - paraNumero(form.liquidado);

  async function enviar() {
    const e: Record<string, string> = {};
    if (!form.codigo.trim()) e.codigo = 'Informe o número da emenda.';
    if (!form.autor.trim()) e.autor = 'Informe o vereador que destinou o recurso.';
    const ano = Number(form.ano);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) e.ano = 'Informe um ano válido.';
    if (!(paraNumero(form.valor_recebido) > 0)) e.valor_recebido = 'Informe o valor da emenda.';
    if (saldo < 0) {
      e.a_liquidar = 'A liquidar mais liquidado não pode passar do valor da emenda.';
    }
    setErros(e);
    if (Object.keys(e).length) return;

    setSalvando(true);
    setFalha(null);
    const dados = {
      codigo: form.codigo.trim(),
      autor: form.autor.trim(),
      ano,
      natureza_despesa: form.natureza_despesa.trim() || null,
      objetivo: form.objetivo.trim() || null,
      finalidade: form.finalidade.trim() || null,
      valor_recebido: paraNumero(form.valor_recebido),
      a_liquidar: paraNumero(form.a_liquidar),
      liquidado: paraNumero(form.liquidado),
      processo: form.processo.trim() || null,
    };
    try {
      if (emenda) await api.emendas.alterar(emenda.id, dados);
      else await api.emendas.criar(dados);
      aoSalvar();
    } catch (err) {
      setFalha(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar a emenda.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      largura="grande"
      titulo={emenda ? `Editar emenda ${emenda.codigo}` : 'Nova emenda'}
      descricao="Os campos marcados com * são obrigatórios."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao aparencia="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao aparencia="primario" onClick={enviar} carregando={salvando}>
            {emenda ? 'Salvar alterações' : 'Cadastrar emenda'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {falha && <AvisoErro mensagem={falha} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CampoTexto
            rotulo="Número da emenda"
            obrigatorio
            valor={form.codigo}
            aoMudar={mudar('codigo')}
            erro={erros.codigo}
            placeholder="Ex.: 0038/2026"
          />
          <CampoTexto
            rotulo="Ano"
            obrigatorio
            tipo="number"
            valor={form.ano}
            aoMudar={mudar('ano')}
            erro={erros.ano}
          />
          <CampoTexto
            rotulo="Natureza da despesa"
            valor={form.natureza_despesa}
            aoMudar={mudar('natureza_despesa')}
            placeholder="Ex.: 449052"
            ajuda="449052 = equipamento · 339039 = instalação."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo="Vereador"
            obrigatorio
            valor={form.autor}
            aoMudar={mudar('autor')}
            erro={erros.autor}
            placeholder="Ex.: DR. YANKO"
          />
          <CampoTexto
            rotulo="Objetivo"
            valor={form.objetivo}
            aoMudar={mudar('objetivo')}
            placeholder="Ex.: Monitoramento"
            listaSugestoes={objetivosConhecidos}
            ajuda="Em que a emenda vai ser empregada. Escolha um já usado ou escreva outro."
          />
        </div>

        <CampoTexto
          rotulo="Finalidade"
          linhas={4}
          valor={form.finalidade}
          aoMudar={mudar('finalidade')}
          placeholder="O texto da emenda, como veio da Câmara"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <CampoDinheiro
            rotulo="Valor"
            obrigatorio
            valor={form.valor_recebido}
            aoMudar={mudar('valor_recebido')}
            erro={erros.valor_recebido}
          />
          <CampoDinheiro
            rotulo="A liquidar"
            valor={form.a_liquidar}
            aoMudar={mudar('a_liquidar')}
            erro={erros.a_liquidar}
            ajuda="Comprometido e ainda não pago."
          />
          <CampoDinheiro
            rotulo="Liquidado"
            valor={form.liquidado}
            aoMudar={mudar('liquidado')}
            ajuda="O que já foi pago."
          />
        </div>

        <CampoTexto
          rotulo="Processo"
          valor={form.processo}
          aoMudar={mudar('processo')}
          placeholder="Ex.: PMC.2026.00037725-46 - CICC Móvel"
        />

        <div
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            saldo >= 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          Saldo que ficará disponível: {moeda(saldo)}
        </div>
      </div>
    </Modal>
  );
}
