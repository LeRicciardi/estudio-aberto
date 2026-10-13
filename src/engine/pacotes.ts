// Packs de sons: abrir um .zip (como os packs de bateria que circulam por aí)
// e adivinhar, pelo nome de cada arquivo, que tipo de som ele é.
// Funções puras, para rodarem também nos testes.

export type TipoDeSom = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'perc' | '808' | 'loop' | 'outro';

export const TIPOS_DE_SOM: Record<TipoDeSom, string> = {
  kick: 'Bumbo', snare: 'Caixa', clap: 'Palma', hat: 'Chimbal', openhat: 'Chimbal aberto', perc: 'Percussão', '808': '808', loop: 'Loop', outro: 'Outros',
};

const EXTENSOES = /\.(wav|mp3|ogg|oga|flac|m4a|aac|aif|aiff|opus|webm)$/i;
export const ehAudio = (nome: string) => EXTENSOES.test(nome) && !/(^|\/)(\.|__MACOSX)/.test(nome);

/** As regras valem na ordem: "open hat" antes de "hat", "808" antes de "kick". */
const REGRAS: [TipoDeSom, RegExp][] = [
  ['loop', /loop|melod|sample[ _-]?\d|\d{2,3} ?bpm/],
  ['808', /808|sub ?bass|\bbass\b|baixo/],
  ['openhat', /open ?hat|\boh\b|hat ?open|chimbal ?aberto|\bopen\b/],
  ['hat', /hi ?hat|\bhh\b|\bhat|chimbal|\bch\b/],
  ['clap', /clap|palma|snap|estalo/],
  ['snare', /snare|\bsnr\b|\bsd\b|caixa|rim/],
  ['kick', /kick|\bbd\b|bumb|\bkik\b/],
  ['perc', /perc|conga|bongo|cowbell|shaker|tamb|tom\b|agogo|clave|crash|ride|cymbal|fx/],
];

/** Tipo do som pelo caminho do arquivo: o nome do arquivo decide; a pasta desempata. */
export function adivinharTipo(caminho: string): TipoDeSom {
  const limpo = caminho.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-.]+/g, ' ');
  const partes = limpo.split('/');
  for (const trecho of [partes[partes.length - 1], partes.slice(0, -1).join(' ')]) {
    for (const [tipo, regra] of REGRAS) if (regra.test(trecho)) return tipo;
  }
  return 'outro';
}

export interface EntradaDoZip {
  nome: string;
  /** 0 = guardado sem comprimir; 8 = deflate. */
  metodo: number;
  comprimido: Uint8Array;
  tamanho: number;
}

/** Lista os arquivos de um .zip pelo índice que fica no fim do arquivo. */
export function listarZip(b: Uint8Array): EntradaDoZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = b.length - 22;
  while (fim >= 0 && v.getUint32(fim, true) !== 0x06054b50) fim--;
  if (fim < 0) throw new Error('Não é um arquivo .zip');
  const quantos = v.getUint16(fim + 10, true);
  let pos = v.getUint32(fim + 16, true);
  const entradas: EntradaDoZip[] = [];
  for (let k = 0; k < quantos && pos + 46 <= b.length && v.getUint32(pos, true) === 0x02014b50; k++) {
    const metodo = v.getUint16(pos + 10, true);
    const comprimido = v.getUint32(pos + 20, true);
    const tamanho = v.getUint32(pos + 24, true);
    const nomeLen = v.getUint16(pos + 28, true);
    const local = v.getUint32(pos + 42, true);
    const nome = new TextDecoder().decode(b.subarray(pos + 46, pos + 46 + nomeLen));
    pos += 46 + nomeLen + v.getUint16(pos + 30, true) + v.getUint16(pos + 32, true);
    // Pastas, arquivos cifrados e zips de mais de 4 GB ficam de fora.
    if (nome.endsWith('/') || comprimido === 0xffffffff || local + 30 > b.length || (metodo !== 0 && metodo !== 8)) continue;
    const dados = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (dados + comprimido > b.length) continue;
    entradas.push({ nome, metodo, comprimido: b.subarray(dados, dados + comprimido), tamanho });
  }
  return entradas;
}

/** Devolve o conteúdo de um arquivo do zip, descomprimindo se preciso. */
export async function extrair(e: EntradaDoZip): Promise<Uint8Array> {
  if (e.metodo === 0) return e.comprimido;
  const fluxo = new Blob([e.comprimido as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/**
 * Nota em que um 808 foi gravado, quando vem no nome do arquivo ("808 C",
 * "Zay F#", "sub_Bb1"). Devolve 0 (Dó) a 11 (Si), ou undefined.
 */
export function notaDoNome(nome: string): number | undefined {
  const achado = / ([A-G])([#b]?)\d?(?= |$)/.exec(` ${nome.replace(/\.[^.]+$/, '').replace(/[_\-().[\]]+/g, ' ')} `.replace(/ +/g, ' '));
  if (!achado) return undefined;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[achado[1] as 'C'];
  return (base + (achado[2] === '#' ? 1 : achado[2] === 'b' ? 11 : 0)) % 12;
}
