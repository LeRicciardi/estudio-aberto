// Motor ao vivo: toca o projeto a partir de um ponto, e exporta a mix final.

import {
  LANES, STEPS, bufferDoTake, compassosDoArranjo, duracaoDaMusica, duracaoDoTrecho, padraoNoCompasso, semitonsDoGrau,
  type Padrao, type Project,
} from '../model/project.ts';
import { limitar } from './limiter.ts';
import { medirLufs } from './loudness.ts';
import { Mixer } from './mixer.ts';
import { tocarBaixo, tocarBaixoSample, tocarNota, tocarTambor } from './synths.ts';
import { RelogioDePassos, duracaoDoPasso, tempoDoPasso } from './tempo.ts';

type Buffers = Map<string, AudioBuffer>;

/** Frequência de um grau da escala: 808 na oitava 1, melodia na oitava 4. */
function hzDoGrau(p: Project, grau: number, oitava: 'baixo' | 'melodia'): number {
  const semitons = p.tom + semitonsDoGrau(grau, p.escala);
  // Tons altos descem uma oitava na melodia para não ficar estridente.
  const base = oitava === 'baixo' ? 32.703 : p.tom > 6 ? 130.81 : 261.63;
  return base * 2 ** (semitons / 12);
}

/**
 * Quanto acelerar um sample gravado na nota `notaDoSample` para soar em `hz`.
 * A oitava é escolhida para mexer o mínimo possível na velocidade do sample.
 */
function razaoDoSample(hz: number, notaDoSample: number): number {
  let razao = hz / (32.703 * 2 ** (notaDoSample / 12));
  while (razao > Math.SQRT2) razao /= 2;
  while (razao < Math.SQRT1_2) razao *= 2;
  return razao;
}

/** Toca tudo que um padrão tem em um passo: bateria, 808 e melodia. */
function tocarPasso(ctx: BaseAudioContext, mixer: Mixer, p: Project, buffers: Buffers, padrao: Padrao | undefined, passo: number, quando: number) {
  if (!padrao) return;
  const s = passo % STEPS;
  const dur = duracaoDoPasso(p.bpm);
  for (const { id } of LANES) {
    const v = padrao.bateria[id][s];
    if (!v) continue;
    // Rolo: o mesmo som repetido 2, 3 ou 4 vezes dentro de um único passo.
    const toques = v >= 2 && v <= 4 ? v : 1;
    const sample = buffers.get(p.samples[id]?.audioId ?? '');
    for (let k = 0; k < toques; k++) {
      const t = quando + (k * dur) / toques;
      const volume = v === 5 ? 0.35 : k ? 0.8 : 1;
      if (sample) tocarSample(ctx, mixer.barraBateria, sample, t, volume);
      else tocarTambor(ctx, mixer.barraBateria, p.kit, id, t, volume);
    }
  }
  const grau = padrao.baixo[s];
  if (grau >= 0) {
    let de: number | undefined;
    if (padrao.deslize[s]) {
      // Procura a nota anterior do 808, dando a volta no compasso.
      for (let k = 1; k < STEPS; k++) {
        const anterior = padrao.baixo[(s - k + STEPS) % STEPS];
        if (anterior >= 0) {
          de = hzDoGrau(p, anterior, 'baixo');
          break;
        }
      }
    }
    const sample = buffers.get(p.sample808?.audioId ?? '');
    if (sample && p.sample808) {
      const razao = (hz: number) => razaoDoSample(hz, p.sample808!.nota);
      tocarBaixoSample(ctx, mixer.barraBaixo, sample, razao(hzDoGrau(p, grau, 'baixo')), quando, de && razao(de));
    } else {
      tocarBaixo(ctx, mixer.barraBaixo, p.kit, hzDoGrau(p, grau, 'baixo'), quando, de);
    }
  }
  padrao.melodia.forEach((linha, g) => {
    if (linha[s]) tocarNota(ctx, mixer.barraMelodia, p.instrumento, hzDoGrau(p, g, 'melodia'), quando, dur);
  });
}

/** Toca um sample do usuário (um som gravado) no lugar do som sintetizado. */
function tocarSample(ctx: BaseAudioContext, destino: AudioNode, sample: AudioBuffer, t: number, volume: number) {
  const s = ctx.createBufferSource();
  s.buffer = sample;
  const g = ctx.createGain();
  g.gain.value = volume;
  s.connect(g).connect(destino);
  s.start(t);
}

