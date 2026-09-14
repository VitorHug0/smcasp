// =============================================================================
//  A moldura das três telas de fora: entrar, criar conta e aguardar liberação.
//
//  Ficam iguais de propósito. Quem acaba de se cadastrar e cai na tela de
//  espera precisa reconhecer na hora que continua no mesmo sistema — trocar o
//  fundo e a marca no meio do caminho faz parecer que algo deu errado.
// =============================================================================

import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

export function MolduraDeAcesso({
  titulo,
  subtitulo,
  children,
  rodape,
  largura = 'estreita',
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  rodape?: ReactNode;
  /** O cadastro tem mais campos e respira melhor um pouco mais largo. */
  largura?: 'estreita' | 'media';
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-marca-900 px-4 py-10">
      <div className={`w-full ${largura === 'media' ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="size-7 text-white" />
          </span>
          <h1 className="text-2xl font-bold text-white">Painel da Secretaria</h1>
          <p className="mt-1 text-sm text-marca-200">Controle interno · SMCASP</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
            {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
          </div>
          {children}
        </div>

        {rodape && (
          <div className="mt-5 text-center text-xs leading-relaxed text-marca-200/80">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
