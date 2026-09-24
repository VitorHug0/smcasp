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

import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, FileSpreadsheet, FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { usePodeEditar } from '../lib/permissoes';
import { exportarParaExcel } from '../lib/exportarProcessos';
import { opcoesDeSetor } from '../lib/setores';
import { dataBR, hojeISO, textoPrazo } from '../lib/formato';
import { BotaoCopiar } from '../components/BotaoCopiar';
import { Botao } from '../components/ui/Botao';
import { Modal } from '../components/ui/Modal';
import { CampoLista, CampoTexto } from '../components/ui/Campo';
import { SelecaoNaLinha, TextoEditavel } from '../components/ui/CelulaEditavel';
import { tomDoPrazoTarefa } from '../components/ui/Etiqueta';
import { AvisoErro, Carregando, Falha } from '../components/ui/Estados';
import { ETAPAS_DO_QUADRO, MODALIDADES, PRIORIDADES } from '../lib/types';
import { processarNotaEmpenho } from '../lib/notaEmpenho';
import {
  FormularioCompra,
  dadosDoFormulario,
  estadoCompraInicial,
  validarFormularioCompra,
  type FormularioCompraEstado,
} from '../components/compras/FormularioCompra';
import type { Etapa, EtapaAberta, Modalidade, Prioridade, Processo, Setor, Usuario } from '../lib/types';

/** As faixas da planilha, na ordem em que o processo caminha. */
export const ETAPAS: Array<{ chave: EtapaAberta; titulo: string; faixa: string }> = [
  { chave: 'CSA', titulo: 'CSA', faixa: 'Coordenadoria Setorial Administrativa' },
  { chave: 'CSF', titulo: 'CSF', faixa: 'Coordenadoria Setorial Financeira' },
  { chave: 'Acompanhamento', titulo: 'Acompanhamento', faixa: 'Acompanhamento' },
  { chave: 'Execução/Entrega', titulo: 'Execução / Entrega', faixa: 'Execução / Entrega' },
  { chave: 'AUDESP/PNCP', titulo: 'AUDESP / PNCP', faixa: 'AUDESP / PNCP' },
  { chave: 'Outros', titulo: 'Outros', faixa: 'Outros' },
];

const COLUNAS_DA_TABELA = 12;

/** Cor do texto da prioridade — a mesma escala usada no resto do sistema. */
const COR_PRIORIDADE: Record<Prioridade, string> = {
  'Muito Alta': 'text-red-700 font-bold',
  Alta: 'text-red-600 font-semibold',
  Média: 'text-amber-700 font-semibold',
  Baixa: 'text-slate-500',
};

interface Props {
  setores: Setor[];
  usuarios: Usuario[];
  /** Chamado quando o usuário quer ver o processo que acabou de concluir. */
  aoAbrirConcluidos: () => void;
}

