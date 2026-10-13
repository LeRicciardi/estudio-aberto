// Testes do gate e do de-esser (rodam em `npm test`).

import { analisarAmbiente } from './analise.ts';
import { sugerirAjustes } from './diagnostico.ts';
import { deEsser, fimDasFrases, gate, nivelar, reduzirRuido } from './limpeza.ts';

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

// Redução de ruído: tom de 220 Hz de 1 a 2 s sobre chiado constante.
const sujo = new Float32Array(TAXA * 3);
for (let i = 0; i < sujo.length; i++) {
  sujo[i] = (Math.random() * 2 - 1) * 0.02;
  if (i > TAXA && i < TAXA * 2) sujo[i] += 0.3 * Math.sin((2 * Math.PI * 220 * i) / TAXA);
}
const semRuido = reduzirRuido(sujo, TAXA, 1);
conferir('redução de ruído abaixa o chiado', db(rms(semRuido, 0.2, 0.8)) < db(rms(sujo, 0.2, 0.8)) - 10, `${(db(rms(semRuido, 0.2, 0.8)) - db(rms(sujo, 0.2, 0.8))).toFixed(1)} dB`);
conferir('redução de ruído preserva a voz', Math.abs(db(rms(semRuido, 1.2, 1.8)) - db(rms(sujo, 1.2, 1.8))) < 1, `${(db(rms(semRuido, 1.2, 1.8)) - db(rms(sujo, 1.2, 1.8))).toFixed(2)} dB`);

// Nivelamento: três frases, a do meio bem mais baixa.
const frases = new Float32Array(TAXA * 6);
for (const [ini, amp] of [[0.5, 0.3], [2.5, 0.08], [4.5, 0.3]]) {
  for (let i = Math.floor(ini * TAXA); i < Math.floor((ini + 1) * TAXA); i++) frases[i] = amp * Math.sin((2 * Math.PI * 220 * i) / TAXA);
}
const nivelado = nivelar(frases, TAXA, 1);
conferir('nivelamento sobe a frase baixa', db(rms(nivelado, 2.7, 3.3)) > db(rms(frases, 2.7, 3.3)) + 4, `${(db(rms(nivelado, 2.7, 3.3)) - db(rms(frases, 2.7, 3.3))).toFixed(1)} dB`);
conferir('nivelamento não mexe na frase normal', Math.abs(db(rms(nivelado, 0.7, 1.3)) - db(rms(frases, 0.7, 1.3))) < 0.5, '');

const fins = fimDasFrases(frases, TAXA);
conferir('acha o fim das três frases', fins.length === 3 && Math.abs(fins[0] - 1.5) < 0.1 && Math.abs(fins[2] - 5.5) < 0.1, fins.map((f) => f.toFixed(2)).join(', '));

// Ambiente: fundo quieto com uma palma que some rápido, e depois com uma que demora.
function sala(ruidoAmp: number, decaimento: number): Float32Array {
  const x = new Float32Array(TAXA * 3).map(() => (Math.random() * 2 - 1) * ruidoAmp);
  for (let i = 0; i < TAXA; i++) x[TAXA + i] += 0.8 * Math.exp(-i / (TAXA * decaimento)) * (Math.random() * 2 - 1);
  return x;
}
const boa = analisarAmbiente(sala(0.0005, 0.02), TAXA);
conferir('ambiente bom é reconhecido', boa.avisos.length === 1 && boa.avisos[0].includes('bom'), `ruído ${boa.ruidoDb.toFixed(0)} dB, eco ${boa.eco?.toFixed(2)} s`);
const ruim = analisarAmbiente(sala(0.02, 0.25), TAXA);
conferir('ambiente barulhento e com eco é avisado', ruim.avisos.some((a) => a.includes('barulhento')) && ruim.avisos.some((a) => a.includes('ecoa')), `ruído ${ruim.ruidoDb.toFixed(0)} dB, eco ${ruim.eco?.toFixed(2)} s`);

// Ajuste ao take: gravação baixa e abafada.
const abafada = new Float32Array(TAXA * 3).map((_, i) => 0.02 * Math.sin((2 * Math.PI * 300 * i) / TAXA) + 0.002 * Math.sin((2 * Math.PI * 2000 * i) / TAXA));
const sug = sugerirAjustes(abafada, TAXA);
conferir('sugere ganho e corte de corpo para voz baixa e abafada', sug.ganhoDb > 6 && sug.graveDb < 0, `ganho ${sug.ganhoDb.toFixed(0)} dB, corpo ${sug.graveDb} dB`);

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
