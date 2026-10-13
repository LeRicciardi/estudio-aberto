// Página Notas: 808 e melodia em grade de notas.

import { INSTRUMENTOS, SINTETIZADOR_PADRAO } from '../engine/synths.ts';
import { fatiar } from '../engine/tempo-e-fatias.ts';
import { engine, estado, id, mudou } from '../estado.ts';
import { tocarGrau } from '../midi.ts';
import { type InstrumentoId, LINHAS, NOTAS, type Padrao, type Sintetizador, nomeDoGrau, passosDoPadrao } from '../model/project.ts';
import { avisar, secNotas } from '../moldura.ts';
import { guardarAudio } from '../storage.ts';
import { botao, campo, deslizante, explicacao, giratorio, h, opcoes, seletor } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';
import { abasDePadrao, dimensionar, gradeDeNotas, pintavel } from './grades.ts';

/** Trocar o 808 sintetizado por um sample do usuário, afinado pela nota em que foi gravado. */
export function sample808(): HTMLElement {
  const atual = estado.projeto.sample808;
  const arquivo = h('input', { type: 'file', accept: 'audio/*', ariaLabel: 'Sample de 808' });
  arquivo.onchange = async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    try {
      const buffer = await engine.ctx.decodeAudioData(await f.arrayBuffer());
      if (buffer.duration > 10) return avisar('Esse arquivo é longo demais para um 808 (máximo de 10 segundos).');
      const audioId = id();
      engine.buffers.set(audioId, buffer);
      estado.projeto.sample808 = { audioId, nome: f.name, nota: 0 };
      mudou();
      desenharBeat();
      await guardarAudio(audioId, { tipo: 'arquivo', blob: f });
    } catch {
      avisar('Não consegui ler esse arquivo de áudio.');
    }
  };
  return h('details', { className: 'explica' },
    h('summary', {}, atual ? `Usando meu 808: ${atual.nome}` : 'Usar meu sample de 808'),
    h('p', {}, 'Escolha um 808 de um pack seu e informe em que nota ele foi gravado (costuma vir no nome do arquivo, como "808 C" ou "808 F#"). O estúdio toca o sample mais rápido ou mais devagar para chegar em cada nota da grade.'),
    atual
      ? h('div', { className: 'linha' },
          seletor('Nota do sample', NOTAS.map((n, i) => [i, n] as [number, string]), atual.nota, (v) => { atual.nota = v; }),
          botao('Voltar ao 808 do kit', () => {
            delete estado.projeto.sample808;
            mudou();
            desenharBeat();
          }),
        )
      : arquivo,
  );
}

const ACORDES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
let acordeEscolhido = 0;
let tempoEscolhido = 0;

/** Escreve um acorde (três notas, pulando uma linha entre elas) em um tempo do padrão. */
function acordes(padrao: Padrao): HTMLElement {
  const tempos = passosDoPadrao(padrao) / 4;
  tempoEscolhido = Math.min(tempoEscolhido, tempos - 1);
  return h('div', { className: 'linha' },
    seletor('Acorde', ACORDES.map((nome, i) => [i, `${nome} (${nomeDoGrau(i, estado.projeto.tom, estado.projeto.escala)})`] as [number, string]), acordeEscolhido, (v) => { acordeEscolhido = v; }),
    seletor('No tempo', Array.from({ length: tempos }, (_, i) => [i, `${Math.floor(i / 4) + 1}.${(i % 4) + 1}`] as [number, string]), tempoEscolhido, (v) => { tempoEscolhido = v; }),
    botao('Escrever acorde', () => {
      const s = tempoEscolhido * 4;
      for (const linha of padrao.melodia) linha[s] = false;
      // Tônica, terça e quinta do acorde; o que passar da última linha desce uma oitava.
      for (const salto of [0, 2, 4]) padrao.melodia[(acordeEscolhido + salto) % 7][s] = true;
      mudou();
      desenharBeat();
    }),
    explicacao([
      'Um acorde são três notas da escala tocadas juntas, pulando uma entre elas. O número romano diz em que nota da escala ele começa.',
      'Em tom menor, I, VI, III e VII (nessa ordem, um por compasso) formam a progressão mais usada no trap e no R&B. Em tom maior, experimente I, V, VI, IV.',
    ]),
  );
}

let modoDeCorte: 'ataques' | 'grade' = 'ataques';
let quantasFatias = 8;

/**
 * Prepara o loop do sampler: cria a versão invertida e recalcula os cortes.
 * Chamado ao importar, ao mudar o jeito de cortar e ao reabrir o projeto.
 */
