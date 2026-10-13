// Interface. Ela só lê e altera o projeto e chama o motor; nenhuma lógica de
// áudio mora aqui, para que outras interfaces possam ser criadas por cima.

import { Engine, exportarMix, paraMp3, paraWav, type Partes } from './engine/engine.ts';
import { PRESETS_MASTER } from './engine/mixer.ts';
import { avisoDeNivel } from './engine/analise.ts';
import { Gravador, listarMicrofones, medirLatencia } from './engine/recorder.ts';
import { INSTRUMENTOS, KITS } from './engine/synths.ts';
import { duracaoDoPasso } from './engine/tempo.ts';
import { analisarEmSegundoPlano, processarEmSegundoPlano, type AnaliseDoBeat } from './engine/tuneClient.ts';
import { PRESETS_VOZ, aplicarTimbre } from './engine/vocalChain.ts';
import { GENEROS, aplicarGenero, novoProjeto } from './model/generos.ts';
import {
  LANES, LINHAS, NOTAS, PREFIXO_DE_FABRICA, SAMPLES_DE_FABRICA, STEPS, compassosDoArranjo, duracaoDaMusica, duracaoDoTrecho, idsDeAudio, nomeDoGrau, novoTake, padraoNoCompasso,
  padraoVazio, usaProcessamento, usaTune,
  type Escala, type InstrumentoId, type KitId, type LaneId, type PresetMaster, type PresetVoz, type Project, type Take,
} from './model/project.ts';
import {
  apagarAudio, carregarProjeto, desempacotarProjeto, empacotarProjeto, guardarAudio, lerAudio, listarAudios, salvarProjeto,
} from './storage.ts';
import { baixar, botao, campo, deslizante, explicacao, giratorio, h, ligarMudanca, numero, opcoes, seletor } from './ui/controles.ts';
import { TELAS, telaDeEfeito, type Tela } from './ui/efeitos.ts';
import { mesa } from './ui/mixer.ts';

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
/** Gênero em pré-escuta na tela de estilo, se houver. */
let previa: string | null = null;
/** Comparação "antes e depois": toca as vozes sem nenhum tratamento. */
let semEfeitos = false;
/** Take que está sendo regravado, se a gravação atual é uma regravação. */
let regravando: Take | undefined;
/** Avisos de nível de cada take (voz estourada, voz baixa), por id do take. */
const avisosDeTake = new Map<string, string>();
/** Preferências deste aparelho (não fazem parte da música). */
const prefs = {
  contagem: localStorage.getItem('estudio-aberto:contagem') !== 'nao',
  microfone: localStorage.getItem('estudio-aberto:microfone') ?? '',
};

/**
 * O projeto como deve soar agora. Na comparação "sem efeitos", as vozes
 * perdem timbre, tune, reverb, delay e distorção; o resto é o mesmo.
 */
function projetoParaTocar(): Project {
  if (!semEfeitos) return projeto;
  return {
    ...projeto,
    takes: projeto.takes.map((t) => ({
      ...t, preset: 'cru', reverb: 0, delay: 0, distorcao: 0, telefone: false, altura: 0, dobra: 0,
      tune: { ...t.tune, ligado: false },
      limpeza: { gate: 0, deEsser: 0 },
      eq: { corte: 20, graveDb: 0, medioHz: 3000, medioDb: 0, arDb: 0 },
      comp: { limiar: 0, razao: 1, ataque: 5, soltura: 120, ganho: 0 },
    })),
  };
}

// ---------- utilidades de interface ----------

const id = () => Math.random().toString(36).slice(2, 10);
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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
  engine.mixer.sincronizar(projetoParaTocar());
  if (!agrupar) return registrar();
  window.clearTimeout(pendente);
  pendente = window.setTimeout(registrar, 300);
}

/** `passos` = -1 desfaz, +1 refaz. */
ligarMudanca(mudou);

function navegarHistorico(passos: number) {
  registrar();
  const novoIndice = indice + passos;
  if (novoIndice < 0 || novoIndice >= historico.length) return;
  indice = novoIndice;
  projeto = JSON.parse(historico[indice]) as Project;
  salvarProjeto(projeto);
  padraoAtual = Math.min(padraoAtual, projeto.padroes.length - 1);
  engine.mixer.sincronizar(projetoParaTocar());
  desenharTudo();
  void reafinarTodos();
  reiniciarSeTocando();
}

// ---------- modo simples ----------
// No modo simples, a tela mostra só o caminho principal: estilo, beat do
// modelo, gravar, timbre e exportar. Os controles finos ficam escondidos.

const CHAVE_DO_MODO = 'estudio-aberto:tela';
let telaSimples = localStorage.getItem(CHAVE_DO_MODO) !== 'completa';
document.body.classList.toggle('simples', telaSimples);

/** Marca um elemento como avançado: ele some no modo simples. */
function av<T extends HTMLElement>(el: T): T {
  el.classList.add('avancado');
  return el;
}

/** Marca um elemento como exclusivo do modo simples. */
function so<T extends HTMLElement>(el: T): T {
  el.classList.add('so-simples');
  return el;
}

function trocarTela() {
  telaSimples = !telaSimples;
  localStorage.setItem(CHAVE_DO_MODO, telaSimples ? 'simples' : 'completa');
  document.body.classList.toggle('simples', telaSimples);
  if (engine.tocando && !gravando) parar();
  irParaPagina(pagina);
}

// ---------- estrutura da página ----------

const app = document.querySelector<HTMLDivElement>('#app')!;
const aviso = h('p', { className: 'aviso', role: 'status' });
const botaoTocar = h('button', { className: 'principal', title: 'Tocar / parar (Espaço)' }, '▶ Tocar');
const botaoGravar = h('button', { className: 'gravar', title: 'Gravar voz (R)' }, '● Gravar voz');
const tempo = h('span', { className: 'tempo' }, '0:00');
const visorInfo = h('span', { className: 'visor-info' });
const barraDeTempo = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', ariaLabel: 'Posição na música' });
const medidor = h('div', { className: 'medidor', title: 'Nível de saída' }, h('div'));
const secTransporte = h('header', { className: 'transporte' });
const pagina_ = (nome: string) => h('section', { className: 'pagina', id: `pagina-${nome}` });
const secEstilo = pagina_('estilo');
const secCanais = pagina_('canais');
const secNotas = pagina_('notas');
const secArranjo = pagina_('arranjo');
const secGravar = pagina_('gravar');
const secVozes = pagina_('efeitos');
const secMixer = pagina_('mixer');
const secMaster = pagina_('master');
const secProjeto = pagina_('projeto');
const trilha = h('nav', { className: 'trilha', ariaLabel: 'Páginas' });
const rodape = so(h('div', { className: 'linha rodape' }));
const contagemEl = h('div', { className: 'contagem' });
const medidorDeEntrada = h('div', { className: 'medidor' }, h('div'));

