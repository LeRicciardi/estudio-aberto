// Modelo de dados do projeto. Tudo que define uma música está aqui, em JSON
// legível. O áudio em si (beat importado, takes de voz) fica guardado à parte
// e é referenciado por id.

export const STEPS = 16;
/** Linhas das grades de notas: uma oitava da escala mais a nota de cima. */
export const LINHAS = 8;

export const LANES = [
  { id: 'kick', nome: 'Bumbo' },
  { id: 'snare', nome: 'Caixa' },
  { id: 'clap', nome: 'Palma' },
  { id: 'hat', nome: 'Chimbal' },
  { id: 'openhat', nome: 'Chimbal aberto' },
  { id: 'perc', nome: 'Percussão' },
] as const;

export type LaneId = (typeof LANES)[number]['id'];

export const NOTAS = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
export type Escala = 'maior' | 'menor';
export const GRAUS: Record<Escala, number[]> = {
  maior: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10],
};

/** Distância em semitons entre a tônica e um grau da escala (0 = tônica). */
export const semitonsDoGrau = (grau: number, escala: Escala) => GRAUS[escala][grau % 7] + 12 * Math.floor(grau / 7);
export const nomeDoGrau = (grau: number, tom: number, escala: Escala) => NOTAS[(tom + semitonsDoGrau(grau, escala)) % 12];

export type KitId = 'trap' | 'boombap' | 'drill' | 'plug' | 'hard' | 'funk' | 'mandelao';
export type InstrumentoId = 'sino' | 'piano' | 'pluck' | 'pad' | 'lead';
export type PresetVoz = 'cru' | 'rap' | 'boombap' | 'trap' | 'plug' | 'rnb' | 'drill' | 'hard' | 'funk';
export type PresetMaster = 'desligado' | 'limpo' | 'alto';
export type DivisaoDelay = 4 | 8 | 16;

/**
 * Valor de um passo da bateria:
 * 0 = vazio, 1 = normal, 2/3/4 = rolo (o som repete 2, 3 ou 4 vezes dentro do
 * passo), 5 = fraco ("nota fantasma").
 */
export type Passo = number;

export interface Padrao {
  nome: string;
  bateria: Record<LaneId, Passo[]>;
  /** 808: grau da escala em cada passo, ou -1 para vazio. Uma nota por vez. */
  baixo: number[];
  /** Passos em que o 808 desliza da nota anterior até a nova. */
  deslize: boolean[];
  /** Melodia: [linha (grau)][passo]. Várias notas ao mesmo tempo formam acordes. */
  melodia: boolean[][];
}

/** Um trecho do arranjo: um padrão repetido algumas vezes. */
export interface Bloco {
  padrao: number;
  vezes: number;
}

export interface Take {
  id: string;
  nome: string;
  audioId: string;
  /** Onde o take começa na música, em segundos. */
  inicio: number;
  volume: number;
  pan: number;
  mudo: boolean;
  preset: PresetVoz;
  tune: { ligado: boolean; velocidade: number };
  reverb: number;
  delay: number;
  divisaoDelay: DivisaoDelay;
  /** Se o take participa da montagem (comping) ou toca sempre inteiro. */
  naMontagem: boolean;
}

export interface Project {
  versao: 2;
  nome: string;
  genero: string;
  bpm: number;
  swing: number;
  /** Tom da música: 0 = Dó ... 11 = Si. Guia o tune, o 808 e a melodia. */
  tom: number;
  escala: Escala;
  kit: KitId;
  instrumento: InstrumentoId;
  volumes: { bateria: number; baixo: number; melodia: number };
  beat: {
    fonte: 'padrao' | 'arquivo';
    audioId?: string;
    nomeArquivo?: string;
    volume: number;
    /** Abre um espaço no beat, na região da voz, para a letra aparecer. */
    espaco: boolean;
  };
  /** Samples do usuário por som da bateria; sem sample, o som é sintetizado. */
  samples: Partial<Record<LaneId, { audioId: string; nome: string }>>;
  padroes: Padrao[];
  arranjo: Bloco[];
  takes: Take[];
  /**
   * Montagem (comping): a música é dividida em trechos de `compassos`
   * compassos e, em cada um, toca só o take escolhido (ou nenhum).
   */
  montagem: { ligada: boolean; compassos: number; escolha: (string | null)[] };
  /** Ajustes com que cada take novo nasce (vêm do gênero escolhido). */
  voz: { preset: PresetVoz; tune: boolean; velocidade: number };
  /** Atraso do sistema em ms; null = estimar automaticamente. */
  latenciaMs: number | null;
  master: PresetMaster;
}

