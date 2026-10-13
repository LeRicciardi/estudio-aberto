// Análise de áudio: descobrir o andamento (BPM) e o tom de um beat pronto, e
// avaliar o nível de uma gravação. Funções puras sobre os samples.
// São estimativas: acertam na maioria dos beats, mas a pessoa confirma.

/**
 * BPM. Ideia: marcar os instantes em que o som "ataca" (bumbo, caixa) e
 * procurar o intervalo de tempo em que esses ataques mais se repetem.
 * Devolve também o dobro ou a metade, porque 70 e 140 BPM são a mesma
 * batida contada de dois jeitos.
 */
export function detectarBpm(x: Float32Array, taxa: number): { bpm: number; alternativa: number } | null {
  // Envelope: energia a cada 10 ms. Ataque = quanto a energia subiu.
  const salto = Math.round(taxa / 100);
  const n = Math.floor(x.length / salto);
  if (n < 400) return null;
  const ataque = new Float32Array(n);
  let anterior = 0;
  let media = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * salto; j < (i + 1) * salto; j++) e += x[j] * x[j];
    const nivel = Math.sqrt(e / salto);
    ataque[i] = Math.max(0, nivel - anterior);
    anterior = nivel;
    media += ataque[i];
  }
  media /= n;
  if (media < 1e-5) return null;
  for (let i = 0; i < n; i++) ataque[i] -= media;

  // Autocorrelação: o quanto o sinal se parece com ele mesmo deslocado.
  const semelhanca = (atraso: number) => {
    const a = Math.floor(atraso);
    const f = atraso - a;
    let soma = 0;
    for (let i = 0; i + a + 1 < n; i++) soma += ataque[i] * (ataque[i + a] * (1 - f) + ataque[i + a + 1] * f);
    return soma / (n - a);
  };
  let melhor = 0;
  let melhorNota = -Infinity;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const batida = 6000 / bpm; // em quadros de 10 ms
    // Um andamento certo se repete na batida, em duas batidas e no compasso.
    const nota = semelhanca(batida) + 0.5 * semelhanca(batida * 2) + 0.25 * semelhanca(batida * 4);
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = bpm;
    }
  }
  const bpm = Math.round(melhor);
  return { bpm, alternativa: bpm >= 120 ? Math.round(bpm / 2) : bpm * 2 };
}

// Perfis de Krumhansl: o quanto cada uma das 12 notas costuma aparecer em
// músicas em tom maior e menor (resultado público de estudos de percepção).
const PERFIL_MAIOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PERFIL_MENOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlacao(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

/**
 * Tom. Mede quanta energia existe em cada uma das 12 notas (somando as
 * oitavas) e compara com os perfis de tom maior e menor nas 12 posições.
 * `confianca` é a distância para o segundo colocado: perto de zero, é chute.
 */
export function detectarTom(x: Float32Array, taxa: number): { tom: number; escala: 'maior' | 'menor'; confianca: number } | null {
  const D = 4;
  const y = new Float32Array(Math.floor(x.length / D));
  for (let i = 0; i < y.length; i++) y[i] = (x[i * D] + x[i * D + 1] + x[i * D + 2] + x[i * D + 3]) / 4;
  const taxaD = taxa / D;
  const N = 4096;
  if (y.length < N * 4) return null;
  const croma = new Array<number>(12).fill(0);
  // Algoritmo de Goertzel: mede a energia de uma única frequência, barato.
  const coefs: number[] = [];
  for (let midi = 36; midi < 84; midi++) coefs.push(2 * Math.cos((2 * Math.PI * 440 * 2 ** ((midi - 69) / 12)) / taxaD));
  for (let ini = 0; ini + N <= y.length; ini += N) {
    for (let k = 0; k < coefs.length; k++) {
      let s1 = 0, s2 = 0;
      for (let i = ini; i < ini + N; i++) {
        const s = y[i] + coefs[k] * s1 - s2;
        s2 = s1;
        s1 = s;
      }
      croma[k % 12] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coefs[k] * s1 * s2));
    }
  }
  if (croma.every((v) => v < 1e-6)) return null;

  const candidatos: { tom: number; escala: 'maior' | 'menor'; nota: number }[] = [];
  for (let tom = 0; tom < 12; tom++) {
    const girado = croma.map((_, i) => croma[(i + tom) % 12]);
    candidatos.push({ tom, escala: 'maior', nota: correlacao(girado, PERFIL_MAIOR) });
    candidatos.push({ tom, escala: 'menor', nota: correlacao(girado, PERFIL_MENOR) });
  }
  candidatos.sort((a, b) => b.nota - a.nota);
  return { tom: candidatos[0].tom, escala: candidatos[0].escala, confianca: candidatos[0].nota - candidatos[1].nota };
}

/** Pico e volume médio de uma gravação, em dB (0 = máximo). */
export function nivelDaGravacao(x: Float32Array): { picoDb: number; rmsDb: number } {
  let pico = 0;
  let soma = 0;
  for (const v of x) {
    pico = Math.max(pico, Math.abs(v));
    soma += v * v;
  }
  return { picoDb: 20 * Math.log10(pico || 1e-6), rmsDb: 20 * Math.log10(Math.sqrt(soma / (x.length || 1)) || 1e-6) };
}

/** Diz, em linguagem comum, se a gravação ficou boa de nível. null = está boa. */
export function avisoDeNivel(x: Float32Array): string | null {
  const { picoDb, rmsDb } = nivelDaGravacao(x);
  if (picoDb > -0.3) return 'A voz estourou (distorceu) em algum ponto. Afaste-se um pouco do microfone ou cante mais baixo e grave de novo.';
  if (rmsDb < -45) return 'Quase não entrou som. Confira se o microfone certo está escolhido e chegue mais perto.';
  if (picoDb < -24) return 'A voz ficou bem baixa. Chegue mais perto do microfone; gravação baixa traz chiado junto quando aumenta.';
  return null;
}
