// Entrega: os formatos e embalagens em que a música sai do estúdio.
// Etiquetas ID3 no MP3, arquivo .zip e conferência do arquivo final.

/** Campos de etiqueta que programas de DJ e tocadores leem do MP3. */
export interface Etiquetas {
  titulo: string;
  artista: string;
  bpm: number;
  /** Tom em notação musical curta (ex.: "Am", "C"). */
  tom: string;
  comentario: string;
  isrc: string;
}

/** Quadro de texto ID3v2.3 em UTF-16 (aceita acentos). */
function quadro(id: string, texto: string): Uint8Array {
  const corpo = new Uint8Array(3 + texto.length * 2);
  corpo.set([1, 0xff, 0xfe]);
  for (let i = 0; i < texto.length; i++) {
    corpo[3 + i * 2] = texto.charCodeAt(i) & 0xff;
    corpo[4 + i * 2] = texto.charCodeAt(i) >> 8;
  }
  const q = new Uint8Array(10 + corpo.length);
  q.set([...id].map((c) => c.charCodeAt(0)));
  new DataView(q.buffer).setUint32(4, corpo.length);
  q.set(corpo, 10);
  return q;
}

/**
 * Cabeçalho ID3v2.3 para colar na frente de um MP3. Leva título, artista,
 * BPM (TBPM) e tom (TKEY), que Serato, rekordbox e outros leem direto.
 */
export function etiquetasId3(e: Etiquetas): Uint8Array {
  const quadros = [
    quadro('TIT2', e.titulo), quadro('TPE1', e.artista), quadro('TBPM', String(Math.round(e.bpm))), quadro('TKEY', e.tom),
    ...(e.isrc ? [quadro('TSRC', e.isrc)] : []),
  ];
  const tamanho = quadros.reduce((n, q) => n + q.length, 0);
  const saida = new Uint8Array(10 + tamanho);
  saida.set([0x49, 0x44, 0x33, 3, 0, 0]);
  // O tamanho vai em 4 bytes de 7 bits ("synchsafe"), para nunca parecer início de áudio.
  for (let i = 0; i < 4; i++) saida[6 + i] = (tamanho >> (7 * (3 - i))) & 0x7f;
  let pos = 10;
  for (const q of quadros) {
    saida.set(q, pos);
    pos += q.length;
  }
  return saida;
}

/** Tom na notação que os programas de DJ esperam no campo TKEY: "Am", "F#", "Cm"... */
export function tomCurto(tom: number, escala: 'maior' | 'menor'): string {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][tom] + (escala === 'menor' ? 'm' : '');
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of dados) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Junta vários arquivos em um .zip, sem comprimir (áudio já não comprime
 * bem, e assim o código fica curto). Os nomes vão em UTF-8.
 */
export function zip(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = new TextEncoder().encode(a.nome);
    const crc = crc32(a.dados);
    const local = new Uint8Array(30 + nome.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // nomes em UTF-8
    v.setUint32(14, crc, true);
    v.setUint32(18, a.dados.length, true);
    v.setUint32(22, a.dados.length, true);
    v.setUint16(26, nome.length, true);
    local.set(nome, 30);
    const dir = new Uint8Array(46 + nome.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x0800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, a.dados.length, true);
    d.setUint32(24, a.dados.length, true);
    d.setUint16(28, nome.length, true);
    d.setUint32(42, pos, true);
    dir.set(nome, 46);
    partes.push(local, a.dados);
    central.push(dir);
    pos += local.length + a.dados.length;
  }
  const tamanhoCentral = central.reduce((n, c) => n + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoCentral, true);
  f.setUint32(16, pos, true);
  const tudo = [...partes, ...central, fim];
  const saida = new Uint8Array(tudo.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of tudo) {
    saida.set(p, o);
    o += p.length;
  }
  return saida;
}

export interface ItemDaConferencia {
  ok: boolean;
  texto: string;
}

/** Confere o áudio final contra o que as distribuidoras e plataformas pedem. */
export function conferirAudio(canais: Float32Array[], taxa: number, lufs: number): ItemDaConferencia[] {
  const n = canais[0].length;
  let pico = 0;
  const limiar = 10 ** (-60 / 20);
  let primeiro = n;
  let ultimo = 0;
  for (const c of canais) {
    for (let i = 0; i < n; i++) {
      const v = Math.abs(c[i]);
      if (v > pico) pico = v;
      if (v > limiar) {
        if (i < primeiro) primeiro = i;
        if (i > ultimo) ultimo = i;
      }
    }
  }
  const picoDb = 20 * Math.log10(pico || 1e-6);
  const silencioIni = primeiro / taxa;
  const silencioFim = (n - ultimo) / taxa;
  const duracao = n / taxa;
  return [
    { ok: picoDb <= -0.9, texto: `Pico em ${picoDb.toFixed(1)} dBFS (o pedido é até -1).` },
    { ok: Number.isFinite(lufs) && lufs <= -9 && lufs >= -18, texto: Number.isFinite(lufs) ? `Volume em ${lufs.toFixed(1)} LUFS (as plataformas trabalham perto de -14).` : 'A música está em silêncio.' },
    { ok: silencioIni < 1.5, texto: silencioIni < 1.5 ? 'Começa sem silêncio sobrando.' : `Há ${silencioIni.toFixed(1)} s de silêncio no começo.` },
    { ok: silencioFim < 6, texto: silencioFim < 6 ? 'Termina sem silêncio sobrando.' : `Há ${silencioFim.toFixed(1)} s de silêncio no fim.` },
    { ok: duracao >= 60, texto: duracao >= 60 ? `Duração de ${Math.floor(duracao / 60)}:${String(Math.floor(duracao % 60)).padStart(2, '0')}.` : `A música tem só ${Math.round(duracao)} s; trechos curtos podem ser recusados pela distribuidora.` },
  ];
}