// Cada página é uma parte do trabalho, na ordem em que a música nasce.
// A tela simples mostra só as marcadas com `simples`.
const PAGINAS = [
  { id: 'estilo', nome: 'Estilo', secao: secEstilo, simples: true },
  { id: 'canais', nome: 'Beat', secao: secCanais, simples: true },
  { id: 'notas', nome: 'Notas', secao: secNotas, simples: false },
  { id: 'arranjo', nome: 'Arranjo', secao: secArranjo, simples: false },
  { id: 'gravar', nome: 'Gravar', secao: secGravar, simples: true },
  { id: 'efeitos', nome: 'Voz', secao: secVozes, simples: true },
  { id: 'mixer', nome: 'Mixer', secao: secMixer, simples: false },
  { id: 'master', nome: 'Master', secao: secMaster, simples: true },
  { id: 'projeto', nome: 'Projeto', secao: secProjeto, simples: true },
] as const;
type PaginaId = (typeof PAGINAS)[number]['id'];
const paginasVisiveis = () => PAGINAS.filter((p) => !telaSimples || p.simples);
let pagina: PaginaId = (PAGINAS.find((p) => p.id === sessionStorage.getItem('estudio-aberto:pagina'))?.id) ?? 'estilo';
if (telaSimples && !etapaDeBeat()) modo = 'musica';

/** Nas páginas de criação do beat, tocar repete o padrão; nas demais, toca a música com as vozes. */
function etapaDeBeat() {
  return pagina === 'estilo' || pagina === 'canais' || pagina === 'notas';
}

function irParaPagina(destino: PaginaId) {
  if (engine.tocando && !gravando && telaSimples) parar();
  pagina = paginasVisiveis().some((p) => p.id === destino) ? destino : 'estilo';
  sessionStorage.setItem('estudio-aberto:pagina', pagina);
  if (telaSimples) modo = etapaDeBeat() ? 'padrao' : 'musica';
  // Estas páginas mostram valores que podem ter mudado em outra página.
  if (pagina === 'mixer') desenharMixer();
  if (pagina === 'efeitos') desenharVozes();
  if (pagina === 'arranjo') desenharBeat();
  desenharTransporte();
  desenharTrilha();
  window.scrollTo({ top: 0 });
}

/** Avança ou volta na ordem das páginas visíveis. */
function irParaEtapa(i: number) {
  const visiveis = paginasVisiveis();
  if (visiveis[i]) irParaPagina(visiveis[i].id);
}

function desenharTrilha() {
  const visiveis = paginasVisiveis();
  for (const p of PAGINAS) p.secao.classList.toggle('ativa', p.id === pagina);
  trilha.replaceChildren(...visiveis.map((p, i) => Object.assign(botao(p.nome, () => irParaPagina(p.id), p.id === pagina ? 'ativo' : ''), { title: `Página ${i + 1}` })));
  const atual = visiveis.findIndex((p) => p.id === pagina);
  const voltar = botao('← Voltar', () => irParaEtapa(atual - 1));
  voltar.disabled = atual <= 0;
  const proxima = visiveis[atual + 1];
  rodape.replaceChildren(voltar, proxima ? botao(`Avançar: ${proxima.nome} →`, () => irParaEtapa(atual + 1), 'principal') : h('span'));
}

app.append(secTransporte, trilha, aviso, h('main', {}, ...PAGINAS.map((p) => p.secao)), rodape);

const avisar = (texto: string) => (aviso.textContent = texto);

// ---------- transporte ----------

function desenharTransporte() {
  const modos = h('div', { className: 'abas' },
    Object.assign(botao('PAD', () => trocarModo('padrao'), modo === 'padrao' ? 'ativo' : ''), { title: 'Tocar só o padrão aberto, em repetição' }),
    Object.assign(botao('MÚSICA', () => trocarModo('musica'), modo === 'musica' ? 'ativo' : ''), { title: 'Tocar a música inteira, com as vozes' }),
  );
  secTransporte.replaceChildren(
    h('strong', { className: 'marca' }, 'Estúdio Aberto'),
    h('div', { className: 'grupo' }, botaoTocar, botaoGravar),
    av(modos),
    h('div', { className: 'visor' }, tempo, visorInfo),
    barraDeTempo,
    medidor,
    h('div', { className: 'grupo' },
      Object.assign(botao('↶', () => navegarHistorico(-1)), { title: 'Desfazer (Ctrl/⌘+Z)', ariaLabel: 'Desfazer' }),
      Object.assign(botao('↷', () => navegarHistorico(1)), { title: 'Refazer (Ctrl/⌘+Shift+Z)', ariaLabel: 'Refazer' }),
      botao(telaSimples ? 'Mostrar tudo' : 'Tela simples', trocarTela, telaSimples ? '' : 'ativo'),
    ),
  );
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
  if (emLoop()) {
    await engine.tocar(projetoParaTocar(), 0, padraoAtual);
  } else {
    if (cursor >= duracaoDaMusica(projeto, engine.buffers) - 0.05) cursor = 0;
    await engine.tocar(projetoParaTocar(), cursor);
  }
  botaoTocar.textContent = '■ Parar';
}

function emLoop() {
  return (modo === 'padrao' || (telaSimples && etapaDeBeat())) && projeto.beat.fonte === 'padrao' && !gravando;
}

function reiniciarSeTocando() {
  if (!engine.tocando || gravando || previa) return;
  if (emLoop()) void engine.tocar(projetoParaTocar(), engine.posicao() % (duracaoDoPasso(projeto.bpm) * STEPS), padraoAtual);
  else void engine.tocar(projetoParaTocar(), engine.posicao());
}

function parar() {
  cursor = emLoop() || previa ? 0 : Math.min(engine.posicao(), duracaoDaMusica(projeto, engine.buffers));
  engine.parar();
  engine.desde = cursor;
  botaoTocar.textContent = '▶ Tocar';
  if (previa) {
    previa = null;
    engine.mixer.sincronizar(projetoParaTocar());
    desenharEstilo();
  }
}

function alternarTocar() {
  if (gravando) return;
  if (engine.tocando) parar();
  else void tocar();
}
botaoTocar.onclick = alternarTocar;

barraDeTempo.oninput = () => irPara(Number(barraDeTempo.value));

/** Leva o cursor a um ponto da música e, se estiver tocando, continua de lá. */
function irPara(segundos: number) {
  cursor = Math.max(0, segundos);
  if (engine.tocando && !gravando) void engine.tocar(projetoParaTocar(), cursor);
  else engine.desde = cursor;
}

function marcarGravacao(ligada: boolean) {
  gravando = ligada;
  for (const b of [botaoGravar, botaoGravarGrande]) {
    b.textContent = ligada ? '■ Parar gravação' : '● Gravar voz';
    b.classList.toggle('ativo', ligada);
  }
}

/** Começa ou termina uma gravação. Com `refazer`, grava de novo o trecho daquele take. */
async function alternarGravacao(refazer?: Take) {
  if (gravando) return terminarGravacao();
  parar();
  if (modo === 'padrao') {
    modo = 'musica';
    desenharTransporte();
  }
  if (refazer) cursor = Math.max(0, refazer.inicio);
  try {
    await engine.ctx.resume();
    await gravador.iniciar(prefs.microfone || undefined);
  } catch {
    avisar('Não consegui acessar o microfone. Libere a permissão no navegador e tente de novo.');
    return;
  }
  regravando = refazer;
  marcarGravacao(true);
  avisar('Gravando. Use fone de ouvido, senão o beat vaza para o microfone.');
  // Contagem: um compasso de estalos para a pessoa entrar no tempo.
  const espera = prefs.contagem ? engine.contar(projeto.bpm) : 0;
  await engine.tocar(projetoParaTocar(), cursor, undefined, espera);
  void desenharGravar();
}
botaoGravar.onclick = () => void alternarGravacao();
const botaoGravarGrande = h('button', { className: 'gravar grande', onclick: () => void alternarGravacao() }, '● Gravar voz');

