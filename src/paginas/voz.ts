// Página Voz: escolha do take, telas de efeito e processamento prévio.

import { exportarMix } from '../engine/engine.ts';
import { processarEmSegundoPlano } from '../engine/tuneClient.ts';
import { PRESETS_VOZ, aplicarTimbre } from '../engine/vocalChain.ts';
import { afinadoCom, av, engine, estado, mudou, projetoParaTocar, so } from '../estado.ts';
import { NOTAS, type PresetVoz, type Take, usaProcessamento, usaTune } from '../model/project.ts';
import { avisar, secVozes } from '../moldura.ts';
import { reiniciarSeTocando } from '../transporte.ts';
import { botao, campo, deslizante, explicacao, h, opcoes, seletor } from '../ui/controles.ts';
import { TELAS, telaDeEfeito } from '../ui/efeitos.ts';
import { desenharGravar } from './gravar.ts';
import { desenharMixer } from './mixer.ts';
import { montagem } from './montagem.ts';
import { onda } from './onda.ts';

/** Refaz o processamento prévio de um take: limpeza (gate, de-esser) e afinação. */
export async function reafinar(take: Take) {
  const chave = take.audioId + ':tune';
  const original = engine.buffers.get(take.audioId);
  if (!usaProcessamento(take) || !original) return;
  // Com o tune desligado, só a mudança de altura é aplicada (intensidade 0).
  const intensidade = take.tune.ligado ? take.tune.intensidade : 0;
  const tune = usaTune(take)
    ? { tom: estado.projeto.tom, escala: estado.projeto.escala, velocidade: take.tune.velocidade, intensidade, transpor: take.altura }
    : undefined;
  const ajustes = JSON.stringify([tune, take.limpeza]);
  if (afinadoCom.get(take.audioId) === ajustes && engine.buffers.has(chave)) return;
  avisar(`Processando ${take.nome}...`);
  const pronto = await processarEmSegundoPlano(original.getChannelData(0), original.sampleRate, { gate: take.limpeza.gate, deEsser: take.limpeza.deEsser, tune });
  const buffer = engine.ctx.createBuffer(1, pronto.length, original.sampleRate);
  buffer.copyToChannel(pronto, 0);
  engine.buffers.set(chave, buffer);
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
    av(h('div', { className: 'abas telas' }, ...TELAS.map((t) => botao(t, () => {
      estado.telaAberta = t;
      desenharVozes();
    }, t === estado.telaAberta ? 'ativo' : '')))),
    av(telaDeEfeito(estado.telaAberta, take, contexto)),
    ...(estado.projeto.takes.length > 1 ? [av(h('h3', {}, 'Montagem: o melhor de cada take')), av(montagem())] : []),
  );
}
