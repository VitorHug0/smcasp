import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Botao } from './Botao';

export function Carregando({ texto = 'Carregando informações…' }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-6 py-16 text-slate-500">
      <span className="size-8 animate-spin rounded-full border-3 border-slate-200 border-t-marca-500" />
      <p className="text-sm font-medium">{texto}</p>
    </div>
  );
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <Inbox className="size-10 text-slate-300" />
      <p className="text-base font-semibold text-slate-700">{titulo}</p>
      <p className="max-w-sm text-sm text-slate-500">{texto}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

export function Falha({ mensagem, aoTentarDeNovo }: { mensagem: string; aoTentarDeNovo?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-14 text-center">
      <AlertTriangle className="size-9 text-red-500" />
      <p className="text-base font-semibold text-red-900">Algo não funcionou</p>
      <p className="max-w-md text-sm text-red-700">{mensagem}</p>
      {aoTentarDeNovo && (
        <Botao aparencia="neutro" icone={<RefreshCw className="size-4" />} onClick={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      )}
    </div>
  );
}

/** Faixa de erro usada dentro dos formulários. */
export function AvisoErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{mensagem}</span>
    </div>
  );
}
