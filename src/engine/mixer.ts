// Mesa de mixagem: um canal por take de voz, um barramento para o beat e a
// cadeia de master no final. A mesma classe serve para tocar ao vivo
// (AudioContext) e para exportar (OfflineAudioContext).

import { comPedaisNoProjeto, type PresetMaster, type Project, type Take } from '../model/project.ts';
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

/** Curva que deixa o som passar intacto até `joelho` e arredonda o que passar disso, sem nunca exceder 1. */
function curvaDeCorte(joelho: number): Float32Array {
  const n = 4097;
  const curva = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // A curva cobre de -3 a +3 para sinais empurrados além do máximo; o WaveShaper lê de -1 a 1.
    const x = ((i / (n - 1)) * 2 - 1);
    const a = Math.abs(x);
    curva[i] = Math.sign(x) * (a < joelho ? a : joelho + (1 - joelho) * Math.tanh((a - joelho) / (1 - joelho)));
  }
  return curva;
}

interface Canal {
  entrada: GainNode;
  /** Volume desenhado ao longo da música (automação). */
  automacao: GainNode;
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
  private baixoCede: GainNode;
  private estouro: { entrada: GainNode; forma: WaveShaperNode; saida: GainNode; ligado: boolean };
  private clipper: GainNode;
  private nosDaEscuta: AudioNode[] = [];
  escuta: Escuta = 'normal';
  private canais = new Map<string, Canal>();
  private medidores = new Map<string, AnalyserNode>();
  private amostras = new Float32Array(1024);
  // Master: equalizador de 3 bandas → largura → cola → ganho → limitador.
  private eqMaster: { grave: BiquadFilterNode; medio: BiquadFilterNode; agudo: BiquadFilterNode };
  private largura: { direto: GainNode[]; cruzado: GainNode[] };
  private cola: DynamicsCompressorNode;
  private bandas: DynamicsCompressorNode[] = [];
  private automacaoDoBeat: GainNode;
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
    // O 808 passa por um ganho que abaixa por um instante a cada bumbo.
    this.baixoCede = ctx.createGain();
    this.barraBaixo.connect(this.baixoCede).connect(this.barraDoBeat);
    for (const b of [this.barraBateria, this.barraMelodia]) b.connect(this.barraDoBeat);
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
    this.automacaoDoBeat = ctx.createGain();
    this.espacoParaVoz.connect(this.cedeParaVoz).connect(this.automacaoDoBeat).connect(this.entradaMaster);
    // "Estourar": o beat inteiro empurrado contra um limite, de propósito.
    this.estouro = { entrada: ctx.createGain(), forma: ctx.createWaveShaper(), saida: ctx.createGain(), ligado: false };
    this.estouro.forma.curve = curvaDeCorte(0.25);
    this.estouro.forma.oversample = '4x';
    this.estouro.entrada.connect(this.estouro.forma).connect(this.estouro.saida).connect(this.espacoParaVoz);
    this.barraDoBeat.connect(this.espacoParaVoz);

    const banda = (tipo: BiquadFilterType, hz: number) => {
      const f = ctx.createBiquadFilter();
      f.type = tipo;
      f.frequency.value = hz;
      f.Q.value = 0.7;
      return f;
    };
    this.eqMaster = { grave: banda('lowshelf', 120), medio: banda('peaking', 1500), agudo: banda('highshelf', 8000) };
    // Tira o que há abaixo de 20 Hz: ninguém ouve, mas rouba folga do limitador.
    const semSubgrave = banda('highpass', 20);
    this.entradaMaster.connect(semSubgrave).connect(this.eqMaster.grave).connect(this.eqMaster.medio).connect(this.eqMaster.agudo);

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
    // Limitador suave (soft clipper): abaixo de 70% do máximo não faz nada;
    // acima, arredonda o pico em vez de cortá-lo seco. Empurrar a música
    // contra ele dá volume sem achatar tanto as batidas quanto um limitador.
    this.clipper = ctx.createGain();
    const arredonda = ctx.createWaveShaper();
    arredonda.curve = curvaDeCorte(0.7);
    arredonda.oversample = '4x';
    // Compressor multibanda: a música é separada em grave, médio e agudo, e
    // cada parte é comprimida sozinha. Assim um 808 forte não faz a voz
    // "afundar" junto, como aconteceria num compressor só.
    const passa = (tipo: BiquadFilterType, hz: number, de: AudioNode) => {
      // Dois filtros iguais em série (Linkwitz-Riley): somando as bandas de volta, nada falta nem sobra.
      const a = banda(tipo, hz);
      const b = banda(tipo, hz);
      de.connect(a).connect(b);
      return b;
    };
    const soma = ctx.createGain();
    const acimaDoGrave = passa('highpass', 150, junta);
    for (const faixa of [passa('lowpass', 150, junta), passa('lowpass', 4000, acimaDoGrave), passa('highpass', 4000, acimaDoGrave)]) {
      const comp = ctx.createDynamicsCompressor();
      comp.attack.value = 0.02;
      comp.release.value = 0.2;
      faixa.connect(comp).connect(soma);
      this.bandas.push(comp);
    }
    soma.connect(this.cola).connect(this.ganhoMaster).connect(this.clipper).connect(arredonda).connect(this.limitador).connect(this.saida);
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
    // Faixa do espectro: de -85 a -15 dB, para música alta não encostar no topo do gráfico.
    analisador.minDecibels = -85;
    analisador.maxDecibels = -15;
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

