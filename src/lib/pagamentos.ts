/** Cálculos em centavos. Diferenças negativas são preservadas. */
export function calcularPagamentos(previsto: number, totalLancado: number, empenho: number, reservado: number, sme: number) {
  const centavos = (valor: number) => Math.round(valor * 100);
  const faturas = centavos(previsto) - centavos(totalLancado);
  return {
    faturas_futuras: faturas / 100,
    saldo: (centavos(empenho) + centavos(reservado) + centavos(sme) - faturas) / 100,
  };
}
