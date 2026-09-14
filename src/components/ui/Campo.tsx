import { useId, useState, type ReactNode } from 'react';
import { AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';

interface BaseProps {
  rotulo: string;
  ajuda?: string;
  erro?: string;
  obrigatorio?: boolean;
  children: (id: string) => ReactNode;
}

const CLASSE_ENTRADA =
  'w-full rounded-lg border bg-white px-3.5 py-2.5 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-marca-500 focus:outline-none ' +
  'focus:ring-4 focus:ring-marca-100 disabled:bg-slate-100';

/** Envelope de campo: rótulo grande, texto de ajuda e mensagem de erro clara. */
export function Campo({ rotulo, ajuda, erro, obrigatorio, children }: BaseProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {rotulo}
        {obrigatorio && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
      </label>
      {children(id)}
      {ajuda && !erro && <p className="mt-1.5 text-xs text-slate-500">{ajuda}</p>}
      {erro && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertCircle className="size-3.5 shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

interface TextoProps {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  ajuda?: string;
  erro?: string;
  obrigatorio?: boolean;
  placeholder?: string;
  tipo?: 'text' | 'email' | 'date' | 'number';
  min?: number;
  linhas?: number;
  /**
   * Valores já usados, oferecidos enquanto se digita. Diferente de uma lista
   * de seleção: a pessoa pode escolher um deles ou escrever algo novo — é o
   * que se quer em campos como "objetivo", que ganham valores a cada ano.
   */
  listaSugestoes?: string[];
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  ajuda,
  erro,
  obrigatorio,
  placeholder,
  tipo = 'text',
  min,
  linhas,
  listaSugestoes,
}: TextoProps) {
  const borda = erro ? 'border-red-400' : 'border-slate-300';
  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      {(id) =>
        linhas ? (
          <textarea
            id={id}
            rows={linhas}
            value={valor}
            placeholder={placeholder}
            onChange={(e) => aoMudar(e.target.value)}
            className={`${CLASSE_ENTRADA} ${borda} resize-y`}
          />
        ) : (
          <>
            <input
              id={id}
              type={tipo}
              min={min}
              value={valor}
              placeholder={placeholder}
              list={listaSugestoes?.length ? `${id}-sugestoes` : undefined}
              onChange={(e) => aoMudar(e.target.value)}
              className={`${CLASSE_ENTRADA} ${borda}`}
            />
            {listaSugestoes && listaSugestoes.length > 0 && (
              <datalist id={`${id}-sugestoes`}>
                {listaSugestoes.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </>
        )
      }
    </Campo>
  );
}

// -----------------------------------------------------------------------------

interface SenhaProps {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  ajuda?: string;
  erro?: string;
  obrigatorio?: boolean;
  /** 'current-password' no login, 'new-password' no cadastro. */
  autoComplete?: string;
}

/**
 * Campo de senha com botão de olho. O botão existe porque senha escondida em
 * teclado de celular é a receita do erro de digitação — e, num cadastro que
 * pede a senha duas vezes, poder conferir o que se digitou evita a terceira
 * tentativa. Começa escondida, que é o certo em sala compartilhada.
 */
export function CampoSenha({
  rotulo,
  valor,
  aoMudar,
  ajuda,
  erro,
  obrigatorio,
  autoComplete = 'current-password',
}: SenhaProps) {
  const [visivel, setVisivel] = useState(false);
  const borda = erro ? 'border-red-400' : 'border-slate-300';

  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      {(id) => (
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id={id}
            type={visivel ? 'text' : 'password'}
            value={valor}
            autoComplete={autoComplete}
            onChange={(e) => aoMudar(e.target.value)}
            className={`${CLASSE_ENTRADA} ${borda} pl-10 pr-11`}
          />
          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            aria-label={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
            title={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      )}
    </Campo>
  );
}

// -----------------------------------------------------------------------------

interface DinheiroProps {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  ajuda?: string;
  erro?: string;
  obrigatorio?: boolean;
}

/** Campo de valor em reais: mostra "R$" fixo e aceita vírgula ou ponto. */
export function CampoDinheiro({
  rotulo,
  valor,
  aoMudar,
  ajuda,
  erro,
  obrigatorio,
}: DinheiroProps) {
  const borda = erro ? 'border-red-400' : 'border-slate-300';
  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      {(id) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-medium text-slate-500">
            R$
          </span>
          <input
            id={id}
            inputMode="decimal"
            value={valor}
            placeholder="0,00"
            onChange={(e) => aoMudar(e.target.value)}
            className={`${CLASSE_ENTRADA} ${borda} pl-11`}
          />
        </div>
      )}
    </Campo>
  );
}

// -----------------------------------------------------------------------------

export interface OpcaoLista {
  valor: string | number;
  texto: string;
  /** Quando presente, as opções são exibidas separadas por grupo. */
  grupo?: string;
}

interface ListaProps {
  rotulo: string;
  valor: string | number;
  opcoes: OpcaoLista[];
  aoMudar: (v: string) => void;
  ajuda?: string;
  erro?: string;
  obrigatorio?: boolean;
  vazio?: string;
}

export function CampoLista({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  ajuda,
  erro,
  obrigatorio,
  vazio = 'Selecione…',
}: ListaProps) {
  const borda = erro ? 'border-red-400' : 'border-slate-300';
  const grupos = agrupar(opcoes);

  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio}>
      {(id) => (
        <select
          id={id}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className={`${CLASSE_ENTRADA} ${borda} cursor-pointer`}
        >
          <option value="">{vazio}</option>
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
      )}
    </Campo>
  );
}

/**
 * Divide as opções em grupos preservando a ordem em que chegaram.
 * Sem grupo declarado, devolve uma única fatia — e o <select> sai simples.
 */
export function agrupar(opcoes: OpcaoLista[]): Array<[string, OpcaoLista[]]> {
  const fatias: Array<[string, OpcaoLista[]]> = [];
  for (const opcao of opcoes) {
    const grupo = opcao.grupo ?? '';
    const ultima = fatias[fatias.length - 1];
    if (ultima && ultima[0] === grupo) ultima[1].push(opcao);
    else fatias.push([grupo, [opcao]]);
  }
  return fatias;
}
