// =============================================================================
//  Formatação de números, datas e textos — sempre em português do Brasil.
// =============================================================================

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});

const MOEDA_CURTA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const NUMERO = new Intl.NumberFormat('pt-BR');

/**
 * Número com centavos e sem "R$" — é como a planilha de pagamentos mostra as
 * colunas de mês: com o símbolo repetido doze vezes na linha, os valores se
 * encostam e ninguém consegue comparar um mês com o outro.
 */
const VALOR = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const moeda = (valor: number | null | undefined): string => MOEDA.format(valor ?? 0);

/** Versão curta para eixos de gráfico: R$ 1,2 mi */
export const moedaCurta = (valor: number | null | undefined): string =>
  MOEDA_CURTA.format(valor ?? 0);

export const numero = (valor: number | null | undefined): string => NUMERO.format(valor ?? 0);

/** '1234.5' -> '1.234,50' (sem o símbolo da moeda) */
export const valorSimples = (valor: number | null | undefined): string => VALOR.format(valor ?? 0);

/** '2026-09-16' -> '16/09/2026' (sem sofrer com fuso horário) */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '—';
  return `${dia}/${mes}/${ano}`;
}

/** Diferença em dias entre hoje e uma data ISO. Negativo = já passou. */
export function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const alvo = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(alvo)) return null;
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - hojeUTC) / 86_400_000);
}

/** Texto amigável do prazo: "vence em 12 dias", "atrasado há 3 dias", "vence hoje". */
export function textoPrazo(dias: number | null): string {
  if (dias === null) return 'Sem prazo definido';
  if (dias === 0) return 'Vence hoje';
  if (dias < 0) return `Atrasado há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`;
  return `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** Iniciais para o avatar do responsável: "Ana Paula Ribeiro" -> "AR" */
export function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?';
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2);
  const base = partes.length ? partes : nome.trim().split(/\s+/);
  const primeira = base[0]?.[0] ?? '';
  const ultima = base.length > 1 ? base[base.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

/** Cor estável do avatar a partir do nome, para a pessoa ser reconhecida na cor. */
const CORES_AVATAR = [
  'bg-sky-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-indigo-600',
];

export function corDoAvatar(nome: string | null | undefined): string {
  if (!nome) return 'bg-slate-400';
  let soma = 0;
  for (let i = 0; i < nome.length; i++) soma += nome.charCodeAt(i);
  return CORES_AVATAR[soma % CORES_AVATAR.length];
}

/** Converte "1.234,56" ou "1234.56" digitado pelo usuário em número. */
export function paraNumero(texto: string): number {
  if (!texto) return 0;
  const limpo = texto
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Data de hoje no formato aceito por <input type="date">. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
