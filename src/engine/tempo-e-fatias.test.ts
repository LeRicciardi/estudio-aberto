// Testes de esticar, fatiar e desafinação (rodam em `npm test`).

import { detectarPitch } from './tune.ts';
import { desafinacao, esticar, fatiar } from './tempo-e-fatias.ts';

const TAXA = 44100;
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}
const seno = (hz: number, seg: number, amp = 0.4) => new Float32Array(Math.floor(TAXA * seg)).map((_, i) => amp * Math.sin((2 * Math.PI * hz * i) / TAXA));
const pitch = (x: Float32Array) => {
  const f = [...detectarPitch(x, TAXA)].filter((v) => v > 0);
  return f.slice(Math.floor(f.length * 0.2), Math.floor(f.length * 0.8)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(f.length * 0.6));
};
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

for (const fator of [1.15, 0.85]) {
  const [y] = esticar([seno(220, 4)], TAXA, fator);
  const cents = 1200 * Math.log2(pitch(y) / 220);
  conferir(`esticar ${fator}x muda a duração e mantém o tom`, Math.abs(y.length / TAXA - 4 / fator) < 0.05 && Math.abs(cents) < 10, `${(y.length / TAXA).toFixed(2)} s, ${cents.toFixed(1)} cents`);
  conferir(`esticar ${fator}x mantém o volume`, Math.abs(20 * Math.log10(rms(y) / rms(seno(220, 4)))) < 1, `${(20 * Math.log10(rms(y) / rms(seno(220, 4)))).toFixed(2)} dB`);
}
const [esq, dir] = esticar([seno(220, 2), seno(330, 2)], TAXA, 1.1);
conferir('esticar mantém os canais com o mesmo tamanho', esq.length === dir.length);

// Loop com quatro batidas, uma a cada 0,5 s.
const loop = new Float32Array(TAXA * 2);
for (const t of [0, 0.5, 1, 1.5]) for (let i = 0; i < 4000; i++) loop[Math.floor(t * TAXA) + i] += 0.8 * Math.exp(-i / 800) * Math.sin((2 * Math.PI * 80 * i) / TAXA);
const cortes = fatiar(loop, TAXA, 4, 'ataques');
conferir('fatiar acha as quatro batidas', cortes.length === 4 && cortes.every((c, i) => Math.abs(c - i * 0.5) < 0.03), cortes.map((c) => c.toFixed(2)).join(', '));
conferir('fatiar em grade divide em partes iguais', fatiar(loop, TAXA, 8, 'grade')[3] === 0.75);

for (const cents of [0, 30, -25]) {
  const f = 2 ** (cents / 1200);
  const x = seno(220 * f, 4, 0.3).map((v, i) => v + 0.2 * Math.sin((2 * Math.PI * 329.63 * f * i) / TAXA) + 0.2 * Math.sin((2 * Math.PI * 440 * f * i) / TAXA));
  const medido = desafinacao(x, TAXA);
  conferir(`mede afinação de ${cents} cents`, medido !== null && Math.abs(medido - cents) < 6, `${medido?.toFixed(1)} cents`);
}
conferir('ruído não tem afinação', desafinacao(new Float32Array(TAXA * 2).map(() => Math.random() - 0.5), TAXA) === null);

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
