// =============================================================================
//  MÓDULO 4b — Emendas impositivas
//
//  Espelha a planilha "EMENDAS IMPOSITIVAS": uma ficha por emenda, com o
//  vereador que a destinou, o objetivo, a finalidade escrita por extenso e o
//  caminho do dinheiro em duas etapas — o que está a liquidar (comprometido,
//  ainda não pago) e o que já foi liquidado. O saldo é o que sobra dos dois.
//
//  As emendas são organizadas por OBJETIVO (Monitoramento, Munição, Drones…),
//  e não por setor de destino: é assim que a Câmara as classifica e é a
//  pergunta que a Coordenadoria faz sobre elas.
// =============================================================================

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

export function Emendas({
  aoMudar,
  objetivoInicial = '',
}: {
  aoMudar: () => void;
  /** Objetivo escolhido no gráfico da visão geral, já aplicado ao abrir. */
  objetivoInicial?: string;
}) {
  // Leitor vê as fichas e os totais; cadastrar, editar e excluir somem.
  const podeEditar = usePodeEditar();
  const { dados, carregando, erro, recarregar } = useDados<Emenda[]>(() => api.emendas.listar());
  const [busca, setBusca] = useState('');
  const [objetivoFiltro, setObjetivoFiltro] = useState(objetivoInicial);
  const [emEdicao, setEmEdicao] = useState<Emenda | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

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
    return lista.filter((e) => {
      const casaBusca =
        !t ||
        [e.codigo, e.autor, e.objetivo, e.finalidade, e.processo, e.natureza_despesa].some(
          (campo) => (campo ?? '').toLowerCase().includes(t),
        );
      const casaObjetivo = !objetivoFiltro || (e.objetivo ?? '') === objetivoFiltro;
      return casaBusca && casaObjetivo;
    });
  }, [lista, busca, objetivoFiltro]);

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

  if (carregando) return <Carregando texto="Carregando as emendas…" />;
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
            placeholder="Procurar por número, vereador, objetivo ou finalidade…"
            aria-label="Procurar emendas"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
          />
        </div>
        <select
          value={objetivoFiltro}
          onChange={(e) => setObjetivoFiltro(e.target.value)}
          aria-label="Filtrar por objetivo"
          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
        >
          <option value="">Todos os objetivos</option>
          {objetivos.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
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

      {/* Os mesmos quatro totais da última linha da planilha */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Totalizador rotulo="Valor" valor={totais.valor} />
        <Totalizador rotulo="A liquidar" valor={totais.aLiquidar} tom="text-marca-700" />
        <Totalizador rotulo="Liquidado" valor={totais.liquidado} tom="text-slate-900" />
        <Totalizador rotulo="Saldo" valor={totais.saldo} tom="text-emerald-700" />
      </div>

      <p className="px-1 text-sm text-slate-600">
        <strong className="text-slate-900">{filtrada.length}</strong>{' '}
        {filtrada.length === 1 ? 'emenda' : 'emendas'}
        {filtrada.length !== lista.length && ` de ${lista.length}`}
      </p>

      {filtrada.length === 0 ? (
        <Vazio
          titulo="Nenhuma emenda encontrada"
          texto={
            podeEditar
              ? 'Ajuste a busca ou cadastre uma emenda para acompanhar o saldo por objetivo.'
              : 'Ajuste a busca para ver as emendas do ano.'
          }
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

function Totalizador({
  rotulo,
  valor,
  tom = 'text-slate-900',
}: {
  rotulo: string;
  valor: number;
  tom?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tom}`}>{moeda(valor)}</p>
    </div>
  );
}

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
  const semSaldo = saldo <= 0;

  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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

      {/* A finalidade é o texto que o vereador escreveu; algumas passam de
          mil caracteres, então a ficha mostra o começo e o resto fica na
          dica do mouse e no formulário de edição. */}
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
            className="-ml-1 font-mono text-[11px] text-slate-700"
          />
        </div>
      )}

      <div className="mt-auto pt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-200">
          <div
            className="h-full rounded-full bg-marca-500"
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
          {/* Texto livre com sugestões: os objetivos mudam de um ano para o
              outro, e uma lista fechada travaria o cadastro do primeiro novo. */}
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