async function terminarGravacao() {
  const g = gravador.parar();
  const { t0, desde } = engine;
  const antigo = regravando;
  regravando = undefined;
  marcarGravacao(false);
  engine.parar();
  botaoTocar.textContent = '▶ Tocar';
  cursor = desde;
  engine.desde = desde;

  // O som que você ouviu saiu atrasado da placa, e sua voz chegou atrasada
  // pelo microfone. Descontar esse atraso alinha o take com o beat.
  const latencia = (projeto.latenciaMs ?? latenciaEstimada()) / 1000;
  let inicio = desde + (g.inicio - t0) - latencia;
  let amostras = g.amostras;
  // Descarta o que foi captado durante a contagem, deixando um respiro de 1/4 de segundo.
  const sobra = desde - 0.25 - inicio;
  if (sobra > 0) {
    const corte = Math.min(amostras.length, Math.round(sobra * g.taxa));
    amostras = amostras.slice(corte);
    inicio += corte / g.taxa;
  }
  if (amostras.length < g.taxa * 0.3) {
    void desenharGravar();
    return avisar('Gravação curta demais, nada foi salvo.');
  }

  const take = novoTake(id(), `Take ${projeto.takes.length + 1}`, id(), inicio, projeto.voz);
  aplicarTimbre(take, take.preset);
  const buffer = engine.ctx.createBuffer(1, amostras.length, g.taxa);
  buffer.copyToChannel(amostras, 0);
  engine.buffers.set(take.audioId, buffer);
  take.naMontagem = projeto.montagem.ligada;
  if (antigo) antigo.mudo = true;
  projeto.takes.push(take);
  const nivel = avisoDeNivel(amostras);
  if (nivel) avisosDeTake.set(take.id, nivel);
  mudou();
  desenharVozes();
  void desenharGravar();
  avisar(nivel ?? (antigo
    ? `${take.nome} gravado. O take anterior (${antigo.nome}) ficou mudo; em "Voz" dá para juntar o melhor dos dois.`
    : `${take.nome} gravado. Ouça e, se a voz estiver fora do tempo, use "Medir atraso deste aparelho".`));
  await guardarAudio(take.audioId, { tipo: 'pcm', taxa: g.taxa, amostras });
  // Pede ao navegador para não apagar o áudio guardado quando faltar espaço.
  void navigator.storage?.persist?.();
  void reafinar(take);
}

function latenciaEstimada(): number {
  const { baseLatency, outputLatency } = engine.ctx;
  return Math.round((baseLatency + (outputLatency || 0) + gravador.latenciaDeEntrada) * 1000);
}

// ---------- estilo ----------

function cartaoDeGenero(g: string): HTMLElement {
  const m = GENEROS[g];
  const atual = projeto.genero === g;
  return h('article', { className: 'cartao' + (atual ? ' atual' : '') + (previa === g ? ' tocando' : '') },
    h('strong', {}, m.nome),
    h('span', { className: 'nota' }, `${m.bpm} BPM`),
    h('p', {}, m.descricao),
    h('div', { className: 'linha' },
      botao(previa === g ? '■ Parar' : '▶ Ouvir', () => void ouvirGenero(g)),
      atual
        ? h('span', { className: 'nota' }, 'Em uso')
        : botao('Usar este', () => {
            if (!confirm(`Usar ${m.nome}? O beat atual é substituído pelo modelo do estilo (dá para desfazer). As vozes ficam.`)) return;
            parar();
            aplicarGenero(projeto, g);
            padraoAtual = 0;
            mudou();
            desenharTudo();
          }, 'principal'),
    ),
  );
}

/** Pré-escuta: toca o modelo do estilo sem mexer na música da pessoa. */
async function ouvirGenero(g: string) {
  if (gravando) return;
  const jaTocava = previa === g;
  parar();
  if (jaTocava) return;
  previa = g;
  await engine.tocar({ ...novoProjeto(g), tom: projeto.tom }, 0, 0);
  botaoTocar.textContent = '■ Parar';
  desenharEstilo();
}

function desenharEstilo() {
  const nome = h('input', { type: 'text', value: projeto.nome });
  nome.onchange = () => {
    projeto.nome = nome.value;
    mudou();
  };
  const genero = GENEROS[projeto.genero];
  secEstilo.replaceChildren(
    h('h2', {}, 'Estilo'),
    campo('Nome da música', nome),
    h('p', { className: 'nota' }, 'Ouça os estilos e escolha um ponto de partida. Dá para mudar tudo depois.'),
    h('div', { className: 'cartoes' }, ...Object.keys(GENEROS).map(cartaoDeGenero)),
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

/**
 * Pintar arrastando o mouse: o quadrado onde o botão desceu define o valor
 * (ligar, apagar, rolo...) e todos os quadrados por onde o mouse passar na
 * mesma grade recebem esse valor. Um clique simples continua alternando.
 */
let pintura: { grade: HTMLElement; valor: number; definirOrigem: (v: number) => void; usada: boolean } | null = null;
let ignorarClique = false;

window.addEventListener('pointerup', () => {
  if (pintura?.usada) {
    mudou();
    // O clique que o navegador dispara ao soltar não deve desfazer a pintura.
    ignorarClique = true;
    setTimeout(() => (ignorarClique = false), 0);
  }
  pintura = null;
});

function pintavel(grade: HTMLElement, b: HTMLButtonElement, proximo: () => number, definir: (v: number) => void) {
  b.onpointerdown = (e) => {
    if (e.pointerType === 'mouse' && e.button === 0) pintura = { grade, valor: proximo(), definirOrigem: definir, usada: false };
  };
  b.onpointerenter = (e) => {
    if (!pintura || pintura.grade !== grade || !(e.buttons & 1)) return;
    if (!pintura.usada) pintura.definirOrigem(pintura.valor);
    pintura.usada = true;
    definir(pintura.valor);
  };
  b.onclick = () => {
    if (ignorarClique) return;
    definir(proximo());
    mudou();
  };
}

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
      pintavel(grade, b, () => (padrao.bateria[lane.id][i] === pincel ? 0 : pincel), (v) => {
        padrao.bateria[lane.id][i] = v;
        pintar();
      });
      pintar();
      colunas[i].push(b);
      grade.append(b);
    }
  }
  return h('div', { className: 'rolagem' }, grade);
}

