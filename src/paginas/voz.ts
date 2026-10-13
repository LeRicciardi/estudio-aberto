// Página Voz: escolha do take, telas de efeito e processamento prévio.

import { sugerirAjustes } from '../engine/diagnostico.ts';
import { exportarMix, paraWav } from '../engine/engine.ts';
import { processarEmSegundoPlano } from '../engine/tuneClient.ts';
import { PRESETS_VOZ, aplicarTimbre } from '../engine/vocalChain.ts';
import { afinadoCom, av, engine, estado, mudou, projetoParaTocar, so } from '../estado.ts';
import { NOTAS, type PresetVoz, type Project, type Take, usaProcessamento, usaTune, comPedais } from '../model/project.ts';
import { avisar, secVozes } from '../moldura.ts';
import { reiniciarSeTocando, trocarTela } from '../transporte.ts';
import { baixar, botao, campo, deslizante, explicacao, h, opcoes, seletor } from '../ui/controles.ts';
import { TELAS, pedaleira, telaDeEfeito } from '../ui/efeitos.ts';
import { desenharGravar } from './gravar.ts';
import { desenharMixer } from './mixer.ts';
import { montagem } from './montagem.ts';
import { onda } from './onda.ts';

/** Refaz o processamento prévio de um take: limpeza (gate, de-esser) e afinação. */
export async function reafinar(original_: Take) {
  // Pedais desligados contam como efeito neutro também no processamento prévio.
  const take = comPedais(original_);
  const chave = take.audioId + ':tune';
  const original = engine.buffers.get(take.audioId);
  if ((!usaProcessamento(take) && !take.harmonia?.quanto) || !original) return;
  // Com o tune desligado, só a mudança de altura é aplicada (intensidade 0).
  const intensidade = take.tune.ligado ? take.tune.intensidade : 0;
  const tune = usaTune(take)
    ? { tom: estado.projeto.tom, escala: estado.projeto.escala, velocidade: take.tune.velocidade, intensidade, transpor: take.altura, referencia: estado.projeto.afinacaoCents ?? 0 }
    : undefined;
  const limpeza = { gate: take.limpeza.gate, deEsser: take.limpeza.deEsser, ruido: take.limpeza.ruido ?? 0, nivelar: take.limpeza.nivelar ?? 0 };
  const harmonia = take.harmonia?.quanto ? take.harmonia.graus : 0;
  const ajustes = JSON.stringify([tune, limpeza, harmonia]);
  if (afinadoCom.get(take.audioId) === ajustes) return;
  avisar(`Processando ${take.nome}...`);
  const guardar = (sufixo: string, dados: Float32Array) => {
    const buffer = engine.ctx.createBuffer(1, dados.length, original.sampleRate);
    buffer.copyToChannel(dados, 0);
    engine.buffers.set(take.audioId + sufixo, buffer);
  };
  if (usaProcessamento(take)) guardar(':tune', await processarEmSegundoPlano(original.getChannelData(0), original.sampleRate, { ...limpeza, tune }));
  else engine.buffers.delete(chave);
  // Harmonia: a mesma gravação limpa, afinada firme e deslocada alguns graus da escala.
  if (harmonia) {
    guardar(':harm', await processarEmSegundoPlano(original.getChannelData(0), original.sampleRate, {
      ...limpeza, tune: { tom: estado.projeto.tom, escala: estado.projeto.escala, velocidade: 0.1, intensidade: 1, transpor: take.altura, referencia: estado.projeto.afinacaoCents ?? 0, graus: harmonia },
    }));
  }
  afinadoCom.set(take.audioId, ajustes);
  avisar(take.tune.ligado ? `${take.nome} afinado em ${NOTAS[estado.projeto.tom]} ${estado.projeto.escala}.` : `${take.nome} processado.`);
  reiniciarSeTocando();
}

export async function reafinarTodos() {
  for (const take of estado.projeto.takes) await reafinar(take);
}

