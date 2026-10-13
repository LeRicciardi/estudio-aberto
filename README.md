# Estúdio Aberto

Estúdio de música aberto, no navegador, para artistas independentes que gravam voz em cima de beats: criar ou importar o beat, gravar, afinar, mixar, masterizar e exportar.

O código é escrito para ser lido. Cada mecanismo de áudio está em um arquivo pequeno, comentado em português, explicando o que faz e por quê. A interface repete essas explicações em "O que isso faz?".

**Abrir o estúdio: https://lericciardi.github.io/estudio-aberto/**

No celular, abra o endereço no navegador e use "Instalar aplicativo" (Android) ou Compartilhar → "Adicionar à Tela de Início" (iPhone).

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço que aparecer (por padrão `http://localhost:5173`). Use fone de ouvido para gravar.

```bash
npm test
```

Roda os testes do motor sem navegador: tune, limitador, medidor LUFS, medição de atraso, análise de BPM e tom, redução de ruído, gate, nivelamento, de-esser, espaço para a voz, diagnóstico da mix, etiquetas, zip, conferência do arquivo, andamento, corte de loops e afinação.

```bash
npm run publicar
```

Gera o build e publica no GitHub Pages (ramo `gh-pages`).

## O que já existe

A tela é organizada como uma estação de trabalho: barra de transporte no topo (tocar, gravar, visor de tempo, BPM e tom, medidor) e uma página para cada parte do trabalho.

| Página | O que faz |
|---|---|
| Estilo | Cartões de gênero com prévia: boombap, trap, plug, love song, drill, hard/trash, funk, mandelão, bruxaria. Cada um traz andamento, balanço, kit, timbre de voz e padrão de partida |
| Beat | Grade de bateria em 16 passos com rolos e notas fracas, 7 kits sintetizados, 20 samples prontos ou samples próprios; três volumes por nota e ajuste de volume, lado e balanço por som; ou importação de um beat pronto, com sugestão de BPM e tom |
| Notas | Sampler (loop cortado em fatias que a grade dispara), 808 em grade de notas com deslize (sintetizado ou por sample próprio afinado) e melodia com instrumentos prontos ou um sintetizador próprio (onda, filtro, envelope), teclado na tela, acordes e arpejo, tudo preso à escala da música |
| Arranjo | Linha do tempo com os padrões em sequência e a forma de onda de cada voz; trechos com nome, partes mudas e virada; estrutura de música pronta; automação de volume desenhada para o beat e para cada voz |
| Letra | Letra presa aos compassos do beat (uma linha por compasso), com sílabas aproximadas; aparece na tela e acompanha a música ao gravar |
| Gravar | Gravação em laço (cada volta vira um take), teste do lugar de gravação (ruído e eco), importação de voz já gravada (WhatsApp, gravador), gravação em PCM sem compressão, contagem de 4, medidor e escolha do microfone, regravar um trecho, medição do atraso do aparelho, aviso de voz estourada ou baixa |
| Voz | Pedaleira em que cada efeito é um pedal com chave de pé, e uma tela por ferramenta, com botões giratórios: afinação (tune), equalizador com curva, compressor com medidor de redução, espaço (reverb, delay, dobra estéreo, chorus), caráter (timbre, distorção, telefone), limpeza (redução de ruído, gate, nivelamento por frase e de-esser) e edição (aparar, fades, ganho). "Ajustar ao meu take" mede a gravação e regula tudo; há compressão dupla e paralela, harmonia automática, eco só no fim da frase e papéis de principal, dobra e adlib; presets próprios da cadeia. Montagem do melhor de cada take, comparação com e sem efeitos e conferência do equilíbrio com o beat |
| Mixer | Uma faixa por canal (bateria, 808, melodia, beat, cada voz, master) com medidor, volume, lado, mudo e solo. O beat abre espaço sozinho quando a voz entra |
| Master | Botão grande de volume final, analisador de espectro ao vivo, acabamento (compressor de cola, multibanda, ganho, limitador de pico real), equalizador de 3 bandas, largura do estéreo, volume final em LUFS; diagnóstico da mix, que mede, explica e corrige; escuta em mono e em caixa de celular; exportação em WAV, MP3, acapella e instrumental, com BPM e tom no nome do arquivo |
| Lançar | Dados da música, ficha da licença do beat, conferência do áudio e da capa, pacote .zip com WAV, MP3 com etiquetas, acapella, instrumental, versão para DJ, versão limpa, versão em outro andamento e faixas separadas; vídeo vertical para divulgar |
| Projeto | Exportação das notas em MIDI; recuperação de gravação interrompida, espaço usado, diagnóstico para copiar; enviar o projeto e juntar as vozes de um parceiro; salvamento automático, versões guardadas, arquivo único com projeto e áudio, instalação como aplicativo, atalhos |

