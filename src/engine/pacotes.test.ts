import { deflateRawSync } from 'node:zlib';
import { zip } from './entrega.ts';
import { adivinharTipo, ehAudio, extrair, listarZip, notaDoNome } from './pacotes.ts';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

const casos: [string, string][] = [
  ['Kit Trap/Kicks/Kick 01.wav', 'kick'], ['808 C (hard).wav', '808'], ['Kit/808s/Zay.wav', '808'], ['Open Hat 3.wav', 'openhat'],
  ['HiHat_closed.wav', 'hat'], ['Snares/rim_02.wav', 'snare'], ['CLAP-big.wav', 'clap'], ['Percs/cowbell.wav', 'perc'],
  ['Melody Loop 140bpm Am.wav', 'loop'], ['Caixa seca.mp3', 'snare'], ['Bumbão.wav', 'kick'], ['vox chop.wav', 'outro'],
];
const errados = casos.filter(([nome, tipo]) => adivinharTipo(nome) !== tipo).map(([nome]) => `${nome}→${adivinharTipo(nome)}`);
conferir('adivinha o tipo do som pelo nome e pela pasta', errados.length === 0, errados.join(', ') || `${casos.length} nomes`);
conferir('só aceita áudio e ignora arquivos ocultos', ehAudio('a/b.WAV') && !ehAudio('leia.txt') && !ehAudio('__MACOSX/a.wav') && !ehAudio('kit/.DS_Store.wav'));

const notas: [string, number | undefined][] = [['808 C.wav', 0], ['Zay_F#.wav', 6], ['sub-Bb1.wav', 10], ['808 (G).wav', 7], ['Kick Hard.wav', undefined], ['Bass A 140.wav', 9]];
const notasErradas = notas.filter(([n, v]) => notaDoNome(n) !== v).map(([n]) => `${n}→${notaDoNome(n)}`);
conferir('acha a nota do 808 no nome do arquivo', notasErradas.length === 0, notasErradas.join(', '));

const dados = new Uint8Array(5000).map((_, i) => (i * 7) % 251);
const guardado = zip([{ nome: 'Kit/Kick 1.wav', dados }, { nome: 'Kit/Açaí.wav', dados: dados.subarray(0, 10) }]);
const lidos = listarZip(guardado);
const volta = await extrair(lidos[0]);
conferir('lê de volta um zip sem compressão', lidos.length === 2 && lidos[1].nome === 'Kit/Açaí.wav' && volta.length === 5000 && volta.every((x, i) => x === dados[i]), lidos.map((e) => e.nome).join(', '));

// Um zip comprimido, montado à mão: mesmo índice, conteúdo em deflate.
const comprimido = deflateRawSync(dados);
const base = zip([{ nome: 'k.wav', dados: new Uint8Array(comprimido) }]);
const v = new DataView(base.buffer);
v.setUint16(8, 8, true); // método no cabeçalho local
v.setUint32(22, dados.length, true);
const indice = 30 + 5 + comprimido.length;
v.setUint16(indice + 10, 8, true);
v.setUint32(indice + 24, dados.length, true);
const [entrada] = listarZip(base);
const aberto = await extrair(entrada);
conferir('descomprime um arquivo em deflate', entrada.metodo === 8 && aberto.length === 5000 && aberto.every((x, i) => x === dados[i]), `${comprimido.length} → ${aberto.length} bytes`);

let recusou = false;
try {
  listarZip(new Uint8Array(100));
} catch {
  recusou = true;
}
conferir('recusa o que não é zip', recusou);
if (falhas) process.exit(1);
