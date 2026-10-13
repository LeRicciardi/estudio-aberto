// Modelos por gênero: pontos de partida com andamento, balanço, kit, timbre de
// voz e um padrão típico. São convenções conhecidas de cada estilo, escritas
// como dados para qualquer pessoa da cena corrigir ou acrescentar o seu.
//
// Notação da bateria (16 passos por compasso):
//   .  vazio     x  toca     g  fraco     2 3 4  rolo de 2, 3 ou 4 toques
// Notação do 808: o número é o grau da escala (0 = tônica), ponto é vazio.

import {
  LANES, STEPS, padraoVazio,
  type Escala, type InstrumentoId, type KitId, type LaneId, type Padrao, type PresetVoz, type Project,
} from './project.ts';

interface Modelo {
  nome: string;
  descricao: string;
  bpm: number;
  swing: number;
  escala: Escala;
  kit: KitId;
  instrumento: InstrumentoId;
  voz: { preset: PresetVoz; tune: boolean; velocidade: number };
  bateria: Partial<Record<LaneId, string>>;
  baixo?: string;
  deslize?: string;
  /** [grau, passos em que toca] */
  melodia?: [number, number[]][];
  /** Bateria do segundo compasso, para estilos cujo ritmo se completa em dois. */
  segundoCompasso?: Partial<Record<LaneId, string>>;
  /** Padrão montado sem fonte confiável: precisa ser corrigido por quem é da cena. */
  aproximado?: boolean;
}

