// "Abrir espaço": o beat cede lugar quando a voz entra e volta quando ela sai.
// Em estúdio isso se faz com compressão e equalização acionadas pela voz
// (sidechain). Aqui a voz já está gravada, então dá para calcular antes, a
// partir do próprio áudio dela, exatamente quando e quanto o beat deve ceder.
// Funções puras sobre os samples.

/** Pontos por segundo das curvas calculadas aqui. */
export const TAXA_DA_CURVA = 100;

/** Um trecho de voz que soa na música: os samples e onde eles começam. */
export interface TrechoDeVoz {
  amostras: Float32Array;
  taxa: number;
  /** Tempo da música, em segundos, do primeiro sample. */
  inicio: number;
  /** Volume do take (0 = mudo). */
  volume: number;
}

/**
 * Presença da voz ao longo da música, de 0 (silêncio) a 1 (voz cheia), em
 * `TAXA_DA_CURVA` pontos por segundo. Sobe rápido quando a voz entra e desce
 * devagar quando ela sai, para o beat não "bombear" entre as palavras.
 */
export function presencaDaVoz(trechos: TrechoDeVoz[], duracao: number): Float32Array {
  const n = Math.max(1, Math.ceil(duracao * TAXA_DA_CURVA));
  const nivel = new Float32Array(n);
  for (const t of trechos) {
    if (t.volume <= 0) continue;
    const porPonto = t.taxa / TAXA_DA_CURVA;
    const pontos = Math.floor(t.amostras.length / porPonto);
    for (let k = 0; k < pontos; k++) {
      const destino = Math.round(t.inicio * TAXA_DA_CURVA) + k;
      if (destino < 0 || destino >= n) continue;
      let soma = 0;
      const ini = Math.floor(k * porPonto);
      const fim = Math.floor((k + 1) * porPonto);
      for (let i = ini; i < fim; i++) soma += t.amostras[i] * t.amostras[i];
      nivel[destino] = Math.max(nivel[destino], Math.sqrt(soma / (fim - ini)) * t.volume);
    }
  }
  // De volume para presença: abaixo de -45 dB não conta; de -30 dB para cima conta inteiro.
  const sobe = 1 - Math.exp(-1 / (TAXA_DA_CURVA * 0.03));
  const desce = 1 - Math.exp(-1 / (TAXA_DA_CURVA * 0.25));
  let env = 0;
  for (let i = 0; i < n; i++) {
    const db = 20 * Math.log10(nivel[i] || 1e-6);
    const alvo = Math.min(1, Math.max(0, (db + 45) / 15));
    env += (alvo - env) * (alvo > env ? sobe : desce);
    nivel[i] = env;
  }
  return nivel;
}

/** Curva de ganho (em valor linear) que abaixa até `quantoDb` onde a voz está presente. */
export function curvaDeGanho(presenca: Float32Array, quantoDb: number): Float32Array {
  return presenca.map((p) => 10 ** ((-quantoDb * p) / 20));
}

/** Curva em dB para um filtro: 0 sem voz, `-quantoDb` com voz. */
export function curvaEmDb(presenca: Float32Array, quantoDb: number): Float32Array {
  return presenca.map((p) => -quantoDb * p);
}
