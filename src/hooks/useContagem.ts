// =============================================================================
//  CONTAGEM ANIMADA DOS NÚMEROS
//
//  Faz o número subir de zero até o valor final quando a tela abre. Não é só
//  enfeite: o olho acompanha o movimento e para no número, o que ajuda a
//  perceber que aquele valor mudou desde a última vez que a pessoa olhou.
//
//  Três cuidados que a versão ingênua não tem:
//
//  1. QUEM PEDIU MENOS MOVIMENTO NÃO VÊ MOVIMENTO. Se o sistema operacional
//     está configurado para reduzir animações — o que muita gente usa por
//     enjoo ou enxaqueca —, o número aparece pronto.
//  2. A CONTAGEM SAI DO VALOR ANTERIOR, não de zero, quando o valor muda com a
//     tela já aberta (trocar o ano, por exemplo). Voltar a zero para subir de
//     novo pareceria que o painel se perdeu.
//  3. TERMINA NO VALOR EXATO. Interpolação com número quebrado erra centavos;
//     o último quadro grava o valor recebido, sem conta nenhuma.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

/** Desaceleração no fim: rápido no começo, suave ao chegar. */
const suavizar = (t: number): number => 1 - Math.pow(1 - t, 3);

const querMenosMovimento = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export function useContagem(destino: number, duracao = 900): number {
  const semMovimento = querMenosMovimento();
  const [atual, setAtual] = useState(() => (semMovimento ? destino : 0));
  const partida = useRef(0);

  useEffect(() => {
    if (semMovimento || !Number.isFinite(destino)) {
      setAtual(destino);
      partida.current = destino;
      return;
    }

    const inicio = partida.current;
    const distancia = destino - inicio;
    if (distancia === 0) return;

    let quadro = 0;
    let comeco: number | null = null;

    const passo = (agora: number) => {
      if (comeco === null) comeco = agora;
      const decorrido = agora - comeco;
      const fracao = Math.min(1, decorrido / duracao);

      if (fracao >= 1) {
        // O último quadro grava o valor recebido, sem interpolação: é o que
        // garante que os centavos batam com o resto do sistema.
        setAtual(destino);
        partida.current = destino;
        return;
      }

      setAtual(inicio + distancia * suavizar(fracao));
      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [destino, duracao, semMovimento]);

  return atual;
}
