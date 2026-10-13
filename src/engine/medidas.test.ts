// Testes do medidor LUFS e da medição de atraso (rodam em `npm test`).

import { medirLufs } from './loudness.ts';
import { atrasoDosEstalos } from './latencia.ts';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

// Valor de referência da norma: seno de 1 kHz em volume máximo, em um canal, mede -3,01 LUFS.
for (const taxa of [44100, 48000]) {
  const seno = new Float32Array(taxa * 5);
  for (let i = 0; i < seno.length; i++) seno[i] = Math.sin((2 * Math.PI * 997 * i) / taxa);
  const medido = medirLufs([seno], taxa);
  conferir(`LUFS de referência a ${taxa} Hz`, Math.abs(medido + 3.01) < 0.1, `${medido.toFixed(2)} LUFS`);
  const metade = seno.map((v) => v / 2);
  conferir(`metade do volume = 6 LU a menos (${taxa} Hz)`, Math.abs(medirLufs([metade], taxa) - (medido - 6.02)) < 0.05, '');
}
conferir('silêncio não tem volume', medirLufs([new Float32Array(48000)], 48000) === -Infinity, '');

// Gravação simulada: ruído de fundo + 5 estalos que chegam 137 ms depois do esperado.
const TAXA = 48000;
const gravacao = new Float32Array(TAXA * 4).map(() => (Math.random() - 0.5) * 0.004);
const esperados = [0.5, 1, 1.5, 2, 2.5];
for (const e of esperados) {
  const ini = Math.round((e + 0.137) * TAXA);
  for (let i = 0; i < 200; i++) gravacao[ini + i] += 0.5 * Math.sin((2 * Math.PI * 1000 * i) / TAXA + 1);
}
const atraso = atrasoDosEstalos(gravacao, TAXA, esperados);
conferir('mede atraso de 137 ms', atraso !== null && Math.abs(atraso - 0.137) < 0.002, `${atraso === null ? 'nada' : (atraso * 1000).toFixed(1) + ' ms'}`);
const semEstalo = new Float32Array(TAXA * 4).map(() => (Math.random() - 0.5) * 0.004);
conferir('sem estalos, não inventa valor', atrasoDosEstalos(semEstalo, TAXA, esperados) === null, '');

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
