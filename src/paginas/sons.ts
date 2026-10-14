// Página Sons: a biblioteca de sons da pessoa, guardada no aparelho.

import { type SomDaBiblioteca, apagarSons, blobDoSom, carregarDaBiblioteca, mudarTipo, ouvirSom, receberArquivos, receberZip, sonsDaBiblioteca } from '../biblioteca.ts';
import { zip } from '../engine/entrega.ts';
import { deMidi } from '../engine/midi-arquivo.ts';
import { TIPOS_DE_SOM, type TipoDeSom, notaDoNome } from '../engine/pacotes.ts';
import { engine, estado, mudou } from '../estado.ts';
import { LANES, type LaneId, PREFIXO_DE_FABRICA, redimensionar } from '../model/project.ts';
import { avisar, secSons } from '../moldura.ts';
import { audiosEmUso } from '../storage.ts';
import { baixar, botao, campo, explicacao, h, opcoes } from '../ui/controles.ts';
import { carregarDeFabrica, desenharBeat } from './beat.ts';

export type Destino = LaneId | '808';

/** Coloca um som (da biblioteca ou dos que vêm com o estúdio) na bateria ou no 808 da música aberta. */
export async function usarSom(som: { id: string; nome: string }, onde: Destino) {
  const buffer = som.id.startsWith(PREFIXO_DE_FABRICA) ? ((await carregarDeFabrica(som.id)) ? engine.buffers.get(som.id) : undefined) : await carregarDaBiblioteca(som.id);
  if (!buffer) return avisar('Não consegui ler esse som.');
  if (buffer.duration > 10) return avisar('Esse som é longo demais para a bateria ou o 808 (máximo de 10 segundos).');
  if (onde === '808') estado.projeto.sample808 = { audioId: som.id, nome: som.nome, nota: notaDoNome(som.nome) ?? 0 };
  else estado.projeto.samples[onde] = { audioId: som.id, nome: som.nome };
  mudou();
  desenharBeat();
  avisar(onde === '808' ? `"${som.nome}" agora é o 808 desta música. Confira a nota do sample na página Notas.` : `"${som.nome}" agora toca em ${LANES.find((l) => l.id === onde)?.nome} nesta música.`);
}

function entrada(rotulo: string, props: Partial<HTMLInputElement>, aoEscolher: (arquivos: File[]) => Promise<{ recebidos: number; recusados: number }>) {
  const input = h('input', { type: 'file', ...props });
  input.onchange = async () => {
    const arquivos = [...(input.files ?? [])];
    if (!arquivos.length) return;
    avisar('Guardando os sons no aparelho...');
    try {
      const r = await aoEscolher(arquivos);
      avisar(r.recebidos ? `${r.recebidos} som(ns) na biblioteca${r.recusados ? `; ${r.recusados} ficaram de fora (grandes demais ou ilegíveis)` : ''}.` : 'Não achei arquivos de áudio aí.');
    } catch {
      avisar('Não consegui abrir esse arquivo. Packs em .rar ou .7z precisam ser extraídos antes; aqui entram .zip, pastas e arquivos de áudio.');
    }
    desenharSons();
    desenharBeat();
  };
  return campo(rotulo, input);
}

function linhaDoSom(som: SomDaBiblioteca): HTMLElement {
  const tipo = h('select', { ariaLabel: `Tipo de ${som.nome}` });
  for (const [v, nome] of opcoes(TIPOS_DE_SOM, (k) => TIPOS_DE_SOM[k])) tipo.append(h('option', { value: v, selected: v === som.tipo }, nome));
  tipo.onchange = () => {
    mudarTipo(som.id, tipo.value as TipoDeSom);
    desenharSons();
    desenharBeat();
  };
  const destinos: [Destino, string][] = [...LANES.map((l) => [l.id, l.nome] as [Destino, string]), ['808', '808']];
  const onde = h('select', { ariaLabel: `Usar ${som.nome} em` }, h('option', { value: '' }, 'Usar em...'));
  for (const [v, nome] of destinos) onde.append(h('option', { value: v }, nome));
  onde.onchange = () => {
    if (onde.value) void usarSom(som, onde.value as Destino);
    onde.value = '';
  };
  return h('div', { className: 'linha' },
    botao('▶', () => void ouvirSom(som.id).then((ok) => ok || avisar('Não consegui tocar esse som.'))),
    h('span', {}, som.nome, h('small', { className: 'nota' }, ` · ${som.pacote}`)),
    tipo,
    onde,
    botao('Apagar', async () => {
      await apagarSons([som.id], await audiosEmUso(estado.projeto));
      desenharSons();
      desenharBeat();
    }, 'perigo'),
  );
}

async function salvarEmZip(sons: SomDaBiblioteca[]) {
  const arquivos: { nome: string; dados: Uint8Array }[] = [];
  for (const som of sons) {
    const blob = await blobDoSom(som.id);
    if (!blob) continue;
    const extensao = /wav|wave/.test(blob.type) ? 'wav' : /mpeg|mp3/.test(blob.type) ? 'mp3' : /ogg/.test(blob.type) ? 'ogg' : /flac/.test(blob.type) ? 'flac' : /mp4|aac|m4a/.test(blob.type) ? 'm4a' : 'wav';
    arquivos.push({ nome: `${TIPOS_DE_SOM[som.tipo]}/${som.nome}.${extensao}`, dados: new Uint8Array(await blob.arrayBuffer()) });
  }
  baixar(new Blob([zip(arquivos) as BlobPart], { type: 'application/zip' }), 'meus-sons.zip');
}

