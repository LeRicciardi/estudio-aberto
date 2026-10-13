// Salvamento local, no próprio navegador: o projeto (JSON) vai no localStorage
// e o áudio, que é grande, no IndexedDB.

import { novoProjeto } from './model/generos.ts';
import { idsDeAudio, normalizar, type Project } from './model/project.ts';

const CHAVE = 'estudio-aberto:projeto';
const BANCO = 'estudio-aberto';
const LOJA = 'audio';

export type AudioSalvo =
  | { tipo: 'arquivo'; blob: Blob }
  | { tipo: 'pcm'; taxa: number; amostras: Float32Array };

export function carregarProjeto(): Project {
  try {
    const texto = localStorage.getItem(CHAVE);
    if (texto) {
      const p = JSON.parse(texto) as Project;
      if (p.versao === 2) return normalizar(p);
    }
  } catch { /* projeto ilegível: começa um novo */ }
  return novoProjeto();
}

export function salvarProjeto(p: Project) {
  localStorage.setItem(CHAVE, JSON.stringify(p));
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => erro(pedido.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const banco = await abrir();
  return new Promise((ok, erro) => {
    const pedido = acao(banco.transaction(LOJA, modo).objectStore(LOJA));
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => erro(pedido.error);
  });
}

export const guardarAudio = (id: string, audio: AudioSalvo) => operar('readwrite', (l) => l.put(audio, id));
export const lerAudio = (id: string) => operar<AudioSalvo | undefined>('readonly', (l) => l.get(id));
export const apagarAudio = (id: string) => operar('readwrite', (l) => l.delete(id));
export const listarAudios = () => operar<IDBValidKey[]>('readonly', (l) => l.getAllKeys());

// ---------- arquivo de projeto ----------
// Um único arquivo .json com o projeto e todo o áudio dentro (em base64),
// para guardar cópia, trocar de aparelho ou mandar para outra pessoa.

interface ArquivoDeProjeto {
  formato: 'estudio-aberto';
  projeto: Project;
  audios: Record<string, { tipo: 'arquivo'; dados: string } | { tipo: 'pcm'; taxa: number; dados: string }>;
}

function paraDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(leitor.result as string);
    leitor.onerror = () => erro(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

export async function empacotarProjeto(p: Project): Promise<Blob> {
  const arquivo: ArquivoDeProjeto = { formato: 'estudio-aberto', projeto: p, audios: {} };
  for (const id of idsDeAudio(p)) {
    const salvo = await lerAudio(id);
    if (salvo?.tipo === 'arquivo') arquivo.audios[id] = { tipo: 'arquivo', dados: await paraDataUrl(salvo.blob) };
    if (salvo?.tipo === 'pcm') arquivo.audios[id] = { tipo: 'pcm', taxa: salvo.taxa, dados: await paraDataUrl(new Blob([salvo.amostras])) };
  }
  return new Blob([JSON.stringify(arquivo)], { type: 'application/json' });
}

/** Lê um arquivo de projeto, grava o áudio no navegador e devolve o projeto. */
export async function desempacotarProjeto(texto: string): Promise<Project> {
  const arquivo = JSON.parse(texto) as ArquivoDeProjeto;
  if (arquivo.formato !== 'estudio-aberto' || arquivo.projeto?.versao !== 2) throw new Error('Arquivo de projeto inválido');
  for (const [id, audio] of Object.entries(arquivo.audios)) {
    const blob = await (await fetch(audio.dados)).blob();
    if (audio.tipo === 'arquivo') await guardarAudio(id, { tipo: 'arquivo', blob });
    else await guardarAudio(id, { tipo: 'pcm', taxa: audio.taxa, amostras: new Float32Array(await blob.arrayBuffer()) });
  }
  return normalizar(arquivo.projeto);
}