/** Agenda o beat importado e os takes de voz para tocarem a partir de `desde`. */
function agendarAudios(ctx: BaseAudioContext, mixer: Mixer, p: Project, buffers: Buffers, t0: number, desde: number, partes: Partes = 'tudo') {
  const fontes: AudioBufferSourceNode[] = [];
  /** Toca a parte do áudio que cai entre `de` e `ate` (tempos da música). */
  const tocar = (buf: AudioBuffer | undefined, destino: AudioNode | undefined, inicio: number, de = -Infinity, ate = Infinity) => {
    if (!buf || !destino) return;
    const a = Math.max(inicio, de, desde);
    const b = Math.min(inicio + buf.duration, ate);
    if (b <= a) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const quando = t0 + a - desde;
    if (Number.isFinite(ate)) {
      // Trecho recortado: entra e sai em 8 ms, para o corte não estalar.
      const g = ctx.createGain();
      const rampa = Math.min(0.008, (b - a) / 2);
      g.gain.setValueAtTime(0, quando);
      g.gain.linearRampToValueAtTime(1, quando + rampa);
      g.gain.setValueAtTime(1, quando + (b - a) - rampa);
      g.gain.linearRampToValueAtTime(0, quando + (b - a));
      s.connect(g).connect(destino);
    } else {
      s.connect(destino);
    }
    s.start(quando, a - inicio, b - a);
    fontes.push(s);
  };
  if (partes !== 'voz' && p.beat.fonte === 'arquivo' && p.beat.audioId) tocar(buffers.get(p.beat.audioId), mixer.barraDoBeat, 0);
  if (partes === 'beat') return fontes;
  const trecho = duracaoDoTrecho(p);
  for (const take of p.takes) {
    const buf = bufferDoTake(take, buffers);
    const destino = mixer.entradaDoTake(take.id);
    if (!p.montagem.ligada || !take.naMontagem) {
      tocar(buf, destino, take.inicio);
      continue;
    }
    // Montagem: o take só toca nos trechos em que foi escolhido. Trechos
    // vizinhos do mesmo take viram um pedaço só, sem corte no meio.
    const { escolha } = p.montagem;
    for (let i = 0; i < escolha.length; i++) {
      if (escolha[i] !== take.id) continue;
      let j = i;
      while (escolha[j + 1] === take.id) j++;
      tocar(buf, destino, take.inicio, i * trecho, (j + 1) * trecho);
      i = j;
    }
  }
  return fontes;
}

/** O que entra na exportação: a música toda, só as vozes ou só o beat. */
export type Partes = 'tudo' | 'voz' | 'beat';

export class Engine {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  readonly mixer = new Mixer(this.ctx);
  readonly buffers: Buffers = new Map();
  tocando = false;
  /** Instante do relógio de áudio em que a reprodução começou. */
  t0 = 0;
  /** Ponto da música (s) de onde a reprodução começou. */
  desde = 0;

  private analisador = this.ctx.createAnalyser();
  private amostras = new Float32Array(2048);
  private fontes: AudioBufferSourceNode[] = [];
  private relogio: RelogioDePassos;
  private projeto: Project | undefined;
  /** Índice do padrão em repetição, ou undefined quando toca a música. */
  private padraoEmLoop: number | undefined;

  constructor() {
    this.analisador.fftSize = 2048;
    this.mixer.saida.connect(this.analisador);
    this.relogio = new RelogioDePassos(this.ctx, (passo, quando) => {
      const p = this.projeto;
      if (!p) return;
      const padrao = this.padraoEmLoop === undefined ? padraoNoCompasso(p, Math.floor(passo / STEPS)) : p.padroes[this.padraoEmLoop];
      tocarPasso(this.ctx, this.mixer, p, this.buffers, padrao, passo, quando);
    });
  }

  /**
   * Toca a música a partir de `desde`. Com `padraoEmLoop`, repete só aquele
   * padrão, sem vozes: é o modo de criação do beat.
   */
  async tocar(p: Project, desde: number, padraoEmLoop?: number, espera = 0) {
    this.parar();
    await this.ctx.resume();
    this.projeto = p;
    this.padraoEmLoop = padraoEmLoop;
    this.mixer.sincronizar(p);
    this.t0 = this.ctx.currentTime + 0.06 + espera;
    this.desde = desde;
    if (padraoEmLoop !== undefined) {
      this.relogio.iniciar(this.t0, desde, p.bpm, p.swing, Infinity);
    } else {
      this.fontes = agendarAudios(this.ctx, this.mixer, p, this.buffers, this.t0, desde);
      if (p.beat.fonte === 'padrao') this.relogio.iniciar(this.t0, desde, p.bpm, p.swing, compassosDoArranjo(p) * STEPS);
    }
    this.tocando = true;
  }