  /** Espectro atual da saída: quanta energia há em cada frequência (0 a 255 por faixa). */
  espectro(destino: Uint8Array) {
    this.medidores.get('master')?.getByteFrequencyData(destino);
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

  /**
   * Agenda as curvas de volume desenhadas no arranjo. Cada curva é uma lista
   * de pontos ligados por retas; antes do primeiro e depois do último, o
   * volume fica parado no valor deles.
   */
  agendarAutomacao(p: Project, t0: number, desde: number) {
    const alvos: [AudioParam, [number, number][] | undefined][] = [[this.automacaoDoBeat.gain, p.automacao?.beat]];
    for (const [id, canal] of this.canais) alvos.push([canal.automacao.gain, p.automacao?.[id]]);
    for (const [param, pontos] of alvos) {
      param.cancelScheduledValues(0);
      if (!pontos?.length) {
        param.setValueAtTime(1, 0);
        continue;
      }
      const ordenados = [...pontos].sort((a, b) => a[0] - b[0]);
      const valorEm = (t: number) => {
        if (t <= ordenados[0][0]) return ordenados[0][1];
        for (let k = 1; k < ordenados.length; k++) {
          const [t1, v1] = ordenados[k - 1];
          const [t2, v2] = ordenados[k];
          if (t <= t2) return v1 + ((v2 - v1) * (t - t1)) / Math.max(1e-6, t2 - t1);
        }
        return ordenados[ordenados.length - 1][1];
      };
      param.setValueAtTime(valorEm(desde), t0);
      for (const [t, v] of ordenados) if (t > desde) param.linearRampToValueAtTime(v, t0 + t - desde);
    }
  }

  /** A cada bumbo, o 808 abaixa por um instante e volta: os dois deixam de se embolar. */
  abaixarBaixo(t: number) {
    this.baixoCede.gain.setValueAtTime(0.5, t);
    this.baixoCede.gain.linearRampToValueAtTime(1, t + 0.14);
  }

  /**
   * Agenda o "eco só no fim da frase" de um take: `curva` é o volume da
   * mandada de delay ponto a ponto desde o começo da música; null desliga.
   */
  agendarEco(takeId: string, curva: Float32Array | null, t0: number, desde: number) {
    const mandada = this.canais.get(takeId)?.cadeia.mandadaDelay.gain;
    if (!mandada || !curva) return;
    const trecho = curva.subarray(Math.min(curva.length, Math.floor(desde * TAXA_DA_CURVA)));
    mandada.cancelScheduledValues(0);
    if (trecho.length >= 2) mandada.setValueCurveAtTime(trecho, t0, trecho.length / TAXA_DA_CURVA);
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
    p = comPedaisNoProjeto(p);
    // Solo: com um canal em solo, todos os outros se calam.
    this.barraDoBeat.gain.value = p.solo && p.solo !== 'beat' ? 0 : p.beat.volume;
    this.barraBateria.gain.value = p.volumes.bateria;
    this.barraBaixo.gain.value = p.volumes.baixo;
    this.barraMelodia.gain.value = p.volumes.melodia;
    // Estourar o beat: liga o caminho da distorção só quando pedido.
    const estourar = p.beat.estourar ?? 0;
    if (estourar > 0 !== this.estouro.ligado) {
      this.barraDoBeat.disconnect();
      this.barraDoBeat.connect(estourar > 0 ? this.estouro.entrada : this.espacoParaVoz);
      const medidor = this.medidores.get('beat');
      if (medidor) this.barraDoBeat.connect(medidor);
      this.estouro.ligado = estourar > 0;
    }
    this.estouro.entrada.gain.value = 1 + estourar * 11;
    this.estouro.saida.gain.value = 1 / (1 + estourar * 1.5);
    for (const [id, canal] of this.canais) {
      if (!p.takes.some((t) => t.id === id)) {
        canal.entrada.disconnect();
        canal.cadeia.desligar();
        canal.pan.disconnect();
        this.medidores.delete(id);
        this.canais.delete(id);
      }
    }
    for (const take of p.takes) this.sincronizarCanal(take, p.bpm, !!p.solo && p.solo !== take.id);
    this.sincronizarMaster(p);
  }

  entradaDoTake(id: string): AudioNode | undefined {
    return this.canais.get(id)?.entrada;
  }

  private sincronizarCanal(take: Take, bpm: number, calado = false) {
    const chave = chaveDaCadeia(take, bpm);
    let canal = this.canais.get(take.id);
    if (!canal) {
      const entrada = this.ctx.createGain();
      const volume = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      const automacao = this.ctx.createGain();
      volume.connect(pan).connect(automacao).connect(this.entradaMaster);
      canal = { entrada, automacao, volume, pan, cadeia: criarCadeiaDeVoz(this.ctx, take, bpm), chave };
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
    canal.volume.gain.value = take.mudo || calado ? 0 : take.volume;
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
    const multibanda = a.multibanda ?? 0;
    for (const comp of this.bandas) {
      comp.threshold.value = -30 * multibanda;
      comp.ratio.value = 1 + 3 * multibanda;
    }
    this.cola.threshold.value = r.cola[0];
    this.cola.ratio.value = r.cola[1];
    this.ganhoMaster.gain.value = 10 ** (r.ganhoDb / 20);
    this.clipper.gain.value = 1 + (a.clipper ?? 0) * 1.8;
    const limita = p.master !== 'desligado' && !this.offline;
    this.limitador.threshold.value = limita ? r.teto : 0;
    this.limitador.ratio.value = limita ? 20 : 1;
  }
}
