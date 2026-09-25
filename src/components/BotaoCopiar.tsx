import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

/**
 * Texto que se copia com um clique — feito para o número do SEI, que é
 * colado no sistema interno da prefeitura o tempo todo.
 *
 * Tenta a área de transferência do navegador; se o navegador recusar (acontece
 * em contexto sem HTTPS ou dentro de alguns iframes), cai para o método antigo
 * e, em último caso, seleciona o texto para a pessoa apertar Ctrl+C.
 */
export function BotaoCopiar({
  texto,
  rotulo = 'Copiar',
  className = '',
  href,
}: {
  texto: string;
  rotulo?: string;
  className?: string;
  /** Quando presente, o número abre a consulta externa em vez de ser copiado. */
  href?: string | null;
}) {
  const [estado, setEstado] = useState<'parado' | 'copiado'>('parado');
  const alvo = useRef<HTMLSpanElement>(null);
  const relogio = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(relogio.current), []);

  function confirmar() {
    setEstado('copiado');
    window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(() => setEstado('parado'), 1600);
  }

  function selecionarComoUltimoRecurso() {
    const no = alvo.current;
    if (!no) return;
    const intervalo = document.createRange();
    intervalo.selectNodeContents(no);
    const selecao = window.getSelection();
    selecao?.removeAllRanges();
    selecao?.addRange(intervalo);
  }

  async function copiar() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        confirmar();
        return;
      }
      throw new Error('sem area de transferencia');
    } catch {
      // Navegadores antigos e iframes restritos
      try {
        const caixa = document.createElement('textarea');
        caixa.value = texto;
        caixa.setAttribute('readonly', '');
        caixa.style.position = 'fixed';
        caixa.style.opacity = '0';
        document.body.appendChild(caixa);
        caixa.select();
        const deu = document.execCommand('copy');
        document.body.removeChild(caixa);
        if (deu) confirmar();
        else selecionarComoUltimoRecurso();
      } catch {
        selecionarComoUltimoRecurso();
      }
    }
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`${rotulo}: ${texto}`}
        aria-label={`${rotulo} ${texto} em nova aba`}
        className={`group/link inline-flex max-w-full items-center gap-1 rounded px-0.5 py-0.5 text-left
          underline decoration-dotted underline-offset-2 hover:bg-slate-100 hover:text-marca-700
          focus-visible:bg-slate-100 focus-visible:text-marca-700 ${className}`}
      >
        <span className="truncate">{texto}</span>
        <ExternalLink className="size-3 shrink-0 text-slate-400 group-hover/link:text-marca-600" aria-hidden="true" />
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={`${rotulo}: ${texto}`}
      aria-label={`${rotulo} ${texto}`}
      className={`group/copiar inline-flex max-w-full items-center gap-0.5 rounded px-0.5 py-0.5 text-left
        hover:bg-slate-100 focus-visible:bg-slate-100 ${className}`}
    >
      <span ref={alvo} className="truncate">
        {texto}
      </span>
      {estado === 'copiado' ? (
        <Check className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy
          className="size-3 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover/copiar:opacity-100 group-focus-visible/copiar:opacity-100"
          aria-hidden="true"
        />
      )}
      <span className="sr-only" role="status">
        {estado === 'copiado' ? 'Número copiado' : ''}
      </span>
    </button>
  );
}
