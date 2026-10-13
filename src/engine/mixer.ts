// Mesa de mixagem: um canal por take de voz, um barramento para o beat e a
// cadeia de master no final. A mesma classe serve para tocar ao vivo
// (AudioContext) e para exportar (OfflineAudioContext).

import type { PresetMaster, Project, Take } from '../model/project.ts';
import { criarCadeiaDeVoz, type CadeiaDeVoz } from './vocalChain.ts';

export const PRESETS_MASTER: Record<PresetMaster, { nome: string; cola: [number, number]; ganhoDb: number; teto: number; explicacao: string[] }> = {
  desligado: { nome: 'Desligado', cola: [0, 1], ganhoDb: 0, teto: 0, explicacao: ['A mix sai sem tratamento final.'] },
  limpo: {
    nome: 'Limpo',
    cola: [-12, 2], ganhoDb: 2, teto: -2,
    explicacao: [
      'Compressor de "cola" 2:1: faz voz e beat se moverem juntos, como uma coisa só.',
      'Ganho +2 dB e limitador: sobe o volume sem deixar os picos estourarem.',
    ],
  },
  alto: {
    nome: 'Alto (pronto para streaming)',
    cola: [-18, 3], ganhoDb: 6, teto: -3,
    explicacao: [
      'Compressor de "cola" 3:1 mais firme: reduz a diferença entre trechos fracos e fortes.',
      'Ganho +6 dB contra o limitador: volume competitivo, ao custo de um pouco de dinâmica.',
    ],
  },
};

interface Canal {
  entrada: GainNode;
  volume: GainNode;
  pan: StereoPannerNode;
  cadeia: CadeiaDeVoz;
  chave: string;
}

export class Mixer {
  readonly barraDoBeat: GainNode;
  readonly barraBateria: GainNode;
  readonly barraBaixo: GainNode;
  readonly barraMelodia: GainNode;
  readonly saida: GainNode;
  private entradaMaster: GainNode;
  private espacoParaVoz: BiquadFilterNode;
  private nosMaster: AudioNode[] = [];
  private presetMaster: PresetMaster | undefined;
  private canais = new Map<string, Canal>();

  /**
   * `semLimitador`: usado na exportação, onde um limitador de pico real é
   * aplicado depois, sobre o áudio renderizado.
   */
  constructor(readonly ctx: BaseAudioContext, private semLimitador = false) {
    this.barraDoBeat = ctx.createGain();
    this.barraBateria = ctx.createGain();
    this.barraBaixo = ctx.createGain();
    this.barraMelodia = ctx.createGain();
    for (const b of [this.barraBateria, this.barraBaixo, this.barraMelodia]) b.connect(this.barraDoBeat);
    this.entradaMaster = ctx.createGain();
    // Folga de 6 dB: várias faixas somadas passam fácil do máximo. Começar
    // mais baixo deixa o master trabalhar sem distorcer.
    this.entradaMaster.gain.value = 0.5;
    this.saida = ctx.createGain();
    // Beats prontos já vêm cheios e comprimidos. Um corte suave em 3 kHz, a
    // região que carrega a inteligibilidade da letra, abre lugar para a voz.
    this.espacoParaVoz = ctx.createBiquadFilter();
    this.espacoParaVoz.type = 'peaking';
    this.espacoParaVoz.frequency.value = 3000;
    this.espacoParaVoz.Q.value = 1;
    this.barraDoBeat.connect(this.espacoParaVoz).connect(this.entradaMaster);
    this.saida.connect(ctx.destination);
  }

  /** Deixa a mesa igual ao projeto: cria/remove canais e ajusta os controles. */
  sincronizar(p: Project) {
    this.barraDoBeat.gain.value = p.beat.volume;
    this.espacoParaVoz.gain.value = p.beat.espaco && p.takes.length > 0 ? -3 : 0;
    this.barraBateria.gain.value = p.volumes.bateria;
    this.barraBaixo.gain.value = p.volumes.baixo;
    this.barraMelodia.gain.value = p.volumes.melodia;
    for (const [id, canal] of this.canais) {
      if (!p.takes.some((t) => t.id === id)) {
        canal.entrada.disconnect();
        canal.cadeia.desligar();
        canal.pan.disconnect();
        this.canais.delete(id);
      }
    }
    for (const take of p.takes) this.sincronizarCanal(take, p.bpm);
    if (p.master !== this.presetMaster) this.montarMaster(p.master);
  }

  entradaDoTake(id: string): AudioNode | undefined {
    return this.canais.get(id)?.entrada;
  }

  private sincronizarCanal(take: Take, bpm: number) {
    const chave = `${take.preset}|${take.divisaoDelay}|${bpm}`;
    let canal = this.canais.get(take.id);
    if (!canal) {
      const entrada = this.ctx.createGain();
      const volume = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      volume.connect(pan).connect(this.entradaMaster);
      canal = { entrada, volume, pan, cadeia: criarCadeiaDeVoz(this.ctx, take.preset, bpm, take.divisaoDelay), chave };
      entrada.connect(canal.cadeia.entrada);
      canal.cadeia.saida.connect(volume);
      this.canais.set(take.id, canal);
    } else if (canal.chave !== chave) {
      canal.entrada.disconnect();
      canal.cadeia.desligar();
      canal.cadeia = criarCadeiaDeVoz(this.ctx, take.preset, bpm, take.divisaoDelay);
      canal.entrada.connect(canal.cadeia.entrada);
      canal.cadeia.saida.connect(canal.volume);
      canal.chave = chave;
    }
    canal.volume.gain.value = take.mudo ? 0 : take.volume;
    canal.pan.pan.value = take.pan;
    canal.cadeia.mandadaReverb.gain.value = take.reverb;
    canal.cadeia.mandadaDelay.gain.value = take.delay;
  }

  private montarMaster(preset: PresetMaster) {
    this.presetMaster = preset;
    this.entradaMaster.disconnect();
    this.nosMaster.forEach((n) => n.disconnect());
    this.nosMaster = [];
    if (preset === 'desligado') {
      this.entradaMaster.connect(this.saida);
      return;
    }
    const r = PRESETS_MASTER[preset];
    const cola = this.ctx.createDynamicsCompressor();
    cola.threshold.value = r.cola[0];
    cola.ratio.value = r.cola[1];
    cola.attack.value = 0.03;
    cola.release.value = 0.25;
    const ganho = this.ctx.createGain();
    ganho.gain.value = 10 ** (r.ganhoDb / 20);
    if (this.semLimitador) {
      this.entradaMaster.connect(cola).connect(ganho).connect(this.saida);
      this.nosMaster = [cola, ganho];
      return;
    }
    // Ao vivo, um compressor muito rápido e de razão alta faz o papel de limitador.
    const limitador = this.ctx.createDynamicsCompressor();
    limitador.threshold.value = r.teto;
    limitador.ratio.value = 20;
    limitador.knee.value = 0;
    limitador.attack.value = 0.001;
    limitador.release.value = 0.1;
    this.entradaMaster.connect(cola).connect(ganho).connect(limitador).connect(this.saida);
    this.nosMaster = [cola, ganho, limitador];
  }
}
