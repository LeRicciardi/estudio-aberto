// Sons do beat, todos sintetizados do zero com osciladores e ruído (sem
// samples): bateria por kit, 808 e instrumentos de melodia.

import type { InstrumentoId, KitId, LaneId } from '../model/project.ts';

// ---------- peças básicas ----------

const ruidos = new WeakMap<BaseAudioContext, AudioBuffer>();

function ruido(ctx: BaseAudioContext): AudioBuffer {
  let b = ruidos.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ruidos.set(ctx, b);
  }
  return b;
}

/** Envelope percussivo: começa no pico e cai exponencialmente. */
function envelope(ctx: BaseAudioContext, t: number, pico: number, queda: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(pico, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + queda);
  return g;
}

function fonteDeRuido(ctx: BaseAudioContext, t: number, dur: number): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = ruido(ctx);
  s.start(t, Math.random() * 0.5, dur);
  return s;
}

function filtro(ctx: BaseAudioContext, tipo: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function oscilador(ctx: BaseAudioContext, tipo: OscillatorType, hz: number, t: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = tipo;
  o.frequency.value = hz;
  o.start(t);
  o.stop(t + dur);
  return o;
}

const curvas = new Map<number, Float32Array>();

/**
 * Saturação: achata os picos da onda. Isso cria harmônicos, o que deixa o som
 * mais "cheio" e, em dose alta, distorcido. `forca` 1 quase não muda nada.
 */
export function saturador(ctx: BaseAudioContext, forca: number): WaveShaperNode {
  let curva = curvas.get(forca);
  if (!curva) {
    curva = new Float32Array(1024);
    for (let i = 0; i < curva.length; i++) curva[i] = Math.tanh(((i / (curva.length - 1)) * 2 - 1) * forca) / Math.tanh(forca);
    curvas.set(forca, curva);
  }
  const no = ctx.createWaveShaper();
  no.curve = curva;
  return no;
}

// ---------- kits de bateria ----------

interface Kit {
  nome: string;
  /** Bumbo: seno que cai de `de` até `para` Hz; `forca` é a distorção. */
  kick: { de: number; para: number; queda: number; forca: number };
  /** Caixa: corpo tonal em `tom` Hz + ruído acima de `corte` Hz. */
  snare: { tom: number; corte: number; queda: number };
  hat: { corte: number; queda: number };
  /** Percussão: dois osciladores (o segundo dá o timbre metálico). */
  perc: { hz: number; segundo: number; tipo: OscillatorType; queda: number };
  baixo: { queda: number; forca: number };
}

export const KITS: Record<KitId, Kit> = {
  trap: {
    nome: 'Trap (limpo e firme)',
    kick: { de: 150, para: 45, queda: 0.35, forca: 1.2 },
    snare: { tom: 200, corte: 1500, queda: 0.16 },
    hat: { corte: 9000, queda: 0.04 },
    perc: { hz: 800, segundo: 0, tipo: 'square', queda: 0.04 },
    baixo: { queda: 0.9, forca: 2.5 },
  },
  boombap: {
    nome: 'Boombap (seco e encorpado)',
    kick: { de: 110, para: 50, queda: 0.25, forca: 2.2 },
    snare: { tom: 170, corte: 900, queda: 0.22 },
    hat: { corte: 6000, queda: 0.06 },
    perc: { hz: 400, segundo: 0, tipo: 'triangle', queda: 0.08 },
    baixo: { queda: 0.35, forca: 1.3 },
  },
  drill: {
    nome: 'Drill (seco e escuro)',
    kick: { de: 140, para: 42, queda: 0.3, forca: 1.5 },
    snare: { tom: 230, corte: 1800, queda: 0.14 },
    hat: { corte: 10000, queda: 0.03 },
    perc: { hz: 1200, segundo: 0, tipo: 'square', queda: 0.03 },
    baixo: { queda: 0.8, forca: 3 },
  },
  plug: {
    nome: 'Plug (macio)',
    kick: { de: 130, para: 50, queda: 0.25, forca: 1 },
    snare: { tom: 260, corte: 2200, queda: 0.12 },
    hat: { corte: 9500, queda: 0.035 },
    perc: { hz: 1600, segundo: 2400, tipo: 'sine', queda: 0.1 },
    baixo: { queda: 1, forca: 1.5 },
  },
  hard: {
    nome: 'Hard (distorcido)',
    kick: { de: 170, para: 40, queda: 0.4, forca: 4 },
    snare: { tom: 210, corte: 1400, queda: 0.2 },
    hat: { corte: 8500, queda: 0.05 },
    perc: { hz: 600, segundo: 0, tipo: 'sawtooth', queda: 0.06 },
    baixo: { queda: 1, forca: 6 },
  },
  funk: {
    nome: 'Funk (estalado)',
    kick: { de: 120, para: 55, queda: 0.18, forca: 3 },
    snare: { tom: 320, corte: 2500, queda: 0.1 },
    hat: { corte: 7000, queda: 0.05 },
    perc: { hz: 540, segundo: 800, tipo: 'square', queda: 0.12 },
    baixo: { queda: 0.4, forca: 2 },
  },
  mandelao: {
    nome: 'Mandelão (grave estourado)',
    kick: { de: 100, para: 38, queda: 0.5, forca: 8 },
    snare: { tom: 240, corte: 2000, queda: 0.14 },
    hat: { corte: 8000, queda: 0.05 },
    perc: { hz: 2200, segundo: 3300, tipo: 'sawtooth', queda: 0.15 },
    baixo: { queda: 0.6, forca: 8 },
  },
};

export function tocarTambor(ctx: BaseAudioContext, destino: AudioNode, kitId: KitId, som: LaneId, t: number, volume: number) {
  const kit = KITS[kitId];
  const saida = ctx.createGain();
  saida.gain.value = volume;
  saida.connect(destino);
  switch (som) {
    case 'kick': {
      // Seno que despenca de frequência: o "tum" com ataque estalado.
      const o = oscilador(ctx, 'sine', kit.kick.de, t, kit.kick.queda + 0.05);
      o.frequency.setValueAtTime(kit.kick.de, t);
      o.frequency.exponentialRampToValueAtTime(kit.kick.para, t + 0.12);
      o.connect(envelope(ctx, t, 1, kit.kick.queda)).connect(saturador(ctx, kit.kick.forca)).connect(saida);
      break;
    }
    case 'snare': {
      // Ruído filtrado (a esteira) + um corpo tonal curto (a pele).
      const { tom, corte, queda } = kit.snare;
      fonteDeRuido(ctx, t, queda + 0.05).connect(filtro(ctx, 'highpass', corte)).connect(envelope(ctx, t, 0.7, queda)).connect(saida);
      oscilador(ctx, 'triangle', tom, t, 0.15).connect(envelope(ctx, t, 0.5, 0.1)).connect(saida);
      break;
    }
    case 'clap': {
      // Três estalos de ruído bem próximos imitam várias mãos batendo.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        g.gain.setValueAtTime(0.8, t + i * 0.012);
        g.gain.exponentialRampToValueAtTime(0.1, t + i * 0.012 + 0.01);
      }
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      fonteDeRuido(ctx, t, 0.3).connect(filtro(ctx, 'bandpass', 1500, 1)).connect(g).connect(saida);
      break;
    }
    case 'hat':
    case 'openhat': {
      // Só os agudos do ruído; fechado é curto, aberto deixa soar.
      const queda = som === 'hat' ? kit.hat.queda : 0.3;
      fonteDeRuido(ctx, t, queda + 0.05).connect(filtro(ctx, 'highpass', kit.hat.corte)).connect(envelope(ctx, t, 0.35, queda)).connect(saida);
      break;
    }
    case 'perc': {
      const { hz, segundo, tipo, queda } = kit.perc;
      const env = envelope(ctx, t, 0.3, queda);
      env.connect(saida);
      oscilador(ctx, tipo, hz, t, queda + 0.02).connect(env);
      if (segundo) oscilador(ctx, tipo, segundo, t, queda + 0.02).connect(env);
      break;
    }
  }
}

