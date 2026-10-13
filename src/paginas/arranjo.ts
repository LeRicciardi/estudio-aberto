// Página Arranjo: a música inteira na linha do tempo e a ordem dos padrões.

import { estado, mudou, relogio } from '../estado.ts';
import { compassosDoArranjo } from '../model/project.ts';
import { secArranjo } from '../moldura.ts';
import { botao, explicacao, h, numero, seletor } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';
import { abrirPadrao } from './grades.ts';
import { onda } from './onda.ts';

/** Visão da música inteira: os padrões em sequência e, abaixo, onde cada voz entra. */
export function linhaDoTempo(): HTMLElement {
  const blocos = estado.projeto.beat.fonte === 'arquivo'
    ? [h('div', { className: 'bloco-padrao' }, estado.projeto.beat.nomeArquivo ?? 'Beat importado')]
    : estado.projeto.arranjo.map((b) => {
        const bloco = h('div', { className: 'bloco-padrao' + (b.padrao === estado.padraoAtual ? ' atual' : ''), title: 'Abrir este padrão' }, `${estado.projeto.padroes[b.padrao]?.nome ?? '?'} ×${b.vezes}`);
        bloco.style.flexGrow = String(b.vezes);
        bloco.onclick = () => abrirPadrao(b.padrao);
        return bloco;
      });
  return h('div', { className: 'playlist' },
    h('div', { className: 'pista' }, h('span', { className: 'nome-linha' }, 'Beat'), h('div', { className: 'blocos' }, ...blocos)),
    ...estado.projeto.takes.map((take) => h('div', { className: 'pista' }, h('span', { className: 'nome-linha' }, take.nome), onda(take))),
  );
}

export function arranjo(): HTMLElement {
  const lista = h('div', { className: 'arranjo' });
  estado.projeto.arranjo.forEach((bloco, i) => {
    lista.append(h('div', { className: 'linha bloco' },
      h('span', { className: 'tempo' }, `${i + 1}.`),
      seletor('Padrão', estado.projeto.padroes.map((p, k) => [k, p.nome] as [number, string]), bloco.padrao, (v) => { bloco.padrao = v; desenharBeat(); }),
      numero('Compassos', 1, 64, bloco.vezes, (v) => { bloco.vezes = v; desenharBeat(); }),
      botao('Remover', () => {
        estado.projeto.arranjo.splice(i, 1);
        mudou();
        desenharBeat();
      }, 'perigo'),
    ));
  });
  const compassos = compassosDoArranjo(estado.projeto);
  lista.append(
    botao('+ Adicionar trecho', () => {
      estado.projeto.arranjo.push({ padrao: estado.padraoAtual, vezes: 4 });
      mudou();
      desenharBeat();
    }),
    h('p', { className: 'nota' }, `Total: ${compassos} compassos, ${relogio((compassos * 4 * 60) / estado.projeto.bpm)} de música.`),
  );
  return lista;
}

export function desenharArranjo() {
  const beat = estado.projeto.beat;
  secArranjo.replaceChildren(
    h('h2', {}, 'Arranjo'),
    h('p', { className: 'nota' }, 'A música inteira de uma vez: a ordem dos padrões e onde cada voz entra. Clique numa voz para ouvir a partir daquele ponto.'),
    linhaDoTempo(),
    ...(beat.fonte === 'padrao' ? [
      h('h3', {}, 'Ordem dos padrões'),
      arranjo(),
      explicacao([
        'O arranjo é a ordem em que os padrões tocam para formar a música: intro, verso, refrão, pausa.',
        'Crie variações com "Duplicar" e mude pouca coisa: tirar o bumbo e o 808 por 2 compassos e devolver depois já cria impacto.',
      ]),
    ] : []),
  );
}