/** Grade de notas (808 ou melodia): linhas são notas da escala, agudas em cima. */
function gradeDeNotas(ligado: (linha: number, passo: number) => boolean, definir: (linha: number, passo: number, ligar: boolean) => void): HTMLElement {
  const grade = h('div', { className: 'grade notas' });
  const botoes: HTMLButtonElement[][] = [];
  const pintar = () => botoes.forEach((linha, l) => linha.forEach((b, s) => b.classList.toggle('ligado', ligado(l, s))));
  for (let l = LINHAS - 1; l >= 0; l--) {
    const nota = nomeDoGrau(l, projeto.tom, projeto.escala);
    grade.append(h('span', { className: 'nome-linha' + (l % 7 === 0 ? ' tonica' : '') }, nota));
    botoes[l] = [];
    for (let s = 0; s < STEPS; s++) {
      const b = h('button', { className: 'passo' + (s % 4 === 0 ? ' tempo-forte' : ''), ariaLabel: `${nota}, passo ${s + 1}` });
      pintavel(grade, b, () => (ligado(l, s) ? 0 : 1), (v) => {
        definir(l, s, v === 1);
        pintar();
      });
      botoes[l][s] = b;
      colunas[s].push(b);
      grade.append(b);
    }
  }
  pintar();
  return grade;
}

/** Abas para escolher, criar e duplicar padrões; aparecem nas três páginas do beat. */
function abasDePadrao(): HTMLElement {
  const padrao = projeto.padroes[padraoAtual];
  return h('div', { className: 'abas' },
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
}

/** Visão da música inteira: os padrões em sequência e, abaixo, onde cada voz entra. */
function linhaDoTempo(): HTMLElement {
  const blocos = projeto.beat.fonte === 'arquivo'
    ? [h('div', { className: 'bloco-padrao' }, projeto.beat.nomeArquivo ?? 'Beat importado')]
    : projeto.arranjo.map((b) => {
        const bloco = h('div', { className: 'bloco-padrao' + (b.padrao === padraoAtual ? ' atual' : ''), title: 'Abrir este padrão' }, `${projeto.padroes[b.padrao]?.nome ?? '?'} ×${b.vezes}`);
        bloco.style.flexGrow = String(b.vezes);
        bloco.onclick = () => abrirPadrao(b.padrao);
        return bloco;
      });
  return h('div', { className: 'playlist' },
    h('div', { className: 'pista' }, h('span', { className: 'nome-linha' }, 'Beat'), h('div', { className: 'blocos' }, ...blocos)),
    ...projeto.takes.map((take) => h('div', { className: 'pista' }, h('span', { className: 'nome-linha' }, take.nome), onda(take))),
  );
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

  secArranjo.replaceChildren(
    h('h2', {}, 'Arranjo'),
    h('p', { className: 'nota' }, 'A música inteira de uma vez: a ordem dos padrões e onde cada voz entra. Clique numa voz para ouvir a partir daquele ponto.'),
    linhaDoTempo(),
    ...(beat.fonte === 'padrao' ? [
      h('h3', {}, 'Ordem dos padrões'),
      arranjo(),
      explicacao([
        'O arranjo é a ordem em que os padrões tocam para formar a música: intro, verso, refrão, pausa.',
        'Crie variações com "Duplicar" e mude pouca coisa: tirar o bumbo e o 808 por 2 compassos e devolver depois já cria impacto.',
      ]),
    ] : []),
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
        numero('BPM do beat', 60, 200, projeto.bpm, (v) => { projeto.bpm = v; desenharEstilo(); }),
        seletor('Tom do beat', NOTAS.map((n, i) => [i, n] as [number, string]), projeto.tom, (v) => { projeto.tom = v; desenharEstilo(); void reafinarTodos(); }),
        seletor<Escala>('Escala', [['menor', 'Menor'], ['maior', 'Maior']], projeto.escala, (v) => { projeto.escala = v; desenharEstilo(); void reafinarTodos(); }),
      ),
      h('p', { className: 'nota' }, 'O delay usa o BPM e o tune usa o tom. Com eles errados, o eco sai fora do tempo e a afinação puxa para notas erradas.'),
      volume,
      espaco,
      explicacao([
        'Beat pronto já vem cheio e comprimido, e a voz tende a ficar "por cima" em vez de dentro dele.',
        'Abrir espaço faz um corte suave no beat em 3 kHz, a região onde mora a clareza da letra. Baixar um pouco o volume do beat também ajuda.',
      ]),
    );
    secNotas.replaceChildren(h('h2', {}, 'Notas'), h('p', { className: 'nota' }, 'Esta página edita o 808 e a melodia de um beat criado aqui. Com um beat importado, ela não é usada.'));
    return;
  }

  const padrao = projeto.padroes[padraoAtual];
  const emUso = (i: number) => projeto.arranjo.some((b) => b.padrao === i);
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

  secCanais.replaceChildren(
    h('h2', {}, 'Beat'), abas,
    h('p', { className: 'nota so-simples' }, 'O beat do estilo já vem pronto: aperte Tocar. Clique nos quadrados para mudar a bateria. Em "Mostrar tudo" ficam o 808, a melodia, os samples e o arranjo.'),
    av(h('h3', {}, 'Padrão')),
    av(abasDePadrao()),
    av(h('div', { className: 'linha' }, campo('Nome do padrão', nomeDoPadrao), apagar)),
    h('h3', {}, 'Bateria'),
    h('div', { className: 'linha' },
      seletor<KitId>('Kit', opcoes(KITS, (k) => KITS[k].nome), projeto.kit, (v) => { projeto.kit = v; }),
      deslizante('Volume', 0, 1.2, 0.01, projeto.volumes.bateria, (v) => { projeto.volumes.bateria = v; }),
    ),
    av(campo('Pincel: o que um clique escreve', pinceis)),
    gradeDeBateria(),
    av(samples()),
    explicacao([
      'Cada linha é um som e cada quadrado é um instante do compasso (16 por compasso). Os quadrados mais claros marcam as 4 batidas.',
      'Fraco: toca baixinho. Notas fracas entre as fortes dão balanço.',
      'Rolo: repete o som 2, 3 ou 4 vezes dentro de um quadrado. É o chimbal acelerado do trap.',
    ]),
    volume,
    espaco,
  );

  secNotas.replaceChildren(
    h('h2', {}, 'Notas'),
    abasDePadrao(),
    h('h3', {}, '808'),
    deslizante('Volume', 0, 1.2, 0.01, projeto.volumes.baixo, (v) => { projeto.volumes.baixo = v; }),
    sample808(),
    h('div', { className: 'rolagem' },
      gradeDeNotas(
        (l, s) => padrao.baixo[s] === l,
        (l, s, ligar) => {
          if (ligar) padrao.baixo[s] = l;
          else if (padrao.baixo[s] === l) padrao.baixo[s] = -1;
        },
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
        (l, s, ligar) => { padrao.melodia[l][s] = ligar; },
      ),
    ),
    explicacao([
      'Só aparecem notas da escala, então qualquer combinação soa bem junta.',
      'Notas na mesma coluna tocam ao mesmo tempo e formam um acorde. Pulando uma linha entre elas (1ª, 3ª, 5ª) sai o acorde básico.',
    ]),
  );
}

