// Página Mixer.

import { engine, estado, mudou } from '../estado.ts';
import { secMixer } from '../moldura.ts';
import { irParaPagina } from '../transporte.ts';
import { h } from '../ui/controles.ts';
import { mesa } from '../ui/mesa.ts';

export function desenharMixer() {
  estado.quadrosDoMixer = [];
  secMixer.replaceChildren(
    h('h2', {}, 'Mixer'),
    mesa({
      projeto: estado.projeto, engine, mudou,
      aCadaQuadro: (fn) => estado.quadrosDoMixer.push(fn),
      abrirEfeitos: (take) => {
        estado.takeAberto = take.id;
        irParaPagina('efeitos');
      },
      redesenhar: desenharMixer,
    }),
  );
}
