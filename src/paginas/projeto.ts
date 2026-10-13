// Página Projeto: arquivo, instalação como aplicativo e atalhos.

import { abrirDeArquivo, restaurarAudio, salvarEmArquivo } from '../arquivo.ts';
import { ATALHOS } from '../atalhos.ts';
import { type EventoDeInstalacao, engine, estado, mudou } from '../estado.ts';
import { novoProjeto } from '../model/generos.ts';
import { avisar, secProjeto } from '../moldura.ts';
import { abrirVersao, apagarAudio, empacotarProjeto, espaco, guardarVersao, juntarVozes, listarVersoes } from '../storage.ts';
import { desenharTudo, parar } from '../transporte.ts';
import { botao, campo, h } from '../ui/controles.ts';

const listaDeVersoes = h('div', { className: 'versoes' });

async function desenharVersoes() {
  const versoes = await listarVersoes();
  listaDeVersoes.replaceChildren(...versoes.map((v) => h('div', { className: 'linha' },
    h('span', {}, `${new Date(v.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${v.nome}`),
    botao('Voltar para esta', async () => {
      if (!confirm('Voltar para esta versão? A música atual é guardada como uma versão antes.')) return;
      await guardarVersao(estado.projeto, 'Antes de voltar');
      parar();
      estado.projeto = abrirVersao(v);
      estado.padraoAtual = 0;
      mudou();
      desenharTudo();
      await restaurarAudio();
    }),
    botao('Apagar', () => void apagarAudio(v.chave).then(desenharVersoes), 'perigo'),
  )));
}

