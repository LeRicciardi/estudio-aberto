// Cadeia de voz: o caminho que a voz gravada percorre até soar "de estúdio".
// Cada preset é uma receita de timbre (filtros + compressor). Reverb e delay
// são mandadas ajustáveis por take.

import type { PresetVoz, Take, TamanhoReverb } from '../model/project.ts';
import { saturador } from './synths.ts';

interface Receita {
  nome: string;
  /** Corta graves abaixo dessa frequência (Hz). */
  corteGrave: number;
  /** Realce de presença: [frequência, ganho em dB]. */
  presenca: [number, number];
  /** Brilho ("ar") acima de 9 kHz, em dB. */
  ar: number;
  /** Compressor: limiar (dB) e razão. */
  comp: [number, number];
  /** Saturação depois do compressor; 0 = nenhuma. */
  forca: number;
  reverb: number;
  delay: number;
  explicacao: string[];
}

export const PRESETS_VOZ: Record<PresetVoz, Receita> = {
  cru: {
    nome: 'Cru (sem tratamento)',
    corteGrave: 0, presenca: [3000, 0], ar: 0, comp: [0, 1], forca: 0, reverb: 0, delay: 0,
    explicacao: ['A voz passa como foi gravada. Bom para comparar o antes e depois.'],
  },
  rap: {
    nome: 'Rap (seco e na frente)',
    corteGrave: 90, presenca: [4000, 3], ar: 2, comp: [-22, 4], forca: 0, reverb: 0.08, delay: 0,
    explicacao: [
      'Corte de graves em 90 Hz: tira ronco e batida de microfone, que brigam com o 808.',
      'Presença +3 dB em 4 kHz: é a região que deixa a letra inteligível.',
      'Compressor 4:1: aproxima as partes fracas das fortes, a voz não some no beat.',
      'Pouco reverb: voz seca soa próxima e direta.',
    ],
  },
  boombap: {
    nome: 'Boombap (quente, de fita)',
    corteGrave: 80, presenca: [2500, 2], ar: 0, comp: [-20, 3], forca: 1.5, reverb: 0.06, delay: 0,
    explicacao: [
      'Sem brilho extra: o timbre fica médio e encorpado, como nos discos dos anos 90.',
      'Saturação leve: imita o calor de fita e de mesa analógica.',
      'Compressor 3:1 e quase nenhum reverb: voz firme e seca.',
    ],
  },
  trap: {
    nome: 'Trap (brilhante, com eco)',
    corteGrave: 110, presenca: [3500, 2], ar: 5, comp: [-26, 6], forca: 0, reverb: 0.15, delay: 0.18,
    explicacao: [
      'Corte de graves em 110 Hz: abre espaço para o 808.',
      'Brilho +5 dB nos agudos: o timbre "caro" e arejado do trap.',
      'Compressor forte 6:1: voz bem nivelada, parada no lugar.',
      'Delay no tempo do beat: os ecos preenchem os espaços entre as frases.',
    ],
  },
  plug: {
    nome: 'Plug (leve e etéreo)',
    corteGrave: 130, presenca: [3000, 1], ar: 6, comp: [-28, 6], forca: 0, reverb: 0.22, delay: 0.15,
    explicacao: [
      'Corte de graves alto (130 Hz): a voz fica fina e flutua sobre o beat.',
      'Muito brilho (+6 dB) e reverb: o clima sonhador do estilo.',
      'Funciona melhor com o tune ligado e rápido.',
    ],
  },
  rnb: {
    nome: 'Love song / R&B (suave e espaçoso)',
    corteGrave: 80, presenca: [2500, 1.5], ar: 3, comp: [-20, 2.5], forca: 0, reverb: 0.28, delay: 0.08,
    explicacao: [
      'Corte de graves em 80 Hz: mantém o corpo da voz.',
      'Compressor leve 2,5:1: preserva a dinâmica do canto.',
      'Brilho +3 dB: o "ar" da voz soul.',
      'Reverb generoso: dá profundidade e cola as notas longas.',
    ],
  },
  drill: {
    nome: 'Drill (seco e escuro)',
    corteGrave: 100, presenca: [3000, 2], ar: 1, comp: [-24, 5], forca: 0, reverb: 0.1, delay: 0.1,
    explicacao: [
      'Pouco brilho: o timbre fica escuro, combinando com o clima do beat.',
      'Compressor 5:1: mantém a voz estável no flow rápido.',
      'Reverb e delay discretos, só para a voz não ficar colada demais.',
    ],
  },
  hard: {
    nome: 'Hard / Trash (distorcido)',
    corteGrave: 120, presenca: [3500, 3], ar: 4, comp: [-30, 8], forca: 6, reverb: 0.05, delay: 0,
    explicacao: [
      'Compressor muito forte 8:1: a voz vira um bloco, sempre no talo.',
      'Saturação pesada: a distorção faz parte do timbre do estilo.',
      'Quase sem reverb, para a distorção não embolar.',
    ],
  },
  funk: {
    nome: 'Funk / MC (alto e na cara)',
    corteGrave: 120, presenca: [3500, 4], ar: 2, comp: [-28, 8], forca: 2, reverb: 0.04, delay: 0.12,
    explicacao: [
      'Presença +4 dB: a voz corta o grave pesado do beat, mesmo em caixa de som de rua.',
      'Compressor 8:1 e saturação: voz alta e constante do começo ao fim.',
      'Delay curto no tempo: o eco clássico de MC no fim das frases.',
    ],
  },
};

