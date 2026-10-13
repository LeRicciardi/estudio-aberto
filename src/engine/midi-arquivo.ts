// Arquivo MIDI padrão (.mid, formato 1) com as notas da música: bateria,
// 808 e melodia, cada um numa trilha. Serve para levar o beat a outro
// programa (FL Studio, Ableton, BandLab) e trocar os sons lá.
// O balanço (swing) e o deslize do 808 não vão para o arquivo.

import { type Project, passosDoPadrao, semitonsDoGrau } from '../model/project.ts';

const TIQUES_POR_PASSO = 120; // 480 por tempo, 4 passos por tempo
/** Nota de cada som no mapa de bateria General MIDI (canal 10). */
const NOTA_DA_BATERIA: Record<string, number> = { kick: 36, snare: 38, clap: 39, hat: 42, openhat: 46, perc: 56 };

type Evento = [tique: number, ordem: number, bytes: number[]];

/** Número de tamanho variável do MIDI: 7 bits por byte, o último sem o bit alto. */
function variavel(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

function trilha(nome: string, eventos: Evento[]): number[] {
  const texto = [...new TextEncoder().encode(nome)];
  const dados = [0, 0xff, 0x03, ...variavel(texto.length), ...texto];
  // No mesmo instante, a nota que acaba vem antes da que começa.
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let antes = 0;
  for (const [tique, , bytes] of eventos) {
    dados.push(...variavel(tique - antes), ...bytes);
    antes = tique;
  }
  dados.push(0, 0xff, 0x2f, 0);
  const n = dados.length;
  return [0x4d, 0x54, 0x72, 0x6b, n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...dados];
}

function nota(eventos: Evento[], canal: number, altura: number, inicio: number, duracao: number, forca: number) {
  eventos.push([inicio, 1, [0x90 | canal, altura, forca]], [inicio + duracao, 0, [0x80 | canal, altura, 0]]);
}

export function paraMidi(p: Project): Uint8Array {
  const bateria: Evento[] = [];
  const baixo: Evento[] = [];
  const melodia: Evento[] = [];
  const tom808 = 24 + p.tom;
  const tomMelodia = (p.tom > 6 ? 48 : 60) + p.tom;
  let compasso = 0;
  for (const bloco of p.arranjo) {
    const padrao = p.padroes[bloco.padrao];
    const passos = padrao ? passosDoPadrao(padrao) : 16;
    for (let i = 0; padrao && i < bloco.vezes * 16; i++) {
      const s = i % passos;
      const t = (compasso * 16 + i) * TIQUES_POR_PASSO;
      if (!bloco.mudos?.bateria) {
        for (const [lane, linha] of Object.entries(padrao.bateria)) {
          const v = linha[s];
          if (!v || NOTA_DA_BATERIA[lane] === undefined) continue;
          const vezes = v >= 2 && v <= 4 ? v : 1;
          const forca = v === 5 ? 55 : v === 6 ? 127 : 100;
          const parte = TIQUES_POR_PASSO / vezes;
          for (let k = 0; k < vezes; k++) nota(bateria, 9, NOTA_DA_BATERIA[lane], t + k * parte, parte / 2, forca);
        }
      }
      if (!bloco.mudos?.baixo && padrao.baixo[s] >= 0) {
        // O 808 soa até a próxima nota, no máximo um compasso.
        let dura = 1;
        while (dura < 16 && i + dura < bloco.vezes * 16 && padrao.baixo[(s + dura) % passos] < 0) dura++;
        nota(baixo, 0, tom808 + semitonsDoGrau(padrao.baixo[s], p.escala), t, dura * TIQUES_POR_PASSO, 110);
      }
      if (!bloco.mudos?.melodia) {
        padrao.melodia.forEach((linha, grau) => {
          if (linha[s]) nota(melodia, 1, tomMelodia + semitonsDoGrau(grau, p.escala), t, 2 * TIQUES_POR_PASSO, 95);
        });
      }
    }
    compasso += bloco.vezes;
  }
  const micros = Math.round(60_000_000 / p.bpm);
  const andamento = trilha(p.nome || 'Estúdio Aberto', [[0, 0, [0xff, 0x51, 3, micros >> 16, (micros >> 8) & 255, micros & 255]], [0, 0, [0xff, 0x58, 4, 4, 2, 24, 8]]]);
  const cabecalho = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 4, (TIQUES_POR_PASSO * 4) >> 8, (TIQUES_POR_PASSO * 4) & 255];
  return new Uint8Array([...cabecalho, ...andamento, ...trilha('Bateria', bateria), ...trilha('808', baixo), ...trilha('Melodia', melodia)]);
}
