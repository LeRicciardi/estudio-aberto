// Página Gravar: gravação de voz, contagem, microfone e lista de takes.

import { analisarAmbiente, avisoDeNivel } from '../engine/analise.ts';
import { listarMicrofones, medirLatencia } from '../engine/recorder.ts';
import { aplicarTimbre } from '../engine/vocalChain.ts';
import { av, avisosDeTake, engine, estado, gravador, id, mudou, prefs, projetoParaTocar, relogio } from '../estado.ts';
import { type Take, novoTake } from '../model/project.ts';
import { avisar, botaoGravar, botaoTocar, contagemEl, medidorDeEntrada, secGravar } from '../moldura.ts';
import { abrirCofre, fecharCofre, guardarAudio, guardarNoCofre, recuperarDoCofre } from '../storage.ts';
import { desenharTransporte, parar, tocar, trocarModo } from '../transporte.ts';
import { botao, campo, explicacao, h, seletor } from '../ui/controles.ts';
import { teleprompter } from './letra.ts';
import { onda } from './onda.ts';
import { desenharVozes, reafinar } from './voz.ts';

export function marcarGravacao(ligada: boolean) {
  estado.gravando = ligada;
  for (const b of [botaoGravar, botaoGravarGrande]) {
    b.textContent = ligada ? '■ Parar gravação' : '● Gravar voz';
    b.classList.toggle('ativo', ligada);
  }
}

/** Começa ou termina uma gravação. Com `refazer`, grava de novo o trecho daquele take. */
/**
 * Gravação em laço: um trecho de alguns compassos se repete e cada volta
 * vira um take. `voltas` guarda o instante (relógio de áudio) em que cada
 * volta começou, para depois cortar a gravação nos lugares certos.
 */
const laco = { compassos: Number(localStorage.getItem('estudio-aberto:laco')) || 0, inicio: 0, fim: 0, voltas: [] as number[], timer: 0, virando: false };

function vigiarLaco() {
  laco.inicio = estado.cursor;
  laco.fim = estado.cursor + (laco.compassos * 4 * 60) / estado.projeto.bpm;
  laco.voltas = [engine.t0];
  laco.timer = window.setInterval(() => {
    const resta = laco.fim - engine.posicao();
    if (!estado.gravando || laco.virando || resta > 0.15) return;
    // Perto do fim do trecho: agenda a próxima volta para começar exatamente quando esta acabar.
    laco.virando = true;
    void engine.tocar(projetoParaTocar(), laco.inicio, undefined, Math.max(0, resta - 0.06), true).then(() => {
      laco.voltas.push(engine.t0);
      laco.virando = false;
    });
  }, 20);
}

/** Corta a gravação contínua em um take por volta. Só o último fica ouvindo. */
async function terminarLaco(g: { amostras: Float32Array; taxa: number; inicio: number }) {
  window.clearInterval(laco.timer);
  const latencia = (estado.projeto.latenciaMs ?? latenciaEstimada()) / 1000;
  const fimDaGravacao = g.inicio + g.amostras.length / g.taxa;
  const novos: { take: Take; amostras: Float32Array }[] = [];
  laco.voltas.forEach((comeco, k) => {
    const fim = Math.min(laco.voltas[k + 1] ?? fimDaGravacao, fimDaGravacao);
    // A voz chega atrasada pelo microfone: o corte anda o mesmo tanto.
    const de = Math.max(0, Math.round((comeco - g.inicio + latencia) * g.taxa));
    const ate = Math.min(g.amostras.length, Math.round((fim - g.inicio + latencia) * g.taxa));
    if (ate - de < g.taxa) return;
    const take = novoTake(id(), `Take ${estado.projeto.takes.length + novos.length + 1} (volta ${k + 1})`, id(), laco.inicio, estado.projeto.voz);
    aplicarTimbre(take, take.preset);
    take.mudo = true;
    novos.push({ take, amostras: g.amostras.slice(de, ate) });
  });
  laco.voltas = [];
  if (!novos.length) {
    void desenharGravar();
    return avisar('Gravação curta demais, nada foi salvo.');
  }
  novos[novos.length - 1].take.mudo = false;
  for (const { take, amostras } of novos) {
    const buffer = engine.ctx.createBuffer(1, amostras.length, g.taxa);
    buffer.copyToChannel(amostras, 0);
    engine.buffers.set(take.audioId, buffer);
    estado.projeto.takes.push(take);
  }
  mudou();
  desenharVozes();
  void desenharGravar();
  avisar(`${novos.length} takes gravados, um por volta. O último está ouvindo; os outros ficaram mudos. Em Voz → Montagem dá para juntar o melhor de cada um.`);
  for (const { take, amostras } of novos) {
    await guardarAudio(take.audioId, { tipo: 'pcm', taxa: g.taxa, amostras });
    void reafinar(take);
  }
}

