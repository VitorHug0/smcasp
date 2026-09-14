import { corDoAvatar, iniciais } from '../lib/formato';

/**
 * Avatar com as iniciais do servidor. A cor é sempre a mesma para a mesma
 * pessoa, o que ajuda a reconhecer o responsável de relance no quadro.
 */
export function Avatar({
  nome,
  tamanho = 'medio',
}: {
  nome: string | null | undefined;
  tamanho?: 'pequeno' | 'medio';
}) {
  const classe = tamanho === 'pequeno' ? 'size-6 text-[10px]' : 'size-8 text-xs';
  return (
    <span
      title={nome ?? 'Sem responsável'}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold
        text-white ring-2 ring-white ${classe} ${corDoAvatar(nome)}`}
    >
      {iniciais(nome)}
    </span>
  );
}
