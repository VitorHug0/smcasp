// =============================================================================
//  NA FILA  ·  /aguardando-aprovacao
//
//  Chega-se aqui por dois caminhos: acabou de se cadastrar, ou tentou entrar
//  com a senha certa numa conta que ainda não foi liberada. Nos dois casos não
//  existe sessão nenhuma — esta tela é só um recado, não uma antessala do
//  sistema.
//
//  O botão "Já fui liberado? Tentar entrar" existe porque a alternativa seria
//  a pessoa ficar recarregando a página para ver se alguma coisa mudou.
// =============================================================================

import { Clock, LogIn } from 'lucide-react';
import { MolduraDeAcesso } from '../components/MolduraDeAcesso';
import { Botao } from '../components/ui/Botao';

export function AguardandoAprovacao({
  mensagem,
  aoVoltarParaLogin,
}: {
  mensagem: string;
  aoVoltarParaLogin: () => void;
}) {
  return (
    <MolduraDeAcesso
      titulo="Cadastro enviado"
      rodape="A liberação é feita pela Coordenadoria Setorial Administrativa (CSA)."
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-900">{mensagem}</p>
        </div>

        <div className="space-y-2 text-sm leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-800">O que acontece agora</p>
          <p>
            O Administrador Geral vê o seu pedido na tela de usuários, escolhe o seu perfil
            de acesso e libera a conta. Depois disso você entra com o mesmo e-mail e a
            mesma senha que acabou de cadastrar — não é preciso repetir o cadastro.
          </p>
          <p>
            Se estiver demorando, avise a CSA: pode ser que ninguém tenha visto o pedido.
          </p>
        </div>

        <Botao
          aparencia="primario"
          icone={<LogIn className="size-4" />}
          onClick={aoVoltarParaLogin}
          className="w-full justify-center py-3 text-base"
        >
          Já fui liberado? Tentar entrar
        </Botao>
      </div>
    </MolduraDeAcesso>
  );
}
