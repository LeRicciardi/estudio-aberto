// Limpeza da gravação, feita antes do tune e dos efeitos:
//   - Gate: abafa o que sobra entre as frases (chiado, ventilador, respiração
//     do ambiente), deixando passar só quando há voz.
//   - De-esser: segura os "s" e "ch" quando ficam ardidos.
// Funções puras sobre os samples.

/**
 * Gate. Quando o volume fica abaixo de `limiarDb`, o som é reduzido em 30 dB
 * (não some de vez, o que soaria artificial). Abre rápido para não comer o
 * começo das palavras e fecha devagar para não cortar o fim.
 */
export function gate(x: Float32Array, taxa: number, limiarDb: number): Float32Array {
  const limiar = 10 ** (limiarDb / 20);
  const piso = 10 ** (-30 / 20);
  const janela = Math.round(taxa * 0.01);
  const antecipa = Math.round(taxa * 0.005);
  const segura = Math.round(taxa * 0.12);
  const abre = 1 - Math.exp(-1 / (taxa * 0.003));
  const fecha = 1 - Math.exp(-1 / (taxa * 0.15));
  const y = new Float32Array(x.length);
  let soma = 0;
  let aberto = 0;
  let ganho = piso;
  for (let i = 0; i < x.length; i++) {
    // Volume médio dos 10 ms à frente (olhar adiante evita cortar a primeira sílaba).
    const frente = i + antecipa;
    if (frente < x.length) soma += x[frente] * x[frente];
    if (frente - janela >= 0) soma -= x[frente - janela] * x[frente - janela];
    if (Math.sqrt(Math.max(0, soma) / janela) > limiar) aberto = segura;
    else if (aberto > 0) aberto--;
    const alvo = aberto > 0 ? 1 : piso;
    ganho += (alvo - ganho) * (alvo > ganho ? abre : fecha);
    y[i] = x[i] * ganho;
  }
  return y;
}

/**
 * De-esser. Separa os agudos acima de 5,5 kHz, onde moram os "s". Quando
 * essa faixa domina o som (sinal de sibilância), ela é reduzida em até
 * 12 dB, conforme `quanto` (0 a 1). O resto da voz não é tocado.
 */
export function deEsser(x: Float32Array, taxa: number, quanto: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * 5500) / taxa);
  const sobe = 1 - Math.exp(-1 / (taxa * 0.001));
  const desce = 1 - Math.exp(-1 / (taxa * 0.04));
  const reducaoMax = 1 - 10 ** ((-12 * quanto) / 20);
  const y = new Float32Array(x.length);
  let grave = 0;
  let envAgudo = 0;
  let envTotal = 0;
  for (let i = 0; i < x.length; i++) {
    grave = (1 - a) * x[i] + a * grave;
    const agudo = x[i] - grave;
    const na = Math.abs(agudo);
    const nt = Math.abs(x[i]);
    envAgudo += (na - envAgudo) * (na > envAgudo ? sobe : desce);
    envTotal += (nt - envTotal) * (nt > envTotal ? sobe : desce);
    // Sibilância: agudos fortes e respondendo por boa parte do som.
    const proporcao = envTotal > 1e-4 ? envAgudo / envTotal : 0;
    const sibilancia = envAgudo > 0.01 ? Math.min(1, Math.max(0, (proporcao - 0.35) / 0.3)) : 0;
    y[i] = x[i] - agudo * reducaoMax * sibilancia;
  }
  return y;
}