export function prepararSampler(recortar: boolean) {
  const sp = estado.projeto.sampler;
  const original = engine.buffers.get(sp?.audioId ?? '');
  if (!sp || !original) return;
  const invertido = engine.ctx.createBuffer(original.numberOfChannels, original.length, original.sampleRate);
  for (let c = 0; c < original.numberOfChannels; c++) invertido.copyToChannel(original.getChannelData(c).slice().reverse(), c);
  engine.buffers.set(sp.audioId + ':inv', invertido);
  if (recortar) sp.cortes = fatiar((sp.invertido ? invertido : original).getChannelData(0), original.sampleRate, quantasFatias, modoDeCorte);
}

/** Sampler: um loop importado vira fatias, e a grade diz qual fatia toca em cada passo. */
function sampler(padrao: Padrao): HTMLElement {
  const sp = estado.projeto.sampler;
  const ajuda = explicacao([
    'Sampler é a base do boombap e de muito trap: pegar um trecho de música (um loop), cortar em pedaços e tocar os pedaços em outra ordem.',
    'Cortar por ataques põe cada corte onde uma nota ou batida começa; por grade, divide o loop em partes iguais.',
    'Cada linha da grade é uma fatia. A fatia toca do corte dela até o próximo. Clique no nome para ouvir.',
    'Altura sobe ou desce o loop inteiro, mudando também a velocidade, como num toca-discos. Invertido toca de trás para a frente.',
    'Só use loops que você tem direito de usar: sample sem autorização pode derrubar a música das plataformas.',
  ]);
  if (!sp) {
    const arquivo = h('input', { type: 'file', accept: 'audio/*' });
    arquivo.onchange = async () => {
      const f = arquivo.files?.[0];
      if (!f) return;
      try {
        const buffer = await engine.ctx.decodeAudioData(await f.arrayBuffer());
        if (buffer.duration > 60) return avisar('Loop longo demais para o sampler (máximo de 60 segundos).');
        const audioId = id();
        engine.buffers.set(audioId, buffer);
        estado.projeto.sampler = { audioId, nome: f.name, cortes: [], altura: 0, invertido: false, volume: 0.8 };
        prepararSampler(true);
        mudou();
        desenharBeat();
        await guardarAudio(audioId, { tipo: 'arquivo', blob: f });
      } catch {
        avisar('Não consegui ler esse arquivo de áudio.');
      }
    };
    return h('div', {}, campo('Loop para fatiar (um trecho de música, de até 60 s)', arquivo), ajuda);
  }
  const passos = passosDoPadrao(padrao);
  const fatias = (padrao.fatias ??= Array<number>(passos).fill(-1));
  const grade = h('div', { className: 'grade notas' });
  dimensionar(grade, passos);
  const botoes: HTMLButtonElement[][] = [];
  const pintar = () => botoes.forEach((linha, f) => linha.forEach((b, s) => b.classList.toggle('ligado', fatias[s] === f)));
  const loop = engine.buffers.get(sp.audioId + (sp.invertido ? ':inv' : ''));
  sp.cortes.forEach((corte, f) => {
    const ouvir = botao(`Fatia ${f + 1}`, () => {
      if (!loop) return;
      void engine.ctx.resume();
      const fonte = engine.ctx.createBufferSource();
      fonte.buffer = loop;
      fonte.playbackRate.value = 2 ** (sp.altura / 12);
      fonte.connect(engine.mixer.barraMelodia);
      fonte.start(0, corte, (sp.cortes[f + 1] ?? loop.duration) - corte);
    }, 'nome-da-fatia');
    grade.append(ouvir);
    botoes[f] = [];
    for (let s = 0; s < passos; s++) {
      const b = h('button', { className: 'passo' + (s % 16 === 0 ? ' tempo-forte compasso-novo' : s % 4 === 0 ? ' tempo-forte' : ''), ariaLabel: `Fatia ${f + 1}, passo ${s + 1}` });
      pintavel(grade, b, () => (fatias[s] === f ? 0 : 1), (v) => {
        if (v) fatias[s] = f;
        else if (fatias[s] === f) fatias[s] = -1;
        pintar();
      });
      botoes[f][s] = b;
      estado.colunas[s]?.push(b);
      grade.append(b);
    }
  });
  pintar();
  const invertido = h('input', { type: 'checkbox', checked: sp.invertido });
  invertido.onchange = () => {
    sp.invertido = invertido.checked;
    prepararSampler(true);
    mudou();
    desenharBeat();
  };
  const recortar = () => {
    prepararSampler(true);
    for (const pad of estado.projeto.padroes) pad.fatias = pad.fatias?.map((f) => (f >= sp.cortes.length ? -1 : f));
    desenharBeat();
  };
  return h('div', {},
    h('p', { className: 'nota' }, `Loop: ${sp.nome}`),
    h('div', { className: 'linha' },
      seletor<'ataques' | 'grade'>('Cortar por', [['ataques', 'Ataques (onde cada som começa)'], ['grade', 'Grade (partes iguais)']], modoDeCorte, (v) => {
        modoDeCorte = v;
        recortar();
      }),
      seletor('Fatias', [[4, '4'], [8, '8'], [12, '12'], [16, '16']] as [number, string][], quantasFatias, (v) => {
        quantasFatias = v;
        recortar();
      }),
      deslizante('Altura (semitons)', -12, 12, 1, sp.altura, (v) => { sp.altura = v; }),
      deslizante('Volume', 0, 1.5, 0.01, sp.volume, (v) => { sp.volume = v; }),
      h('label', { className: 'caixa' }, invertido, 'Invertido'),
      botao('Tirar o sampler', () => {
        delete estado.projeto.sampler;
        for (const pad of estado.projeto.padroes) delete pad.fatias;
        mudou();
        desenharBeat();
      }, 'perigo'),
    ),
    h('div', { className: 'rolagem' }, grade),
    ajuda,
  );
}

