// =============================================================================
//  Células que se editam no lugar, sem abrir janela — é o que faz a tela de
//  processos funcionar como a planilha a que a equipe está acostumada.
//
//  Em repouso são texto simples. Um clique abre o campo; Enter e sair do campo
//  salvam, Esc desfaz.
//
//  Para quem tem perfil de Leitor, as três células desistem de ser células: o
//  valor vira texto e o clique não faz nada. Elas descobrem isso sozinhas pelo
//  contexto de acesso, porque estão em centenas de lugares — repassar a mesma
//  propriedade de mão em mão até cada uma delas seria trabalho garantido de
//  esquecer em algum canto, e um campo esquecido é um erro na cara da pessoa.
// =============================================================================

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { moeda, paraNumero, valorSimples } from '../../lib/formato';
import { usePodeEditar } from '../../lib/permissoes';

const BASE_REPOUSO =
  'w-full rounded px-1.5 py-1 text-left leading-snug ' +
  'hover:bg-white hover:ring-1 hover:ring-slate-300 focus-visible:bg-white ' +
  'focus-visible:ring-2 focus-visible:ring-marca-500';

export function TextoEditavel({
  valor,
  aoSalvar,
  placeholder = '—',
  linhas = 2,
  className = '',
  monoespacado = false,
}: {
  valor: string | null;
  aoSalvar: (texto: string | null) => void;
  placeholder?: string;
  linhas?: number;
  className?: string;
  monoespacado?: boolean;
}) {
  const podeEditar = usePodeEditar();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);

  const fonte = monoespacado ? 'font-mono text-[11px]' : '';

  if (!podeEditar) {
    return (
      <span className={`block px-1.5 py-1 leading-snug ${fonte} ${valor ? '' : 'text-slate-300'} ${className}`}>
        {valor || placeholder}
      </span>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        title={valor ? `${valor} — clique para editar` : 'Clique para preencher'}
        className={`${BASE_REPOUSO} ${fonte} ${valor ? '' : 'text-slate-300'} ${className}`}
      >
        {valor || placeholder}
      </button>
    );
  }

  const encerrar = (salvar: boolean) => {
    setEditando(false);
    if (salvar) {
      const limpo = texto.trim();
      if (limpo !== (valor ?? '')) aoSalvar(limpo || null);
    } else {
      setTexto(valor ?? '');
    }
  };

  return (
    <textarea
      autoFocus
      rows={linhas}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => encerrar(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          encerrar(true);
        }
        if (e.key === 'Escape') encerrar(false);
      }}
      className={`w-full resize-none rounded border border-marca-500 bg-white px-1.5 py-1
        leading-snug focus:outline-none focus:ring-2 focus:ring-marca-100 ${fonte} ${className}`}
    />
  );
}

// -----------------------------------------------------------------------------

/**
 * Célula de dinheiro da planilha de pagamentos. Em repouso mostra o valor já
 * formatado em reais; ao clicar, abre um campo que aceita tanto "1.234,56"
 * como "1234.56", porque as duas formas aparecem quando se copia da planilha.
 *
 * Campo apagado grava nulo (célula em branco), que é diferente de 0,00 — a
 * planilha usa os dois com sentidos distintos: sem previsão lançada x sem
 * pagamento no mês.
 */
