// Diagnóstico da mix: mede a música, lista o que está atrapalhando e por
// quê, e oferece a correção de cada ponto.

import { type Achado, type Correcao, diagnosticar } from '../engine/diagnostico.ts';
import { exportarMix } from '../engine/engine.ts';
import { engine, estado, mudou } from '../estado.ts';
import { avisar } from '../moldura.ts';
import { irParaPagina } from '../transporte.ts';
import { botao, h } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';
import { desenharMaster } from './master.ts';
import { desenharVozes, reafinarTodos } from './voz.ts';

let achados: Achado[] | null = null;
let medindo = false;

const canais = (audio: AudioBuffer) => Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));

async function rodar() {
  medindo = true;
  desenharMaster();
  try {
    const p = estado.projeto;
    const voz = await exportarMix(p, engine.buffers, 'voz');
    const beat = await exportarMix(p, engine.buffers, 'beat');
    const mix = await exportarMix(p, engine.buffers, 'tudo');
    let pico = 0;
    for (const take of p.takes) {
      if (take.mudo) continue;
      const dados = engine.buffers.get(take.audioId)?.getChannelData(0);
      if (dados) for (let i = 0; i < dados.length; i += 2) pico = Math.max(pico, Math.abs(dados[i]));
    }
    achados = diagnosticar({ voz: canais(voz.audio), beat: canais(beat.audio), mix: canais(mix.audio), taxa: mix.audio.sampleRate, picoDasGravacoes: pico, alvoLufs: p.ajusteDoMaster.alvoLufs });
  } catch {
    avisar('O diagnóstico falhou.');
  }
  medindo = false;
  desenharMaster();
}

/** Aplica a correção sugerida em todas as vozes que estão soando. */
function corrigir(c: Correcao) {
  const p = estado.projeto;
  const vozes = p.takes.filter((t) => !t.mudo);
  switch (c.tipo) {
    case 'volumeDaVoz':
      for (const t of vozes) t.volume = Math.min(1.5, Math.max(0.05, t.volume * 10 ** (c.db / 20)));
      break;
    case 'abrirEspaco':
      p.beat.espaco = true;
      p.beat.cede = Math.max(p.beat.cede, 2.5);
      break;
    case 'deEsser':
      for (const t of vozes) t.limpeza.deEsser = Math.max(t.limpeza.deEsser, 0.6);
      void reafinarTodos();
      break;
    case 'cortarCorpo':
      for (const t of vozes) t.eq.graveDb = Math.max(-12, t.eq.graveDb - 3);
      break;
    case 'comprimirMais':
      for (const t of vozes) {
        t.comp.limiar = Math.max(-60, t.comp.limiar - 6);
        t.comp.razao = Math.max(t.comp.razao, 5);
        t.comp.ganho = Math.min(18, t.comp.ganho + 2);
      }
      break;
    case 'fecharEstereo':
      p.ajusteDoMaster.largura = Math.min(p.ajusteDoMaster.largura, 0.8);
      for (const t of vozes) t.dobra *= 0.5;
      break;
    case 'regravar':
      irParaPagina('gravar');
      return;
  }
  mudou();
  desenharBeat();
  desenharVozes();
  avisar('Correção aplicada. Ouça e rode o diagnóstico de novo para conferir.');
  // O achado corrigido sai da lista; os outros ficam até a próxima medição.
  achados = achados?.filter((a) => a.correcao !== c) ?? null;
  desenharMaster();
}

const SELO = { problema: 'Problema', atencao: 'Atenção', ok: 'Certo' };

export function painelDeDiagnostico(): HTMLElement {
  const rodarBotao = botao(medindo ? 'Medindo...' : achados ? 'Medir de novo' : 'Diagnosticar a mix', () => void rodar(), 'principal');
  rodarBotao.disabled = medindo;
  return h('div', { className: 'aparelho' },
    h('div', { className: 'aparelho-titulo' }, 'Diagnóstico da mix'),
    h('div', { className: 'aparelho-corpo' },
      h('p', { className: 'nota' }, 'Mede a música inteira e aponta o que está atrapalhando, com o motivo e uma correção. Leva alguns segundos.'),
      rodarBotao,
      ...(achados ?? []).map((a) => h('div', { className: `achado ${a.gravidade}` },
        h('strong', {}, `${SELO[a.gravidade]}: ${a.titulo}`),
        h('p', {}, a.explicacao),
        a.correcao && a.acao ? botao(a.acao, () => corrigir(a.correcao!)) : '',
      )),
    ),
  );
}
