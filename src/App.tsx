import { useCallback, useEffect, useState } from 'react';
import { LogOut, Menu, RefreshCw } from 'lucide-react';
import { api, quandoPerderSessao } from './lib/api';
import { ITENS_MENU, MenuLateral, telaDoCaminho } from './components/MenuLateral';
import {
  ROTA_AGUARDANDO,
  ROTA_CADASTRO,
  ROTA_LOGIN,
  ROTAS_PUBLICAS,
  useCaminho,
} from './lib/rotas';
import { ProvedorDeAcesso } from './lib/permissoes';
import { Botao } from './components/ui/Botao';
import { Carregando, Falha } from './components/ui/Estados';
import { Etiqueta } from './components/ui/Etiqueta';
import { VisaoGeral } from './modules/VisaoGeral';
import { Processos } from './modules/Processos';
import { Concluidos } from './modules/Concluidos';
import { Compras } from './modules/Compras';
import { Contratos } from './modules/Contratos';
import { Emendas } from './modules/Emendas';
import { Usuarios } from './modules/Usuarios';
import { Login } from './modules/Login';
import { Cadastro } from './modules/Cadastro';
import { AguardandoAprovacao } from './modules/AguardandoAprovacao';
import { NOME_DO_PAPEL, type Contrato, type Setor, type Usuario, type UsuarioSessao } from './lib/types';

/**
 * Setores, usuários e contratos são carregados uma vez e repassados às telas —
 * eles alimentam as listas de seleção dos formulários em todos os módulos.
 */
/** Onde fica guardada a preferência de menu recolhido, neste navegador. */
const CHAVE_MENU = 'painel-secretaria:menu-recolhido';

/** Mostrada quando alguém recarrega /aguardando-aprovacao e o texto se perdeu. */
const RECADO_PADRAO =
  'Sua conta foi criada com sucesso! Aguarde a liberação do Administrador Geral ' +
  'para acessar o sistema.';

