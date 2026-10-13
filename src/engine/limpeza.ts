// Limpeza da gravação, feita antes do tune e dos efeitos:
//   - Gate: abafa o que sobra entre as frases (chiado, ventilador, respiração
//     do ambiente), deixando passar só quando há voz.
//   - De-esser: segura os "s" e "ch" quando ficam ardidos.
//   - Redução de ruído: tira o chiado contínuo que fica por baixo da voz.
//   - Nivelamento: iguala o volume das frases, como um engenheiro faz à mão.
// Funções puras sobre os samples.

import { fft } from './fft.ts';

/**
 * Gate. Quando o volume fica abaixo de `limiarDb`, o som é reduzido em 30 dB
 * (não some de vez, o que soaria artificial). Abre rápido para não comer o
 * começo das palavras e fecha devagar para não cortar o fim.
 */
export function gate(x: Float32Array, taxa: number, limiarDb: number): Float32Array {
  const limiar = 10 ** (limiarDb / 20);
  const piso = 10 ** (-30 / 20);
  const janela = Math.round(taxa * 0.01);
  const antecipa = Math.round(taxa * 0.005);
  const segura = Math.round(taxa * 0.12);
  const abre = 1 - Math.exp(-1 / (taxa * 0.003));
  const fecha = 1 - Math.exp(-1 / (taxa * 0.15));
  const y = new Float32Array(x.length);
  let soma = 0;
  let aberto = 0;
  let ganho = piso;
  for (let i = 0; i < x.length; i++) {
    // Volume médio dos 10 ms à frente (olhar adiante evita cortar a primeira sílaba).
    const frente = i + antecipa;
    if (frente < x.length) soma += x[frente] * x[frente];
    if (frente - janela >= 0) soma -= x[frente - janela] * x[frente - janela];
    if (Math.sqrt(Math.max(0, soma) / janela) > limiar) aberto = segura;
    else if (aberto > 0) aberto--;
    const alvo = aberto > 0 ? 1 : piso;
    ganho += (alvo - ganho) * (alvo > ganho ? abre : fecha);
    y[i] = x[i] * ganho;
  }
  return y;
}

/**
 * De-esser. Separa os agudos acima de 5,5 kHz, onde moram os "s". Quando
 * essa faixa domina o som (sinal de sibilância), ela é reduzida em até
 * 12 dB, conforme `quanto` (0 a 1). O resto da voz não é tocado.
 */
export function deEsser(x: Float32Array, taxa: number, quanto: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * 5500) / taxa);
  const sobe = 1 - Math.exp(-1 / (taxa * 0.001));
  const desce = 1 - Math.exp(-1 / (taxa * 0.04));
  const reducaoMax = 1 - 10 ** ((-12 * quanto) / 20);
  const y = new Float32Array(x.length);
  let grave = 0;
  let envAgudo = 0;
  let envTotal = 0;
  for (let i = 0; i < x.length; i++) {
    grave = (1 - a) * x[i] + a * grave;
    const agudo = x[i] - grave;
    const na = Math.abs(agudo);
    const nt = Math.abs(x[i]);
    envAgudo += (na - envAgudo) * (na > envAgudo ? sobe : desce);
    envTotal += (nt - envTotal) * (nt > envTotal ? sobe : desce);
    // Sibilância: agudos fortes e respondendo por boa parte do som.
    const proporcao = envTotal > 1e-4 ? envAgudo / envTotal : 0;
    const sibilancia = envAgudo > 0.01 ? Math.min(1, Math.max(0, (proporcao - 0.35) / 0.3)) : 0;
    y[i] = x[i] - agudo * reducaoMax * sibilancia;
  }
  return y;
}

/**
 * Redução de ruído por subtração espectral. O ruído de fundo (chiado,
 * ventilador) é contínuo; a voz não. Os trechos mais silenciosos da gravação
 * mostram como é esse ruído em cada frequência, e em todo o resto cada
 * frequência que não se destaca dele é abaixada. `quanto` vai de 0 a 1.
 */
