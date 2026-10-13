// Forma de onda de um take, com agulha de reprodução.

import { engine, estado } from '../estado.ts';
import { type Take, duracaoDaMusica } from '../model/project.ts';
import { irPara, trocarModo } from '../transporte.ts';
import { h } from '../ui/controles.ts';

/** Forma de onda do take ao longo da música, com a agulha de reprodução. Clicar leva a música àquele ponto. */
/** Take aberto na página de voz e tela de efeito escolhida. */
/** Atualizações por quadro (medidores) das páginas de voz e do mixer; refeitas a cada redesenho. */
export const CORES_DE_VOZ = ['#ff9d2e', '#6cb6ff', '#ff6b9d', '#7dde5a', '#c79bff', '#ffd84a'];
export const corDoTake = (take: Take) => CORES_DE_VOZ[Math.max(0, estado.projeto.takes.findIndex((t) => t.id === take.id)) % CORES_DE_VOZ.length];

export function onda(take: Take): HTMLElement {
  const buffer = engine.buffers.get(take.audioId);
  const duracao = duracaoDaMusica(estado.projeto, engine.buffers);
  const tela = h('canvas', { width: 900, height: 48 });
  const g = tela.getContext('2d');
  if (buffer && g) {
    const dados = buffer.getChannelData(0);
    // Cada voz tem a sua cor, a mesma no arranjo e no mixer.
    g.fillStyle = take.mudo ? '#5b6570' : corDoTake(take);
    for (let x = 0; x < tela.width; x++) {
      // Cada coluna mostra o pico do trecho de áudio que cai nela.
      const a = Math.floor((((x / tela.width) * duracao - take.inicio) * buffer.sampleRate));
      const b = Math.floor(((((x + 1) / tela.width) * duracao - take.inicio) * buffer.sampleRate));
      if (b <= 0 || a >= dados.length) continue;
      let pico = 0;
      for (let i = Math.max(0, a); i < Math.min(dados.length, b); i += 8) pico = Math.max(pico, Math.abs(dados[i]));
      const altura = Math.max(1, pico * tela.height);
      g.fillRect(x, (tela.height - altura) / 2, 1, altura);
    }
  }
  const agulha = h('div', { className: 'agulha' });
  estado.agulhas.push(agulha);
  const caixa = h('div', { className: 'onda', title: 'Clique para ouvir a partir deste ponto' }, tela, agulha);
  caixa.onclick = (e) => {
    const r = caixa.getBoundingClientRect();
    if (estado.modo === 'padrao') trocarModo('musica');
    irPara(((e.clientX - r.left) / r.width) * duracao);
  };
  return caixa;
}
