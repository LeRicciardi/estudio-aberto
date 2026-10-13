// Testes do gate e do de-esser (rodam em `npm test`).

import { deEsser, gate } from './limpeza.ts';

const TAXA = 44100;
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}
const rms = (x: Float32Array, de: number, ate: number) => {
  let s = 0;
  for (let i = Math.floor(de * TAXA); i < Math.floor(ate * TAXA); i++) s += x[i] * x[i];
  return Math.sqrt(s / ((ate - de) * TAXA));
};
const db = (v: number) => 20 * Math.log10(v || 1e-9);

// "Voz" de 0,5 a 1,5 s sobre um chiado constante.
const comChiado = new Float32Array(TAXA * 2);
for (let i = 0; i < comChiado.length; i++) {
  comChiado[i] = (Math.random() * 2 - 1) * 0.004;
  if (i > TAXA * 0.5 && i < TAXA * 1.5) comChiado[i] += 0.3 * Math.sin((2 * Math.PI * 220 * i) / TAXA);
}
const limpo = gate(comChiado, TAXA, -40);
conferir('gate abafa o chiado entre as frases', db(rms(limpo, 0.05, 0.4)) < db(rms(comChiado, 0.05, 0.4)) - 20, `${db(rms(limpo, 0.05, 0.4)).toFixed(0)} dB`);
conferir('gate deixa a voz passar inteira', Math.abs(db(rms(limpo, 0.7, 1.3)) - db(rms(comChiado, 0.7, 1.3))) < 0.5, '');
conferir('gate não corta o começo da frase', db(rms(limpo, 0.5, 0.52)) > db(rms(comChiado, 0.5, 0.52)) - 3, '');

// Vogal (220 Hz) seguida de um "s" (ruído agudo).
const fala = new Float32Array(TAXA * 2);
let anterior = 0;
for (let i = 0; i < fala.length; i++) {
  if (i < TAXA) fala[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / TAXA);
  else {
    const r = Math.random() * 2 - 1;
    fala[i] = (r - anterior) * 0.25; // ruído com ênfase nos agudos
    anterior = r;
  }
}
const semS = deEsser(fala, TAXA, 1);
conferir('de-esser reduz o "s"', db(rms(semS, 1.2, 1.8)) < db(rms(fala, 1.2, 1.8)) - 3, `${(db(rms(semS, 1.2, 1.8)) - db(rms(fala, 1.2, 1.8))).toFixed(1)} dB`);
conferir('de-esser não mexe na vogal', Math.abs(db(rms(semS, 0.2, 0.8)) - db(rms(fala, 0.2, 0.8))) < 0.2, '');

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
