// =============================================================================
//  Os setores vêm em dois grupos — SMCASP e Guarda Municipal — e toda lista de
//  seleção do sistema precisa mostrá-los separados. Este arquivo é o único
//  lugar que sabe disso; as telas só consomem.
// =============================================================================

import type { OpcaoLista } from '../components/ui/Campo';
import type { Setor } from './types';

/**
 * Opções para os formulários (componente CampoLista).
 * A API já devolve os setores ordenados por grupo e nome, então basta
 * transportar o grupo — que vira um <optgroup>.
 */
export function opcoesDeSetor(setores: Setor[]): OpcaoLista[] {
  return setores.map((s) => ({
    valor: s.id,
    texto: s.sigla === s.nome ? s.nome : `${s.sigla} — ${s.nome}`,
    grupo: s.grupo,
  }));
}

/** Fatias [grupo, setores] para montar <optgroup> nos filtros das telas. */
export function setoresPorGrupo(setores: Setor[]): Array<[string, Setor[]]> {
  const fatias: Array<[string, Setor[]]> = [];
  for (const setor of setores) {
    const ultima = fatias[fatias.length - 1];
    if (ultima && ultima[0] === setor.grupo) ultima[1].push(setor);
    else fatias.push([setor.grupo, [setor]]);
  }
  return fatias;
}

/** Rótulo curto de um setor, do jeito que aparece nas listas. */
export const rotuloDoSetor = (s: Setor): string =>
  s.sigla === s.nome ? s.nome : `${s.sigla} — ${s.nome}`;
