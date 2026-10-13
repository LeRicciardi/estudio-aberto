// Página Lançar: dados da música, ficha do beat, conferência do que as
// distribuidoras pedem e o pacote de arquivos para entregar.

import { camelot } from '../engine/diagnostico.ts';
import { exportarMix, paraMp3, paraWav, type Exportacao } from '../engine/engine.ts';
import { conferirAudio, etiquetasId3, tomCurto, zip, type ItemDaConferencia } from '../engine/entrega.ts';
import { av, engine, estado, mudou } from '../estado.ts';
import { NOTAS, STEPS, type Project } from '../model/project.ts';
import { avisar, secLancar } from '../moldura.ts';
import { baixar, botao, campo, explicacao, h, seletor } from '../ui/controles.ts';

let conferencia: ItemDaConferencia[] = [];
let capa: ItemDaConferencia | null = null;
let trabalhando = false;
let bits: 16 | 24 = 16;
let introDj = 8;

const dados = () => estado.projeto.lancamento!;

function texto(rotulo: string, valor: string, aoMudar: (v: string) => void, dica = ''): HTMLElement {
  const input = h('input', { type: 'text', value: valor, placeholder: dica });
  input.onchange = () => {
    aoMudar(input.value.trim());
    mudou();
    desenharLancar();
  };
  return campo(rotulo, input);
}