export default function App() {
  const [caminho, navegar] = useCaminho();

  // null = ainda perguntando ao servidor quem está conectado.
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [recadoDeEspera, setRecadoDeEspera] = useState(RECADO_PADRAO);
  /** Tela que a pessoa tentou abrir antes de ser mandada ao login. */
  const [destinoAposLogin, setDestinoAposLogin] = useState('/');

  const [menuAberto, setMenuAberto] = useState(false);
  // Quem trabalha na planilha o dia inteiro não quer reabrir o menu a cada
  // visita, então a escolha fica guardada neste navegador. Se o armazenamento
  // estiver bloqueado, o padrão é o menu aberto — nada quebra.
  const [menuRecolhido, setMenuRecolhido] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MENU) === '1';
    } catch {
      return false;
    }
  });
  const [ano, setAno] = useState(new Date().getFullYear());
  const [versao, setVersao] = useState(0);

  /**
   * Filtros que a visão geral manda junto ao abrir outra tela. Clicar numa
   * coluna do gráfico não deve só trocar de aba: tem de chegar do outro lado
   * com a pergunta já feita.
   */
  const [objetivoEmendas, setObjetivoEmendas] = useState('');
  const [buscaContratos, setBuscaContratos] = useState('');

  /** Vai para uma tela levando (ou limpando) o filtro de partida. */
  const irPara = useCallback(
    (rota: string, filtros: { objetivo?: string; busca?: string } = {}) => {
      setObjetivoEmendas(filtros.objetivo ?? '');
      setBuscaContratos(filtros.busca ?? '');
      navegar(rota);
    },
    [navegar],
  );

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_MENU, menuRecolhido ? '1' : '0');
    } catch {
      /* navegador sem armazenamento — a escolha vale só nesta visita */
    }
  }, [menuRecolhido]);

  const [setores, setSetores] = useState<Setor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregarBase = useCallback(() => setVersao((v) => v + 1), []);

  // Ao abrir, pergunta ao servidor se o cookie de sessão ainda vale — é o que
  // faz o "manter conectado" funcionar sem pedir a senha de novo. O servidor
  // relê o papel e a situação da conta a cada resposta, então quem foi
  // bloqueado ontem cai aqui mesmo com o cookie de 30 dias na mão.
  useEffect(() => {
    let ativo = true;
    api.sessao
      .verificar()
      .then((r) => {
        if (ativo) setUsuario(r.autenticado ? (r.usuario ?? null) : null);
      })
      .catch(() => {
        if (ativo) setUsuario(null);
      })
      .finally(() => {
        if (ativo) setVerificandoSessao(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Se a sessão cair no meio do uso, a tela volta ao login em vez de ficar
  // mostrando erro em cada carregamento.
  useEffect(() => {
    quandoPerderSessao(() => setUsuario(null));
  }, []);

  const ehRotaPublica = ROTAS_PUBLICAS.includes(caminho);
  const item = telaDoCaminho(caminho);
  const ehAdmin = usuario?.role === 'SUPER_ADMIN';

  // ---- Redirecionamentos ----------------------------------------------------
  // Ficam num efeito, e não no meio da renderização, porque mexer no histórico
  // do navegador enquanto o React está desenhando a tela é pedir para as duas
  // coisas discordarem sobre onde a pessoa está.
  useEffect(() => {
    if (verificandoSessao) return;

    if (!usuario) {
      // Sem sessão, só as três telas de fora existem. O endereço que a pessoa
      // tentou abrir fica guardado para levá-la até lá depois de entrar.
      if (!ehRotaPublica) {
        setDestinoAposLogin(caminho);
        navegar(ROTA_LOGIN, true);
      }
      return;
    }

    // Com sessão, as telas de fora não fazem sentido.
    if (ehRotaPublica) {
      navegar('/', true);
      return;
    }
    // A tela de usuários some para quem não é administrador — inclusive para
    // quem digitou o endereço na barra.
    if (item.soAdmin && !ehAdmin) navegar('/', true);
  }, [verificandoSessao, usuario, ehRotaPublica, caminho, item, ehAdmin, navegar]);

  // Só busca os dados depois de haver sessão: sem esta guarda, as três
  // chamadas sairiam já na tela de login e voltariam 401 à toa.
  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    setCarregando(true);
    Promise.all([api.setores.listar(), api.usuarios.listar(), api.contratos.listar()])
      .then(([s, u, c]) => {
        if (!ativo) return;
        setSetores(s);
        setUsuarios(u);
        setContratos(c);
        setErro(null);
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível falar com o servidor. Tente recarregar a página.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [versao, usuario]);

  async function sair() {
    try {
      await api.sessao.sair();
    } catch {
      /* mesmo sem resposta do servidor, a tela volta ao login */
    }
    setUsuario(null);
    setDestinoAposLogin('/');
    navegar(ROTA_LOGIN, true);
  }

  const anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // ---- Telas de fora --------------------------------------------------------

  // Enquanto o servidor não responde, uma tela neutra: mostrar o login e
  // trocá-lo pelo painel meio segundo depois piscaria à toa em quem está
  // com "manter conectado" marcado.
  if (verificandoSessao) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-marca-900">
        <Carregando texto="Verificando o acesso…" />
      </div>
    );
  }

  if (!usuario) {
    if (caminho === ROTA_CADASTRO) {
      return (
        <Cadastro
          aoVoltarParaLogin={() => navegar(ROTA_LOGIN)}
          aoCadastrar={(mensagem) => {
            setRecadoDeEspera(mensagem);
            navegar(ROTA_AGUARDANDO);
          }}
        />
      );
    }

    if (caminho === ROTA_AGUARDANDO) {
      return (
        <AguardandoAprovacao
          mensagem={recadoDeEspera}
          aoVoltarParaLogin={() => navegar(ROTA_LOGIN)}
        />
      );
    }

    return (
      <Login
        aoEntrar={(u) => {
          setUsuario(u);
          navegar(destinoAposLogin === ROTA_LOGIN ? '/' : destinoAposLogin, true);
          setDestinoAposLogin('/');
        }}
        aoPedirCadastro={() => navegar(ROTA_CADASTRO)}
        aoFicarPendente={(mensagem) => {
          setRecadoDeEspera(mensagem);
          navegar(ROTA_AGUARDANDO);
        }}
      />
    );
  }

  // ---- Painel ---------------------------------------------------------------

  const telaAtual = item.soAdmin && !ehAdmin ? ITENS_MENU[0] : item;

  return (
    <ProvedorDeAcesso usuario={usuario}>
      <div className="flex min-h-screen">
        <MenuLateral
          telaAtual={telaAtual.chave}
          aoTrocar={(t) => {
            const destino = ITENS_MENU.find((i) => i.chave === t);
            if (destino) navegar(destino.rota);
            setMenuAberto(false);
          }}
          abertoNoCelular={menuAberto}
          aoFechar={() => setMenuAberto(false)}
          recolhido={menuRecolhido}
          aoAlternarRecolhido={() => setMenuRecolhido((r) => !r)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setMenuAberto(true)}
                aria-label="Abrir menu"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              >
                <Menu className="size-6" />
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold text-slate-900">{telaAtual.titulo}</h1>
                <p className="truncate text-sm text-slate-500">{telaAtual.explicacao}</p>
              </div>

              {telaAtual.chave === 'visao-geral' && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="hidden sm:inline">Ano:</span>
                  <select
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                    className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-marca-500 focus:outline-none focus:ring-4 focus:ring-marca-100"
                  >
                    {anos.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <Botao
                aparencia="neutro"
                icone={<RefreshCw className="size-4" />}
                onClick={recarregarBase}
                className="hidden sm:inline-flex"
              >
                Atualizar
              </Botao>

              <div className="flex items-center gap-2">
                {/* Quem está conectado e com qual perfil. O perfil aparece
                    porque a diferença entre "não posso" e "está quebrado" é
                    justamente essa etiqueta. */}
                <span className="hidden min-w-0 text-right xl:block">
                  <span className="block max-w-[14rem] truncate text-sm font-semibold text-slate-700">
                    {usuario.nome}
                  </span>
                  <span className="block max-w-[14rem] truncate text-xs text-slate-500">
                    {usuario.email}
                  </span>
                </span>
                <span className="hidden lg:inline">
                  <Etiqueta tom={ehAdmin ? 'azul' : 'cinza'}>
                    {NOME_DO_PAPEL[usuario.role]}
                  </Etiqueta>
                </span>
                <Botao
                  aparencia="neutro"
                  icone={<LogOut className="size-4" />}
                  onClick={sair}
                  title="Sair do painel"
                >
                  <span className="hidden sm:inline">Sair</span>
                </Botao>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6">
            {carregando ? (
              <Carregando texto="Preparando o painel…" />
            ) : erro ? (
              <Falha mensagem={erro} aoTentarDeNovo={recarregarBase} />
            ) : (
              // A chave por tela reinicia a animação de surgimento a cada troca
              // de aba: sem ela, o React reaproveitaria o mesmo nó e o conteúdo
              // novo apareceria seco.
              <div key={telaAtual.chave} className="surge">
                {telaAtual.chave === 'visao-geral' && (
                  <VisaoGeral
                    key={versao}
                    ano={ano}
                    atalhos={{
                      aoAbrirContratos: (busca) => irPara('/contratos', { busca }),
                      aoAbrirEmendas: (objetivo) => irPara('/emendas', { objetivo }),
                      aoAbrirProcessos: () => irPara('/processos'),
                      aoAbrirCompras: () => irPara('/compras'),
                    }}
                  />
                )}
                {telaAtual.chave === 'processos' && (
                  <Processos
                    key={versao}
                    setores={setores}
                    usuarios={usuarios}
                    aoAbrirConcluidos={() => navegar('/concluidos')}
                  />
                )}
                {telaAtual.chave === 'concluidos' && (
                  <Concluidos key={versao} setores={setores} usuarios={usuarios} />
                )}
                {telaAtual.chave === 'compras' && (
                  <Compras key={versao} setores={setores} contratos={contratos} />
                )}
                {telaAtual.chave === 'contratos' && (
                  <Contratos
                    key={versao}
                    setores={setores}
                    aoMudar={recarregarBase}
                    buscaInicial={buscaContratos}
                  />
                )}
                {telaAtual.chave === 'emendas' && (
                  <Emendas
                    key={versao}
                    aoMudar={recarregarBase}
                    objetivoInicial={objetivoEmendas}
                  />
                )}
                {telaAtual.chave === 'usuarios' && ehAdmin && (
                  <Usuarios key={versao} setores={setores} />
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </ProvedorDeAcesso>
  );
}
