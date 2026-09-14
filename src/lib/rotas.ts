// =============================================================================
//  ENDEREÇOS DAS TELAS
//
//  O painel é uma página só, mas cada tela tem endereço próprio: /processos,
//  /contratos, /admin/usuarios. Não é enfeite — é o que permite deixar a tela
//  de usuários nos favoritos, mandar o endereço da tela de contratos por
//  e-mail e usar o botão "voltar" do navegador sem sair do sistema.
//
//  Um roteador de verdade (react-router e afins) resolveria isto, mas traria
//  uma biblioteca inteira para seis endereços fixos. Aqui bastam a API de
//  histórico do próprio navegador e um aviso quando o endereço muda.
//
//  Para funcionar em recarregamento direto (alguém digitar /contratos na barra
//  do navegador), o servidor precisa devolver o index.html em qualquer rota que
//  não seja /api — é o que faz o "not_found_handling: single-page-application"
//  no wrangler.jsonc.
// =============================================================================

import { useCallback, useEffect, useState } from 'react';

/** Endereços que existem antes de entrar. */
export const ROTA_LOGIN = '/login';
export const ROTA_CADASTRO = '/cadastro';
export const ROTA_AGUARDANDO = '/aguardando-aprovacao';
export const ROTA_USUARIOS = '/admin/usuarios';

export const ROTAS_PUBLICAS = [ROTA_LOGIN, ROTA_CADASTRO, ROTA_AGUARDANDO];

/** Tira barras repetidas e a barra final, para '/processos/' e '/processos' virarem o mesmo. */
export function normalizar(caminho: string): string {
  const limpo = caminho.replace(/\/+$/, '');
  return limpo === '' ? '/' : limpo;
}

/**
 * Devolve o endereço atual e uma função para trocar de endereço.
 *
 * `substituir` troca a entrada atual do histórico em vez de empilhar outra —
 * é o certo para redirecionamentos automáticos (mandar quem não entrou para o
 * login), senão o botão "voltar" devolve a pessoa a uma tela que ela nunca viu.
 */
export function useCaminho(): [string, (destino: string, substituir?: boolean) => void] {
  const [caminho, setCaminho] = useState(() =>
    typeof window === 'undefined' ? '/' : normalizar(window.location.pathname),
  );

  useEffect(() => {
    const aoVoltar = () => setCaminho(normalizar(window.location.pathname));
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  const navegar = useCallback((destino: string, substituir = false) => {
    const alvo = normalizar(destino);
    if (normalizar(window.location.pathname) !== alvo) {
      if (substituir) window.history.replaceState(null, '', alvo);
      else window.history.pushState(null, '', alvo);
    }
    setCaminho(alvo);
  }, []);

  return [caminho, navegar];
}
