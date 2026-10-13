// Página Estilo: cartões de gênero com prévia e os ajustes gerais da música.

import { engine, estado, mudou } from '../estado.ts';
import { GENEROS, aplicarGenero, novoProjeto } from '../model/generos.ts';
import { type Escala, NOTAS } from '../model/project.ts';
import { botaoTocar, secEstilo } from '../moldura.ts';
import { desenharTudo, parar, reiniciarSeTocando } from '../transporte.ts';
import { botao, campo, deslizante, explicacao, h, numero, seletor } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';
import { reafinarTodos } from './voz.ts';

export function cartaoDeGenero(g: string): HTMLElement {
  const m = GENEROS[g];
  const atual = estado.projeto.genero === g;
  return h('article', { className: 'cartao' + (atual ? ' atual' : '') + (estado.previa === g ? ' tocando' : '') },
    h('strong', {}, m.nome),
    h('span', { className: 'nota' }, `${m.bpm} BPM`),
    h('p', {}, m.descricao),
    h('div', { className: 'linha' },
      botao(estado.previa === g ? '■ Parar' : '▶ Ouvir', () => void ouvirGenero(g)),
      atual
        ? h('span', { className: 'nota' }, 'Em uso')
        : botao('Usar este', () => {
            if (!confirm(`Usar ${m.nome}? O beat atual é substituído pelo modelo do estilo (dá para desfazer). As vozes ficam.`)) return;
            parar();
            aplicarGenero(estado.projeto, g);
            estado.padraoAtual = 0;
            mudou();
            desenharTudo();
          }, 'principal'),
    ),
  );
}

/** Pré-escuta: toca o modelo do estilo sem mexer na música da pessoa. */
export async function ouvirGenero(g: string) {
  if (estado.gravando) return;
  const jaTocava = estado.previa === g;
  parar();
  if (jaTocava) return;
  estado.previa = g;
  await engine.tocar({ ...novoProjeto(g), tom: estado.projeto.tom }, 0, 0);
  botaoTocar.textContent = '■ Parar';
  desenharEstilo();
}

export function desenharEstilo() {
  const nome = h('input', { type: 'text', value: estado.projeto.nome });
  nome.onchange = () => {
    estado.projeto.nome = nome.value;
    mudou();
  };
  const genero = GENEROS[estado.projeto.genero];
  secEstilo.replaceChildren(
    h('h2', {}, 'Estilo'),
    campo('Nome da música', nome),
    h('p', { className: 'nota' }, 'Ouça os estilos e escolha um ponto de partida. Dá para mudar tudo depois.'),
    h('div', { className: 'cartoes' }, ...Object.keys(GENEROS).map(cartaoDeGenero)),
    genero?.aproximado
      ? h('p', { className: 'nota alerta' }, 'Este modelo é uma aproximação: não achei uma transcrição confiável do ritmo. Ajuste a grade de ouvido, com uma faixa de referência.')
      : '',
    h('div', { className: 'linha' },
      numero('BPM', 60, 200, estado.projeto.bpm, (v) => { estado.projeto.bpm = v; reiniciarSeTocando(); }),
      seletor('Tom', NOTAS.map((n, i) => [i, n] as [number, string]), estado.projeto.tom, (v) => { estado.projeto.tom = v; desenharBeat(); void reafinarTodos(); }),
      seletor<Escala>('Escala', [['menor', 'Menor'], ['maior', 'Maior']], estado.projeto.escala, (v) => { estado.projeto.escala = v; desenharBeat(); void reafinarTodos(); }),
      deslizante('Swing (balanço)', 0, 0.5, 0.01, estado.projeto.swing, (v) => { estado.projeto.swing = v; }, reiniciarSeTocando),
    ),
    explicacao([
      'O gênero carrega um ponto de partida: andamento, balanço, kit de bateria, timbre de voz e um padrão típico. Tudo pode ser alterado depois.',
      'Tom e escala definem quais notas "combinam". O 808, a melodia e o tune seguem essa escolha, então é difícil soar desafinado.',
      'Swing atrasa os passos pares e dá balanço ao ritmo. Boombap usa bastante; trap, quase nada.',
    ]),
  );
}