/** Usa o "compartilhar" do aparelho (WhatsApp, e-mail...) quando existe; senão, baixa o arquivo. */
async function enviarProjeto() {
  const arquivo = new File([await empacotarProjeto(estado.projeto)], `${estado.projeto.nome || 'projeto'}.estudio.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [arquivo] })) await navigator.share({ files: [arquivo], title: estado.projeto.nome }).catch(() => {});
  else await salvarEmArquivo();
}

const armazenamento = h('p', { className: 'nota' });

async function desenharEspaco() {
  const e = await espaco();
  armazenamento.textContent = e
    ? `Em uso: ${e.usado.toFixed(0)} MB de ${e.total > 1024 ? `${(e.total / 1024).toFixed(1)} GB` : `${e.total.toFixed(0)} MB`} disponíveis. ${e.protegido ? 'O navegador marcou estes dados como protegidos contra limpeza automática.' : 'O navegador ainda não marcou estes dados como protegidos; usar o estúdio com frequência ou instalar o aplicativo ajuda.'}`
    : '';
}

/** Junta as informações do aparelho que ajudam a investigar um problema, para colar numa mensagem. */
async function copiarDiagnostico() {
  const e = await espaco();
  const ctx = engine.ctx;
  const linhas = [
    'Estúdio Aberto: diagnóstico',
    `Navegador: ${navigator.userAgent}`,
    `Tela: ${innerWidth} × ${innerHeight}, toque: ${navigator.maxTouchPoints > 0 ? 'sim' : 'não'}, instalado: ${matchMedia('(display-mode: standalone)').matches ? 'sim' : 'não'}`,
    `Áudio: ${ctx.sampleRate} Hz, atraso de saída ${Math.round(((ctx.outputLatency || 0) + ctx.baseLatency) * 1000)} ms, atraso medido ${estado.projeto.latenciaMs ?? 'não medido'} ms`,
    `Memória do aparelho: ${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? '?'} GB, núcleos: ${navigator.hardwareConcurrency ?? '?'}`,
    `Espaço: ${e ? `${e.usado.toFixed(0)} MB de ${e.total.toFixed(0)} MB, protegido: ${e.protegido ? 'sim' : 'não'}` : 'desconhecido'}`,
    `MIDI: ${'requestMIDIAccess' in navigator ? 'disponível' : 'indisponível'}, compartilhar arquivos: ${'canShare' in navigator ? 'sim' : 'não'}`,
    `Projeto: ${estado.projeto.takes.length} takes, ${estado.projeto.padroes.length} padrões, beat ${estado.projeto.beat.fonte}`,
  ];
  await navigator.clipboard.writeText(linhas.join('\n')).then(() => avisar('Diagnóstico copiado. Cole na mensagem ao relatar um problema.'), () => avisar(linhas.join(' | ')));
}

export function desenharProjeto() {
  void desenharVersoes();
  void desenharEspaco();
  const parceiro = h('input', { type: 'file', accept: '.json,application/json' });
  parceiro.onchange = async () => {
    const arquivo = parceiro.files?.[0];
    if (!arquivo) return;
    try {
      const quantas = await juntarVozes(await arquivo.text(), estado.projeto, 'parceiro');
      mudou();
      await restaurarAudio();
      desenharTudo();
      avisar(quantas ? `${quantas} voz(es) do parceiro entraram no projeto.` : 'Esse arquivo não trouxe nenhuma voz nova.');
    } catch {
      avisar('Esse arquivo não é um projeto do Estúdio Aberto.');
    }
  };
  const abrir = h('input', { type: 'file', accept: '.json,application/json' });
  abrir.onchange = () => abrir.files?.[0] && void abrirDeArquivo(abrir.files[0]);
  secProjeto.replaceChildren(
    h('h2', {}, 'Projeto'),
    h('p', { className: 'nota' }, 'O projeto é salvo sozinho neste navegador. Salve em arquivo para guardar cópia, trocar de aparelho ou mandar para alguém gravar junto.'),
    h('div', { className: 'linha' },
      botao('Salvar projeto em arquivo', () => void salvarEmArquivo()),
      campo('Abrir projeto de um arquivo', abrir),
    ),
    h('h3', {}, 'Trabalhar com outra pessoa'),
    h('p', { className: 'nota' }, 'Mande o arquivo do projeto para o parceiro. Ele abre, grava a parte dele e devolve o arquivo. Aqui você junta as vozes dele às suas, sem perder nada do seu lado.'),
    h('div', { className: 'linha' },
      botao('Enviar o projeto', () => void enviarProjeto()),
      campo('Juntar as vozes do arquivo de um parceiro', parceiro),
    ),
    h('h3', {}, 'Segurança dos seus dados'),
    armazenamento,
    h('p', { className: 'nota' }, 'Tudo fica só neste aparelho, dentro do navegador. Limpar os dados do navegador apaga os projetos; no iPhone, o Safari pode apagar dados de sites que ficam uma semana sem uso (instalar o aplicativo evita isso). Salve em arquivo o que for importante.'),
    botao('Copiar diagnóstico do aparelho', () => void copiarDiagnostico()),
    h('h3', {}, 'Versões'),
    h('p', { className: 'nota' }, 'Guarde um retrato da música antes de mexer em algo arriscado. Cada exportação também guarda uma versão. Ficam neste navegador, até 15.'),
    botao('Guardar versão agora', () => void guardarVersao(estado.projeto, 'Manual').then(desenharProjeto)),
    listaDeVersoes,
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
      estado.projeto = novoProjeto(estado.projeto.genero);
      estado.padraoAtual = 0;
      estado.cursor = 0;
      engine.desde = 0;
      mudou();
      desenharTudo();
    }, 'perigo'),
  );
}

// O Chrome (Android e computador) avisa quando o site pode ser instalado.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  estado.conviteDeInstalacao = e as EventoDeInstalacao;
  desenharProjeto();
});

window.addEventListener('appinstalled', () => {
  estado.conviteDeInstalacao = undefined;
  desenharProjeto();
});

export function instalacao(): HTMLElement {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return h('p', { className: 'nota' }, 'Você está usando o aplicativo instalado. Ele abre mesmo sem internet.');
  }
  if (estado.conviteDeInstalacao) {
    return h('div', {},
      h('p', { className: 'nota' }, 'Instale para abrir pela tela inicial, usar sem internet e proteger seus projetos de serem apagados pelo navegador.'),
      botao('Instalar aplicativo', () => void estado.conviteDeInstalacao?.prompt()),
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
