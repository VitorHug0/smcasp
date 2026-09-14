import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Aparencia = 'primario' | 'neutro' | 'perigo' | 'discreto';

const APARENCIAS: Record<Aparencia, string> = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 shadow-sm',
  neutro: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  perigo: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
  discreto: 'bg-transparent text-slate-600 hover:bg-slate-100',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  aparencia?: Aparencia;
  icone?: ReactNode;
  carregando?: boolean;
}

export function Botao({
  aparencia = 'neutro',
  icone,
  carregando = false,
  children,
  className = '',
  disabled,
  ...resto
}: Props) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      // O leve encolher ao apertar é o retorno que diz "o clique chegou" —
      // vale mais que o crescer no hover, que em botão de texto embaça a fonte
      // por um instante. Sob "reduzir movimento", as duas coisas somem.
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm
        font-semibold transition-all duration-150 ease-out
        hover:scale-[1.03] active:scale-95
        disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100
        ${APARENCIAS[aparencia]} ${className}`}
    >
      {carregando ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icone
      )}
      {children}
    </button>
  );
}