/** Compara o volume das vozes com o do beat e diz, em linguagem comum, o que ajustar. */
export async function conferirEquilibrio() {
  if (!estado.projeto.takes.some((t) => !t.mudo)) return avisar('Grave uma voz antes de conferir o equilíbrio.');
  avisar('Conferindo o equilíbrio entre voz e beat...');
  const voz = (await exportarMix(estado.projeto, engine.buffers, 'voz')).lufs;
  const beat = (await exportarMix(estado.projeto, engine.buffers, 'beat')).lufs;
  if (!Number.isFinite(voz) || !Number.isFinite(beat)) return avisar('Não deu para comparar: falta voz ou beat.');
  const diferenca = voz - beat;
  avisar(
    diferenca < -4 ? `A voz está ${Math.round(-diferenca)} dB abaixo do beat e vai sumir. Suba o volume da voz ou baixe o do beat.`
    : diferenca > 6 ? `A voz está ${Math.round(diferenca)} dB acima do beat e soa descolada dele. Baixe um pouco a voz ou suba o beat.`
    : 'Voz e beat estão equilibrados: a voz aparece sem se descolar do beat.',
  );
}

/** Mede a gravação e regula os efeitos para ela, explicando cada mudança. */
function ajustarAoTake(take: Take) {
  const original = engine.buffers.get(take.audioId);
  if (!original) return;
  const s = sugerirAjustes(original.getChannelData(0), original.sampleRate);
  take.edicao.ganhoDb = s.ganhoDb;
  take.eq.corte = s.corte;
  take.eq.graveDb = s.graveDb;
  take.eq.arDb = Math.max(take.eq.arDb, s.arDb);
  take.comp.limiar = s.limiar;
  take.limpeza.deEsser = Math.max(take.limpeza.deEsser, s.deEsser);
  if (s.gate) take.limpeza.gate = s.gate;
  mudou();
  desenharVozes();
  void reafinar(take);
  avisar(`${take.nome} ajustado. ${s.motivos.join(' ')}`);
}

/**
 * Papel do take na música. A voz principal fica no centro e na frente;
 * dobras e adlibs ficam mais baixos, nos lados e com mais espaço.
 */
function definirPapel(take: Take, papel: 'principal' | 'dobra' | 'adlib') {
  const outros = estado.projeto.takes.filter((t) => t !== take && Math.abs(t.pan) > 0.2).length;
  const lado = outros % 2 ? 0.6 : -0.6;
  if (papel === 'principal') Object.assign(take, { pan: 0, volume: 0.9, telefone: false, dobra: 0 });
  if (papel === 'dobra') Object.assign(take, { pan: lado, volume: 0.45, telefone: false, reverb: Math.max(take.reverb, 0.15) });
  if (papel === 'adlib') {
    Object.assign(take, { pan: lado * 1.2, volume: 0.5, reverb: Math.max(take.reverb, 0.25), delay: Math.max(take.delay, 0.2), ecoNoFim: false });
    take.eq.corte = Math.max(take.eq.corte, 200);
  }
  mudou();
  desenharVozes();
  avisar({ principal: 'Voz principal: no centro e na frente.', dobra: 'Dobra: mais baixa e para um lado, engordando a principal.', adlib: 'Adlib: no lado, com menos grave, mais reverb e eco.' }[papel]);
}

/** Exporta só este take, curto, em duas versões: seca e com os efeitos. Serve para vinhetas e tags de DJ. */
async function exportarVinheta(take: Take) {
  const p = estado.projeto;
  const so = (cru: boolean): Project => ({
    ...p,
    beat: { ...p.beat, volume: 0 },
    volumes: { bateria: 0, baixo: 0, melodia: 0 },
    master: 'limpo',
    ajusteDoMaster: { ...p.ajusteDoMaster, alvoLufs: -14 },
    montagem: { ...p.montagem, ligada: false },
    takes: [cru
      ? { ...take, inicio: 0, mudo: false, preset: 'cru', reverb: 0, delay: 0, distorcao: 0, telefone: false, dobra: 0, eq: { corte: 60, graveDb: 0, medioHz: 3000, medioDb: 0, arDb: 0 }, comp: { limiar: -18, razao: 3, ataque: 5, soltura: 120, ganho: 0 } }
      : { ...take, inicio: 0, mudo: false }],
  });
  avisar('Exportando a vinheta...');
  for (const [cru, sufixo] of [[true, 'seca'], [false, 'com efeito']] as const) {
    const r = await exportarMix(so(cru), engine.buffers, 'tudo');
    baixar(paraWav(r.audio), `${take.nome} (vinheta ${sufixo}).wav`);
  }
  avisar('Vinheta exportada em duas versões: seca, para tratar depois, e com efeito, pronta para usar.');
}

