// Abrir e salvar: arquivo de projeto e restauração do áudio guardado no navegador.

import { engine, estado, mudou, registrar } from './estado.ts';
import { PREFIXO_DE_FABRICA, idsDeAudio } from './model/project.ts';
import { avisar } from './moldura.ts';
import { analisarBeat, aplicarAndamento, carregarDeFabrica, importarBeat } from './paginas/beat.ts';
import { desenharGravar, importarVoz } from './paginas/gravar.ts';
import { prepararSampler } from './paginas/notas.ts';
import { desenharVozes, reafinarTodos } from './paginas/voz.ts';
import { apagarAudio, audiosEmUso, desempacotarProjeto, empacotarProjeto, lerAudio, listarAudios } from './storage.ts';
import { desenharTudo, irParaPagina, parar } from './transporte.ts';
import { baixar } from './ui/controles.ts';

export async function salvarEmArquivo() {
  registrar();
  baixar(await empacotarProjeto(estado.projeto), `${estado.projeto.nome || 'projeto'}.estudio.json`);
}

export async function abrirDeArquivo(arquivo: File) {
  try {
    parar();
    estado.projeto = await desempacotarProjeto(await arquivo.text());
    estado.padraoAtual = 0;
    mudou();
    desenharTudo();
    await restaurarAudio();
    void desenharGravar();
    desenharVozes();
    avisar(`Projeto "${estado.projeto.nome}" aberto.`);
  } catch {
    avisar('Esse arquivo não é um projeto do Estúdio Aberto.');
  }
}

export async function restaurarAudio() {
  for (const audioId of idsDeAudio(estado.projeto)) {
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
  prepararSampler(false);
  await aplicarAndamento();
  const beat = engine.buffers.get(estado.projeto.beat.audioId ?? '');
  if (beat && !estado.analise) void analisarBeat(beat);
  await reafinarTodos();
}

/**
 * Apagar um take não apaga o áudio na hora (para o "Desfazer" funcionar).
 * A limpeza acontece aqui, ao abrir a página: sai o áudio que nenhum take usa.
 */
export async function limparAudioSemUso() {
  const usados = await audiosEmUso(estado.projeto);
  for (const chave of await listarAudios()) if (!usados.has(String(chave))) await apagarAudio(String(chave));
}

/**
 * Recolhe um áudio que chegou pelo "compartilhar" do celular (guardado pelo
 * service worker). Áudio longo vira o beat; curto, um take de voz.
 */
export async function receberCompartilhado() {
  if (!new URLSearchParams(location.search).has('recebido')) return;
  history.replaceState(null, '', location.pathname);
  try {
    const guardado = await caches.open('estudio-aberto-recebido');
    const resposta = await guardado.match('recebido');
    if (!resposta) return;
    const nome = decodeURIComponent(resposta.headers.get('x-nome') ?? 'audio');
    const arquivo = new File([await resposta.blob()], nome, { type: resposta.headers.get('content-type') ?? '' });
    await guardado.delete('recebido');
    // Mais de um minuto e ainda sem beat: quase certamente é um beat. Senão, é voz.
    const duracao = (await engine.ctx.decodeAudioData(await arquivo.arrayBuffer())).duration;
    if (duracao > 60 && !estado.projeto.beat.audioId) {
      await importarBeat(arquivo);
      irParaPagina('canais');
    } else {
      await importarVoz(arquivo);
      irParaPagina('gravar');
    }
  } catch {
    avisar('Não consegui abrir o áudio recebido.');
  }
}
