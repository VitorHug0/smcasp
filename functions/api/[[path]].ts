// =============================================================================
//  Adaptador para quem preferir publicar como Cloudflare PAGES (Pages Functions)
//  em vez de Workers com assets.
//
//  Nesse caso:
//    * o build do front-end continua indo para ./dist
//    * esta pasta `functions/` é detectada automaticamente pelo Pages
//    * o binding D1 chamado DB é criado no painel:
//        Pages > seu projeto > Settings > Functions > D1 database bindings
//    * publique com:  npx wrangler pages deploy dist
//
//  Se você seguir o caminho de Workers (npm run deploy), pode apagar esta pasta.
// =============================================================================

import { tratarApi } from '../../worker/router';
import type { Env } from '../../worker/db';

export const onRequest = (contexto: { request: Request; env: Env }): Promise<Response> =>
  tratarApi(contexto.request, contexto.env);
