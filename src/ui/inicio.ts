// Tela de início: os caminhos para começar, como a janela de boas-vindas de
// um programa de música. Aparece ao abrir o estúdio e pelo botão ⌂.

import { abrirDeArquivo } from '../arquivo.ts';
import { engine, estado, mudou } from '../estado.ts';
import { GENEROS, novoProjeto } from '../model/generos.ts';
import { avisar } from '../moldura.ts';
import { importarBeat } from '../paginas/beat.ts';
import { guardarVersao } from '../storage.ts';
import { definirTela, desenharTudo, irParaPagina, parar } from '../transporte.ts';
import { botao, h } from './controles.ts';

const CHAVE = 'estudio-aberto:iniciado';
let aberta: HTMLElement | undefined;

function fechar() {
  aberta?.remove();
  aberta = undefined;
  sessionStorage.setItem(CHAVE, '1');
}

/** Começa uma música nova; a atual fica guardada nas versões (página Projeto). */
async function comecar(genero: string) {
  parar();
  await guardarVersao(estado.projeto, 'Antes de começar outra');
  estado.projeto = novoProjeto(genero);
  estado.padraoAtual = 0;
  estado.cursor = 0;
  engine.desde = 0;
  mudou();
  desenharTudo();
}

function arquivo(accept: string, aoEscolher: (f: File) => void | Promise<void>): HTMLInputElement {
  const input = h('input', { type: 'file', accept, hidden: true });
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void aoEscolher(f);
  };
  return input;
}

function caminho(icone: string, titulo: string, texto: string, ...extra: (HTMLElement | string)[]): HTMLElement {
  return h('article', { className: 'caminho' }, h('i', {}, icone), h('strong', {}, titulo), h('p', {}, texto), ...extra);
}

export function abrirInicio() {
  fechar();
  const beatPronto = arquivo('audio/*', async (f) => {
    fechar();
    await comecar(estado.projeto.genero);
    await importarBeat(f);
    estado.projeto.nome = f.name.replace(/\.[^.]+$/, '');
    mudou();
    irParaPagina('gravar');
  });
  const projeto = arquivo('.json,application/json', async (f) => {
    fechar();
    await abrirDeArquivo(f);
  });
  const generos = h('div', { className: 'generos' }, ...Object.entries(GENEROS).map(([g, m]) =>
    h('button', {
      title: m.descricao,
      onclick: async () => {
        fechar();
        await comecar(g);
        irParaPagina('canais');
        avisar(`Beat de ${m.nome} pronto para mexer. Aperte Espaço para ouvir; clique na grade para ligar e desligar os sons.`);
      },
    }, h('b', {}, m.nome), h('small', {}, `${m.bpm} BPM`))));
  const p = estado.projeto;
  const temMusica = p.takes.length > 0 || p.beat.fonte === 'arquivo' || estado.historico.length > 1;
  const modo = (simples: boolean, rotulo: string, texto: string) => h('button', {
    className: 'modo' + (estado.telaSimples === simples ? ' ativo' : ''),
    ariaPressed: String(estado.telaSimples === simples),
    onclick: () => {
      definirTela(simples);
      abrirInicio();
    },
  }, h('b', {}, rotulo), h('small', {}, texto));

  aberta = h('div', { className: 'inicio-fundo', onclick: (e: MouseEvent) => e.target === aberta && fechar() },
    h('div', { className: 'inicio', role: 'dialog', ariaModal: 'true', ariaLabel: 'Começar' },
      h('header', {},
        h('div', {}, h('h1', {}, 'Estúdio Aberto'), h('p', {}, 'Do beat ao lançamento, no navegador. O que você fizer fica salvo neste aparelho.')),
        botao('✕', fechar, 'icone'),
      ),
      h('div', { className: 'caminhos' },
        caminho('▦', 'Fazer um beat', 'Escolha o estilo. O estúdio monta bateria, 808 e melodia para você mexer.', generos),
        caminho('●', 'Gravar em cima de um beat', 'Já tem o beat (MP3 ou WAV)? Traga o arquivo e vá direto gravar a voz.', beatPronto, botao('Escolher o beat...', () => beatPronto.click(), 'principal')),
        caminho('▣', 'Abrir ou continuar', temMusica ? `Continue "${p.nome}" de onde parou, ou abra um projeto salvo em arquivo.` : 'Abra um projeto salvo em arquivo (.estudio.json).',
          projeto,
          h('div', { className: 'linha' },
            temMusica ? botao(`Continuar "${p.nome}"`, fechar, 'principal') : '',
            botao('Abrir arquivo...', () => projeto.click()),
          ),
        ),
      ),
      h('footer', {},
        h('span', { className: 'nota' }, 'Como você quer ver o estúdio?'),
        modo(true, 'Guiado', 'só o essencial, uma etapa por vez'),
        modo(false, 'Estúdio completo', 'todas as janelas, navegador de sons, mixer'),
      ),
    ),
  );
  document.body.append(aberta);
  aberta.querySelector<HTMLButtonElement>('.generos button')?.focus();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && aberta) fechar();
}, true);

/** Ao abrir o estúdio numa aba nova, mostra o início uma vez. */
export function inicioAoAbrir() {
  if (!sessionStorage.getItem(CHAVE)) abrirInicio();
}
