// =============================================================================
//  QUEM PODE O QUÊ, do lado da tela.
//
//  A palavra final é do servidor: mesmo que alguém force um botão a aparecer,
//  a API recusa a escrita de quem tem perfil de Leitor (worker/router.ts). O
//  que este arquivo faz é evitar o clique inútil — oferecer "Excluir" a quem
//  vai receber "seu acesso é somente para consulta" é uma promessa quebrada.
//
//  O contexto existe para que as células editáveis, que estão espalhadas por
//  centenas de lugares, saibam disso sozinhas em vez de receberem a mesma
//  propriedade repassada de mão em mão por dez níveis de componente.
// =============================================================================

import { createContext, useContext, type ReactNode } from 'react';
import type { UsuarioSessao } from './types';

interface Acesso {
  usuario: UsuarioSessao | null;
  /** Operador e Administrador escrevem; Leitor, não. */
  podeEditar: boolean;
  /** Só o Administrador Geral vê a tela de usuários. */
  ehAdmin: boolean;
}

// Fora do provedor o padrão é "pode": assim um componente isolado (num teste,
// por exemplo) continua se comportando como sempre se comportou.
const Contexto = createContext<Acesso>({ usuario: null, podeEditar: true, ehAdmin: false });

export function ProvedorDeAcesso({
  usuario,
  children,
}: {
  usuario: UsuarioSessao | null;
  children: ReactNode;
}) {
  const valor: Acesso = {
    usuario,
    podeEditar: usuario ? usuario.role !== 'LEITOR' : false,
    ehAdmin: usuario?.role === 'SUPER_ADMIN',
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useAcesso = (): Acesso => useContext(Contexto);

/** Atalho para o caso mais comum: "esta pessoa pode alterar dados?". */
export const usePodeEditar = (): boolean => useContext(Contexto).podeEditar;
