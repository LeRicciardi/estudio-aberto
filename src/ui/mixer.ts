// Página do mixer: uma faixa vertical por canal, com medidor, volume e, nas
// vozes, lado e mudo. É a visão geral do equilíbrio da música.

import type { Engine } from '../engine/engine.ts';
import { PRESETS_MASTER } from '../engine/mixer.ts';
import type { Project, Take } from '../model/project.ts';
import { botao, explicacao, giratorio, h } from './controles.ts';

export interface ContextoDoMixer {
  projeto: Project;
  engine: Engine;
  aCadaQuadro(fn: () => void): void;
  /** Abre as telas de efeito de um take. */
  abrirEfeitos(take: Take): void;
  redesenhar(): void;
  /** Avisa que o projeto mudou (para salvar e aplicar na mesa). */
  mudou(agrupar?: boolean): void;
}

/** Medidor vertical: verde até -12 dB, amarelo até -3, vermelho acima. */
function medidor(c: ContextoDoMixer, canal: string): HTMLElement {
  const nivel = h('div');
  const pico = h('span', { className: 'faixa-pico' }, '-∞');
  let seguro = -100;
  c.aCadaQuadro(() => {
    const db = c.engine.tocando ? c.engine.mixer.picoDb(canal) : -100;
    // O medidor cai devagar, para dar tempo de ler.
    seguro = Math.max(db, seguro - 1.2);
    const altura = Math.max(0, Math.min(100, ((seguro + 54) / 54) * 100));
    nivel.style.height = `${altura}%`;
    nivel.className = seguro > -3 ? 'alto' : seguro > -12 ? 'medio' : '';
    pico.textContent = seguro < -60 ? '-∞' : seguro.toFixed(0);
  });
  return h('div', { className: 'faixa-medidor' }, h('div', { className: 'trilho' }, nivel), pico);
}

function volume(valor: number, max: number, aoMudar: (v: number) => void, c: ContextoDoMixer): HTMLInputElement {
  const fader = h('input', { type: 'range', className: 'fader', min: '0', max: String(max), step: '0.01', value: String(valor), ariaLabel: 'Volume' });
  fader.oninput = () => {
    aoMudar(Number(fader.value));
    c.mudou(true);
  };
  fader.onchange = () => c.mudou();
  return fader;
}

function faixa(nome: string, classe: string, ...corpo: (Node | string)[]): HTMLElement {
  return h('div', { className: `faixa ${classe}` }, h('div', { className: 'faixa-nome', title: nome }, nome), ...corpo);
}

export function mesa(c: ContextoDoMixer): HTMLElement {
  const p = c.projeto;
  const faixas: HTMLElement[] = [];
  if (p.beat.fonte === 'padrao') {
    for (const [nome, canal] of [['Bateria', 'bateria'], ['808', 'baixo'], ['Melodia', 'melodia']] as const) {
      faixas.push(faixa(nome, 'do-beat',
        h('div', { className: 'faixa-corpo' }, medidor(c, canal), volume(p.volumes[canal], 1.2, (v) => { p.volumes[canal] = v; }, c)),
      ));
    }
  }
  faixas.push(faixa(p.beat.fonte === 'arquivo' ? 'Beat' : 'Beat (soma)', 'do-beat',
    h('div', { className: 'faixa-corpo' }, medidor(c, 'beat'), volume(p.beat.volume, 1.2, (v) => { p.beat.volume = v; }, c)),
  ));
  for (const take of p.takes) {
    faixas.push(faixa(take.nome, 'da-voz' + (take.mudo ? ' muda' : ''),
      giratorio({ rotulo: 'Lado', min: -1, max: 1, valor: take.pan, padrao: 0, formato: (v) => (Math.abs(v) < 0.03 ? 'Centro' : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? 'E' : 'D'}`), aoMudar: (v) => { take.pan = v; } }),
      h('div', { className: 'faixa-corpo' }, medidor(c, take.id), volume(take.volume, 1.5, (v) => { take.volume = v; }, c)),
      botao(take.mudo ? 'Mudo' : 'Mudo', () => {
        take.mudo = !take.mudo;
        c.mudou();
        c.redesenhar();
      }, take.mudo ? 'ativo' : ''),
      botao('Efeitos', () => c.abrirEfeitos(take)),
    ));
  }
  faixas.push(faixa('Master', 'do-master',
    h('div', { className: 'faixa-corpo' }, medidor(c, 'master')),
    h('span', { className: 'nota' }, PRESETS_MASTER[p.master].nome),
  ));
  return h('div', {},
    h('div', { className: 'mesa' }, ...faixas),
    explicacao([
      'Cada faixa é um canal da música. O medidor mostra o volume agora; o número embaixo dele é o pico em dB (0 é o máximo).',
      'Comece pelo beat e suba a voz até a letra ficar clara sem se descolar do beat. Verde e amarelo é saudável; vermelho constante no Master pede para baixar tudo um pouco.',
      'Lado joga a voz para a esquerda ou para a direita. A voz principal fica no centro; dobras e adlibs ganham espaço nos lados.',
      'O Master é a soma de tudo, depois do acabamento.',
    ]),
  );
}
