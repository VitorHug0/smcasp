import { useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { useDados } from '../hooks/useDados';
import { useAcesso } from '../lib/permissoes';
import { setoresPorGrupo, rotuloDoSetor } from '../lib/setores';
import { dataBR, moeda, numero } from '../lib/formato';
import { Botao } from '../components/ui/Botao';
import { Modal } from '../components/ui/Modal';
import { Etiqueta } from '../components/ui/Etiqueta';
import { AvisoErro, Carregando, Falha, Vazio } from '../components/ui/Estados';
import {
  FormularioCompra, dadosDoFormulario, estadoCompraInicial, validarFormularioCompra,
  type FormularioCompraEstado,
} from '../components/compras/FormularioCompra';
import type { Compra, Contrato, Setor } from '../lib/types';

interface Props { setores: Setor[]; contratos: Contrato[] }

export function Compras({ setores }: Props) {
  const { podeEditar, ehAdmin } = useAcesso();
  const { dados, carregando, erro, recarregar } = useDados<Compra[]>(() => api.compras.listar());
  const [busca, setBusca] = useState('');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [selecionada, setSelecionada] = useState<Compra | null>(null);
  const [modo, setModo] = useState<'ver' | 'editar' | 'novo' | null>(null);
  const [carregandoCompra, setCarregandoCompra] = useState(false);
  const lista = dados ?? [];

  const filtrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter((compra) => {
      const casaBusca = !termo || [compra.numero_empenho, compra.numero_processo,
        compra.fornecedor_nome, compra.setor_nome].some((v) => (v ?? '').toLowerCase().includes(termo));
      return casaBusca && (!setorFiltro || String(compra.id_setor_responsavel) === setorFiltro);
    });
  }, [lista, busca, setorFiltro]);

  async function abrir(compra: Compra, proximoModo: 'ver' | 'editar') {
    setCarregandoCompra(true);
    try { setSelecionada(await api.compras.obter(compra.id)); setModo(proximoModo); }
    catch (e) { alert(e instanceof ErroDaApi ? e.message : 'Não foi possível abrir a compra.'); }
    finally { setCarregandoCompra(false); }
  }

  async function excluir(compra: Compra) {
    const avisoProcesso = compra.id_processo
      ? '\n\nO processo vinculado será reaberto na etapa AUDESP/PNCP.'
      : '';
    if (!confirm(`Excluir ${compra.numero_empenho ? `a compra do Empenho ${compra.numero_empenho}` : 'este registro histórico'}? Esta ação não pode ser desfeita.${avisoProcesso}`)) return;
    try { await api.compras.excluir(compra.id); recarregar(); }
    catch (e) { alert(e instanceof ErroDaApi ? e.message : 'Não foi possível excluir.'); }
  }

  if (carregando) return <Carregando texto="Buscando as compras registradas…" />;
  if (erro) return <Falha mensagem={erro} aoTentarDeNovo={recarregar} />;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar por empenho, processo ou fornecedor…" aria-label="Procurar compras"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100" />
      </div>
      <select value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)} aria-label="Filtrar por setor responsável"
        className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100">
        <option value="">Todos os setores</option>
        {setoresPorGrupo(setores).map(([grupo, itens]) => <optgroup key={grupo} label={grupo}>
          {itens.map((s) => <option key={s.id} value={s.id}>{rotuloDoSetor(s)}</option>)}
        </optgroup>)}
      </select>
      {podeEditar && <Botao aparencia="primario" icone={<Plus className="size-4" />} onClick={() => { setSelecionada(null); setModo('novo'); }}>Nova compra</Botao>}
    </div>

    <div className="flex flex-wrap gap-x-6 px-1 text-sm text-slate-600">
      <span><strong className="text-slate-900">{numero(filtrada.length)}</strong> {filtrada.length === 1 ? 'empenho' : 'empenhos'}</span>
      <span>Total: <strong className="text-slate-900">{moeda(filtrada.reduce((s, c) => s + c.valor_total, 0))}</strong></span>
    </div>

    {filtrada.length === 0 ? <Vazio titulo="Nenhuma compra encontrada" texto="Ajuste os filtros ou registre um novo empenho."
      acao={podeEditar ? <Botao aparencia="primario" onClick={() => setModo('novo')}>Nova compra</Botao> : undefined} /> :
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
            {['Empenho', 'Processo', 'Data', 'Fornecedor', 'Setor', 'Itens', 'Valor total', 'Ações'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{filtrada.map((compra) => <tr key={compra.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold text-slate-900">{compra.numero_empenho ?? 'Registro histórico'}</td>
            <td className="px-4 py-3 text-slate-600">{compra.numero_processo ?? 'Não informado'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{dataBR(compra.data_compra)}</td>
            <td className="max-w-60 truncate px-4 py-3 text-slate-800" title={compra.fornecedor_nome ?? undefined}>{compra.fornecedor_nome ?? 'Não informado'}</td>
            <td className="px-4 py-3"><Etiqueta tom="azul">{compra.setor_sigla ?? compra.setor_nome ?? '—'}</Etiqueta></td>
            <td className="px-4 py-3 text-slate-600">{numero(compra.quantidade_itens)} {compra.quantidade_itens === 1 ? 'item' : 'itens'}</td>
            <td className="px-4 py-3 font-semibold tabular-nums">{moeda(compra.valor_total)}</td>
            <td className="whitespace-nowrap px-4 py-3">
              <button type="button" onClick={() => abrir(compra, 'ver')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Visualizar compra"><Eye className="size-4" /></button>
              {podeEditar && <button type="button" onClick={() => abrir(compra, 'editar')} className="rounded-lg p-2 text-slate-500 hover:bg-marca-50 hover:text-marca-700" aria-label="Editar compra"><Pencil className="size-4" /></button>}
              {ehAdmin && <button type="button" onClick={() => excluir(compra)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Excluir compra"><Trash2 className="size-4" /></button>}
            </td>
          </tr>)}</tbody>
        </table>
      </div></div>}
    {carregandoCompra && <p className="text-sm text-slate-500">Abrindo compra…</p>}
    <ModalCompra aberto={modo !== null} modo={modo ?? 'ver'} compra={selecionada} setores={setores}
      aoFechar={() => setModo(null)} aoSalvar={() => { setModo(null); recarregar(); }} />
  </div>;
}

function ModalCompra(props: { aberto: boolean; modo: 'ver' | 'editar' | 'novo'; compra: Compra | null; setores: Setor[]; aoFechar: () => void; aoSalvar: () => void }) {
  const chave = `${props.modo}-${props.compra?.id ?? 0}-${props.aberto}`;
  return <ModalCompraConteudo key={chave} {...props} />;
}

function ModalCompraConteudo({ aberto, modo, compra, setores, aoFechar, aoSalvar }: {
  aberto: boolean; modo: 'ver' | 'editar' | 'novo'; compra: Compra | null; setores: Setor[]; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [form, setForm] = useState<FormularioCompraEstado>(() => estadoCompraInicial(compra ?? undefined));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const somenteLeitura = modo === 'ver';

  async function salvar() {
    const encontrados = validarFormularioCompra(form); setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    setSalvando(true); setFalha(null);
    try {
      const dados = dadosDoFormulario(form);
      if (modo === 'editar' && compra) await api.compras.alterar(compra.id, dados); else await api.compras.criar(dados);
      aoSalvar();
    } catch (e) { setFalha(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar a compra.'); }
    finally { setSalvando(false); }
  }

  return <Modal aberto={aberto} largura="grande" titulo={somenteLeitura ? `Empenho ${compra?.numero_empenho ?? ''}` : modo === 'editar' ? 'Editar compra' : 'Nova compra'}
    descricao="Uma compra representa um empenho e pode conter vários itens." aoFechar={aoFechar}
    rodape={<><Botao aparencia="neutro" onClick={aoFechar}>{somenteLeitura ? 'Fechar' : 'Cancelar'}</Botao>
      {!somenteLeitura && <Botao aparencia="primario" onClick={salvar} carregando={salvando}>Salvar compra</Botao>}</>}>
    {falha && <div className="mb-4"><AvisoErro mensagem={falha} /></div>}
    {somenteLeitura ? <Detalhes compra={compra} /> : <FormularioCompra form={form} aoMudar={setForm} setores={setores} erros={erros} />}
  </Modal>;
}

function Detalhes({ compra }: { compra: Compra | null }) {
  if (!compra) return null;
  return <div className="space-y-5 text-sm">
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[['Empenho', compra.numero_empenho ?? 'Não informado (registro histórico)'], ['Processo', compra.numero_processo ?? 'Não informado'], ['Data', dataBR(compra.data_compra)],
        ['Setor responsável', compra.setor_nome ?? '—'], ['Fornecedor', compra.fornecedor_nome ?? 'Não informado'], ['CNPJ/CPF', compra.fornecedor_documento ?? '—']].map(([r, v]) =>
        <div key={r}><dt className="font-semibold text-slate-500">{r}</dt><dd className="mt-1 text-slate-900">{v}</dd></div>)}
    </dl>
    <div className="space-y-2"><h3 className="font-bold text-slate-900">Itens</h3>
      {compra.itens?.map((item, i) => <div key={item.id ?? i} className="rounded-lg border border-slate-200 p-3">
        <p className="font-semibold text-slate-900">{i + 1}. {item.descricao}</p>
        <p className="mt-1 text-slate-600">{item.codigo ? `Código ${item.codigo} · ` : ''}{item.quantidade} {item.unidade ?? ''} × {moeda(item.valor_unitario)} = <strong>{moeda(item.valor_total)}</strong></p>
      </div>)}
    </div>
    <p className="rounded-lg bg-slate-900 px-4 py-3 text-right text-white">Total: <strong className="ml-2 text-lg">{moeda(compra.valor_total)}</strong></p>
  </div>;
}