export function ValorEditavel({
  valor,
  aoSalvar,
  className = '',
  destaque = false,
  comMoeda = false,
}: {
  valor: number | null;
  aoSalvar: (valor: number | null) => void;
  className?: string;
  /** Negrito, para as colunas de totalização. */
  destaque?: boolean;
  /** Mostra "R$" antes do número. A planilha só usa na coluna de saldo. */
  comMoeda?: boolean;
}) {
  const podeEditar = usePodeEditar();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');

  const peso = destaque ? 'font-semibold' : '';

  if (!podeEditar) {
    return (
      <span
        className={`block whitespace-nowrap px-1.5 py-1 text-right tabular-nums ${peso}
          ${valor === null ? 'text-slate-300' : ''} ${className}`}
      >
        {valor === null ? '—' : comMoeda ? moeda(valor) : valorSimples(valor)}
      </span>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          // Abre com o número cru, sem "R$" nem pontos de milhar, para que
          // digitar por cima não exija apagar formatação.
          setTexto(valor === null ? '' : String(valor).replace('.', ','));
          setEditando(true);
        }}
        title={valor === null ? 'Clique para lançar o valor' : 'Clique para corrigir o valor'}
        className={`${BASE_REPOUSO} whitespace-nowrap text-right tabular-nums ${peso}
          ${valor === null ? 'text-slate-300' : ''} ${className}`}
      >
        {valor === null ? '—' : comMoeda ? moeda(valor) : valorSimples(valor)}
      </button>
    );
  }

  const encerrar = (salvar: boolean) => {
    setEditando(false);
    if (!salvar) return;
    const limpo = texto.trim();
    const novo = limpo === '' ? null : paraNumero(limpo);
    if (novo !== valor) aoSalvar(novo);
  };

  return (
    <input
      autoFocus
      inputMode="decimal"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => encerrar(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          encerrar(true);
        }
        if (e.key === 'Escape') encerrar(false);
      }}
      className={`w-full rounded border border-marca-500 bg-white px-1.5 py-1 text-right
        tabular-nums focus:outline-none focus:ring-2 focus:ring-marca-100 ${peso} ${className}`}
    />
  );
}

// -----------------------------------------------------------------------------

export interface OpcaoNaLinha {
  valor: string;
  texto: string;
  grupo?: string;
}

/**
 * Lista de seleção que parece texto até o mouse passar por cima — assim a
 * tabela continua com cara de planilha, mas tudo é editável.
 */
export function SelecaoNaLinha({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  vazio = '—',
  semVazio = false,
  className = '',
  enfeite,
}: {
  valor: string;
  opcoes: OpcaoNaLinha[];
  aoMudar: (valor: string) => void;
  rotulo: string;
  vazio?: string;
  /** Some com a opção em branco — para campos que sempre têm um valor. */
  semVazio?: boolean;
  className?: string;
  /** Conteúdo exibido antes do texto, por exemplo o avatar do responsável. */
  enfeite?: ReactNode;
}) {
  const podeEditar = usePodeEditar();

  if (!podeEditar) {
    const escolhida = opcoes.find((o) => o.valor === valor);
    return (
      <span className="flex items-center gap-1.5">
        {enfeite}
        <span className={`min-w-0 flex-1 truncate px-1 py-1 leading-snug ${className}`}>
          {escolhida?.texto ?? vazio}
        </span>
      </span>
    );
  }

  const grupos: Array<[string, OpcaoNaLinha[]]> = [];
  for (const opcao of opcoes) {
    const grupo = opcao.grupo ?? '';
    const ultima = grupos[grupos.length - 1];
    if (ultima && ultima[0] === grupo) ultima[1].push(opcao);
    else grupos.push([grupo, [opcao]]);
  }

  return (
    <span className="flex items-center gap-1.5">
      {enfeite}
      <select
        value={valor}
        aria-label={rotulo}
        onChange={(e) => aoMudar(e.target.value)}
        className={`min-w-0 flex-1 cursor-pointer truncate rounded border border-transparent
          bg-transparent px-1 py-1 leading-snug hover:border-slate-300 hover:bg-white
          focus:border-marca-500 focus:bg-white focus:outline-none ${className}`}
      >
        {!semVazio && <option value="">{vazio}</option>}
        {grupos.map(([grupo, itens]) =>
          grupo ? (
            <optgroup key={grupo} label={grupo}>
              {itens.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </optgroup>
          ) : (
            itens.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))
          ),
        )}
      </select>
    </span>
  );
}
