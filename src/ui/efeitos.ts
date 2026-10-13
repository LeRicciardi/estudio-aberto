// Telas de efeito de um take de voz, uma por ferramenta, no formato de um
// aparelho com botões giratórios: afinação, equalizador, compressor, espaço,
// caráter, limpeza e edição.
import { PRESETS_VOZ, TAMANHOS_DE_REVERB, aplicarTimbre, curvaDoEq } from '../engine/vocalChain.ts';
import { type DivisaoDelay, NOTAS, type PresetVoz, type Project, type Take, type TamanhoReverb } from '../model/project.ts';
import { botao, chave, explicacao, giratorio, h, numero, opcoes, seletor } from './controles.ts';

import type { Engine } from '../engine/engine.ts';

export const TELAS = ['Afinação', 'Equalizador', 'Compressor', 'Espaço', 'Caráter', 'Limpeza', 'Edição'] as const;
export type Tela = (typeof TELAS)[number];

export interface Contexto {
  projeto: Project;
  engine: Engine;
  /** Refaz o processamento prévio do take (afinação e limpeza). */
  reprocessar(take: Take): void;
  /** Redesenha a página de efeitos. */
  redesenhar(): void;
  /** Registra algo para atualizar a cada quadro da tela (medidores). */
  aCadaQuadro(fn: () => void): void;
}

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Moldura de aparelho: barra de título e corpo. */
function aparelho(titulo: string, ...corpo: (Node | string)[]): HTMLElement {
  return h('div', { className: 'aparelho' }, h('div', { className: 'aparelho-titulo' }, titulo), h('div', { className: 'aparelho-corpo' }, ...corpo));
}

const fileira = (...itens: (Node | string)[]) => h('div', { className: 'fileira' }, ...itens);

function afinacao(take: Take, c: Contexto): HTMLElement {
  const refazer = () => c.reprocessar(take);
  return aparelho('Afinação (tune)',
    fileira(
      chave('Tune', take.tune.ligado, (v) => {
        take.tune.ligado = v;
        refazer();
        c.redesenhar();
      }),
      giratorio({ rotulo: 'Velocidade', min: 0, max: 1, valor: take.tune.velocidade, padrao: 0.2, formato: (v) => (v < 0.05 ? 'Robô' : v > 0.7 ? 'Natural' : pct(v)), aoMudar: (v) => { take.tune.velocidade = v; }, aoSoltar: refazer }),
      giratorio({ rotulo: 'Correção', min: 0, max: 1, valor: take.tune.intensidade, padrao: 1, formato: pct, aoMudar: (v) => { take.tune.intensidade = v; }, aoSoltar: refazer }),
      giratorio({ rotulo: 'Altura', min: -12, max: 12, passo: 1, valor: take.altura, padrao: 0, formato: (v) => `${v > 0 ? '+' : ''}${v} st`, aoMudar: (v) => { take.altura = v; }, aoSoltar: refazer }),
    ),
    h('p', { className: 'nota' }, `Afinando para ${NOTAS[c.projeto.tom]} ${c.projeto.escala}, o tom definido em "Estilo".`),
    explicacao([
      'O tune puxa cada nota cantada para a nota mais próxima da escala da música.',
      'Velocidade: em "Robô" a voz pula direto para a nota, o efeito marcante do trap e do plug. Em "Natural" ela desliza e quase não se percebe.',
      'Correção: 100% leva até a nota exata; menos que isso só aproxima, preservando o jeito de cantar.',
      'Altura: sobe ou desce a voz inteira em semitons (st), sem mudar a velocidade. +12 é uma oitava acima. Funciona com o tune desligado.',
    ]),
  );
}

