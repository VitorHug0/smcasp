// =============================================================================
//  PEDIR ACESSO  ·  /cadastro
//
//  Qualquer pessoa preenche este formulário, e nenhuma entra por ele: o
//  cadastro nasce PENDENTE e como Leitor, sempre — isso é forçado no servidor
//  (worker/auth.ts), não aqui. Se o papel viesse da tela, bastaria alterar o
//  que o navegador envia para virar administrador sem passar por ninguém.
//
//  As conferências desta tela são só cortesia: avisar do erro antes de esperar
//  a ida e volta ao servidor. O servidor confere tudo de novo.
// =============================================================================

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, ErroDaApi } from '../lib/api';
import { MolduraDeAcesso } from '../components/MolduraDeAcesso';
import { Botao } from '../components/ui/Botao';
import { CampoLista, CampoSenha, CampoTexto } from '../components/ui/Campo';
import { AvisoErro } from '../components/ui/Estados';
import type { Setor } from '../lib/types';

/** Mesma exigência do servidor, escrita para a pessoa antes de ela errar. */
const MINIMO_SENHA = 8;

export function Cadastro({
  aoVoltarParaLogin,
  aoCadastrar,
}: {
  aoVoltarParaLogin: () => void;
  /** Leva para a tela de espera com a mensagem que o servidor devolveu. */
  aoCadastrar: (mensagem: string) => void;
}) {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [idSetor, setIdSetor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A lista de setores vem por uma rota aberta: quem ainda não tem conta não
  // pode chamar /api/setores, e sem os setores não há como preencher o campo.
  useEffect(() => {
    let ativo = true;
    api.cadastro
      .setores()
      .then((s) => {
        if (ativo) setSetores(s);
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar a lista de setores. Recarregue a página.');
      });
    return () => {
      ativo = false;
    };
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;

    if (nome.trim().length < 3) return setErro('Escreva seu nome completo.');
    if (!email.trim()) return setErro('Escreva o seu e-mail.');
    if (!idSetor) return setErro('Escolha o seu setor.');
    if (senha.length < MINIMO_SENHA) {
      return setErro(`A senha precisa ter ao menos ${MINIMO_SENHA} caracteres.`);
    }
    if (senha !== confirmacao) return setErro('As duas senhas digitadas não são iguais.');

    setEnviando(true);
    setErro(null);
    try {
      const r = await api.cadastro.enviar({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        id_setor: Number(idSetor),
      });
      setSenha('');
      setConfirmacao('');
      aoCadastrar(r.mensagem);
    } catch (err) {
      setSenha('');
      setConfirmacao('');
      setErro(
        err instanceof ErroDaApi
          ? err.message
          : 'Não foi possível enviar o cadastro. Tente de novo.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MolduraDeAcesso
      largura="media"
      titulo="Criar conta"
      subtitulo="Preencha os dados e aguarde a liberação do Administrador Geral."
      rodape="Dúvidas? Procure a Coordenadoria Setorial Administrativa (CSA)."
    >
      <form onSubmit={enviar} className="space-y-4">
        {erro && <AvisoErro mensagem={erro} />}

        <CampoTexto
          rotulo="Nome completo"
          obrigatorio
          valor={nome}
          aoMudar={setNome}
          placeholder="Como você assina os processos"
        />

        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          obrigatorio
          valor={email}
          aoMudar={setEmail}
          placeholder="nome@campinas.sp.gov.br"
          ajuda="Use o e-mail institucional — é por ele que você vai entrar."
        />

        <CampoLista
          rotulo="Setor"
          obrigatorio
          valor={idSetor}
          aoMudar={setIdSetor}
          vazio="Escolha o seu setor…"
          opcoes={setores.map((s) => ({ valor: s.id, texto: s.nome, grupo: s.grupo }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSenha
            rotulo="Senha"
            obrigatorio
            valor={senha}
            aoMudar={setSenha}
            autoComplete="new-password"
            ajuda={`Ao menos ${MINIMO_SENHA} caracteres.`}
          />
          <CampoSenha
            rotulo="Repita a senha"
            obrigatorio
            valor={confirmacao}
            aoMudar={setConfirmacao}
            autoComplete="new-password"
            erro={
              confirmacao && senha !== confirmacao ? 'As senhas não são iguais.' : undefined
            }
          />
        </div>

        <p className="rounded-lg border border-marca-200 bg-marca-50 px-3.5 py-3 text-sm text-marca-900">
          Todo cadastro entra na fila como <strong>somente consulta</strong>. Quem define o
          seu perfil de acesso é o Administrador Geral, na hora de liberar.
        </p>

        <Botao
          type="submit"
          aparencia="primario"
          carregando={enviando}
          icone={<UserPlus className="size-4" />}
          className="w-full justify-center py-3 text-base"
        >
          Enviar cadastro
        </Botao>

        <p className="border-t border-slate-200 pt-4 text-center text-sm text-slate-600">
          Já tem conta?{' '}
          <button
            type="button"
            onClick={aoVoltarParaLogin}
            className="font-semibold text-marca-700 underline underline-offset-2 hover:text-marca-800"
          >
            Entrar
          </button>
        </p>
      </form>
    </MolduraDeAcesso>
  );
}
