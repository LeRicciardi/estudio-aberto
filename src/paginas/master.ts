// Página Master: acabamento da música e exportação.

import { type Partes, exportarMix, paraMp3, paraWav } from '../engine/engine.ts';
import { PRESETS_MASTER } from '../engine/mixer.ts';
import { av, engine, estado } from '../estado.ts';
import { type PresetMaster } from '../model/project.ts';
import { secMaster } from '../moldura.ts';
import { baixar, botao, explicacao, giratorio, h, opcoes, seletor } from '../ui/controles.ts';

export function desenharMaster() {
  const resultado = h('p', { className: 'nota' });
  const exportar = async (partes: Partes, sufixo: string, mp3 = false) => {
    resultado.textContent = 'Renderizando...';
    try {
      const r = await exportarMix(estado.projeto, engine.buffers, partes);
      const nome = `${estado.projeto.nome || 'musica'}${sufixo}`;
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
          av(giratorio({ rotulo: 'Largura', min: 0, max: 2, valor: a.largura, padrao: 1, formato: (v) => (v < 0.05 ? 'Mono' : `${Math.round(v * 100)}%`), aoMudar: (v) => { a.largura = v; } })),
        ),
        seletor('Volume final da exportação', [
          ['nenhum', 'Não ajustar'],
          ['-16', '-16 LUFS (mais dinâmica; Apple Music)'],
          ['-14', '-14 LUFS (Spotify, YouTube)'],
          ['-11', '-11 LUFS (alto; SoundCloud, carro, festa)'],
        ] as [string, string][], a.alvoLufs === null ? 'nenhum' : String(a.alvoLufs), (v) => { a.alvoLufs = v === 'nenhum' ? null : Number(v); }),
        explicacao([
          ...PRESETS_MASTER[estado.projeto.master].explicacao,
          'Grave, médio e agudo: ajuste fino do tom da música inteira. Use pouco (1 a 2 dB); se precisar de muito, o problema está na mix.',
          'Largura: abre ou fecha o estéreo. Acima de 100% a música parece mais larga; em "Mono" você confere como ela soa em caixa de som de celular.',
          'Volume final: a exportação mede o volume percebido da música (em LUFS) e ajusta para o alvo. As plataformas igualam o volume de todas as músicas, então passar do alvo delas não deixa a sua mais alta lá.',
          'Depois de tudo, um limitador de pico garante que nada passe de -1 dBFS, a folga pedida pelas plataformas.',
        ]),
      ),
    ),
    h('h3', {}, 'Exportar'),
    h('div', { className: 'linha' },
      Object.assign(botao('Exportar música (WAV)', () => void exportar('tudo', ''), 'principal'), { id: 'exportar-wav' }),
      botao('MP3 para compartilhar', () => void exportar('tudo', '', true)),
      av(botao('Só as vozes', () => void exportar('voz', ' - vozes'))),
      av(botao('Só o beat', () => void exportar('beat', ' - beat'))),
    ),
    resultado,
    explicacao([
      'WAV (16 bits, 44,1 kHz) é o formato aceito pelas distribuidoras. MP3 é para mandar no WhatsApp e ouvir no celular.',
      '"Só as vozes" e "Só o beat" servem para mandar a outra pessoa mixar ou para fazer versões (acapella, instrumental).',
    ]),
  );
}