export const TAMANHOS_DE_REVERB: Record<TamanhoReverb, { nome: string; segundos: number }> = {
  quarto: { nome: 'Quarto (curto)', segundos: 0.6 },
  sala: { nome: 'Sala (médio)', segundos: 1.8 },
  salao: { nome: 'Salão (longo)', segundos: 3.5 },
};

const impulsos = new WeakMap<BaseAudioContext, Map<TamanhoReverb, AudioBuffer>>();

/**
 * Resposta ao impulso sintética: ruído que decai, como o eco difuso de uma
 * sala. Quanto mais longo o decaimento, maior o espaço parece.
 */
function impulsoDeSala(ctx: BaseAudioContext, tamanho: TamanhoReverb): AudioBuffer {
  let porTamanho = impulsos.get(ctx);
  if (!porTamanho) impulsos.set(ctx, (porTamanho = new Map()));
  let b = porTamanho.get(tamanho);
  if (!b) {
    const n = Math.floor(ctx.sampleRate * TAMANHOS_DE_REVERB[tamanho].segundos);
    b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
    }
    porTamanho.set(tamanho, b);
  }
  return b;
}

export interface CadeiaDeVoz {
  entrada: AudioNode;
  saida: AudioNode;
  mandadaReverb: GainNode;
  mandadaDelay: GainNode;
  realimentacao: GainNode;
  desligar(): void;
}

/** Tudo que, ao mudar, obriga a remontar a cadeia (o resto é ajustado ao vivo). */
export const chaveDaCadeia = (take: Take, bpm: number) =>
  [take.preset, take.divisaoDelay, bpm, take.tamanhoReverb, take.telefone, Math.round(take.distorcao * 20)].join('|');

export function criarCadeiaDeVoz(ctx: BaseAudioContext, take: Take, bpm: number): CadeiaDeVoz {
  const { preset, divisaoDelay: divisao } = take;
  const r = PRESETS_VOZ[preset];
  const entrada = ctx.createGain();
  const saida = ctx.createGain();
  const nos: AudioNode[] = [entrada];
  let fim: AudioNode = entrada;
  const ligar = <T extends AudioNode>(no: T): T => {
    fim.connect(no);
    nos.push(no);
    fim = no;
    return no;
  };

  // Saturar aumenta muito o volume; o ganho depois devolve ao nível de antes,
  // para a distorção mudar o timbre e não a altura do som.
  const saturar = (forca: number) => {
    ligar(saturador(ctx, forca));
    ligar(ctx.createGain()).gain.value = 1 / Math.sqrt(forca);
  };

  if (take.telefone) {
    // Telefone antigo só transmitia os médios: sem grave e sem agudo.
    const semGrave = ligar(ctx.createBiquadFilter());
    semGrave.type = 'highpass';
    semGrave.frequency.value = 450;
    const semAgudo = ligar(ctx.createBiquadFilter());
    semAgudo.type = 'lowpass';
    semAgudo.frequency.value = 2800;
  }

  if (preset !== 'cru') {
    const hp = ligar(ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = r.corteGrave;

    const pres = ligar(ctx.createBiquadFilter());
    pres.type = 'peaking';
    pres.frequency.value = r.presenca[0];
    pres.gain.value = r.presenca[1];

    const ar = ligar(ctx.createBiquadFilter());
    ar.type = 'highshelf';
    ar.frequency.value = 9000;
    ar.gain.value = r.ar;

    const comp = ligar(ctx.createDynamicsCompressor());
    comp.threshold.value = r.comp[0];
    comp.ratio.value = r.comp[1];
    comp.attack.value = 0.005;
    comp.release.value = 0.12;

    if (r.forca > 0) saturar(r.forca);
  }
  if (take.distorcao > 0) saturar(1 + take.distorcao * 11);

  // Sinal direto.
  fim.connect(saida);

  // Reverb: uma cópia da voz passa pela "sala" e volta somada.
  const mandadaReverb = ctx.createGain();
  const sala = ctx.createConvolver();
  sala.buffer = impulsoDeSala(ctx, take.tamanhoReverb);
  fim.connect(mandadaReverb).connect(sala).connect(saida);

  // Delay: uma cópia atrasada, realimentada para repetir e ir sumindo.
  const mandadaDelay = ctx.createGain();
  const atraso = ctx.createDelay(2);
  atraso.delayTime.value = Math.min(2, (60 / bpm) * (4 / divisao));
  const realimentacao = ctx.createGain();
  realimentacao.gain.value = 0.35;
  const abafar = ctx.createBiquadFilter();
  abafar.type = 'lowpass';
  abafar.frequency.value = 3500;
  fim.connect(mandadaDelay).connect(atraso).connect(abafar).connect(saida);
  abafar.connect(realimentacao).connect(atraso);

  nos.push(saida, mandadaReverb, sala, mandadaDelay, atraso, realimentacao, abafar);
  return { entrada, saida, mandadaReverb, mandadaDelay, realimentacao, desligar: () => nos.forEach((n) => n.disconnect()) };
}
