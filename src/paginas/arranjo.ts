// Página Arranjo: a música inteira na linha do tempo e a ordem dos padrões.

import { engine, estado, mudou, relogio } from '../estado.ts';
import { type Bloco, type Virada, compassosDoArranjo, duracaoDaMusica } from '../model/project.ts';
import { secArranjo } from '../moldura.ts';
import { reiniciarSeTocando } from '../transporte.ts';
import { botao, campo, explicacao, h, numero, seletor } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';
import { abrirPadrao } from './grades.ts';
import { onda } from './onda.ts';

/** Visão da música inteira: os padrões em sequência e, abaixo, onde cada voz entra. */
export function linhaDoTempo(): HTMLElement {
  const blocos = estado.projeto.beat.fonte === 'arquivo'
    ? [h('div', { className: 'bloco-padrao' }, estado.projeto.beat.nomeArquivo ?? 'Beat importado')]
    : estado.projeto.arranjo.map((b) => {
        const bloco = h('div', { className: 'bloco-padrao' + (b.padrao === estado.padraoAtual ? ' atual' : ''), title: 'Abrir este padrão' }, `${b.nome || estado.projeto.padroes[b.padrao]?.nome || '?'} ×${b.vezes}`);
        bloco.style.flexGrow = String(b.vezes);
        bloco.dataset.cor = String(b.padrao % 5);
        bloco.onclick = () => abrirPadrao(b.padrao);
        return bloco;
      });
  return h('div', { className: 'playlist' },
    h('div', { className: 'pista' }, h('span', { className: 'nome-linha' }, 'Beat'), h('div', { className: 'blocos' }, ...blocos)),
    ...estado.projeto.takes.map((take) => h('div', { className: 'pista' }, h('span', { className: 'nome-linha' }, take.nome), onda(take))),
  );
}

function campoDeNome(bloco: Bloco): HTMLElement {
  const nome = h('input', { type: 'text', value: bloco.nome ?? '', placeholder: 'Intro, Verso, Refrão...' });
  nome.onchange = () => {
    bloco.nome = nome.value;
    mudou();
    desenharBeat();
  };
  return campo('Nome do trecho', nome);
}

export function arranjo(): HTMLElement {
  const lista = h('div', { className: 'arranjo' });
  estado.projeto.arranjo.forEach((bloco, i) => {
    lista.append(h('div', { className: 'linha bloco' },
      h('span', { className: 'tempo' }, `${i + 1}.`),
      seletor('Padrão', estado.projeto.padroes.map((p, k) => [k, p.nome] as [number, string]), bloco.padrao, (v) => { bloco.padrao = v; desenharBeat(); }),
      numero('Compassos', 1, 64, bloco.vezes, (v) => { bloco.vezes = v; desenharBeat(); }),
      campoDeNome(bloco),
      seletor<Virada>('Virada no fim', [['nenhuma', 'Nenhuma'], ['subida', 'Subida'], ['crash', 'Prato ao contrário'], ['silencio', 'Silêncio']], bloco.virada ?? 'nenhuma', (v) => { bloco.virada = v; }),
      h('div', { className: 'mudos' }, ...(['bateria', 'baixo', 'melodia'] as const).map((parte) => {
        const caixa = h('input', { type: 'checkbox', checked: !bloco.mudos?.[parte] });
        caixa.onchange = () => {
          bloco.mudos = { ...bloco.mudos, [parte]: !caixa.checked };
          mudou();
        };
        return h('label', { className: 'caixa' }, caixa, { bateria: 'Bateria', baixo: '808', melodia: 'Melodia' }[parte]);
      })),
      botao('Remover', () => {
        estado.projeto.arranjo.splice(i, 1);
        mudou();
        desenharBeat();
      }, 'perigo'),
    ));
  });
  const compassos = compassosDoArranjo(estado.projeto);
  lista.append(
    botao('Montar estrutura de música', () => {
      if (!confirm('Substituir o arranjo por uma estrutura pronta (intro, versos, refrões e final)? Dá para desfazer.')) return;
      // Usa o primeiro padrão como base; os trechos se diferenciam pelo que fica mudo.
      estado.projeto.arranjo = [
        { padrao: 0, vezes: 4, nome: 'Intro', mudos: { bateria: true, baixo: true }, virada: 'subida' },
        { padrao: 0, vezes: 16, nome: 'Verso 1', mudos: { melodia: false }, virada: 'silencio' },
        { padrao: 0, vezes: 8, nome: 'Refrão', virada: 'crash' },
        { padrao: 0, vezes: 16, nome: 'Verso 2', virada: 'silencio' },
        { padrao: 0, vezes: 8, nome: 'Refrão', virada: 'nenhuma' },
        { padrao: 0, vezes: 4, nome: 'Final', mudos: { bateria: true } },
      ];
      mudou();
      desenharBeat();
    }),
    botao('+ Adicionar trecho', () => {
      estado.projeto.arranjo.push({ padrao: estado.padraoAtual, vezes: 4 });
      mudou();
      desenharBeat();
    }),
    h('p', { className: 'nota' }, `Total: ${compassos} compassos, ${relogio((compassos * 4 * 60) / estado.projeto.bpm)} de música.`),
  );
  return lista;
}

let alvoDaAutomacao = 'beat';