A **tela simples** mostra só Estilo, Beat, Letra, Gravar, Voz, Master, Lançar e Projeto, com controles por intenção (afinação em 4 níveis, perto ↔ longe, seca ↔ com eco). "Mostrar tudo" abre as demais páginas e as telas de cada ferramenta.

No computador há atalhos de teclado, pintura da grade com o mouse e arrastar arquivos para a janela. Desfazer e refazer valem para tudo.

## Como o código está organizado

```
src/
  model/
    project.ts          O projeto como dados: tudo que define uma música
    generos.ts          Modelos por gênero, escritos como dados
  engine/               Motor de áudio (não conhece a interface)
    tempo.ts            Passos, swing e o relógio do sequenciador
    synths.ts           Síntese: kits de bateria, 808, instrumentos
    vocalChain.ts       Cadeia de voz: equalizador, compressor, saturação, dobra, reverb, delay
    limpeza.ts          Redução de ruído, gate, nivelamento por frase e de-esser
    fft.ts              Transformada de Fourier
    tempo-e-fatias.ts   Andamento sem mudar o tom, corte de loops e medição de afinação
    entrega.ts          Etiquetas ID3, zip e conferência do arquivo final
    tune.ts             Tune: detecção de pitch (YIN) e correção (TD-PSOLA)
    tune.worker.ts      Limpeza, tune e análise fora da thread da tela
    espaco.ts           Curva para o beat ceder espaço à voz
    mixer.ts            Mesa de mixagem, master e modos de escuta
    limiter.ts          Limitador de pico com antecipação
    loudness.ts         Medidor LUFS (ITU-R BS.1770)
    diagnostico.ts      Diagnóstico da mix e notação Camelot
    analise.ts          BPM e tom de um beat, nível de uma gravação
    latencia.ts         Medição do atraso de gravação
    recorder.ts         Captura do microfone
    engine.ts           Reprodução ao vivo e exportação
  ui/                   Peças de interface reutilizáveis
    controles.ts        Campos, botões e o botão giratório
    efeitos.ts          Telas de efeito de um take
    mesa.ts             Faixas do mixer
  paginas/              Uma página por arquivo
    estilo.ts  beat.ts  notas.ts  arranjo.ts  letra.ts  gravar.ts
    voz.ts  mixer.ts  master.ts  lancar.ts  projeto.ts
    grades.ts           Grades de passos e de notas, usadas por Beat e Notas
    onda.ts             Forma de onda de um take
    montagem.ts         Montagem do melhor de cada take
    diagnostico.ts      Painel do diagnóstico da mix
  estado.ts             Estado compartilhado: projeto aberto, motor, histórico
  moldura.ts            Elementos fixos da tela e a lista de páginas
  transporte.ts         Tocar, parar, navegar e o laço de atualização da tela
  atalhos.ts            Teclado e arrastar arquivos
  midi.ts               Teclado MIDI
  arquivo.ts            Abrir e salvar projeto, restaurar áudio
  storage.ts            Salvamento local, versões e arquivo de projeto
  main.ts               Ponto de entrada
public/captura.worklet.js   Captura de áudio na thread de áudio
public/sw.js                Guarda o aplicativo no aparelho para abrir sem internet
docs/pesquisa.md        Primeira pesquisa: dores, referências e decisões técnicas
docs/roteiro.md         Pesquisa ampliada e prioridades do que falta
```

O motor (`engine/`) não conhece a interface. A mesma mesa de mixagem toca ao vivo e exporta.

