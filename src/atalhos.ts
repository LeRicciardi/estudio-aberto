// Uso no computador: atalhos de teclado e arrastar arquivos para a janela.

import { abrirDeArquivo, salvarEmArquivo } from './arquivo.ts';
import { engine } from './estado.ts';
import { avisar } from './moldura.ts';
import { importarBeat } from './paginas/beat.ts';
import { alternarGravacao } from './paginas/gravar.ts';
import { alternarTocar, irPara, irParaEtapa, irParaPagina, navegarHistorico } from './transporte.ts';

export const ATALHOS: [string, string][] = [
  ['Espaço', 'Tocar / parar'],
  ['R', 'Gravar / parar gravação'],
  ['Ctrl/⌘ + Z', 'Desfazer'],
  ['Ctrl/⌘ + Shift + Z', 'Refazer'],
  ['Ctrl/⌘ + S', 'Salvar projeto em arquivo'],
  ['Ctrl/⌘ + E', 'Exportar música (WAV)'],
  ['← →', 'Voltar / avançar 5 segundos'],
  ['Home', 'Voltar ao início'],
  ['1 a 9 e 0', 'Ir para a página'],
];

window.addEventListener('keydown', (e) => {
  // Enquanto a pessoa digita em um campo, as teclas são do campo.
  const alvo = e.target as HTMLElement;
  const digitando = alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA'
    || (alvo instanceof HTMLInputElement && !['range', 'checkbox', 'file'].includes(alvo.type));
  const comando = e.ctrlKey || e.metaKey;
  const tecla = e.key.toLowerCase();
  if (comando && tecla === 'z') {
    if (digitando) return;
    e.preventDefault();
    navegarHistorico(e.shiftKey ? 1 : -1);
  } else if (comando && tecla === 's') {
    e.preventDefault();
    void salvarEmArquivo();
  } else if (comando && tecla === 'e') {
    e.preventDefault();
    document.querySelector<HTMLButtonElement>('#exportar-wav')?.click();
  } else if (digitando || comando || e.altKey) {
    return;
  } else if (e.key === ' ') {
    e.preventDefault();
    alternarTocar();
  } else if (tecla === 'r') {
    void alternarGravacao();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (alvo instanceof HTMLInputElement) return;
    irPara(engine.posicao() + (e.key === 'ArrowLeft' ? -5 : 5));
  } else if (e.key === 'Home') {
    irPara(0);
  } else if (e.key >= '0' && e.key <= '9') {
    // 1 a 9 abrem as nove primeiras páginas; 0 abre a décima.
    irParaEtapa(e.key === '0' ? 9 : Number(e.key) - 1);
  }
});

// Com o foco em um botão, o navegador "clica" nele ao soltar a barra de
// espaço. Aqui o espaço é sempre tocar/parar, então esse clique é cancelado.
window.addEventListener('keyup', (e) => {
  if (e.key === ' ' && (e.target as HTMLElement).tagName === 'BUTTON') e.preventDefault();
});

// Arrastar um arquivo para a janela: áudio vira o beat, .json abre o projeto.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('soltando');
});

window.addEventListener('dragleave', () => document.body.classList.remove('soltando'));

window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('soltando');
  const arquivo = e.dataTransfer?.files[0];
  if (!arquivo) return;
  if (arquivo.name.endsWith('.json')) void abrirDeArquivo(arquivo);
  else if (arquivo.type.startsWith('audio/')) void importarBeat(arquivo).then(() => irParaPagina('canais'));
  else avisar('Solte um arquivo de áudio (para usar como beat) ou um projeto .estudio.json.');
});
