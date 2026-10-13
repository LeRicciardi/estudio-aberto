// Transporte e navegação: tocar, parar, trocar de página, desfazer/refazer e
// o laço que atualiza a tela a cada quadro.

import { duracaoDoPasso } from './engine/tempo.ts';
import { CHAVE_DO_MODO, av, engine, estado, gravador, projetoParaTocar, registrar, relogio } from './estado.ts';
import { GENEROS } from './model/generos.ts';
import { NOTAS, type Project, duracaoDaMusica, localizarPasso, passosDoPadrao } from './model/project.ts';
import { PAGINAS, type PaginaId, barraDeTempo, botaoGravar, botaoTocar, contagemEl, etapaDeBeat, medidor, medidorDeEntrada, paginasVisiveis, rodape, secTransporte, tempo, trilha, visorInfo } from './moldura.ts';
import { desenharBeat } from './paginas/beat.ts';
import { desenharEstilo } from './paginas/estilo.ts';
import { desenharGravar } from './paginas/gravar.ts';
import { desenharLancar } from './paginas/lancar.ts';
import { atualizarTeleprompter, desenharLetra, desenharTeleprompter } from './paginas/letra.ts';
import { desenharMaster } from './paginas/master.ts';
import { desenharMixer } from './paginas/mixer.ts';
import { desenharProjeto } from './paginas/projeto.ts';
import { desenharVozes, reafinarTodos } from './paginas/voz.ts';
import { salvarProjeto } from './storage.ts';
import { botao, h } from './ui/controles.ts';

export function navegarHistorico(passos: number) {
  registrar();
  const novoIndice = estado.indice + passos;
  if (novoIndice < 0 || novoIndice >= estado.historico.length) return;
  estado.indice = novoIndice;
  estado.projeto = JSON.parse(estado.historico[estado.indice]) as Project;
  salvarProjeto(estado.projeto);
  estado.padraoAtual = Math.min(estado.padraoAtual, estado.projeto.padroes.length - 1);
  engine.mixer.sincronizar(projetoParaTocar());
  desenharTudo();
  void reafinarTodos();
  reiniciarSeTocando();
}

export function trocarTela() {
  estado.telaSimples = !estado.telaSimples;
  localStorage.setItem(CHAVE_DO_MODO, estado.telaSimples ? 'simples' : 'completa');
  document.body.classList.toggle('simples', estado.telaSimples);
  if (engine.tocando && !estado.gravando) parar();
  irParaPagina(estado.pagina);
}

export function irParaPagina(destino: PaginaId) {
  if (engine.tocando && !estado.gravando && estado.telaSimples) parar();
  estado.pagina = paginasVisiveis().some((p) => p.id === destino) ? destino : 'estilo';
  sessionStorage.setItem('estudio-aberto:pagina', estado.pagina);
  if (estado.telaSimples) estado.modo = etapaDeBeat() ? 'padrao' : 'musica';
  // Estas páginas mostram valores que podem ter mudado em outra página.
  if (estado.pagina === 'mixer') desenharMixer();
  if (estado.pagina === 'efeitos') desenharVozes();
  if (estado.pagina === 'arranjo') desenharBeat();
  desenharTransporte();
  desenharTrilha();
  window.scrollTo({ top: 0 });
}

/** Avança ou volta na ordem das páginas visíveis. */
export function irParaEtapa(i: number) {
  const visiveis = paginasVisiveis();
  if (visiveis[i]) irParaPagina(visiveis[i].id);
}

export function desenharTrilha() {
  const visiveis = paginasVisiveis();
  for (const p of PAGINAS) p.secao.classList.toggle('ativa', p.id === estado.pagina);
  trilha.replaceChildren(...visiveis.map((p, i) => Object.assign(botao(p.nome, () => irParaPagina(p.id), p.id === estado.pagina ? 'ativo' : ''), { title: `Página ${i + 1}` })));
  const atual = visiveis.findIndex((p) => p.id === estado.pagina);
  const voltar = botao('← Voltar', () => irParaEtapa(atual - 1));
  voltar.disabled = atual <= 0;
  const proxima = visiveis[atual + 1];
  rodape.replaceChildren(voltar, proxima ? botao(`Avançar: ${proxima.nome} →`, () => irParaEtapa(atual + 1), 'principal') : h('span'));
}

export function desenharTransporte() {
  const modos = h('div', { className: 'abas' },
    Object.assign(botao('PAD', () => trocarModo('padrao'), estado.modo === 'padrao' ? 'ativo' : ''), { title: 'Tocar só o padrão aberto, em repetição' }),
    Object.assign(botao('MÚSICA', () => trocarModo('musica'), estado.modo === 'musica' ? 'ativo' : ''), { title: 'Tocar a música inteira, com as vozes' }),
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
      botao(estado.telaSimples ? 'Mostrar tudo' : 'Tela simples', trocarTela, estado.telaSimples ? '' : 'ativo'),
    ),
  );
}

export function trocarModo(novo: 'padrao' | 'musica') {
  if (estado.gravando) return;
  const tocava = engine.tocando;
  parar();
  estado.modo = novo;
  estado.cursor = 0;
  engine.desde = 0;
  desenharTransporte();
  if (tocava) void tocar();
}