/** Trocar o 808 sintetizado por um sample do usuário, afinado pela nota em que foi gravado. */
function sample808(): HTMLElement {
  const atual = projeto.sample808;
  const arquivo = h('input', { type: 'file', accept: 'audio/*', ariaLabel: 'Sample de 808' });
  arquivo.onchange = async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    try {
      const buffer = await engine.ctx.decodeAudioData(await f.arrayBuffer());
      if (buffer.duration > 10) return avisar('Esse arquivo é longo demais para um 808 (máximo de 10 segundos).');
      const audioId = id();
      engine.buffers.set(audioId, buffer);
      projeto.sample808 = { audioId, nome: f.name, nota: 0 };
      mudou();
      desenharBeat();
      await guardarAudio(audioId, { tipo: 'arquivo', blob: f });
    } catch {
      avisar('Não consegui ler esse arquivo de áudio.');
    }
  };
  return h('details', { className: 'explica' },
    h('summary', {}, atual ? `Usando meu 808: ${atual.nome}` : 'Usar meu sample de 808'),
    h('p', {}, 'Escolha um 808 de um pack seu e informe em que nota ele foi gravado (costuma vir no nome do arquivo, como "808 C" ou "808 F#"). O estúdio toca o sample mais rápido ou mais devagar para chegar em cada nota da grade.'),
    atual
      ? h('div', { className: 'linha' },
          seletor('Nota do sample', NOTAS.map((n, i) => [i, n] as [number, string]), atual.nota, (v) => { atual.nota = v; }),
          botao('Voltar ao 808 do kit', () => {
            delete projeto.sample808;
            mudou();
            desenharBeat();
          }),
        )
      : arquivo,
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
    botao('Usar os samples prontos em toda a bateria', async () => {
      for (const lane of LANES) {
        const primeiro = SAMPLES_DE_FABRICA[lane.id]?.[0];
        if (!primeiro) continue;
        const audioId = PREFIXO_DE_FABRICA + primeiro.arquivo;
        if (await carregarDeFabrica(audioId)) projeto.samples[lane.id] = { audioId, nome: primeiro.nome };
      }
      mudou();
      desenharBeat();
    }),
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

/** O que a análise automática achou do beat importado, até a pessoa aceitar ou dispensar. */
let analise: AnaliseDoBeat | null = null;

async function analisarBeat(buffer: AudioBuffer) {
  analise = null;
  // Um minuto e meio do meio da música basta e evita intros vazias.
  const ini = Math.floor(Math.min(buffer.duration * 0.15, 20) * buffer.sampleRate);
  const fim = Math.min(buffer.length, ini + 90 * buffer.sampleRate);
  const mono = new Float32Array(fim - ini);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += canal[ini + i] / buffer.numberOfChannels;
  }
  analise = await analisarEmSegundoPlano(mono, buffer.sampleRate);
  desenharBeat();
}

function sugestaoDoBeat(): HTMLElement | string {
  if (!projeto.beat.audioId) return '';
  if (!analise) return h('p', { className: 'nota' }, 'Analisando o beat para sugerir BPM e tom...');
  const { bpm, tom } = analise;
  const usarBpm = (v: number) => botao(`Usar ${v} BPM`, () => {
    projeto.bpm = v;
    mudou();
    desenharEstilo();
    desenharBeat();
  }, projeto.bpm === v ? 'ativo' : '');
  const linhas: (HTMLElement | string)[] = [];
  if (bpm) {
    linhas.push(h('p', {}, `Andamento: parece ser ${bpm.bpm} BPM. Se o beat for contado na metade ou no dobro, é ${bpm.alternativa}.`));
    linhas.push(h('div', { className: 'linha' }, usarBpm(bpm.bpm), usarBpm(bpm.alternativa)));
  }
  if (tom) {
    const nomeDoTom = `${NOTAS[tom.tom]} ${tom.escala}`;
    const emUso = projeto.tom === tom.tom && projeto.escala === tom.escala;
    linhas.push(h('p', {}, tom.confianca < 0.05
      ? `Tom: meu melhor palpite é ${nomeDoTom}, mas com pouca certeza. Confira no nome do arquivo ou com quem fez o beat.`
      : `Tom: parece ser ${nomeDoTom}.`));
    linhas.push(botao(`Usar ${nomeDoTom}`, () => {
      projeto.tom = tom.tom;
      projeto.escala = tom.escala;
      mudou();
      desenharEstilo();
      desenharBeat();
      void reafinarTodos();
    }, emUso ? 'ativo' : ''));
  }
  if (!bpm && !tom) linhas.push(h('p', {}, 'Não consegui identificar BPM nem tom neste arquivo. Informe os dois abaixo.'));
  return h('div', { className: 'sugestao' }, h('strong', {}, 'Sugestão automática'), ...linhas,
    h('p', { className: 'nota' }, 'É uma estimativa. Se o beat veio com BPM e tom no nome do arquivo, confie no nome.'));
}

async function importarBeat(arquivo: File) {
  try {
    avisar('Carregando beat...');
    const buffer = await engine.ctx.decodeAudioData(await arquivo.arrayBuffer());
    const audioId = id();
    engine.buffers.set(audioId, buffer);
    projeto.beat.fonte = 'arquivo';
    projeto.beat.audioId = audioId;
    projeto.beat.nomeArquivo = arquivo.name;
    mudou();
    desenharBeat();
    avisar(`Beat carregado: ${relogio(buffer.duration)} de duração.`);
    void analisarBeat(buffer);
    await guardarAudio(audioId, { tipo: 'arquivo', blob: arquivo });
  } catch {
    avisar('Não consegui ler esse arquivo de áudio.');
  }
}

// ---------- vozes ----------

/** Com que ajustes cada take foi afinado por último, para não refazer à toa. */
const afinadoCom = new Map<string, string>();

/** Refaz o processamento prévio de um take: limpeza (gate, de-esser) e afinação. */
async function reafinar(take: Take) {
  const chave = take.audioId + ':tune';
  const original = engine.buffers.get(take.audioId);
  if (!usaProcessamento(take) || !original) return;
  // Com o tune desligado, só a mudança de altura é aplicada (intensidade 0).
  const intensidade = take.tune.ligado ? take.tune.intensidade : 0;
  const tune = usaTune(take)
    ? { tom: projeto.tom, escala: projeto.escala, velocidade: take.tune.velocidade, intensidade, transpor: take.altura }
    : undefined;
  const ajustes = JSON.stringify([tune, take.limpeza]);
  if (afinadoCom.get(take.audioId) === ajustes && engine.buffers.has(chave)) return;
  avisar(`Processando ${take.nome}...`);
  const pronto = await processarEmSegundoPlano(original.getChannelData(0), original.sampleRate, { gate: take.limpeza.gate, deEsser: take.limpeza.deEsser, tune });
  const buffer = engine.ctx.createBuffer(1, pronto.length, original.sampleRate);
  buffer.copyToChannel(pronto, 0);
  engine.buffers.set(chave, buffer);
  afinadoCom.set(take.audioId, ajustes);
  avisar(take.tune.ligado ? `${take.nome} afinado em ${NOTAS[projeto.tom]} ${projeto.escala}.` : `${take.nome} processado.`);
  reiniciarSeTocando();
}

