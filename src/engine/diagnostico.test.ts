// Testes do diagnóstico da mix e da curva de espaço (rodam em `npm test`).

import { camelot, diagnosticar, energiaPorFaixa } from './diagnostico.ts';
import { curvaDeGanho, presencaDaVoz, TAXA_DA_CURVA } from './espaco.ts';

const TAXA = 44100;
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome} — ${detalhe}`);
  if (!ok) falhas++;
}
const seno = (hz: number, amp: number, seg: number) => new Float32Array(TAXA * seg).map((_, i) => amp * Math.sin((2 * Math.PI * hz * i) / TAXA));
const soma = (...xs: Float32Array[]) => xs[0].map((_, i) => xs.reduce((s, x) => s + x[i], 0));
const ruido = (amp: number, seg: number) => new Float32Array(TAXA * seg).map(() => (Math.random() * 2 - 1) * amp);

conferir('Camelot: Lá menor = 8A, Dó maior = 8B, Mi menor = 9A, Fá# maior = 2B',
  camelot(9, 'menor') === '8A' && camelot(0, 'maior') === '8B' && camelot(4, 'menor') === '9A' && camelot(6, 'maior') === '2B');

const [grave, agudo] = energiaPorFaixa(seno(300, 0.5, 2), TAXA, [[200, 450], [2000, 5000]]);
conferir('energia por faixa separa grave de agudo', grave > agudo + 40, `${grave.toFixed(0)} dB vs ${agudo.toFixed(0)} dB`);

// Voz de 2 a 4 s numa música de 6 s: o beat só deve ceder nesse intervalo.
const presenca = presencaDaVoz([{ amostras: seno(220, 0.3, 2), taxa: TAXA, inicio: 2, volume: 1 }], 6);
const ganho = curvaDeGanho(presenca, 3);
const em = (s: number) => ganho[Math.round(s * TAXA_DA_CURVA)];
conferir('beat cede só onde há voz', em(1) > 0.99 && em(3) < 0.72 && em(5.5) > 0.97, `${em(1).toFixed(2)} / ${em(3).toFixed(2)} / ${em(5.5).toFixed(2)}`);
conferir('take mudo não abaixa o beat', presencaDaVoz([{ amostras: seno(220, 0.3, 2), taxa: TAXA, inicio: 2, volume: 0 }], 6).every((v) => v === 0));

const base = { taxa: TAXA, picoDasGravacoes: 0.5, alvoLufs: -14 as number | null };
const vozBoa = soma(seno(250, 0.12, 6), seno(1500, 0.2, 6), seno(3000, 0.12, 6));
const beatBom = soma(seno(60, 0.3, 6), seno(500, 0.1, 6));
const titulos = (a: ReturnType<typeof diagnosticar>) => a.filter((x) => x.gravidade !== 'ok').map((x) => x.titulo).join(' | ');

const limpo = diagnosticar({ ...base, voz: [vozBoa, vozBoa], beat: [beatBom, beatBom], mix: [soma(vozBoa, beatBom), soma(vozBoa, beatBom)] });
conferir('mix saudável não gera alarme', limpo.every((a) => a.gravidade === 'ok'), titulos(limpo));

const vozBaixa = vozBoa.map((v) => v * 0.2);
const baixa = diagnosticar({ ...base, voz: [vozBaixa, vozBaixa], beat: [beatBom, beatBom], mix: [soma(vozBaixa, beatBom), soma(vozBaixa, beatBom)] });
conferir('detecta voz baixa', baixa.some((a) => a.correcao?.tipo === 'volumeDaVoz' && a.correcao.db > 0), titulos(baixa));

const beatCheio = soma(beatBom, seno(3200, 0.25, 6));
const coberta = diagnosticar({ ...base, voz: [vozBoa, vozBoa], beat: [beatCheio, beatCheio], mix: [soma(vozBoa, beatCheio), soma(vozBoa, beatCheio)] });
conferir('detecta beat cobrindo a voz', coberta.some((a) => a.correcao?.tipo === 'abrirEspaco'), titulos(coberta));

const vozComS = soma(vozBoa, ruido(0.6, 6).map((v, i, x) => v - (x[i - 1] ?? 0)));
const ardida = diagnosticar({ ...base, voz: [vozComS, vozComS], beat: [beatBom, beatBom], mix: [soma(vozComS, beatBom), soma(vozComS, beatBom)] });
conferir('detecta sibilância', ardida.some((a) => a.correcao?.tipo === 'deEsser'), titulos(ardida));

const invertido = soma(vozBoa, beatBom).map((v) => -v * 0.9);
const semMono = diagnosticar({ ...base, voz: [vozBoa, vozBoa], beat: [beatBom, beatBom], mix: [soma(vozBoa, beatBom), invertido] });
conferir('detecta perda em mono', semMono.some((a) => a.correcao?.tipo === 'fecharEstereo'), titulos(semMono));

const estourada = diagnosticar({ ...base, picoDasGravacoes: 1, voz: [vozBoa, vozBoa], beat: [beatBom, beatBom], mix: [soma(vozBoa, beatBom), soma(vozBoa, beatBom)] });
conferir('detecta gravação estourada', estourada.some((a) => a.correcao?.tipo === 'regravar'), titulos(estourada));

const semVoz = diagnosticar({ ...base, voz: [new Float32Array(TAXA * 2)], beat: [seno(60, 0.3, 2)], mix: [seno(60, 0.3, 2)] });
conferir('sem voz, pede para gravar', semVoz.length === 1 && semVoz[0].titulo.includes('Sem voz'));

if (falhas) throw new Error(`${falhas} teste(s) falharam`);