let tecladoNoBaixo = false;

/** Teclado na tela: só as notas da escala, para tocar com o dedo ou o mouse. */
function teclado(): HTMLElement {
  const teclas = Array.from({ length: LINHAS }, (_, grau) => {
    const tecla = h('button', { className: 'tecla' + (grau % 7 === 0 ? ' tonica' : '') }, nomeDoGrau(grau, estado.projeto.tom, estado.projeto.escala));
    tecla.onpointerdown = (e) => {
      e.preventDefault();
      tocarGrau(grau, tecladoNoBaixo);
    };
    return tecla;
  });
  return h('div', {},
    h('div', { className: 'abas' },
      botao('Tocar a melodia', () => { tecladoNoBaixo = false; desenharBeat(); }, tecladoNoBaixo ? '' : 'ativo'),
      botao('Tocar o 808', () => { tecladoNoBaixo = true; desenharBeat(); }, tecladoNoBaixo ? 'ativo' : ''),
    ),
    h('div', { className: 'teclado' }, ...teclas),
    h('p', { className: 'nota' }, 'Toque para ouvir. Com o padrão tocando em repetição (modo PAD), o que você tocar é escrito na grade.'),
  );
}

/** Painel do sintetizador próprio: forma de onda, oitava, filtro e envelope. */
function painelDoSintetizador(): HTMLElement {
  const s = (estado.projeto.sintetizador ??= { ...SINTETIZADOR_PADRAO });
  const ms = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`);
  return h('div', { className: 'aparelho' },
    h('div', { className: 'aparelho-titulo' }, 'Meu sintetizador'),
    h('div', { className: 'aparelho-corpo' },
      h('div', { className: 'fileira' },
        seletor<Sintetizador['onda']>('Forma de onda', [['sine', 'Seno (puro)'], ['triangle', 'Triângulo (suave)'], ['sawtooth', 'Serra (cheio)'], ['square', 'Quadrada (oca)']], s.onda, (v) => { s.onda = v; }),
        giratorio({ rotulo: 'Oitava', min: -2, max: 2, passo: 1, valor: s.oitava, padrao: 0, formato: (v) => `${v > 0 ? '+' : ''}${v}`, aoMudar: (v) => { s.oitava = v; } }),
        giratorio({ rotulo: 'Desafinar', min: 0, max: 40, valor: s.desafinar, padrao: 8, formato: (v) => `${v.toFixed(0)} cents`, aoMudar: (v) => { s.desafinar = v; } }),
        giratorio({ rotulo: 'Filtro', min: 200, max: 12000, log: true, valor: s.filtro, padrao: 2500, formato: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`), aoMudar: (v) => { s.filtro = v; } }),
        giratorio({ rotulo: 'Ataque', min: 0.003, max: 1, log: true, valor: s.ataque, padrao: 0.01, formato: ms, aoMudar: (v) => { s.ataque = v; } }),
        giratorio({ rotulo: 'Soltura', min: 0.05, max: 3, log: true, valor: s.soltura, padrao: 0.4, formato: ms, aoMudar: (v) => { s.soltura = v; } }),
      ),
      explicacao([
        'Quase todo sintetizador funciona assim: uma onda cheia de harmônicos passa por um filtro que tira agudos, e um envelope diz como a nota entra e some.',
        'Forma de onda: seno é puro, sem brilho; serra é cheia e brilhante; quadrada soa oca, como jogo antigo.',
        'Desafinar soma uma segunda onda um pouco fora do tom: as duas "batem" e o som engorda.',
        'Filtro baixo deixa o som escuro e macio; alto, brilhante e na cara.',
        'Ataque curto dá um som percussivo (pluck); longo, um som que cresce (pad). Soltura é quanto a nota demora para sumir.',
      ]),
    ),
  );
}

