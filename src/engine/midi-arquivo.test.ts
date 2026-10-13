import { paraMidi } from './midi-arquivo.ts';
import type { Project } from '../model/project.ts';

function teste(nome: string, fn: () => string | void) {
  try {
    console.log(`ok   ${nome} — ${fn() ?? ''}`);
  } catch (e) {
    console.error(`FALHOU ${nome}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
const garantir = (c: boolean, m: string) => {
  if (!c) throw new Error(m);
};

const vazio = () => Array.from({ length: 16 }, () => 0);
const padrao = {
  nome: 'A',
  bateria: { kick: vazio(), snare: vazio(), clap: vazio(), hat: vazio(), openhat: vazio(), perc: vazio() },
  baixo: Array.from({ length: 16 }, () => -1),
  deslize: Array.from({ length: 16 }, () => false),
  melodia: Array.from({ length: 8 }, () => Array.from({ length: 16 }, () => false)),
};
padrao.bateria.kick[0] = 1;
padrao.bateria.hat[2] = 3; // rolo de 3
padrao.baixo[0] = 0;
padrao.baixo[8] = 2;
padrao.melodia[4][4] = true;
const p = { nome: 'Teste', bpm: 120, tom: 9, escala: 'menor', padroes: [padrao], arranjo: [{ padrao: 0, vezes: 2 }] } as unknown as Project;

/** Lê o arquivo de volta: trilhas com as notas ligadas (tique, canal, altura, força). */
function ler(m: Uint8Array) {
  const trilhas: [number, number, number, number][][] = [];
  let i = 14;
  while (i < m.length) {
    const fim = i + 8 + ((m[i + 4] << 24) | (m[i + 5] << 16) | (m[i + 6] << 8) | m[i + 7]);
    const notas: [number, number, number, number][] = [];
    let t = 0;
    i += 8;
    while (i < fim) {
      let d = 0;
      do d = (d << 7) | (m[i] & 0x7f);
      while (m[i++] & 0x80);
      t += d;
      if (m[i] === 0xff) i += 3 + m[i + 2];
      else {
        if ((m[i] & 0xf0) === 0x90) notas.push([t, m[i] & 15, m[i + 1], m[i + 2]]);
        i += 3;
      }
    }
    garantir(i === fim, 'tamanho da trilha não confere');
    trilhas.push(notas);
  }
  return trilhas;
}

teste('arquivo MIDI tem cabeçalho, 4 trilhas e 480 tiques por tempo', () => {
  const m = paraMidi(p);
  garantir(String.fromCharCode(...m.slice(0, 4)) === 'MThd', 'sem cabeçalho');
  garantir(m[11] === 4 && ((m[12] << 8) | m[13]) === 480, 'trilhas ou resolução erradas');
  return `${m.length} bytes`;
});

teste('bateria, 808 e melodia saem nas notas e nos tempos certos', () => {
  const [, bateria, baixo, melodia] = ler(paraMidi(p));
  // 2 compassos: bumbo 2x, rolo de 3 no chimbal 2x.
  garantir(bateria.filter((n) => n[2] === 36).length === 2, 'bumbo');
  const hats = bateria.filter((n) => n[2] === 42).map((n) => n[0]);
  garantir(hats.length === 6 && hats[0] === 240 && hats[1] === 280, `rolo: ${hats}`);
  garantir(bateria.every((n) => n[1] === 9), 'bateria fora do canal 10');
  // Lá menor: tônica do 808 = Lá1 (33); terceiro grau = Dó (36).
  garantir(baixo[0][2] === 33 && baixo[1][2] === 36 && baixo[1][0] === 960, `808: ${baixo}`);
  // Tom alto: melodia uma oitava abaixo. Grau 4 de Lá menor = Mi (57 + 7).
  garantir(melodia[0][2] === 64 && melodia[0][0] === 480 && melodia[1][0] === 480 + 1920, `melodia: ${melodia}`);
  return `${bateria.length + baixo.length + melodia.length} notas`;
});
