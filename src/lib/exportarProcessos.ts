// =============================================================================
//  EXPORTAÇÃO DA PLANILHA DE PROCESSOS PARA EXCEL (.xlsx)
//
//  A planilha gerada é a tela: as mesmas onze colunas, na mesma ordem, com o
//  que a busca e os filtros deixaram à vista. Exportar "tudo" enquanto a tela
//  mostra dezoito linhas filtradas seria entregar um arquivo que não confere
//  com o que a pessoa está vendo — e ela levaria isso para uma reunião.
//
//  TRÊS DECISÕES QUE VALE EXPLICAR
//
//  1. TUDO É TEXTO. AUDESP e PNCP são sequências de dígitos longas
//     ('46379400600012026'). Escritas como número, o Excel as arredonda para
//     notação científica e come o final — o número publicado no portal deixaria
//     de bater. Como texto, saem exatamente como estão na tela.
//
//  2. O TRAVESSÃO NÃO VAI. Na tela, '—' quer dizer "campo em branco". Numa
//     planilha, ele viraria conteúdo: quebraria a ordenação e apareceria como
//     valor no filtro do Excel. Campo vazio sai vazio.
//
//  3. A CATEGORIA SE REPETE EM CADA LINHA, em vez de aparecer como faixa a cada
//     troca de fase. Faixa é bonita de ler e péssima de usar: com a categoria
//     em coluna, o Excel filtra, ordena e faz tabela dinâmica por fase — que é
//     o motivo de alguém querer o arquivo.
//
//  A biblioteca (SheetJS) só é carregada quando alguém clica em exportar: são
//  cerca de 400 KB que ninguém precisa baixar para abrir a tela.
// =============================================================================

import { hojeISO } from './formato';
import type { Etapa, Processo } from './types';

/** Uma coluna da planilha: o cabeçalho, a largura e como tirar o valor da linha. */
interface Coluna {
  titulo: string;
  /** Largura em caracteres (o `wch` do SheetJS). */
  largura: number;
  valor: (p: Processo, categoria: string) => string;
}

/**
 * Vazio de verdade, nunca '—' nem 'null'. Recebe o que vier do banco e devolve
 * string limpa.
 */
const texto = (v: string | null | undefined): string => {
  const limpo = (v ?? '').trim();
  return limpo === '—' ? '' : limpo;
};

/**
 * As onze colunas, na ordem da tela. Os títulos vão em maiúsculas como no
 * cabeçalho da planilha da Coordenadoria.
 *
 * As larguras foram medidas pelo conteúdo real: OBJETO e STATUS são os campos
 * que a equipe escreve por extenso ("Orçamento balizador com valor acima do
 * permitido; solicitado novamente em 19/08"), então recebem folga; EMENDA tem
 * três letras e não precisa de nenhuma.
 */
export const COLUNAS: readonly Coluna[] = [
  { titulo: 'CATEGORIA / GRUPO', largura: 38, valor: (_p, categoria) => categoria },
  { titulo: 'SEI', largura: 24, valor: (p) => texto(p.sei) },
  { titulo: 'OBJETO', largura: 46, valor: (p) => texto(p.objeto) },
  { titulo: 'MODALIDADE', largura: 17, valor: (p) => texto(p.modalidade) },
  // Marca só o que é emenda, como na planilha de origem. Em branco para o
  // resto: no filtro do Excel viram dois grupos limpos, "Sim" e "(Vazias)".
  { titulo: 'EMENDA', largura: 10, valor: (p) => (p.emenda === 1 ? 'Sim' : '') },
  { titulo: 'AUDESP', largura: 21, valor: (p) => texto(p.audesp) },
  { titulo: 'PNCP', largura: 21, valor: (p) => texto(p.pncp) },
  { titulo: 'STATUS', largura: 54, valor: (p) => texto(p.status) },
  { titulo: 'PRIORIDADE', largura: 13, valor: (p) => texto(p.prioridade) },
  { titulo: 'RESPONSÁVEL', largura: 18, valor: (p) => texto(p.responsavel_nome) },
  { titulo: '2º RESPONSÁVEL', largura: 18, valor: (p) => texto(p.responsavel_2_nome) },
];

/** Fase do processo e o nome por extenso que vai na coluna de categoria. */
export interface FaixaDeEtapa {
  chave: Etapa;
  faixa: string;
}

/** Nome do arquivo, com a data de hoje: processos_andamento_2026-09-09.xlsx */
export const nomeDoArquivo = (): string => `processos_andamento_${hojeISO()}.xlsx`;

/**
 * Monta as linhas na ordem em que aparecem na tela: fase por fase, e dentro de
 * cada fase a ordem que a lista já traz (prioridade e depois prazo).
 *
 * Fase sem nenhum processo não vira linha nenhuma — a tela mostra "Nenhum
 * processo nesta fase" porque a faixa precisa existir para o quadro fazer
 * sentido; numa planilha, seria uma linha em branco atrapalhando o filtro.
 */
export function montarLinhas(
  processos: readonly Processo[],
  etapas: readonly FaixaDeEtapa[],
): string[][] {
  const linhas: string[][] = [COLUNAS.map((c) => c.titulo)];

  for (const etapa of etapas) {
    const categoria = etapa.faixa.toLocaleUpperCase('pt-BR');
    for (const p of processos) {
      if (p.etapa !== etapa.chave) continue;
      linhas.push(COLUNAS.map((c) => c.valor(p, categoria)));
    }
  }

  return linhas;
}

/**
 * Gera o arquivo e entrega ao navegador. Devolve quantas linhas de processo
 * foram exportadas, para a tela poder confirmar o que saiu.
 */
export async function exportarParaExcel(
  processos: readonly Processo[],
  etapas: readonly FaixaDeEtapa[],
): Promise<number> {
  // Carregada só agora: quem nunca exporta não paga o download da biblioteca.
  const XLSX = await import('xlsx');

  const linhas = montarLinhas(processos, etapas);

  // aoa_to_sheet com strings grava tudo como texto — é o que preserva os
  // números do AUDESP e do PNCP.
  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  planilha['!cols'] = COLUNAS.map((c) => ({ wch: c.largura }));

  // Filtro automático no cabeçalho: a planilha já abre pronta para filtrar
  // por fase, prioridade ou responsável, sem ninguém precisar configurar nada.
  const ultimaColuna = XLSX.utils.encode_col(COLUNAS.length - 1);
  planilha['!autofilter'] = { ref: `A1:${ultimaColuna}${linhas.length}` };

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, 'Processos em andamento');
  XLSX.writeFile(pasta, nomeDoArquivo());

  return linhas.length - 1;
}