  /**
   * Contagem antes de gravar: quatro estalos no andamento da música. Devolve
   * quanto tempo esperar (um compasso) para passar a `tocar` como `espera`.
   */
  contar(bpm: number): number {
    const batida = 60 / bpm;
    for (let k = 0; k < 4; k++) {
      const t = this.ctx.currentTime + 0.06 + k * batida;
      const o = this.ctx.createOscillator();
      o.frequency.value = k === 0 ? 1600 : 1100;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.06);
    }
    return 4 * batida;
  }

  parar() {
    this.relogio.parar();
    for (const f of this.fontes) {
      try { f.stop(); } catch { /* já terminou */ }
      f.disconnect();
    }
    this.fontes = [];
    this.tocando = false;
  }

  posicao(): number {
    return this.tocando ? this.desde + Math.max(0, this.ctx.currentTime - this.t0) : this.desde;
  }

  /** Pico atual da saída em dBFS (0 = máximo antes de distorcer). */
  picoDb(): number {
    this.analisador.getFloatTimeDomainData(this.amostras);
    let pico = 0;
    for (const v of this.amostras) pico = Math.max(pico, Math.abs(v));
    return 20 * Math.log10(pico || 1e-6);
  }
}

export interface Exportacao {
  audio: AudioBuffer;
  picoDb: number;
  /** Volume percebido da música inteira, a medida usada pelas plataformas. */
  lufs: number;
}

/**
 * Renderiza a música inteira fora do tempo real, com a mesma mesa usada ao
 * vivo. No fim, um limitador de pico real garante que nada passe de -1 dBFS:
 * plataformas de streaming recomendam essa folga para a conversão de formato
 * não distorcer.
 */
export async function exportarMix(p: Project, buffers: Buffers, partes: Partes = 'tudo'): Promise<Exportacao> {
  const taxa = 44100;
  const duracao = duracaoDaMusica(p, buffers) + 2;
  const ctx = new OfflineAudioContext(2, Math.ceil(duracao * taxa), taxa);
  const mixer = new Mixer(ctx, true);
  mixer.sincronizar(p);
  agendarAudios(ctx, mixer, p, buffers, 0, 0, partes);
  if (partes !== 'voz' && p.beat.fonte === 'padrao') {
    for (let i = 0; i < compassosDoArranjo(p) * STEPS; i++) {
      tocarPasso(ctx, mixer, p, buffers, padraoNoCompasso(p, Math.floor(i / STEPS)), i, tempoDoPasso(i, p.bpm, p.swing));
    }
  }
  const audio = await ctx.startRendering();
  const canais = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  limitar(canais, taxa, -1);

  let pico = 0;
  for (const canal of canais) for (const v of canal) pico = Math.max(pico, Math.abs(v));
  return { audio, picoDb: 20 * Math.log10(pico || 1e-6), lufs: medirLufs(canais, taxa) };
}

/** Codifica um AudioBuffer como arquivo WAV PCM de 16 bits. */
export function paraWav(audio: AudioBuffer): Blob {
  const canais = audio.numberOfChannels;
  const n = audio.length;
  const bytes = n * canais * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const texto = (pos: number, s: string) => [...s].forEach((ch, i) => v.setUint8(pos + i, ch.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  texto(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canais, true);
  v.setUint32(24, audio.sampleRate, true);
  v.setUint32(28, audio.sampleRate * canais * 2, true);
  v.setUint16(32, canais * 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, bytes, true);
  const dados = Array.from({ length: canais }, (_, c) => audio.getChannelData(c));
  let pos = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < canais; c++) {
      const s = Math.max(-1, Math.min(1, dados[c][i]));
      v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([v], { type: 'audio/wav' });
}

/**
 * Codifica em MP3 (192 kbps), o formato prático para mandar no WhatsApp ou
 * ouvir no celular. Para distribuidoras, use sempre o WAV. O codificador
 * (LAME em WebAssembly) só é carregado quando esta função é chamada.
 */
export async function paraMp3(audio: AudioBuffer): Promise<Blob> {
  const { createMp3Encoder } = await import('wasm-media-encoders');
  const codificador = await createMp3Encoder();
  codificador.configure({ sampleRate: audio.sampleRate, channels: 2, bitrate: 192 });
  const esq = audio.getChannelData(0);
  const dir = audio.numberOfChannels > 1 ? audio.getChannelData(1) : esq;
  // O codificador reaproveita a memória de saída: cada pedaço precisa ser copiado.
  const partes = [codificador.encode([esq, dir]).slice(), codificador.finalize().slice()];
  return new Blob(partes, { type: 'audio/mpeg' });
}
