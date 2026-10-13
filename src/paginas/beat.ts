// Página Beat: bateria em grade, kits e samples, ou um beat importado.

import { carregarDaBiblioteca, sonsDaBiblioteca } from '../biblioteca.ts';
import { KITS } from '../engine/synths.ts';
import { analisarEmSegundoPlano, esticarEmSegundoPlano } from '../engine/tuneClient.ts';
import { av, engine, estado, id, mudou, relogio } from '../estado.ts';
import { type Escala, type KitId, LANES, type LaneId, NOTAS, PREFIXO_DE_FABRICA, SAMPLES_DE_FABRICA, STEPS, passosDoPadrao, redimensionar } from '../model/project.ts';
import { avisar, secCanais } from '../moldura.ts';
import { guardarAudio } from '../storage.ts';
import { parar, reiniciarSeTocando } from '../transporte.ts';
import { botao, campo, deslizante, explicacao, h, numero, opcoes, seletor } from '../ui/controles.ts';
import { desenharArranjo } from './arranjo.ts';
import { desenharEstilo } from './estilo.ts';
import { abasDePadrao, abrirPadrao, gradeDeBateria } from './grades.ts';
import { desenharNotas } from './notas.ts';
import { reafinarTodos } from './voz.ts';

/** Redesenha as três páginas do beat: Beat, Notas e Arranjo. */
export function desenharBeat() {
  const aberto = estado.projeto.padroes[estado.padraoAtual];
  estado.colunas = Array.from({ length: aberto ? passosDoPadrao(aberto) : STEPS }, () => []);
  desenharCanais();
  desenharNotas();
  desenharArranjo();
}

