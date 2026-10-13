// Montagem (comping): escolher, trecho a trecho, qual take soa.

import { engine, estado, mudou, projetoParaTocar } from '../estado.ts';
import { type Take, duracaoDaMusica, duracaoDoTrecho } from '../model/project.ts';
import { reiniciarSeTocando, trocarModo } from '../transporte.ts';
import { botao, explicacao, h, seletor } from '../ui/controles.ts';
import { desenharVozes } from './voz.ts';

/** Um take "cobre" um trecho se tem pelo menos um pouco de áudio dentro dele. */
export function cobre(take: Take, trecho: number): boolean {
  const buf = engine.buffers.get(take.audioId);
  if (!buf) return false;
  const dur = duracaoDoTrecho(estado.projeto);
  return Math.min(take.inicio + buf.duration, (trecho + 1) * dur) - Math.max(take.inicio, trecho * dur) > 0.05;
}

export const trechosDaMusica = () => Math.ceil(duracaoDaMusica(estado.projeto, engine.buffers) / duracaoDoTrecho(estado.projeto));

/** Preenche os trechos sem escolha válida com o primeiro take que tem áudio ali. */
export function preencherMontagem() {
  const m = estado.projeto.montagem;
  const participantes = estado.projeto.takes.filter((t) => t.naMontagem);
  m.escolha = Array.from({ length: trechosDaMusica() }, (_, i) => {
    const atual = participantes.find((t) => t.id === m.escolha[i]);
    if (atual && cobre(atual, i)) return atual.id;
    return m.escolha[i] === null ? null : participantes.find((t) => cobre(t, i))?.id ?? null;
  });
}

export function montagem(): HTMLElement {
  const m = estado.projeto.montagem;
  const ligada = h('input', { type: 'checkbox', checked: m.ligada });
  ligada.onchange = () => {
    m.ligada = ligada.checked;
    if (m.ligada) {
      if (!estado.projeto.takes.some((t) => t.naMontagem)) for (const t of estado.projeto.takes) t.naMontagem = true;
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
      estado.cursor = i * duracaoDoTrecho(estado.projeto);
      if (estado.modo === 'padrao') trocarModo('musica');
      if (engine.tocando && !estado.gravando) void engine.tocar(projetoParaTocar(), estado.cursor);
      else engine.desde = estado.cursor;
    }, 'passo cabeca'));
  }
  for (const take of estado.projeto.takes) {
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