/** Nome de arquivo no padrão de DJs e colaboradores: artista, título, versão, BPM e tom. */
function nomeDoArquivo(versao = ''): string {
  const p = estado.projeto;
  const artista = dados().artista ? `${dados().artista} - ` : '';
  return `${artista}${p.nome || 'musica'}${versao ? ` (${versao})` : ''} [${p.bpm} BPM ${camelot(p.tom, p.escala)}]`.replace(/[\\/:*?"<>|]/g, '');
}

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const canais = (r: Exportacao) => Array.from({ length: r.audio.numberOfChannels }, (_, c) => r.audio.getChannelData(c));

/** Projeto derivado em que só uma parte soa, para exportar as faixas separadas. */
function soUmaParte(parte: 'bateria' | 'baixo' | 'melodia' | string): Project {
  const p = estado.projeto;
  const beat = parte === 'bateria' || parte === 'baixo' || parte === 'melodia';
  return {
    ...p,
    beat: { ...p.beat, espaco: false, volume: beat ? p.beat.volume : 0 },
    volumes: { bateria: parte === 'bateria' ? p.volumes.bateria : 0, baixo: parte === 'baixo' ? p.volumes.baixo : 0, melodia: parte === 'melodia' ? p.volumes.melodia : 0 },
    takes: p.takes.map((t) => ({ ...t, mudo: t.mudo || t.id !== parte })),
    ajusteDoMaster: { ...p.ajusteDoMaster, alvoLufs: null, clipper: 0 },
    master: 'desligado',
  };
}

/**
 * Versão para DJ: alguns compassos só de beat antes e depois da música, para
 * o DJ ter onde mixar a entrada e a saída. Só para beat criado aqui.
 */
function versaoDj(compassos: number): Project {
  const p = estado.projeto;
  const desloca = (compassos * 4 * 60) / p.bpm;
  const base = p.arranjo.find((b) => !b.mudos?.bateria)?.padrao ?? 0;
  const ponta = { padrao: base, vezes: compassos, nome: 'DJ', mudos: { melodia: true } };
  return { ...p, arranjo: [ponta, ...p.arranjo, { ...ponta }], takes: p.takes.map((t) => ({ ...t, inicio: t.inicio + desloca })), montagem: { ...p.montagem, ligada: false } };
}

async function conferir() {
  trabalhando = true;
  desenharLancar();
  try {
    const r = await exportarMix(estado.projeto, engine.buffers, 'tudo');
    conferencia = conferirAudio(canais(r), r.audio.sampleRate, r.lufs);
  } catch {
    avisar('A conferência falhou.');
  }
  trabalhando = false;
  desenharLancar();
}

async function pacote() {
  trabalhando = true;
  desenharLancar();
  try {
    const p = estado.projeto;
    const l = dados();
    const arquivos: { nome: string; dados: Uint8Array }[] = [];
    const wav = async (nome: string, projeto: Project, partes: 'tudo' | 'voz' | 'beat' = 'tudo') => {
      const r = await exportarMix(projeto, engine.buffers, partes);
      arquivos.push({ nome, dados: await bytes(paraWav(r.audio, bits)) });
      return r;
    };
    avisar('Montando o pacote: música...');
    const principal = await wav(`${nomeDoArquivo()}.wav`, p);
    arquivos.push({ nome: `${nomeDoArquivo()}.mp3`, dados: await bytes(await paraMp3(principal.audio, etiquetasId3({ titulo: p.nome, artista: l.artista, bpm: p.bpm, tom: tomCurto(p.tom, p.escala), comentario: '', isrc: l.isrc }))) });
    avisar('Montando o pacote: acapella e instrumental...');
    await wav(`${nomeDoArquivo('Acapella')}.wav`, p, 'voz');
    await wav(`${nomeDoArquivo('Instrumental')}.wav`, p, 'beat');
    if (p.beat.fonte === 'padrao' && introDj > 0) {
      avisar('Montando o pacote: versão para DJ...');
      await wav(`${nomeDoArquivo(`DJ Intro ${introDj}`)}.wav`, versaoDj(introDj));
    }
    avisar('Montando o pacote: faixas separadas...');
    const partes = [...(p.beat.fonte === 'padrao' ? ['bateria', 'baixo', 'melodia'] : []), ...p.takes.filter((t) => !t.mudo).map((t) => t.id)];
    for (const parte of partes) {
      const nome = p.takes.find((t) => t.id === parte)?.nome ?? { bateria: 'Bateria', baixo: '808', melodia: 'Melodia' }[parte] ?? parte;
      await wav(`Faixas separadas/${nome}.wav`, soUmaParte(parte), p.takes.some((t) => t.id === parte) ? 'voz' : 'beat');
    }
    if (p.beat.fonte === 'arquivo') await wav('Faixas separadas/Beat.wav', { ...soUmaParte('nenhuma'), beat: { ...p.beat, espaco: false } }, 'beat');
    const ficha = [
      `Título: ${p.nome}`, `Artista: ${l.artista || '(não informado)'}`, `Produção do beat: ${l.produtor || '(não informado)'}`,
      `BPM: ${p.bpm}`, `Tom: ${NOTAS[p.tom]} ${p.escala} (${tomCurto(p.tom, p.escala)}, Camelot ${camelot(p.tom, p.escala)})`,
      `ISRC: ${l.isrc || '(a distribuidora atribui)'}`, `Conteúdo explícito: ${l.explicito ? 'sim' : 'não'}`,
      '', 'Licença do beat', `Tipo: ${l.licenca.tipo || '(não informado)'}`, `Limite de streams: ${l.licenca.limite || '-'}`, `Validade: ${l.licenca.validade || '-'}`, `Crédito exigido: ${l.licenca.credito || '-'}`,
      '', `Todas as faixas separadas começam no compasso 1 e têm a mesma duração (${STEPS} passos por compasso, ${p.bpm} BPM).`,
      `Gerado em ${new Date().toLocaleString('pt-BR')} no Estúdio Aberto.`,
    ].join('\n');
    arquivos.push({ nome: 'Ficha.txt', dados: new TextEncoder().encode(ficha) });
    if (p.letra.texto.trim()) arquivos.push({ nome: 'Letra.txt', dados: new TextEncoder().encode(p.letra.texto) });
    baixar(new Blob([zip(arquivos)], { type: 'application/zip' }), `${nomeDoArquivo('Pacote')}.zip`);
    avisar(`Pacote pronto, com ${arquivos.length} arquivos.`);
  } catch {
    avisar('Não consegui montar o pacote.');
  }
  trabalhando = false;
  desenharLancar();
}

/** Confere a imagem de capa contra o que as distribuidoras pedem: quadrada, 3000 px, JPG ou PNG. */
async function conferirCapa(arquivo: File) {
  try {
    const img = await createImageBitmap(arquivo);
    const quadrada = img.width === img.height;
    const grande = Math.min(img.width, img.height) >= 3000;
    const formato = /jpe?g|png/.test(arquivo.type);
    capa = {
      ok: quadrada && grande && formato,
      texto: `Capa de ${img.width} × ${img.height} px, ${arquivo.type.replace('image/', '').toUpperCase()}. ` +
        [quadrada ? '' : 'Precisa ser quadrada.', grande ? '' : 'O recomendado é 3000 × 3000 px (mínimo de 1000).', formato ? '' : 'Use JPG ou PNG.'].filter(Boolean).join(' ') +
        (quadrada && grande && formato ? 'Está no padrão.' : ''),
    };
  } catch {
    capa = { ok: false, texto: 'Não consegui abrir essa imagem.' };
  }
  desenharLancar();
}

const item = (i: ItemDaConferencia) => h('li', { className: i.ok ? 'certo' : 'errado' }, `${i.ok ? '✓' : '✗'} ${i.texto}`);

export function desenharLancar() {
  const l = dados();
  const p = estado.projeto;
  const explicito = h('input', { type: 'checkbox', checked: l.explicito });
  explicito.onchange = () => {
    l.explicito = explicito.checked;
    mudou();
  };
  const arquivoDeCapa = h('input', { type: 'file', accept: 'image/*' });
  arquivoDeCapa.onchange = () => arquivoDeCapa.files?.[0] && void conferirCapa(arquivoDeCapa.files[0]);
  const lista: ItemDaConferencia[] = [
    { ok: !!l.artista, texto: l.artista ? `Artista: ${l.artista}.` : 'Falta o nome do artista.' },
    { ok: !!l.produtor, texto: l.produtor ? `Crédito do beat: prod. ${l.produtor}.` : 'Falta o crédito de quem fez o beat. Quem faz o beat é coautor da música.' },
    { ok: !!l.licenca.tipo, texto: l.licenca.tipo ? `Licença do beat: ${l.licenca.tipo}.` : 'Falta anotar a licença do beat (gratuito, alugado, exclusivo).' },
    ...conferencia,
    ...(capa ? [capa] : [{ ok: false, texto: 'Capa ainda não conferida.' }]),
  ];
  const montar = botao(trabalhando ? 'Trabalhando...' : 'Baixar pacote de entrega (.zip)', () => void pacote(), 'principal');
  const medir = botao(conferencia.length ? 'Conferir o áudio de novo' : 'Conferir o áudio', () => void conferir());
  montar.disabled = medir.disabled = trabalhando;

  secLancar.replaceChildren(
    h('h2', {}, 'Lançar'),
    h('p', { className: 'nota' }, 'O que a distribuidora vai pedir, conferido antes de você enviar, e todos os arquivos da música em um pacote só.'),
    h('h3', {}, 'Dados da música'),
    h('div', { className: 'linha' },
      texto('Artista', l.artista, (v) => { l.artista = v; }),
      texto('Quem fez o beat', l.produtor, (v) => { l.produtor = v; }, 'Nome do produtor'),
      av(texto('ISRC (se já tiver)', l.isrc, (v) => { l.isrc = v; }, 'A distribuidora costuma gerar')),
    ),
    h('label', { className: 'caixa' }, explicito, 'A letra tem palavrão ou conteúdo explícito'),
    h('h3', {}, 'Licença do beat'),
    h('div', { className: 'linha' },
      seletor('Tipo', [['', 'Não informado'], ['Feito por mim', 'Feito por mim'], ['Gratuito (free)', 'Gratuito (free)'], ['Alugado (lease)', 'Alugado (lease)'], ['Exclusivo', 'Exclusivo'], ['Parceria com o produtor', 'Parceria com o produtor']] as [string, string][], l.licenca.tipo, (v) => {
        l.licenca.tipo = v;
        desenharLancar();
      }),
      av(texto('Limite de streams', l.licenca.limite, (v) => { l.licenca.limite = v; }, 'Ex.: 100 mil')),
      av(texto('Validade', l.licenca.validade, (v) => { l.licenca.validade = v; }, 'Ex.: 2 anos')),
      texto('Crédito exigido', l.licenca.credito, (v) => { l.licenca.credito = v; }, 'Ex.: prod. Fulano'),
    ),
    explicacao([
      'Beat "free" da internet quase sempre é só para uso não comercial: para colocar no Spotify é preciso alugar ou comprar a licença.',
      'Beat alugado tem limite de streams e prazo, definidos por cada produtor. Anote aqui para não ser pego de surpresa.',
      'Beat alugado não pode ser cadastrado no Content ID do YouTube: várias pessoas usam o mesmo beat e uma derrubaria o vídeo das outras.',
      'Guarde o comprovante da licença. Em caso de disputa, é ele (e o projeto com data) que prova o seu direito.',
    ]),
    h('h3', {}, 'Conferência'),
    h('div', { className: 'linha' }, medir, campo('Capa (imagem)', arquivoDeCapa)),
    h('ul', { className: 'conferencia' }, ...lista.map(item)),
    explicacao([
      'A conferência do áudio mede a música como ela vai sair: pico, volume, silêncio sobrando e duração.',
      'Capa: as distribuidoras pedem imagem quadrada, de 3000 × 3000 pixels, sem endereço de site, QR code ou preço.',
      'Para receber quando a música tocar em rádio, show e TV, filie-se de graça a uma associação do ECAD (UBC, Abramus e outras). A distribuidora cuida só do streaming.',
      'O ISRC é o código que identifica a gravação. A distribuidora gera de graça; se você já tem um, informe.',
    ]),
    h('h3', {}, 'Pacote de entrega'),
    h('div', { className: 'linha' },
      seletor('Qualidade do WAV', [[16, '16 bits (padrão das distribuidoras)'], [24, '24 bits (para masterizar fora)']] as [16 | 24, string][], bits, (v) => { bits = v; }),
      p.beat.fonte === 'padrao'
        ? seletor('Versão para DJ', [[0, 'Não incluir'], [8, 'Intro e saída de 8 compassos'], [16, 'Intro e saída de 16 compassos']] as [number, string][], introDj, (v) => { introDj = v; })
        : '',
    ),
    montar,
    h('p', { className: 'nota' }, `O pacote leva: música em WAV e MP3 (com BPM e tom gravados no arquivo), acapella, instrumental${p.beat.fonte === 'padrao' ? ', versão para DJ' : ''}, cada faixa separada começando no compasso 1, ficha da música e letra.`),
    explicacao([
      'As faixas separadas começam todas no mesmo ponto e têm a mesma duração: quem for mixar só precisa soltar no programa dele.',
      'Acapella e instrumental oficiais valem ouro para DJs, porque a separação automática deles vaza e soa robótica.',
      'A versão para DJ tem alguns compassos só de batida antes e depois da música, onde o DJ mistura a entrada e a saída.',
      'O nome dos arquivos leva BPM e tom na notação Camelot, que os programas de DJ usam para dizer quais músicas combinam.',
    ]),
  );
}