// ---------- 808 ----------

const ultimoBaixo = new WeakMap<AudioNode, GainNode>();

/**
 * O 808 é um seno grave e longo, saturado para ganhar harmônicos (assim o
 * grave aparece também em caixas pequenas e celular). Só soa uma nota por
 * vez: a nova corta a anterior. Com `deHz`, a nota começa na altura anterior
 * e desliza até a nova, o efeito característico de trap e drill.
 */
export function tocarBaixo(ctx: BaseAudioContext, destino: AudioNode, kitId: KitId, hz: number, t: number, deHz?: number) {
  const { queda, forca } = KITS[kitId].baixo;
  const anterior = ultimoBaixo.get(destino);
  if (anterior) {
    const g = anterior.gain;
    if ('cancelAndHoldAtTime' in g) g.cancelAndHoldAtTime(t);
    else (g as AudioParam).cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.006);
  }
  const dur = queda * 2.5 + 0.1;
  const o = oscilador(ctx, 'sine', hz, t, dur);
  if (deHz) {
    o.frequency.setValueAtTime(deHz, t);
    o.frequency.exponentialRampToValueAtTime(hz, t + 0.09);
  } else {
    o.frequency.setValueAtTime(hz * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(hz, t + 0.04);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.7, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.03, queda / 3);
  o.connect(saturador(ctx, forca)).connect(g).connect(destino);
  ultimoBaixo.set(destino, g);
}

