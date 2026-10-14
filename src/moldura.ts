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

export const secSons = pagina_('sons');

export const secArranjo = pagina_('arranjo');

export const secLetra = pagina_('letra');

export const secGravar = pagina_('gravar');

export const secVozes = pagina_('efeitos');

export const secMixer = pagina_('mixer');

export const secMaster = pagina_('master');

export const secLancar = pagina_('lancar');

export const secProjeto = pagina_('projeto');

export const trilha = h('nav', { className: 'trilha', ariaLabel: 'Janelas' });

export const navegador = h('aside', { className: 'navegador', ariaLabel: 'Navegador de sons e do projeto' });

export const rodape = so(h('div', { className: 'linha rodape' }));

export const contagemEl = h('div', { className: 'contagem' });

export const medidorDeEntrada = h('div', { className: 'medidor' }, h('div'));

// Cada página é uma parte do trabalho, na ordem em que a música nasce.
// A tela simples mostra só as marcadas com `simples`.
// `grupo` junta as janelas por etapa na barra; `icone` é o desenho do botão.
export const PAGINAS = [
  { id: 'estilo', nome: 'Estilo', secao: secEstilo, simples: true, grupo: 'Beat', icone: '✦' },
  { id: 'canais', nome: 'Beat', secao: secCanais, simples: true, grupo: 'Beat', icone: '▦' },
  { id: 'notas', nome: 'Notas', secao: secNotas, simples: false, grupo: 'Beat', icone: '♫' },
  { id: 'sons', nome: 'Sons', secao: secSons, simples: true, grupo: 'Beat', icone: '◫' },
  { id: 'arranjo', nome: 'Arranjo', secao: secArranjo, simples: false, grupo: 'Música', icone: '☰' },
  { id: 'letra', nome: 'Letra', secao: secLetra, simples: true, grupo: 'Música', icone: '✎' },
  { id: 'gravar', nome: 'Gravar', secao: secGravar, simples: true, grupo: 'Voz', icone: '●' },
  { id: 'efeitos', nome: 'Voz', secao: secVozes, simples: true, grupo: 'Voz', icone: '◎' },
  { id: 'mixer', nome: 'Mixer', secao: secMixer, simples: false, grupo: 'Final', icone: '⫼' },
  { id: 'master', nome: 'Master', secao: secMaster, simples: true, grupo: 'Final', icone: '◉' },
  { id: 'lancar', nome: 'Lançar', secao: secLancar, simples: true, grupo: 'Final', icone: '⇪' },
  { id: 'projeto', nome: 'Projeto', secao: secProjeto, simples: true, grupo: 'Projeto', icone: '▣' },
] as const;

export type PaginaId = (typeof PAGINAS)[number]['id'];

export const paginasVisiveis = () => PAGINAS.filter((p) => !estado.telaSimples || p.simples);

// Volta à página em que a pessoa estava antes de recarregar.
estado.pagina = PAGINAS.find((p) => p.id === sessionStorage.getItem('estudio-aberto:pagina'))?.id ?? 'estilo';
if (estado.telaSimples && !etapaDeBeat()) estado.modo = 'musica';

/** Nas páginas de criação do beat, tocar repete o padrão; nas demais, toca a música com as vozes. */
export function etapaDeBeat() {
  return estado.pagina === 'estilo' || estado.pagina === 'canais' || estado.pagina === 'notas' || estado.pagina === 'sons';
}

app.append(secTransporte, trilha, navegador, h('main', {}, ...PAGINAS.map((p) => p.secao)), rodape);

const CHAVE_DO_NAVEGADOR = 'estudio-aberto:navegador';
document.body.classList.toggle('sem-navegador', localStorage.getItem(CHAVE_DO_NAVEGADOR) === 'fechado');
const telaEstreita = window.matchMedia('(max-width: 999px)');

/** No computador o navegador fica ao lado e a escolha é lembrada; na tela estreita ele abre por cima. */
export function alternarNavegador() {
  if (telaEstreita.matches) {
    document.body.classList.toggle('navegador-aberto');
    return;
  }
  const fechado = document.body.classList.toggle('sem-navegador');
  localStorage.setItem(CHAVE_DO_NAVEGADOR, fechado ? 'fechado' : 'aberto');
}

// Na tela estreita, tocar fora do navegador ou escolher uma janela fecha ele.
document.addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('navegador-aberto')) return;
  const alvo = e.target as HTMLElement;
  if (!navegador.contains(alvo) && !alvo.closest('button[aria-label="Navegador"]')) document.body.classList.remove('navegador-aberto');
});

export const avisar = (texto: string) => {
  aviso.textContent = texto;
  aviso.title = texto;
};
