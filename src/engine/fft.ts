// Transformada de Fourier: decompõe um trecho de som nas frequências que o
// formam (e a inversa junta de volta). Radix-2, no lugar; os arrays precisam
// ter tamanho potência de 2.

export function fft(re: Float32Array, im: Float32Array, inversa = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let tam = 2; tam <= n; tam <<= 1) {
    const ang = ((inversa ? 2 : -2) * Math.PI) / tam;
    for (let i = 0; i < n; i += tam) {
      for (let k = 0; k < tam / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k);
        const a = i + k, b = i + k + tam / 2;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  if (inversa) for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}
