// Teclado MIDI: tocar o 808 e a melodia num controlador ligado ao computador.
// As teclas brancas de uma oitava viram as notas da escala da música, então
// não dá para tocar nota "errada". Com o padrão em repetição, o que for
// tocado é escrito na grade.

import { tocarBaixo, tocarNota } from './engine/synths.ts';
import { duracaoDoPasso } from './engine/tempo.ts';
import { engine, estado, mudou } from './estado.ts';
import { LINHAS, passosDoPadrao, semitonsDoGrau } from './model/project.ts';
import { avisar } from './moldura.ts';
import { desenharBeat } from './paginas/beat.ts';

/** Teclas brancas a partir do Dó: 0 = Dó, 2 = Ré... valem os graus 0 a 6 da escala. */
const BRANCAS = [0, 2, 4, 5, 7, 9, 11];

function aoTocar(nota: number) {
  const grauNaOitava = BRANCAS.indexOf(nota % 12);
  if (grauNaOitava < 0) return;
  const oitava = Math.floor(nota / 12) - 1;
  // Abaixo do Dó central (oitava 4) toca o 808; dali para cima, a melodia.
  tocarGrau(Math.min(LINHAS - 1, grauNaOitava + (oitava > 4 ? 7 : 0)), oitava < 4);
}

/**
 * Toca uma nota da escala (pelo grau) no 808 ou na melodia. Com o padrão em
 * repetição, a nota também é escrita na grade, no passo mais próximo.
 * Serve ao teclado MIDI e ao teclado desenhado na tela.
 */
export function tocarGrau(grau: number, baixo: boolean) {
  const p = estado.projeto;
  const semitons = p.tom + semitonsDoGrau(grau, p.escala);
  const agora = engine.ctx.currentTime + 0.01;
  void engine.ctx.resume();
  if (baixo) tocarBaixo(engine.ctx, engine.mixer.barraBaixo, p.kit, 32.703 * 2 ** (semitons / 12), agora);
  else tocarNota(engine.ctx, engine.mixer.barraMelodia, p.instrumento, (p.tom > 6 ? 130.81 : 261.63) * 2 ** (semitons / 12), agora, duracaoDoPasso(p.bpm), p.sintetizador);

  const padrao = p.padroes[estado.padraoAtual];
  if (!engine.tocando || estado.modo !== 'padrao' || estado.gravando || !padrao || p.beat.fonte !== 'padrao') return;
  const s = Math.round(engine.posicao() / duracaoDoPasso(p.bpm)) % passosDoPadrao(padrao);
  if (baixo) padrao.baixo[s] = grau;
  else padrao.melodia[grau][s] = true;
  mudou();
  desenharBeat();
}

/** Liga os teclados MIDI disponíveis. Navegadores sem Web MIDI (Safari, iPhone) simplesmente não fazem nada. */
export async function ligarMidi() {
  if (!navigator.requestMIDIAccess) return;
  try {
    const acesso = await navigator.requestMIDIAccess();
    const ligar = () => {
      for (const entrada of acesso.inputs.values()) {
        entrada.onmidimessage = (e) => {
          const [tipo, nota, forca] = e.data ?? [];
          if ((tipo & 0xf0) === 0x90 && forca > 0) aoTocar(nota);
        };
      }
      if (acesso.inputs.size) avisar('Teclado MIDI ligado: teclas brancas abaixo do Dó central tocam o 808; acima, a melodia.');
    };
    ligar();
    acesso.onstatechange = ligar;
  } catch { /* a pessoa negou o acesso: segue sem MIDI */ }
}
