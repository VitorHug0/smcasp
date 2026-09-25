// =============================================================================
//  MÓDULO 1 — Visão geral do ano
//
//  Quatro números principais, o gráfico de saldo das emendas por objetivo e a
//  lista de contratos que precisam de renovação.
//
//  A tela é o ponto de partida do dia: cada coisa aqui leva a algum lugar. Os
//  quatro cartões abrem a tela do assunto; cada barra do gráfico abre as
//  emendas daquele objetivo; cada contrato da lista abre os contratos com a
//  empresa já procurada. Movimento que não leva a lugar nenhum é promessa
//  quebrada — se o cartão sobe quando o mouse passa, ele tem de responder ao
//  clique.
// =============================================================================

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ClipboardList, FileText, PiggyBank, ShoppingCart, UserCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { dataBR, moeda, moedaCurta, numero, textoPrazo } from '../lib/formato';
import { CartaoKpi } from '../components/CartaoKpi';
import { Botao } from '../components/ui/Botao';
import { Etiqueta, tomDoPrazo } from '../components/ui/Etiqueta';
import { Carregando, Falha, Vazio } from '../components/ui/Estados';
import type { Contrato, DashboardData } from '../lib/types';

const COR_DISPONIVEL = '#059669'; // verde — pode ser usado
const COR_COMPROMETIDO = '#2f6feb'; // azul — já tem destino

/**
 * Opacidade das colunas que não estão sob o cursor. Baixa o suficiente para a
 * coluna escolhida saltar, alta o suficiente para o desenho do gráfico não
 * sumir — quem está comparando duas colunas precisa continuar vendo as duas.
 */
const APAGADA = 0.32;

/** Para onde cada parte da tela leva. */
export interface AtalhosDaVisaoGeral {
  aoAbrirContratos?: (busca?: string) => void;
  aoAbrirEmendas?: (objetivo?: string) => void;
  aoAbrirProcessos?: () => void;
  aoAbrirMinhasDemandas?: () => void;
  aoAbrirCompras?: () => void;
}

