// Teste do limitador sem navegador (roda em `npm test`).

import { limitar } from './limiter.ts';

const TAXA = 44100;
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}
const pico = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// Música "alta demais": seno com estouros aleatórios até 3x o máximo.
const esq = new Float32Array(TAXA * 2);
const dir = new Float32Array(TAXA * 2);
for (let i = 0; i < esq.length; i++) {
  const base = 0.6 * Math.sin((2 * Math.PI * 220 * i) / TAXA);
  const estouro = i % 20000 < 40 ? 2.4 * Math.sin(i) : 0;
  esq[i] = base + estouro;
  dir[i] = base * 0.8 - estouro * 0.5;
}
const teto = 10 ** (-1 / 20);
limitar([esq, dir], TAXA, -1);
conferir('nenhum pico passa de -1 dBFS', pico(esq) <= teto + 1e-6 && pico(dir) <= teto + 1e-6, `picos ${pico(esq).toFixed(4)} e ${pico(dir).toFixed(4)}`);

// Longe dos estouros o som precisa voltar ao volume original.
let longe = 0;
for (let i = 16000; i < 19000; i++) longe = Math.max(longe, Math.abs(esq[i]));
conferir('volume volta depois do pico', longe > 0.59, `pico no trecho calmo ${longe.toFixed(3)}`);

// Som que já cabe no teto não pode ser alterado.
const baixo = new Float32Array(TAXA);
for (let i = 0; i < baixo.length; i++) baixo[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / TAXA);
const copia = baixo.slice();
limitar([baixo], TAXA, -1);
conferir('não mexe em som abaixo do teto', baixo.every((v, i) => Math.abs(v - copia[i]) < 1e-6), '');

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
