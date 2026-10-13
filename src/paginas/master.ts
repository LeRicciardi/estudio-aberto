// Página Master: acabamento da música e exportação.

import { camelot } from '../engine/diagnostico.ts';
import { type Partes, exportarMix, paraMp3, paraWav } from '../engine/engine.ts';
import { type Escuta, PRESETS_MASTER } from '../engine/mixer.ts';
import { av, engine, estado, mudou } from '../estado.ts';
import { NOTAS, type PresetMaster } from '../model/project.ts';
import { secMaster } from '../moldura.ts';
import { guardarVersao } from '../storage.ts';
import { baixar, botao, explicacao, giratorio, h, opcoes, seletor } from '../ui/controles.ts';
import { painelDeDiagnostico } from './diagnostico.ts';
import { desenharProjeto } from './projeto.ts';

/** Analisador de espectro: mostra, ao vivo, quanto som há em cada frequência, do grave ao agudo. */
function analisador(): HTMLElement {
  const tela = h('canvas', { className: 'espectro', width: 720, height: 150 });
  const dados = new Uint8Array(512);
  const BARRAS = 48;
  estado.quadrosDoMaster.push(() => {
    const g = tela.getContext('2d');
    if (!g) return;
    engine.mixer.espectro(dados);
    g.clearRect(0, 0, tela.width, tela.height);
    for (let b = 0; b < BARRAS; b++) {
      // Faixas em escala logarítmica, de 30 Hz a 18 kHz, como o ouvido percebe.
      const de = Math.floor((30 * (600 ** (b / BARRAS)) / (engine.ctx.sampleRate / 2)) * dados.length);
      const ate = Math.max(de + 1, Math.floor((30 * (600 ** ((b + 1) / BARRAS)) / (engine.ctx.sampleRate / 2)) * dados.length));
      let pico = 0;
      for (let k = de; k < ate && k < dados.length; k++) pico = Math.max(pico, dados[k]);
      const altura = engine.tocando ? (pico / 255) * tela.height : 2;
      g.fillStyle = b < BARRAS * 0.3 ? '#7dde5a' : b < BARRAS * 0.7 ? '#ff9d2e' : '#ff6b9d';
      g.fillRect(b * (tela.width / BARRAS) + 1, tela.height - altura, tela.width / BARRAS - 2, altura);
    }
  });
  return h('div', {}, tela, h('div', { className: 'linha legenda-espectro' }, h('span', {}, 'Grave'), h('span', {}, 'Médio'), h('span', {}, 'Agudo')));
}

