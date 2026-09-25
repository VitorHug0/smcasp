const CONSULTA_SEI_CAMPINAS =
  'https://sei.campinas.sp.gov.br/sei/modulos/pesquisa/md_pesq_processo_pesquisar.php' +
  '?acao_externa=protocolo_pesquisar&acao_origem_externa=protocolo_pesquisar' +
  '&id_orgao_acesso_externo=0';

const PROCESSO_SEI = /^PMC\.\d{4}\.\d{8}-\d{2}$/i;
const ID_PNCP = /^(\d{14})-\d-(\d{6})\/(\d{4})$/;
const PNCP_NUMERICO = /^\d{15,30}$/;

/**
 * Aplica a máscara apenas ao texto que está sendo digitado. Quem só abre e
 * salva uma ficha antiga mantém exatamente o valor que já estava gravado.
 */
export function mascararProcessoSei(valor: string): string {
  if (!valor) return '';
  const digitos = valor.toUpperCase().replace(/^PMC[.\s-]*/, '').replace(/\D/g, '').slice(0, 14);
  if (!digitos) return valor.toUpperCase().startsWith('P') ? 'PMC.' : '';

  const ano = digitos.slice(0, 4);
  const numero = digitos.slice(4, 12);
  const digito = digitos.slice(12, 14);
  return `PMC.${ano}${numero ? `.${numero}` : ''}${digito ? `-${digito}` : ''}`;
}

/** URL oficial da pesquisa pública do SEI Campinas, somente para o padrão conhecido. */
export function urlProcessoSei(valor: string | null | undefined): string | null {
  const numero = valor?.trim().toUpperCase() ?? '';
  if (!PROCESSO_SEI.test(numero)) return null;
  const parametros = new URLSearchParams({
    txtProtocoloPesquisa: numero,
    chkSinProcessos: 'P',
  });
  return `${CONSULTA_SEI_CAMPINAS}&${parametros.toString()}`;
}

/**
 * IDs PNCP completos abrem o registro diretamente. Os códigos numéricos
 * legados usados pelo painel abrem a consulta oficial já filtrada pelo valor.
 */
export function urlPncp(valor: string | null | undefined): string | null {
  const codigo = valor?.trim() ?? '';
  const id = ID_PNCP.exec(codigo);
  if (id) {
    const [, cnpj, sequencial, ano] = id;
    return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(sequencial)}`;
  }
  if (!PNCP_NUMERICO.test(codigo)) return null;
  return `https://pncp.gov.br/app/editais?pagina=1&q=${encodeURIComponent(codigo)}&status=todos`;
}
