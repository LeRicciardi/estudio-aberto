// Interface. Ela só lê e altera o projeto e chama o motor; nenhuma lógica de
// áudio mora aqui, para que outras interfaces possam ser criadas por cima.

import { Engine, exportarMix, paraMp3, paraWav, type Partes } from './engine/engine.ts';
import { PRESETS_MASTER } from './engine/mixer.ts';
import { Gravador, medirLatencia } from './engine/recorder.ts';
import { INSTRUMENTOS, KITS } from './engine/synths.ts';
import { duracaoDoPasso } from './engine/tempo.ts';
import { afinarEmSegundoPlano } from './engine/tuneClient.ts';
import { PRESETS_VOZ } from './engine/vocalChain.ts';
import { GENEROS, aplicarGenero, novoProjeto } from './model/generos.ts';
import {
  LANES, LINHAS, NOTAS, PREFIXO_DE_FABRICA, SAMPLES_DE_FABRICA, STEPS, compassosDoArranjo, duracaoDaMusica, duracaoDoTrecho, idsDeAudio, nomeDoGrau, novoTake, padraoNoCompasso,
  padraoVazio,
  type DivisaoDelay, type Escala, type InstrumentoId, type KitId, type LaneId, type PresetMaster, type PresetVoz, type Project, type Take,
} from './model/project.ts';
import {
  apagarAudio, carregarProjeto, desempacotarProjeto, empacotarProjeto, guardarAudio, lerAudio, listarAudios, salvarProjeto,
} from './storage.ts';

const engine = new Engine();
const gravador = new Gravador(engine.ctx);
let projeto: Project = carregarProjeto();
let gravando = false;
let cursor = 0;
/** Padrão aberto no editor. */
let padraoAtual = 0;
/** 'padrao' repete só o padrão aberto (criar o beat); 'musica' toca o arranjo com as vozes. */
let modo: 'padrao' | 'musica' = 'padrao';
/** Pincel da grade de bateria: o valor que um clique escreve no passo. */
let pincel = 1;

// ---------- utilidades de interface ----------

type Filho = Node | string;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...filhos);
  return el;
}

const id = () => Math.random().toString(36).slice(2, 10);
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const opcoes = <T extends string>(mapa: Record<T, unknown>, nome: (k: T) => string) => (Object.keys(mapa) as T[]).map((k) => [k, nome(k)] as [T, string]);

// ---------- histórico (desfazer / refazer) ----------
// Cada estado do projeto é guardado como texto JSON. Desfazer é voltar ao
// texto anterior. O áudio dos takes não entra aqui: fica guardado à parte.

let historico: string[] = [JSON.stringify(projeto)];
let indice = 0;
let pendente: number | undefined;

function registrar() {
  window.clearTimeout(pendente);
  pendente = undefined;
  const estado = JSON.stringify(projeto);
  if (estado === historico[indice]) return;
  historico = [...historico.slice(Math.max(0, indice - 100), indice + 1), estado];
  indice = historico.length - 1;
  salvarProjeto(projeto);
}

/**
 * Chamado depois de qualquer mudança no projeto. Cada ação vira um passo do
 * "Desfazer"; com `agrupar` (arrastar um controle), só o valor final conta.
 */
function mudou(agrupar = false) {
  engine.mixer.sincronizar(projeto);
  if (!agrupar) return registrar();
  window.clearTimeout(pendente);
  pendente = window.setTimeout(registrar, 300);
}

/** `passos` = -1 desfaz, +1 refaz. */
function navegarHistorico(passos: number) {
  registrar();
  const novoIndice = indice + passos;
  if (novoIndice < 0 || novoIndice >= historico.length) return;
  indice = novoIndice;
  projeto = JSON.parse(historico[indice]) as Project;
  salvarProjeto(projeto);
  padraoAtual = Math.min(padraoAtual, projeto.padroes.length - 1);
  engine.mixer.sincronizar(projeto);
  desenharTudo();
  void reafinarTodos();
  reiniciarSeTocando();
}

// ---------- controles reutilizáveis ----------

function campo(rotulo: string, controle: HTMLElement): HTMLLabelElement {
  return h('label', { className: 'campo' }, h('span', {}, rotulo), controle);
}

function deslizante(rotulo: string, min: number, max: number, passo: number, valor: number, aoMudar: (v: number) => void, aoSoltar?: () => void) {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(passo), value: String(valor) });
  input.oninput = () => {
    aoMudar(Number(input.value));
    mudou(true);
  };
  if (aoSoltar) input.onchange = aoSoltar;
  return campo(rotulo, input);
}

function numero(rotulo: string, min: number, max: number, valor: number, aoMudar: (v: number) => void, passo = 1) {
  const input = h('input', { type: 'number', min: String(min), max: String(max), step: String(passo), value: String(valor) });
  input.onchange = () => {
    const v = Math.min(max, Math.max(min, Number(input.value) || min));
    input.value = String(v);
    aoMudar(v);
    mudou();
  };
  return campo(rotulo, input);
}

function seletor<T extends string | number>(rotulo: string, lista: [T, string][], valor: T, aoMudar: (v: T) => void) {
  const select = h('select');
  for (const [v, nome] of lista) select.append(h('option', { value: String(v), selected: v === valor }, nome));
  select.onchange = () => {
    aoMudar(lista[select.selectedIndex][0]);
    mudou();
  };
  return campo(rotulo, select);
}

function botao(texto: string, aoClicar: () => void, classe = ''): HTMLButtonElement {
  return h('button', { className: classe, onclick: aoClicar }, texto);
}

function explicacao(linhas: string[]) {
  return h('details', { className: 'explica' }, h('summary', {}, 'O que isso faz?'), h('ul', {}, ...linhas.map((l) => h('li', {}, l))));
}

function baixar(blob: Blob, nome: string) {
  h('a', { href: URL.createObjectURL(blob), download: nome }).click();
}