function desenharCanais() {
  const beat = estado.projeto.beat;
  const abas = h('div', { className: 'abas' },
    ...([['padrao', 'Criar beat'], ['arquivo', 'Importar beat pronto']] as const).map(([fonte, nome]) =>
      botao(nome, () => {
        parar();
        beat.fonte = fonte;
        mudou();
        desenharBeat();
      }, beat.fonte === fonte ? 'ativo' : ''),
    ),
  );
  const volume = deslizante('Volume do beat', 0, 1.2, 0.01, beat.volume, (v) => { beat.volume = v; });
  const caixaEspaco = h('input', { type: 'checkbox', checked: beat.espaco });
  caixaEspaco.onchange = () => {
    beat.espaco = caixaEspaco.checked;
    mudou();
    reiniciarSeTocando();
  };
  const caixaSidechain = h('input', { type: 'checkbox', checked: beat.sidechain ?? true });
  caixaSidechain.onchange = () => {
    beat.sidechain = caixaSidechain.checked;
    mudou();
  };
  const sidechain = h('label', { className: 'caixa' }, caixaSidechain, 'O 808 abaixa a cada bumbo');
  const espaco = h('div', { className: 'linha' },
    h('label', { className: 'caixa' }, caixaEspaco, 'O beat abre espaço quando a voz entra'),
    av(deslizante(`Quanto o beat abaixa com a voz (dB)`, 0, 6, 0.5, beat.cede, (v) => { beat.cede = v; }, reiniciarSeTocando)),
    explicacao([
      'Enquanto a voz canta, o beat perde um pouco da faixa de 3 kHz, onde mora a clareza da letra, e abaixa levemente. Quando a voz para, ele volta inteiro.',
      'É o que engenheiros fazem com compressão e equalização acionadas pela voz. Aqui a curva é calculada a partir da própria gravação.',
      'De 1 a 2 dB quase não se percebe e já resolve. Mais que 4 dB faz o beat "bombear".',
    ]),
  );

  if (beat.fonte === 'arquivo') {
    const arquivo = h('input', { type: 'file', accept: 'audio/*' });
    arquivo.onchange = () => arquivo.files?.[0] && importarBeat(arquivo.files[0]);
    secCanais.replaceChildren(
      h('h2', {}, 'Beat'), abas,
      campo('Arquivo de áudio (MP3, WAV...)', arquivo),
      h('p', { className: 'nota' }, beat.nomeArquivo ? `Beat atual: ${beat.nomeArquivo}` : 'Nenhum beat importado ainda. Você também pode arrastar o arquivo para a janela.'),
      sugestaoDoBeat(),
      h('div', { className: 'linha' },
        numero('BPM do beat', 60, 200, estado.projeto.bpm, (v) => { estado.projeto.bpm = v; desenharEstilo(); }),
        seletor('Tom do beat', NOTAS.map((n, i) => [i, n] as [number, string]), estado.projeto.tom, (v) => { estado.projeto.tom = v; desenharEstilo(); void reafinarTodos(); }),
        seletor<Escala>('Escala', [['menor', 'Menor'], ['maior', 'Maior']], estado.projeto.escala, (v) => { estado.projeto.escala = v; desenharEstilo(); void reafinarTodos(); }),
      ),
      deslizante(`Andamento do beat: ${Math.round((beat.andamento ?? 1) * 100)}% (o tom não muda)`, 0.75, 1.35, 0.01, beat.andamento ?? 1, (v) => {
        // O BPM informado acompanha a mudança.
        estado.projeto.bpm = Math.round((estado.projeto.bpm * v) / (beat.andamento ?? 1));
        beat.andamento = v;
      }, () => {
        desenharBeat();
        desenharEstilo();
        void aplicarAndamento();
      }),
      av(deslizante(`Velocidade do beat: ${Math.round((beat.velocidade ?? 1) * 100)}% (${Math.round(estado.projeto.bpm)} BPM informado)`, 0.8, 1.25, 0.01, beat.velocidade ?? 1, (v) => { beat.velocidade = v; }, () => {
        desenharBeat();
        reiniciarSeTocando();
      })),
      av(h('p', { className: 'nota' }, 'Mudar a velocidade também muda o tom, como num toca-discos: mais rápido fica mais agudo. Depois de mexer, confira o BPM e o tom acima.')),
      h('p', { className: 'nota' }, 'O delay usa o BPM e o tune usa o tom. Com eles errados, o eco sai fora do tempo e a afinação puxa para notas erradas.'),
      volume,
      espaco,
      explicacao([
        'Beat pronto já vem cheio e comprimido, e a voz tende a ficar "por cima" em vez de dentro dele.',
        'Abrir espaço faz um corte suave no beat em 3 kHz, a região onde mora a clareza da letra. Baixar um pouco o volume do beat também ajuda.',
      ]),
    );
    return;
  }

  const padrao = estado.projeto.padroes[estado.padraoAtual];
  const emUso = (i: number) => estado.projeto.arranjo.some((b) => b.padrao === i);
  const nomeDoPadrao = h('input', { type: 'text', value: padrao.nome });
  nomeDoPadrao.onchange = () => {
    padrao.nome = nomeDoPadrao.value || 'Padrão';
    mudou();
    desenharBeat();
  };
  const apagar = botao('Apagar padrão', () => {
    estado.projeto.padroes.splice(estado.padraoAtual, 1);
    for (const b of estado.projeto.arranjo) if (b.padrao > estado.padraoAtual) b.padrao--;
    abrirPadrao(Math.max(0, estado.padraoAtual - 1));
  }, 'perigo');
  apagar.disabled = estado.projeto.padroes.length < 2 || emUso(estado.padraoAtual);
  apagar.title = emUso(estado.padraoAtual) ? 'Tire o padrão do arranjo antes de apagar' : '';

  const pinceis = h('div', { className: 'abas' },
    ...([[1, 'Normal'], [6, 'Forte'], [5, 'Fraco'], [2, 'Rolo 2x'], [3, 'Rolo 3x'], [4, 'Rolo 4x']] as const).map(([v, nome]) =>
      botao(nome, () => {
        estado.pincel = v;
        desenharBeat();
      }, estado.pincel === v ? 'ativo' : ''),
    ),
  );

  secCanais.replaceChildren(
    h('h2', {}, 'Beat'), abas,
    h('p', { className: 'nota so-simples' }, 'O beat do estilo já vem pronto: aperte Tocar. Clique nos quadrados para mudar a bateria. Em "Mostrar tudo" ficam o 808, a melodia, os samples e o arranjo.'),
    av(h('h3', {}, 'Padrão')),
    av(abasDePadrao()),
    av(h('div', { className: 'linha' }, campo('Nome do padrão', nomeDoPadrao), apagar)),
    h('h3', {}, 'Bateria'),
    h('div', { className: 'linha' },
      av(seletor('Tamanho do padrão', [[1, '1 compasso'], [2, '2 compassos'], [4, '4 compassos']] as [number, string][], padrao.compassos ?? 1, (v) => {
        redimensionar(padrao, v);
        desenharBeat();
        reiniciarSeTocando();
      })),
      seletor<KitId>('Kit', opcoes(KITS, (k) => KITS[k].nome), estado.projeto.kit, (v) => { estado.projeto.kit = v; }),
      deslizante('Volume', 0, 1.2, 0.01, estado.projeto.volumes.bateria, (v) => { estado.projeto.volumes.bateria = v; }),
    ),
    av(campo('Pincel: o que um clique escreve', pinceis)),
    gradeDeBateria(),
    av(ajustesDosSons()),
    av(samples()),
    explicacao([
      'Cada linha é um som e cada quadrado é um instante do compasso (16 por compasso). Os quadrados mais claros marcam as 4 batidas.',
      'Forte e fraco: três volumes por nota. Notas fracas entre as fortes dão balanço; um acento no lugar certo dá o "pulo" do ritmo.',
      'Rolo: repete o som 2, 3 ou 4 vezes dentro de um quadrado. É o chimbal acelerado do trap.',
    ]),
    av(h('h3', {}, 'Peso')),
    av(h('div', { className: 'linha' },
      deslizante('Estourar o beat', 0, 1, 0.05, beat.estourar ?? 0, (v) => { beat.estourar = v; }),
      sidechain,
    )),
    av(explicacao([
      'Estourar: empurra o beat inteiro contra um limite, distorcendo de propósito. É o som do mandelão e da bruxaria. Um pouco já engorda qualquer beat.',
      'O 808 abaixa a cada bumbo: os dois ocupam o mesmo grave, e sem isso viram uma massa só. Com isso o bumbo bate e o 808 volta logo atrás.',
    ])),
    volume,
    espaco,
  );
}

