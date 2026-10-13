// Mesa de mixagem: um canal por take de voz, um barramento para o beat e a
// cadeia de master no final. A mesma classe serve para tocar ao vivo
// (AudioContext) e para exportar (OfflineAudioContext).

import type { PresetMaster, Project, Take } from '../model/project.ts';
import { TAXA_DA_CURVA, curvaDeGanho, curvaEmDb } from './espaco.ts';
import { chaveDaCadeia, criarCadeiaDeVoz, type CadeiaDeVoz } from './vocalChain.ts';

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

/** Como ouvir a saída: normal, somada em mono, ou imitando a caixa de um celular. */
export type Escuta = 'normal' | 'mono' | 'celular';

/** Nomes dos medidores fixos da mesa; cada take tem também o seu, pelo id. */
export type CanalFixo = 'bateria' | 'baixo' | 'melodia' | 'beat' | 'master';

export class Mixer {
  readonly barraDoBeat: GainNode;
  readonly barraBateria: GainNode;
  readonly barraBaixo: GainNode;
  readonly barraMelodia: GainNode;
  readonly saida: GainNode;
  private entradaMaster: GainNode;
  private espacoParaVoz: BiquadFilterNode;
  private cedeParaVoz: GainNode;
  /** Último nó antes das caixas de som; a escuta (mono, celular) é montada depois dele. */
  private paraAsCaixas: GainNode;
  private nosDaEscuta: AudioNode[] = [];
  escuta: Escuta = 'normal';
  private canais = new Map<string, Canal>();
  private medidores = new Map<string, AnalyserNode>();
  private amostras = new Float32Array(1024);
  // Master: equalizador de 3 bandas → largura → cola → ganho → limitador.
  private eqMaster: { grave: BiquadFilterNode; medio: BiquadFilterNode; agudo: BiquadFilterNode };
  private largura: { direto: GainNode[]; cruzado: GainNode[] };
  private cola: DynamicsCompressorNode;
  private ganhoMaster: GainNode;
  private limitador: DynamicsCompressorNode;

  /**
   * `offline`: usado na exportação. Não cria medidores e não limita: um
   * limitador de pico real é aplicado depois, sobre o áudio renderizado.
   */
  constructor(readonly ctx: BaseAudioContext, private offline = false) {
    this.barraDoBeat = ctx.createGain();
    this.barraBateria = ctx.createGain();
    this.barraBaixo = ctx.createGain();
    this.barraMelodia = ctx.createGain();
    for (const b of [this.barraBateria, this.barraBaixo, this.barraMelodia]) b.connect(this.barraDoBeat);
    this.entradaMaster = ctx.createGain();
    // Folga de 6 dB: várias faixas somadas passam fácil do máximo. Começar
    // mais baixo deixa o master trabalhar sem distorcer.
    this.entradaMaster.gain.value = 0.5;
    this.entradaMaster.channelCount = 2;
    this.entradaMaster.channelCountMode = 'explicit';
    this.saida = ctx.createGain();
    // Beats prontos já vêm cheios e comprimidos. Enquanto a voz canta, o beat
    // perde um pouco de 3 kHz (a região da inteligibilidade da letra) e cai
    // um pouco de volume; quando ela para, volta inteiro. Ver `agendarEspaco`.
    this.espacoParaVoz = ctx.createBiquadFilter();
    this.espacoParaVoz.type = 'peaking';
    this.espacoParaVoz.frequency.value = 3000;
    this.espacoParaVoz.Q.value = 1;
    this.cedeParaVoz = ctx.createGain();
    this.barraDoBeat.connect(this.espacoParaVoz).connect(this.cedeParaVoz).connect(this.entradaMaster);

    const banda = (tipo: BiquadFilterType, hz: number) => {
      const f = ctx.createBiquadFilter();
      f.type = tipo;
      f.frequency.value = hz;
      f.Q.value = 0.7;
      return f;
    };
    this.eqMaster = { grave: banda('lowshelf', 120), medio: banda('peaking', 1500), agudo: banda('highshelf', 8000) };
    this.entradaMaster.connect(this.eqMaster.grave).connect(this.eqMaster.medio).connect(this.eqMaster.agudo);

    // Largura: mistura um pouco de cada lado no outro. Misturar tudo dá mono;
    // subtrair o lado oposto afasta os lados e abre o estéreo.
    const separa = ctx.createChannelSplitter(2);
    const junta = ctx.createChannelMerger(2);
    this.eqMaster.agudo.connect(separa);
    this.largura = { direto: [ctx.createGain(), ctx.createGain()], cruzado: [ctx.createGain(), ctx.createGain()] };
    for (const lado of [0, 1]) {
      separa.connect(this.largura.direto[lado], lado).connect(junta, 0, lado);
      separa.connect(this.largura.cruzado[lado], lado).connect(junta, 0, 1 - lado);
    }

    this.cola = ctx.createDynamicsCompressor();
    this.cola.attack.value = 0.03;
    this.cola.release.value = 0.25;
    this.ganhoMaster = ctx.createGain();
    // Ao vivo, um compressor muito rápido e de razão alta faz o papel de limitador.
    this.limitador = ctx.createDynamicsCompressor();
    this.limitador.knee.value = 0;
    this.limitador.attack.value = 0.001;
    this.limitador.release.value = 0.1;
    junta.connect(this.cola).connect(this.ganhoMaster).connect(this.limitador).connect(this.saida);
    this.paraAsCaixas = ctx.createGain();
    this.saida.connect(this.paraAsCaixas).connect(ctx.destination);

    this.medir('bateria', this.barraBateria);
    this.medir('baixo', this.barraBaixo);
    this.medir('melodia', this.barraMelodia);
    this.medir('beat', this.barraDoBeat);
    this.medir('master', this.saida);
  }