let cofre = 0;
let trava: WakeLockSentinel | undefined;

/** Ao abrir o estúdio: se uma gravação foi interrompida por uma queda, ela volta como take. */
export async function recuperarGravacao() {
  const r = await recuperarDoCofre();
  if (r) {
    const take = novoTake(id(), 'Take recuperado', id(), r.inicio, estado.projeto.voz);
    aplicarTimbre(take, take.preset);
    const buffer = engine.ctx.createBuffer(1, r.amostras.length, r.taxa);
    buffer.copyToChannel(r.amostras, 0);
    engine.buffers.set(take.audioId, buffer);
    estado.projeto.takes.push(take);
    mudou();
    await guardarAudio(take.audioId, { tipo: 'pcm', taxa: r.taxa, amostras: r.amostras });
    desenharVozes();
    void desenharGravar();
    avisar('Uma gravação tinha sido interrompida e foi recuperada como "Take recuperado". Confira o alinhamento com o beat.');
  }
  await fecharCofre();
}

export async function alternarGravacao(refazer?: Take) {
  if (estado.gravando) return terminarGravacao();
  parar();
  if (estado.modo === 'padrao') {
    estado.modo = 'musica';
    desenharTransporte();
  }
  // Regravação: volta um compasso antes do trecho, para a pessoa ouvir o que
  // vem antes, pegar o tom e a energia e entrar cantando no ponto.
  if (refazer) estado.cursor = Math.max(0, refazer.inicio - (4 * 60) / estado.projeto.bpm);
  try {
    await engine.ctx.resume();
    await gravador.iniciar(prefs.microfone || undefined);
  } catch {
    avisar('Não consegui acessar o microfone. Libere a permissão no navegador e tente de novo.');
    return;
  }
  estado.regravando = refazer;
  marcarGravacao(true);
  // Cofre: a gravação é guardada a cada 3 segundos, para sobreviver a uma queda.
  abrirCofre(engine.ctx.sampleRate, estado.cursor);
  cofre = window.setInterval(() => void guardarNoCofre(gravador.novos()), 3000);
  // Mantém a tela acesa: tela apagada pode cortar o microfone no celular.
  trava = await navigator.wakeLock?.request('screen').catch(() => undefined);
  avisar('Gravando. Use fone de ouvido, senão o beat vaza para o microfone.');
  // Contagem: um compasso de estalos para a pessoa entrar no tempo.
  const espera = prefs.contagem ? engine.contar(estado.projeto.bpm) : 0;
  await engine.tocar(projetoParaTocar(), estado.cursor, undefined, espera);
  if (laco.compassos && !refazer) vigiarLaco();
  void desenharGravar();
}

botaoGravar.onclick = () => void alternarGravacao();

export const botaoGravarGrande = h('button', { className: 'gravar grande', onclick: () => void alternarGravacao() }, '● Gravar voz');

export async function terminarGravacao() {
  window.clearInterval(cofre);
  void trava?.release();
  const g = gravador.parar();
  void fecharCofre();
  const { t0, desde } = engine;
  const antigo = estado.regravando;
  estado.regravando = undefined;
  marcarGravacao(false);
  engine.parar();
  botaoTocar.textContent = '▶ Tocar';
  estado.cursor = laco.voltas.length ? laco.inicio : desde;
  engine.desde = estado.cursor;
  if (laco.voltas.length) return terminarLaco(g);

  // O som que você ouviu saiu atrasado da placa, e sua voz chegou atrasada
  // pelo microfone. Descontar esse atraso alinha o take com o beat.
  const latencia = (estado.projeto.latenciaMs ?? latenciaEstimada()) / 1000;
  let inicio = desde + (g.inicio - t0) - latencia;
  let amostras = g.amostras;
  // Descarta o que foi captado durante a contagem, deixando um respiro de 1/4 de segundo.
  const sobra = desde - 0.25 - inicio;
  if (sobra > 0) {
    const corte = Math.min(amostras.length, Math.round(sobra * g.taxa));
    amostras = amostras.slice(corte);
    inicio += corte / g.taxa;
  }
  if (amostras.length < g.taxa * 0.3) {
    void desenharGravar();
    return avisar('Gravação curta demais, nada foi salvo.');
  }

  const take = novoTake(id(), `Take ${estado.projeto.takes.length + 1}`, id(), inicio, estado.projeto.voz);
  aplicarTimbre(take, take.preset);
  const buffer = engine.ctx.createBuffer(1, amostras.length, g.taxa);
  buffer.copyToChannel(amostras, 0);
  engine.buffers.set(take.audioId, buffer);
  take.naMontagem = estado.projeto.montagem.ligada;
  if (antigo) antigo.mudo = true;
  estado.projeto.takes.push(take);
  const nivel = avisoDeNivel(amostras);
  if (nivel) avisosDeTake.set(take.id, nivel);
  mudou();
  desenharVozes();
  void desenharGravar();
  avisar(nivel ?? (antigo
    ? `${take.nome} gravado. O take anterior (${antigo.nome}) ficou mudo; em "Voz" dá para juntar o melhor dos dois.`
    : `${take.nome} gravado. Ouça e, se a voz estiver fora do tempo, use "Medir atraso deste aparelho".`));
  await guardarAudio(take.audioId, { tipo: 'pcm', taxa: g.taxa, amostras });
  // Pede ao navegador para não apagar o áudio guardado quando faltar espaço.
  void navigator.storage?.persist?.();
  void reafinar(take);
}

