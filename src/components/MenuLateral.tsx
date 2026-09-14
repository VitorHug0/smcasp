import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  Landmark,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAcesso } from '../lib/permissoes';

export type Tela =
  | 'visao-geral'
  | 'processos'
  | 'concluidos'
  | 'compras'
  | 'contratos'
  | 'emendas'
  | 'usuarios';

interface ItemMenu {
  chave: Tela;
  titulo: string;
  explicacao: string;
  Icone: LucideIcon;
  /** Endereço da tela na barra do navegador. */
  rota: string;
  /** Só o Administrador Geral vê o item no menu. */
  soAdmin?: boolean;
}

/**
 * Nomes escritos como as pessoas falam no dia a dia — nada de "módulo",
 * "entidade" ou "CRUD". Cada item tem uma frase explicando o que se faz ali.
 */
export const ITENS_MENU: ItemMenu[] = [
  {
    chave: 'visao-geral',
    titulo: 'Visão geral',
    explicacao: 'Os números do ano em uma tela só',
    Icone: LayoutDashboard,
    rota: '/',
  },
  {
    chave: 'processos',
    titulo: 'Processos',
    explicacao: 'Quadro do que está em andamento',
    Icone: ClipboardList,
    rota: '/processos',
  },
  {
    chave: 'concluidos',
    titulo: 'Concluídos',
    explicacao: 'Histórico em forma de planilha',
    Icone: ListChecks,
    rota: '/concluidos',
  },
  {
    chave: 'compras',
    titulo: 'Compras',
    explicacao: 'O que foi comprado e quem recebeu',
    Icone: ShoppingCart,
    rota: '/compras',
  },
  {
    chave: 'contratos',
    titulo: 'Contratos',
    explicacao: 'Cadastro e vigência dos contratos',
    Icone: FileText,
    rota: '/contratos',
  },
  {
    chave: 'emendas',
    titulo: 'Emendas',
    explicacao: 'Repasses recebidos e saldo',
    Icone: Landmark,
    rota: '/emendas',
  },
  {
    chave: 'usuarios',
    titulo: 'Usuários',
    explicacao: 'Quem entra e com qual perfil',
    Icone: Users,
    rota: '/admin/usuarios',
    soAdmin: true,
  },
];

/** Item do menu correspondente a um endereço, ou a visão geral se não houver. */
export function telaDoCaminho(caminho: string): ItemMenu {
  return ITENS_MENU.find((i) => i.rota === caminho) ?? ITENS_MENU[0];
}

interface Props {
  telaAtual: Tela;
  aoTrocar: (tela: Tela) => void;
  abertoNoCelular: boolean;
  aoFechar: () => void;
  /** Menu encolhido a uma faixa de ícones, para a planilha ocupar a tela. */
  recolhido: boolean;
  aoAlternarRecolhido: () => void;
}

export function MenuLateral({
  telaAtual,
  aoTrocar,
  abertoNoCelular,
  aoFechar,
  recolhido,
  aoAlternarRecolhido,
}: Props) {
  // A tela de usuários só existe para o Administrador Geral. Esconder o item
  // não é a trava — a API recusa /api/admin/* para os outros perfis —, é só
  // não oferecer uma porta que não abre.
  const { ehAdmin } = useAcesso();
  const itens = ITENS_MENU.filter((i) => !i.soAdmin || ehAdmin);

  /**
   * O mesmo menu serve à barra fixa do computador e à gaveta do celular. Na
   * gaveta ele nunca aparece recolhido: ali o espaço não é disputado com a
   * planilha, e esconder os nomes só atrapalharia.
   */
  const conteudo = (encolhido: boolean) => (
    <nav
      className={`flex h-full flex-col gap-1 ${encolhido ? 'px-2 py-4' : 'p-4'}`}
      aria-label="Menu principal"
    >
      <div
        className={`mb-4 flex items-center pt-2 ${
          encolhido ? 'justify-center' : 'justify-between px-2'
        }`}
      >
        {!encolhido && (
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-white">Painel da Secretaria</p>
            <p className="text-xs text-marca-200">Controle interno</p>
          </div>
        )}

        {/* Recolher/expandir só faz sentido na barra fixa do computador */}
        <button
          type="button"
          onClick={aoAlternarRecolhido}
          title={encolhido ? 'Expandir o menu' : 'Recolher o menu'}
          aria-label={encolhido ? 'Expandir o menu' : 'Recolher o menu'}
          aria-expanded={!encolhido}
          className="hidden rounded-lg p-2 text-marca-200 hover:bg-white/10 hover:text-white lg:block"
        >
          {encolhido ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <PanelLeftClose className="size-5" />
          )}
        </button>

        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar menu"
          className="rounded-lg p-2 text-marca-200 hover:bg-white/10 lg:hidden"
        >
          <X className="size-5" />
        </button>
      </div>

      {itens.map(({ chave, titulo, explicacao, Icone }) => {
        const ativo = telaAtual === chave;
        return (
          <button
            key={chave}
            type="button"
            onClick={() => aoTrocar(chave)}
            aria-current={ativo ? 'page' : undefined}
            // Recolhido, o nome vira dica do mouse — é como a pessoa confere
            // que está clicando na tela certa sem expandir o menu de volta.
            title={encolhido ? `${titulo} — ${explicacao}` : undefined}
            className={`flex items-center rounded-xl transition-colors
              ${encolhido ? 'justify-center px-2 py-3' : 'gap-3.5 px-3 py-3 text-left'}
              ${ativo ? 'bg-white text-marca-700 shadow-sm' : 'text-marca-100 hover:bg-white/10'}`}
          >
            <Icone className={`size-6 shrink-0 ${ativo ? 'text-marca-600' : 'text-marca-200'}`} />
            {!encolhido && (
              <span className="min-w-0">
                <span className="block text-sm font-bold">{titulo}</span>
                <span
                  className={`block truncate text-xs ${
                    ativo ? 'text-slate-500' : 'text-marca-200/80'
                  }`}
                >
                  {explicacao}
                </span>
              </span>
            )}
            {encolhido && <span className="sr-only">{titulo}</span>}
          </button>
        );
      })}

      {!encolhido && (
        <p className="mt-auto px-3 pb-2 text-[11px] leading-relaxed text-marca-200/70">
          Dúvidas? Procure a Coordenadoria Setorial Administrativa (CSA).
        </p>
      )}
    </nav>
  );

  return (
    <>
      {/* Fixo no computador — encolhe para uma faixa de ícones */}
      <aside
        className={`hidden shrink-0 bg-marca-900 transition-[width] duration-200 lg:block
          ${recolhido ? 'w-[72px]' : 'w-72'}`}
      >
        {conteudo(recolhido)}
      </aside>

      {/* Gaveta no celular */}
      {abertoNoCelular && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={aoFechar} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-marca-900 shadow-xl">
            {conteudo(false)}
          </aside>
        </div>
      )}
    </>
  );
}
