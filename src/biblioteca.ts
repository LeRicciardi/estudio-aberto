// Biblioteca de sons da pessoa: fica guardada no aparelho e vale para todas
// as músicas. Os sons entram por arquivos soltos, por uma pasta ou por um
// pack em .zip, e podem ser usados na bateria e no 808.

import { type TipoDeSom, adivinharTipo, ehAudio, extrair, listarZip } from './engine/pacotes.ts';
import { engine, id } from './estado.ts';
import { apagarAudio, guardarAudio, lerAudio } from './storage.ts';

export interface SomDaBiblioteca {
  id: string;
  nome: string;
  tipo: TipoDeSom;
  /** De onde veio: nome do pack ou da pasta. */
  pacote: string;
}

const CHAVE = 'estudio-aberto:biblioteca';
export const PREFIXO_DA_BIBLIOTECA = 'biblioteca:';
/** Um som de bateria é curto; arquivos maiores que isto são loops ou músicas inteiras. */
const MAXIMO_POR_SOM = 12 * 1024 * 1024;
const MAXIMO_DE_SONS_POR_VEZ = 400;

export function sonsDaBiblioteca(): SomDaBiblioteca[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as SomDaBiblioteca[];
  } catch {
    return [];
  }
}

const salvar = (sons: SomDaBiblioteca[]) => localStorage.setItem(CHAVE, JSON.stringify(sons));

export interface Entrada {
  recebidos: number;
  recusados: number;
}

async function receber(itens: { caminho: string; blob: () => Promise<Blob> }[], pacote: string): Promise<Entrada> {
  const sons = sonsDaBiblioteca();
  const resultado = { recebidos: 0, recusados: 0 };
  for (const item of itens.slice(0, MAXIMO_DE_SONS_POR_VEZ)) {
    try {
      const blob = await item.blob();
      if (blob.size > MAXIMO_POR_SOM || blob.size === 0) throw new Error('tamanho');
      const nome = item.caminho.split('/').pop()!.replace(/\.[^.]+$/, '');
      const som: SomDaBiblioteca = { id: PREFIXO_DA_BIBLIOTECA + id(), nome, tipo: adivinharTipo(item.caminho), pacote };
      await guardarAudio(som.id, { tipo: 'arquivo', blob });
      sons.push(som);
      resultado.recebidos++;
    } catch {
      resultado.recusados++;
    }
  }
  resultado.recusados += Math.max(0, itens.length - MAXIMO_DE_SONS_POR_VEZ);
  salvar(sons);
  return resultado;
}

/** Arquivos soltos ou uma pasta inteira (o navegador informa o caminho de cada arquivo dentro dela). */
export function receberArquivos(arquivos: File[]): Promise<Entrada> {
  const audios = arquivos.filter((a) => ehAudio(a.webkitRelativePath || a.name));
  const pasta = audios[0]?.webkitRelativePath.split('/')[0] || 'Meus sons';
  return receber(audios.map((a) => ({ caminho: a.webkitRelativePath || a.name, blob: async () => a })), pasta);
}

/** Um pack em .zip: entram só os arquivos de áudio; o resto (textos, imagens, programas) é ignorado. */
export async function receberZip(arquivo: File): Promise<Entrada> {
  const entradas = listarZip(new Uint8Array(await arquivo.arrayBuffer())).filter((e) => ehAudio(e.nome) && e.tamanho <= MAXIMO_POR_SOM);
  return receber(entradas.map((e) => ({ caminho: e.nome, blob: async () => new Blob([(await extrair(e)) as BlobPart]) })), arquivo.name.replace(/\.zip$/i, ''));
}

export function mudarTipo(somId: string, tipo: TipoDeSom) {
  salvar(sonsDaBiblioteca().map((s) => (s.id === somId ? { ...s, tipo } : s)));
}

/** Tira sons da biblioteca. O áudio em uso por uma música continua guardado até ela deixar de usar. */
export async function apagarSons(ids: string[], emUso: Set<string>) {
  salvar(sonsDaBiblioteca().filter((s) => !ids.includes(s.id)));
  for (const somId of ids) if (!emUso.has(somId)) await apagarAudio(somId);
}

/** Decodifica um som da biblioteca para tocar. */
export async function carregarDaBiblioteca(somId: string): Promise<AudioBuffer | undefined> {
  const pronto = engine.buffers.get(somId);
  if (pronto) return pronto;
  try {
    const salvo = await lerAudio(somId);
    if (salvo?.tipo !== 'arquivo') return undefined;
    const buffer = await engine.ctx.decodeAudioData(await salvo.blob.arrayBuffer());
    engine.buffers.set(somId, buffer);
    return buffer;
  } catch {
    return undefined;
  }
}

let previa: AudioBufferSourceNode | undefined;
export async function ouvirSom(somId: string): Promise<boolean> {
  const buffer = await carregarDaBiblioteca(somId);
  if (!buffer) return false;
  void engine.ctx.resume();
  previa?.stop();
  previa = engine.ctx.createBufferSource();
  previa.buffer = buffer;
  previa.connect(engine.ctx.destination);
  previa.start();
  return true;
}

export async function blobDoSom(somId: string): Promise<Blob | undefined> {
  const salvo = await lerAudio(somId);
  return salvo?.tipo === 'arquivo' ? salvo.blob : undefined;
}
