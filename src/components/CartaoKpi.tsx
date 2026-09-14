import type { CSSProperties } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { useContagem } from '../hooks/useContagem';

type Tom = 'azul' | 'verde' | 'ambar' | 'vermelho';

interface Props {
  titulo: string;
  /** O número cru — o cartão anima a contagem e formata na hora de mostrar. */
  valor: number;
  /** Como escrever o número: moeda, quantidade, o que for. */
  formatar: (n: number) => string;
  detalhe?: string;
  Icone: LucideIcon;
  tom?: Tom;
  /** Quando presente, o cartão vira botão e leva para a tela do assunto. */
  aoClicar?: () => void;
  /** Texto do destino, para quem navega por leitor de tela. */
  destino?: string;
  /** Pulso suave na faixa lateral — reservado para o que está crítico agora. */
  pulsando?: boolean;
}

/**
 * Cada tom traz, além das cores de sempre, a cor do brilho que aparece sob o
 * cartão quando o mouse passa. O brilho é a própria cor do assunto: o cartão
 * de processos atrasados brilha vermelho, o de saldo brilha verde.
 */
const TONS: Record<Tom, { fundo: string; icone: string; barra: string; brilho: string; anel: string }> = {
  azul: {
    fundo: 'bg-marca-50', icone: 'text-marca-600', barra: 'bg-marca-500',
    brilho: 'rgba(47,111,235,.42)', anel: 'rgba(47,111,235,.35)',
  },
  verde: {
    fundo: 'bg-emerald-50', icone: 'text-emerald-600', barra: 'bg-emerald-500',
    brilho: 'rgba(5,150,105,.40)', anel: 'rgba(5,150,105,.34)',
  },
  ambar: {
    fundo: 'bg-amber-50', icone: 'text-amber-600', barra: 'bg-amber-500',
    brilho: 'rgba(217,119,6,.42)', anel: 'rgba(217,119,6,.34)',
  },
  vermelho: {
    fundo: 'bg-red-50', icone: 'text-red-600', barra: 'bg-red-500',
    brilho: 'rgba(220,38,38,.42)', anel: 'rgba(220,38,38,.34)',
  },
};

/**
 * Número grande, rótulo em linguagem simples e uma linha de contexto embaixo.
 * A faixa colorida à esquerda dá o recado antes mesmo da leitura.
 *
 * Quando o cartão tem para onde levar, ele é um botão de verdade — com foco de
 * teclado e destino anunciado. Um cartão que sobe ao passar o mouse e não faz
 * nada é uma promessa quebrada: o movimento diz "clique aqui".
 */
export function CartaoKpi({
  titulo,
  valor,
  formatar,
  detalhe,
  Icone,
  tom = 'azul',
  aoClicar,
  destino,
  pulsando = false,
}: Props) {
  const cores = TONS[tom];
  const contado = useContagem(valor);

  const Envelope = aoClicar ? 'button' : 'div';
  const estilo = { '--brilho': cores.brilho, '--anel': cores.anel } as CSSProperties;

  return (
    <Envelope
      {...(aoClicar
        ? { type: 'button' as const, onClick: aoClicar, 'aria-label': destino ? `${titulo}. ${destino}` : titulo }
        : {})}
      style={estilo}
      className={`cartao-kpi group relative w-full overflow-hidden rounded-xl border border-slate-200
        bg-white p-5 text-left shadow-sm transition-all duration-300 ease-out
        hover:-translate-y-1 focus-visible:-translate-y-1
        ${aoClicar ? 'cursor-pointer' : ''}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${cores.barra} ${pulsando ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug text-slate-600">{titulo}</p>
          <span className={`relative shrink-0 rounded-lg p-2 ${cores.fundo}`}>
            <Icone className={`size-5 ${cores.icone}`} />
            {/* A seta só aparece no hover, e só onde há para onde ir. */}
            {aoClicar && (
              <ArrowUpRight
                className={`absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-white p-px opacity-0
                  shadow-sm transition-opacity duration-200 group-hover:opacity-100
                  group-focus-visible:opacity-100 ${cores.icone}`}
                aria-hidden="true"
              />
            )}
          </span>
        </div>
        <p className="mt-2 break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 tabular-nums">
          {formatar(contado)}
        </p>
        {detalhe && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{detalhe}</p>}
      </div>
    </Envelope>
  );
}
