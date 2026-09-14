// =============================================================================
//  TELA DE ENTRADA  ·  /login
//
//  A conferência de e-mail e senha acontece no servidor (worker/auth.ts) — esta
//  tela só recolhe o que foi digitado e mostra o que o servidor respondeu. É de
//  propósito: senha conferida no navegador é senha publicada, porque qualquer
//  pessoa abre o código da página e lê.
//
//  Três respostas possíveis, três caminhos:
//    401                    e-mail ou senha errados  -> fica aqui, com o aviso
//    403 situacao PENDENTE  ainda não foi liberado    -> vai para a tela de espera
//    403 situacao BLOQUEADO acesso suspenso           -> fica aqui, com o aviso
// =============================================================================

import { useState } from 'react';
import { api, ErroDaApi } from '../lib/api';
import { MolduraDeAcesso } from '../components/MolduraDeAcesso';
import { Botao } from '../components/ui/Botao';
import { CampoSenha, CampoTexto } from '../components/ui/Campo';
import { AvisoErro } from '../components/ui/Estados';
import type { UsuarioSessao } from '../lib/types';

export function Login({
  aoEntrar,
  aoPedirCadastro,
  aoFicarPendente,
}: {
  aoEntrar: (usuario: UsuarioSessao) => void;
  aoPedirCadastro: () => void;
  /** Senha certa, conta ainda na fila: quem manda para /aguardando-aprovacao. */
  aoFicarPendente: (mensagem: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [manter, setManter] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (entrando) return;

    if (!email.trim() || !senha) {
      setErro('Preencha o e-mail e a senha.');
      return;
    }

    setEntrando(true);
    setErro(null);
    try {
      const r = await api.sessao.entrar(email.trim(), senha, manter);
      // A senha some da memória da tela assim que deixa de ser necessária.
      setSenha('');
      if (r.usuario) aoEntrar(r.usuario);
    } catch (err) {
      setSenha('');
      if (err instanceof ErroDaApi && err.situacao === 'PENDENTE') {
        aoFicarPendente(err.message);
        return;
      }
      setErro(
        err instanceof ErroDaApi ? err.message : 'Não foi possível entrar. Tente de novo.',
      );
    } finally {
      setEntrando(false);
    }
  }

  return (
    <MolduraDeAcesso
      titulo="Entrar"
      subtitulo="Use o e-mail institucional cadastrado."
      rodape="Esqueceu a senha? Procure a Coordenadoria Setorial Administrativa (CSA)."
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <AvisoErro mensagem={erro} />}

        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          valor={email}
          aoMudar={setEmail}
          placeholder="nome@campinas.sp.gov.br"
        />

        <CampoSenha rotulo="Senha" valor={senha} aoMudar={setSenha} />

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={manter}
            onChange={(e) => setManter(e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer rounded border-slate-300 text-marca-600 focus:ring-2 focus:ring-marca-500"
          />
          <span>
            Manter conectado neste computador
            <span className="block text-xs text-slate-500">
              Por 30 dias. Não marque em computador compartilhado.
            </span>
          </span>
        </label>

        <Botao
          type="submit"
          aparencia="primario"
          carregando={entrando}
          className="w-full justify-center py-3 text-base"
        >
          Entrar
        </Botao>

        <p className="border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
          Ainda não tem acesso?{' '}
          <button
            type="button"
            onClick={aoPedirCadastro}
            className="font-semibold text-marca-700 underline underline-offset-2 hover:text-marca-800"
          >
            Criar conta
          </button>
        </p>
      </form>
    </MolduraDeAcesso>
  );
}
