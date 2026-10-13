// Teste do tune sem navegador: `npm test`.
// Gera uma "voz" desafinada e confere se sai na nota certa.

import { afinar, detectarPitch, notaAlvo } from './tune.ts';

const TAXA = 44100;

function voz(hz: number, segundos: number): Float32Array {
  const x = new Float32Array(Math.floor(TAXA * segundos));
  for (let i = 0; i < x.length; i++) {
    const t = i / TAXA;
    // Fundamental + harmônicos, como uma vogal.
    x[i] = 0.4 * Math.sin(2 * Math.PI * hz * t) + 0.2 * Math.sin(2 * Math.PI * 2 * hz * t) + 0.1 * Math.sin(2 * Math.PI * 3 * hz * t);
  }
  return x;
}

function pitchMedio(x: Float32Array): number {
  const f0 = [...detectarPitch(x, TAXA)].filter((f) => f > 0);
  const meio = f0.slice(Math.floor(f0.length * 0.3), Math.floor(f0.length * 0.9));
  return meio.reduce((a, b) => a + b, 0) / meio.length;
}

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

for (const hz of [110, 226, 330, 452]) {
  const medido = pitchMedio(voz(hz, 1));
  conferir(`detecta ${hz} Hz`, Math.abs(cents(medido, hz)) < 10, `${medido.toFixed(2)} Hz`);
}

conferir('alvo em Lá menor: Sol# vira Lá ou Sol', [67, 69].includes(notaAlvo(68.1, 9, 'menor')), String(notaAlvo(68.1, 9, 'menor')));

// 226 Hz está 47 cents acima do Lá3 (220 Hz); 452 Hz, acima do Lá4 (440 Hz).
for (const [entrada, esperado] of [[226, 220], [452, 440], [212, 220], [160, 164.81]]) {
  const y = afinar(voz(entrada, 1.5), TAXA, { tom: 9, escala: 'menor', velocidade: 0 });
  const medido = pitchMedio(y);
  conferir(`afina ${entrada} Hz para ${esperado} Hz`, Math.abs(cents(medido, esperado)) < 12, `${medido.toFixed(2)} Hz (${cents(medido, esperado).toFixed(1)} cents)`);
}

// Intensidade pela metade corrige metade do caminho; transpor sobe a voz inteira.
const metade = pitchMedio(afinar(voz(226, 1.5), TAXA, { tom: 9, escala: 'menor', velocidade: 0, intensidade: 0.5 }));
conferir('intensidade 50% corrige metade', Math.abs(cents(metade, 220) - cents(226, 220) / 2) < 4, `${metade.toFixed(2)} Hz`);
const acima = pitchMedio(afinar(voz(220, 1.5), TAXA, { tom: 9, escala: 'menor', velocidade: 0, intensidade: 0, transpor: 3 }));
conferir('transpor +3 semitons', Math.abs(cents(acima, 220 * 2 ** (3 / 12))) < 12, `${acima.toFixed(2)} Hz`);
const abaixo = pitchMedio(afinar(voz(220, 1.5), TAXA, { tom: 9, escala: 'menor', velocidade: 0, intensidade: 0, transpor: -5 }));
conferir('transpor -5 semitons', Math.abs(cents(abaixo, 220 * 2 ** (-5 / 12))) < 12, `${abaixo.toFixed(2)} Hz`);

// Nota já afinada não pode ser alterada, e silêncio continua silêncio.
const certo = voz(220, 1);
const y = afinar(certo, TAXA, { tom: 9, escala: 'menor', velocidade: 0 });
let erro = 0;
for (let i = 4096; i < y.length - 4096; i++) erro = Math.max(erro, Math.abs(y[i] - certo[i]));
conferir('não mexe em nota afinada', erro < 0.05, `diferença máxima ${erro.toFixed(4)}`);
const mudo = afinar(new Float32Array(TAXA), TAXA, { tom: 0, escala: 'maior', velocidade: 0 });
conferir('silêncio continua silêncio', mudo.every((v) => v === 0), '');

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
