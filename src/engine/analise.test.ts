// Testes da análise de beat e de nível (rodam em `npm test`).

import { avisoDeNivel, detectarBpm, detectarTom } from './analise.ts';

const TAXA = 44100;
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe: string) {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}

// Batida sintética: bumbo em toda batida, chimbal nas colcheias.
function batida(bpm: number, segundos: number): Float32Array {
  const x = new Float32Array(TAXA * segundos);
  const passo = (60 / bpm) * TAXA;
  for (let b = 0; b * passo < x.length; b += 0.5) {
    const ini = Math.round(b * passo);
    const forte = Number.isInteger(b);
    for (let i = 0; i < 2000 && ini + i < x.length; i++) {
      const env = Math.exp(-i / (forte ? 600 : 150));
      x[ini + i] += forte ? 0.8 * env * Math.sin((2 * Math.PI * 60 * i) / TAXA) : 0.2 * env * (Math.random() * 2 - 1);
    }
  }
  return x;
}
for (const bpm of [90, 128, 140, 150]) {
  const r = detectarBpm(batida(bpm, 20), TAXA);
  conferir(`detecta ${bpm} BPM`, !!r && (r.bpm === bpm || r.alternativa === bpm), r ? `${r.bpm} (ou ${r.alternativa})` : 'nada');
}
conferir('silêncio não tem BPM', detectarBpm(new Float32Array(TAXA * 10), TAXA) === null, '');

// Música sintética: acordes do tom, com a tônica mais presente.
function musica(tonica: number, tercaMenor: boolean): Float32Array {
  const x = new Float32Array(TAXA * 16);
  const terca = tercaMenor ? 3 : 4;
  const sexta = tercaMenor ? 8 : 9;
  // Graus I, IV, V, I: acordes como semitons acima da tônica.
  const acordes = [[0, terca, 7], [5, sexta, 12], [7, tercaMenor ? 10 : 11, 14], [0, terca, 7]];
  acordes.forEach((acorde, k) => {
    for (const semi of [...acorde, acorde[0] - 12]) {
      const hz = 261.63 * 2 ** ((tonica + semi) / 12);
      for (let i = k * TAXA * 4; i < (k + 1) * TAXA * 4; i++) x[i] += 0.15 * Math.sin((2 * Math.PI * hz * i) / TAXA);
    }
  });
  return x;
}
const NOMES = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];
for (const [tonica, menor] of [[9, true], [0, false], [5, true], [7, false]] as [number, boolean][]) {
  const r = detectarTom(musica(tonica, menor), TAXA);
  const esperado = `${NOMES[tonica]} ${menor ? 'menor' : 'maior'}`;
  conferir(`detecta ${esperado}`, !!r && r.tom === tonica && (r.escala === 'menor') === menor, r ? `${NOMES[r.tom]} ${r.escala}` : 'nada');
}

const voz = (amp: number) => new Float32Array(TAXA).map((_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / TAXA));
conferir('avisa voz estourada', !!avisoDeNivel(voz(1))?.includes('estourou'), '');
conferir('avisa voz baixa', !!avisoDeNivel(voz(0.02))?.includes('baixa'), '');
conferir('não avisa em voz boa', avisoDeNivel(voz(0.4)) === null, '');

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