// ---------- estrutura da página ----------

const app = document.querySelector<HTMLDivElement>('#app')!;
const aviso = h('p', { className: 'aviso', role: 'status' });
const botaoTocar = h('button', { className: 'principal' }, '▶ Tocar');
const botaoGravar = h('button', { className: 'gravar' }, '● Gravar voz');
const tempo = h('span', { className: 'tempo' }, '0:00');
const barraDeTempo = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', ariaLabel: 'Posição na música' });
const medidor = h('div', { className: 'medidor' }, h('div'));
const secTransporte = h('section', { className: 'transporte' });
const barraDeAcoes = h('div', { className: 'linha acoes' });
const secEstilo = h('section');
const secBeat = h('section');
const secVozes = h('section');
const secMaster = h('section');

app.append(
  h('header', {}, h('h1', {}, 'Estúdio Aberto'), h('p', {}, 'Crie o beat, grave a voz, mixe e exporte. Tudo no navegador.')),
  secTransporte, barraDeAcoes, aviso, secEstilo, secBeat, secVozes, secMaster,
);

const avisar = (texto: string) => (aviso.textContent = texto);

// ---------- transporte ----------

function desenharTransporte() {
  const modos = h('div', { className: 'abas' },
    botao('Só este padrão', () => trocarModo('padrao'), modo === 'padrao' ? 'ativo' : ''),
    botao('Música inteira', () => trocarModo('musica'), modo === 'musica' ? 'ativo' : ''),
  );
  secTransporte.replaceChildren(h('div', { className: 'linha' }, botaoTocar, botaoGravar, tempo, barraDeTempo));
  barraDeAcoes.replaceChildren(modos, botao('Desfazer', () => navegarHistorico(-1)), botao('Refazer', () => navegarHistorico(1)));
  barraDeTempo.hidden = modo === 'padrao';
}

function trocarModo(novo: 'padrao' | 'musica') {
  if (gravando) return;
  const tocava = engine.tocando;
  parar();
  modo = novo;
  cursor = 0;
  engine.desde = 0;
  desenharTransporte();
  if (tocava) void tocar();
}

async function tocar() {
  if (modo === 'padrao' && projeto.beat.fonte === 'padrao') {
    await engine.tocar(projeto, 0, padraoAtual);
  } else {
    if (cursor >= duracaoDaMusica(projeto, engine.buffers) - 0.05) cursor = 0;
    await engine.tocar(projeto, cursor);
  }
  botaoTocar.textContent = '■ Parar';
}

function emLoop() {
  return modo === 'padrao' && projeto.beat.fonte === 'padrao' && !gravando;
}

function reiniciarSeTocando() {
  if (!engine.tocando || gravando) return;
  if (emLoop()) void engine.tocar(projeto, engine.posicao() % (duracaoDoPasso(projeto.bpm) * STEPS), padraoAtual);
  else void engine.tocar(projeto, engine.posicao());
}

function parar() {
  cursor = emLoop() ? 0 : Math.min(engine.posicao(), duracaoDaMusica(projeto, engine.buffers));
  engine.parar();
  engine.desde = cursor;
  botaoTocar.textContent = '▶ Tocar';
}

botaoTocar.onclick = () => {
  if (gravando) return;
  if (engine.tocando) parar();
  else void tocar();
};

barraDeTempo.oninput = () => {
  cursor = Number(barraDeTempo.value);
  if (engine.tocando && !gravando) void engine.tocar(projeto, cursor);
  else engine.desde = cursor;
};

botaoGravar.onclick = async () => {
  if (gravando) return terminarGravacao();
  if (modo === 'padrao') trocarModo('musica');
  try {
    engine.parar();
    await engine.ctx.resume();
    await gravador.iniciar();
  } catch {
    avisar('Não consegui acessar o microfone. Libere a permissão no navegador e tente de novo.');
    return;
  }
  gravando = true;
  botaoGravar.textContent = '■ Parar gravação';
  botaoGravar.classList.add('ativo');
  avisar('Gravando. Use fone de ouvido, senão o beat vaza para o microfone.');
  await engine.tocar(projeto, cursor);
};

async function terminarGravacao() {
  const g = gravador.parar();
  const { t0, desde } = engine;
  gravando = false;
  botaoGravar.textContent = '● Gravar voz';
  botaoGravar.classList.remove('ativo');
  parar();
  cursor = desde;
  engine.desde = desde;
  if (g.amostras.length < g.taxa * 0.2) return avisar('Gravação curta demais, nada foi salvo.');

  // O som que você ouviu saiu atrasado da placa, e sua voz chegou atrasada
  // pelo microfone. Descontar esse atraso alinha o take com o beat.
  const latencia = (projeto.latenciaMs ?? latenciaEstimada()) / 1000;
  const take = novoTake(id(), `Take ${projeto.takes.length + 1}`, id(), desde + (g.inicio - t0) - latencia, projeto.voz);
  take.reverb = PRESETS_VOZ[take.preset].reverb;
  take.delay = PRESETS_VOZ[take.preset].delay;
  const buffer = engine.ctx.createBuffer(1, g.amostras.length, g.taxa);
  buffer.copyToChannel(g.amostras, 0);
  engine.buffers.set(take.audioId, buffer);
  take.naMontagem = projeto.montagem.ligada;
  projeto.takes.push(take);
  mudou();
  desenharVozes();
  avisar(`${take.nome} gravado. Se a voz estiver fora do tempo, ajuste "Início" no take.`);
  await guardarAudio(take.audioId, { tipo: 'pcm', taxa: g.taxa, amostras: g.amostras });
  // Pede ao navegador para não apagar o áudio guardado quando faltar espaço.
  void navigator.storage?.persist?.();
  void reafinar(take);
}

function latenciaEstimada(): number {
  const { baseLatency, outputLatency } = engine.ctx;
  return Math.round((baseLatency + (outputLatency || 0) + gravador.latenciaDeEntrada) * 1000);
}