/**
 * 808 a partir de um sample do usuário. Tocar o sample mais rápido deixa a
 * nota mais aguda, e mais devagar, mais grave: `razao` é quanto acelerar para
 * chegar na nota pedida. Com `deRazao`, a nota desliza a partir da anterior.
 */
export function tocarBaixoSample(ctx: BaseAudioContext, destino: AudioNode, sample: AudioBuffer, razao: number, t: number, deRazao?: number) {
  const anterior = ultimoBaixo.get(destino);
  if (anterior) {
    const g = anterior.gain;
    if ('cancelAndHoldAtTime' in g) g.cancelAndHoldAtTime(t);
    else (g as AudioParam).cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 0.006);
  }
  const s = ctx.createBufferSource();
  s.buffer = sample;
  if (deRazao) {
    s.playbackRate.setValueAtTime(deRazao, t);
    s.playbackRate.exponentialRampToValueAtTime(razao, t + 0.09);
  } else {
    s.playbackRate.setValueAtTime(razao, t);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  s.connect(g).connect(destino);
  s.start(t);
  ultimoBaixo.set(destino, g);
}

// ---------- instrumentos de melodia ----------

export const INSTRUMENTOS: Record<InstrumentoId, string> = {
  sino: 'Sino',
  piano: 'Piano elétrico',
  pluck: 'Pluck (corda curta)',
  pad: 'Pad (cama de fundo)',
  lead: 'Sintetizador sujo',
};

/** `passo` é a duração de um passo em segundos; notas longas usam isso. */
export function tocarNota(ctx: BaseAudioContext, destino: AudioNode, inst: InstrumentoId, hz: number, t: number, passo: number) {
  switch (inst) {
    case 'sino': {
      // FM: um oscilador rápido treme a frequência de outro. Com a proporção
      // "quebrada" (3,5x) o resultado soa metálico, como um sino.
      const portadora = oscilador(ctx, 'sine', hz, t, 1.6);
      const moduladora = oscilador(ctx, 'sine', hz * 3.5, t, 1.6);
      moduladora.connect(envelope(ctx, t, hz * 2, 0.5)).connect(portadora.frequency);
      portadora.connect(envelope(ctx, t, 0.3, 1.5)).connect(destino);
      break;
    }
    case 'piano': {
      // FM suave com proporção inteira: timbre redondo de piano elétrico.
      const portadora = oscilador(ctx, 'sine', hz, t, 1.3);
      const moduladora = oscilador(ctx, 'sine', hz, t, 1.3);
      moduladora.connect(envelope(ctx, t, hz * 1.2, 0.25)).connect(portadora.frequency);
      portadora.connect(envelope(ctx, t, 0.3, 1.2)).connect(destino);
      break;
    }
    case 'pluck': {
      // Onda rica em harmônicos com um filtro que fecha rápido: som de corda pinçada.
      const f = filtro(ctx, 'lowpass', 4000, 2);
      f.frequency.setValueAtTime(4000, t);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
      oscilador(ctx, 'sawtooth', hz, t, 0.4).connect(f).connect(envelope(ctx, t, 0.3, 0.35)).connect(destino);
      break;
    }
    case 'pad': {
      // Duas ondas levemente desafinadas entre si engordam o som; entra e sai devagar.
      const dur = passo * 8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.08);
      g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.15);
      const f = filtro(ctx, 'lowpass', 1400);
      f.connect(g).connect(destino);
      oscilador(ctx, 'sawtooth', hz * 0.996, t, dur + 0.5).connect(f);
      oscilador(ctx, 'sawtooth', hz * 1.004, t, dur + 0.5).connect(f);
      break;
    }
    case 'lead': {
      // Quadrada + serra passando por distorção forte: áspero e agressivo.
      const env = envelope(ctx, t, 0.5, 0.28);
      const vol = ctx.createGain();
      vol.gain.value = 0.25;
      env.connect(saturador(ctx, 5)).connect(filtro(ctx, 'lowpass', 6000)).connect(vol).connect(destino);
      oscilador(ctx, 'square', hz, t, 0.3).connect(env);
      oscilador(ctx, 'sawtooth', hz * 1.01, t, 0.3).connect(env);
      break;
    }
  }
}
