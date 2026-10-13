// Estado compartilhado do estúdio: o projeto aberto, o motor de áudio e tudo
// que as páginas precisam saber umas das outras. Este módulo não importa
// nenhuma página; são as páginas que o importam.

import { Engine } from './engine/engine.ts';
import { Gravador } from './engine/recorder.ts';
import type { AnaliseDoBeat } from './engine/tuneClient.ts';
import type { Project, Take } from './model/project.ts';
import type { PaginaId } from './moldura.ts';
import { carregarProjeto, salvarProjeto } from './storage.ts';
import { ligarMudanca } from './ui/controles.ts';
import type { Tela } from './ui/efeitos.ts';

export const engine = new Engine();
export const gravador = new Gravador(engine.ctx);

export const CHAVE_DO_MODO = 'estudio-aberto:tela';

export const estado = {
  projeto: carregarProjeto(),
  gravando: false,
  /** Ponto da música, em segundos, de onde tocar e gravar. */
  cursor: 0,
  /** Padrão aberto no editor. */
  padraoAtual: 0,
  /** 'padrao' repete só o padrão aberto (criar o beat); 'musica' toca o arranjo com as vozes. */
  modo: 'padrao' as 'padrao' | 'musica',
  /** Pincel da grade de bateria: o valor que um clique escreve no passo. */
  pincel: 1,
  /** Gênero em pré-escuta na página de estilo, se houver. */
  previa: null as string | null,
  /** Comparação "antes e depois": toca as vozes sem nenhum tratamento. */
  semEfeitos: false,
  /** Take que está sendo regravado, se a gravação atual é uma regravação. */
  regravando: undefined as Take | undefined,
  // Histórico (desfazer / refazer): cada estado do projeto guardado como texto JSON.
  historico: [] as string[],
  indice: 0,
  pendente: undefined as number | undefined,
  /** Tela simples: só o caminho principal, sem os controles finos. */
  telaSimples: localStorage.getItem(CHAVE_DO_MODO) !== 'completa',
  pagina: 'estilo' as PaginaId,
  /** Células das grades agrupadas por passo, para acender a coluna que está tocando. */
  colunas: [] as HTMLElement[][],
  /** Pintura da grade com o mouse em andamento. */
  pintura: null as { grade: HTMLElement; valor: number; definirOrigem: (v: number) => void; usada: boolean } | null,
  ignorarClique: false,
  /** O que a análise automática achou do beat importado. */
  analise: null as AnaliseDoBeat | null,
  /** Agulhas de reprodução das formas de onda visíveis. */
  agulhas: [] as HTMLElement[],
  /** Take aberto na página de voz e tela de efeito escolhida. */
  takeAberto: null as string | null,
  telaAberta: 'Afinação' as Tela,
  /** Atualizações por quadro (medidores) das páginas de voz e do mixer. */
  quadrosDaVoz: [] as (() => void)[],
  quadrosDoMixer: [] as (() => void)[],
  conviteDeInstalacao: undefined as EventoDeInstalacao | undefined,
};
estado.historico = [JSON.stringify(estado.projeto)];

/** Padrão aberto no editor. */
/** 'padrao' repete só o padrão aberto (criar o beat); 'musica' toca o arranjo com as vozes. */
/** Pincel da grade de bateria: o valor que um clique escreve no passo. */
/** Gênero em pré-escuta na tela de estilo, se houver. */
/** Comparação "antes e depois": toca as vozes sem nenhum tratamento. */
/** Take que está sendo regravado, se a gravação atual é uma regravação. */
/** Avisos de nível de cada take (voz estourada, voz baixa), por id do take. */
export const avisosDeTake = new Map<string, string>();

/** Preferências deste aparelho (não fazem parte da música). */
export const prefs = {
  contagem: localStorage.getItem('estudio-aberto:contagem') !== 'nao',
  microfone: localStorage.getItem('estudio-aberto:microfone') ?? '',
};

/**
 * O projeto como deve soar agora. Na comparação "sem efeitos", as vozes
 * perdem timbre, tune, reverb, delay e distorção; o resto é o mesmo.
 */
export function projetoParaTocar(): Project {
  if (!estado.semEfeitos) return estado.projeto;
  return {
    ...estado.projeto,
    takes: estado.projeto.takes.map((t) => ({
      ...t, preset: 'cru', reverb: 0, delay: 0, distorcao: 0, telefone: false, altura: 0, dobra: 0,
      tune: { ...t.tune, ligado: false },
      limpeza: { gate: 0, deEsser: 0 },
      eq: { corte: 20, graveDb: 0, medioHz: 3000, medioDb: 0, arDb: 0 },
      comp: { limiar: 0, razao: 1, ataque: 5, soltura: 120, ganho: 0 },
    })),
  };
}

export const id = () => Math.random().toString(36).slice(2, 10);

export const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Cada estado do projeto é guardado como texto JSON. Desfazer é voltar ao
// texto anterior. O áudio dos takes não entra aqui: fica guardado à parte.
export function registrar() {
  window.clearTimeout(estado.pendente);
  estado.pendente = undefined;
  const retrato = JSON.stringify(estado.projeto);
  if (retrato === estado.historico[estado.indice]) return;
  estado.historico = [...estado.historico.slice(Math.max(0, estado.indice - 100), estado.indice + 1), retrato];
  estado.indice = estado.historico.length - 1;
  salvarProjeto(estado.projeto);
}

/**
 * Chamado depois de qualquer mudança no projeto. Cada ação vira um passo do
 * "Desfazer"; com `agrupar` (arrastar um controle), só o valor final conta.
 */
export function mudou(agrupar = false) {
  engine.mixer.sincronizar(projetoParaTocar());
  if (!agrupar) return registrar();
  window.clearTimeout(estado.pendente);
  estado.pendente = window.setTimeout(registrar, 300);
}

/** `passos` = -1 desfaz, +1 refaz. */
ligarMudanca(mudou);

// No modo simples, a tela mostra só o caminho principal: estilo, beat do
// modelo, gravar, timbre e exportar. Os controles finos ficam escondidos.
document.body.classList.toggle('simples', estado.telaSimples);

/** Marca um elemento como avançado: ele some no modo simples. */
export function av<T extends HTMLElement>(el: T): T {
  el.classList.add('avancado');
  return el;
}

/** Marca um elemento como exclusivo do modo simples. */
export function so<T extends HTMLElement>(el: T): T {
  el.classList.add('so-simples');
  return el;
}

/** Com que ajustes cada take foi afinado por último, para não refazer à toa. */
export const afinadoCom = new Map<string, string>();

export interface EventoDeInstalacao extends Event {
  prompt(): Promise<void>;
}