// ---------- estilo ----------

function desenharEstilo() {
  const nome = h('input', { type: 'text', value: projeto.nome });
  nome.onchange = () => {
    projeto.nome = nome.value;
    mudou();
  };
  const genero = GENEROS[projeto.genero];
  secEstilo.replaceChildren(
    h('h2', {}, '1. Estilo'),
    h('div', { className: 'linha' },
      campo('Nome da música', nome),
      seletor('Gênero', opcoes(GENEROS, (k) => GENEROS[k].nome), projeto.genero, (v) => {
        if (!confirm(`Trocar para ${GENEROS[v].nome}? O beat atual é substituído pelo modelo do gênero (dá para desfazer). As vozes ficam.`)) return desenharEstilo();
        aplicarGenero(projeto, v);
        padraoAtual = 0;
        desenharTudo();
        reiniciarSeTocando();
      }),
    ),
    h('p', { className: 'nota' }, genero ? genero.descricao : ''),
    genero?.aproximado
      ? h('p', { className: 'nota alerta' }, 'Este modelo é uma aproximação: não achei uma transcrição confiável do ritmo. Ajuste a grade de ouvido, com uma faixa de referência.')
      : '',
    h('div', { className: 'linha' },
      numero('BPM', 60, 200, projeto.bpm, (v) => { projeto.bpm = v; reiniciarSeTocando(); }),
      seletor('Tom', NOTAS.map((n, i) => [i, n] as [number, string]), projeto.tom, (v) => { projeto.tom = v; desenharBeat(); void reafinarTodos(); }),
      seletor<Escala>('Escala', [['menor', 'Menor'], ['maior', 'Maior']], projeto.escala, (v) => { projeto.escala = v; desenharBeat(); void reafinarTodos(); }),
      deslizante('Swing (balanço)', 0, 0.5, 0.01, projeto.swing, (v) => { projeto.swing = v; }, reiniciarSeTocando),
    ),
    explicacao([
      'O gênero carrega um ponto de partida: andamento, balanço, kit de bateria, timbre de voz e um padrão típico. Tudo pode ser alterado depois.',
      'Tom e escala definem quais notas "combinam". O 808, a melodia e o tune seguem essa escolha, então é difícil soar desafinado.',
      'Swing atrasa os passos pares e dá balanço ao ritmo. Boombap usa bastante; trap, quase nada.',
    ]),
  );
}

// ---------- beat ----------

/** Células das grades agrupadas por passo, para acender a coluna que está tocando. */
let colunas: HTMLElement[][] = [];

const ROTULO_DO_PASSO = ['', '', '2', '3', '4', ''];

function gradeDeBateria(): HTMLElement {
  const padrao = projeto.padroes[padraoAtual];
  const grade = h('div', { className: 'grade' });
  for (const lane of LANES) {
    grade.append(h('span', { className: 'nome-linha' }, lane.nome));
    for (let i = 0; i < STEPS; i++) {
      const b = h('button', { ariaLabel: `${lane.nome}, passo ${i + 1}` });
      const pintar = () => {
        const v = padrao.bateria[lane.id][i];
        b.className = 'passo' + (v ? ' ligado' : '') + (v === 5 ? ' fraco' : '') + (i % 4 === 0 ? ' tempo-forte' : '');
        b.textContent = ROTULO_DO_PASSO[v];
      };
      b.onclick = () => {
        padrao.bateria[lane.id][i] = padrao.bateria[lane.id][i] === pincel ? 0 : pincel;
        pintar();
        mudou();
      };
      pintar();
      colunas[i].push(b);
      grade.append(b);
    }
  }
  return h('div', { className: 'rolagem' }, grade);
}

/** Grade de notas (808 ou melodia): linhas são notas da escala, agudas em cima. */
function gradeDeNotas(ligado: (linha: number, passo: number) => boolean, alternar: (linha: number, passo: number) => void): HTMLElement {
  const grade = h('div', { className: 'grade notas' });
  const botoes: HTMLButtonElement[][] = [];
  const pintar = () => botoes.forEach((linha, l) => linha.forEach((b, s) => b.classList.toggle('ligado', ligado(l, s))));
  for (let l = LINHAS - 1; l >= 0; l--) {
    const nota = nomeDoGrau(l, projeto.tom, projeto.escala);
    grade.append(h('span', { className: 'nome-linha' + (l % 7 === 0 ? ' tonica' : '') }, nota));
    botoes[l] = [];
    for (let s = 0; s < STEPS; s++) {
      const b = h('button', { className: 'passo' + (s % 4 === 0 ? ' tempo-forte' : ''), ariaLabel: `${nota}, passo ${s + 1}` });
      b.onclick = () => {
        alternar(l, s);
        pintar();
        mudou();
      };
      botoes[l][s] = b;
      colunas[s].push(b);
      grade.append(b);
    }
  }
  pintar();
  return grade;
}

