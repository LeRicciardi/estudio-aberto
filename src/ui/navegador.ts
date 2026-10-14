// Navegador: a coluna da esquerda, como nas estações de trabalho. Mostra
// estilos, sons e o que já existe no projeto. Um clique ouve; dois cliques
// (ou arrastar até uma linha da bateria) usam o som.

import { type SomDaBiblioteca, carregarDaBiblioteca, sonsDaBiblioteca, tocarPrevia } from '../biblioteca.ts';
import { TIPOS_DE_SOM, type TipoDeSom } from '../engine/pacotes.ts';
import { engine, estado } from '../estado.ts';
import { GENEROS } from '../model/generos.ts';
import { LANES, PREFIXO_DE_FABRICA, SAMPLES_DE_FABRICA } from '../model/project.ts';
import { avisar, navegador } from '../moldura.ts';
import { carregarDeFabrica } from '../paginas/beat.ts';
import { ouvirGenero, usarGenero } from '../paginas/estilo.ts';
import { abrirPadrao } from '../paginas/grades.ts';
import { type Destino, usarSom } from '../paginas/sons.ts';
import { irParaPagina } from '../transporte.ts';
import { h } from './controles.ts';

/** Tipo de dado que o navegador põe no arrasto; as linhas da bateria aceitam. */
export const ARRASTO_DE_SOM = 'application/x-estudio-som';

interface Som {
  id: string;
  nome: string;
  tipo: TipoDeSom;
}

const abertas = new Set(['Estilos', 'Sons do estúdio']);

function pasta(nome: string, ...itens: (HTMLElement | string)[]): HTMLElement {
  const d = h('details', { className: 'pasta', open: abertas.has(nome) }, h('summary', {}, nome), ...itens);
  d.ontoggle = () => (d.open ? abertas.add(nome) : abertas.delete(nome));
  return d;
}

function item(icone: string, nome: string, props: Partial<HTMLDivElement> = {}): HTMLDivElement {
  return h('div', { className: 'item', tabIndex: 0, title: nome, ...props }, h('i', {}, icone), h('span', {}, nome));
}

const destinoDe = (tipo: TipoDeSom): Destino | undefined => (tipo === '808' ? '808' : LANES.some((l) => l.id === tipo) ? (tipo as Destino) : undefined);

async function carregar(som: Som) {
  if (som.id.startsWith(PREFIXO_DE_FABRICA)) return (await carregarDeFabrica(som.id)) ? engine.buffers.get(som.id) : undefined;
  return carregarDaBiblioteca(som.id);
}

function itemDeSom(som: Som): HTMLElement {
  const destino = destinoDe(som.tipo);
  const el = item('♪', som.nome, {
    draggable: true,
    title: destino ? `${som.nome}: clique para ouvir, dois cliques para usar em ${destino === '808' ? '808' : LANES.find((l) => l.id === destino)?.nome}, ou arraste até uma linha da bateria` : `${som.nome}: clique para ouvir, arraste até uma linha da bateria para usar`,
  });
  const ouvir = async () => {
    const buffer = await carregar(som);
    if (buffer) tocarPrevia(buffer);
    else avisar('Não consegui tocar esse som.');
  };
  el.onclick = () => void ouvir();
  el.onkeydown = (e) => {
    if (e.key === 'Enter') void (destino ? usarSom(som, destino) : ouvir());
  };
  el.ondblclick = () => {
    if (destino) void usarSom(som, destino);
  };
  el.ondragstart = (e) => {
    e.dataTransfer?.setData(ARRASTO_DE_SOM, JSON.stringify({ id: som.id, nome: som.nome }));
    e.dataTransfer?.setData('text/plain', som.nome);
  };
  return el;
}

/** Linha da bateria (ou outro alvo) que aceita um som arrastado do navegador. */
export function aceitarSom(alvo: HTMLElement, destino: Destino) {
  alvo.ondragover = (e) => {
    if (!e.dataTransfer?.types.includes(ARRASTO_DE_SOM)) return;
    e.preventDefault();
    alvo.classList.add('alvo');
  };
  alvo.ondragleave = () => alvo.classList.remove('alvo');
  alvo.ondrop = (e) => {
    alvo.classList.remove('alvo');
    const dados = e.dataTransfer?.getData(ARRASTO_DE_SOM);
    if (!dados) return;
    e.preventDefault();
    e.stopPropagation();
    void usarSom(JSON.parse(dados) as { id: string; nome: string }, destino);
  };
}

function porTipo(sons: Som[]): HTMLElement[] {
  return (Object.keys(TIPOS_DE_SOM) as TipoDeSom[])
    .map((tipo) => ({ tipo, lista: sons.filter((s) => s.tipo === tipo) }))
    .filter((g) => g.lista.length)
    .map((g) => pasta(`${TIPOS_DE_SOM[g.tipo]} (${g.lista.length})`, ...g.lista.map(itemDeSom)));
}

export function desenharNavegador() {
  const p = estado.projeto;
  const deFabrica: Som[] = LANES.flatMap((l) => (SAMPLES_DE_FABRICA[l.id] ?? []).map((s) => ({ id: PREFIXO_DE_FABRICA + s.arquivo, nome: s.nome, tipo: l.id as TipoDeSom })));
  const meus: SomDaBiblioteca[] = sonsDaBiblioteca();
  navegador.replaceChildren(
    h('div', { className: 'navegador-titulo' }, 'Navegador'),
    pasta('Estilos', ...Object.entries(GENEROS).map(([g, m]) => {
      const el = item(estado.previa === g ? '■' : '▶', `${m.nome} · ${m.bpm}`, { title: `${m.nome}: clique para ouvir, dois cliques para usar como ponto de partida`, className: 'item' + (p.genero === g ? ' atual' : '') });
      el.onclick = () => void ouvirGenero(g).then(desenharNavegador);
      el.ondblclick = () => usarGenero(g);
      return el;
    })),
    pasta('Sons do estúdio', ...porTipo(deFabrica)),
    pasta(`Minha biblioteca (${meus.length})`,
      ...porTipo(meus),
      Object.assign(item('+', 'Trazer sons, packs .zip, MIDI'), { onclick: () => irParaPagina('sons') }),
    ),
    pasta('Padrões', ...p.padroes.map((padrao, i) => {
      const el = item('▦', padrao.nome, { className: 'item' + (i === estado.padraoAtual ? ' atual' : '') });
      el.onclick = () => {
        abrirPadrao(i);
        irParaPagina('canais');
      };
      return el;
    })),
    pasta(`Vozes (${p.takes.length})`, ...(p.takes.length
      ? p.takes.map((t) => {
          const el = item('●', t.nome, { className: 'item' + (t.id === estado.takeAberto ? ' atual' : '') });
          el.onclick = () => {
            estado.takeAberto = t.id;
            irParaPagina('efeitos');
          };
          return el;
        })
      : [Object.assign(item('●', 'Gravar a primeira voz'), { onclick: () => irParaPagina('gravar') })])),
  );
}
