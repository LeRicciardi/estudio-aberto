// Limitador de pico com antecipação ("lookahead"). Garante que nenhum sample
// passe do teto, sem distorcer: como ele enxerga alguns milissegundos à
// frente, começa a abaixar o volume antes do pico chegar e solta depois.
// Função pura sobre os samples; altera os canais no lugar.

export function limitar(canais: Float32Array[], taxa: number, tetoDb: number, soltaSeg = 0.08) {
  const n = canais[0].length;
  const teto = 10 ** (tetoDb / 20);
  const L = Math.max(1, Math.round(taxa * 0.005));

  // 1. Ganho que cada instante precisaria, sozinho, para caber no teto.
  const ganho = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let pico = 0;
    for (const c of canais) pico = Math.max(pico, Math.abs(c[i]));
    ganho[i] = pico > teto ? teto / pico : 1;
  }

  // 2. Antecipação: em cada instante vale o menor ganho dos próximos L samples
  //    (mínimo deslizante com fila monotônica).
  const minimo = new Float32Array(n);
  const fila = new Int32Array(n);
  let ini = 0;
  let fim = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (fim > ini && ganho[fila[fim - 1]] >= ganho[i]) fim--;
    fila[fim++] = i;
    while (fila[ini] > i + L - 1) ini++;
    minimo[i] = ganho[fila[ini]];
  }

  // 3. Soltura: depois do pico, o volume volta aos poucos, não de uma vez.
  const coef = 1 - Math.exp(-1 / (taxa * soltaSeg));
  let env = 1;
  for (let i = 0; i < n; i++) {
    env = Math.min(minimo[i], env + (1 - env) * coef);
    minimo[i] = env;
  }

  // 4. Média dos últimos L valores: transforma degraus em rampas. Como todos
  //    os valores da janela já respeitam o pico atual, a média também respeita.
  let soma = 0;
  for (let i = 0; i < n; i++) {
    soma += minimo[i];
    if (i >= L) soma -= minimo[i - L];
    const g = soma / Math.min(i + 1, L);
    for (const c of canais) c[i] *= g;
  }
}
