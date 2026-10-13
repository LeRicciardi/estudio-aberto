// Medidor de volume percebido (LUFS integrado), conforme a norma pública
// ITU-R BS.1770. É a medida que Spotify, YouTube e outras plataformas usam
// para igualar o volume das músicas: pico e RMS não dizem o quão alto a
// música soa, o LUFS diz.

/** Filtro de segunda ordem aplicado a uma cópia do sinal. */
function biquad(x: Float32Array, b: [number, number, number], a: [number, number]): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Ponderação K: imita a sensibilidade do ouvido. Um realce de agudos (a
 * cabeça reforça agudos) seguido de um corte de subgraves (ouvimos pouco).
 */
function ponderacaoK(x: Float32Array, taxa: number): Float32Array {
  let K = Math.tan((Math.PI * 1681.974450955533) / taxa);
  const Q1 = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const realce = biquad(
    x,
    [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0],
    [(2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0],
  );
  K = Math.tan((Math.PI * 38.13547087602444) / taxa);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  return biquad(realce, [1, -2, 1], [(2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0]);
}

/** Volume integrado da música inteira, em LUFS. Devolve -Infinity para silêncio. */
export function medirLufs(canais: Float32Array[], taxa: number): number {
  const filtrados = canais.map((c) => ponderacaoK(c, taxa));
  // Blocos de 400 ms que avançam de 100 em 100 ms.
  const bloco = Math.round(taxa * 0.4);
  const passo = Math.round(taxa * 0.1);
  const potencias: number[] = [];
  for (let ini = 0; ini + bloco <= filtrados[0].length; ini += passo) {
    let potencia = 0;
    for (const c of filtrados) {
      let soma = 0;
      for (let i = ini; i < ini + bloco; i++) soma += c[i] * c[i];
      potencia += soma / bloco;
    }
    potencias.push(potencia);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const media = (ps: number[]) => ps.reduce((a, b) => a + b, 0) / ps.length;
  // Portões: silêncio e trechos muito baixos não entram na conta, senão uma
  // intro vazia faria a música parecer mais baixa do que é.
  const audiveis = potencias.filter((p) => lufs(p) > -70);
  if (!audiveis.length) return -Infinity;
  const limiar = lufs(media(audiveis)) - 10;
  const finais = audiveis.filter((p) => lufs(p) > limiar);
  return finais.length ? lufs(media(finais)) : -Infinity;
}
