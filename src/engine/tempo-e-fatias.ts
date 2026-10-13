// Três ferramentas para áudio pronto (um beat ou um loop importado):
//   - esticar: mudar o andamento sem mudar o tom;
//   - fatiar: achar os ataques de um loop para tocar seus pedaços;
//   - desafinacao: medir se a música está fora da afinação padrão.
// Funções puras sobre os samples.

import { fft } from './fft.ts';

/**
 * Muda a duração do áudio sem mudar a altura (WSOLA). O som é cortado em
 * janelas de 40 ms que se sobrepõem; para encurtar, as janelas são coladas
 * mais juntas, e para alongar, mais afastadas. Antes de colar cada janela,
 * procura-se, perto do ponto ideal, a posição em que ela melhor continua a
 * anterior, o que evita o som "picotado".
 * `fator` > 1 deixa mais rápido (mais curto). Soa bem entre 0,75 e 1,35.
 * Com vários canais, as mesmas posições valem para todos, para o estéreo não se desfazer.
 */
export function esticar(canais: Float32Array[], taxa: number, fator: number): Float32Array[] {
  const n = canais[0].length;
  if (Math.abs(fator - 1) < 0.002) return canais.map((c) => c.slice());
  const N = Math.round(taxa * 0.04) & ~1;
  const salto = N / 2;
  const busca = Math.round(taxa * 0.01);
  const guia = new Float32Array(n);
  for (const c of canais) for (let i = 0; i < n; i++) guia[i] += c[i] / canais.length;
  const tamanho = Math.floor(n / fator);
  const saidas = canais.map(() => new Float32Array(tamanho + N));
  const peso = new Float32Array(tamanho + N);
  const janela = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let anterior = 0; // onde a janela anterior foi lida
  for (let k = 0; k * salto + N < tamanho + N; k++) {
    const ideal = Math.round(k * salto * fator);
    let melhor = ideal;
    if (k > 0) {
      // A continuação natural da janela anterior começa em `anterior + salto`.
      const natural = anterior + salto;
      let maior = -Infinity;
      for (let d = -busca; d <= busca; d += 2) {
        const pos = ideal + d;
        if (pos < 0 || pos + N >= n || natural + N >= n) continue;
        let soma = 0;
        for (let i = 0; i < N; i += 4) soma += guia[pos + i] * guia[natural + i];
        if (soma > maior) {
          maior = soma;
          melhor = pos;
        }
      }
    }
    melhor = Math.max(0, Math.min(n - N - 1, melhor));
    anterior = melhor;
    const destino = k * salto;
    for (let c = 0; c < canais.length; c++) {
      const entrada = canais[c];
      const saida = saidas[c];
      for (let i = 0; i < N; i++) saida[destino + i] += entrada[melhor + i] * janela[i];
    }
    for (let i = 0; i < N; i++) peso[destino + i] += janela[i];
  }
  return saidas.map((s) => {
    for (let i = 0; i < s.length; i++) if (peso[i] > 1e-3) s[i] /= peso[i];
    return s.subarray(0, tamanho);
  });
}

/**
 * Divide um loop em fatias. No modo "ataques", cada fatia começa onde o som
 * dá um salto de volume (um bumbo, uma nota); no modo "grade", o loop é
 * cortado em partes iguais. Devolve o início de cada fatia, em segundos.
 */
export function fatiar(x: Float32Array, taxa: number, quantas: number, modo: 'ataques' | 'grade'): number[] {
  const duracao = x.length / taxa;
  if (modo === 'grade') return Array.from({ length: quantas }, (_, i) => (i * duracao) / quantas);
  const bloco = Math.round(taxa * 0.01);
  const n = Math.floor(x.length / bloco);
  const nivel = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let s = 0;
    for (let i = b * bloco; i < (b + 1) * bloco; i++) s += x[i] * x[i];
    nivel[b] = Math.sqrt(s / bloco);
  }
  // Ataque = quanto o volume subiu em relação aos 30 ms anteriores.
  const subida: { bloco: number; forca: number }[] = [];
  for (let b = 3; b < n; b++) {
    const antes = Math.max(nivel[b - 1], nivel[b - 2], nivel[b - 3]);
    const forca = nivel[b] - antes * 1.3;
    if (forca > 0.01) subida.push({ bloco: b, forca });
  }
  // Ficam os ataques mais fortes, com pelo menos 80 ms entre um e outro.
  subida.sort((a, b) => b.forca - a.forca);
  const escolhidos: number[] = [0];
  for (const s of subida) {
    if (escolhidos.length >= quantas) break;
    if (escolhidos.every((e) => Math.abs(e - s.bloco) > 8)) escolhidos.push(s.bloco);
  }
  return escolhidos.sort((a, b) => a - b).map((b) => (Math.max(0, b - 1) * bloco) / taxa);
}

/**
 * Quantos centésimos de semitom (cents) a música está acima ou abaixo da
 * afinação padrão (Lá = 440 Hz). Beats feitos com samples acelerados ou
 * desacelerados costumam ficar "entre as notas", e aí o tune puxa a voz para
 * notas que não batem com o beat. Devolve null se não houver notas claras.
 */
export function desafinacao(x: Float32Array, taxa: number): number | null {
  const D = 4;
  const y = new Float32Array(Math.floor(x.length / D));
  for (let i = 0; i < y.length; i++) y[i] = (x[i * D] + x[i * D + 1] + x[i * D + 2] + x[i * D + 3]) / 4;
  const taxaD = taxa / D;
  const N = 8192;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let somaCos = 0;
  let somaSen = 0;
  let total = 0;
  for (let ini = 0; ini + N <= y.length; ini += N) {
    for (let i = 0; i < N; i++) {
      re[i] = y[ini + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    const m = (k: number) => Math.hypot(re[k], im[k]);
    const de = Math.ceil((110 * N) / taxaD);
    const ate = Math.floor((1800 * N) / taxaD);
    let maior = 0;
    for (let k = de; k < ate; k++) maior = Math.max(maior, m(k));
    for (let k = de + 1; k < ate - 1; k++) {
      const a = m(k - 1), b = m(k), c = m(k + 1);
      if (b < maior * 0.25 || b <= a || b <= c) continue;
      // Pico entre dois pontos da transformada: a parábola pelos três dá a frequência fina.
      const fino = k + (0.5 * (a - c)) / (a - 2 * b + c);
      const midi = 69 + 12 * Math.log2((fino * taxaD) / N / 440);
      // Média circular: -49 e +49 cents são vizinhos, não opostos.
      const angulo = 2 * Math.PI * (midi - Math.round(midi));
      somaCos += b * Math.cos(angulo);
      somaSen += b * Math.sin(angulo);
      total += b;
    }
  }
  if (total === 0 || Math.hypot(somaCos, somaSen) / total < 0.3) return null;
  return (Math.atan2(somaSen, somaCos) / (2 * Math.PI)) * 100;
}