/** Traz as notas de um arquivo .mid (um pack de MIDI, um beat feito em outro programa) para o padrão aberto. */
function midi(): HTMLElement {
  const input = h('input', { type: 'file', accept: '.mid,.midi,audio/midi' });
  input.onchange = async () => {
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    try {
      const p = estado.projeto;
      const lido = deMidi(new Uint8Array(await arquivo.arrayBuffer()), p.tom, p.escala);
      if (!lido.notas) return avisar('Esse arquivo MIDI não tem notas.');
      const padrao = p.padroes[estado.padraoAtual];
      redimensionar(padrao, lido.compassos);
      // Só troca as partes que o arquivo traz: um MIDI só de bateria não apaga o 808 nem a melodia.
      const partes: string[] = [];
      if (Object.values(lido.bateria).some((l) => l.some(Boolean))) {
        for (const lane of LANES) padrao.bateria[lane.id] = lido.bateria[lane.id];
        partes.push('bateria');
      }
      if (lido.baixo.some((g) => g >= 0)) {
        padrao.baixo = lido.baixo;
        padrao.deslize = lido.baixo.map(() => false);
        partes.push('808');
      }
      if (lido.melodia.some((l) => l.some(Boolean))) {
        padrao.melodia = lido.melodia;
        partes.push('melodia');
      }
      mudou();
      desenharBeat();
      avisar(`"${padrao.nome}" recebeu ${partes.join(', ')} do arquivo (${lido.compassos} compasso(s)).`
        + (lido.foraDaEscala ? ` ${lido.foraDaEscala} nota(s) estavam fora da escala da música e foram para a nota mais próxima.` : '')
        + (lido.bpm && lido.bpm !== p.bpm ? ` O arquivo foi feito em ${lido.bpm} BPM; a música está em ${p.bpm}.` : ''));
    } catch {
      avisar('Não consegui ler esse arquivo MIDI.');
    }
    input.value = '';
  };
  return h('div', {},
    h('h3', {}, 'Notas em MIDI'),
    h('p', { className: 'nota' }, 'Um arquivo .mid guarda notas, não som: padrões de bateria, linhas de 808, acordes. As notas entram no padrão aberto, presas à escala da música; "Desfazer" volta atrás. Para levar suas notas a outro programa, use "Exportar as notas em MIDI" na página Projeto.'),
    campo('Arquivo .mid para o padrão aberto', input),
  );
}

export function desenharSons() {
  const sons = sonsDaBiblioteca();
  const pacotes = [...new Set(sons.map((s) => s.pacote))];
  const grupos = (Object.keys(TIPOS_DE_SOM) as TipoDeSom[]).map((tipo) => ({ tipo, lista: sons.filter((s) => s.tipo === tipo) })).filter((g) => g.lista.length);
  secSons.replaceChildren(
    h('h2', {}, 'Sons'),
    h('p', { className: 'nota' }, 'Sua biblioteca de sons fica guardada neste aparelho e vale para todas as músicas, mesmo sem internet. Traga os packs de bateria e 808 que você já usa: use só sons que você tem direito de usar.'),
    h('div', { className: 'linha' },
      entrada('Pack em .zip', { accept: '.zip,application/zip' }, ([a]) => receberZip(a)),
      'webkitdirectory' in HTMLInputElement.prototype ? entrada('Uma pasta inteira', { webkitdirectory: true, multiple: true } as Partial<HTMLInputElement>, receberArquivos) : '',
      entrada('Arquivos de áudio', { accept: 'audio/*', multiple: true }, receberArquivos),
    ),
    sons.length
      ? h('div', { className: 'linha' },
          h('span', { className: 'nota' }, `${sons.length} sons em ${pacotes.length} pack(s).`),
          botao('Salvar a biblioteca em .zip', () => void salvarEmZip(sons)),
        )
      : h('p', {}, 'A biblioteca está vazia. Os sons que vêm com o estúdio continuam na página Beat, em "Usar meus samples".'),
    ...grupos.map((g) => h('details', { className: 'explica', open: grupos.length <= 3 }, h('summary', {}, `${TIPOS_DE_SOM[g.tipo]} (${g.lista.length})`), h('div', { className: 'samples' }, ...g.lista.map(linhaDoSom)))),
    pacotes.length
      ? h('details', { className: 'explica' }, h('summary', {}, 'Apagar um pack inteiro'),
          ...pacotes.map((nome) => h('div', { className: 'linha' },
            h('span', {}, `${nome} (${sons.filter((s) => s.pacote === nome).length} sons)`),
            botao('Apagar pack', async () => {
              await apagarSons(sons.filter((s) => s.pacote === nome).map((s) => s.id), await audiosEmUso(estado.projeto));
              desenharSons();
              desenharBeat();
            }, 'perigo'),
          )))
      : '',
    midi(),
    explicacao([
      'O estúdio lê o nome de cada arquivo para adivinhar o que ele é (kick, snare, clap, hat, 808...). Se errar, troque o tipo na lista.',
      '"Usar em..." coloca o som na bateria ou no 808 da música aberta. O som do kit volta na página Beat, em "Usar meus samples".',
      'Plugins de computador (VST, AU) não rodam em navegador nem em celular: são programas instalados no sistema. Aqui os efeitos e instrumentos já vêm dentro do estúdio, e o que você acrescenta são sons, presets de voz (página Voz) e notas em MIDI (página Projeto).',
      'Packs em .rar ou .7z precisam ser extraídos antes. No celular, o aplicativo de arquivos faz isso; depois escolha os arquivos de áudio.',
      'Os sons ocupam espaço do aparelho. O espaço usado aparece na página Projeto.',
    ]),
  );
}
