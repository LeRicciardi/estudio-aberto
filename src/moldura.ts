// Moldura da tela: os elementos fixos (barra de transporte, abas, uma seção
// por página) e a lista de páginas. Só cria elementos; não desenha conteúdo.

import { estado, so } from './estado.ts';
import { h } from './ui/controles.ts';

export const app = document.querySelector<HTMLDivElement>('#app')!;

export const aviso = h('p', { className: 'aviso', role: 'status' });

export const botaoTocar = h('button', { className: 'principal', title: 'Tocar / parar (Espaço)' }, '▶ Tocar');

export const botaoGravar = h('button', { className: 'gravar', title: 'Gravar voz (R)' }, '● Gravar voz');

export const tempo = h('span', { className: 'tempo' }, '0:00');

export const visorInfo = h('span', { className: 'visor-info' });

export const barraDeTempo = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', ariaLabel: 'Posição na música' });

export const medidor = h('div', { className: 'medidor', title: 'Nível de saída' }, h('div'));

export const secTransporte = h('header', { className: 'transporte' });

export const pagina_ = (nome: string) => h('section', { className: 'pagina', id: `pagina-${nome}` });

export const secEstilo = pagina_('estilo');

export const secCanais = pagina_('canais');

export const secNotas = pagina_('notas');

export const secArranjo = pagina_('arranjo');

export const secLetra = pagina_('letra');

export const secGravar = pagina_('gravar');

export const secVozes = pagina_('efeitos');

export const secMixer = pagina_('mixer');

export const secMaster = pagina_('master');

export const secProjeto = pagina_('projeto');

export const trilha = h('nav', { className: 'trilha', ariaLabel: 'Páginas' });

export const rodape = so(h('div', { className: 'linha rodape' }));

export const contagemEl = h('div', { className: 'contagem' });

export const medidorDeEntrada = h('div', { className: 'medidor' }, h('div'));

// Cada página é uma parte do trabalho, na ordem em que a música nasce.
// A tela simples mostra só as marcadas com `simples`.
export const PAGINAS = [
  { id: 'estilo', nome: 'Estilo', secao: secEstilo, simples: true },
  { id: 'canais', nome: 'Beat', secao: secCanais, simples: true },
  { id: 'notas', nome: 'Notas', secao: secNotas, simples: false },
  { id: 'arranjo', nome: 'Arranjo', secao: secArranjo, simples: false },
  { id: 'letra', nome: 'Letra', secao: secLetra, simples: true },
  { id: 'gravar', nome: 'Gravar', secao: secGravar, simples: true },
  { id: 'efeitos', nome: 'Voz', secao: secVozes, simples: true },
  { id: 'mixer', nome: 'Mixer', secao: secMixer, simples: false },
  { id: 'master', nome: 'Master', secao: secMaster, simples: true },
  { id: 'projeto', nome: 'Projeto', secao: secProjeto, simples: true },
] as const;

export type PaginaId = (typeof PAGINAS)[number]['id'];

export const paginasVisiveis = () => PAGINAS.filter((p) => !estado.telaSimples || p.simples);

// Volta à página em que a pessoa estava antes de recarregar.
estado.pagina = PAGINAS.find((p) => p.id === sessionStorage.getItem('estudio-aberto:pagina'))?.id ?? 'estilo';
if (estado.telaSimples && !etapaDeBeat()) estado.modo = 'musica';

/** Nas páginas de criação do beat, tocar repete o padrão; nas demais, toca a música com as vozes. */
export function etapaDeBeat() {
  return estado.pagina === 'estilo' || estado.pagina === 'canais' || estado.pagina === 'notas';
}

app.append(secTransporte, trilha, aviso, h('main', {}, ...PAGINAS.map((p) => p.secao)), rodape);

export const avisar = (texto: string) => (aviso.textContent = texto);