function equalizador(take: Take, c: Contexto): HTMLElement {
  const tela = h('canvas', { className: 'curva', width: 720, height: 200 });
  const N = 240;
  const frequencias = new Float32Array(N).map((_, i) => 20 * 1000 ** (i / (N - 1)));
  const desenhar = () => {
    const g = tela.getContext('2d');
    if (!g) return;
    const { width: W, height: H } = tela;
    const y = (ganho: number) => H / 2 - (ganho / 18) * (H / 2);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = '#3a424b';
    g.fillStyle = '#7d8793';
    g.font = '11px system-ui';
    g.lineWidth = 1;
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = (Math.log(f / 20) / Math.log(1000)) * W;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
      g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 3, H - 4);
    }
    for (const ganho of [-12, 0, 12]) {
      g.beginPath();
      g.moveTo(0, y(ganho));
      g.lineTo(W, y(ganho));
      g.stroke();
      g.fillText(`${ganho > 0 ? '+' : ''}${ganho}`, 3, y(ganho) - 3);
    }
    const curva = curvaDoEq(c.engine.ctx, take, frequencias);
    g.strokeStyle = '#ff9d2e';
    g.lineWidth = 2;
    g.beginPath();
    curva.forEach((ganho, i) => {
      const x = (i / (N - 1)) * W;
      if (i) g.lineTo(x, y(Math.max(-18, ganho)));
      else g.moveTo(x, y(Math.max(-18, ganho)));
    });
    g.stroke();
  };
  desenhar();
  const banda = (rotulo: string, chaveDaBanda: 'graveDb' | 'medioDb' | 'arDb') =>
    giratorio({ rotulo, min: -12, max: 12, valor: take.eq[chaveDaBanda], padrao: 0, formato: db, aoMudar: (v) => { take.eq[chaveDaBanda] = v; desenhar(); } });
  return aparelho('Equalizador',
    tela,
    fileira(
      giratorio({ rotulo: 'Corte de graves', min: 20, max: 400, log: true, valor: Math.max(20, take.eq.corte), padrao: 90, formato: hz, aoMudar: (v) => { take.eq.corte = v; desenhar(); } }),
      banda('Corpo (200 Hz)', 'graveDb'),
      giratorio({ rotulo: 'Presença: onde', min: 300, max: 8000, log: true, valor: take.eq.medioHz, padrao: 3500, formato: hz, aoMudar: (v) => { take.eq.medioHz = v; desenhar(); } }),
      banda('Presença: quanto', 'medioDb'),
      banda('Ar (9 kHz)', 'arDb'),
    ),
    explicacao([
      'O equalizador aumenta ou diminui faixas de grave, médio e agudo. A curva mostra o resultado: acima da linha do meio está reforçando, abaixo está cortando.',
      'Corte de graves: remove tudo abaixo da frequência escolhida. Tira ronco e batida de microfone, que brigam com o 808.',
      'Corpo: o peso da voz. Demais deixa abafada; de menos, fina.',
      'Presença: a região que deixa a letra inteligível. Escolha onde e quanto.',
      'Ar: o brilho no topo. Deixa a voz "cara" e arejada, mas realça os "s".',
      'Cortar costuma soar mais natural do que reforçar.',
    ]),
  );
}

