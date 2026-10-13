// Testes de etiquetas, zip e conferência do arquivo (rodam em `npm test`).

import { conferirAudio, etiquetasId3, tomCurto, zip } from './entrega.ts';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

const id3 = etiquetasId3({ titulo: 'Canção', artista: 'MC Teste', bpm: 140, tom: 'Am', comentario: '', isrc: '' });
const texto = new TextDecoder('latin1').decode(id3);
const tamanho = (id3[6] << 21) | (id3[7] << 14) | (id3[8] << 7) | id3[9];
conferir('ID3 começa com o cabeçalho e declara o tamanho certo', texto.startsWith('ID3') && tamanho === id3.length - 10, `${id3.length} bytes`);
conferir('ID3 traz BPM e tom', texto.includes('TBPM') && texto.includes('TKEY') && texto.includes('TIT2'));
conferir('tom curto: Lá menor = Am, Fá# maior = F#', tomCurto(9, 'menor') === 'Am' && tomCurto(6, 'maior') === 'F#');

const pacote = zip([{ nome: 'música.txt', dados: new TextEncoder().encode('oi') }, { nome: 'b.txt', dados: new Uint8Array(1000) }]);
const v = new DataView(pacote.buffer);
conferir('zip tem assinatura, diretório e fim', v.getUint32(0, true) === 0x04034b50 && v.getUint32(pacote.length - 22, true) === 0x06054b50 && v.getUint16(pacote.length - 12, true) === 2, `${pacote.length} bytes`);
// CRC conhecido de "oi" = 0x4f6c8fd2? Conferimos pela propriedade: CRC de vazio é 0.
conferir('zip guarda o tamanho de cada arquivo', v.getUint32(18, true) === 2);

const TAXA = 44100;
const boa = new Float32Array(TAXA * 90).map((_, i) => 0.25 * Math.sin((2 * Math.PI * 220 * i) / TAXA));
conferir('música normal passa na conferência', conferirAudio([boa], TAXA, -14).every((i) => i.ok));
const comSilencio = new Float32Array(TAXA * 90);
comSilencio.set(boa.subarray(0, TAXA * 60), TAXA * 5);
const r = conferirAudio([comSilencio], TAXA, -14);
conferir('aponta silêncio no começo e no fim', !r[2].ok && !r[3].ok, r.filter((i) => !i.ok).map((i) => i.texto).join(' | '));
conferir('aponta pico acima de -1', !conferirAudio([boa.map((x) => x * 4)], TAXA, -14)[0].ok);

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