let somAberto: LaneId = 'hat';

/** Volume, lado, balanço e altura de um som da bateria, um de cada vez. */
function ajustesDosSons(): HTMLElement {
  const p = estado.projeto;
  const som = (p.sons ??= {})[somAberto] ??= { volume: 1, pan: 0, swing: 0, altura: 0 };
  return h('details', { className: 'explica' },
    h('summary', {}, 'Ajustar cada som (volume, lado, balanço)'),
    h('div', { className: 'linha' },
      seletor<LaneId>('Som', LANES.map((l) => [l.id, l.nome] as [LaneId, string]), somAberto, (v) => {
        somAberto = v;
        desenharBeat();
      }),
      deslizante('Volume', 0, 1.5, 0.01, som.volume, (v) => { som.volume = v; }),
      deslizante('Lado (esq. / dir.)', -1, 1, 0.05, som.pan, (v) => { som.pan = v; }),
      deslizante('Balanço só deste som', 0, 0.5, 0.01, som.swing, (v) => { som.swing = v; }),
      deslizante('Altura (só em samples)', -12, 12, 1, som.altura, (v) => { som.altura = v; }),
    ),
    h('p', {}, 'Chimbal um pouco para um lado e percussão para o outro abrem o beat. No boombap, o chimbal costuma ter mais balanço que o bumbo e a caixa: use o balanço só deste som para isso.'),
  );
}

/** Refaz a versão do beat importado com o andamento escolhido, sem mudar o tom. */
export async function aplicarAndamento() {
  const beat = estado.projeto.beat;
  const original = engine.buffers.get(beat.audioId ?? '');
  const fator = beat.andamento ?? 1;
  if (!original || !beat.audioId) return;
  if (fator === 1) {
    engine.buffers.delete(beat.audioId + ':tempo');
    return;
  }
  avisar('Ajustando o andamento do beat...');
  const canais = Array.from({ length: original.numberOfChannels }, (_, c) => original.getChannelData(c));
  const prontos = await esticarEmSegundoPlano(canais, original.sampleRate, fator);
  const buffer = engine.ctx.createBuffer(prontos.length, prontos[0].length, original.sampleRate);
  prontos.forEach((c, i) => buffer.copyToChannel(c, i));
  engine.buffers.set(beat.audioId + ':tempo', buffer);
  avisar(`Andamento do beat em ${Math.round(fator * 100)}%, com o tom preservado.`);
  reiniciarSeTocando();
}