Para acrescentar ou corrigir um gênero, edite `src/model/generos.ts`: cada modelo é um bloco de dados com o padrão escrito em texto (`x......x..x.....`).

## Princípios

- **Implementação própria.** Nada aqui vem de engenharia reversa de software fechado. Os mecanismos são técnicas públicas de áudio digital, implementadas do zero. O que observamos em outros programas é só o comportamento visível ao usuário e a documentação pública.
- **Ensinar enquanto produz.** Todo recurso explica o que faz.
- **Leve.** Roda no navegador, sem instalação, pensado para notebook simples e celular.

## Atalhos do teclado

| Tecla | Ação |
|---|---|
| Espaço | Tocar / parar |
| R | Gravar / parar gravação |
| Ctrl/⌘ + Z, Ctrl/⌘ + Shift + Z | Desfazer, refazer |
| Ctrl/⌘ + S | Salvar projeto em arquivo |
| Ctrl/⌘ + E | Exportar música (WAV) |
| ← → | Voltar / avançar 5 segundos |
| Home | Voltar ao início |
| 1 a 9 e 0 | Ir para a página |

## Limites atuais

- A sugestão de BPM e tom do beat é uma estimativa: foi testada com sinais sintéticos, não com um conjunto de beats reais. O BPM pode sair na metade ou no dobro, e por isso as duas opções são oferecidas.
- O teclado MIDI foi escrito sem um controlador para testar, e não funciona no Safari nem no iPhone. Não há suporte a plugins (VST, CLAP).
- Com o aplicativo instalado no celular, ele aparece no "compartilhar" para receber áudio; isso foi testado no computador, não em um celular.
- O vídeo vertical sai em MP4 só nos navegadores que gravam MP4; nos outros sai em WebM.

- O tune é aplicado depois da gravação, não ao vivo durante o canto. É uma escolha: no navegador, efeito ao vivo aumenta o atraso.
- Os modelos de funk, mandelão e bruxaria são aproximações e precisam ser corrigidos por quem é da cena.
- Os samples prontos de caixa, palma e chimbal são de bateria acústica, não de bateria eletrônica. Não há sample pronto de 808 (nenhum com licença de domínio público verificável); o 808 aceita sample do usuário. A melodia ainda não aceita samples.
- A altura da voz preserva o timbre (formantes): não faz o efeito de voz "de esquilo".
- Cada padrão tem um compasso; frases mais longas são feitas alternando padrões no arranjo.
- Ao vivo, o limitador é aproximado por um compressor; o limitador de pico real e o ajuste de volume final só entram na exportação. Com alvos altos (-11 LUFS), o limitador pode segurar a música um pouco abaixo do alvo.
- O visual segue a organização comum das estações de trabalho de áudio (transporte, grade de canais, grade de notas, arranjo, mixer). Não usa imagens, ícones nem código de nenhum outro programa.
- O diagnóstico da mix usa limiares fixos, calibrados com sinais sintéticos; ainda não foi comparado com mixes reais.
- A contagem de sílabas da letra é aproximada (grupos de vogais), não uma escansão poética.
- A montagem de takes corta em limites de compasso (1, 2 ou 4); não há corte livre dentro do take.
- O compressor é o do navegador, que compensa o ganho sozinho; não há mandadas e retornos, e a automação cobre só o volume. A lista do que separa o estúdio de um programa profissional está em `docs/roteiro.md`.
- Não há colaboração em nuvem; a troca é pelo arquivo de projeto.
- Não foi testado em iPhone nem em Android de entrada. Os riscos conhecidos estão em `docs/pesquisa.md`.

## Licença

[MIT](LICENSE). Pode usar, modificar e redistribuir, inclusive em produtos fechados, mantendo o aviso de copyright.

Os samples em `public/samples` são CC0 (domínio público); a origem de cada arquivo está em [public/samples/ORIGEM.md](public/samples/ORIGEM.md).

A exportação em MP3 usa [`wasm-media-encoders`](https://github.com/arseneyr/wasm-media-encoders) (MIT), que embute o codificador LAME, distribuído sob LGPL. Ele é carregado como módulo separado, só quando se exporta MP3.