export function latenciaEstimada(): number {
  const { baseLatency, outputLatency } = engine.ctx;
  return Math.round((baseLatency + (outputLatency || 0) + gravador.latenciaDeEntrada) * 1000);
}

let ambiente: string[] = [];

/** Grava 4 segundos (silêncio e uma palma) e diz se o lugar serve para gravar. */
async function testarAmbiente() {
  if (engine.tocando || estado.gravando) return;
  try {
    avisar('Testando o lugar: fique em silêncio e, quando quiser, bata UMA palma forte. 4 segundos...');
    await engine.ctx.resume();
    await gravador.iniciar(prefs.microfone || undefined);
    await new Promise((ok) => setTimeout(ok, 4000));
    const g = gravador.parar();
    ambiente = analisarAmbiente(g.amostras, g.taxa).avisos;
    avisar('Teste do lugar concluído.');
  } catch {
    avisar('Não consegui acessar o microfone.');
  }
  void desenharGravar();
}

/** Traz um áudio de fora (mensagem de voz, gravador do celular) como um take, no ponto onde a música está. */
export async function importarVoz(arquivo: File) {
  try {
    const decodificado = await engine.ctx.decodeAudioData(await arquivo.arrayBuffer());
    // Takes são mono: soma os canais.
    const amostras = new Float32Array(decodificado.length);
    for (let c = 0; c < decodificado.numberOfChannels; c++) {
      const canal = decodificado.getChannelData(c);
      for (let i = 0; i < amostras.length; i++) amostras[i] += canal[i] / decodificado.numberOfChannels;
    }
    const take = novoTake(id(), arquivo.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Voz importada', id(), estado.cursor, estado.projeto.voz);
    aplicarTimbre(take, take.preset);
    const buffer = engine.ctx.createBuffer(1, amostras.length, decodificado.sampleRate);
    buffer.copyToChannel(amostras, 0);
    engine.buffers.set(take.audioId, buffer);
    estado.projeto.takes.push(take);
    const nivel = avisoDeNivel(amostras);
    if (nivel) avisosDeTake.set(take.id, nivel);
    mudou();
    desenharVozes();
    void desenharGravar();
    avisar(nivel ?? `"${take.nome}" entrou como take, começando onde a música estava. Ajuste o começo em Voz → Edição.`);
    await guardarAudio(take.audioId, { tipo: 'pcm', taxa: decodificado.sampleRate, amostras });
    void reafinar(take);
  } catch {
    avisar('Não consegui ler esse áudio. Mensagens de voz do WhatsApp (.opus) abrem no Chrome e no Firefox; no iPhone, converta antes para MP3 ou M4A.');
  }
}

export async function desenharGravar() {
  const arquivoDeVoz = h('input', { type: 'file', accept: 'audio/*,.opus,.ogg,.m4a' });
  arquivoDeVoz.onchange = () => arquivoDeVoz.files?.[0] && void importarVoz(arquivoDeVoz.files[0]);
  const contagem = h('input', { type: 'checkbox', checked: prefs.contagem });
  contagem.onchange = () => {
    prefs.contagem = contagem.checked;
    localStorage.setItem('estudio-aberto:contagem', prefs.contagem ? 'sim' : 'nao');
  };
  const latencia = h('input', { type: 'number', min: '0', max: '500', placeholder: 'automático', value: estado.projeto.latenciaMs === null ? '' : String(estado.projeto.latenciaMs) });
  latencia.onchange = () => {
    estado.projeto.latenciaMs = latencia.value === '' ? null : Math.max(0, Number(latencia.value));
    mudou();
  };
  // A lista de microfones só tem nomes depois que a pessoa deu permissão.
  const microfones = await listarMicrofones().catch(() => []);
  const escolha = microfones.length > 1
    ? seletor('Microfone', [['', 'Padrão do sistema'] as [string, string], ...microfones.map((m) => [m.id, m.nome] as [string, string])], prefs.microfone, (v) => {
        prefs.microfone = v;
        localStorage.setItem('estudio-aberto:microfone', v);
      })
    : '';

  const lista = estado.projeto.takes.map((take) => {
    const buffer = engine.buffers.get(take.audioId);
    const alerta = avisosDeTake.get(take.id);
    return h('article', { className: 'take' },
      h('div', { className: 'linha' },
        h('strong', {}, take.nome),
        h('span', { className: 'nota' }, `${buffer ? relogio(buffer.duration) : '?'} · começa em ${relogio(Math.max(0, take.inicio))}${take.mudo ? ' · mudo' : ''}`),
      ),
      onda(take),
      alerta ? h('p', { className: 'nota alerta' }, alerta) : '',
      h('div', { className: 'linha' },
        botao('▶ Ouvir', () => {
          if (estado.modo === 'padrao') trocarModo('musica');
          estado.cursor = Math.max(0, take.inicio);
          engine.desde = estado.cursor;
          void tocar();
        }),
        botao('Gravar de novo este trecho', () => void alternarGravacao(take)),
        botao('Apagar', () => {
          estado.projeto.takes = estado.projeto.takes.filter((t) => t.id !== take.id);
          mudou();
          desenharVozes();
          void desenharGravar();
          avisar(`${take.nome} apagado. Use "Desfazer" se foi engano.`);
        }, 'perigo'),
      ),
    );
  });

  secGravar.replaceChildren(
    h('h2', {}, 'Gravar'),
    h('p', { className: 'nota' }, 'Coloque o fone (de preferência com fio), aperte gravar e cante em cima do beat. A gravação começa de onde a música estiver; cada gravação vira um take.'),
    h('div', { className: 'linha palco' }, botaoGravarGrande, contagemEl),
    campo('Nível do microfone', medidorDeEntrada),
    teleprompter,
    h('div', { className: 'linha' },
      botao('Testar o lugar de gravação', () => void testarAmbiente()),
      campo('Trazer uma voz já gravada (WhatsApp, gravador do celular)', arquivoDeVoz),
    ),
    ...ambiente.map((a) => h('p', { className: 'nota alerta' }, a)),
    h('div', { className: 'linha' },
      h('label', { className: 'caixa' }, contagem, 'Contagem de 4 antes de gravar'),
      seletor('Gravar em laço', [[0, 'Desligado'], [2, 'Repetir 2 compassos'], [4, 'Repetir 4 compassos'], [8, 'Repetir 8 compassos']] as [number, string][], laco.compassos, (v) => {
        laco.compassos = v;
        localStorage.setItem('estudio-aberto:laco', String(v));
      }),
      escolha,
    ),
    ...lista,
    h('h3', {}, 'Voz fora do tempo?'),
    h('p', { className: 'nota' }, 'Todo aparelho atrasa o som um pouco. Fone Bluetooth atrasa muito e de forma irregular: prefira fone com fio para gravar.'),
    h('div', { className: 'linha' },
      av(campo('Compensação de atraso (ms)', latencia)),
      botao('Medir atraso deste aparelho', async () => {
        if (engine.tocando || estado.gravando) return;
        avisar('Medindo: tire o fone, aumente o volume e fique em silêncio por 4 segundos.');
        try {
          const atraso = await medirLatencia(engine.ctx, gravador, prefs.microfone || undefined);
          if (atraso === null) return avisar('O microfone não ouviu os estalos. Tire o fone, aumente o volume e tente de novo.');
          estado.projeto.latenciaMs = Math.round(atraso * 1000);
          mudou();
          void desenharGravar();
          avisar(`Atraso medido: ${estado.projeto.latenciaMs} ms. As próximas gravações já saem alinhadas.`);
        } catch {
          avisar('Não consegui acessar o microfone.');
        }
      }),
    ),
    explicacao([
      'Contagem: quatro estalos no andamento da música antes de o beat entrar, para você começar no tempo.',
      'Nível do microfone: enquanto grava, a barra deve ficar no meio. Vermelha quer dizer que a voz está estourando.',
      'Gravar em laço: o trecho escolhido se repete sem parar e cada volta vira um take. Cante várias vezes seguidas, pare, e depois escolha o melhor de cada volta na Montagem.',
      'Gravar de novo: regrava a partir do mesmo ponto. O take antigo fica mudo, não é apagado.',
    ]),
  );
}
