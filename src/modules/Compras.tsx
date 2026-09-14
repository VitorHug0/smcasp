// =============================================================================
//  MÓDULO 3 — Compras e destino
//  Tabela buscável do que foi comprado, por quanto, quantas unidades e qual
//  setor recebeu. Cadastro rápido em janela, sem sair da tela.
// =============================================================================

import { useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { usePodeEditar } from '../lib/permissoes';
import { opcoesDeSetor, rotuloDoSetor, setoresPorGrupo } from '../lib/setores';
import { dataBR, hojeISO, moeda, numero, paraNumero } from '../lib/formato';
import { Botao } from '../components/ui/Botao';
import { Modal } from '../components/ui/Modal';
import { CampoDinheiro, CampoLista, CampoTexto } from '../components/ui/Campo';
import { Etiqueta } from '../components/ui/Etiqueta';
import { AvisoErro, Carregando, Falha, Vazio } from '../components/ui/Estados';
import type { Aquisicao, Contrato, Setor } from '../lib/types';

interface Props {
  setores: Setor[];
  contratos: Contrato[];
}

export function Compras({ setores, contratos }: Props) {
  // Leitor consulta a lista e os totais; registrar e excluir compra, não.
  const podeEditar = usePodeEditar();
  const { dados, carregando, erro, recarregar } = useDados<Aquisicao[]>(() =>
    api.aquisicoes.listar(),
  );
  const [busca, setBusca] = useState('');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [modalAberto, setModalAberto] = useState(false);

  const lista = dados ?? [];

  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter((a) => {
      const casaBusca =
        !termo ||
        a.item_comprado.toLowerCase().includes(termo) ||
        (a.setor_nome ?? '').toLowerCase().includes(termo) ||
        (a.contrato_numero ?? '').toLowerCase().includes(termo);
      const casaSetor = !setorFiltro || String(a.id_setor_destino ?? '') === setorFiltro;
      return casaBusca && casaSetor;
    });
  }, [lista, busca, setorFiltro]);

  const totalFiltrado = filtrada.reduce((soma, a) => soma + a.valor_total, 0);

  async function excluir(a: Aquisicao) {
    if (!confirm(`Excluir a compra "${a.item_comprado}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await api.aquisicoes.excluir(a.id);
      recarregar();
    } catch {
      alert('Não foi possível excluir. Tente novamente.');
    }
  }

  if (carregando) return <Carregando texto="Buscando as compras registradas…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar por item, setor ou contrato…"
            aria-label="Procurar compras"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
          />
        </div>
        <select
          value={setorFiltro}
          onChange={(e) => setSetorFiltro(e.target.value)}
          aria-label="Filtrar por setor que recebeu"
          className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
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
        {podeEditar && (
          <Botao
            aparencia="primario"
            icone={<Plus className="size-4" />}
            onClick={() => setModalAberto(true)}
          >
            Registrar compra
          </Botao>
        )}
      </div>

      {/* Resumo do que está na tela */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-sm text-slate-600">
        <span>
          <strong className="text-slate-900">{numero(filtrada.length)}</strong>{' '}
          {filtrada.length === 1 ? 'compra listada' : 'compras listadas'}
        </span>
        <span>
          Total: <strong className="text-slate-900">{moeda(totalFiltrado)}</strong>
        </span>
      </div>

      {filtrada.length === 0 ? (
        <Vazio
          titulo="Nenhuma compra encontrada"
          texto={
            podeEditar
              ? 'Ajuste a busca ou registre uma nova aquisição.'
              : 'Ajuste a busca para ver as compras registradas.'
          }
          acao={
            podeEditar ? (
              <Botao
                aparencia="primario"
                icone={<Plus className="size-4" />}
                onClick={() => setModalAberto(true)}
              >
                Registrar compra
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Item comprado</th>
                  <th className="px-4 py-3 text-right font-semibold">Qtd.</th>
                  <th className="px-4 py-3 text-right font-semibold">Valor</th>
                  <th className="px-4 py-3 font-semibold">Setor que recebeu</th>
                  <th className="px-4 py-3 font-semibold">Contrato</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  {podeEditar && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrada.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{a.item_comprado}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {numero(a.quantidade)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {moeda(a.valor_total)}
                    </td>
                    <td className="px-4 py-3">
                      {a.setor_sigla ? (
                        <Etiqueta tom="azul">{a.setor_sigla}</Etiqueta>
                      ) : (
                        <span className="text-slate-400">Não informado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.contrato_numero ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {dataBR(a.data_compra)}
                    </td>
                    {podeEditar && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => excluir(a)}
                          aria-label={`Excluir ${a.item_comprado}`}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ModalNovaCompra
        aberto={modalAberto}
        setores={setores}
        contratos={contratos}
        aoFechar={() => setModalAberto(false)}
        aoSalvar={() => {
          setModalAberto(false);
          recarregar();
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------

function ModalNovaCompra({
  aberto,
  setores,
  contratos,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  setores: Setor[];
  contratos: Contrato[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const vazio = {
    item_comprado: '',
    quantidade: '1',
    valor_total: '',
    data_compra: hojeISO(),
    id_setor_destino: '',
    id_contrato_origem: '',
  };
  const [form, setForm] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo: keyof typeof vazio) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  async function enviar() {
    const e: Record<string, string> = {};
    if (!form.item_comprado.trim()) e.item_comprado = 'Diga o que foi comprado.';
    if (!(Number(form.quantidade) > 0)) e.quantidade = 'A quantidade precisa ser pelo menos 1.';
    if (!(paraNumero(form.valor_total) > 0)) e.valor_total = 'Informe o valor pago.';
    if (!form.data_compra) e.data_compra = 'Informe a data da compra.';
    setErros(e);
    if (Object.keys(e).length) return;

    setSalvando(true);
    setFalha(null);
    try {
      await api.aquisicoes.criar({
        item_comprado: form.item_comprado.trim(),
        quantidade: Number(form.quantidade),
        valor_total: paraNumero(form.valor_total),
        data_compra: form.data_compra,
        id_setor_destino: form.id_setor_destino ? Number(form.id_setor_destino) : null,
        id_contrato_origem: form.id_contrato_origem ? Number(form.id_contrato_origem) : null,
      });
      setForm(vazio);
      aoSalvar();
    } catch (err) {
      setFalha(err instanceof ErroDaApi ? err.message : 'Não foi possível registrar a compra.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Registrar uma compra"
      descricao="Anote o que foi adquirido e para qual setor foi entregue."
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao aparencia="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao aparencia="primario" onClick={enviar} carregando={salvando}>
            Salvar compra
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {falha && <AvisoErro mensagem={falha} />}
        <CampoTexto
          rotulo="O que foi comprado?"
          obrigatorio
          valor={form.item_comprado}
          aoMudar={mudar('item_comprado')}
          erro={erros.item_comprado}
          placeholder="Ex.: Colete balístico nível II-A"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo="Quantidade"
            obrigatorio
            tipo="number"
            min={1}
            valor={form.quantidade}
            aoMudar={mudar('quantidade')}
            erro={erros.quantidade}
          />
          <CampoDinheiro
            rotulo="Valor total"
            obrigatorio
            valor={form.valor_total}
            aoMudar={mudar('valor_total')}
            erro={erros.valor_total}
            ajuda="Some tudo: é o valor da compra inteira."
          />
          <CampoTexto
            rotulo="Data da compra"
            obrigatorio
            tipo="date"
            valor={form.data_compra}
            aoMudar={mudar('data_compra')}
            erro={erros.data_compra}
          />
          <CampoLista
            rotulo="Setor que recebeu"
            valor={form.id_setor_destino}
            aoMudar={mudar('id_setor_destino')}
            vazio="Não informado"
            opcoes={opcoesDeSetor(setores)}
          />
        </div>
        <CampoLista
          rotulo="Veio de algum contrato?"
          valor={form.id_contrato_origem}
          aoMudar={mudar('id_contrato_origem')}
          vazio="Compra avulsa (sem contrato)"
          ajuda="Se a compra foi feita dentro de um contrato, escolha qual."
          opcoes={contratos.map((c) => ({
            valor: c.id,
            texto: `${c.numero_contrato} — ${c.fornecedor}`,
          }))}
        />
      </div>
    </Modal>
  );
}