export const GENEROS: Record<string, Modelo> = {
  boombap: {
    nome: 'Boombap',
    descricao: 'Lento e balançado, bumbo e caixa secos e pesados. A voz fica seca e na frente.',
    bpm: 90, swing: 0.28, escala: 'menor', kit: 'boombap', instrumento: 'piano',
    voz: { preset: 'boombap', tune: false, velocidade: 0.5 },
    bateria: { kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', perc: '.........g......' },
    baixo: '0.....0...3.....',
    melodia: [[0, [0]], [2, [0]], [4, [0]], [3, [8]], [5, [8]], [7, [8]]],
  },
  trap: {
    nome: 'Trap',
    descricao: 'Palma no meio do compasso, chimbal rápido com rolos e 808 longo seguindo o bumbo.',
    bpm: 140, swing: 0, escala: 'menor', kit: 'trap', instrumento: 'pluck',
    voz: { preset: 'trap', tune: true, velocidade: 0.15 },
    bateria: { kick: 'x......x..x.....', clap: '........x.......', hat: 'x.x.x.x.x.x.3.x4', perc: '......g......g..' },
    baixo: '0......0..2.....', deslize: '..........x.....',
    melodia: [[0, [0]], [2, [3]], [4, [6]], [2, [10]], [1, [13]]],
  },
  plug: {
    nome: 'Plug',
    descricao: 'Leve e brilhante: sinos, 808 macio, poucos elementos e muito espaço. Voz com bastante tune.',
    bpm: 150, swing: 0, escala: 'maior', kit: 'plug', instrumento: 'sino',
    voz: { preset: 'plug', tune: true, velocidade: 0.05 },
    bateria: { kick: 'x.........x.....', clap: '........x.......', hat: 'x...x.x.x...x.x.', openhat: '..x.......x.....' },
    baixo: '0.........0.....',
    melodia: [[4, [0, 10]], [2, [2, 8]], [0, [4]], [5, [12]]],
  },
  love: {
    nome: 'Love song',
    descricao: 'Romântico e melódico: piano elétrico em acordes, bateria suave e voz com reverb.',
    bpm: 125, swing: 0.1, escala: 'maior', kit: 'plug', instrumento: 'piano',
    voz: { preset: 'rnb', tune: true, velocidade: 0.4 },
    bateria: { kick: 'x.....x...x.....', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    baixo: '0.....0...3.....',
    melodia: [[0, [0]], [2, [0]], [4, [0]], [3, [8]], [5, [8]], [7, [8]]],
  },
  drill: {
    nome: 'Drill',
    descricao: 'Chimbal quebrado em grupos de três, 808 que desliza entre as notas e clima sombrio.',
    bpm: 142, swing: 0, escala: 'menor', kit: 'drill', instrumento: 'piano',
    voz: { preset: 'drill', tune: false, velocidade: 0.3 },
    bateria: { kick: 'x.............x.', clap: '........x.......', hat: 'x..x..x.x..x..x.' },
    segundoCompasso: { kick: 'x..x..x.......x.', clap: '............x...', hat: 'x..x..x.x..x..x.' },
    baixo: '0.....3.......5.', deslize: '......x.......x.',
    melodia: [[0, [0]], [2, [6]], [1, [12]]],
  },
  hard: {
    nome: 'Hard / Trash',
    descricao: 'Rápido e agressivo: 808 e bumbo distorcidos, sintetizador sujo e voz saturada.',
    bpm: 155, swing: 0, escala: 'menor', kit: 'hard', instrumento: 'lead',
    voz: { preset: 'hard', tune: true, velocidade: 0.05 },
    bateria: { kick: 'x..x..x...x..x..', clap: '........x.......', hat: 'x.x.x.x.2.x.x.x4' },
    baixo: '0..0..0...0..1..', deslize: '.............x..',
    melodia: [[0, [0, 3, 10]], [1, [6]]],
  },
  funk: {
    nome: 'Funk',
    descricao: 'Batida de 150 BPM no molde do tamborzão: bumbo e caixa conversando, voz alta e na cara.',
    aproximado: true,
    bpm: 150, swing: 0, escala: 'menor', kit: 'funk', instrumento: 'lead',
    voz: { preset: 'funk', tune: false, velocidade: 0.2 },
    bateria: { kick: 'x.......x.x.....', snare: '...x..x.....x.x.', perc: '......x.......x.' },
    baixo: '0.......0.0.....',
  },
  mandelao: {
    nome: 'Mandelão',
    descricao: 'Mais lento e pesado: bumbo longo e estourado, poucos elementos e muito grave.',
    aproximado: true,
    bpm: 130, swing: 0, escala: 'menor', kit: 'mandelao', instrumento: 'lead',
    voz: { preset: 'funk', tune: false, velocidade: 0.2 },
    bateria: { kick: 'x..x..x.....x...', clap: '........x.......', hat: '..x...x...x...x.' },
  },
  bruxaria: {
    nome: 'Bruxaria',
    descricao: 'Grave estourado do mandelão com sintetizadores agudos e ásperos por cima.',
    aproximado: true,
    bpm: 130, swing: 0, escala: 'menor', kit: 'mandelao', instrumento: 'lead',
    voz: { preset: 'funk', tune: false, velocidade: 0.2 },
    bateria: { kick: 'x..x..x.....x...', clap: '........x.......', perc: 'x.x.x.x.........' },
    melodia: [[7, [0, 4]], [6, [2]], [4, [6]], [7, [8, 9, 10, 11]]],
  },
};

const VALOR: Record<string, number> = { x: 1, '2': 2, '3': 3, '4': 4, g: 5 };

function montarPadrao(nome: string, m: Modelo): Padrao {
  const p = padraoVazio(nome);
  for (const { id } of LANES) {
    [...(m.bateria[id] ?? '')].slice(0, STEPS).forEach((c, i) => (p.bateria[id][i] = VALOR[c] ?? 0));
  }
  [...(m.baixo ?? '')].slice(0, STEPS).forEach((c, i) => (p.baixo[i] = c === '.' ? -1 : Number(c)));
  [...(m.deslize ?? '')].slice(0, STEPS).forEach((c, i) => (p.deslize[i] = c === 'x'));
  for (const [grau, passos] of m.melodia ?? []) for (const s of passos) p.melodia[grau][s] = true;
  return p;
}

/** Troca o beat do projeto pelo modelo do gênero. Tom, takes e nome são mantidos. */
export function aplicarGenero(p: Project, id: string) {
  const m = GENEROS[id];
  const cheio = montarPadrao('Cheio', m);
  // "Respiro": o mesmo padrão sem bumbo e sem 808, para intro e pausas.
  const respiro = montarPadrao('Respiro', m);
  respiro.bateria.kick.fill(0);
  respiro.baixo.fill(-1);
  p.genero = id;
  p.bpm = m.bpm;
  p.swing = m.swing;
  p.escala = m.escala;
  p.kit = m.kit;
  p.instrumento = m.instrumento;
  p.voz = { ...m.voz };
  p.padroes = [cheio, respiro];
  p.arranjo = [{ padrao: 1, vezes: 2 }, { padrao: 0, vezes: 8 }, { padrao: 1, vezes: 2 }, { padrao: 0, vezes: 8 }];
  if (m.segundoCompasso) {
    // Ritmo de dois compassos: os padrões "Cheio" e "Cheio 2" se alternam.
    p.padroes.push({ ...montarPadrao('Cheio 2', { ...m, bateria: m.segundoCompasso }) });
    const par = [{ padrao: 0, vezes: 1 }, { padrao: 2, vezes: 1 }];
    const quatroPares = [1, 2, 3, 4].flatMap(() => par.map((b) => ({ ...b })));
    p.arranjo = [{ padrao: 1, vezes: 2 }, ...quatroPares, { padrao: 1, vezes: 2 }, ...quatroPares.map((b) => ({ ...b }))];
  }
}

export function novoProjeto(genero = 'trap'): Project {
  const p: Project = {
    versao: 2,
    nome: 'Minha música',
    genero,
    bpm: 140, swing: 0, tom: 9, escala: 'menor',
    kit: 'trap', instrumento: 'pluck',
    volumes: { bateria: 0.9, baixo: 0.9, melodia: 0.6 },
    beat: { fonte: 'padrao', volume: 0.8, espaco: true },
    samples: {},
    padroes: [], arranjo: [], takes: [],
    montagem: { ligada: false, compassos: 2, escolha: [] },
    voz: { preset: 'rap', tune: false, velocidade: 0.2 },
    latenciaMs: null,
    master: 'limpo',
  };
  aplicarGenero(p, genero);
  return p;
}
