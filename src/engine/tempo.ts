// Um compasso 4/4 tem 16 passos (semicolcheias). Cada batida tem 4 passos.

export const duracaoDoPasso = (bpm: number) => 60 / bpm / 4;

/**
 * Instante (em segundos, a partir do início da música) em que um passo toca.
 * O swing atrasa os passos ímpares: 0 = reto, 0.33 = balanço de tercina.
 */
export function tempoDoPasso(passo: number, bpm: number, swing: number): number {
  const d = duracaoDoPasso(bpm);
  return passo * d + (passo % 2 === 1 ? swing * d : 0);
}

/**
 * Relógio do sequenciador ao vivo. O navegador não garante precisão em
 * setInterval, então ele só serve para "acordar" de tempos em tempos e agendar,
 * no relógio preciso do áudio, os passos que caem na próxima janela.
 */
export class RelogioDePassos {
  private timer: number | undefined;
  private proximo = 0;

  constructor(
    private ctx: AudioContext,
    private aoPasso: (passo: number, quando: number) => void,
  ) {}

  iniciar(t0: number, desde: number, bpm: number, swing: number, totalDePassos: number) {
    this.parar();
    this.proximo = Math.max(0, Math.ceil(desde / duracaoDoPasso(bpm) - 1e-6));
    const JANELA = 0.12;
    const agendar = () => {
      while (this.proximo < totalDePassos) {
        const quando = t0 + tempoDoPasso(this.proximo, bpm, swing) - desde;
        if (quando > this.ctx.currentTime + JANELA) break;
        if (quando >= this.ctx.currentTime - 0.01) this.aoPasso(this.proximo, quando);
        this.proximo++;
      }
    };
    agendar();
    this.timer = window.setInterval(agendar, 25);
  }

  parar() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