export function reduzirRuido(x: Float32Array, _taxa: number, quanto: number): Float32Array {
  const N = 1024;
  const salto = N / 4;
  const janela = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const quadros = Math.max(0, Math.floor((x.length - N) / salto) + 1);
  if (quadros < 8) return x.slice();
  const meio = N / 2 + 1;

  // 1. Espectro de cada quadro.
  const modulos: Float32Array[] = [];
  const fases: Float32Array[] = [];
  const energia = new Float32Array(quadros);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let q = 0; q < quadros; q++) {
    for (let i = 0; i < N; i++) {
      re[i] = x[q * salto + i] * janela[i];
      im[i] = 0;
    }
    fft(re, im);
    const m = new Float32Array(meio);
    const f = new Float32Array(meio);
    for (let k = 0; k < meio; k++) {
      m[k] = Math.hypot(re[k], im[k]);
      f[k] = Math.atan2(im[k], re[k]);
      energia[q] += m[k] * m[k];
    }
    modulos.push(m);
    fases.push(f);
  }

  // 2. Perfil do ruído: média dos 10% de quadros mais silenciosos.
  const ordem = [...energia.keys()].sort((a, b) => energia[a] - energia[b]).slice(0, Math.max(4, Math.floor(quadros * 0.1)));
  const ruido = new Float32Array(meio);
  for (const q of ordem) for (let k = 0; k < meio; k++) ruido[k] += modulos[q][k] / ordem.length;

  // 3. Em cada frequência, o que está perto do ruído é abaixado; o que se
  //    destaca dele passa. O ganho é suavizado no tempo para não "borbulhar".
  const y = new Float32Array(x.length);
  const peso = new Float32Array(x.length);
  const piso = 1 - 0.9 * quanto;
  const ganho = new Float32Array(meio).fill(1);
  for (let q = 0; q < quadros; q++) {
    for (let k = 0; k < meio; k++) {
      const acima = modulos[q][k] / (ruido[k] * (1 + 2 * quanto) + 1e-9);
      const alvo = Math.max(piso, Math.min(1, (acima - 1) / 1.5));
      ganho[k] += (alvo - ganho[k]) * (alvo > ganho[k] ? 0.7 : 0.3);
      const m = modulos[q][k] * ganho[k];
      re[k] = m * Math.cos(fases[q][k]);
      im[k] = m * Math.sin(fases[q][k]);
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      y[q * salto + i] += re[i] * janela[i];
      peso[q * salto + i] += janela[i] * janela[i];
    }
  }
  for (let i = 0; i < y.length; i++) y[i] = peso[i] > 1e-3 ? y[i] / peso[i] : x[i];
  return y;
}

/**
 * Nivelamento por frase. Divide a gravação em frases (trechos de voz
 * separados por silêncio), mede o volume de cada uma e aproxima todas do
 * volume típico, em até 6 dB. `quanto` vai de 0 (nada) a 1 (iguala tudo).
 */
export function nivelar(x: Float32Array, taxa: number, quanto: number): Float32Array {
  const bloco = Math.round(taxa * 0.02);
  const n = Math.floor(x.length / bloco);
  const nivel = new Float32Array(n);
  let maior = 0;
  for (let b = 0; b < n; b++) {
    let s = 0;
    for (let i = b * bloco; i < (b + 1) * bloco; i++) s += x[i] * x[i];
    nivel[b] = Math.sqrt(s / bloco);
    maior = Math.max(maior, nivel[b]);
  }
  if (maior < 1e-4) return x.slice();
  // Frase: sequência de blocos com voz, tolerando pausas de até 0,3 s.
  const limiar = maior * 10 ** (-30 / 20);
  const pausa = Math.round(0.3 / 0.02);
  const frases: { ini: number; fim: number; rms: number }[] = [];
  let ini = -1;
  let silencio = 0;
  const fechar = (fim: number) => {
    let s = 0, c = 0;
    for (let b = ini; b <= fim; b++) if (nivel[b] > limiar) {
      s += nivel[b] * nivel[b];
      c++;
    }
    if (c > 5) frases.push({ ini, fim, rms: Math.sqrt(s / c) });
    ini = -1;
  };
  for (let b = 0; b < n; b++) {
    if (nivel[b] > limiar) {
      if (ini < 0) ini = b;
      silencio = 0;
    } else if (ini >= 0 && ++silencio > pausa) fechar(b - silencio);
  }
  if (ini >= 0) fechar(n - 1);
  if (frases.length < 2) return x.slice();
  const tipico = [...frases].sort((a, b) => a.rms - b.rms)[Math.floor(frases.length / 2)].rms;

  // Ganho por bloco (1 fora das frases), suavizado para não haver degraus.
  const ganho = new Float32Array(n).fill(1);
  for (const f of frases) {
    const db = Math.max(-6, Math.min(6, 20 * Math.log10(tipico / f.rms))) * quanto;
    for (let b = f.ini; b <= f.fim; b++) ganho[b] = 10 ** (db / 20);
  }
  const y = new Float32Array(x.length);
  const suave = 1 - Math.exp(-1 / (taxa * 0.05));
  let g = ganho[0];
  for (let i = 0; i < x.length; i++) {
    g += (ganho[Math.min(n - 1, Math.floor(i / bloco))] - g) * suave;
    y[i] = x[i] * g;
  }
  return y;
}

/** Instantes (em segundos) em que cada frase termina. Serve para o eco só no fim da frase. */
export function fimDasFrases(x: Float32Array, taxa: number): number[] {
  const bloco = Math.round(taxa * 0.02);
  const n = Math.floor(x.length / bloco);
  const nivel = new Float32Array(n);
  let maior = 0;
  for (let b = 0; b < n; b++) {
    let s = 0;
    for (let i = b * bloco; i < (b + 1) * bloco; i++) s += x[i] * x[i];
    nivel[b] = Math.sqrt(s / bloco);
    maior = Math.max(maior, nivel[b]);
  }
  const limiar = maior * 10 ** (-28 / 20);
  const fins: number[] = [];
  let voz = 0;
  let silencio = 0;
  for (let b = 0; b < n; b++) {
    if (nivel[b] > limiar) {
      voz++;
      silencio = 0;
    } else if (voz > 15 && ++silencio === 12) {
      // Meio segundo de voz seguido de um quarto de segundo de silêncio: a frase acabou.
      fins.push(((b - silencio) * bloco) / taxa);
      voz = 0;
    } else if (voz <= 15 && silencio++ > 12) voz = 0;
  }
  return fins;
}
