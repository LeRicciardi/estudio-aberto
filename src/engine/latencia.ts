// Medição do atraso de gravação: função pura, testável sem navegador.

/** Parte pura da medição: acha cada estalo na gravação e devolve o atraso mediano. */
export function atrasoDosEstalos(amostras: Float32Array, taxa: number, esperados: number[]): number | null {
  let soma = 0;
  for (const v of amostras) soma += Math.abs(v);
  const fundo = soma / (amostras.length || 1);
  const atrasos: number[] = [];
  for (const esperado of esperados) {
    const ini = Math.max(0, Math.round(esperado * taxa));
    const fim = Math.min(amostras.length, ini + Math.round(0.4 * taxa));
    let pico = 0;
    for (let i = ini; i < fim; i++) pico = Math.max(pico, Math.abs(amostras[i]));
    // O estalo precisa se destacar bem do ruído de fundo.
    if (pico < 0.02 || pico < fundo * 8) continue;
    // O começo do estalo é o primeiro sample que chega à metade do pico.
    for (let i = ini; i < fim; i++) {
      if (Math.abs(amostras[i]) >= pico / 2) {
        atrasos.push((i - ini) / taxa);
        break;
      }
    }
  }
  if (atrasos.length < 3) return null;
  atrasos.sort((a, b) => a - b);
  return atrasos[Math.floor(atrasos.length / 2)];
}