async function reafinarTodos() {
  for (const take of projeto.takes) await reafinar(take);
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
      if (engine.tocando && !gravando) void engine.tocar(projetoParaTocar(), cursor);
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

/** Forma de onda do take ao longo da música, com a agulha de reprodução. Clicar leva a música àquele ponto. */
let agulhas: HTMLElement[] = [];
/** Take aberto na página de voz e tela de efeito escolhida. */
let takeAberto: string | null = null;
let telaAberta: Tela = 'Afinação';
/** Atualizações por quadro (medidores) das páginas de voz e do mixer; refeitas a cada redesenho. */
let quadrosDaVoz: (() => void)[] = [];
let quadrosDoMixer: (() => void)[] = [];

function onda(take: Take): HTMLElement {
  const buffer = engine.buffers.get(take.audioId);
  const duracao = duracaoDaMusica(projeto, engine.buffers);
  const tela = h('canvas', { width: 900, height: 48 });
  const g = tela.getContext('2d');
  if (buffer && g) {
    const dados = buffer.getChannelData(0);
    g.fillStyle = take.mudo ? '#5b6570' : '#f5b83d';
    for (let x = 0; x < tela.width; x++) {
      // Cada coluna mostra o pico do trecho de áudio que cai nela.
      const a = Math.floor((((x / tela.width) * duracao - take.inicio) * buffer.sampleRate));
      const b = Math.floor(((((x + 1) / tela.width) * duracao - take.inicio) * buffer.sampleRate));
      if (b <= 0 || a >= dados.length) continue;
      let pico = 0;
      for (let i = Math.max(0, a); i < Math.min(dados.length, b); i += 8) pico = Math.max(pico, Math.abs(dados[i]));
      const altura = Math.max(1, pico * tela.height);
      g.fillRect(x, (tela.height - altura) / 2, 1, altura);
    }
  }
  const agulha = h('div', { className: 'agulha' });
  agulhas.push(agulha);
  const caixa = h('div', { className: 'onda', title: 'Clique para ouvir a partir deste ponto' }, tela, agulha);
  caixa.onclick = (e) => {
    const r = caixa.getBoundingClientRect();
    if (modo === 'padrao') trocarModo('musica');
    irPara(((e.clientX - r.left) / r.width) * duracao);
  };
  return caixa;
}

/** Compara o volume das vozes com o do beat e diz, em linguagem comum, o que ajustar. */
async function conferirEquilibrio() {
  if (!projeto.takes.some((t) => !t.mudo)) return avisar('Grave uma voz antes de conferir o equilíbrio.');
  avisar('Conferindo o equilíbrio entre voz e beat...');
  const voz = (await exportarMix(projeto, engine.buffers, 'voz')).lufs;
  const beat = (await exportarMix(projeto, engine.buffers, 'beat')).lufs;
  if (!Number.isFinite(voz) || !Number.isFinite(beat)) return avisar('Não deu para comparar: falta voz ou beat.');
  const diferenca = voz - beat;
  avisar(
    diferenca < -4 ? `A voz está ${Math.round(-diferenca)} dB abaixo do beat e vai sumir. Suba o volume da voz ou baixe o do beat.`
    : diferenca > 6 ? `A voz está ${Math.round(diferenca)} dB acima do beat e soa descolada dele. Baixe um pouco a voz ou suba o beat.`
    : 'Voz e beat estão equilibrados: a voz aparece sem se descolar do beat.',
  );
}

function desenharVozes() {
  quadrosDaVoz = [];
  desenharMixer();
  const take = projeto.takes.find((t) => t.id === takeAberto) ?? projeto.takes[0];
  if (!take) {
    secVozes.replaceChildren(h('h2', {}, 'Voz'), h('p', { className: 'nota' }, 'Nenhum take ainda. Grave sua voz na página "Gravar" e volte aqui para tratar o som dela.'));
    return;
  }
  takeAberto = take.id;
  const comparar = botao(semEfeitos ? 'Ouvindo SEM efeitos' : 'Comparar: ouvir sem efeitos', () => {
    semEfeitos = !semEfeitos;
    engine.mixer.sincronizar(projetoParaTocar());
    reiniciarSeTocando();
    desenharVozes();
  }, semEfeitos ? 'ativo' : '');
  comparar.title = 'Alterna entre a voz tratada e a voz crua, para ouvir o que os efeitos fazem';

  const nome = h('input', { type: 'text', value: take.nome, ariaLabel: 'Nome do take' });
  nome.onchange = () => {
    take.nome = nome.value;
    mudou();
    desenharVozes();
    void desenharGravar();
  };
  const mudo = botao(take.mudo ? 'Mudo' : 'Ouvindo', () => {
    take.mudo = !take.mudo;
    mudou();
    desenharVozes();
    void desenharGravar();
  }, take.mudo ? 'ativo' : '');
  const apagar = botao('Apagar', () => {
    projeto.takes = projeto.takes.filter((t) => t.id !== take.id);
    mudou();
    desenharVozes();
    void desenharGravar();
    reiniciarSeTocando();
    avisar(`${take.nome} apagado. Use "Desfazer" se foi engano.`);
  }, 'perigo');

  // Controles por intenção (tela simples): cada um move vários ajustes de uma vez.
  const NIVEIS_DE_TUNE: [string, boolean, number, number][] = [
    ['Sem tune', false, 0.2, 1], ['Leve', true, 0.6, 0.6], ['Forte', true, 0.25, 1], ['Robô', true, 0, 1],
  ];
  const tuneAtual = !take.tune.ligado ? 0 : take.tune.velocidade <= 0.05 ? 3 : take.tune.intensidade < 0.8 ? 1 : 2;
  const niveisDeTune = h('div', { className: 'abas' }, ...NIVEIS_DE_TUNE.map(([rotulo, ligado, velocidade, intensidade], i) =>
    botao(rotulo, () => {
      take.tune = { ligado, velocidade, intensidade };
      mudou();
      desenharVozes();
      void reafinar(take).then(reiniciarSeTocando);
    }, i === tuneAtual ? 'ativo' : ''),
  ));
  const distancia = deslizante('Perto ↔ longe', 0, 1, 0.01, Math.min(1, Math.max(0, (take.reverb - 0.02) / 0.5)), (v) => {
    take.reverb = 0.02 + v * 0.5;
    take.tamanhoReverb = v < 0.34 ? 'quarto' : v < 0.67 ? 'sala' : 'salao';
  });
  const eco = deslizante('Seca ↔ com eco', 0, 1, 0.01, Math.min(1, take.delay / 0.5), (v) => {
    take.delay = v * 0.5;
    take.repeticoes = 0.2 + v * 0.4;
  });

  const contexto = {
    projeto, engine,
    reprocessar: (t: Take) => void reafinar(t),
    redesenhar: () => {
      mudou();
      desenharVozes();
    },
    aCadaQuadro: (fn: () => void) => quadrosDaVoz.push(fn),
  };

  secVozes.replaceChildren(
    h('h2', {}, 'Voz'),
    h('div', { className: 'abas' }, ...projeto.takes.map((t) => botao(t.nome, () => {
      takeAberto = t.id;
      desenharVozes();
    }, t.id === take.id ? 'ativo' : ''))),
    h('div', { className: 'linha' }, nome, mudo, apagar),
    onda(take),
    h('div', { className: 'linha' }, comparar, botao('Conferir equilíbrio voz × beat', () => void conferirEquilibrio())),

    // Tela simples: poucas decisões, por intenção.
    so(seletor<PresetVoz>('Timbre', opcoes(PRESETS_VOZ, (k) => PRESETS_VOZ[k].nome), take.preset, (v) => {
      aplicarTimbre(take, v);
      desenharVozes();
    })),
    so(campo('Afinação', niveisDeTune)),
    so(h('div', { className: 'linha' }, distancia, eco, deslizante('Volume', 0, 1.5, 0.01, take.volume, (v) => { take.volume = v; }))),
    so(explicacao([
      ...PRESETS_VOZ[take.preset].explicacao,
      'Afinação: "Leve" só aproxima das notas certas; "Forte" corrige tudo sem soar artificial; "Robô" é o efeito marcante do trap e do plug.',
      'Perto ↔ longe controla o reverb, que simula um ambiente. Seca ↔ com eco controla o delay, que repete a voz no tempo do beat.',
      'Em "Mostrar tudo" cada ferramenta tem a sua tela: equalizador, compressor, limpeza de ruído, edição do take e mais.',
    ])),

    // Tela completa: uma tela por ferramenta.
    av(h('div', { className: 'abas telas' }, ...TELAS.map((t) => botao(t, () => {
      telaAberta = t;
      desenharVozes();
    }, t === telaAberta ? 'ativo' : '')))),
    av(telaDeEfeito(telaAberta, take, contexto)),
    ...(projeto.takes.length > 1 ? [av(h('h3', {}, 'Montagem: o melhor de cada take')), av(montagem())] : []),
  );
}

// ---------- mixer ----------

function desenharMixer() {
  quadrosDoMixer = [];
  secMixer.replaceChildren(
    h('h2', {}, 'Mixer'),
    mesa({
      projeto, engine, mudou,
      aCadaQuadro: (fn) => quadrosDoMixer.push(fn),
      abrirEfeitos: (take) => {
        takeAberto = take.id;
        irParaPagina('efeitos');
      },
      redesenhar: desenharMixer,
    }),
  );
}

// ---------- gravar ----------

async function desenharGravar() {
  const contagem = h('input', { type: 'checkbox', checked: prefs.contagem });
  contagem.onchange = () => {
    prefs.contagem = contagem.checked;
    localStorage.setItem('estudio-aberto:contagem', prefs.contagem ? 'sim' : 'nao');
  };
  const latencia = h('input', { type: 'number', min: '0', max: '500', placeholder: 'automático', value: projeto.latenciaMs === null ? '' : String(projeto.latenciaMs) });
  latencia.onchange = () => {
    projeto.latenciaMs = latencia.value === '' ? null : Math.max(0, Number(latencia.value));
    mudou();
  };
  // A lista de microfones só tem nomes depois que a pessoa deu permissão.
  const microfones = await listarMicrofones().catch(() => []);
  const escolha = microfones.length > 1
    ? seletor('Microfone', [['', 'Padrão do sistema'] as [string, string], ...microfones.map((m) => [m.id, m.nome] as [string, string])], prefs.microfone, (v) => {
        prefs.microfone = v;
        localStorage.setItem('estudio-aberto:microfone', v);
      })
    : '';

  const lista = projeto.takes.map((take) => {
    const buffer = engine.buffers.get(take.audioId);
    const alerta = avisosDeTake.get(take.id);
    return h('article', { className: 'take' },
      h('div', { className: 'linha' },
        h('strong', {}, take.nome),
        h('span', { className: 'nota' }, `${buffer ? relogio(buffer.duration) : '?'} · começa em ${relogio(Math.max(0, take.inicio))}${take.mudo ? ' · mudo' : ''}`),
      ),
      onda(take),
      alerta ? h('p', { className: 'nota alerta' }, alerta) : '',
      h('div', { className: 'linha' },
        botao('▶ Ouvir', () => {
          if (modo === 'padrao') trocarModo('musica');
          cursor = Math.max(0, take.inicio);
          engine.desde = cursor;
          void tocar();
        }),
        botao('Gravar de novo este trecho', () => void alternarGravacao(take)),
        botao('Apagar', () => {
          projeto.takes = projeto.takes.filter((t) => t.id !== take.id);
          mudou();
          desenharVozes();
          void desenharGravar();
          avisar(`${take.nome} apagado. Use "Desfazer" se foi engano.`);
        }, 'perigo'),
      ),
    );
  });

  secGravar.replaceChildren(
    h('h2', {}, 'Gravar'),
    h('p', { className: 'nota' }, 'Coloque o fone (de preferência com fio), aperte gravar e cante em cima do beat. A gravação começa de onde a música estiver; cada gravação vira um take.'),
    h('div', { className: 'linha palco' }, botaoGravarGrande, contagemEl),
    campo('Nível do microfone', medidorDeEntrada),
    h('div', { className: 'linha' }, h('label', { className: 'caixa' }, contagem, 'Contagem de 4 antes de gravar'), escolha),
    ...lista,
    h('h3', {}, 'Voz fora do tempo?'),
    h('p', { className: 'nota' }, 'Todo aparelho atrasa o som um pouco. Fone Bluetooth atrasa muito e de forma irregular: prefira fone com fio para gravar.'),
    h('div', { className: 'linha' },
      av(campo('Compensação de atraso (ms)', latencia)),
      botao('Medir atraso deste aparelho', async () => {
        if (engine.tocando || gravando) return;
        avisar('Medindo: tire o fone, aumente o volume e fique em silêncio por 4 segundos.');
        try {
          const atraso = await medirLatencia(engine.ctx, gravador, prefs.microfone || undefined);
          if (atraso === null) return avisar('O microfone não ouviu os estalos. Tire o fone, aumente o volume e tente de novo.');
          projeto.latenciaMs = Math.round(atraso * 1000);
          mudou();
          void desenharGravar();
          avisar(`Atraso medido: ${projeto.latenciaMs} ms. As próximas gravações já saem alinhadas.`);
        } catch {
          avisar('Não consegui acessar o microfone.');
        }
      }),
    ),
    explicacao([
      'Contagem: quatro estalos no andamento da música antes de o beat entrar, para você começar no tempo.',
      'Nível do microfone: enquanto grava, a barra deve ficar no meio. Vermelha quer dizer que a voz está estourando.',
      'Gravar de novo: regrava a partir do mesmo ponto. O take antigo fica mudo, não é apagado.',
    ]),
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
        : r.lufs < -16 ? ' Mais baixo que o padrão do Spotify (-14).'
        : ' Dentro do padrão do Spotify (-14).';
      resultado.textContent = `Pronto. Volume: ${lufs}, pico ${r.picoDb.toFixed(1)} dBFS.${comparacao}`;
    } catch {
      resultado.textContent = 'A exportação falhou.';
    }
  };
  const a = projeto.ajusteDoMaster;
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
          seletor<PresetMaster>('Compressão e volume', opcoes(PRESETS_MASTER, (k) => PRESETS_MASTER[k].nome), projeto.master, (v) => {
            projeto.master = v;
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
          ...PRESETS_MASTER[projeto.master].explicacao,
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

function desenharProjeto() {
  const abrir = h('input', { type: 'file', accept: '.json,application/json' });
  abrir.onchange = () => abrir.files?.[0] && void abrirDeArquivo(abrir.files[0]);
  secProjeto.replaceChildren(
    h('h2', {}, 'Projeto'),
    h('p', { className: 'nota' }, 'O projeto é salvo sozinho neste navegador. Salve em arquivo para guardar cópia, trocar de aparelho ou mandar para alguém gravar junto.'),
    h('div', { className: 'linha' },
      botao('Salvar projeto em arquivo', () => void salvarEmArquivo()),
      campo('Abrir projeto de um arquivo', abrir),
    ),
    h('h3', {}, 'Aplicativo'),
    instalacao(),
    h('details', { className: 'explica atalhos' },
      h('summary', {}, 'Atalhos do teclado'),
      h('ul', {}, ...ATALHOS.map(([tecla, acao]) => h('li', {}, h('kbd', {}, tecla), ` ${acao}`))),
      h('p', {}, 'No computador também dá para pintar a grade arrastando o mouse, girar os botões arrastando para cima e para baixo (com Shift, devagar) e soltar um arquivo de áudio ou de projeto em qualquer lugar da janela.'),
    ),
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
  desenharProjeto();
});
window.addEventListener('appinstalled', () => {
  conviteDeInstalacao = undefined;
  desenharProjeto();
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
  if (engine.tocando && !gravando && !loop && !previa && pos >= duracao) {
    parar();
    cursor = 0;
    engine.desde = 0;
  }
  barraDeTempo.max = String(duracao);
  if (document.activeElement !== barraDeTempo || engine.tocando) barraDeTempo.value = String(Math.min(pos, duracao));
  tempo.textContent = previa ? `Ouvindo: ${GENEROS[previa].nome}`
    : loop ? `Padrão: ${projeto.padroes[padraoAtual]?.nome ?? ''}`
    : `${relogio(pos)} / ${relogio(duracao)}`;
  barraDeTempo.hidden = loop || !!previa;
  visorInfo.textContent = `${projeto.bpm} BPM · ${NOTAS[projeto.tom]} ${projeto.escala}`;
  agulhas = agulhas.filter((a) => a.isConnected);
  for (const fn of pagina === 'efeitos' ? quadrosDaVoz : pagina === 'mixer' ? quadrosDoMixer : []) fn();
  for (const a of agulhas) a.style.left = `${Math.min(100, (pos / duracao) * 100)}%`;

  // Contagem regressiva antes da gravação e nível do microfone durante ela.
  const falta = gravando ? engine.t0 - engine.ctx.currentTime : 0;
  contagemEl.textContent = falta > 0 ? String(Math.ceil(falta / (60 / projeto.bpm))) : gravando ? 'Gravando' : '';
  const entrada = medidorDeEntrada.firstElementChild as HTMLElement;
  entrada.style.width = `${Math.min(100, Math.sqrt(gravador.nivel) * 100)}%`;
  entrada.classList.toggle('estourando', gravador.nivel > 0.97);

  // Acende a coluna que está tocando, se o padrão aberto for o que está soando.
  let passoAtual = -1;
  if (engine.tocando && !previa && projeto.beat.fonte === 'padrao') {
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
  desenharTrilha();
  desenharEstilo();
  desenharBeat();
  desenharVozes();
  void desenharGravar();
  desenharMaster();
  desenharProjeto();
}

// ---------- computador: atalhos de teclado e arrastar arquivos ----------

const ATALHOS: [string, string][] = [
  ['Espaço', 'Tocar / parar'],
  ['R', 'Gravar / parar gravação'],
  ['Ctrl/⌘ + Z', 'Desfazer'],
  ['Ctrl/⌘ + Shift + Z', 'Refazer'],
  ['Ctrl/⌘ + S', 'Salvar projeto em arquivo'],
  ['Ctrl/⌘ + E', 'Exportar música (WAV)'],
  ['← →', 'Voltar / avançar 5 segundos'],
  ['Home', 'Voltar ao início'],
  ['1 a 9', 'Ir para a página'],
];

window.addEventListener('keydown', (e) => {
  // Enquanto a pessoa digita em um campo, as teclas são do campo.
  const alvo = e.target as HTMLElement;
  const digitando = alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA'
    || (alvo instanceof HTMLInputElement && !['range', 'checkbox', 'file'].includes(alvo.type));
  const comando = e.ctrlKey || e.metaKey;
  const tecla = e.key.toLowerCase();
  if (comando && tecla === 'z') {
    if (digitando) return;
    e.preventDefault();
    navegarHistorico(e.shiftKey ? 1 : -1);
  } else if (comando && tecla === 's') {
    e.preventDefault();
    void salvarEmArquivo();
  } else if (comando && tecla === 'e') {
    e.preventDefault();
    document.querySelector<HTMLButtonElement>('#exportar-wav')?.click();
  } else if (digitando || comando || e.altKey) {
    return;
  } else if (e.key === ' ') {
    e.preventDefault();
    alternarTocar();
  } else if (tecla === 'r') {
    void alternarGravacao();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (alvo instanceof HTMLInputElement) return;
    irPara(engine.posicao() + (e.key === 'ArrowLeft' ? -5 : 5));
  } else if (e.key === 'Home') {
    irPara(0);
  } else if (e.key >= '1' && e.key <= '9') {
    irParaEtapa(Number(e.key) - 1);
  }
});

// Com o foco em um botão, o navegador "clica" nele ao soltar a barra de
// espaço. Aqui o espaço é sempre tocar/parar, então esse clique é cancelado.
window.addEventListener('keyup', (e) => {
  if (e.key === ' ' && (e.target as HTMLElement).tagName === 'BUTTON') e.preventDefault();
});

async function salvarEmArquivo() {
  registrar();
  baixar(await empacotarProjeto(projeto), `${projeto.nome || 'projeto'}.estudio.json`);
}

async function abrirDeArquivo(arquivo: File) {
  try {
    parar();
    projeto = await desempacotarProjeto(await arquivo.text());
    padraoAtual = 0;
    mudou();
    desenharTudo();
    await restaurarAudio();
    void desenharGravar();
    desenharVozes();
    avisar(`Projeto "${projeto.nome}" aberto.`);
  } catch {
    avisar('Esse arquivo não é um projeto do Estúdio Aberto.');
  }
}

// Arrastar um arquivo para a janela: áudio vira o beat, .json abre o projeto.
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('soltando');
});
window.addEventListener('dragleave', () => document.body.classList.remove('soltando'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('soltando');
  const arquivo = e.dataTransfer?.files[0];
  if (!arquivo) return;
  if (arquivo.name.endsWith('.json')) void abrirDeArquivo(arquivo);
  else if (arquivo.type.startsWith('audio/')) void importarBeat(arquivo).then(() => irParaPagina('canais'));
  else avisar('Solte um arquivo de áudio (para usar como beat) ou um projeto .estudio.json.');
});

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
  desenharVozes();
  void desenharGravar();
  const beat = engine.buffers.get(projeto.beat.audioId ?? '');
  if (beat && !analise) void analisarBeat(beat);
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