function compressor(take: Take, c: Contexto): HTMLElement {
  const barra = h('div', { className: 'reducao' }, h('div'));
  const leitura = h('span', { className: 'nota' }, '0 dB');
  c.aCadaQuadro(() => {
    const r = c.engine.tocando ? c.engine.mixer.reducaoDb(take.id) : 0;
    (barra.firstElementChild as HTMLElement).style.width = `${Math.min(100, (-r / 24) * 100)}%`;
    leitura.textContent = `${r.toFixed(1)} dB`;
  });
  const k = take.comp;
  return aparelho('Compressor',
    h('div', { className: 'linha' }, h('span', { className: 'nota' }, 'Redução agora'), barra, leitura),
    fileira(
      giratorio({ rotulo: 'Limiar', min: -60, max: 0, valor: k.limiar, padrao: -22, formato: (v) => `${v.toFixed(0)} dB`, aoMudar: (v) => { k.limiar = v; } }),
      giratorio({ rotulo: 'Razão', min: 1, max: 20, valor: k.razao, padrao: 4, formato: (v) => `${v.toFixed(1)}:1`, aoMudar: (v) => { k.razao = v; } }),
      giratorio({ rotulo: 'Ataque', min: 1, max: 100, log: true, valor: k.ataque, padrao: 5, formato: (v) => `${v.toFixed(0)} ms`, aoMudar: (v) => { k.ataque = v; } }),
      giratorio({ rotulo: 'Soltura', min: 20, max: 500, log: true, valor: k.soltura, padrao: 120, formato: (v) => `${v.toFixed(0)} ms`, aoMudar: (v) => { k.soltura = v; } }),
      giratorio({ rotulo: 'Ganho', min: 0, max: 18, valor: k.ganho, padrao: 0, formato: db, aoMudar: (v) => { k.ganho = v; } }),
    ),
    fileira(
      chave('Compressão dupla', !!k.dupla, (v) => {
        k.dupla = v;
        c.redesenhar();
      }),
      giratorio({ rotulo: 'Paralela', min: 0, max: 1, valor: k.paralela ?? 0, padrao: 0, formato: pct, aoMudar: (v) => { k.paralela = v; } }),
    ),
    explicacao([
      'O compressor abaixa as partes mais altas da voz, aproximando o volume das fracas e das fortes. Assim a voz não some no beat nem estoura.',
      'Limiar: a partir de que volume ele começa a agir. Mais baixo, age em mais trechos.',
      'Razão: o quanto ele segura. 2:1 é suave; 4:1 é o comum em rap; 8:1 ou mais deixa a voz "parada no lugar".',
      'Ataque: quanto demora para agir. Rápido segura as consoantes; lento deixa o começo das palavras bater.',
      'Soltura: quanto demora para soltar depois que o volume cai.',
      'Compressão dupla: liga um segundo compressor, lento, depois do primeiro. O primeiro segura os picos e o segundo alisa o volume geral; dois agindo pouco soam mais naturais que um agindo muito.',
      'Paralela: mistura por baixo uma cópia bem esmagada da voz. Dá corpo e constância sem tirar a vida da voz original. De 20 a 30% é o usual.',
      'Ganho: devolve o volume perdido na compressão. Use a barra de redução como guia: 3 a 8 dB nas partes altas é um bom ponto de partida.',
    ]),
  );
}

function espaco(take: Take, c: Contexto): HTMLElement {
  return aparelho('Espaço: reverb, delay e dobra',
    fileira(
      giratorio({ rotulo: 'Reverb', min: 0, max: 0.8, valor: take.reverb, padrao: 0.1, formato: pct, aoMudar: (v) => { take.reverb = v; } }),
      seletor<TamanhoReverb>('Tamanho do ambiente', opcoes(TAMANHOS_DE_REVERB, (t) => TAMANHOS_DE_REVERB[t].nome), take.tamanhoReverb, (v) => { take.tamanhoReverb = v; }),
    ),
    fileira(
      giratorio({ rotulo: 'Delay', min: 0, max: 0.8, valor: take.delay, padrao: 0, formato: pct, aoMudar: (v) => { take.delay = v; } }),
      giratorio({ rotulo: 'Repetições', min: 0, max: 0.75, valor: take.repeticoes, padrao: 0.35, formato: pct, aoMudar: (v) => { take.repeticoes = v; } }),
      seletor<DivisaoDelay>('Tempo do eco', [[4, '1 batida'], [8, '1/2 batida'], [16, '1/4 de batida']], take.divisaoDelay, (v) => { take.divisaoDelay = v; }),
    ),
    fileira(
      chave('Eco só no fim da frase', !!take.ecoNoFim, (v) => {
        take.ecoNoFim = v;
        c.redesenhar();
      }),
      giratorio({ rotulo: 'Dobra estéreo', min: 0, max: 1, valor: take.dobra, padrao: 0, formato: pct, aoMudar: (v) => { take.dobra = v; } }),
    ),
    fileira(
      giratorio({ rotulo: 'Harmonia', min: 0, max: 1, valor: take.harmonia?.quanto ?? 0, padrao: 0, formato: (v) => (v === 0 ? 'Desligada' : pct(v)), aoMudar: (v) => { take.harmonia = { graus: take.harmonia?.graus ?? 2, quanto: v }; }, aoSoltar: () => c.reprocessar(take) }),
      seletor('Voz da harmonia', [[2, 'Terça acima'], [-2, 'Terça abaixo'], [4, 'Quinta acima'], [-3, 'Quarta abaixo'], [7, 'Oitava acima']] as [number, string][], take.harmonia?.graus ?? 2, (v) => {
        take.harmonia = { quanto: take.harmonia?.quanto ?? 0, graus: v };
        c.reprocessar(take);
      }),
    ),
    explicacao([
      'Reverb simula o som de um ambiente. Quarto deixa a voz próxima; salão deixa distante e grandiosa. Em excesso, embola a letra.',
      'Delay repete a voz em eco, no tempo do beat. "Repetições" define quantas vezes o eco volta antes de sumir.',
      'Eco só no fim da frase: o delay fica fechado e abre apenas na última palavra de cada frase, que ecoa no espaço seguinte. É uma assinatura do trap; o botão Delay define a força.',
      'Harmonia cria uma segunda voz a partir da sua, cantando outras notas da mesma escala. Uma terça acima, baixinha, enche um refrão.',
      'Dobra estéreo cria duas cópias levemente atrasadas da voz, uma de cada lado. A voz fica larga, como se tivesse sido gravada mais de uma vez. Boa em refrões.',
    ]),
  );
}