/**
 * Arpejo: as notas de cada acorde, em vez de tocarem juntas, tocam uma
 * depois da outra, subindo, a cada meio tempo, até o próximo acorde.
 */
function arpejar(padrao: Padrao) {
  const passos = passosDoPadrao(padrao);
  const acordes: { passo: number; notas: number[] }[] = [];
  for (let s = 0; s < passos; s++) {
    const notas = padrao.melodia.map((linha, g) => (linha[s] ? g : -1)).filter((g) => g >= 0);
    if (notas.length >= 2) acordes.push({ passo: s, notas });
  }
  acordes.forEach((acorde, i) => {
    const fim = acordes[i + 1]?.passo ?? passos;
    for (const g of acorde.notas) padrao.melodia[g][acorde.passo] = false;
    for (let s = acorde.passo, k = 0; s < fim; s += 2, k++) padrao.melodia[acorde.notas[k % acorde.notas.length]][s] = true;
  });
}

export function desenharNotas() {
  if (estado.projeto.beat.fonte === 'arquivo') {
    secNotas.replaceChildren(h('h2', {}, 'Notas'), h('p', { className: 'nota' }, 'Esta página edita o 808 e a melodia de um beat criado aqui. Com um beat importado, ela não é usada.'));
    return;
  }
  const padrao = estado.projeto.padroes[estado.padraoAtual];
  const passos = passosDoPadrao(padrao);
  const linhaDeDeslize = h('div', { className: 'grade' }, h('span', { className: 'nome-linha' }, 'Deslizar'));
  dimensionar(linhaDeDeslize, passos);
  for (let s = 0; s < passos; s++) {
    const b = h('button', { className: 'passo deslize' + (padrao.deslize[s] ? ' ligado' : ''), ariaLabel: `Deslizar no passo ${s + 1}` });
    b.onclick = () => {
      padrao.deslize[s] = !padrao.deslize[s];
      b.classList.toggle('ligado');
      mudou();
    };
    linhaDeDeslize.append(b);
  }

  secNotas.replaceChildren(
    h('h2', {}, 'Notas'),
    abasDePadrao(),
    teclado(),
    h('h3', {}, '808'),
    deslizante('Volume', 0, 1.2, 0.01, estado.projeto.volumes.baixo, (v) => { estado.projeto.volumes.baixo = v; }),
    sample808(),
    h('div', { className: 'rolagem' },
      gradeDeNotas(
        (l, s) => padrao.baixo[s] === l,
        (l, s, ligar) => {
          if (ligar) padrao.baixo[s] = l;
          else if (padrao.baixo[s] === l) padrao.baixo[s] = -1;
        },
      ),
      linhaDeDeslize,
    ),
    explicacao([
      'O 808 é o grave que dá peso. Ele toca uma nota por vez e soa até a próxima nota.',
      'As linhas são as notas da escala da música; a de baixo é a nota principal (tônica). Colocar o 808 junto com o bumbo é o ponto de partida mais seguro.',
      'Deslizar: a nota começa na altura da anterior e escorrega até a nova. É a marca do drill e do trap.',
    ]),
    h('h3', {}, 'Sampler'),
    sampler(padrao),
    h('h3', {}, 'Melodia'),
    acordes(padrao),
    h('div', { className: 'linha' },
      seletor<InstrumentoId>('Instrumento', opcoes(INSTRUMENTOS, (k) => INSTRUMENTOS[k]), estado.projeto.instrumento, (v) => {
        estado.projeto.instrumento = v;
        desenharBeat();
      }),
      deslizante('Volume', 0, 1.2, 0.01, estado.projeto.volumes.melodia, (v) => { estado.projeto.volumes.melodia = v; }),
      botao('Arpejar os acordes', () => {
        arpejar(padrao);
        mudou();
        desenharBeat();
      }),
    ),
    estado.projeto.instrumento === 'meu' ? painelDoSintetizador() : '',
    h('div', { className: 'rolagem' },
      gradeDeNotas(
        (l, s) => padrao.melodia[l][s],
        (l, s, ligar) => { padrao.melodia[l][s] = ligar; },
      ),
    ),
    explicacao([
      'Só aparecem notas da escala, então qualquer combinação soa bem junta.',
      'Notas na mesma coluna tocam ao mesmo tempo e formam um acorde. Pulando uma linha entre elas (1ª, 3ª, 5ª) sai o acorde básico.',
    ]),
  );
}