  private medir(nome: string, no: AudioNode) {
    if (this.offline) return;
    const analisador = this.ctx.createAnalyser();
    analisador.fftSize = 1024;
    no.connect(analisador);
    this.medidores.set(nome, analisador);
  }

  /** Pico atual de um canal em dBFS (0 = máximo antes de distorcer). */
  picoDb(canal: string): number {
    const analisador = this.medidores.get(canal);
    if (!analisador) return -100;
    analisador.getFloatTimeDomainData(this.amostras);
    let pico = 0;
    for (const v of this.amostras) pico = Math.max(pico, Math.abs(v));
    return 20 * Math.log10(pico || 1e-5);
  }

  /** Quanto o compressor de um take está reduzindo agora, em dB (0 ou negativo). */
  reducaoDb(takeId: string): number {
    return this.canais.get(takeId)?.cadeia.compressor.reduction ?? 0;
  }

  /**
   * Agenda o beat para ceder espaço à voz. `presenca` diz, ponto a ponto, o
   * quanto há de voz (0 a 1) desde o começo da música; null desliga.
   */
  agendarEspaco(presenca: Float32Array | null, p: Project, t0: number, desde: number) {
    const corte = this.espacoParaVoz.gain;
    const volume = this.cedeParaVoz.gain;
    corte.cancelScheduledValues(0);
    volume.cancelScheduledValues(0);
    const trecho = presenca?.subarray(Math.min(presenca.length, Math.floor(desde * TAXA_DA_CURVA)));
    if (!trecho || trecho.length < 2 || !p.beat.espaco) {
      corte.setValueAtTime(0, 0);
      volume.setValueAtTime(1, 0);
      return;
    }
    const duracao = trecho.length / TAXA_DA_CURVA;
    corte.setValueCurveAtTime(curvaEmDb(trecho, 4), t0, duracao);
    volume.setValueCurveAtTime(curvaDeGanho(trecho, p.beat.cede), t0, duracao);
  }

