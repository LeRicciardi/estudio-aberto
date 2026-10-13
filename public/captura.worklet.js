// Roda na thread de áudio. Junta o som do microfone em blocos e manda para a
// página, junto com o instante exato (relógio do AudioContext) do primeiro
// sample de cada bloco. É esse instante que permite alinhar a voz com o beat.
const BLOCO = 2048;

class Captura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(BLOCO);
    this.n = 0;
    this.inicio = 0;
  }

  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (!canal) return true;
    for (let i = 0; i < canal.length; i++) {
      if (this.n === 0) this.inicio = currentTime + i / sampleRate;
      this.buf[this.n++] = canal[i];
      if (this.n === BLOCO) {
        this.port.postMessage({ t: this.inicio, d: this.buf.slice() });
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('captura', Captura);
