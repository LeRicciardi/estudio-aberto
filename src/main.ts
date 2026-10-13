// Ponto de entrada: carrega os módulos e desenha a tela pela primeira vez.

import { limparAudioSemUso, receberCompartilhado, restaurarAudio } from './arquivo.ts';
import { engine, estado } from './estado.ts';
import { ligarMidi } from './midi.ts';
import { desenharTudo, quadro } from './transporte.ts';
import './atalhos.ts';
import './paginas/projeto.ts';

desenharTudo();

engine.mixer.sincronizar(estado.projeto);

requestAnimationFrame(quadro);

void restaurarAudio().then(limparAudioSemUso).then(receberCompartilhado);
void ligarMidi();