function desenharBeat() {
  const beat = projeto.beat;
  colunas = Array.from({ length: STEPS }, () => []);
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
  };
  const espaco = h('label', { className: 'caixa' }, caixaEspaco, 'Abrir espaço no beat para a voz');

  if (beat.fonte === 'arquivo') {
    const arquivo = h('input', { type: 'file', accept: 'audio/*' });
    arquivo.onchange = () => arquivo.files?.[0] && importarBeat(arquivo.files[0]);
    secBeat.replaceChildren(
      h('h2', {}, '2. Beat'), abas,
      campo('Arquivo de áudio (MP3, WAV...)', arquivo),
      h('p', { className: 'nota' }, beat.nomeArquivo ? `Beat atual: ${beat.nomeArquivo}` : 'Nenhum beat importado ainda.'),
      h('p', { className: 'nota' }, 'Informe em "Estilo" o BPM e o tom do beat: o delay e o tune usam esses valores.'),
      volume,
      espaco,
      explicacao([
        'Beat pronto já vem cheio e comprimido, e a voz tende a ficar "por cima" em vez de dentro dele.',
        'Abrir espaço faz um corte suave no beat em 3 kHz, a região onde mora a clareza da letra. Baixar um pouco o volume do beat também ajuda.',
      ]),
    );
    return;
  }

  const padrao = projeto.padroes[padraoAtual];
  const emUso = (i: number) => projeto.arranjo.some((b) => b.padrao === i);
  const abasDePadrao = h('div', { className: 'abas' },
    ...projeto.padroes.map((p, i) => botao(p.nome, () => abrirPadrao(i), i === padraoAtual ? 'ativo' : '')),
    botao('+ Novo', () => {
      projeto.padroes.push(padraoVazio(`Padrão ${projeto.padroes.length + 1}`));
      abrirPadrao(projeto.padroes.length - 1);
    }),
    botao('Duplicar', () => {
      projeto.padroes.push({ ...structuredClone(padrao), nome: `${padrao.nome} 2` });
      abrirPadrao(projeto.padroes.length - 1);
    }),
  );
  const nomeDoPadrao = h('input', { type: 'text', value: padrao.nome });
  nomeDoPadrao.onchange = () => {
    padrao.nome = nomeDoPadrao.value || 'Padrão';
    mudou();
    desenharBeat();
  };
  const apagar = botao('Apagar padrão', () => {
    projeto.padroes.splice(padraoAtual, 1);
    for (const b of projeto.arranjo) if (b.padrao > padraoAtual) b.padrao--;
    abrirPadrao(Math.max(0, padraoAtual - 1));
  }, 'perigo');
  apagar.disabled = projeto.padroes.length < 2 || emUso(padraoAtual);
  apagar.title = emUso(padraoAtual) ? 'Tire o padrão do arranjo antes de apagar' : '';

  const pinceis = h('div', { className: 'abas' },
    ...([[1, 'Normal'], [5, 'Fraco'], [2, 'Rolo 2x'], [3, 'Rolo 3x'], [4, 'Rolo 4x']] as const).map(([v, nome]) =>
      botao(nome, () => {
        pincel = v;
        desenharBeat();
      }, pincel === v ? 'ativo' : ''),
    ),
  );

  const linhaDeDeslize = h('div', { className: 'grade' }, h('span', { className: 'nome-linha' }, 'Deslizar'));
  for (let s = 0; s < STEPS; s++) {
    const b = h('button', { className: 'passo deslize' + (padrao.deslize[s] ? ' ligado' : ''), ariaLabel: `Deslizar no passo ${s + 1}` });
    b.onclick = () => {
      padrao.deslize[s] = !padrao.deslize[s];
      b.classList.toggle('ligado');
      mudou();
    };
    linhaDeDeslize.append(b);
  }

  secBeat.replaceChildren(
    h('h2', {}, '2. Beat'), abas,
    h('h3', {}, 'Padrões'),
    abasDePadrao,
    h('div', { className: 'linha' }, campo('Nome do padrão', nomeDoPadrao), apagar),

    h('h3', {}, 'Bateria'),
    h('div', { className: 'linha' },
      seletor<KitId>('Kit', opcoes(KITS, (k) => KITS[k].nome), projeto.kit, (v) => { projeto.kit = v; }),
      deslizante('Volume', 0, 1.2, 0.01, projeto.volumes.bateria, (v) => { projeto.volumes.bateria = v; }),
    ),
    campo('Pincel: o que um toque escreve', pinceis),
    gradeDeBateria(),
    samples(),
    explicacao([
      'Cada linha é um som e cada quadrado é um instante do compasso (16 por compasso). Os quadrados mais claros marcam as 4 batidas.',
      'Fraco: toca baixinho. Notas fracas entre as fortes dão balanço.',
      'Rolo: repete o som 2, 3 ou 4 vezes dentro de um quadrado. É o chimbal acelerado do trap.',
    ]),

    h('h3', {}, '808'),
    deslizante('Volume', 0, 1.2, 0.01, projeto.volumes.baixo, (v) => { projeto.volumes.baixo = v; }),
    h('div', { className: 'rolagem' },
      gradeDeNotas(
        (l, s) => padrao.baixo[s] === l,
        (l, s) => { padrao.baixo[s] = padrao.baixo[s] === l ? -1 : l; },
      ),
      linhaDeDeslize,
    ),
    explicacao([
      'O 808 é o grave que dá peso. Ele toca uma nota por vez e soa até a próxima nota.',
      'As linhas são as notas da escala da música; a de baixo é a nota principal (tônica). Colocar o 808 junto com o bumbo é o ponto de partida mais seguro.',
      'Deslizar: a nota começa na altura da anterior e escorrega até a nova. É a marca do drill e do trap.',
    ]),

    h('h3', {}, 'Melodia'),
    h('div', { className: 'linha' },
      seletor<InstrumentoId>('Instrumento', opcoes(INSTRUMENTOS, (k) => INSTRUMENTOS[k]), projeto.instrumento, (v) => { projeto.instrumento = v; }),
      deslizante('Volume', 0, 1.2, 0.01, projeto.volumes.melodia, (v) => { projeto.volumes.melodia = v; }),
    ),
    h('div', { className: 'rolagem' },
      gradeDeNotas(
        (l, s) => padrao.melodia[l][s],
        (l, s) => { padrao.melodia[l][s] = !padrao.melodia[l][s]; },
      ),
    ),
    explicacao([
      'Só aparecem notas da escala, então qualquer combinação soa bem junta.',
      'Notas na mesma coluna tocam ao mesmo tempo e formam um acorde. Pulando uma linha entre elas (1ª, 3ª, 5ª) sai o acorde básico.',
    ]),

    h('h3', {}, 'Arranjo'),
    arranjo(),
    explicacao([
      'O arranjo é a ordem em que os padrões tocam para formar a música: intro, verso, refrão, pausa.',
      'Crie variações com "Duplicar" e mude pouca coisa: tirar o bumbo e o 808 por 2 compassos e devolver depois já cria impacto.',
    ]),
    volume,
    espaco,
  );
}

