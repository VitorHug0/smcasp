import type { CompraItem } from './types';

export interface NotaEmpenhoExtraida {
  numero_empenho: string;
  numero_processo: string;
  data_compra: string;
  fornecedor_nome: string;
  fornecedor_documento: string;
  valor_total: number;
  itens: CompraItem[];
  avisos: string[];
  texto: string;
}

const MAX_PDF = 5 * 1024 * 1024;
const decoderLatin1 = new TextDecoder('latin1');

function desescaparPdf(valor: string): string {
  return valor
    .replace(/\\([nrtbf()\\])/g, (_, c: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] ?? c))
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, '');
}

function textosDeOperadores(conteudo: string): string[] {
  const saida: string[] = [];
  const re = /(\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>)(?=\s*(?:Tj|'|"))/g;
  let encontro: RegExpExecArray | null;
  while ((encontro = re.exec(conteudo))) {
    if (encontro[1].startsWith('(')) saida.push(desescaparPdf(encontro[1].slice(1, -1)));
    else {
      const hex = (encontro[2] ?? '').replace(/\s/g, '');
      const bytes = new Uint8Array(Math.floor(hex.length / 2));
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      const utf16 = bytes.length > 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
      saida.push(new TextDecoder(utf16 ? 'utf-16be' : 'latin1').decode(utf16 ? bytes.slice(2) : bytes));
    }
  }
  const arrays = conteudo.matchAll(/\[((?:.|\r|\n)*?)\]\s*TJ/g);
  for (const array of arrays) {
    const partes = [...array[1].matchAll(/\((?:\\.|[^\\)])*\)/g)]
      .map((p) => desescaparPdf(p[0].slice(1, -1)));
    if (partes.length) saida.push(partes.join(''));
  }
  return saida.filter((s) => s.trim());
}

async function inflar(bytes: Uint8Array): Promise<string | null> {
  try {
    const copia = Uint8Array.from(bytes).buffer;
    const fluxo = new Blob([copia]).stream().pipeThrough(new DecompressionStream('deflate'));
    return decoderLatin1.decode(await new Response(fluxo).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Extrator deliberadamente pequeno para PDFs com texto nativo. Ele lê os
 * operadores de texto de streams simples/Flate e não renderiza páginas.
 * OCR e PDFs com fontes mapeadas de modo proprietário ficam para uma futura
 * estratégia que implemente a mesma interface.
 */
export async function extrairTextoPdf(arquivo: File): Promise<{ texto: string; hash: string }> {
  if (arquivo.size === 0 || arquivo.size > MAX_PDF) {
    throw new Error('O PDF deve ter no máximo 5 MB.');
  }
  if (arquivo.type && arquivo.type !== 'application/pdf') {
    throw new Error('Selecione um arquivo PDF válido.');
  }
  const buffer = await arquivo.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (decoderLatin1.decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('O arquivo não possui uma assinatura PDF válida.');
  }

  const bruto = decoderLatin1.decode(bytes);
  const partes: string[] = [...textosDeOperadores(bruto)];
  const marcador = /stream\r?\n/g;
  let encontro: RegExpExecArray | null;
  while ((encontro = marcador.exec(bruto))) {
    const fim = bruto.indexOf('endstream', encontro.index + encontro[0].length);
    if (fim < 0) break;
    const cabecalho = bruto.slice(Math.max(0, encontro.index - 300), encontro.index);
    if (/\/FlateDecode/.test(cabecalho)) {
      let inicio = encontro.index + encontro[0].length;
      let final = fim;
      if (bytes[final - 1] === 10) final--;
      if (bytes[final - 1] === 13) final--;
      const descompactado = await inflar(bytes.slice(inicio, final));
      if (descompactado) partes.push(...textosDeOperadores(descompactado));
    }
    marcador.lastIndex = fim + 9;
  }

  const texto = partes.join('\n').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!texto) {
    throw new Error('Não foi possível extrair texto nativo deste PDF. Preencha os dados manualmente ou use outro arquivo.');
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { texto, hash };
}

function valorBR(valor: string | undefined): number {
  if (!valor) return 0;
  const limpo = valor.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const numero = Number(limpo);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
}

function dataISO(valor: string | undefined): string {
  const m = valor?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function capturar(texto: string, rotulo: string, fim: string): string {
  const m = texto.match(new RegExp(`${rotulo}\\s*[:.-]?\\s*([\\s\\S]*?)(?=${fim}|$)`, 'i'));
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

/** Interpreta o texto sem inventar campos ausentes. */
export function interpretarNotaEmpenho(textoOriginal: string): NotaEmpenhoExtraida {
  const texto = textoOriginal.replace(/\r/g, '\n').replace(/\n{2,}/g, '\n');
  const rotulosGerais = 'N[ºo°.]?\\s*(?:do\\s+)?Processo|Data|Fornecedor|Credor|CNPJ|CPF|ITEM\\s*\\d+|TOTAL';
  const numeroEmpenho = capturar(texto, 'N[ºo°.]?\\s*(?:do\\s+)?Empenho', rotulosGerais).split(' ')[0] ?? '';
  const numeroProcesso = capturar(texto, 'N[ºo°.]?\\s*(?:do\\s+)?Processo(?:\\s+de\\s+Compra)?', 'Data|Fornecedor|Credor|CNPJ|CPF|ITEM\\s*\\d+|TOTAL').split(' ')[0] ?? '';
  const data = dataISO(capturar(texto, 'Data', 'Fornecedor|Credor|CNPJ|CPF|ITEM\\s*\\d+|TOTAL'));
  const fornecedor = capturar(texto, '(?:Fornecedor|Credor)', 'CNPJ|CPF|ITEM\\s*\\d+|TOTAL');
  const documento = (texto.match(/(?:CNPJ|CPF)\s*[:.-]?\s*([\d.\/-]{11,18})/i)?.[1] ?? '').trim();

  const blocos = [...texto.matchAll(/ITEM\s*\d+([\s\S]*?)(?=ITEM\s*\d+|\n\s*TOTAL\s*:|$)/gi)];
  const itens = blocos.map((m): CompraItem => {
    const bloco = m[1];
    const codigo = capturar(bloco, 'C[oó]digo', 'Descri[cç][aã]o|Unidade|Quantidade|Valor\\s+unit[aá]rio|Valor\\s+total');
    const descricao = capturar(bloco, 'Descri[cç][aã]o', 'Unidade|Quantidade|Valor\\s+unit[aá]rio|Valor\\s+total');
    const unidade = capturar(bloco, 'Unidade', 'Quantidade|Valor\\s+unit[aá]rio|Valor\\s+total');
    const quantidade = valorBR(capturar(bloco, 'Quantidade', 'Valor\\s+unit[aá]rio|Valor\\s+total'));
    const unitario = valorBR(capturar(bloco, 'Valor\\s+unit[aá]rio', 'Valor\\s+total'));
    const totalInformado = valorBR(capturar(bloco, 'Valor\\s+total', '$'));
    return {
      codigo: codigo || null,
      descricao,
      unidade: unidade || null,
      quantidade,
      valor_unitario: unitario,
      valor_total: totalInformado || Math.round(quantidade * unitario * 100) / 100,
    };
  }).filter((item) => item.descricao || item.codigo);

  const totalDocumento = valorBR(texto.match(/(?:^|\n)\s*TOTAL\s*:\s*(?:R\$\s*)?([\d.]+,\d{2})/i)?.[1]);
  const totalItens = Math.round(itens.reduce((s, i) => s + i.valor_total, 0) * 100) / 100;
  const avisos: string[] = [];
  if (!numeroEmpenho) avisos.push('Nº do Empenho');
  if (!numeroProcesso) avisos.push('Nº do Processo');
  if (!data) avisos.push('Data');
  if (!fornecedor) avisos.push('Fornecedor');
  if (!itens.length) avisos.push('Itens');
  if (totalDocumento && totalItens && Math.abs(totalDocumento - totalItens) > 0.01) {
    avisos.push('O total identificado não confere com a soma dos itens');
  }
  return {
    numero_empenho: numeroEmpenho,
    numero_processo: numeroProcesso,
    data_compra: data,
    fornecedor_nome: fornecedor,
    fornecedor_documento: documento,
    itens,
    valor_total: totalDocumento || totalItens,
    avisos,
    texto,
  };
}

export async function processarNotaEmpenho(arquivo: File) {
  const { texto, hash } = await extrairTextoPdf(arquivo);
  return { dados: interpretarNotaEmpenho(texto), hash };
}