function carater(take: Take, c: Contexto): HTMLElement {
  return aparelho('Caráter: timbre e distorção',
    fileira(
      seletor<PresetVoz>('Timbre de partida', opcoes(PRESETS_VOZ, (p) => PRESETS_VOZ[p].nome), take.preset, (v) => {
        aplicarTimbre(take, v);
        c.redesenhar();
      }),
      giratorio({ rotulo: 'Distorção', min: 0, max: 1, valor: take.distorcao, padrao: 0, formato: pct, aoMudar: (v) => { take.distorcao = v; } }),
      chave('Voz de telefone', take.telefone, (v) => {
        take.telefone = v;
        c.redesenhar();
      }),
    ),
    h('p', { className: 'nota' }, 'Escolher um timbre preenche o equalizador, o compressor, o reverb e o delay com os valores daquele estilo. Depois é só afinar nas outras telas.'),
    explicacao([
      ...PRESETS_VOZ[take.preset].explicacao,
      'Distorção deixa a voz áspera e agressiva, como no hard e no trash.',
      'Voz de telefone corta graves e agudos, um efeito comum em intros e respostas.',
    ]),
  );
}

function limpeza(take: Take, c: Contexto): HTMLElement {
  const refazer = () => c.reprocessar(take);
  const l = take.limpeza;
  return aparelho('Limpeza: ruído e sibilância',
    fileira(
      chave('Gate', l.gate < 0, (v) => {
        l.gate = v ? -45 : 0;
        refazer();
        c.redesenhar();
      }),
      l.gate < 0
        ? giratorio({ rotulo: 'Limiar do gate', min: -70, max: -20, valor: l.gate, padrao: -45, formato: (v) => `${v.toFixed(0)} dB`, aoMudar: (v) => { l.gate = v; }, aoSoltar: refazer })
        : '',
      giratorio({ rotulo: 'De-esser', min: 0, max: 1, valor: l.deEsser, padrao: 0, formato: (v) => (v === 0 ? 'Desligado' : pct(v)), aoMudar: (v) => { l.deEsser = v; }, aoSoltar: refazer }),
    ),
    fileira(
      giratorio({ rotulo: 'Redução de ruído', min: 0, max: 1, valor: l.ruido ?? 0, padrao: 0, formato: (v) => (v === 0 ? 'Desligada' : pct(v)), aoMudar: (v) => { l.ruido = v; }, aoSoltar: refazer }),
      giratorio({ rotulo: 'Nivelar frases', min: 0, max: 1, valor: l.nivelar ?? 0, padrao: 0, formato: (v) => (v === 0 ? 'Desligado' : pct(v)), aoMudar: (v) => { l.nivelar = v; }, aoSoltar: refazer }),
    ),
    explicacao([
      'Gate: abafa o que sobra entre as frases, como chiado, ventilador e barulho de casa. Suba o limiar até o ruído sumir; se começar a comer o fim das palavras, baixe um pouco.',
      'De-esser: segura os "s" e "ch" quando ficam ardidos, sem escurecer o resto da voz. Costuma ser necessário depois de aumentar o "Ar" no equalizador.',
      'Redução de ruído: tira o chiado contínuo que fica por baixo da voz (ventilador, ruído do celular). Use o mínimo que resolver; em excesso a voz fica "aguada".',
      'Nivelar frases: mede o volume de cada frase e aproxima todas do volume típico, como um engenheiro faz à mão antes de comprimir. Assim o compressor trabalha menos e soa mais natural.',
      'A limpeza é aplicada antes do tune e dos outros efeitos, nesta ordem: ruído, gate, nivelamento, de-esser.',
    ]),
  );
}

