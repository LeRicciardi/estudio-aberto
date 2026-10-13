// Página Letra: escrever a letra presa aos compassos do beat e vê-la
// acompanhar a música enquanto grava.

import { engine, estado, mudou } from '../estado.ts';
import { compassosDoArranjo } from '../model/project.ts';
import { secLetra } from '../moldura.ts';
import { explicacao, h, numero } from '../ui/controles.ts';

/**
 * Sílabas aproximadas de uma linha: conta os grupos de vogais. Não separa
 * hiatos nem junta vogais entre palavras, então serve para comparar linhas
 * entre si, não como contagem poética exata.
 */
export function silabas(linha: string): number {
  return linha.toLowerCase().match(/[aeiouáàâãéêíóôõúü]+/g)?.length ?? 0;
}

const linhasDaLetra = () => estado.projeto.letra.texto.split('\n');
const duracaoDoCompasso = () => (4 * 60) / estado.projeto.bpm;

/** Lista da letra com o compasso e as sílabas de cada linha. */
function previa(): HTMLElement {
  const { compasso } = estado.projeto.letra;
  const linhas = linhasDaLetra();
  const maior = Math.max(1, ...linhas.map(silabas));
  return h('ol', { className: 'compassos' }, ...linhas.map((linha, i) => {
    const n = silabas(linha);
    const item = h('li', { className: linha.trim() ? '' : 'pausa' },
      h('span', { className: 'compasso-numero' }, String(compasso + i)),
      h('span', { className: 'compasso-texto' }, linha.trim() || '(pausa)'),
      h('span', { className: 'compasso-silabas', title: 'Sílabas aproximadas' }, n ? String(n) : ''),
    );
    // Linha bem mais cheia que as outras costuma atropelar o compasso.
    if (n > 0 && n >= maior && linhas.filter((l) => silabas(l) > 0).length > 2 && n > 1.5 * (linhas.reduce((s, l) => s + silabas(l), 0) / Math.max(1, linhas.filter((l) => silabas(l) > 0).length))) item.classList.add('cheia');
    return item;
  }));
}

export function desenharLetra() {
  const letra = estado.projeto.letra;
  const texto = h('textarea', { className: 'letra', rows: 16, value: letra.texto, placeholder: 'Uma linha por compasso.\nDeixe uma linha em branco para um compasso de pausa.', spellcheck: true });
  const lista = h('div');
  const atualizar = () => lista.replaceChildren(previa());
  texto.oninput = () => {
    letra.texto = texto.value;
    mudou(true);
    atualizar();
    desenharTeleprompter();
  };
  atualizar();
  const total = estado.projeto.beat.fonte === 'padrao' ? compassosDoArranjo(estado.projeto) : Math.ceil(engine.buffers.get(estado.projeto.beat.audioId ?? '')?.duration ?? 0 / duracaoDoCompasso());
  secLetra.replaceChildren(
    h('h2', {}, 'Letra'),
    h('p', { className: 'nota' }, 'Escreva uma linha para cada compasso do beat. Na hora de gravar, a letra aparece na tela e a linha da vez fica em destaque.'),
    h('div', { className: 'linha' },
      numero('A letra começa no compasso', 1, 999, letra.compasso, (v) => {
        letra.compasso = v;
        atualizar();
        desenharTeleprompter();
      }),
      h('span', { className: 'nota' }, total ? `A música tem ${total} compassos.` : ''),
    ),
    h('div', { className: 'duas-colunas' }, texto, lista),
    explicacao([
      'Um compasso são 4 batidas do beat. Um verso de rap costuma ter 16 compassos e um refrão, 8.',
      'Escrever uma linha por compasso mostra onde cada rima cai e onde ficam as pausas. Linha em branco é compasso sem voz.',
      'O número à direita é a quantidade aproximada de sílabas. Linhas com muito mais sílabas que as vizinhas pedem um flow mais rápido ou um corte.',
      'A letra é salva junto com o projeto, inclusive no arquivo.',
    ]),
  );
}

// ---------- teleprompter (página Gravar) ----------

export const teleprompter = h('div', { className: 'teleprompter' });
let linhasNaTela: HTMLElement[] = [];
let linhaAtual = -1;

export function desenharTeleprompter() {
  const linhas = linhasDaLetra();
  linhaAtual = -1;
  if (!estado.projeto.letra.texto.trim()) {
    linhasNaTela = [];
    teleprompter.replaceChildren(h('p', { className: 'nota' }, 'Sem letra. Escreva na página "Letra" para ela aparecer aqui enquanto grava.'));
    return;
  }
  linhasNaTela = linhas.map((l) => h('p', {}, l.trim() || '·'));
  teleprompter.replaceChildren(...linhasNaTela);
}

/** Destaca a linha do compasso que está tocando e a mantém à vista. Chamado a cada quadro. */
export function atualizarTeleprompter(posicao: number) {
  if (!linhasNaTela.length) return;
  const i = Math.floor(posicao / duracaoDoCompasso()) - (estado.projeto.letra.compasso - 1);
  if (i === linhaAtual) return;
  linhasNaTela[linhaAtual]?.classList.remove('atual');
  linhaAtual = i;
  const linha = linhasNaTela[i];
  if (!linha) return;
  linha.classList.add('atual');
  teleprompter.scrollTo({ top: linha.offsetTop - teleprompter.clientHeight / 2 + linha.clientHeight / 2, behavior: 'smooth' });
}