/** Lista para trocar cada som sintetizado por um sample (arquivo de áudio) do usuário. */
export function samples(): HTMLElement {
  const lista = h('div', { className: 'samples' });
  for (const lane of LANES) {
    const atual = estado.projeto.samples[lane.id];
    const arquivo = h('input', { type: 'file', accept: 'audio/*', ariaLabel: `Sample para ${lane.nome}` });
    arquivo.onchange = () => arquivo.files?.[0] && carregarSample(lane.id, arquivo.files[0]);
    const deFabrica = SAMPLES_DE_FABRICA[lane.id];
    const prontos = h('select', { ariaLabel: `Sample pronto para ${lane.nome}` }, h('option', { value: '' }, 'Samples prontos...'));
    for (const s of deFabrica ?? []) prontos.append(h('option', { value: s.arquivo }, s.nome));
    prontos.onchange = async () => {
      const escolhido = deFabrica?.find((s) => s.arquivo === prontos.value);
      if (!escolhido) return;
      const audioId = PREFIXO_DE_FABRICA + escolhido.arquivo;
      if (!(await carregarDeFabrica(audioId))) return avisar('Não consegui baixar esse sample.');
      estado.projeto.samples[lane.id] = { audioId, nome: escolhido.nome };
      mudou();
      desenharBeat();
    };
    const meus = sonsDaBiblioteca().filter((s) => s.tipo === lane.id);
    const daBiblioteca = h('select', { ariaLabel: `Som da minha biblioteca para ${lane.nome}` }, h('option', { value: '' }, 'Da minha biblioteca...'));
    for (const s of meus) daBiblioteca.append(h('option', { value: s.id }, s.nome));
    daBiblioteca.onchange = async () => {
      const escolhido = meus.find((s) => s.id === daBiblioteca.value);
      if (!escolhido) return;
      if (!(await carregarDaBiblioteca(escolhido.id))) return avisar('Não consegui ler esse som.');
      estado.projeto.samples[lane.id] = { audioId: escolhido.id, nome: escolhido.nome };
      mudou();
      desenharBeat();
    };
    lista.append(h('div', { className: 'linha' },
      h('span', { className: 'nome-linha' }, lane.nome),
      atual ? h('span', { className: 'nota' }, atual.nome) : arquivo,
      !atual && deFabrica ? prontos : '',
      !atual && meus.length ? daBiblioteca : '',
      atual
        ? botao('Voltar ao som do kit', () => {
            delete estado.projeto.samples[lane.id];
            mudou();
            desenharBeat();
          })
        : '',
    ));
  }
  return h('details', { className: 'explica' },
    h('summary', {}, `Usar meus samples${Object.keys(estado.projeto.samples).length ? ` (${Object.keys(estado.projeto.samples).length} em uso)` : ''}`),
    botao('Usar os samples prontos em toda a bateria', async () => {
      for (const lane of LANES) {
        const primeiro = SAMPLES_DE_FABRICA[lane.id]?.[0];
        if (!primeiro) continue;
        const audioId = PREFIXO_DE_FABRICA + primeiro.arquivo;
        if (await carregarDeFabrica(audioId)) estado.projeto.samples[lane.id] = { audioId, nome: primeiro.nome };
      }
      mudou();
      desenharBeat();
    }),
    h('p', {}, 'Sample é um som gravado: um bumbo, uma caixa, uma palma de um pack. Escolha um arquivo curto (WAV ou MP3) para tocar no lugar do som do kit. Use só samples que você tem direito de usar. Os samples prontos do estúdio são de domínio público.'),
    lista,
  );
}

