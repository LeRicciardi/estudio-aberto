// Página Projeto: arquivo, instalação como aplicativo e atalhos.

import { abrirDeArquivo, salvarEmArquivo } from '../arquivo.ts';
import { ATALHOS } from '../atalhos.ts';
import { EventoDeInstalacao, engine, estado, mudou } from '../estado.ts';
import { novoProjeto } from '../model/generos.ts';
import { secProjeto } from '../moldura.ts';
import { desenharTudo, parar } from '../transporte.ts';
import { botao, campo, h } from '../ui/controles.ts';

export function desenharProjeto() {
  const abrir = h('input', { type: 'file', accept: '.json,application/json' });
  abrir.onchange = () => abrir.files?.[0] && void abrirDeArquivo(abrir.files[0]);
  secProjeto.replaceChildren(
    h('h2', {}, 'Projeto'),
    h('p', { className: 'nota' }, 'O projeto é salvo sozinho neste navegador. Salve em arquivo para guardar cópia, trocar de aparelho ou mandar para alguém gravar junto.'),
    h('div', { className: 'linha' },
      botao('Salvar projeto em arquivo', () => void salvarEmArquivo()),
      campo('Abrir projeto de um arquivo', abrir),
    ),
    h('h3', {}, 'Aplicativo'),
    instalacao(),
    h('details', { className: 'explica atalhos' },
      h('summary', {}, 'Atalhos do teclado'),
      h('ul', {}, ...ATALHOS.map(([tecla, acao]) => h('li', {}, h('kbd', {}, tecla), ` ${acao}`))),
      h('p', {}, 'No computador também dá para pintar a grade arrastando o mouse, girar os botões arrastando para cima e para baixo (com Shift, devagar) e soltar um arquivo de áudio ou de projeto em qualquer lugar da janela.'),
    ),
    botao('Começar música nova', () => {
      if (!confirm('Começar uma música nova? Dá para voltar com "Desfazer" enquanto a página estiver aberta.')) return;
      parar();
      estado.projeto = novoProjeto(estado.projeto.genero);
      estado.padraoAtual = 0;
      estado.cursor = 0;
      engine.desde = 0;
      mudou();
      desenharTudo();
    }, 'perigo'),
  );
}

// O Chrome (Android e computador) avisa quando o site pode ser instalado.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  estado.conviteDeInstalacao = e as EventoDeInstalacao;
  desenharProjeto();
});

window.addEventListener('appinstalled', () => {
  estado.conviteDeInstalacao = undefined;
  desenharProjeto();
});

export function instalacao(): HTMLElement {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return h('p', { className: 'nota' }, 'Você está usando o aplicativo instalado. Ele abre mesmo sem internet.');
  }
  if (estado.conviteDeInstalacao) {
    return h('div', {},
      h('p', { className: 'nota' }, 'Instale para abrir pela tela inicial, usar sem internet e proteger seus projetos de serem apagados pelo navegador.'),
      botao('Instalar aplicativo', () => void estado.conviteDeInstalacao?.prompt()),
    );
  }
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return h('p', { className: 'nota' }, iphone
    ? 'Para instalar no iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".'
    : 'Para instalar: abra o menu do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial". A opção só aparece com o site publicado em endereço https.');
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js');
}