/** Lista para trocar cada som sintetizado por um sample (arquivo de áudio) do usuário. */
function samples(): HTMLElement {
  const lista = h('div', { className: 'samples' });
  for (const lane of LANES) {
    const atual = projeto.samples[lane.id];
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
      projeto.samples[lane.id] = { audioId, nome: escolhido.nome };
      mudou();
      desenharBeat();
    };
    lista.append(h('div', { className: 'linha' },
      h('span', { className: 'nome-linha' }, lane.nome),
      atual ? h('span', { className: 'nota' }, atual.nome) : arquivo,
      !atual && deFabrica ? prontos : '',
      atual
        ? botao('Voltar ao som do kit', () => {
            delete projeto.samples[lane.id];
            mudou();
            desenharBeat();
          })
        : '',
    ));
  }
  return h('details', { className: 'explica' },
    h('summary', {}, `Usar meus samples${Object.keys(projeto.samples).length ? ` (${Object.keys(projeto.samples).length} em uso)` : ''}`),
    h('p', {}, 'Sample é um som gravado: um bumbo, uma caixa, uma palma de um pack. Escolha um arquivo curto (WAV ou MP3) para tocar no lugar do som do kit. Use só samples que você tem direito de usar. Os samples prontos do estúdio são de domínio público.'),
    lista,
  );
}