const CHAVE_DOS_PRESETS = 'estudio-aberto:presets';
/** O que um preset guarda: todos os ajustes de som, sem o áudio nem a posição do take. */
const CAMPOS_DO_PRESET = ['preset', 'tune', 'altura', 'reverb', 'tamanhoReverb', 'delay', 'divisaoDelay', 'repeticoes', 'distorcao', 'telefone', 'eq', 'comp', 'dobra', 'chorus', 'limpeza', 'ecoNoFim', 'harmonia', 'desligados'] as const;

const lerPresets = (): Record<string, Partial<Take>> => JSON.parse(localStorage.getItem(CHAVE_DOS_PRESETS) ?? '{}');

/** Presets da pessoa: guardar a cadeia de efeitos de um take e aplicar em outros takes e outras músicas. */
function presets(take: Take): HTMLElement {
  const guardados = lerPresets();
  const nomes = Object.keys(guardados);
  return h('div', { className: 'linha' },
    nomes.length
      ? seletor('Meus presets', [['', 'Aplicar um preset...'] as [string, string], ...nomes.map((n) => [n, n] as [string, string])], '', (nome) => {
          if (!guardados[nome]) return;
          Object.assign(take, structuredClone(guardados[nome]));
          desenharVozes();
          void reafinar(take);
          avisar(`Preset "${nome}" aplicado em ${take.nome}.`);
        })
      : '',
    botao('Guardar como preset', () => {
      const nome = prompt('Nome do preset (ex.: Minha voz no trap):')?.trim();
      if (!nome) return;
      const preset: Record<string, unknown> = {};
      for (const campo of CAMPOS_DO_PRESET) if (take[campo] !== undefined) preset[campo] = structuredClone(take[campo]);
      localStorage.setItem(CHAVE_DOS_PRESETS, JSON.stringify({ ...guardados, [nome]: preset }));
      desenharVozes();
      avisar(`Preset "${nome}" guardado. Ele fica disponível em todas as músicas neste navegador.`);
    }),
  );
}

