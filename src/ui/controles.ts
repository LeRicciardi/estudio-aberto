// Peças de interface reutilizáveis: criação de elementos, campos, botões e
// o botão giratório usado nas telas de efeito.

type Filho = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...filhos);
  return el;
}

/** Função chamada sempre que um controle altera o projeto. `agrupar` = arrasto contínuo. */
let avisarMudanca: (agrupar?: boolean) => void = () => {};
export function ligarMudanca(fn: (agrupar?: boolean) => void) {
  avisarMudanca = fn;
}

export const opcoes = <T extends string>(mapa: Record<T, unknown>, nome: (k: T) => string) => (Object.keys(mapa) as T[]).map((k) => [k, nome(k)] as [T, string]);

export function campo(rotulo: string, controle: HTMLElement): HTMLLabelElement {
  return h('label', { className: 'campo' }, h('span', {}, rotulo), controle);
}

export function deslizante(rotulo: string, min: number, max: number, passo: number, valor: number, aoMudar: (v: number) => void, aoSoltar?: () => void) {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(passo), value: String(valor) });
  input.oninput = () => {
    aoMudar(Number(input.value));
    avisarMudanca(true);
  };
  if (aoSoltar) input.onchange = aoSoltar;
  return campo(rotulo, input);
}

export function numero(rotulo: string, min: number, max: number, valor: number, aoMudar: (v: number) => void, passo = 1) {
  const input = h('input', { type: 'number', min: String(min), max: String(max), step: String(passo), value: String(valor) });
  input.onchange = () => {
    const v = Math.min(max, Math.max(min, Number(input.value) || min));
    input.value = String(v);
    aoMudar(v);
    avisarMudanca();
  };
  return campo(rotulo, input);
}

export function seletor<T extends string | number>(rotulo: string, lista: [T, string][], valor: T, aoMudar: (v: T) => void) {
  const select = h('select');
  for (const [v, nome] of lista) select.append(h('option', { value: String(v), selected: v === valor }, nome));
  select.onchange = () => {
    aoMudar(lista[select.selectedIndex][0]);
    avisarMudanca();
  };
  return campo(rotulo, select);
}

export function botao(texto: string, aoClicar: () => void, classe = ''): HTMLButtonElement {
  return h('button', { className: classe, onclick: aoClicar }, texto);
}

/** Botão de ligar/desligar com luz, como os de um aparelho. */
export function chave(rotulo: string, ligado: boolean, aoMudar: (v: boolean) => void): HTMLButtonElement {
  const b = h('button', { className: 'chave' + (ligado ? ' ligada' : ''), ariaPressed: String(ligado) }, h('i'), rotulo);
  b.onclick = () => {
    aoMudar(!ligado);
    avisarMudanca();
  };
  return b;
}

export function explicacao(linhas: string[]) {
  return h('details', { className: 'explica' }, h('summary', {}, 'O que isso faz?'), h('ul', {}, ...linhas.map((l) => h('li', {}, l))));
}

export function baixar(blob: Blob, nome: string) {
  h('a', { href: URL.createObjectURL(blob), download: nome }).click();
}

export interface OpcoesDoGiratorio {
  rotulo: string;
  min: number;
  max: number;
  valor: number;
  /** Valor para o qual o duplo clique volta. */
  padrao?: number;
  /** Como mostrar o valor (por exemplo, com unidade). */
  formato?: (v: number) => string;
  /** Escala logarítmica: boa para frequências, onde 100 → 200 Hz vale tanto quanto 1000 → 2000. */
  log?: boolean;
  /** Arredonda o valor para múltiplos deste passo. */
  passo?: number;
  aoMudar: (v: number) => void;
  /** Chamado ao soltar: para trabalhos pesados que não devem rodar a cada movimento. */
  aoSoltar?: () => void;
}

/**
 * Botão giratório. Arraste para cima ou para baixo para girar (com Shift,
 * devagar), use as setas do teclado, ou dê dois cliques para voltar ao padrão.
 */
export function giratorio(o: OpcoesDoGiratorio): HTMLElement {
  const passo = o.passo ?? (o.max - o.min) / 200;
  // Posição do botão (0 a 1) ↔ valor, linear ou logarítmico.
  const paraPosicao = (v: number) => (o.log ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min));
  const paraValor = (p: number) => (o.log ? o.min * (o.max / o.min) ** p : o.min + p * (o.max - o.min));
  const formato = o.formato ?? ((v: number) => String(Math.round(v * 100) / 100));
  let valor = o.valor;

  const corpo = h('div', { className: 'giro', tabIndex: 0, role: 'slider', ariaLabel: o.rotulo }, h('i'));
  const leitura = h('span', { className: 'giro-valor' });
  const pintar = () => {
    const p = Math.min(1, Math.max(0, paraPosicao(valor)));
    corpo.style.setProperty('--giro', `${p * 270 - 135}deg`);
    corpo.style.setProperty('--arco', `${p * 270}deg`);
    corpo.ariaValueText = formato(valor);
    leitura.textContent = formato(valor);
  };
  const definir = (novo: number, agrupar: boolean) => {
    novo = Math.min(o.max, Math.max(o.min, o.log ? novo : Math.round(novo / passo) * passo));
    if (novo === valor) return;
    valor = novo;
    pintar();
    o.aoMudar(valor);
    avisarMudanca(agrupar);
  };

  let origem: { y: number; posicao: number } | null = null;
  corpo.onpointerdown = (e) => {
    origem = { y: e.clientY, posicao: paraPosicao(valor) };
    corpo.setPointerCapture(e.pointerId);
    e.preventDefault();
    corpo.focus();
  };
  corpo.onpointermove = (e) => {
    if (!origem) return;
    const curso = e.shiftKey ? 800 : 160; // pixels para ir do mínimo ao máximo
    definir(paraValor(Math.min(1, Math.max(0, origem.posicao + (origem.y - e.clientY) / curso))), true);
  };
  corpo.onpointerup = corpo.onpointercancel = () => {
    if (!origem) return;
    origem = null;
    avisarMudanca();
    o.aoSoltar?.();
  };
  corpo.ondblclick = () => {
    if (o.padrao === undefined) return;
    definir(o.padrao, false);
    o.aoSoltar?.();
  };
  corpo.onkeydown = (e) => {
    const sentido = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!sentido) return;
    e.preventDefault();
    e.stopPropagation();
    definir(paraValor(Math.min(1, Math.max(0, paraPosicao(valor) + sentido * (e.shiftKey ? 0.005 : 0.025)))), false);
    o.aoSoltar?.();
  };
  pintar();
  return h('div', { className: 'giratorio' }, corpo, leitura, h('span', { className: 'giro-rotulo' }, o.rotulo));
}
