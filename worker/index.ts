// =============================================================================
//  Ponto de entrada do Cloudflare Worker.
//  /api/*  -> API (Cloudflare D1)
//  restante -> arquivos estáticos do front-end (pasta dist), com fallback para
//              index.html para que a navegação da SPA funcione em qualquer rota.
// =============================================================================

import { tratarApi } from './router';
import type { Env } from './db';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const resposta = await tratarApi(request, env);
      // Cabeçalhos de segurança básicos nas respostas da API.
      resposta.headers.set('x-content-type-options', 'nosniff');
      return resposta;
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);

    return new Response('Front-end não encontrado. Rode `npm run build` antes do deploy.', {
      status: 404,
    });
  },
} satisfies ExportedHandler<Env>;