export function Processos({ setores, usuarios, aoAbrirConcluidos }: Props) {
  // Perfil de Leitor: a planilha continua inteira na tela, só não abre para
  // edição. As células cuidam disso sozinhas; aqui somem os botões.
  const podeEditar = usePodeEditar();
  const { dados, carregando, erro, recarregar } = useDados<Processo[]>(() =>
    api.processos.listar('abertos'),
  );
  const [lista, setLista] = useState<Processo[] | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Processo | null>(null);
  const [falhaAoSalvar, setFalhaAoSalvar] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<string | null>(null);
  const [paraConcluir, setParaConcluir] = useState<Processo | null>(null);
  const [apagado, setApagado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [responsavelFiltro, setResponsavelFiltro] = useState('');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('');
  const [exportando, setExportando] = useState(false);
  const [exportado, setExportado] = useState<number | null>(null);

  useEffect(() => {
    if (dados) setLista(dados);
  }, [dados]);
  const processos = lista ?? dados ?? [];

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
      return casaBusca && casaResponsavel && casaPrioridade;
    });
  }, [processos, busca, responsavelFiltro, prioridadeFiltro]);

  const porEtapa = useMemo(() => {
    const mapa = new Map<EtapaAberta, Processo[]>();
    for (const e of ETAPAS) mapa.set(e.chave, []);
    for (const p of filtrados) {
      if (p.etapa !== 'Concluído') mapa.get(p.etapa as EtapaAberta)?.push(p);
    }
    return mapa;
  }, [filtrados]);

  async function ajustar(processo: Processo, mudanca: Partial<Processo>) {
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
      if (virouConcluido) setConcluido(processo.objeto);
      else setLista((atual) => (atual ?? []).map((p) => (p.id === atualizado.id ? atualizado : p)));
    } catch (e) {
      setLista(anterior);
      setFalhaAoSalvar(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar a alteração.');
    }
  }

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

  const filtrando = Boolean(busca || responsavelFiltro || prioridadeFiltro);
  const classeFiltro =
    'cursor-pointer rounded-lg border border-slate-300 px-3 py-2.5 text-base ' +
    'focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100';

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------- ferramentas */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar por SEI, objeto, status, AUDESP ou PNCP…"
            aria-label="Procurar processos"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
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
        {/* Exportar é leitura: quem tem perfil de Leitor também precisa levar
            a planilha para uma reunião, então o botão não depende do perfil. */}
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

      <p className="px-1 text-sm text-slate-600">
        <strong className="text-slate-900">{filtrados.length}</strong>{' '}
        {filtrados.length === 1 ? 'processo em andamento' : 'processos em andamento'}
        {filtrando && ' (com os filtros aplicados)'} ·{' '}
        {podeEditar
          ? 'clique em qualquer célula para editar; o número do SEI se copia com um clique.'
          : 'seu acesso é somente para consulta; o número do SEI se copia com um clique.'}
      </p>

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

      {/* A linha sumiu do meio de uma planilha longa: sem este aviso, quem
          apagou não tem como saber se o clique valeu. */}
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
            <strong>{concluido}</strong> foi concluído e saiu desta lista.
          </span>
          <button
            type="button"
            onClick={aoAbrirConcluidos}
            className="font-bold text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
          >
            Ver em Concluídos
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
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="rolagem-suave overflow-x-auto">
          <table className="w-full min-w-[1780px] table-fixed border-collapse text-left text-[13px]">
            <colgroup>
              <col className="w-[10.5%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[5.5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[6.5%]" />
              <col className="w-[10%]" />
              <col className="w-[7.5%]" />
              <col className="w-[7.5%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-800 text-[10.5px] uppercase tracking-wide text-white">
                {[
                  'SEI',
                  'Objeto',
                  'Modalidade',
                  'Emenda',
                  'AUDESP',
                  'PNCP',
                  'Status',
                  'Prioridade',
                  'Responsável',
                  '2º responsável',
                  'Mover para',
                  'Ações',
                ].map((titulo) => (
                  <th
                    key={titulo}
                    className="whitespace-nowrap border-r border-slate-600 px-1.5 py-2.5 font-bold last:border-r-0"
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ETAPAS.map((etapa) => {
                const itens = porEtapa.get(etapa.chave) ?? [];
                return (
                  <Fragment key={etapa.chave}>
                    {/* Faixa da fase, como na planilha */}
                    <tr>
                      <th
                        colSpan={COLUNAS_DA_TABELA}
                        scope="colgroup"
                        className="border-y border-slate-700 bg-slate-900 px-3 py-1.5 text-center
                          text-[12px] font-extrabold uppercase tracking-wider text-amber-300"
                      >
                        {etapa.faixa}
                        <span className="ml-2 font-semibold text-amber-200/70">
                          ({itens.length})
                        </span>
                      </th>
                    </tr>

                    {itens.length === 0 ? (
                      <tr>
                        <td
                          colSpan={COLUNAS_DA_TABELA}
                          className="border-b border-slate-200 px-3 py-2 text-center text-xs text-slate-400"
                        >
                          {filtrando ? 'Nada encontrado nesta fase' : 'Nenhum processo nesta fase'}
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
                        />
                      ))
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
        aoConcluir={() => {
          if (!paraConcluir) return;
          setLista(processos.filter((p) => p.id !== paraConcluir.id));
          setConcluido(paraConcluir.objeto);
          setParaConcluir(null);
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Uma linha da planilha
// -----------------------------------------------------------------------------

function LinhaProcesso({
  processo,
  usuarios,
  aoAjustar,
  aoConcluir,
  aoEditar,
}: {
  processo: Processo;
  usuarios: Usuario[];
  aoAjustar: (p: Processo, m: Partial<Processo>) => void;
  aoConcluir: () => void;
  aoEditar: () => void;
}) {
  const podeEditar = usePodeEditar();
  const dias = processo.dias_para_prazo ?? null;
  const tomPrazo = tomDoPrazoTarefa(dias);
  const corPrazo =
    tomPrazo === 'vermelho'
      ? 'text-red-700'
      : tomPrazo === 'ambar'
        ? 'text-amber-700'
        : 'text-emerald-700';

  const pessoas = usuarios.map((u) => ({ valor: String(u.id), texto: u.nome }));
  const celula = 'border-b border-r border-slate-200 px-2 py-1.5 align-top last:border-r-0';

  return (
    <tr className="bg-white hover:bg-marca-50/60">
      {/* SEI */}
      <td className={celula}>
        {processo.sei ? (
          <BotaoCopiar
            texto={processo.sei}
            rotulo="Copiar o número do processo"
            className="w-full font-mono text-[11px] text-slate-700"
          />
        ) : (
          <span className="px-1 text-slate-300">—</span>
        )}
      </td>

      {/* Objeto */}
      <td className={celula}>
        <p className="px-1 font-semibold leading-snug text-slate-900">{processo.objeto}</p>
        {processo.setor_sigla && (
          <p className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            {processo.setor_sigla}
          </p>
        )}
      </td>

      {/* Modalidade */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Modalidade"
          valor={processo.modalidade ?? ''}
          opcoes={MODALIDADES.map((m) => ({ valor: m, texto: m }))}
          aoMudar={(v) => aoAjustar(processo, { modalidade: (v || null) as Modalidade | null })}
          className="text-[11px] font-semibold text-slate-700"
        />
      </td>

      {/* Emenda */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Usa recurso de emenda"
          valor={processo.emenda === 1 ? '1' : '0'}
          semVazio
          opcoes={[
            { valor: '0', texto: '—' },
            { valor: '1', texto: 'Emenda' },
          ]}
          aoMudar={(v) => aoAjustar(processo, { emenda: v === '1' ? 1 : 0 })}
          className={
            processo.emenda === 1
              ? 'text-[11px] font-bold text-emerald-700'
              : 'text-[11px] text-slate-300'
          }
        />
      </td>

      {/* AUDESP */}
      <td className={celula}>
        <TextoEditavel
          valor={processo.audesp}
          monoespacado
          linhas={1}
          aoSalvar={(v) => aoAjustar(processo, { audesp: v })}
        />
      </td>

      {/* PNCP */}
      <td className={celula}>
        <TextoEditavel
          valor={processo.pncp}
          monoespacado
          linhas={1}
          aoSalvar={(v) => aoAjustar(processo, { pncp: v })}
        />
      </td>

      {/* Status + prazo */}
      <td className={celula}>
        <TextoEditavel
          valor={processo.status}
          aoSalvar={(v) => aoAjustar(processo, { status: v })}
          className="text-[12.5px] text-slate-800"
        />
        {processo.data_limite && (
          <p className={`px-1.5 pt-0.5 text-[10.5px] font-semibold ${corPrazo}`}>
            Prazo {dataBR(processo.data_limite)} · {textoPrazo(dias)}
          </p>
        )}
      </td>

      {/* Prioridade */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Prioridade"
          valor={processo.prioridade}
          semVazio
          opcoes={PRIORIDADES.map((p) => ({ valor: p, texto: p }))}
          aoMudar={(v) =>
            aoAjustar(processo, { prioridade: (v || 'Baixa') as Prioridade })
          }
          className={`text-[11px] uppercase ${COR_PRIORIDADE[processo.prioridade]}`}
        />
      </td>

      {/* Responsável */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Responsável"
          valor={processo.id_responsavel ? String(processo.id_responsavel) : ''}
          opcoes={pessoas}
          aoMudar={(v) => aoAjustar(processo, { id_responsavel: v ? Number(v) : null })}
          className="text-[11.5px] text-slate-700"
        />
      </td>

      {/* 2º responsável */}
      <td className={celula}>
        <SelecaoNaLinha
          rotulo="Segundo responsável"
          valor={processo.id_responsavel_2 ? String(processo.id_responsavel_2) : ''}
          opcoes={pessoas}
          aoMudar={(v) => aoAjustar(processo, { id_responsavel_2: v ? Number(v) : null })}
          className="text-[11.5px] text-slate-700"
        />
      </td>

      {/* Mover para outra fase */}
      <td className={celula}>
        {!podeEditar ? (
          <span className="block px-1 py-1 text-center text-slate-300">—</span>
        ) : (
        <select
          value=""
          aria-label={`Mover ${processo.objeto} para outra fase`}
          onChange={(e) => {
            if (e.target.value === 'Concluído') aoConcluir();
            else if (e.target.value) aoAjustar(processo, { etapa: e.target.value as Etapa });
          }}
          className="w-full cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-1
            text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50
            focus:border-marca-500 focus:outline-none"
        >
          <option value="">Mover para…</option>
          {ETAPAS.filter((e) => e.chave !== processo.etapa).map((e) => (
            <option key={e.chave} value={e.chave}>
              {e.titulo}
            </option>
          ))}
          <option value="Concluído">✓ Concluir</option>
        </select>
        )}
      </td>

      {/* Editar por completo */}
      <td className={`${celula} text-center`}>
        {podeEditar && (
          <button
            type="button"
            onClick={aoEditar}
            aria-label={`Editar o processo ${processo.objeto} por completo`}
            title="Editar o processo por completo"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-marca-50 hover:text-marca-700"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

// -----------------------------------------------------------------------------
// Conclusão com Nota de Empenho
// -----------------------------------------------------------------------------

function ModalConclusao({ processo, setores, aoFechar, aoConcluir }: {
  processo: Processo | null;
  setores: Setor[];
  aoFechar: () => void;
  aoConcluir: () => void;
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
  const chave = processo?.id ?? 0;
  const [chaveAnterior, setChaveAnterior] = useState(chave);
  if (chaveAnterior !== chave) {
    setChaveAnterior(chave); setArquivo(null); setForm(estadoCompraInicial()); setHash('');
    setAvisos([]); setErros({}); setFalha(null); setConferindo(false);
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
      aoConcluir();
    } catch (e) {
      setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir o processo. Nenhum dado foi alterado.');
    } finally { setConfirmando(false); }
  }

  return <Modal aberto={processo !== null} largura="grande" titulo="Concluir processo"
    descricao="A compra e seus itens serão criados antes de o processo ser concluído." aoFechar={aoFechar}
    rodape={<><Botao aparencia="neutro" onClick={aoFechar}>Cancelar</Botao>
      {conferindo ? <Botao aparencia="primario" onClick={confirmar} carregando={confirmando}>Confirmar e concluir processo</Botao> :
        <Botao aparencia="primario" onClick={processar} carregando={processando} disabled={!arquivo}>Processar Nota de Empenho</Botao>}
    </>}>
    <div className="space-y-5">
      {falha && <AvisoErro mensagem={falha} />}
      {!conferindo ? <div>
        <p className="mb-4 text-sm text-slate-700">Anexe a Nota de Empenho para concluir <strong>{processo?.objeto}</strong>.</p>
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
      </>}
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
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
            <Check className="size-4 shrink-0" />
            Processo concluído em{' '}
            <strong className="font-semibold">{dataBR(processo.data_conclusao)}</strong>
          </p>
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
