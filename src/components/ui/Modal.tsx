import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: 'media' | 'grande';
}

/**
 * Janela de cadastro rápido. Fecha com Esc ou clicando fora, para que ninguém
 * fique "preso" na tela sem saber como voltar.
 *
 * Vai para o `body` por portal, e não fica onde foi escrita: a tela que a
 * contém está dentro do `.surge`, cuja animação deixa um `transform` de matriz
 * identidade permanente (o `animation-fill-mode: both` mantém o keyframe final
 * aplicado). Qualquer transform diferente de `none` faz o elemento virar
 * containing block de descendentes `position: fixed` — e o `inset-0` da janela
 * passava a medir a área de conteúdo inteira, não a tela. Na planilha de
 * Processos, que é alta, isso jogava a janela para baixo do que se enxerga.
 */
export function Modal({
  aberto,
  titulo,
  descricao,
  aoFechar,
  children,
  rodape,
  largura = 'media',
}: Props) {
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl
          ${largura === 'grande' ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
            {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="rolagem-suave flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {rodape && (
          <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
            {rodape}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
