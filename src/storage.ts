// Salvamento local, no próprio navegador: o projeto (JSON) vai no localStorage
// e o áudio, que é grande, no IndexedDB.

import { novoProjeto } from './model/generos.ts';
import { idsDeAudio, normalizar, type Project } from './model/project.ts';

const CHAVE = 'estudio-aberto:projeto';
const BANCO = 'estudio-aberto';
const LOJA = 'audio';

export type AudioSalvo =
  | { tipo: 'arquivo'; blob: Blob }
  | { tipo: 'pcm'; taxa: number; amostras: Float32Array }
  | { tipo: 'versao'; nome: string; quando: number; projeto: string };

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

/** Guarda o projeto. Devolve false se o navegador estiver sem espaço. */
export function salvarProjeto(p: Project): boolean {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
    return true;
  } catch {
    window.dispatchEvent(new Event('estudio:sem-espaco'));
    return false;
  }
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

export const guardarAudio = (id: string, audio: AudioSalvo) =>
  operar('readwrite', (l) => l.put(audio, id)).catch((erro) => {
    window.dispatchEvent(new Event('estudio:sem-espaco'));
    throw erro;
  });
export const lerAudio = (id: string) => operar<AudioSalvo | undefined>('readonly', (l) => l.get(id));
export const apagarAudio = (id: string) => operar('readwrite', (l) => l.delete(id));
export const listarAudios = () => operar<IDBValidKey[]>('readonly', (l) => l.getAllKeys());

// ---------- versões ----------
// Retratos do projeto guardados no navegador, para voltar a um ponto
// anterior da música. Guardam o projeto (JSON); o áudio é o mesmo dos takes.

const PREFIXO_DE_VERSAO = 'versao:';
const MAXIMO_DE_VERSOES = 15;

export interface Versao {
  chave: string;
  nome: string;
  quando: number;
  projeto: string;
}

export async function listarVersoes(): Promise<Versao[]> {
  const versoes: Versao[] = [];
  for (const chave of await listarAudios()) {
    if (!String(chave).startsWith(PREFIXO_DE_VERSAO)) continue;
    const v = await lerAudio(String(chave));
    if (v?.tipo === 'versao') versoes.push({ chave: String(chave), nome: v.nome, quando: v.quando, projeto: v.projeto });
  }
  return versoes.sort((a, b) => b.quando - a.quando);
}

/** Guarda o estado atual como uma versão; as mais antigas além do limite são apagadas. */
export async function guardarVersao(p: Project, nome: string) {
  const quando = Date.now();
  const projeto = JSON.stringify(p);
  const versoes = await listarVersoes();
  if (versoes[0]?.projeto === projeto) return;
  await guardarAudio(PREFIXO_DE_VERSAO + quando, { tipo: 'versao', nome, quando, projeto });
  for (const antiga of versoes.slice(MAXIMO_DE_VERSOES - 1)) await apagarAudio(antiga.chave);
}

export const abrirVersao = (v: Versao) => normalizar(JSON.parse(v.projeto) as Project);

/** Áudio que não pode ser apagado: o do projeto aberto e o de todas as versões guardadas. */
export async function audiosEmUso(p: Project): Promise<Set<string>> {
  const usados = new Set(idsDeAudio(p));
  for (const chave of await listarAudios()) if (String(chave).startsWith(PREFIXO_DO_COFRE)) usados.add(String(chave));
  for (const v of await listarVersoes()) {
    usados.add(v.chave);
    for (const audioId of idsDeAudio(abrirVersao(v))) usados.add(audioId);
  }
  return usados;
}

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

/**
 * Colaboração sem servidor: lê o arquivo de projeto de um parceiro e traz
 * as vozes dele para o projeto aberto, mantendo as suas. Devolve quantas entraram.
 */
export async function juntarVozes(texto: string, p: Project, sufixo: string): Promise<number> {
  const arquivo = JSON.parse(texto) as ArquivoDeProjeto;
  if (arquivo.formato !== 'estudio-aberto') throw new Error('Arquivo de projeto inválido');
  const deles = normalizar(arquivo.projeto);
  let quantas = 0;
  for (const take of deles.takes) {
    const audio = arquivo.audios[take.audioId];
    if (!audio || audio.tipo !== 'pcm' || p.takes.some((t) => t.id === take.id)) continue;
    const blob = await (await fetch(audio.dados)).blob();
    await guardarAudio(take.audioId, { tipo: 'pcm', taxa: audio.taxa, amostras: new Float32Array(await blob.arrayBuffer()) });
    p.takes.push({ ...take, nome: `${take.nome} (${sufixo})`, naMontagem: false });
    quantas++;
  }
  return quantas;
}

// ---------- cofre da gravação em andamento ----------
// Enquanto a pessoa grava, o áudio vai sendo guardado em pedaços. Se a aba
// cair, o celular travar ou a bateria acabar, o take é recuperado ao reabrir.

const PREFIXO_DO_COFRE = 'gravando:';
const CHAVE_DO_COFRE = 'estudio-aberto:gravando';

export function abrirCofre(taxa: number, inicio: number) {
  localStorage.setItem(CHAVE_DO_COFRE, JSON.stringify({ taxa, inicio, pedacos: 0 }));
}

export async function guardarNoCofre(amostras: Float32Array) {
  const dados = JSON.parse(localStorage.getItem(CHAVE_DO_COFRE) ?? 'null') as { taxa: number; inicio: number; pedacos: number } | null;
  if (!dados || !amostras.length) return;
  await guardarAudio(PREFIXO_DO_COFRE + dados.pedacos, { tipo: 'pcm', taxa: dados.taxa, amostras });
  localStorage.setItem(CHAVE_DO_COFRE, JSON.stringify({ ...dados, pedacos: dados.pedacos + 1 }));
}

export async function fecharCofre() {
  localStorage.removeItem(CHAVE_DO_COFRE);
  for (const chave of await listarAudios()) if (String(chave).startsWith(PREFIXO_DO_COFRE)) await apagarAudio(String(chave));
}

/** Se houver uma gravação interrompida, devolve o áudio dela e onde começava. */
export async function recuperarDoCofre(): Promise<{ amostras: Float32Array; taxa: number; inicio: number } | null> {
  const dados = JSON.parse(localStorage.getItem(CHAVE_DO_COFRE) ?? 'null') as { taxa: number; inicio: number; pedacos: number } | null;
  if (!dados) return null;
  const partes: Float32Array[] = [];
  for (let k = 0; k < dados.pedacos; k++) {
    const pedaco = await lerAudio(PREFIXO_DO_COFRE + k);
    if (pedaco?.tipo === 'pcm') partes.push(pedaco.amostras);
  }
  const amostras = new Float32Array(partes.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of partes) {
    amostras.set(p, pos);
    pos += p.length;
  }
  return amostras.length > dados.taxa ? { amostras, taxa: dados.taxa, inicio: dados.inicio } : null;
}

/** Quanto espaço o estúdio usa e quanto o navegador permite, em megabytes. */
export async function espaco(): Promise<{ usado: number; total: number; protegido: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usado: (e.usage ?? 0) / 1048576, total: (e.quota ?? 0) / 1048576, protegido: (await navigator.storage.persisted?.()) ?? false };
}