  /** Troca o jeito de ouvir a saída. Não muda a música nem a exportação. */
  definirEscuta(modo: Escuta) {
    this.escuta = modo;
    this.paraAsCaixas.disconnect();
    this.nosDaEscuta.forEach((n) => n.disconnect());
    this.nosDaEscuta = [];
    if (modo === 'normal') {
      this.paraAsCaixas.connect(this.ctx.destination);
      return;
    }
    // Um nó de um canal só soma esquerda e direita: é o que uma caixa mono toca.
    const soma = this.ctx.createGain();
    soma.channelCount = 1;
    soma.channelCountMode = 'explicit';
    let fim: AudioNode = soma;
    this.nosDaEscuta.push(soma);
    if (modo === 'celular') {
      // Caixa de celular não reproduz grave nem o topo dos agudos.
      for (const [tipo, hz] of [['highpass', 350], ['highpass', 350], ['lowpass', 6000]] as const) {
        const f = this.ctx.createBiquadFilter();
        f.type = tipo;
        f.frequency.value = hz;
        fim.connect(f);
        fim = f;
        this.nosDaEscuta.push(f);
      }
    }
    this.paraAsCaixas.connect(soma);
    fim.connect(this.ctx.destination);
  }

  /** Deixa a mesa igual ao projeto: cria/remove canais e ajusta os controles. */
  sincronizar(p: Project) {
    this.barraDoBeat.gain.value = p.beat.volume;
    this.barraBateria.gain.value = p.volumes.bateria;
    this.barraBaixo.gain.value = p.volumes.baixo;
    this.barraMelodia.gain.value = p.volumes.melodia;
    for (const [id, canal] of this.canais) {
      if (!p.takes.some((t) => t.id === id)) {
        canal.entrada.disconnect();
        canal.cadeia.desligar();
        canal.pan.disconnect();
        this.medidores.delete(id);
        this.canais.delete(id);
      }
    }
    for (const take of p.takes) this.sincronizarCanal(take, p.bpm);
    this.sincronizarMaster(p);
  }

  entradaDoTake(id: string): AudioNode | undefined {
    return this.canais.get(id)?.entrada;
  }

  private sincronizarCanal(take: Take, bpm: number) {
    const chave = chaveDaCadeia(take, bpm);
    let canal = this.canais.get(take.id);
    if (!canal) {
      const entrada = this.ctx.createGain();
      const volume = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      volume.connect(pan).connect(this.entradaMaster);
      canal = { entrada, volume, pan, cadeia: criarCadeiaDeVoz(this.ctx, take, bpm), chave };
      entrada.connect(canal.cadeia.entrada);
      canal.cadeia.saida.connect(volume);
      this.canais.set(take.id, canal);
      this.medir(take.id, pan);
    } else if (canal.chave !== chave) {
      canal.entrada.disconnect();
      canal.cadeia.desligar();
      canal.cadeia = criarCadeiaDeVoz(this.ctx, take, bpm);
      canal.entrada.connect(canal.cadeia.entrada);
      canal.cadeia.saida.connect(canal.volume);
      canal.chave = chave;
    }
    canal.cadeia.ajustar(take);
    canal.volume.gain.value = take.mudo ? 0 : take.volume;
    canal.pan.pan.value = take.pan;
  }

  private sincronizarMaster(p: Project) {
    const a = p.ajusteDoMaster;
    this.eqMaster.grave.gain.value = a.graveDb;
    this.eqMaster.medio.gain.value = a.medioDb;
    this.eqMaster.agudo.gain.value = a.agudoDb;
    for (const lado of [0, 1]) {
      this.largura.direto[lado].gain.value = (1 + a.largura) / 2;
      this.largura.cruzado[lado].gain.value = (1 - a.largura) / 2;
    }
    const r = PRESETS_MASTER[p.master];
    this.cola.threshold.value = r.cola[0];
    this.cola.ratio.value = r.cola[1];
    this.ganhoMaster.gain.value = 10 ** (r.ganhoDb / 20);
    const limita = p.master !== 'desligado' && !this.offline;
    this.limitador.threshold.value = limita ? r.teto : 0;
    this.limitador.ratio.value = limita ? 20 : 1;
  }
}
