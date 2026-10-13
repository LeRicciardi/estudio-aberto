// Página Gravar: gravação de voz, contagem, microfone e lista de takes.

import { avisoDeNivel } from '../engine/analise.ts';
import { listarMicrofones, medirLatencia } from '../engine/recorder.ts';
import { aplicarTimbre } from '../engine/vocalChain.ts';
import { av, avisosDeTake, engine, estado, gravador, id, mudou, prefs, projetoParaTocar, relogio } from '../estado.ts';
import { type Take, novoTake } from '../model/project.ts';
import { avisar, botaoGravar, botaoTocar, contagemEl, medidorDeEntrada, secGravar } from '../moldura.ts';
import { guardarAudio } from '../storage.ts';
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
export async function alternarGravacao(refazer?: Take) {
  if (estado.gravando) return terminarGravacao();
  parar();
  if (estado.modo === 'padrao') {
    estado.modo = 'musica';
    desenharTransporte();
  }
  if (refazer) estado.cursor = Math.max(0, refazer.inicio);
  try {
    await engine.ctx.resume();
    await gravador.iniciar(prefs.microfone || undefined);
  } catch {
    avisar('Não consegui acessar o microfone. Libere a permissão no navegador e tente de novo.');
    return;
  }
  estado.regravando = refazer;
  marcarGravacao(true);
  avisar('Gravando. Use fone de ouvido, senão o beat vaza para o microfone.');
  // Contagem: um compasso de estalos para a pessoa entrar no tempo.
  const espera = prefs.contagem ? engine.contar(estado.projeto.bpm) : 0;
  await engine.tocar(projetoParaTocar(), estado.cursor, undefined, espera);
  void desenharGravar();
}

botaoGravar.onclick = () => void alternarGravacao();

export const botaoGravarGrande = h('button', { className: 'gravar grande', onclick: () => void alternarGravacao() }, '● Gravar voz');

export async function terminarGravacao() {
  const g = gravador.parar();
  const { t0, desde } = engine;
  const antigo = estado.regravando;
  estado.regravando = undefined;
  marcarGravacao(false);
  engine.parar();
  botaoTocar.textContent = '▶ Tocar';
  estado.cursor = desde;
  engine.desde = desde;

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

export async function desenharGravar() {
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
    h('div', { className: 'linha' }, h('label', { className: 'caixa' }, contagem, 'Contagem de 4 antes de gravar'), escolha),
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
      'Gravar de novo: regrava a partir do mesmo ponto. O take antigo fica mudo, não é apagado.',
    ]),
  );
}
