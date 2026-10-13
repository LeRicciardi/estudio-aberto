// Página Notas: 808 e melodia em grade de notas.

import { INSTRUMENTOS } from '../engine/synths.ts';
import { engine, estado, id, mudou } from '../estado.ts';
import { type InstrumentoId, NOTAS, STEPS } from '../model/project.ts';
import { avisar, secNotas } from '../moldura.ts';
import { guardarAudio } from '../storage.ts';
import { botao, deslizante, explicacao, h, opcoes, seletor } from '../ui/controles.ts';
import { desenharBeat } from './beat.ts';
import { abasDePadrao, gradeDeNotas } from './grades.ts';

/** Trocar o 808 sintetizado por um sample do usuário, afinado pela nota em que foi gravado. */
export function sample808(): HTMLElement {
  const atual = estado.projeto.sample808;
  const arquivo = h('input', { type: 'file', accept: 'audio/*', ariaLabel: 'Sample de 808' });
  arquivo.onchange = async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    try {
      const buffer = await engine.ctx.decodeAudioData(await f.arrayBuffer());
      if (buffer.duration > 10) return avisar('Esse arquivo é longo demais para um 808 (máximo de 10 segundos).');
      const audioId = id();
      engine.buffers.set(audioId, buffer);
      estado.projeto.sample808 = { audioId, nome: f.name, nota: 0 };
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
            delete estado.projeto.sample808;
            mudou();
            desenharBeat();
          }),
        )
      : arquivo,
  );
}

export function desenharNotas() {
  if (estado.projeto.beat.fonte === 'arquivo') {
    secNotas.replaceChildren(h('h2', {}, 'Notas'), h('p', { className: 'nota' }, 'Esta página edita o 808 e a melodia de um beat criado aqui. Com um beat importado, ela não é usada.'));
    return;
  }
  const padrao = estado.projeto.padroes[estado.padraoAtual];
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

  secNotas.replaceChildren(
    h('h2', {}, 'Notas'),
    abasDePadrao(),
    h('h3', {}, '808'),
    deslizante('Volume', 0, 1.2, 0.01, estado.projeto.volumes.baixo, (v) => { estado.projeto.volumes.baixo = v; }),
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
      seletor<InstrumentoId>('Instrumento', opcoes(INSTRUMENTOS, (k) => INSTRUMENTOS[k]), estado.projeto.instrumento, (v) => { estado.projeto.instrumento = v; }),
      deslizante('Volume', 0, 1.2, 0.01, estado.projeto.volumes.melodia, (v) => { estado.projeto.volumes.melodia = v; }),
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