/**
 * Editor de automação: uma curva de volume desenhada ao longo da música,
 * para o beat ou para uma voz. Clique num lugar vazio para criar um ponto,
 * arraste para mover, clique duas vezes num ponto para apagar.
 */
function automacao(): HTMLElement {
  const p = estado.projeto;
  if (alvoDaAutomacao !== 'beat' && !p.takes.some((t) => t.id === alvoDaAutomacao)) alvoDaAutomacao = 'beat';
  const duracao = duracaoDaMusica(p, engine.buffers);
  const pontos = () => ((p.automacao ??= {})[alvoDaAutomacao] ??= []);
  const tela = h('canvas', { className: 'curva automacao', width: 900, height: 140 });
  const TOPO = 1.5;
  const x = (t: number) => (t / duracao) * tela.width;
  const y = (v: number) => tela.height - (v / TOPO) * tela.height;
  const desenhar = () => {
    const g = tela.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, tela.width, tela.height);
    g.strokeStyle = '#3a424b';
    g.fillStyle = '#7d8793';
    g.font = '11px system-ui';
    g.beginPath();
    g.moveTo(0, y(1));
    g.lineTo(tela.width, y(1));
    g.stroke();
    g.fillText('100%', 4, y(1) - 4);
    const lista = [...pontos()].sort((a, b) => a[0] - b[0]);
    g.strokeStyle = '#ff9d2e';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y(lista[0]?.[1] ?? 1));
    for (const [t, v] of lista) g.lineTo(x(t), y(v));
    g.lineTo(tela.width, y(lista[lista.length - 1]?.[1] ?? 1));
    g.stroke();
    for (const [t, v] of lista) {
      g.beginPath();
      g.arc(x(t), y(v), 7, 0, 2 * Math.PI);
      g.fillStyle = '#ff9d2e';
      g.fill();
      g.strokeStyle = '#fff';
      g.stroke();
    }
  };
  const naTela = (e: MouseEvent) => {
    const r = tela.getBoundingClientRect();
    return { t: Math.min(duracao, Math.max(0, ((e.clientX - r.left) / r.width) * duracao)), v: Math.min(TOPO, Math.max(0, (1 - (e.clientY - r.top) / r.height) * TOPO)), px: ((e.clientX - r.left) / r.width) * tela.width, py: ((e.clientY - r.top) / r.height) * tela.height };
  };
  const pertoDe = (m: { px: number; py: number }) => pontos().find(([t, v]) => Math.hypot(x(t) - m.px, y(v) - m.py) < 16);
  let preso: [number, number] | null = null;
  tela.style.touchAction = 'none';
  tela.onpointerdown = (e) => {
    const m = naTela(e);
    preso = pertoDe(m) ?? null;
    if (!preso) {
      preso = [m.t, m.v];
      pontos().push(preso);
    }
    tela.setPointerCapture(e.pointerId);
    desenhar();
  };
  tela.onpointermove = (e) => {
    if (!preso) return;
    const m = naTela(e);
    preso[0] = m.t;
    preso[1] = m.v;
    desenhar();
  };
  tela.onpointerup = () => {
    if (!preso) return;
    preso = null;
    mudou();
    reiniciarSeTocando();
  };
  tela.ondblclick = (e) => {
    const alvo = pertoDe(naTela(e));
    if (!alvo) return;
    p.automacao![alvoDaAutomacao] = pontos().filter((ponto) => ponto !== alvo);
    mudou();
    desenhar();
    reiniciarSeTocando();
  };
  desenhar();
  return h('div', {},
    h('div', { className: 'linha' },
      seletor('Volume de', [['beat', 'Beat'] as [string, string], ...p.takes.map((t) => [t.id, t.nome] as [string, string])], alvoDaAutomacao, (v) => {
        alvoDaAutomacao = v;
        desenharBeat();
      }),
      botao('Limpar a curva', () => {
        if (p.automacao) delete p.automacao[alvoDaAutomacao];
        mudou();
        desenharBeat();
        reiniciarSeTocando();
      }),
    ),
    tela,
    explicacao([
      'Automação é o volume mudando sozinho ao longo da música. A linha no meio é o volume normal (100%).',
      'Clique num lugar vazio para criar um ponto e arraste para mover; dois cliques num ponto apagam. Os pontos são ligados por retas.',
      'Usos comuns: baixar o beat no verso e subir no refrão; fazer a música entrar ou sair aos poucos; destacar uma frase da voz.',
      'A curva vale só no modo MÚSICA e entra na exportação.',
    ]),
  );
}

export function desenharArranjo() {
  const beat = estado.projeto.beat;
  secArranjo.replaceChildren(
    h('h2', {}, 'Arranjo'),
    h('p', { className: 'nota' }, 'A música inteira de uma vez: a ordem dos padrões e onde cada voz entra. Clique numa voz para ouvir a partir daquele ponto.'),
    linhaDoTempo(),
    h('h3', {}, 'Automação de volume'),
    automacao(),
    ...(beat.fonte === 'padrao' ? [
      h('h3', {}, 'Ordem dos padrões'),
      arranjo(),
      explicacao([
        'O arranjo é a ordem em que os padrões tocam para formar a música: intro, verso, refrão, pausa.',
        'Crie variações com "Duplicar" e mude pouca coisa: tirar o bumbo e o 808 por 2 compassos e devolver depois já cria impacto.',
      ]),
    ] : []),
  );
}