export function VisaoGeral({ ano, atalhos = {} }: { ano: number; atalhos?: AtalhosDaVisaoGeral }) {
  const { dados, carregando, erro, recarregar } = useDados<DashboardData>(
    () => api.dashboard(ano),
    [ano],
  );
  /** Índice da coluna sob o cursor — as outras clareiam para destacá-la. */
  const [colunaAtiva, setColunaAtiva] = useState<number | null>(null);

  if (carregando) return <Carregando texto="Somando contratos, emendas e compras…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;
  if (!dados) return null;

  const { kpis, emendas_por_objetivo, contratos_a_vencer } = dados;
  // Quanto do previsto para o ano já está empenhado — é a leitura que a
  // planilha de pagamentos dá, e substitui o antigo "percentual pago", que os
  // contratos reais não informam.
  const percentualEmpenhado =
    kpis.previsto_ano > 0 ? Math.round((kpis.total_empenhado / kpis.previsto_ano) * 100) : 0;

  const podeFiltrarEmendas = Boolean(atalhos.aoAbrirEmendas);

  return (
    <div className="space-y-6">
      {atalhos.aoAbrirMinhasDemandas && (
        <div className="flex justify-end">
          <Botao
            aparencia="neutro"
            icone={<UserCheck className="size-4" />}
            onClick={atalhos.aoAbrirMinhasDemandas}
            title="Abrir somente os processos atribuídos a mim"
          >
            Minhas Demandas
          </Botao>
        </div>
      )}
      {/* -------------------------------------------------- KPIs */}
      <div className="surge grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          titulo={`Previsto em contratos (${ano})`}
          valor={kpis.previsto_ano}
          formatar={moeda}
          detalhe={`${percentualEmpenhado}% empenhado (${moeda(kpis.total_empenhado)})`}
          Icone={FileText}
          tom="azul"
          aoClicar={atalhos.aoAbrirContratos ? () => atalhos.aoAbrirContratos!() : undefined}
          destino="Abrir a tela de contratos"
        />
        <CartaoKpi
          titulo="Saldo de emendas disponível"
          valor={kpis.saldo_emendas}
          formatar={moeda}
          detalhe={`De ${moeda(kpis.total_emendas_recebido)} recebidos em ${ano}`}
          Icone={PiggyBank}
          tom={kpis.saldo_emendas > 0 ? 'verde' : 'ambar'}
          aoClicar={atalhos.aoAbrirEmendas ? () => atalhos.aoAbrirEmendas!() : undefined}
          destino="Abrir a tela de emendas"
        />
        <CartaoKpi
          titulo="Processos em aberto"
          valor={kpis.processos_ativos}
          formatar={numero}
          detalhe={
            kpis.processos_atrasados > 0
              ? `${kpis.processos_atrasados} ${
                  kpis.processos_atrasados === 1 ? 'passou' : 'passaram'
                } do prazo`
              : 'Nenhum atrasado'
          }
          Icone={ClipboardList}
          tom={kpis.processos_atrasados > 0 ? 'vermelho' : 'verde'}
          // O pulso é reservado ao que está crítico agora: processo fora do
          // prazo. Se pulsasse sempre, deixaria de querer dizer alguma coisa.
          pulsando={kpis.processos_atrasados > 0}
          aoClicar={atalhos.aoAbrirProcessos}
          destino="Abrir o quadro de processos"
        />
        <CartaoKpi
          titulo={`Compras em ${ano}`}
          valor={kpis.total_aquisicoes_ano}
          formatar={moeda}
          detalhe={`${numero(kpis.quantidade_aquisicoes_ano)} aquisições registradas`}
          Icone={ShoppingCart}
          tom="azul"
          aoClicar={atalhos.aoAbrirCompras}
          destino="Abrir a tela de compras"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {/* ---------------------------------------------- Gráfico */}
        <section className="surge surge-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
          <header className="mb-1">
            <h2 className="text-base font-bold text-slate-900">Emendas por objetivo</h2>
            <p className="text-sm text-slate-500">
              Em <span className="font-semibold text-emerald-700">verde</span>, o que ainda pode ser
              usado. Em <span className="font-semibold text-marca-600">azul</span>, o que já tem
              destino definido.
              {podeFiltrarEmendas && ' Clique numa coluna para ver as emendas daquele objetivo.'}
            </p>
          </header>

          {emendas_por_objetivo.length === 0 ? (
            <Vazio
              titulo="Nenhuma emenda cadastrada neste ano"
              texto="Cadastre uma emenda na tela de Emendas para acompanhar o saldo por objetivo."
            />
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={emendas_por_objetivo}
                  margin={{ top: 16, right: 8, left: 8, bottom: 4 }}
                  barCategoryGap="28%"
                  // A coluna inteira é a área de clique e de destaque, não só o
                  // retângulo pintado: mirar numa faixa de 40px é fácil, mirar
                  // no pedacinho verde de uma barra quase vazia, não.
                  onMouseMove={(estado) => {
                    const i = estado?.activeTooltipIndex;
                    setColunaAtiva(typeof i === 'number' ? i : null);
                  }}
                  onMouseLeave={() => setColunaAtiva(null)}
                  onClick={(estado) => {
                    if (!podeFiltrarEmendas) return;
                    const i = estado?.activeTooltipIndex;
                    const alvo = typeof i === 'number' ? emendas_por_objetivo[i] : undefined;
                    if (alvo) atalhos.aoAbrirEmendas!(alvo.objetivo);
                  }}
                  style={{ cursor: podeFiltrarEmendas ? 'pointer' : 'default' }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  {/* interval={0} obriga a desenhar todos os rótulos: sem
                      isso o Recharts esconde os que se encostam — e some
                      justamente com o da maior barra. Nomes longos são
                      cortados; o inteiro continua na dica do mouse. */}
                  <XAxis
                    dataKey="objetivo"
                    interval={0}
                    tickFormatter={(o: string) => (o.length > 11 ? `${o.slice(0, 10)}…` : o)}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tickFormatter={(v: number) => moedaCurta(v)}
                    tick={{ fontSize: 12, fill: '#475569' }}
                    tickLine={false}
                    axisLine={false}
                    width={78}
                  />
                  <Tooltip
                    content={<DicaDoGrafico podeFiltrar={podeFiltrarEmendas} />}
                    // Sem retângulo de fundo: o destaque já é feito clareando
                    // as outras colunas, e os dois juntos ficariam pesados.
                    cursor={false}
                  />
                  <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
                  {/* O traço branco entre os dois pedaços da barra é o que
                      separa "disponível" de "comprometido" sem depender só da
                      diferença de cor. */}
                  <Bar
                    dataKey="disponivel"
                    name="Disponível"
                    stackId="emenda"
                    fill={COR_DISPONIVEL}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  >
                    {emendas_por_objetivo.map((linha, i) => (
                      <Cell
                        key={linha.objetivo}
                        fillOpacity={colunaAtiva === null || colunaAtiva === i ? 1 : APAGADA}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="comprometido"
                    name="Comprometido"
                    stackId="emenda"
                    fill={COR_COMPROMETIDO}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={false}
                  >
                    {emendas_por_objetivo.map((linha, i) => (
                      <Cell
                        key={linha.objetivo}
                        fillOpacity={colunaAtiva === null || colunaAtiva === i ? 1 : APAGADA}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ------------------------------ Contratos a vencer */}
        <section className="surge surge-3 flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <header className="mb-4 flex items-start gap-2.5">
            <span className="rounded-lg bg-amber-100 p-2">
              <AlertTriangle className="size-5 text-amber-600" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Contratos para renovar</h2>
              <p className="text-sm text-slate-500">Vencem nos próximos 90 dias</p>
            </div>
          </header>

          {contratos_a_vencer.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
              <p className="text-sm font-semibold text-emerald-800">
                Nenhum contrato vence nos próximos 90 dias.
              </p>
            </div>
          ) : (
            <ul className="rolagem-suave min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {contratos_a_vencer.map((c) => (
                <LinhaContratoAVencer
                  key={c.id}
                  contrato={c}
                  aoAbrir={
                    atalhos.aoAbrirContratos
                      ? () => atalhos.aoAbrirContratos!(c.fornecedor)
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dica do gráfico
// -----------------------------------------------------------------------------

interface DicaProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
  podeFiltrar?: boolean;
}

/**
 * A dica que segue o cursor. Escrita à mão porque a do Recharts não fala em
 * reais e não deixa dar peso ao que importa.
 *
 * O número vem em primeiro plano e o nome da série em segundo — invertendo a
 * hierarquia da legenda de propósito: aqui a pessoa já sabe qual série está
 * olhando, o que ela quer é o valor. O tracinho colorido antes do nome é a
 * chave da série; um quadrado cheio seria tinta demais para o papel de rótulo.
 */
function DicaDoGrafico({ active, payload, label, podeFiltrar }: DicaProps) {
  if (!active || !payload?.length) return null;

  const total = payload.reduce((soma, p) => soma + (p.value ?? 0), 0);

  return (
    <div className="pointer-events-none min-w-56 rounded-xl border border-white/10 bg-slate-900/85 px-4 py-3 shadow-2xl backdrop-blur-md">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</p>

      <ul className="space-y-2">
        {payload.map((p) => (
          <li key={p.name} className="flex items-baseline justify-between gap-8">
            <span className="flex items-center gap-2 text-xs text-slate-300">
              <span
                className="h-0.5 w-4 shrink-0 rounded-full"
                style={{ background: p.color }}
                aria-hidden="true"
              />
              {p.name}
            </span>
            <span className="text-sm font-bold tabular-nums text-white">{moeda(p.value ?? 0)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex items-baseline justify-between gap-8 border-t border-white/10 pt-2.5">
        <span className="text-xs text-slate-400">Total da emenda</span>
        <span className="text-sm font-bold tabular-nums text-white">{moeda(total)}</span>
      </div>

      {podeFiltrar && (
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Clique para ver as emendas deste objetivo
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Contratos a vencer
// -----------------------------------------------------------------------------

function LinhaContratoAVencer({
  contrato,
  aoAbrir,
}: {
  contrato: Contrato;
  aoAbrir?: () => void;
}) {
  const dias = contrato.dias_para_vencer ?? null;
  const tom = tomDoPrazo(dias);
  const barra =
    tom === 'vermelho'
      ? 'border-l-red-500'
      : tom === 'ambar'
        ? 'border-l-amber-500'
        : 'border-l-emerald-500';

  // Trinta dias ou menos é o prazo em que não dá mais tempo de licitar — é o
  // único caso que pisca. Piscar os de noventa dias faria a tela inteira
  // tremeluzir e ninguém olharia para nenhum.
  const critico = dias !== null && dias <= 30;

  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{contrato.fornecedor}</p>
          <p className="truncate text-xs text-slate-500">
            {contrato.numero_contrato} · {contrato.setor_sigla ?? 'Sem setor'}
          </p>
        </div>
        <span className={critico ? 'animate-pulse' : ''}>
          <Etiqueta tom={tom}>{textoPrazo(dias)}</Etiqueta>
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Vence em <span className="font-semibold">{dataBR(contrato.data_fim_vigencia)}</span>
        {contrato.valor_total > 0 && <> · {moeda(contrato.valor_total)}</>}
      </p>
    </>
  );

  const base = `w-full rounded-lg border border-slate-200 border-l-4 bg-white p-3.5 text-left
    transition-all duration-200 ${barra}`;

  if (!aoAbrir) return <li className={base}>{conteudo}</li>;

  return (
    <li>
      <button
        type="button"
        onClick={aoAbrir}
        aria-label={`Abrir o contrato de ${contrato.fornecedor} na tela de contratos`}
        className={`${base} cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md`}
      >
        {conteudo}
      </button>
    </li>
  );
}
