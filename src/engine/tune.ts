// Tune (correção de afinação), feito em três etapas clássicas:
//   1. Descobrir a nota cantada a cada instante (detecção de pitch, método YIN).
//   2. Escolher a nota certa mais próxima dentro da escala da música.
//   3. Mudar a altura da voz sem mudar a duração (TD-PSOLA).
// Funções puras sobre arrays de samples: não dependem do navegador.

export type EscalaTune = 'maior' | 'menor' | 'cromatica';

const GRAUS: Record<EscalaTune, number[]> = {
  maior: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10],
  cromatica: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

/** Intervalo entre análises de pitch, em samples do áudio original. */
const SALTO = 512;
const F_MIN = 70;
const F_MAX = 600;

/**
 * Etapa 1. Devolve a frequência (Hz) em cada quadro; 0 = sem nota (silêncio,
 * consoante, respiração).
 *
 * YIN: uma nota é um desenho de onda que se repete. Deslocamos o sinal contra
 * ele mesmo e medimos a diferença; o deslocamento em que a diferença quase
 * some é o período da nota.
 */
export function detectarPitch(x: Float32Array, taxa: number): Float32Array {
  // A voz cabe folgada abaixo de 5 kHz; analisar a 1/4 da taxa é 16x mais rápido.
  const D = 4;
  const y = new Float32Array(Math.floor(x.length / D));
  for (let i = 0; i < y.length; i++) y[i] = (x[i * D] + x[i * D + 1] + x[i * D + 2] + x[i * D + 3]) / 4;
  const taxaD = taxa / D;
  const W = 512;
  const lagMin = Math.floor(taxaD / F_MAX);
  const lagMax = Math.ceil(taxaD / F_MIN);
  const salto = SALTO / D;
  const quadros = Math.ceil(x.length / SALTO);
  const f0 = new Float32Array(quadros);
  const d = new Float32Array(lagMax + 2);

  for (let q = 0; q < quadros; q++) {
    const ini = q * salto - W / 2;
    if (ini < 0 || ini + W + lagMax + 1 >= y.length) continue;
    let energia = 0;
    for (let j = 0; j < W; j++) energia += y[ini + j] * y[ini + j];
    if (Math.sqrt(energia / W) < 0.01) continue;

    // Diferença para cada deslocamento, normalizada pela média acumulada.
    let acumulado = 0;
    d[0] = 1;
    for (let lag = 1; lag <= lagMax + 1; lag++) {
      let soma = 0;
      for (let j = 0; j < W; j++) {
        const dif = y[ini + j] - y[ini + j + lag];
        soma += dif * dif;
      }
      acumulado += soma;
      d[lag] = acumulado > 0 ? (soma * lag) / acumulado : 1;
    }

    // Primeiro vale abaixo do limiar: evita cair numa oitava errada.
    let lag = lagMin;
    while (lag <= lagMax && d[lag] > 0.15) lag++;
    if (lag > lagMax) continue;
    while (lag < lagMax && d[lag + 1] < d[lag]) lag++;

    // Interpolação parabólica: precisão melhor que um sample.
    const a = d[lag - 1], b = d[lag], c = d[lag + 1];
    const den = a - 2 * b + c;
    const fino = lag + (den !== 0 ? (0.5 * (a - c)) / den : 0);
    f0[q] = taxaD / fino;
  }

  // Mediana de 3 quadros remove saltos isolados de detecção.
  const liso = new Float32Array(quadros);
  for (let q = 0; q < quadros; q++) {
    const tres = [f0[Math.max(0, q - 1)], f0[q], f0[Math.min(quadros - 1, q + 1)]].sort((m, n) => m - n);
    liso[q] = f0[q] === 0 ? 0 : tres[1] || f0[q];
  }
  return liso;
}

const paraMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

/** Etapa 2. Nota da escala mais próxima (em número MIDI, pode ser fracionário na entrada). */
export function notaAlvo(midi: number, tom: number, escala: EscalaTune): number {
  const graus = GRAUS[escala];
  let melhor = Math.round(midi);
  let menor = Infinity;
  for (let n = Math.round(midi) - 2; n <= Math.round(midi) + 2; n++) {
    if (!graus.includes((((n - tom) % 12) + 12) % 12)) continue;
    const dist = Math.abs(n - midi);
    if (dist < menor) {
      menor = dist;
      melhor = n;
    }
  }
  return melhor;
}

