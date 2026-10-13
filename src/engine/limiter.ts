// Limitador de pico com antecipação ("lookahead"). Garante que nenhum sample
// passe do teto, sem distorcer: como ele enxerga alguns milissegundos à
// frente, começa a abaixar o volume antes do pico chegar e solta depois.
// Função pura sobre os samples; altera os canais no lugar.
//
// O teto vale para o PICO REAL: o áudio digital guarda só alguns pontos da
// onda, e a onda verdadeira, reconstruída pela caixa de som ou pelo MP3, pode
// passar entre dois pontos acima de ambos. As plataformas medem esse pico
// (dBTP, norma ITU-R BS.1770), então é ele que precisa caber no teto.

/** Pesos para reconstruir a onda em 1/4, 1/2 e 3/4 do caminho entre dois samples (sinc com janela). */
const MEIA = 8;
const FASES = [0.25, 0.5, 0.75].map((f) => {
  const pesos = new Float32Array(MEIA * 2);
  for (let k = -MEIA + 1; k <= MEIA; k++) {
    const t = f - k;
    pesos[k + MEIA - 1] = (Math.sin(Math.PI * t) / (Math.PI * t)) * (0.5 + 0.5 * Math.cos((Math.PI * t) / MEIA));
  }
  return pesos;
});

/** Maior valor que a onda atinge entre o sample `i` e o seguinte, contando os próprios samples. */
function picoEntre(c: Float32Array, i: number): number {
  let pico = Math.abs(c[i]);
  if (i < MEIA || i + MEIA >= c.length) return pico;
  for (const pesos of FASES) {
    let s = 0;
    for (let k = 0; k < MEIA * 2; k++) s += c[i - MEIA + 1 + k] * pesos[k];
    if (Math.abs(s) > pico) pico = Math.abs(s);
  }
  return pico;
}

/** Pico real do áudio, em dB (dBTP). */
export function picoRealDb(canais: Float32Array[]): number {
  let pico = 0;
  for (const c of canais) {
    for (let i = 0; i < c.length; i++) {
      // Só vale reconstruir onde o som já está alto: é onde o pico real pode importar.
      const v = Math.abs(c[i]) > 0.25 ? picoEntre(c, i) : Math.abs(c[i]);
      if (v > pico) pico = v;
    }
  }
  return 20 * Math.log10(pico || 1e-6);
}

export function limitar(canais: Float32Array[], taxa: number, tetoDb: number, soltaSeg = 0.08) {
  const n = canais[0].length;
  const teto = 10 ** (tetoDb / 20);
  const L = Math.max(1, Math.round(taxa * 0.005));

  // 1. Ganho que cada instante precisaria, sozinho, para caber no teto.
  const ganho = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let pico = 0;
    for (const c of canais) {
      const v = Math.abs(c[i]) > teto * 0.5 ? picoEntre(c, i) : Math.abs(c[i]);
      if (v > pico) pico = v;
    }
    ganho[i] = pico > teto ? teto / pico : 1;
  }

  // 2. Antecipação: em cada instante vale o menor ganho dos próximos L samples
  //    (mínimo deslizante com fila monotônica).
  const minimo = new Float32Array(n);
  const fila = new Int32Array(n);
  let ini = 0;
  let fim = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (fim > ini && ganho[fila[fim - 1]] >= ganho[i]) fim--;
    fila[fim++] = i;
    while (fila[ini] > i + L - 1) ini++;
    minimo[i] = ganho[fila[ini]];
  }

  // 3. Soltura: depois do pico, o volume volta aos poucos, não de uma vez.
  const coef = 1 - Math.exp(-1 / (taxa * soltaSeg));
  let env = 1;
  for (let i = 0; i < n; i++) {
    env = Math.min(minimo[i], env + (1 - env) * coef);
    minimo[i] = env;
  }

  // 4. Média dos últimos L valores: transforma degraus em rampas. Como todos
  //    os valores da janela já respeitam o pico atual, a média também respeita.
  let soma = 0;
  for (let i = 0; i < n; i++) {
    soma += minimo[i];
    if (i >= L) soma -= minimo[i - L];
    const g = soma / Math.min(i + 1, L);
    for (const c of canais) c[i] *= g;
  }
}
