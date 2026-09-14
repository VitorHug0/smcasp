// =============================================================================
//  Hook simples de carregamento: guarda dados, "carregando" e mensagem de erro.
//  Evita repetir o mesmo try/catch em todas as telas.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { ErroDaApi } from '../lib/api';

export interface EstadoDados<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

export function useDados<T>(buscar: () => Promise<T>, dependencias: unknown[] = []): EstadoDados<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gatilho, setGatilho] = useState(0);

  const recarregar = useCallback(() => setGatilho((n) => n + 1), []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);

    buscar()
      .then((resultado) => {
        if (ativo) setDados(resultado);
      })
      .catch((e: unknown) => {
        if (!ativo) return;
        setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar as informações.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatilho, ...dependencias]);

  return { dados, carregando, erro, recarregar };
}
