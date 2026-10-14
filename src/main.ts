// Ponto de entrada: carrega os módulos e desenha a tela pela primeira vez.

import { limparAudioSemUso, receberCompartilhado, restaurarAudio } from './arquivo.ts';
import { engine, estado, registrar } from './estado.ts';
import { ligarMidi } from './midi.ts';
import { avisar } from './moldura.ts';
import { recuperarGravacao } from './paginas/gravar.ts';
import { guardarVersao } from './storage.ts';
import { desenharTudo, quadro } from './transporte.ts';
import { inicioAoAbrir } from './ui/inicio.ts';
import './atalhos.ts';
import './paginas/projeto.ts';

desenharTudo();
inicioAoAbrir();

engine.mixer.sincronizar(estado.projeto);

requestAnimationFrame(quadro);

void restaurarAudio().then(recuperarGravacao).then(limparAudioSemUso).then(receberCompartilhado);

// Proteção dos dados: pede ao navegador para não apagar o que está guardado,
// salva na hora quando a aba sai da frente e guarda uma versão a cada 5 minutos.
window.addEventListener('pointerdown', () => void navigator.storage?.persist?.(), { once: true });
document.addEventListener('visibilitychange', () => document.hidden && registrar());
window.setInterval(() => void guardarVersao(estado.projeto, 'Automática'), 5 * 60 * 1000);
window.addEventListener('estudio:sem-espaco', () => avisar('O navegador está sem espaço para salvar. Exporte o projeto em arquivo e apague versões ou takes antigos na página Projeto.'));
void ligarMidi();
