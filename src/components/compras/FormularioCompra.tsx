import { Plus, Trash2 } from 'lucide-react';
import { CampoDinheiro, CampoLista, CampoTexto } from '../ui/Campo';
import { Botao } from '../ui/Botao';
import { opcoesDeSetor } from '../../lib/setores';
import { hojeISO, moeda, paraNumero } from '../../lib/formato';
import type { Compra, CompraItem, DadosCompra, Setor } from '../../lib/types';
import type { NotaEmpenhoExtraida } from '../../lib/notaEmpenho';

export interface ItemFormulario {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
}

export interface FormularioCompraEstado {
  numero_empenho: string;
  numero_processo: string;
  data_compra: string;
  fornecedor_nome: string;
  fornecedor_documento: string;
  id_setor_responsavel: string;
  itens: ItemFormulario[];
}

const itemVazio = (): ItemFormulario => ({
  codigo: '', descricao: '', unidade: '', quantidade: '1', valor_unitario: '',
});

export function estadoCompraInicial(origem?: Compra | NotaEmpenhoExtraida): FormularioCompraEstado {
  if (!origem) return {
    numero_empenho: '', numero_processo: '', data_compra: hojeISO(), fornecedor_nome: '',
    fornecedor_documento: '', id_setor_responsavel: '', itens: [itemVazio()],
  };
  const compra = origem as Compra;
  return {
    numero_empenho: origem.numero_empenho ?? '',
    numero_processo: origem.numero_processo ?? '',
    data_compra: origem.data_compra ?? '',
    fornecedor_nome: origem.fornecedor_nome ?? '',
    fornecedor_documento: origem.fornecedor_documento ?? '',
    id_setor_responsavel: compra.id_setor_responsavel
      ? String(compra.id_setor_responsavel) : '',
    itens: origem.itens?.length ? origem.itens.map((item) => ({
      codigo: item.codigo ?? '',
      descricao: item.descricao,
      unidade: item.unidade ?? '',
      quantidade: String(item.quantidade || ''),
      valor_unitario: String(item.valor_unitario || ''),
    })) : [itemVazio()],
  };
}

export function totalFormulario(form: FormularioCompraEstado): number {
  return Math.round(form.itens.reduce(
    (soma, item) => soma + Number(item.quantidade) * paraNumero(item.valor_unitario), 0,
  ) * 100) / 100;
}

export function validarFormularioCompra(form: FormularioCompraEstado): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!form.numero_empenho.trim()) erros.numero_empenho = 'Informe o Nº do Empenho.';
  if (!form.numero_processo.trim()) erros.numero_processo = 'Informe o Nº do Processo.';
  if (!form.data_compra) erros.data_compra = 'Informe uma data válida.';
  if (!form.fornecedor_nome.trim()) erros.fornecedor_nome = 'Informe o fornecedor.';
  if (!form.id_setor_responsavel) erros.id_setor_responsavel = 'Selecione o setor responsável.';
  form.itens.forEach((item, indice) => {
    if (!item.descricao.trim()) erros[`item.${indice}.descricao`] = 'Informe a descrição.';
    if (!(Number(item.quantidade) > 0)) erros[`item.${indice}.quantidade`] = 'Quantidade inválida.';
    if (!(paraNumero(item.valor_unitario) >= 0) || !item.valor_unitario.trim()) {
      erros[`item.${indice}.valor_unitario`] = 'Informe o valor unitário.';
    }
  });
  return erros;
}

export function dadosDoFormulario(form: FormularioCompraEstado): DadosCompra {
  const itens: CompraItem[] = form.itens.map((item) => {
    const quantidade = Number(item.quantidade);
    const valorUnitario = Math.round(paraNumero(item.valor_unitario) * 100) / 100;
    return {
      codigo: item.codigo.trim() || null,
      descricao: item.descricao.trim(),
      unidade: item.unidade.trim() || null,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: Math.round(quantidade * valorUnitario * 100) / 100,
    };
  });
  return {
    numero_empenho: form.numero_empenho.trim(),
    numero_processo: form.numero_processo.trim(),
    data_compra: form.data_compra,
    fornecedor_nome: form.fornecedor_nome.trim(),
    fornecedor_documento: form.fornecedor_documento.trim() || null,
    id_setor_responsavel: Number(form.id_setor_responsavel),
    itens,
    valor_total: Math.round(itens.reduce((s, item) => s + item.valor_total, 0) * 100) / 100,
  };
}