/** Baixa e decodifica um sample que vem com o estúdio. */
async function carregarDeFabrica(audioId: string): Promise<boolean> {
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

async function carregarSample(lane: LaneId, arquivo: File) {
  try {
    const buffer = await engine.ctx.decodeAudioData(await arquivo.arrayBuffer());
    if (buffer.duration > 10) return avisar('Esse arquivo é longo demais para um sample de bateria (máximo de 10 segundos).');
    const audioId = id();
    engine.buffers.set(audioId, buffer);
    projeto.samples[lane] = { audioId, nome: arquivo.name };
    mudou();
    desenharBeat();
    await guardarAudio(audioId, { tipo: 'arquivo', blob: arquivo });
  } catch {
    avisar('Não consegui ler esse arquivo de áudio.');
  }
}

function abrirPadrao(i: number) {
  padraoAtual = i;
  mudou();
  desenharBeat();
  reiniciarSeTocando();
}

function arranjo(): HTMLElement {
  const lista = h('div', { className: 'arranjo' });
  projeto.arranjo.forEach((bloco, i) => {
    lista.append(h('div', { className: 'linha bloco' },
      h('span', { className: 'tempo' }, `${i + 1}.`),
      seletor('Padrão', projeto.padroes.map((p, k) => [k, p.nome] as [number, string]), bloco.padrao, (v) => { bloco.padrao = v; desenharBeat(); }),
      numero('Compassos', 1, 64, bloco.vezes, (v) => { bloco.vezes = v; desenharBeat(); }),
      botao('Remover', () => {
        projeto.arranjo.splice(i, 1);
        mudou();
        desenharBeat();
      }, 'perigo'),
    ));
  });
  const compassos = compassosDoArranjo(projeto);
  lista.append(
    botao('+ Adicionar trecho', () => {
      projeto.arranjo.push({ padrao: padraoAtual, vezes: 4 });
      mudou();
      desenharBeat();
    }),
    h('p', { className: 'nota' }, `Total: ${compassos} compassos, ${relogio((compassos * 4 * 60) / projeto.bpm)} de música.`),
  );
  return lista;
}

async function importarBeat(arquivo: File) {
  try {
    avisar('Carregando beat...');
    const buffer = await engine.ctx.decodeAudioData(await arquivo.arrayBuffer());
    const audioId = id();
    engine.buffers.set(audioId, buffer);
    projeto.beat.audioId = audioId;
    projeto.beat.nomeArquivo = arquivo.name;
    mudou();
    desenharBeat();
    avisar(`Beat carregado: ${relogio(buffer.duration)} de duração.`);
    await guardarAudio(audioId, { tipo: 'arquivo', blob: arquivo });
  } catch {
    avisar('Não consegui ler esse arquivo de áudio.');
  }
}

// ---------- vozes ----------

/** Com que ajustes cada take foi afinado por último, para não refazer à toa. */
const afinadoCom = new Map<string, string>();

async function reafinar(take: Take) {
  const chave = take.audioId + ':tune';
  const original = engine.buffers.get(take.audioId);
  if (!take.tune.ligado || !original) return;
  const ajustes = `${projeto.tom}|${projeto.escala}|${take.tune.velocidade}`;
  if (afinadoCom.get(take.audioId) === ajustes && engine.buffers.has(chave)) return;
  avisar(`Afinando ${take.nome}...`);
  const afinado = await afinarEmSegundoPlano(original.getChannelData(0), original.sampleRate, { tom: projeto.tom, escala: projeto.escala, velocidade: take.tune.velocidade });
  const buffer = engine.ctx.createBuffer(1, afinado.length, original.sampleRate);
  buffer.copyToChannel(afinado, 0);
  engine.buffers.set(chave, buffer);
  afinadoCom.set(take.audioId, ajustes);
  avisar(`${take.nome} afinado em ${NOTAS[projeto.tom]} ${projeto.escala}.`);
  reiniciarSeTocando();
}

async function reafinarTodos() {
  for (const take of projeto.takes) await reafinar(take);
}

function desenharTake(take: Take): HTMLElement {
  const nome = h('input', { type: 'text', value: take.nome, ariaLabel: 'Nome do take' });
  nome.onchange = () => {
    take.nome = nome.value;
    mudou();
  };
  const mudo = botao(take.mudo ? 'Mudo' : 'Ouvindo', () => {
    take.mudo = !take.mudo;
    mudou();
    desenharVozes();
  }, take.mudo ? 'ativo' : '');
  const apagar = botao('Apagar', () => {
    projeto.takes = projeto.takes.filter((t) => t.id !== take.id);
    mudou();
    desenharVozes();
    reiniciarSeTocando();
    avisar(`${take.nome} apagado. Use "Desfazer" se foi engano.`);
  }, 'perigo');
  const tune = h('input', { type: 'checkbox', checked: take.tune.ligado });
  tune.onchange = () => {
    take.tune.ligado = tune.checked;
    mudou();
    void reafinar(take).then(reiniciarSeTocando);
  };

  return h('article', { className: 'take' },
    h('div', { className: 'linha' }, nome, mudo, apagar),
    h('div', { className: 'linha' },
      deslizante('Volume', 0, 1.5, 0.01, take.volume, (v) => { take.volume = v; }),
      deslizante('Lado (esq. / dir.)', -1, 1, 0.05, take.pan, (v) => { take.pan = v; }),
      numero('Início (s)', -5, 3600, Number(take.inicio.toFixed(3)), (v) => { take.inicio = v; reiniciarSeTocando(); }, 0.005),
    ),
    seletor<PresetVoz>('Timbre', opcoes(PRESETS_VOZ, (k) => PRESETS_VOZ[k].nome), take.preset, (v) => {
      take.preset = v;
      take.reverb = PRESETS_VOZ[v].reverb;
      take.delay = PRESETS_VOZ[v].delay;
      desenharVozes();
    }),
    explicacao(PRESETS_VOZ[take.preset].explicacao),
    h('div', { className: 'linha' },
      h('label', { className: 'caixa' }, tune, 'Tune'),
      deslizante('Tune: robótico ↔ natural', 0, 1, 0.05, take.tune.velocidade, (v) => { take.tune.velocidade = v; }, () => void reafinar(take)),
    ),
    h('div', { className: 'linha' },
      deslizante('Reverb', 0, 0.8, 0.01, take.reverb, (v) => { take.reverb = v; }),
      deslizante('Delay', 0, 0.8, 0.01, take.delay, (v) => { take.delay = v; }),
      seletor<DivisaoDelay>('Tempo do delay', [[4, '1 batida'], [8, '1/2 batida'], [16, '1/4 de batida']], take.divisaoDelay, (v) => { take.divisaoDelay = v; }),
    ),
    explicacao([
      'Tune: puxa cada nota cantada para a nota mais próxima da escala da música. Robótico pula direto; natural desliza.',
      'Reverb: simula o som de uma sala. Dá profundidade, mas em excesso embola a letra.',
      'Delay: repete a voz em eco, no tempo do beat.',
      'Dica de dobra: grave o mesmo trecho duas vezes e jogue um take para cada lado. A voz fica larga.',
    ]),
  );
}

/** Um take "cobre" um trecho se tem pelo menos um pouco de áudio dentro dele. */
function cobre(take: Take, trecho: number): boolean {
  const buf = engine.buffers.get(take.audioId);
  if (!buf) return false;
  const dur = duracaoDoTrecho(projeto);
  return Math.min(take.inicio + buf.duration, (trecho + 1) * dur) - Math.max(take.inicio, trecho * dur) > 0.05;
}

const trechosDaMusica = () => Math.ceil(duracaoDaMusica(projeto, engine.buffers) / duracaoDoTrecho(projeto));

/** Preenche os trechos sem escolha válida com o primeiro take que tem áudio ali. */
function preencherMontagem() {
  const m = projeto.montagem;
  const participantes = projeto.takes.filter((t) => t.naMontagem);
  m.escolha = Array.from({ length: trechosDaMusica() }, (_, i) => {
    const atual = participantes.find((t) => t.id === m.escolha[i]);
    if (atual && cobre(atual, i)) return atual.id;
    return m.escolha[i] === null ? null : participantes.find((t) => cobre(t, i))?.id ?? null;
  });
}

function montagem(): HTMLElement {
  const m = projeto.montagem;
  const ligada = h('input', { type: 'checkbox', checked: m.ligada });
  ligada.onchange = () => {
    m.ligada = ligada.checked;
    if (m.ligada) {
      if (!projeto.takes.some((t) => t.naMontagem)) for (const t of projeto.takes) t.naMontagem = true;
      m.escolha = [];
      preencherMontagem();
    }
    mudou();
    desenharVozes();
    reiniciarSeTocando();
  };
  const ajuda = explicacao([
    'Grave o mesmo trecho várias vezes e fique com o melhor pedaço de cada gravação. Profissionais chamam isso de "comping".',
    'A música é dividida em trechos. Em cada coluna, toque no take que deve soar ali; os outros ficam mudos naquele trecho.',
    'Takes desmarcados à esquerda ficam fora da montagem e tocam sempre inteiros. Use isso para dobras e adlibs.',
    'Toque no número de um trecho para ouvir a partir dele.',
  ]);
  const cabecalho = h('label', { className: 'caixa' }, ligada, 'Montar a voz por trechos');
  if (!m.ligada) return h('div', {}, cabecalho, ajuda);

  preencherMontagem();
  const n = m.escolha.length;
  const grade = h('div', { className: 'grade montagem' });
  grade.style.gridTemplateColumns = `130px repeat(${n}, 34px)`;
  grade.style.minWidth = `${130 + n * 38}px`;
  grade.append(h('span', { className: 'nome-linha' }, 'Compasso'));
  for (let i = 0; i < n; i++) {
    grade.append(botao(String(i * m.compassos + 1), () => {
      cursor = i * duracaoDoTrecho(projeto);
      if (modo === 'padrao') trocarModo('musica');
      if (engine.tocando && !gravando) void engine.tocar(projeto, cursor);
      else engine.desde = cursor;
    }, 'passo cabeca'));
  }
  for (const take of projeto.takes) {
    const participa = h('input', { type: 'checkbox', checked: take.naMontagem, ariaLabel: `${take.nome} participa da montagem` });
    participa.onchange = () => {
      take.naMontagem = participa.checked;
      preencherMontagem();
      mudou();
      desenharVozes();
      reiniciarSeTocando();
    };
    grade.append(h('label', { className: 'caixa nome-linha' }, participa, take.nome));
    for (let i = 0; i < n; i++) {
      const b = h('button', { className: 'passo' + (m.escolha[i] === take.id ? ' ligado' : ''), ariaLabel: `${take.nome} no trecho ${i + 1}` });
      b.disabled = !take.naMontagem || !cobre(take, i);
      b.onclick = () => {
        m.escolha[i] = m.escolha[i] === take.id ? null : take.id;
        mudou();
        desenharVozes();
        reiniciarSeTocando();
      };
      grade.append(b);
    }
  }
  return h('div', {},
    h('div', { className: 'linha' },
      cabecalho,
      seletor('Tamanho do trecho', [[1, '1 compasso'], [2, '2 compassos'], [4, '4 compassos']] as [number, string][], m.compassos, (v) => {
        m.compassos = v;
        m.escolha = [];
        preencherMontagem();
        desenharVozes();
        reiniciarSeTocando();
      }),
    ),
    h('div', { className: 'rolagem' }, grade),
    ajuda,
  );
}

function desenharVozes() {
  const latencia = h('input', { type: 'number', min: '0', max: '500', placeholder: 'automático', value: projeto.latenciaMs === null ? '' : String(projeto.latenciaMs) });
  latencia.onchange = () => {
    projeto.latenciaMs = latencia.value === '' ? null : Math.max(0, Number(latencia.value));
    mudou();
  };
  secVozes.replaceChildren(
    h('h2', {}, '3. Vozes'),
    projeto.takes.length === 0
      ? h('p', { className: 'nota' }, 'Nenhum take ainda. Coloque o fone, toque em "Gravar voz" e cante em cima do beat. A gravação começa de onde a música estiver.')
      : '',
    ...projeto.takes.map(desenharTake),
    ...(projeto.takes.length > 1 ? [h('h3', {}, 'Montagem: o melhor de cada take'), montagem()] : []),
    h('h3', {}, 'Voz fora do tempo?'),
    h('p', { className: 'nota' }, 'Todo aparelho atrasa o som um pouco. Fone Bluetooth atrasa muito e de forma irregular: prefira fone com fio para gravar.'),
    h('div', { className: 'linha' },
      campo('Compensação de atraso (ms)', latencia),
      botao('Medir atraso deste aparelho', async () => {
        if (engine.tocando || gravando) return;
        avisar('Medindo: tire o fone, aumente o volume e fique em silêncio por 4 segundos.');
        try {
          const atraso = await medirLatencia(engine.ctx, gravador);
          if (atraso === null) return avisar('O microfone não ouviu os estalos. Tire o fone, aumente o volume e tente de novo.');
          projeto.latenciaMs = Math.round(atraso * 1000);
          mudou();
          desenharVozes();
          avisar(`Atraso medido: ${projeto.latenciaMs} ms. As próximas gravações já saem alinhadas.`);
        } catch {
          avisar('Não consegui acessar o microfone.');
        }
      }),
    ),
  );
}

// ---------- master, exportação e arquivo ----------

function desenharMaster() {
  const resultado = h('p', { className: 'nota' });
  const exportar = async (partes: Partes, sufixo: string, mp3 = false) => {
    resultado.textContent = 'Renderizando...';
    try {
      const r = await exportarMix(projeto, engine.buffers, partes);
      const nome = `${projeto.nome || 'musica'}${sufixo}`;
      if (mp3) baixar(await paraMp3(r.audio), `${nome}.mp3`);
      else baixar(paraWav(r.audio), `${nome}.wav`);
      const lufs = Number.isFinite(r.lufs) ? `${r.lufs.toFixed(1)} LUFS` : 'silêncio';
      const comparacao = !Number.isFinite(r.lufs) || partes !== 'tudo' ? ''
        : r.lufs > -13 ? ' Mais alto que o padrão do Spotify (-14): a plataforma vai abaixar o volume.'
        : r.lufs < -16 ? ' Mais baixo que o padrão do Spotify (-14): experimente o acabamento "Alto".'
        : ' Dentro do padrão do Spotify (-14).';
      resultado.textContent = `Pronto. Volume: ${lufs}, pico ${r.picoDb.toFixed(1)} dBFS.${comparacao}`;
    } catch {
      resultado.textContent = 'A exportação falhou.';
    }
  };
  const abrir = h('input', { type: 'file', accept: '.json,application/json' });
  abrir.onchange = async () => {
    const arquivo = abrir.files?.[0];
    if (!arquivo) return;
    try {
      parar();
      projeto = await desempacotarProjeto(await arquivo.text());
      padraoAtual = 0;
      mudou();
      desenharTudo();
      await restaurarAudio();
      avisar(`Projeto "${projeto.nome}" aberto.`);
    } catch {
      avisar('Esse arquivo não é um projeto do Estúdio Aberto.');
    }
  };

  secMaster.replaceChildren(
    h('h2', {}, '4. Master e exportação'),
    seletor<PresetMaster>('Acabamento', opcoes(PRESETS_MASTER, (k) => PRESETS_MASTER[k].nome), projeto.master, (v) => {
      projeto.master = v;
      desenharMaster();
    }),
    explicacao([
      ...PRESETS_MASTER[projeto.master].explicacao,
      'Na exportação, um limitador de pico garante que nada passe de -1 dBFS, a folga pedida pelas plataformas de streaming.',
      'WAV (16 bits, 44,1 kHz) é o formato aceito pelas distribuidoras. MP3 é para mandar no WhatsApp e ouvir no celular.',
      'LUFS mede o quão alto a música soa. O Spotify ajusta tudo para -14 LUFS: passar muito disso não deixa a música mais alta lá, só mais achatada.',
    ]),
    campo('Nível de saída', medidor),
    h('div', { className: 'linha' },
      botao('Exportar música (WAV)', () => void exportar('tudo', ''), 'principal'),
      botao('MP3 para compartilhar', () => void exportar('tudo', '', true)),
      botao('Só as vozes', () => void exportar('voz', ' - vozes')),
      botao('Só o beat', () => void exportar('beat', ' - beat')),
    ),
    resultado,
    h('h3', {}, 'Projeto'),
    h('p', { className: 'nota' }, 'O projeto é salvo sozinho neste navegador. Salve em arquivo para guardar cópia, trocar de aparelho ou mandar para alguém gravar junto.'),
    h('div', { className: 'linha' },
      botao('Salvar projeto em arquivo', async () => {
        registrar();
        baixar(await empacotarProjeto(projeto), `${projeto.nome || 'projeto'}.estudio.json`);
      }),
      campo('Abrir projeto de um arquivo', abrir),
    ),
    h('h3', {}, 'Aplicativo'),
    instalacao(),
    botao('Começar música nova', () => {
      if (!confirm('Começar uma música nova? Dá para voltar com "Desfazer" enquanto a página estiver aberta.')) return;
      parar();
      projeto = novoProjeto(projeto.genero);
      padraoAtual = 0;
      cursor = 0;
      engine.desde = 0;
      mudou();
      desenharTudo();
    }, 'perigo'),
  );
}

// ---------- instalação como aplicativo ----------

interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>;
}
let conviteDeInstalacao: EventoDeInstalacao | undefined;

