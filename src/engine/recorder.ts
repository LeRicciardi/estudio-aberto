// Gravação de voz. O microfone é capturado em PCM sem compressão e sem os
// "melhoramentos" de chamada de vídeo do navegador, que estragam canto.

import { atrasoDosEstalos } from './latencia.ts';

export interface Gravacao {
  amostras: Float32Array;
  taxa: number;
  /** Instante do relógio de áudio em que o primeiro sample foi capturado. */
  inicio: number;
}

export class Gravador {
  private stream: MediaStream | undefined;
  private fonte: MediaStreamAudioSourceNode | undefined;
  private no: AudioWorkletNode | undefined;
  private blocos: Float32Array[] = [];
  private entregues = 0;
  private inicio = 0;
  private moduloCarregado = false;
  /** Atraso de entrada informado pelo dispositivo, em segundos. */
  latenciaDeEntrada = 0;
  /** Pico do último bloco capturado (0 a 1), para o medidor de entrada. */
  nivel = 0;

  constructor(private ctx: AudioContext) {}

  /** `microfone` é o id do dispositivo de entrada; sem ele, usa o padrão do sistema. */
  async iniciar(microfone?: string) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        ...(microfone ? { deviceId: { exact: microfone } } : {}),
      },
    });
    if (!this.moduloCarregado) {
      await this.ctx.audioWorklet.addModule(import.meta.env.BASE_URL + 'captura.worklet.js');
      this.moduloCarregado = true;
    }
    const config = this.stream.getAudioTracks()[0].getSettings() as MediaTrackSettings & { latency?: number };
    this.latenciaDeEntrada = config.latency ?? 0;
    this.blocos = [];
    this.entregues = 0;
    this.inicio = 0;
    this.fonte = this.ctx.createMediaStreamSource(this.stream);
    this.no = new AudioWorkletNode(this.ctx, 'captura', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    this.no.port.onmessage = (e: MessageEvent<{ t: number; d: Float32Array }>) => {
      if (this.blocos.length === 0) this.inicio = e.data.t;
      this.blocos.push(e.data.d);
      let pico = 0;
      for (const v of e.data.d) pico = Math.max(pico, Math.abs(v));
      this.nivel = pico;
    };
    // O nó precisa estar ligado à saída para ser processado; ele não emite som.
    this.fonte.connect(this.no).connect(this.ctx.destination);
  }

  /**
   * O que foi gravado desde a última chamada. Serve para ir guardando a
   * gravação aos poucos: se a página cair no meio do take, quase nada se perde.
   */
  novos(): Float32Array {
    const fatia = this.blocos.slice(this.entregues);
    this.entregues = this.blocos.length;
    const junto = new Float32Array(fatia.reduce((n, b) => n + b.length, 0));
    let pos = 0;
    for (const b of fatia) {
      junto.set(b, pos);
      pos += b.length;
    }
    return junto;
  }

  parar(): Gravacao {
    this.fonte?.disconnect();
    this.no?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.nivel = 0;
    const total = this.blocos.reduce((n, b) => n + b.length, 0);
    const amostras = new Float32Array(total);
    let pos = 0;
    for (const b of this.blocos) {
      amostras.set(b, pos);
      pos += b.length;
    }
    this.blocos = [];
    return { amostras, taxa: this.ctx.sampleRate, inicio: this.inicio };
  }
}

/** Microfones e interfaces de áudio ligados ao aparelho. Os nomes só aparecem depois da permissão. */
export async function listarMicrofones(): Promise<{ id: string; nome: string }[]> {
  const aparelhos = await navigator.mediaDevices.enumerateDevices();
  return aparelhos
    .filter((a) => a.kind === 'audioinput' && a.deviceId)
    .map((a, i) => ({ id: a.deviceId, nome: a.label || `Microfone ${i + 1}` }));
}

/**
 * Mede o atraso real de ida e volta do aparelho: toca estalos pelo alto-falante,
 * grava pelo microfone e vê quanto tempo depois cada estalo aparece na
 * gravação. Devolve o atraso em segundos, ou null se o microfone não ouviu os
 * estalos (fone de ouvido, volume baixo).
 */
export async function medirLatencia(ctx: AudioContext, gravador: Gravador, microfone?: string): Promise<number | null> {
  const ESTALOS = 5;
  const INTERVALO = 0.5;
  await ctx.resume();
  await gravador.iniciar(microfone);
  const t0 = ctx.currentTime + 0.5;
  for (let k = 0; k < ESTALOS; k++) {
    const t = t0 + k * INTERVALO;
    const o = ctx.createOscillator();
    o.frequency.value = 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.setValueAtTime(0, t + 0.004);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.01);
  }
  await new Promise((ok) => setTimeout(ok, (0.5 + ESTALOS * INTERVALO + 0.3) * 1000));
  const { amostras, taxa, inicio } = gravador.parar();
  return atrasoDosEstalos(amostras, taxa, Array.from({ length: ESTALOS }, (_, k) => t0 + k * INTERVALO - inicio));
}