export function FormularioCompra({
  form, aoMudar, setores, erros = {}, processoBloqueado = false,
}: {
  form: FormularioCompraEstado;
  aoMudar: (form: FormularioCompraEstado) => void;
  setores: Setor[];
  erros?: Record<string, string>;
  processoBloqueado?: boolean;
}) {
  const mudar = (campo: keyof Omit<FormularioCompraEstado, 'itens'>) => (valor: string) =>
    aoMudar({ ...form, [campo]: valor });
  const mudarItem = (indice: number, campo: keyof ItemFormulario, valor: string) =>
    aoMudar({ ...form, itens: form.itens.map((item, i) => i === indice ? { ...item, [campo]: valor } : item) });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto rotulo="Nº do Empenho" obrigatorio valor={form.numero_empenho}
          aoMudar={mudar('numero_empenho')} erro={erros.numero_empenho} placeholder="E11369/2026" />
        <CampoTexto rotulo="Nº do Processo" obrigatorio valor={form.numero_processo}
          aoMudar={mudar('numero_processo')} erro={erros.numero_processo}
          ajuda={processoBloqueado ? 'Deve corresponder ao processo que está sendo concluído.' : undefined}
          placeholder="PMC.2026.00012545-05" />
        <CampoTexto rotulo="Data" obrigatorio tipo="date" valor={form.data_compra}
          aoMudar={mudar('data_compra')} erro={erros.data_compra} />
        <CampoLista rotulo="Setor responsável" obrigatorio valor={form.id_setor_responsavel}
          aoMudar={mudar('id_setor_responsavel')} erro={erros.id_setor_responsavel}
          opcoes={opcoesDeSetor(setores)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto rotulo="Fornecedor" obrigatorio valor={form.fornecedor_nome}
          aoMudar={mudar('fornecedor_nome')} erro={erros.fornecedor_nome} />
        <CampoTexto rotulo="CNPJ/CPF" valor={form.fornecedor_documento}
          aoMudar={mudar('fornecedor_documento')} placeholder="00.000.000/0000-00" />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900">Itens</h3>
          <Botao aparencia="neutro" icone={<Plus className="size-4" />}
            onClick={() => aoMudar({ ...form, itens: [...form.itens, itemVazio()] })}>
            Adicionar item
          </Botao>
        </div>
        {form.itens.map((item, indice) => {
          const total = Math.round(Number(item.quantidade) * paraNumero(item.valor_unitario) * 100) / 100;
          return (
            <div key={indice} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <strong className="text-sm text-slate-800">Item {indice + 1}</strong>
                {form.itens.length > 1 && (
                  <button type="button" onClick={() => aoMudar({ ...form, itens: form.itens.filter((_, i) => i !== indice) })}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remover item ${indice + 1}`}><Trash2 className="size-4" /></button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CampoTexto rotulo="Código" valor={item.codigo} aoMudar={(v) => mudarItem(indice, 'codigo', v)} />
                <CampoTexto rotulo="Unidade" valor={item.unidade} aoMudar={(v) => mudarItem(indice, 'unidade', v)} placeholder="UN" />
                <div className="sm:col-span-2">
                  <CampoTexto rotulo="Descrição" obrigatorio linhas={2} valor={item.descricao}
                    aoMudar={(v) => mudarItem(indice, 'descricao', v)} erro={erros[`item.${indice}.descricao`]} />
                </div>
                <CampoTexto rotulo="Quantidade" obrigatorio tipo="number" min={0.01} valor={item.quantidade}
                  aoMudar={(v) => mudarItem(indice, 'quantidade', v)} erro={erros[`item.${indice}.quantidade`]} />
                <CampoDinheiro rotulo="Valor unitário" obrigatorio valor={item.valor_unitario}
                  aoMudar={(v) => mudarItem(indice, 'valor_unitario', v)} erro={erros[`item.${indice}.valor_unitario`]} />
              </div>
              <p className="mt-3 text-right text-sm text-slate-600">Total do item: <strong className="text-slate-900">{moeda(total)}</strong></p>
            </div>
          );
        })}
        <div className="rounded-lg bg-slate-900 px-4 py-3 text-right text-white">
          Valor total: <strong className="ml-2 text-lg">{moeda(totalFormulario(form))}</strong>
        </div>
      </section>
    </div>
  );
}
