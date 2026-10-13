// Diagnóstico da mix: mede a música e diz, em linguagem comum, o que está
// atrapalhando e por quê. Cada achado pode trazer uma correção sugerida.
// Funções puras sobre os samples já renderizados.

import { fft } from './fft.ts';
import { medirLufs } from './loudness.ts';

export type Correcao =
  | { tipo: 'volumeDaVoz'; db: number }
  | { tipo: 'abrirEspaco' }
  | { tipo: 'deEsser' }
  | { tipo: 'cortarCorpo' }
  | { tipo: 'comprimirMais' }
  | { tipo: 'fecharEstereo' }
  | { tipo: 'regravar' };

export interface Achado {
  gravidade: 'problema' | 'atencao' | 'ok';
  titulo: string;
  explicacao: string;
  correcao?: Correcao;
  /** Texto do botão da correção. */
  acao?: string;
}

/**
 * Energia média em cada faixa de frequência (em dB), considerando só os
 * quadros em que `ativo` diz que há som (por exemplo, onde a voz canta).
 */
export function energiaPorFaixa(x: Float32Array, taxa: number, faixas: [number, number][], ativo?: (quadro: number) => boolean): number[] {
  const N = 2048;
  const somas = faixas.map(() => 0);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let quadros = 0;
  for (let ini = 0, q = 0; ini + N <= x.length; ini += N, q++) {
    if (ativo && !ativo(q)) continue;
    for (let i = 0; i < N; i++) {
      re[i] = x[ini + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    faixas.forEach(([de, ate], f) => {
      for (let k = Math.ceil((de * N) / taxa); k <= Math.floor((ate * N) / taxa) && k < N / 2; k++) somas[f] += re[k] * re[k] + im[k] * im[k];
    });
    quadros++;
  }
  return somas.map((s) => 10 * Math.log10(s / Math.max(1, quadros) + 1e-12));
}

const mono = (canais: Float32Array[]) => {
  const m = new Float32Array(canais[0].length);
  for (const c of canais) for (let i = 0; i < m.length; i++) m[i] += c[i] / canais.length;
  return m;
};

export interface EntradaDoDiagnostico {
  /** Renders separados, todos com a mesma duração e taxa. */
  voz: Float32Array[];
  beat: Float32Array[];
  mix: Float32Array[];
  taxa: number;
  /** Maior pico (0 a 1) entre as gravações originais, antes de qualquer efeito. */
  picoDasGravacoes: number;
  /** Volume-alvo escolhido no master, ou null. */
  alvoLufs: number | null;
}

export function diagnosticar(e: EntradaDoDiagnostico): Achado[] {
  const achados: Achado[] = [];
  const voz = mono(e.voz);
  const beat = mono(e.beat);
  const N = 2048;

  // Quadros em que a voz está cantando: só neles a comparação com o beat faz sentido.
  const nivelDaVoz: number[] = [];
  for (let ini = 0; ini + N <= voz.length; ini += N) {
    let s = 0;
    for (let i = ini; i < ini + N; i++) s += voz[i] * voz[i];
    nivelDaVoz.push(10 * Math.log10(s / N + 1e-12));
  }
  const maior = Math.max(...nivelDaVoz, -120);
  const cantando = (q: number) => nivelDaVoz[q] > maior - 25;
  const quadrosCantados = nivelDaVoz.filter((_, q) => cantando(q));
  if (maior < -70 || quadrosCantados.length < 5) {
    return [{ gravidade: 'atencao', titulo: 'Sem voz para analisar', explicacao: 'O diagnóstico compara a voz com o beat. Grave um take (ou tire o mudo) e rode de novo.' }];
  }

  // 1. Gravação estourada: não tem conserto depois.
  if (e.picoDasGravacoes >= 0.99) {
    achados.push({
      gravidade: 'problema', titulo: 'A gravação estourou',
      explicacao: 'Algum take bateu no volume máximo do microfone e distorceu. Nenhum efeito recupera isso: o som cortado se perdeu.',
      correcao: { tipo: 'regravar' }, acao: 'Ir para Gravar',
    });
  }

  // 2. Equilíbrio de volume entre voz e beat.
  const diferenca = medirLufs(e.voz, e.taxa) - medirLufs(e.beat, e.taxa);
  if (Number.isFinite(diferenca)) {
    if (diferenca < -4) {
      achados.push({
        gravidade: 'problema', titulo: `A voz está ${Math.round(-diferenca)} dB abaixo do beat`,
        explicacao: 'Com essa diferença a letra some, principalmente em caixa pequena. Em rap e trap a voz costuma ficar no mesmo volume do beat ou um pouco acima.',
        correcao: { tipo: 'volumeDaVoz', db: Math.min(9, -diferenca) }, acao: 'Subir a voz',
      });
    } else if (diferenca > 6) {
      achados.push({
        gravidade: 'atencao', titulo: `A voz está ${Math.round(diferenca)} dB acima do beat`,
        explicacao: 'A voz soa colada por cima, e não dentro da música. O beat perde força.',
        correcao: { tipo: 'volumeDaVoz', db: -(diferenca - 3) }, acao: 'Baixar a voz',
      });
    } else {
      achados.push({ gravidade: 'ok', titulo: 'Volume de voz e beat equilibrado', explicacao: 'A voz aparece sem se descolar do beat.' });
    }
  }

  // 3. Mascaramento: o beat ocupando a faixa que dá clareza à voz (2 a 5 kHz).
  const [vozClareza, vozCorpo, vozFala, vozS] = energiaPorFaixa(voz, e.taxa, [[2000, 5000], [200, 450], [1000, 4000], [6000, 10000]], cantando);
  const [beatClareza] = energiaPorFaixa(beat, e.taxa, [[2000, 5000]], cantando);
  if (beatClareza > vozClareza - 3) {
    achados.push({
      gravidade: 'problema', titulo: 'O beat está cobrindo a clareza da voz',
      explicacao: 'Entre 2 e 5 kHz mora a inteligibilidade da letra. Nessa faixa o beat está tão forte quanto a voz, então as palavras embolam mesmo com a voz alta.',
      correcao: { tipo: 'abrirEspaco' }, acao: 'Abrir espaço no beat',
    });
  }

  // 4. Voz abafada: corpo demais em relação à faixa da fala.
  if (vozCorpo > vozFala + 14) {
    achados.push({
      gravidade: 'atencao', titulo: 'A voz está abafada',
      explicacao: 'Há muito grave-médio (200 a 450 Hz) na voz em relação ao resto. É comum em gravação de quarto, com o microfone perto de parede ou muito colado na boca.',
      correcao: { tipo: 'cortarCorpo' }, acao: 'Cortar 3 dB no corpo',
    });
  }

  // 5. Sibilância: "s" e "ch" ardidos.
  if (vozS > vozFala - 2) {
    achados.push({
      gravidade: 'atencao', titulo: 'Os "s" estão ardidos',
      explicacao: 'Os agudos entre 6 e 10 kHz estão fortes demais em relação à fala. Acontece muito depois de dar brilho no equalizador.',
      correcao: { tipo: 'deEsser' }, acao: 'Ligar o de-esser',
    });
  }

  // 6. Dinâmica: voz variando demais de volume.
  const media = quadrosCantados.reduce((a, b) => a + b, 0) / quadrosCantados.length;
  const variacao = Math.sqrt(quadrosCantados.reduce((a, b) => a + (b - media) ** 2, 0) / quadrosCantados.length);
  if (variacao > 7) {
    achados.push({
      gravidade: 'atencao', titulo: 'O volume da voz varia demais',
      explicacao: 'Algumas palavras saltam e outras somem. Mais compressão aproxima as partes fracas das fortes e a voz fica "parada no lugar".',
      correcao: { tipo: 'comprimirMais' }, acao: 'Comprimir mais',
    });
  }

  // 7. Mono: quanto a música perde quando os dois lados são somados (caixa de celular, som de festa).
  if (e.mix.length > 1) {
    const perda = medirLufs([mono(e.mix)], e.taxa) + 3.01 - medirLufs(e.mix, e.taxa);
    if (Number.isFinite(perda) && perda < -3) {
      achados.push({
        gravidade: 'atencao', titulo: 'A música perde força em mono',
        explicacao: `Somando os dois lados, ela cai ${Math.abs(perda).toFixed(0)} dB. Caixa de celular e muito som de festa tocam em mono, e lá partes da música vão sumir.`,
        correcao: { tipo: 'fecharEstereo' }, acao: 'Fechar o estéreo',
      });
    }
  }

  // 8. Volume final.
  const lufs = medirLufs(e.mix, e.taxa);
  if (Number.isFinite(lufs) && e.alvoLufs === null && (lufs < -18 || lufs > -9)) {
    achados.push({
      gravidade: 'atencao', titulo: lufs < -18 ? 'A música está baixa' : 'A música está alta demais',
      explicacao: `Ela mede ${lufs.toFixed(1)} LUFS. As plataformas trabalham perto de -14. Escolha um "Volume final" na página Master para a exportação ajustar sozinha.`,
    });
  }

  if (!achados.some((a) => a.gravidade !== 'ok')) {
    achados.push({ gravidade: 'ok', titulo: 'Nenhum problema encontrado', explicacao: 'As medições estão dentro do esperado. O resto é gosto: confie no ouvido e compare com uma música de referência.' });
  }
  return achados;
}

/** Notação Camelot do tom, usada por DJs para saber quais músicas combinam (ex.: Lá menor = 8A). */
export function camelot(tom: number, escala: 'maior' | 'menor'): string {
  const passo = (tom * 7) % 12;
  return escala === 'maior' ? `${((passo + 7) % 12) + 1}B` : `${((passo + 4) % 12) + 1}A`;
}

export interface Sugestao {
  /** Ganho da gravação para a voz chegar a um volume de trabalho, em dB. */
  ganhoDb: number;
  corte: number;
  graveDb: number;
  arDb: number;
  deEsser: number;
  /** Limiar do compressor, relativo ao volume desta gravação. */
  limiar: number;
  /** Limiar do gate em dB, ou 0 quando o fundo já é silencioso. */
  gate: number;
  motivos: string[];
}

/**
 * Mede uma gravação e sugere os ajustes de partida para ela: em vez de
 * valores fixos de preset, números tirados da própria voz.
 */
export function sugerirAjustes(x: Float32Array, taxa: number): Sugestao {
  const N = 2048;
  const niveis: number[] = [];
  for (let ini = 0; ini + N <= x.length; ini += N) {
    let s = 0;
    for (let i = ini; i < ini + N; i++) s += x[i] * x[i];
    niveis.push(10 * Math.log10(s / N + 1e-12));
  }
  const ordenado = [...niveis].sort((a, b) => a - b);
  const alto = ordenado[Math.floor(ordenado.length * 0.9)] ?? -60;
  const fundo = ordenado[Math.floor(ordenado.length * 0.1)] ?? -90;
  const cantando = (q: number) => niveis[q] > alto - 20;
  const [sub, corpo, fala, ar, s] = energiaPorFaixa(x, taxa, [[20, 90], [200, 450], [1000, 4000], [8000, 14000], [6000, 10000]], cantando);
  const motivos: string[] = [];

  // Volume de trabalho: partes altas perto de -18 dB, onde o compressor age bem.
  const ganhoDb = Math.max(-12, Math.min(12, -18 - alto));
  if (Math.abs(ganhoDb) >= 2) motivos.push(`A gravação está ${ganhoDb > 0 ? 'baixa' : 'alta'}: ganho de ${ganhoDb > 0 ? '+' : ''}${ganhoDb.toFixed(0)} dB antes dos efeitos.`);

  const corte = sub > fala - 12 ? 120 : 90;
  if (corte > 90) motivos.push('Há ronco abaixo de 90 Hz (microfone, mesa, respiração): corte de graves mais alto.');

  const graveDb = corpo > fala + 12 ? -4 : corpo > fala + 8 ? -2 : 0;
  if (graveDb) motivos.push(`A voz tem muito corpo (200 a 450 Hz), o que abafa: ${graveDb} dB nessa faixa.`);

  const arDb = ar < fala - 30 ? 4 : ar < fala - 24 ? 2 : 0;
  if (arDb) motivos.push(`Falta brilho na gravação: +${arDb} dB de ar.`);

  const deEsser = s > fala - 4 ? 0.7 : s > fala - 8 ? 0.4 : 0;
  if (deEsser) motivos.push('Os "s" estão fortes: de-esser ligado.');

  const gate = alto - fundo < 35 ? Math.round(Math.min(-30, fundo + ganhoDb + 8)) : 0;
  if (gate) motivos.push('O fundo da gravação tem ruído: gate ligado para limpar entre as frases.');

  if (!motivos.length) motivos.push('A gravação está equilibrada; só o compressor foi ajustado ao volume dela.');
  return { ganhoDb, corte, graveDb, arDb, deEsser, limiar: -26, gate, motivos };
}
