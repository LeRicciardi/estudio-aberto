// Grades de passos (bateria) e de notas (808 e melodia), com pintura pelo
// mouse, e as abas de padrão usadas pelas páginas do beat.

import { estado, mudou } from '../estado.ts';
import { LANES, LINHAS, STEPS, nomeDoGrau, padraoVazio, passosDoPadrao } from '../model/project.ts';
import { reiniciarSeTocando } from '../transporte.ts';
import { botao, h } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';

/** Células das grades agrupadas por passo, para acender a coluna que está tocando. */
export const ROTULO_DO_PASSO = ['', '', '2', '3', '4', ''];

/**
 * Pintar arrastando o mouse: o quadrado onde o botão desceu define o valor
 * (ligar, apagar, rolo...) e todos os quadrados por onde o mouse passar na
 * mesma grade recebem esse valor. Um clique simples continua alternando.
 */
window.addEventListener('pointerup', () => {
  if (estado.pintura?.usada) {
    mudou();
    // O clique que o navegador dispara ao soltar não deve desfazer a pintura.
    estado.ignorarClique = true;
    setTimeout(() => (estado.ignorarClique = false), 0);
  }
  estado.pintura = null;
});

export function pintavel(grade: HTMLElement, b: HTMLButtonElement, proximo: () => number, definir: (v: number) => void) {
  b.onpointerdown = (e) => {
    if (e.pointerType === 'mouse' && e.button === 0) estado.pintura = { grade, valor: proximo(), definirOrigem: definir, usada: false };
  };
  b.onpointerenter = (e) => {
    if (!estado.pintura || estado.pintura.grade !== grade || !(e.buttons & 1)) return;
    if (!estado.pintura.usada) estado.pintura.definirOrigem(estado.pintura.valor);
    estado.pintura.usada = true;
    definir(estado.pintura.valor);
  };
  b.onclick = () => {
    if (estado.ignorarClique) return;
    definir(proximo());
    mudou();
  };
}

/** Ajusta a grade ao número de passos do padrão (16 por compasso). */
export function dimensionar(grade: HTMLElement, passos: number) {
  grade.style.gridTemplateColumns = `110px repeat(${passos}, minmax(26px, 1fr))`;
  grade.style.minWidth = `${110 + passos * 30}px`;
}

const classeDoPasso = (i: number) => (i % STEPS === 0 ? ' tempo-forte compasso-novo' : i % 4 === 0 ? ' tempo-forte' : '');

export function gradeDeBateria(): HTMLElement {
  const padrao = estado.projeto.padroes[estado.padraoAtual];
  const grade = h('div', { className: 'grade' });
  const passos = passosDoPadrao(padrao);
  dimensionar(grade, passos);
  for (const lane of LANES) {
    grade.append(h('span', { className: 'nome-linha' }, lane.nome));
    for (let i = 0; i < passos; i++) {
      const b = h('button', { ariaLabel: `${lane.nome}, passo ${i + 1}` });
      const pintar = () => {
        const v = padrao.bateria[lane.id][i];
        b.className = 'passo' + (v ? ' ligado' : '') + (v === 5 ? ' fraco' : '') + classeDoPasso(i);
        b.textContent = ROTULO_DO_PASSO[v];
      };
      pintavel(grade, b, () => (padrao.bateria[lane.id][i] === estado.pincel ? 0 : estado.pincel), (v) => {
        padrao.bateria[lane.id][i] = v;
        pintar();
      });
      pintar();
      estado.colunas[i].push(b);
      grade.append(b);
    }
  }
  return h('div', { className: 'rolagem' }, grade);
}

/** Grade de notas (808 ou melodia): linhas são notas da escala, agudas em cima. */
export function gradeDeNotas(ligado: (linha: number, passo: number) => boolean, definir: (linha: number, passo: number, ligar: boolean) => void): HTMLElement {
  const grade = h('div', { className: 'grade notas' });
  const passos = passosDoPadrao(estado.projeto.padroes[estado.padraoAtual]);
  dimensionar(grade, passos);
  const botoes: HTMLButtonElement[][] = [];
  const pintar = () => botoes.forEach((linha, l) => linha.forEach((b, s) => b.classList.toggle('ligado', ligado(l, s))));
  for (let l = LINHAS - 1; l >= 0; l--) {
    const nota = nomeDoGrau(l, estado.projeto.tom, estado.projeto.escala);
    grade.append(h('span', { className: 'nome-linha' + (l % 7 === 0 ? ' tonica' : '') }, nota));
    botoes[l] = [];
    for (let s = 0; s < passos; s++) {
      const b = h('button', { className: 'passo' + classeDoPasso(s), ariaLabel: `${nota}, passo ${s + 1}` });
      pintavel(grade, b, () => (ligado(l, s) ? 0 : 1), (v) => {
        definir(l, s, v === 1);
        pintar();
      });
      botoes[l][s] = b;
      estado.colunas[s].push(b);
      grade.append(b);
    }
  }
  pintar();
  return grade;
}

/** Abas para escolher, criar e duplicar padrões; aparecem nas três páginas do beat. */
export function abasDePadrao(): HTMLElement {
  const padrao = estado.projeto.padroes[estado.padraoAtual];
  return h('div', { className: 'abas' },
    ...estado.projeto.padroes.map((p, i) => botao(p.nome, () => abrirPadrao(i), i === estado.padraoAtual ? 'ativo' : '')),
    botao('+ Novo', () => {
      estado.projeto.padroes.push(padraoVazio(`Padrão ${estado.projeto.padroes.length + 1}`));
      abrirPadrao(estado.projeto.padroes.length - 1);
    }),
    botao('Duplicar', () => {
      estado.projeto.padroes.push({ ...structuredClone(padrao), nome: `${padrao.nome} 2` });
      abrirPadrao(estado.projeto.padroes.length - 1);
    }),
  );
}

export function abrirPadrao(i: number) {
  estado.padraoAtual = i;
  mudou();
  desenharBeat();
  reiniciarSeTocando();
}
