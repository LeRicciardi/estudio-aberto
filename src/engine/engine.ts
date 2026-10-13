// Motor ao vivo: toca o projeto a partir de um ponto, e exporta a mix final.

import {
  LANES, STEPS, bufferDoBeat, bufferDoTake, compassosDoArranjo, duracaoDaMusica, duracaoDoTrecho, localizarPasso, passosDoPadrao, semitonsDoGrau,
  type Padrao, type PassoLocalizado, type Project, type Take,
} from '../model/project.ts';
import { TAXA_DA_CURVA, presencaDaVoz, type TrechoDeVoz } from './espaco.ts';
import { fimDasFrases } from './limpeza.ts';
import { limitar } from './limiter.ts';
import { medirLufs } from './loudness.ts';
import { Mixer } from './mixer.ts';
import { tocarBaixo, tocarBaixoSample, tocarNota, tocarTambor, tocarVirada } from './synths.ts';
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

/**
 * Toca tudo que um padrão tem em um passo: bateria, 808 e melodia.
 * `s` é o passo dentro do padrão; `trecho` traz os mudos e a virada do
 * trecho do arranjo (ausente quando o padrão toca sozinho, em repetição).
 */
function tocarPasso(ctx: BaseAudioContext, mixer: Mixer, p: Project, buffers: Buffers, padrao: Padrao, s: number, quando: number, trecho?: PassoLocalizado) {
  const dur = duracaoDoPasso(p.bpm);
  const total = passosDoPadrao(padrao);
  const mudos = trecho?.bloco.mudos ?? {};
  const virada = trecho?.bloco.virada;
  // Virada: um compasso antes do fim do trecho entra o efeito; no "silêncio",
  // bateria e 808 param nas duas últimas batidas, e o trecho seguinte entra com impacto.
  if (trecho && trecho.restam === STEPS && (virada === 'subida' || virada === 'crash')) tocarVirada(ctx, mixer.barraBateria, virada, quando, dur * STEPS);
  const calado = !!trecho && virada === 'silencio' && trecho.restam <= STEPS / 2;

  if (!mudos.bateria && !calado) {
    for (const { id } of LANES) {
      const v = padrao.bateria[id][s];
      if (!v) continue;
      // Rolo: o mesmo som repetido 2, 3 ou 4 vezes dentro de um único passo,
      // cada toque um pouco mais forte que o anterior.
      const toques = v >= 2 && v <= 4 ? v : 1;
      const sample = buffers.get(p.samples[id]?.audioId ?? '');
      const som = p.sons?.[id];
      const destino = saidaDoSom(ctx, mixer, som?.pan ?? 0);
      // Balanço próprio do som: atrasa os passos pares além do balanço geral.
      const inicio = quando + (s % 2 === 1 ? (som?.swing ?? 0) * dur : 0);
      for (let k = 0; k < toques; k++) {
        const t = inicio + (k * dur) / toques;
        const forca = v === 5 ? 0.35 : v === 6 ? 1.3 : toques > 1 ? 0.55 + (0.45 * k) / (toques - 1) : 1;
        const volume = forca * (som?.volume ?? 1);
        if (sample) tocarSample(ctx, destino, sample, t, volume, som?.altura ?? 0);
        else tocarTambor(ctx, destino, p.kit, id, t, volume);
      }
      if (id === 'kick' && p.beat.sidechain) mixer.abaixarBaixo(inicio);
    }
  }
  const grau = padrao.baixo[s];
  if (grau >= 0 && !mudos.baixo && !calado) {
    let de: number | undefined;
    if (padrao.deslize[s]) {
      // Procura a nota anterior do 808, dando a volta no padrão.
      for (let k = 1; k < total; k++) {
        const anterior = padrao.baixo[(s - k + total) % total];
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
  // Sampler: a fatia do loop marcada neste passo, do corte dela até o próximo.
  const fatia = padrao.fatias?.[s] ?? -1;
  const loop = p.sampler && buffers.get(p.sampler.audioId + (p.sampler.invertido ? ':inv' : ''));
  if (fatia >= 0 && loop && p.sampler && !mudos.melodia) {
    const cortes = p.sampler.cortes;
    const de = cortes[fatia];
    const ate = cortes[fatia + 1] ?? loop.duration;
    if (de !== undefined && ate > de) tocarSample(ctx, mixer.barraMelodia, loop, quando, p.sampler.volume, p.sampler.altura, de, ate - de);
  }
  if (!mudos.melodia) {
    padrao.melodia.forEach((linha, g) => {
      if (linha[s]) tocarNota(ctx, mixer.barraMelodia, p.instrumento, hzDoGrau(p, g, 'melodia'), quando, dur);
    });
  }
}

/** Toca o passo `passo` da música (contado desde o início), conforme o arranjo. */
function tocarPassoDaMusica(ctx: BaseAudioContext, mixer: Mixer, p: Project, buffers: Buffers, passo: number, quando: number) {
  const local = localizarPasso(p, passo);
  if (local) tocarPasso(ctx, mixer, p, buffers, local.padrao, local.s, quando, local);
}

/** Toca um sample do usuário (um som gravado) no lugar do som sintetizado. */
function tocarSample(ctx: BaseAudioContext, destino: AudioNode, sample: AudioBuffer, t: number, volume: number, semitons = 0, de = 0, duracao?: number) {
  const s = ctx.createBufferSource();
  s.buffer = sample;
  // Tocar mais rápido deixa mais agudo: 12 semitons acima é o dobro da velocidade.
  s.playbackRate.value = 2 ** (semitons / 12);
  const g = ctx.createGain();
  g.gain.value = volume;
  s.connect(g).connect(destino);
  if (duracao === undefined) {
    s.start(t);
  } else {
    // Fatia de um loop: sai em 5 ms no fim, para o corte não estalar.
    const real = duracao / s.playbackRate.value;
    g.gain.setValueAtTime(volume, t + Math.max(0, real - 0.005));
    g.gain.linearRampToValueAtTime(0, t + real);
    s.start(t, de, duracao);
  }
}

/** Saída para um som da bateria: direto na barra, ou passando por um controle de lado. */
function saidaDoSom(ctx: BaseAudioContext, mixer: Mixer, pan: number): AudioNode {
  if (!pan) return mixer.barraBateria;
  const lado = ctx.createStereoPanner();
  lado.pan.value = pan;
  lado.connect(mixer.barraBateria);
  return lado;
}

/** Agenda o beat importado e os takes de voz para tocarem a partir de `desde`. */
function agendarAudios(ctx: BaseAudioContext, mixer: Mixer, p: Project, buffers: Buffers, t0: number, desde: number, partes: Partes = 'tudo') {
  const fontes: AudioBufferSourceNode[] = [];
  const tocar = (buf: AudioBuffer | undefined, destino: AudioNode | undefined, inicio: number) => {
    if (!buf || !destino || inicio + buf.duration / (p.beat.velocidade ?? 1) <= desde) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(destino);
    // Velocidade do beat importado: tocar mais rápido encurta e deixa mais agudo, como num toca-discos.
    const v = p.beat.velocidade ?? 1;
    s.playbackRate.value = v;
    s.start(t0 + Math.max(0, inicio - desde), Math.max(0, desde - inicio) * v);
    fontes.push(s);
  };
  /** Agenda uma curva de volume feita de retas: `pontos` são [tempo da música, volume]. */
  const curva = (pontos: [number, number][], a: number, b: number): GainNode => {
    const g = ctx.createGain();
    const valorEm = (t: number) => {
      for (let k = 1; k < pontos.length; k++) {
        const [t1, v1] = pontos[k - 1];
        const [t2, v2] = pontos[k];
        if (t <= t2) return t2 > t1 ? v1 + ((v2 - v1) * Math.max(0, t - t1)) / (t2 - t1) : v2;
      }
      return pontos[pontos.length - 1][1];
    };
    g.gain.setValueAtTime(valorEm(a), t0 + a - desde);
    for (const [t, v] of pontos) if (t > a && t < b) g.gain.linearRampToValueAtTime(v, t0 + t - desde);
    g.gain.linearRampToValueAtTime(valorEm(b), t0 + b - desde);
    return g;
  };
  /**
   * Toca um take entre `de` e `ate` (tempos da música), respeitando a edição
   * dele: pedaços aparados, fades de entrada e saída e ganho.
   */
  const tocarTake = (take: Take, de = -Infinity, ate = Infinity) => {
    tocarVoz(take, bufferDoTake(take, buffers), 1, de, ate);
    // Harmonia: a segunda voz, gerada a partir do mesmo take, passa pelos mesmos efeitos.
    const quanto = take.harmonia?.quanto ?? 0;
    if (quanto > 0) tocarVoz(take, buffers.get(take.audioId + ':harm'), quanto, de, ate);
  };
  const tocarVoz = (take: Take, buf: AudioBuffer | undefined, nivel: number, de: number, ate: number) => {
    const destino = mixer.entradaDoTake(take.id);
    if (!buf || !destino) return;
    const ed = take.edicao;
    const comeco = take.inicio + ed.ini;
    const fim = take.inicio + buf.duration - ed.fim;
    const a = Math.max(comeco, de, desde);
    const b = Math.min(fim, ate);
    if (b - a < 0.005) return;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    // Entra e sai em pelo menos 8 ms, para nenhum corte estalar.
    const entra = Math.min(Math.max(ed.fadeIn, 0.008), (fim - comeco) / 2);
    const sai = Math.min(Math.max(ed.fadeOut, 0.008), (fim - comeco) / 2);
    const ganho = 10 ** (ed.ganhoDb / 20) * nivel;
    const doTake = curva([[comeco, 0], [comeco + entra, ganho], [fim - sai, ganho], [fim, 0]], a, b);
    // Cortes da montagem: mais uma rampa curta em cada ponta do trecho.
    const rampa = Math.min(0.008, (b - a) / 2);
    const doTrecho = curva([[a, Number.isFinite(de) ? 0 : 1], [a + rampa, 1], [b - rampa, 1], [b, Number.isFinite(ate) ? 0 : 1]], a, b);
    s.connect(doTake).connect(doTrecho).connect(destino);
    s.start(t0 + a - desde, a - take.inicio, b - a);
    fontes.push(s);
  };

  if (partes !== 'voz' && p.beat.fonte === 'arquivo') tocar(bufferDoBeat(p, buffers), mixer.barraDoBeat, 0);
  if (partes === 'beat') return fontes;
  const trecho = duracaoDoTrecho(p);
  for (const take of p.takes) {
    if (!p.montagem.ligada || !take.naMontagem) {
      tocarTake(take);
      continue;
    }
    // Montagem: o take só toca nos trechos em que foi escolhido. Trechos
    // vizinhos do mesmo take viram um pedaço só, sem corte no meio.
    const { escolha } = p.montagem;
    for (let i = 0; i < escolha.length; i++) {
      if (escolha[i] !== take.id) continue;
      let j = i;
      while (escolha[j + 1] === take.id) j++;
      tocarTake(take, i * trecho, (j + 1) * trecho);
      i = j;
    }
  }
  agendarEcos(mixer, p, buffers, t0, desde);
  return fontes;
}

/**
 * "Eco só no fim da frase": a mandada de delay fica fechada e abre apenas no
 * último pedaço de cada frase, para a palavra final ecoar no espaço seguinte.
 */
function agendarEcos(mixer: Mixer, p: Project, buffers: Buffers, t0: number, desde: number) {
  const pontos = Math.ceil((duracaoDaMusica(p, buffers) + 2) * TAXA_DA_CURVA);
  for (const take of p.takes) {
    const buf = bufferDoTake(take, buffers);
    if (!take.ecoNoFim || !buf) continue;
    const curva = new Float32Array(pontos);
    const forca = Math.max(take.delay, 0.45);
    for (const fim of fimDasFrases(buf.getChannelData(0), buf.sampleRate)) {
      const ate = Math.round((take.inicio + fim) * TAXA_DA_CURVA);
      // Abre nos últimos 0,45 s da frase, com rampa de 0,1 s para não estalar.
      for (let i = Math.max(0, ate - 45); i <= ate && i < pontos; i++) curva[i] = forca * Math.min(1, (i - (ate - 45)) / 10);
      for (let i = ate + 1; i < ate + 8 && i < pontos; i++) curva[i] = forca * (1 - (i - ate) / 8);
    }
    mixer.agendarEco(take.id, curva, t0, desde);
  }
}

/**
 * Onde e com que volume cada voz soa na música, já considerando o que foi
 * aparado e os trechos escolhidos na montagem. Serve para o beat ceder espaço.
 */
function trechosDeVoz(p: Project, buffers: Buffers): TrechoDeVoz[] {
  const trechos: TrechoDeVoz[] = [];
  const dur = duracaoDoTrecho(p);
  for (const take of p.takes) {
    const buf = bufferDoTake(take, buffers);
    if (!buf || take.mudo) continue;
    const dados = buf.getChannelData(0);
    const taxa = buf.sampleRate;
    const volume = take.volume * 10 ** (take.edicao.ganhoDb / 20);
    const comeco = take.inicio + take.edicao.ini;
    const fim = take.inicio + buf.duration - take.edicao.fim;
    const juntar = (de: number, ate: number) => {
      const a = Math.max(comeco, de);
      const b = Math.min(fim, ate);
      if (b <= a) return;
      trechos.push({ amostras: dados.subarray(Math.floor((a - take.inicio) * taxa), Math.floor((b - take.inicio) * taxa)), taxa, inicio: a, volume });
    };
    if (!p.montagem.ligada || !take.naMontagem) juntar(-Infinity, Infinity);
    else p.montagem.escolha.forEach((escolhido, i) => escolhido === take.id && juntar(i * dur, (i + 1) * dur));
  }
  return trechos;
}

/** Presença da voz ao longo da música, ou null quando não há voz ou o espaço está desligado. */
function presenca(p: Project, buffers: Buffers, partes: Partes = 'tudo'): Float32Array | null {
  if (!p.beat.espaco || partes !== 'tudo') return null;
  const trechos = trechosDeVoz(p, buffers);
  return trechos.length ? presencaDaVoz(trechos, duracaoDaMusica(p, buffers) + 2) : null;
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

  private fontes: AudioBufferSourceNode[] = [];
  private relogio: RelogioDePassos;
  private projeto: Project | undefined;
  /** Índice do padrão em repetição, ou undefined quando toca a música. */
  private padraoEmLoop: number | undefined;

  constructor() {
    this.relogio = new RelogioDePassos(this.ctx, (passo, quando) => {
      const p = this.projeto;
      if (!p) return;
      const sozinho = this.padraoEmLoop === undefined ? undefined : p.padroes[this.padraoEmLoop];
      if (sozinho) tocarPasso(this.ctx, this.mixer, p, this.buffers, sozinho, passo % passosDoPadrao(sozinho), quando);
      else if (this.padraoEmLoop === undefined) tocarPassoDaMusica(this.ctx, this.mixer, p, this.buffers, passo, quando);
    });
  }

  /**
   * Toca a música a partir de `desde`. Com `padraoEmLoop`, repete só aquele
   * padrão, sem vozes: é o modo de criação do beat.
   */
  /**
   * `emenda`: usado na gravação em laço. Em vez de cortar o que está tocando,
   * deixa soar até o instante em que a nova volta começa, sem buraco entre elas.
   */
  async tocar(p: Project, desde: number, padraoEmLoop?: number, espera = 0, emenda = false) {
    if (emenda) {
      const virada = this.ctx.currentTime + 0.06 + espera;
      this.relogio.parar(virada);
      for (const f of this.fontes) {
        try { f.stop(virada); } catch { /* já terminou */ }
      }
      this.fontes = [];
    } else {
      this.parar();
    }
    await this.ctx.resume();
    this.projeto = p;
    this.padraoEmLoop = padraoEmLoop;
    this.mixer.sincronizar(p);
    this.t0 = this.ctx.currentTime + 0.06 + espera;
    this.desde = desde;
    if (padraoEmLoop !== undefined) {
      this.mixer.agendarEspaco(null, p, this.t0, 0);
      this.relogio.iniciar(this.t0, desde, p.bpm, p.swing, Infinity);
    } else {
      this.mixer.agendarEspaco(presenca(p, this.buffers), p, this.t0, desde);
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
    return this.mixer.picoDb('master');
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
  mixer.agendarEspaco(presenca(p, buffers, partes), p, 0, 0);
  if (partes !== 'voz' && p.beat.fonte === 'padrao') {
    for (let i = 0; i < compassosDoArranjo(p) * STEPS; i++) {
      tocarPassoDaMusica(ctx, mixer, p, buffers, i, tempoDoPasso(i, p.bpm, p.swing));
    }
  }
  const audio = await ctx.startRendering();
  const canais = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  // Volume-alvo: mede o volume percebido da música inteira e sobe ou desce
  // tudo para chegar ao alvo (o Spotify, por exemplo, trabalha em -14 LUFS).
  // O limitador vem depois e segura os picos que esse ganho criar.
  const alvo = p.ajusteDoMaster.alvoLufs;
  if (alvo !== null && partes === 'tudo') {
    const atual = medirLufs(canais, taxa);
    if (Number.isFinite(atual)) {
      const ganho = 10 ** (Math.max(-12, Math.min(12, alvo - atual)) / 20);
      for (const canal of canais) for (let i = 0; i < canal.length; i++) canal[i] *= ganho;
    }
  }
  limitar(canais, taxa, -1);

  let pico = 0;
  for (const canal of canais) for (const v of canal) pico = Math.max(pico, Math.abs(v));
  return { audio, picoDb: 20 * Math.log10(pico || 1e-6), lufs: medirLufs(canais, taxa) };
}

/**
 * Codifica um AudioBuffer como arquivo WAV PCM. 16 bits é o padrão aceito
 * por todas as distribuidoras; 24 bits guarda mais detalhe nos trechos
 * baixos e é o que alguns engenheiros de masterização pedem.
 */
export function paraWav(audio: AudioBuffer, bits: 16 | 24 = 16): Blob {
  const canais = audio.numberOfChannels;
  const n = audio.length;
  const porAmostra = bits / 8;
  const bytes = n * canais * porAmostra;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const texto = (pos: number, s: string) => [...s].forEach((ch, i) => v.setUint8(pos + i, ch.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  texto(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canais, true);
  v.setUint32(24, audio.sampleRate, true);
  v.setUint32(28, audio.sampleRate * canais * porAmostra, true);
  v.setUint16(32, canais * porAmostra, true);
  v.setUint16(34, bits, true);
  texto(36, 'data');
  v.setUint32(40, bytes, true);
  const dados = Array.from({ length: canais }, (_, c) => audio.getChannelData(c));
  let pos = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < canais; c++) {
      const s = Math.max(-1, Math.min(1, dados[c][i]));
      if (bits === 16) {
        v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      } else {
        const inteiro = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(pos, inteiro & 0xff);
        v.setUint8(pos + 1, (inteiro >> 8) & 0xff);
        v.setUint8(pos + 2, (inteiro >> 16) & 0xff);
      }
      pos += porAmostra;
    }
  }
  return new Blob([v], { type: 'audio/wav' });
}

/**
 * Codifica em MP3 (192 kbps), o formato prático para mandar no WhatsApp ou
 * ouvir no celular. Para distribuidoras, use sempre o WAV. O codificador
 * (LAME em WebAssembly) só é carregado quando esta função é chamada.
 */
export async function paraMp3(audio: AudioBuffer, etiquetas?: Uint8Array): Promise<Blob> {
  const { createMp3Encoder } = await import('wasm-media-encoders');
  const codificador = await createMp3Encoder();
  codificador.configure({ sampleRate: audio.sampleRate, channels: 2, bitrate: 192 });
  const esq = audio.getChannelData(0);
  const dir = audio.numberOfChannels > 1 ? audio.getChannelData(1) : esq;
  // O codificador reaproveita a memória de saída: cada pedaço precisa ser copiado.
  const partes = [...(etiquetas ? [etiquetas] : []), codificador.encode([esq, dir]).slice(), codificador.finalize().slice()];
  return new Blob(partes, { type: 'audio/mpeg' });
}