/** Sobe ou desce uma nota da escala por `graus` degraus da própria escala (2 = uma terça). */
export function grauMais(midi: number, tom: number, escala: EscalaTune, graus: number): number {
  const lista = GRAUS[escala];
  let nota = midi;
  for (let k = 0; k < Math.abs(graus); k++) {
    do nota += Math.sign(graus);
    while (!lista.includes((((nota - tom) % 12) + 12) % 12));
  }
  return nota;
}

export interface OpcoesTune {
  tom: number;
  escala: EscalaTune;
  /** 0 = pula direto para a nota (efeito robótico); 1 = desliza devagar (natural). */
  velocidade: number;
  /** Quanto da correção aplicar: 0 = nada, 1 = até a nota exata. Padrão 1. */
  intensidade?: number;
  /** Semitons somados à voz inteira (voz mais grossa ou mais fina). Padrão 0. */
  transpor?: number;
  /** Harmonia: desloca cada nota este número de graus da escala (2 = terça acima). Padrão 0. */
  graus?: number;
}

export function afinar(x: Float32Array, taxa: number, op: OpcoesTune): Float32Array {
  const f0 = detectarPitch(x, taxa);
  const quadros = f0.length;

  // Para cada quadro: período da voz (em samples) e quanto multiplicar a altura.
  const periodo = new Float32Array(quadros);
  const razao = new Float32Array(quadros);
  const suavizacao = op.velocidade <= 0 ? 1 : 1 - Math.exp(-(SALTO / taxa) / (op.velocidade * 0.25));
  const intensidade = op.intensidade ?? 1;
  const transpor = op.transpor ?? 0;
  let saida = 0;
  let cantando = false;
  let ultimoPeriodo = taxa / 200;
  for (let q = 0; q < quadros; q++) {
    if (f0[q] > 0) {
      const midi = paraMidi(f0[q]);
      const naEscala = notaAlvo(midi, op.tom, op.escala);
      const alvo = op.graus ? grauMais(naEscala, op.tom, op.escala, op.graus) : midi + (naEscala - midi) * intensidade;
      // No começo de cada nota parte da altura cantada; depois persegue o alvo.
      saida = cantando ? saida + (alvo - saida) * suavizacao : midi + (alvo - midi) * suavizacao;
      cantando = true;
      ultimoPeriodo = taxa / f0[q];
      // Menos de 3 cents de erro ninguém ouve: melhor deixar a voz intacta.
      const semitons = (Math.abs(saida - midi) < 0.03 ? 0 : saida - midi) + transpor;
      razao[q] = Math.min(2, Math.max(0.5, 2 ** (semitons / 12)));
    } else {
      cantando = false;
      razao[q] = 2 ** (transpor / 12);
    }
    periodo[q] = ultimoPeriodo;
  }
  const quadroEm = (t: number) => Math.min(quadros - 1, Math.max(0, Math.round(t / SALTO)));

  // Etapa 3 (TD-PSOLA). A voz é uma fila de pulsos, um por período. Recortamos
  // "grãos" de dois períodos em volta de cada pulso e os recolocamos mais
  // juntos (nota sobe) ou mais afastados (nota desce). Como cada grão mantém
  // seu formato, o timbre e a duração não mudam.
  const n = x.length;
  const marcas: number[] = [];
  for (let t = 0; t < n; t += periodo[quadroEm(t)]) marcas.push(t);

  const y = new Float32Array(n);
  const peso = new Float32Array(n);
  let j = 0;
  for (let t = 0; t < n; ) {
    while (j + 1 < marcas.length && Math.abs(marcas[j + 1] - t) <= Math.abs(marcas[j] - t)) j++;
    const q = quadroEm(t);
    const P = periodo[quadroEm(marcas[j])];
    const centro = Math.round(t);
    const desvio = marcas[j] - t;
    const meio = Math.floor(P);
    for (let k = -meio; k <= meio; k++) {
      const destino = centro + k;
      if (destino < 0 || destino >= n) continue;
      const origem = destino + desvio;
      const i0 = Math.floor(origem);
      if (i0 < 0 || i0 + 1 >= n) continue;
      const frac = origem - i0;
      const janela = 0.5 * (1 + Math.cos((Math.PI * (destino - t)) / P));
      if (janela <= 0) continue;
      y[destino] += (x[i0] * (1 - frac) + x[i0 + 1] * frac) * janela;
      peso[destino] += janela;
    }
    t += periodo[q] / razao[q];
  }
  for (let i = 0; i < n; i++) y[i] = peso[i] > 1e-3 ? y[i] / peso[i] : x[i];
  return y;
}
