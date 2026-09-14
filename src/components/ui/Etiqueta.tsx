import type { ReactNode } from 'react';

export type Tom = 'verde' | 'ambar' | 'vermelho' | 'azul' | 'cinza';

const TONS: Record<Tom, string> = {
  verde: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  ambar: 'bg-amber-100 text-amber-900 ring-amber-200',
  vermelho: 'bg-red-100 text-red-800 ring-red-200',
  azul: 'bg-marca-100 text-marca-700 ring-marca-200',
  cinza: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export function Etiqueta({
  tom = 'cinza',
  children,
  icone,
}: {
  tom?: Tom;
  children: ReactNode;
  icone?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1
        text-xs font-semibold ring-1 ring-inset ${TONS[tom]}`}
    >
      {icone}
      {children}
    </span>
  );
}

/**
 * Cor por prazo de CONTRATO: 30 dias ou menos é crítico (não dá tempo de
 * licitar), até 90 dias é atenção — é a janela de renovação.
 */
export function tomDoPrazo(dias: number | null): Tom {
  if (dias === null) return 'cinza';
  if (dias <= 30) return 'vermelho';
  if (dias <= 90) return 'ambar';
  return 'verde';
}

/** Cor por prazo de TAREFA: a escala é de dias, não de meses. */
export function tomDoPrazoTarefa(dias: number | null): Tom {
  if (dias === null) return 'cinza';
  if (dias <= 7) return 'vermelho';
  if (dias <= 30) return 'ambar';
  return 'verde';
}

export function tomDaPrioridade(prioridade: string): Tom {
  if (prioridade === 'Alta') return 'vermelho';
  if (prioridade === 'Média') return 'ambar';
  return 'cinza';
}