export function desenharVozes() {
  estado.quadrosDaVoz = [];
  desenharMixer();
  const take = estado.projeto.takes.find((t) => t.id === estado.takeAberto) ?? estado.projeto.takes[0];
  if (!take) {
    secVozes.replaceChildren(h('h2', {}, 'Voz'), h('p', { className: 'nota' }, 'Nenhum take ainda. Grave sua voz na página "Gravar" e volte aqui para tratar o som dela.'));
    return;
  }
  estado.takeAberto = take.id;
  const comparar = botao(estado.semEfeitos ? 'Ouvindo SEM efeitos' : 'Comparar: ouvir sem efeitos', () => {
    estado.semEfeitos = !estado.semEfeitos;
    engine.mixer.sincronizar(projetoParaTocar());
    reiniciarSeTocando();
    desenharVozes();
  }, estado.semEfeitos ? 'ativo' : '');
  comparar.title = 'Alterna entre a voz tratada e a voz crua, para ouvir o que os efeitos fazem';

  const nome = h('input', { type: 'text', value: take.nome, ariaLabel: 'Nome do take' });
  nome.onchange = () => {
    take.nome = nome.value;
    mudou();
    desenharVozes();
    void desenharGravar();
  };
  const mudo = botao(take.mudo ? 'Mudo' : 'Ouvindo', () => {
    take.mudo = !take.mudo;
    mudou();
    desenharVozes();
    void desenharGravar();
  }, take.mudo ? 'ativo' : '');
  const apagar = botao('Apagar', () => {
    estado.projeto.takes = estado.projeto.takes.filter((t) => t.id !== take.id);
    mudou();
    desenharVozes();
    void desenharGravar();
    reiniciarSeTocando();
    avisar(`${take.nome} apagado. Use "Desfazer" se foi engano.`);
  }, 'perigo');

  // Controles por intenção (tela simples): cada um move vários ajustes de uma vez.
  const NIVEIS_DE_TUNE: [string, boolean, number, number][] = [
    ['Sem tune', false, 0.2, 1], ['Leve', true, 0.6, 0.6], ['Forte', true, 0.25, 1], ['Robô', true, 0, 1],
  ];
  const tuneAtual = !take.tune.ligado ? 0 : take.tune.velocidade <= 0.05 ? 3 : take.tune.intensidade < 0.8 ? 1 : 2;
  const niveisDeTune = h('div', { className: 'abas' }, ...NIVEIS_DE_TUNE.map(([rotulo, ligado, velocidade, intensidade], i) =>
    botao(rotulo, () => {
      take.tune = { ligado, velocidade, intensidade };
      mudou();
      desenharVozes();
      void reafinar(take).then(reiniciarSeTocando);
    }, i === tuneAtual ? 'ativo' : ''),
  ));
  const distancia = deslizante('Perto ↔ longe', 0, 1, 0.01, Math.min(1, Math.max(0, (take.reverb - 0.02) / 0.5)), (v) => {
    take.reverb = 0.02 + v * 0.5;
    take.tamanhoReverb = v < 0.34 ? 'quarto' : v < 0.67 ? 'sala' : 'salao';
  });
  const eco = deslizante('Seca ↔ com eco', 0, 1, 0.01, Math.min(1, take.delay / 0.5), (v) => {
    take.delay = v * 0.5;
    take.repeticoes = 0.2 + v * 0.4;
  });

  const contexto = {
    projeto: estado.projeto, engine,
    reprocessar: (t: Take) => void reafinar(t),
    redesenhar: () => {
      mudou();
      desenharVozes();
    },
    aCadaQuadro: (fn: () => void) => estado.quadrosDaVoz.push(fn),
  };

  secVozes.replaceChildren(
    h('h2', {}, 'Voz'),
    h('div', { className: 'abas' }, ...estado.projeto.takes.map((t) => botao(t.nome, () => {
      estado.takeAberto = t.id;
      desenharVozes();
    }, t.id === take.id ? 'ativo' : ''))),
    h('div', { className: 'linha' }, nome, mudo, apagar),
    onda(take),
    h('div', { className: 'linha' }, comparar, botao('Conferir equilíbrio voz × beat', () => void conferirEquilibrio())),
    h('div', { className: 'linha' },
      presets(take),
      Object.assign(botao('Ajustar ao meu take', () => ajustarAoTake(take), 'principal'), { title: 'Mede esta gravação e regula equalizador, compressor e limpeza para ela' }),
      botao('Principal', () => definirPapel(take, 'principal')),
      botao('Dobra', () => definirPapel(take, 'dobra')),
      botao('Adlib', () => definirPapel(take, 'adlib')),
      av(botao('Exportar como vinheta', () => void exportarVinheta(take))),
    ),

    // Tela simples: poucas decisões, por intenção.
    so(seletor<PresetVoz>('Timbre', opcoes(PRESETS_VOZ, (k) => PRESETS_VOZ[k].nome), take.preset, (v) => {
      aplicarTimbre(take, v);
      desenharVozes();
    })),
    so(campo('Afinação', niveisDeTune)),
    so(h('div', { className: 'linha' }, distancia, eco, deslizante('Volume', 0, 1.5, 0.01, take.volume, (v) => { take.volume = v; }))),
    so(explicacao([
      ...PRESETS_VOZ[take.preset].explicacao,
      'Afinação: "Leve" só aproxima das notas certas; "Forte" corrige tudo sem soar artificial; "Robô" é o efeito marcante do trap e do plug.',
      'Perto ↔ longe controla o reverb, que simula um ambiente. Seca ↔ com eco controla o delay, que repete a voz no tempo do beat.',
      'Em "Mostrar tudo" cada ferramenta tem a sua tela: equalizador, compressor, limpeza de ruído, edição do take e mais.',
    ])),

    // Tela completa: uma tela por ferramenta.
    h('h3', {}, 'Cadeia de efeitos'),
    h('p', { className: 'nota' }, 'A voz passa pelos pedais da esquerda para a direita. Gire os botões, pise na chave de baixo para ligar e desligar, e toque no nome do pedal para o ajuste fino.'),
    pedaleira(take, contexto, (tela) => {
      estado.telaAberta = tela;
      if (estado.telaSimples) trocarTela();
      else desenharVozes();
      document.querySelector('.abas.telas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
    av(h('div', { className: 'abas telas' }, ...TELAS.map((t) => botao(t, () => {
      estado.telaAberta = t;
      desenharVozes();
    }, t === estado.telaAberta ? 'ativo' : '')))),
    av(telaDeEfeito(estado.telaAberta, take, contexto)),
    ...(estado.projeto.takes.length > 1 ? [av(h('h3', {}, 'Montagem: o melhor de cada take')), av(montagem())] : []),
  );
}