export function desenharMaster() {
  estado.quadrosDoMaster = [];
  const resultado = h('p', { className: 'nota' });
  const exportar = async (partes: Partes, sufixo: string, mp3 = false) => {
    resultado.textContent = 'Renderizando...';
    try {
      const r = await exportarMix(estado.projeto, engine.buffers, partes);
      // Nome no padrão que DJs e colaboradores esperam: versão, BPM e tom (com a notação Camelot).
      const p = estado.projeto;
      const nome = `${p.nome || 'musica'}${sufixo} [${p.bpm} BPM ${camelot(p.tom, p.escala)} ${NOTAS[p.tom]} ${p.escala}]`;
      if (partes === 'tudo') void guardarVersao(p, 'Exportação').then(desenharProjeto);
      if (mp3) baixar(await paraMp3(r.audio), `${nome}.mp3`);
      else baixar(paraWav(r.audio), `${nome}.wav`);
      const lufs = Number.isFinite(r.lufs) ? `${r.lufs.toFixed(1)} LUFS` : 'silêncio';
      const comparacao = !Number.isFinite(r.lufs) || partes !== 'tudo' ? ''
        : r.lufs > -13 ? ' Mais alto que o padrão do Spotify (-14): a plataforma vai abaixar o volume.'
        : r.lufs < -16 ? ' Mais baixo que o padrão do Spotify (-14).'
        : ' Dentro do padrão do Spotify (-14).';
      resultado.textContent = `Pronto. Volume: ${lufs}, pico ${r.picoDb.toFixed(1)} dBFS.${comparacao}`;
    } catch {
      resultado.textContent = 'A exportação falhou.';
    }
  };
  const a = estado.projeto.ajusteDoMaster;
  const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
  const banda = (rotulo: string, chave: 'graveDb' | 'medioDb' | 'agudoDb') =>
    giratorio({ rotulo, min: -6, max: 6, valor: a[chave], padrao: 0, formato: db, aoMudar: (v) => { a[chave] = v; } });

  secMaster.replaceChildren(
    h('h2', {}, 'Master'),
    h('p', { className: 'nota' }, 'O master é o acabamento da música inteira, depois que voz e beat já estão equilibrados no mixer.'),
    h('div', { className: 'aparelho' },
      h('div', { className: 'aparelho-titulo' }, 'Acabamento'),
      h('div', { className: 'aparelho-corpo' },
        h('div', { className: 'fileira' },
          seletor<PresetMaster>('Compressão e volume', opcoes(PRESETS_MASTER, (k) => PRESETS_MASTER[k].nome), estado.projeto.master, (v) => {
            estado.projeto.master = v;
            desenharMaster();
          }),
          av(banda('Grave', 'graveDb')),
          av(banda('Médio', 'medioDb')),
          av(banda('Agudo', 'agudoDb')),
          av(giratorio({ rotulo: 'Multibanda', min: 0, max: 1, valor: a.multibanda ?? 0, padrao: 0, formato: (v) => `${Math.round(v * 100)}%`, aoMudar: (v) => { a.multibanda = v; } })),
          av(giratorio({ rotulo: 'Limitador suave', min: 0, max: 1, valor: a.clipper ?? 0, padrao: 0, formato: (v) => `${Math.round(v * 100)}%`, aoMudar: (v) => { a.clipper = v; } })),
          av(giratorio({ rotulo: 'Largura', min: 0, max: 2, valor: a.largura, padrao: 1, formato: (v) => (v < 0.05 ? 'Mono' : `${Math.round(v * 100)}%`), aoMudar: (v) => { a.largura = v; } })),
        ),
        h('div', { className: 'fileira' },
          Object.assign(giratorio({
            rotulo: 'Volume final', min: -18, max: -8, passo: 0.5, valor: a.alvoLufs ?? -14, padrao: -14,
            formato: (v) => `${v.toFixed(1)} LUFS`,
            aoMudar: (v) => { a.alvoLufs = v; },
          }), { className: 'giratorio grande' }),
          h('div', {},
            h('p', { className: 'nota' }, a.alvoLufs === null ? 'Sem ajuste: a música sai no volume em que está.' : a.alvoLufs <= -15 ? 'Mais dinâmica, menos alta. Bom para Apple Music.' : a.alvoLufs <= -13 ? 'O padrão do Spotify e do YouTube.' : a.alvoLufs <= -10.5 ? 'Alto: SoundCloud, carro, festa.' : 'Muito alto: as batidas começam a achatar.'),
            botao(a.alvoLufs === null ? 'Ligar o ajuste de volume' : 'Não ajustar o volume', () => {
              a.alvoLufs = a.alvoLufs === null ? -14 : null;
              mudou();
              desenharMaster();
            }),
          ),
        ),
        analisador(),
        explicacao([
          ...PRESETS_MASTER[estado.projeto.master].explicacao,
          'Grave, médio e agudo: ajuste fino do tom da música inteira. Use pouco (1 a 2 dB); se precisar de muito, o problema está na mix.',
          'Multibanda: separa a música em grave, médio e agudo e comprime cada parte sozinha. Segura um 808 que salta sem abaixar a voz junto. De 20 a 40% já organiza; muito deixa tudo sem vida.',
          'Limitador suave (soft clipper): arredonda os picos das batidas em vez de abaixar a música inteira. Dá volume mantendo o impacto do bumbo; em excesso, distorce.',
          'Largura: abre ou fecha o estéreo. Acima de 100% a música parece mais larga; em "Mono" você confere como ela soa em caixa de som de celular.',
          'O analisador mostra onde está o som: verde é grave, laranja é médio, rosa é agudo. Uma música equilibrada tem as três regiões presentes; um buraco no meio ou agudo demais aparece na hora.',
          'Volume final: a exportação mede o volume percebido da música (em LUFS) e ajusta para o alvo. As plataformas igualam o volume de todas as músicas, então passar do alvo delas não deixa a sua mais alta lá.',
          'Depois de tudo, um limitador de pico garante que nada passe de -1 dBFS, a folga pedida pelas plataformas.',
        ]),
      ),
    ),
    painelDeDiagnostico(),
    h('h3', {}, 'Conferir em outras caixas'),
    h('div', { className: 'abas' }, ...([['normal', 'Normal'], ['mono', 'Mono'], ['celular', 'Caixa de celular']] as [Escuta, string][]).map(([modo, rotulo]) =>
      botao(rotulo, () => {
        engine.mixer.definirEscuta(modo);
        desenharMaster();
      }, engine.mixer.escuta === modo ? 'ativo' : ''),
    )),
    explicacao([
      'Muita gente vai ouvir sua música em mono (som de festa, caixa bluetooth) ou na caixa do celular, que não toca grave.',
      'Se em "Mono" algo some, o estéreo está aberto demais. Se em "Caixa de celular" o 808 desaparece e a música perde o chão, ele precisa de mais harmônicos (kit com distorção) ou de uma melodia que marque as notas.',
      'Isso muda só o que você ouve agora; a exportação não é afetada.',
    ]),
    h('h3', {}, 'Exportar'),
    h('div', { className: 'linha' },
      Object.assign(botao('Exportar música (WAV)', () => void exportar('tudo', ''), 'principal'), { id: 'exportar-wav' }),
      botao('MP3 para compartilhar', () => void exportar('tudo', '', true)),
      av(botao('Acapella (só as vozes)', () => void exportar('voz', ' (Acapella)'))),
      av(botao('Instrumental (só o beat)', () => void exportar('beat', ' (Instrumental)'))),
    ),
    resultado,
    explicacao([
      'WAV (16 bits, 44,1 kHz) é o formato aceito pelas distribuidoras. MP3 é para mandar no WhatsApp e ouvir no celular.',
      'Acapella e instrumental servem para mandar a outra pessoa mixar e para DJs fazerem montagens e viradas.',
      'O nome do arquivo leva o BPM e o tom, também na notação Camelot (ex.: 8A), que DJs usam para saber quais músicas combinam.',
    ]),
  );
}