// O Chrome (Android e computador) avisa quando o site pode ser instalado.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  conviteDeInstalacao = e as EventoDeInstalacao;
  desenharMaster();
});
window.addEventListener('appinstalled', () => {
  conviteDeInstalacao = undefined;
  desenharMaster();
});

function instalacao(): HTMLElement {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return h('p', { className: 'nota' }, 'Você está usando o aplicativo instalado. Ele abre mesmo sem internet.');
  }
  if (conviteDeInstalacao) {
    return h('div', {},
      h('p', { className: 'nota' }, 'Instale para abrir pela tela inicial, usar sem internet e proteger seus projetos de serem apagados pelo navegador.'),
      botao('Instalar aplicativo', () => void conviteDeInstalacao?.prompt()),
    );
  }
  const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return h('p', { className: 'nota' }, iphone
    ? 'Para instalar no iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".'
    : 'Para instalar: abra o menu do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial". A opção só aparece com o site publicado em endereço https.');
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('./sw.js');
}

// ---------- laço de tela ----------

function quadro() {
  const duracao = duracaoDaMusica(projeto, engine.buffers);
  const pos = engine.posicao();
  const loop = emLoop();
  if (engine.tocando && !gravando && !loop && pos >= duracao) {
    parar();
    cursor = 0;
    engine.desde = 0;
  }
  barraDeTempo.max = String(duracao);
  if (document.activeElement !== barraDeTempo || engine.tocando) barraDeTempo.value = String(Math.min(pos, duracao));
  tempo.textContent = loop ? `Padrão: ${projeto.padroes[padraoAtual]?.nome ?? ''}` : `${relogio(pos)} / ${relogio(duracao)}`;

  // Acende a coluna que está tocando, se o padrão aberto for o que está soando.
  let passoAtual = -1;
  if (engine.tocando && projeto.beat.fonte === 'padrao') {
    const passo = Math.floor(pos / duracaoDoPasso(projeto.bpm));
    const soando = loop ? projeto.padroes[padraoAtual] : padraoNoCompasso(projeto, Math.floor(passo / STEPS));
    if (soando === projeto.padroes[padraoAtual]) passoAtual = passo % STEPS;
  }
  colunas.forEach((celulas, i) => celulas.forEach((c) => c.classList.toggle('atual', i === passoAtual)));

  const db = engine.tocando ? engine.picoDb() : -60;
  const barra = medidor.firstElementChild as HTMLElement;
  barra.style.width = `${Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
  barra.classList.toggle('estourando', db > -1);
  requestAnimationFrame(quadro);
}

function desenharTudo() {
  desenharTransporte();
  desenharEstilo();
  desenharBeat();
  desenharVozes();
  desenharMaster();
}

async function restaurarAudio() {
  for (const audioId of idsDeAudio(projeto)) {
    if (engine.buffers.has(audioId)) continue;
    if (audioId.startsWith(PREFIXO_DE_FABRICA)) {
      await carregarDeFabrica(audioId);
      continue;
    }
    const salvo = await lerAudio(audioId);
    if (salvo?.tipo === 'arquivo') {
      engine.buffers.set(audioId, await engine.ctx.decodeAudioData(await salvo.blob.arrayBuffer()));
    } else if (salvo?.tipo === 'pcm') {
      const buffer = engine.ctx.createBuffer(1, salvo.amostras.length, salvo.taxa);
      buffer.copyToChannel(salvo.amostras, 0);
      engine.buffers.set(audioId, buffer);
    }
  }
  if (projeto.montagem.ligada) desenharVozes();
  await reafinarTodos();
}

/**
 * Apagar um take não apaga o áudio na hora (para o "Desfazer" funcionar).
 * A limpeza acontece aqui, ao abrir a página: sai o áudio que nenhum take usa.
 */
async function limparAudioSemUso() {
  const usados = new Set(idsDeAudio(projeto));
  for (const chave of await listarAudios()) if (!usados.has(String(chave))) await apagarAudio(String(chave));
}

desenharTudo();
engine.mixer.sincronizar(projeto);
requestAnimationFrame(quadro);
void restaurarAudio().then(limparAudioSemUso);