function edicao(take: Take, c: Contexto): HTMLElement {
  const duracao = c.engine.buffers.get(take.audioId)?.duration ?? 0;
  const e = take.edicao;
  const limite = Math.max(0, duracao - 0.1);
  return aparelho('Edição do take',
    fileira(
      numero('Começo na música (s)', -5, 3600, Number(take.inicio.toFixed(3)), (v) => { take.inicio = v; c.redesenhar(); }, 0.005),
      numero('Aparar o começo (s)', 0, limite, Number(e.ini.toFixed(2)), (v) => { e.ini = Math.min(v, limite - e.fim); c.redesenhar(); }, 0.05),
      numero('Aparar o fim (s)', 0, limite, Number(e.fim.toFixed(2)), (v) => { e.fim = Math.min(v, limite - e.ini); c.redesenhar(); }, 0.05),
    ),
    fileira(
      giratorio({ rotulo: 'Entrada suave', min: 0, max: 2, valor: e.fadeIn, padrao: 0, formato: (v) => `${v.toFixed(2)} s`, aoMudar: (v) => { e.fadeIn = v; } }),
      giratorio({ rotulo: 'Saída suave', min: 0, max: 2, valor: e.fadeOut, padrao: 0, formato: (v) => `${v.toFixed(2)} s`, aoMudar: (v) => { e.fadeOut = v; } }),
      giratorio({ rotulo: 'Ganho da gravação', min: -12, max: 12, valor: e.ganhoDb, padrao: 0, formato: db, aoMudar: (v) => { e.ganhoDb = v; } }),
      botao('Desfazer a edição', () => {
        take.edicao = { ini: 0, fim: 0, fadeIn: 0, fadeOut: 0, ganhoDb: 0 };
        c.redesenhar();
      }),
    ),
    explicacao([
      'Começo na música: move o take inteiro para antes ou depois. Use para corrigir voz adiantada ou atrasada.',
      'Aparar: esconde o início ou o fim da gravação, como respiração, tosse ou silêncio. Nada é apagado; é só zerar para voltar.',
      'Entrada e saída suaves: o volume sobe ou desce aos poucos nas pontas, em vez de entrar e cortar de uma vez.',
      'Ganho da gravação: corrige uma gravação que ficou baixa ou alta, antes de qualquer efeito. É diferente do volume no mixer, que vem depois.',
    ]),
  );
}

/** A tela de efeito escolhida para um take. */
export function telaDeEfeito(tela: Tela, take: Take, c: Contexto): HTMLElement {
  switch (tela) {
    case 'Afinação': return afinacao(take, c);
    case 'Equalizador': return equalizador(take, c);
    case 'Compressor': return compressor(take, c);
    case 'Espaço': return espaco(take, c);
    case 'Caráter': return carater(take, c);
    case 'Limpeza': return limpeza(take, c);
    case 'Edição': return edicao(take, c);
  }
}