export function padraoVazio(nome: string): Padrao {
  const vazio = () => Array<number>(STEPS).fill(0);
  return {
    nome,
    bateria: { kick: vazio(), snare: vazio(), clap: vazio(), hat: vazio(), openhat: vazio(), perc: vazio() },
    baixo: Array<number>(STEPS).fill(-1),
    deslize: Array<boolean>(STEPS).fill(false),
    melodia: Array.from({ length: LINHAS }, () => Array<boolean>(STEPS).fill(false)),
  };
}

export function novoTake(id: string, nome: string, audioId: string, inicio: number, voz: Project['voz']): Take {
  return {
    id, nome, audioId, inicio,
    volume: 0.9, pan: 0, mudo: false,
    preset: voz.preset,
    tune: { ligado: voz.tune, velocidade: voz.velocidade },
    reverb: 0.1, delay: 0, divisaoDelay: 8,
    naMontagem: false,
  };
}

/**
 * Samples que vêm com o estúdio (pasta public/samples, todos CC0). O id de
 * áudio deles começa com "fabrica:" e o arquivo é baixado quando escolhido.
 */
export const SAMPLES_DE_FABRICA: Partial<Record<LaneId, { arquivo: string; nome: string }[]>> = {
  kick: [
    { arquivo: 'bumbo-fundo-1.wav', nome: 'Bumbo fundo 1' },
    { arquivo: 'bumbo-fundo-2.wav', nome: 'Bumbo fundo 2' },
    { arquivo: 'bumbo-estalado-1.wav', nome: 'Bumbo estalado 1' },
    { arquivo: 'bumbo-estalado-2.wav', nome: 'Bumbo estalado 2' },
    { arquivo: 'bumbo-distorcido-1.wav', nome: 'Bumbo distorcido 1' },
    { arquivo: 'bumbo-distorcido-2.wav', nome: 'Bumbo distorcido 2' },
  ],
};
export const PREFIXO_DE_FABRICA = 'fabrica:';

/** Completa projetos salvos por versões anteriores com os campos novos. */
export function normalizar(p: Project): Project {
  p.samples ??= {};
  p.montagem ??= { ligada: false, compassos: 2, escolha: [] };
  for (const t of p.takes) t.naMontagem ??= false;
  return p;
}

/** Todo áudio que o projeto usa: beat importado, samples e takes. */
export function idsDeAudio(p: Project): string[] {
  const ids = [p.beat.audioId, ...Object.values(p.samples).map((s) => s.audioId), ...p.takes.map((t) => t.audioId)];
  return ids.filter((a): a is string => !!a);
}

/** Duração, em segundos, de um trecho da montagem. */
export const duracaoDoTrecho = (p: Project) => (p.montagem.compassos * 4 * 60) / p.bpm;

export const compassosDoArranjo = (p: Project) => p.arranjo.reduce((n, b) => n + b.vezes, 0);

/** Qual padrão toca em um dado compasso da música. */
export function padraoNoCompasso(p: Project, compasso: number): Padrao | undefined {
  let resto = compasso;
  for (const bloco of p.arranjo) {
    if (resto < bloco.vezes) return p.padroes[bloco.padrao];
    resto -= bloco.vezes;
  }
  return undefined;
}

/** Qual buffer tocar para um take: a versão afinada, se existir, ou a original. */
export function bufferDoTake(take: Take, buffers: Map<string, AudioBuffer>): AudioBuffer | undefined {
  return (take.tune.ligado && buffers.get(take.audioId + ':tune')) || buffers.get(take.audioId);
}

export function duracaoDaMusica(p: Project, buffers: Map<string, AudioBuffer>): number {
  const arquivo = p.beat.fonte === 'arquivo' && p.beat.audioId ? buffers.get(p.beat.audioId) : undefined;
  let fim = arquivo ? arquivo.duration : (compassosDoArranjo(p) * 4 * 60) / p.bpm;
  for (const t of p.takes) {
    const b = buffers.get(t.audioId);
    if (b) fim = Math.max(fim, t.inicio + b.duration);
  }
  return fim;
}