export async function tocar() {
  if (emLoop()) {
    await engine.tocar(projetoParaTocar(), 0, estado.padraoAtual);
  } else {
    if (estado.cursor >= duracaoDaMusica(estado.projeto, engine.buffers) - 0.05) estado.cursor = 0;
    await engine.tocar(projetoParaTocar(), estado.cursor);
  }
  botaoTocar.textContent = '■ Parar';
}

export function emLoop() {
  return (estado.modo === 'padrao' || (estado.telaSimples && etapaDeBeat())) && estado.projeto.beat.fonte === 'padrao' && !estado.gravando;
}

export function reiniciarSeTocando() {
  if (!engine.tocando || estado.gravando || estado.previa) return;
  if (emLoop()) void engine.tocar(projetoParaTocar(), engine.posicao() % (duracaoDoPasso(estado.projeto.bpm) * passosDoPadrao(estado.projeto.padroes[estado.padraoAtual])), estado.padraoAtual);
  else void engine.tocar(projetoParaTocar(), engine.posicao());
}

export function parar() {
  estado.cursor = emLoop() || estado.previa ? 0 : Math.min(engine.posicao(), duracaoDaMusica(estado.projeto, engine.buffers));
  engine.parar();
  engine.desde = estado.cursor;
  botaoTocar.textContent = '▶ Tocar';
  if (estado.previa) {
    estado.previa = null;
    engine.mixer.sincronizar(projetoParaTocar());
    desenharEstilo();
  }
}

export function alternarTocar() {
  if (estado.gravando) return;
  if (engine.tocando) parar();
  else void tocar();
}

botaoTocar.onclick = alternarTocar;

barraDeTempo.oninput = () => irPara(Number(barraDeTempo.value));

/** Leva o cursor a um ponto da música e, se estiver tocando, continua de lá. */
export function irPara(segundos: number) {
  estado.cursor = Math.max(0, segundos);
  if (engine.tocando && !estado.gravando) void engine.tocar(projetoParaTocar(), estado.cursor);
  else engine.desde = estado.cursor;
}

export function quadro() {
  const duracao = duracaoDaMusica(estado.projeto, engine.buffers);
  const pos = engine.posicao();
  const loop = emLoop();
  if (engine.tocando && !estado.gravando && !loop && !estado.previa && pos >= duracao) {
    parar();
    estado.cursor = 0;
    engine.desde = 0;
  }
  barraDeTempo.max = String(duracao);
  if (document.activeElement !== barraDeTempo || engine.tocando) barraDeTempo.value = String(Math.min(pos, duracao));
  tempo.textContent = estado.previa ? `Ouvindo: ${GENEROS[estado.previa].nome}`
    : loop ? `Padrão: ${estado.projeto.padroes[estado.padraoAtual]?.nome ?? ''}`
    : `${relogio(pos)} / ${relogio(duracao)}`;
  barraDeTempo.hidden = loop || !!estado.previa;
  visorInfo.textContent = `${estado.projeto.bpm} BPM · ${NOTAS[estado.projeto.tom]} ${estado.projeto.escala}`;
  estado.agulhas = estado.agulhas.filter((a) => a.isConnected);
  if (estado.pagina === 'gravar' && !loop) atualizarTeleprompter(pos);
  for (const fn of estado.pagina === 'efeitos' ? estado.quadrosDaVoz : estado.pagina === 'mixer' ? estado.quadrosDoMixer : estado.pagina === 'master' ? estado.quadrosDoMaster : []) fn();
  for (const a of estado.agulhas) a.style.left = `${Math.min(100, (pos / duracao) * 100)}%`;

  // Contagem regressiva antes da gravação e nível do microfone durante ela.
  const falta = estado.gravando ? engine.t0 - engine.ctx.currentTime : 0;
  contagemEl.textContent = falta > 0 ? String(Math.ceil(falta / (60 / estado.projeto.bpm))) : estado.gravando ? 'Gravando' : '';
  const entrada = medidorDeEntrada.firstElementChild as HTMLElement;
  entrada.style.width = `${Math.min(100, Math.sqrt(gravador.nivel) * 100)}%`;
  entrada.classList.toggle('estourando', gravador.nivel > 0.97);

  // Acende a coluna que está tocando, se o padrão aberto for o que está soando.
  let passoAtual = -1;
  if (engine.tocando && !estado.previa && estado.projeto.beat.fonte === 'padrao') {
    const passo = Math.floor(pos / duracaoDoPasso(estado.projeto.bpm));
    const aberto = estado.projeto.padroes[estado.padraoAtual];
    const local = loop ? undefined : localizarPasso(estado.projeto, passo);
    if (loop && aberto) passoAtual = passo % passosDoPadrao(aberto);
    else if (local?.padrao === aberto) passoAtual = local.s;
  }
  estado.colunas.forEach((celulas, i) => celulas.forEach((c) => c.classList.toggle('atual', i === passoAtual)));

  const db = engine.tocando ? engine.picoDb() : -60;
  const barra = medidor.firstElementChild as HTMLElement;
  barra.style.width = `${Math.max(0, Math.min(100, ((db + 48) / 48) * 100))}%`;
  barra.classList.toggle('estourando', db > -1);
  requestAnimationFrame(quadro);
}

export function desenharTudo() {
  desenharTransporte();
  desenharTrilha();
  desenharEstilo();
  desenharBeat();
  desenharLetra();
  desenharTeleprompter();
  desenharVozes();
  void desenharGravar();
  desenharMaster();
  desenharLancar();
  desenharProjeto();
}