/** Baixa e decodifica um sample que vem com o estúdio. */
export async function carregarDeFabrica(audioId: string): Promise<boolean> {
  if (engine.buffers.has(audioId)) return true;
  try {
    const resposta = await fetch(`./samples/${audioId.slice(PREFIXO_DE_FABRICA.length)}`);
    if (!resposta.ok) return false;
    engine.buffers.set(audioId, await engine.ctx.decodeAudioData(await resposta.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

export async function carregarSample(lane: LaneId, arquivo: File) {
  try {
    const buffer = await engine.ctx.decodeAudioData(await arquivo.arrayBuffer());
    if (buffer.duration > 10) return avisar('Esse arquivo é longo demais para um sample de bateria (máximo de 10 segundos).');
    const audioId = id();
    engine.buffers.set(audioId, buffer);
    estado.projeto.samples[lane] = { audioId, nome: arquivo.name };
    mudou();
    desenharBeat();
    await guardarAudio(audioId, { tipo: 'arquivo', blob: arquivo });
  } catch {
    avisar('Não consegui ler esse arquivo de áudio.');
  }
}

/** O que a análise automática achou do beat importado, até a pessoa aceitar ou dispensar. */
export async function analisarBeat(buffer: AudioBuffer) {
  estado.analise = null;
  // Um minuto e meio do meio da música basta e evita intros vazias.
  const ini = Math.floor(Math.min(buffer.duration * 0.15, 20) * buffer.sampleRate);
  const fim = Math.min(buffer.length, ini + 90 * buffer.sampleRate);
  const mono = new Float32Array(fim - ini);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += canal[ini + i] / buffer.numberOfChannels;
  }
  estado.analise = await analisarEmSegundoPlano(mono, buffer.sampleRate);
  desenharBeat();
}

export function sugestaoDoBeat(): HTMLElement | string {
  if (!estado.projeto.beat.audioId) return '';
  if (!estado.analise) return h('p', { className: 'nota' }, 'Analisando o beat para sugerir BPM e tom...');
  const { bpm, tom } = estado.analise;
  const usarBpm = (v: number) => botao(`Usar ${v} BPM`, () => {
    estado.projeto.bpm = v;
    mudou();
    desenharEstilo();
    desenharBeat();
  }, estado.projeto.bpm === v ? 'ativo' : '');
  const linhas: (HTMLElement | string)[] = [];
  if (bpm) {
    linhas.push(h('p', {}, `Andamento: parece ser ${bpm.bpm} BPM. Se o beat for contado na metade ou no dobro, é ${bpm.alternativa}.`));
    linhas.push(h('div', { className: 'linha' }, usarBpm(bpm.bpm), usarBpm(bpm.alternativa)));
  }
  if (tom) {
    const nomeDoTom = `${NOTAS[tom.tom]} ${tom.escala}`;
    const emUso = estado.projeto.tom === tom.tom && estado.projeto.escala === tom.escala;
    linhas.push(h('p', {}, tom.confianca < 0.05
      ? `Tom: meu melhor palpite é ${nomeDoTom}, mas com pouca certeza. Confira no nome do arquivo ou com quem fez o beat.`
      : `Tom: parece ser ${nomeDoTom}.`));
    linhas.push(botao(`Usar ${nomeDoTom}`, () => {
      estado.projeto.tom = tom.tom;
      estado.projeto.escala = tom.escala;
      mudou();
      desenharEstilo();
      desenharBeat();
      void reafinarTodos();
    }, emUso ? 'ativo' : ''));
  }
  const cents = estado.analise.cents;
  if (cents !== null && Math.abs(cents) >= 12) {
    const acompanha = Math.abs((estado.projeto.afinacaoCents ?? 0) - cents) < 3;
    linhas.push(h('p', {}, `Afinação: o beat está ${Math.abs(Math.round(cents))} cents ${cents > 0 ? 'acima' : 'abaixo'} do padrão, "entre as notas". Sem ajuste, o tune puxa a voz para notas que não batem com ele.`));
    linhas.push(botao(acompanha ? 'O tune já acompanha o beat' : 'Fazer o tune acompanhar o beat', () => {
      estado.projeto.afinacaoCents = Math.round(cents);
      mudou();
      desenharBeat();
      void reafinarTodos();
    }, acompanha ? 'ativo' : ''));
  }
  if (!bpm && !tom) linhas.push(h('p', {}, 'Não consegui identificar BPM nem tom neste arquivo. Informe os dois abaixo.'));
  return h('div', { className: 'sugestao' }, h('strong', {}, 'Sugestão automática'), ...linhas,
    h('p', { className: 'nota' }, 'É uma estimativa. Se o beat veio com BPM e tom no nome do arquivo, confie no nome.'));
}

export async function importarBeat(arquivo: File) {
  try {
    avisar('Carregando beat...');
    const buffer = await engine.ctx.decodeAudioData(await arquivo.arrayBuffer());
    const audioId = id();
    engine.buffers.set(audioId, buffer);
    estado.projeto.beat.fonte = 'arquivo';
    estado.projeto.beat.audioId = audioId;
    estado.projeto.beat.nomeArquivo = arquivo.name;
    mudou();
    desenharBeat();
    avisar(`Beat carregado: ${relogio(buffer.duration)} de duração.`);
    void analisarBeat(buffer);
    await guardarAudio(audioId, { tipo: 'arquivo', blob: arquivo });
  } catch {
    avisar('Não consegui ler esse arquivo de áudio.');
  }
}
