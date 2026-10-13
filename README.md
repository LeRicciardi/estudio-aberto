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

Roda os testes do motor sem navegador: tune, limitador, medidor LUFS e medição de atraso.

```bash
npm run publicar
```

Gera o build e publica no GitHub Pages (ramo `gh-pages`).

## O que já existe

| Etapa | Recurso |
|---|---|
| Estilo | Modelos para boombap, trap, plug, love song, drill, hard/trash, funk, mandelão e bruxaria: andamento, balanço, kit, timbre de voz e padrão de partida |
| Beat | Bateria em 16 passos com rolos e notas fracas, 7 kits sintetizados, 14 samples prontos (bumbo, caixa, palma, chimbais, estalo) ou samples próprios; 808 em grade de notas com deslize, sintetizado ou por sample próprio afinado; melodia com 5 instrumentos; padrões e arranjo; ou importação de um beat pronto |
| Voz | Gravação em PCM sem compressão, vários takes, medição do atraso do aparelho, montagem por trechos (comping) |
| Tune | Correção de afinação para o tom e a escala da música: velocidade (robótico a natural), intensidade e altura da voz (±12 semitons) |
| Mix | Por take: volume, lado, 9 timbres por gênero, reverb (3 tamanhos), delay no tempo do beat com repetições, distorção, voz de telefone; espaço no beat para a voz |
| Master | Compressor de cola, ganho, limitador de pico real e medidor LUFS |
| Exportação | WAV (16 bits, 44,1 kHz), MP3, só vozes, só beat |
| Projeto | Salvamento automático no navegador, desfazer/refazer, arquivo único com projeto e áudio |
| Tela | Modo simples (só o caminho principal) e modo completo |
| Aplicativo | Instalável no celular e no computador (PWA), abre sem internet |

## Como o código está organizado

```
src/
  model/
    project.ts          O projeto como dados: tudo que define uma música
    generos.ts          Modelos por gênero, escritos como dados
  engine/
    tempo.ts            Passos, swing e o relógio do sequenciador
    synths.ts           Síntese: kits de bateria, 808, instrumentos
    vocalChain.ts       Cadeia de voz: filtros, compressor, saturação, reverb, delay
    tune.ts             Tune: detecção de pitch (YIN) e correção (TD-PSOLA)
    tune.worker.ts      Roda o tune fora da thread da tela
    mixer.ts            Mesa de mixagem e cadeia de master
    limiter.ts          Limitador de pico com antecipação
    loudness.ts         Medidor LUFS (ITU-R BS.1770)
    latencia.ts         Medição do atraso de gravação
    recorder.ts         Captura do microfone
    engine.ts           Reprodução ao vivo e exportação
  storage.ts            Salvamento local e arquivo de projeto
  main.ts               Interface
public/captura.worklet.js   Captura de áudio na thread de áudio
public/sw.js                Guarda o aplicativo no aparelho para abrir sem internet
public/manifest.webmanifest Dados de instalação (nome, ícones)
docs/pesquisa.md        Dores de usuários, referências e decisões técnicas, com fontes
```

O motor (`engine/`) não conhece a interface. A mesma mesa de mixagem toca ao vivo e exporta.

Para acrescentar ou corrigir um gênero, edite `src/model/generos.ts`: cada modelo é um bloco de dados com o padrão escrito em texto (`x......x..x.....`).

## Princípios

- **Implementação própria.** Nada aqui vem de engenharia reversa de software fechado. Os mecanismos são técnicas públicas de áudio digital, implementadas do zero. O que observamos em outros programas é só o comportamento visível ao usuário e a documentação pública.
- **Ensinar enquanto produz.** Todo recurso explica o que faz.
- **Leve.** Roda no navegador, sem instalação, pensado para notebook simples e celular.

## Limites atuais

- O tune é aplicado depois da gravação, não ao vivo durante o canto. É uma escolha: no navegador, efeito ao vivo aumenta o atraso.
- Os modelos de funk, mandelão e bruxaria são aproximações e precisam ser corrigidos por quem é da cena.
- Os samples prontos de caixa, palma e chimbal são de bateria acústica, não de bateria eletrônica. Não há sample pronto de 808 (nenhum com licença de domínio público verificável); o 808 aceita sample do usuário. A melodia ainda não aceita samples.
- A altura da voz preserva o timbre (formantes): não faz o efeito de voz "de esquilo".
- Cada padrão tem um compasso; frases mais longas são feitas alternando padrões no arranjo.
- Ao vivo, o limitador é aproximado por um compressor; o limitador de pico real só entra na exportação.
- A montagem de takes corta em limites de compasso (1, 2 ou 4); não há corte livre dentro do take.
- Não há colaboração em nuvem; a troca é pelo arquivo de projeto.
- Não foi testado em iPhone nem em Android de entrada. Os riscos conhecidos estão em `docs/pesquisa.md`.

## Licença

[MIT](LICENSE). Pode usar, modificar e redistribuir, inclusive em produtos fechados, mantendo o aviso de copyright.

Os samples em `public/samples` são CC0 (domínio público); a origem de cada arquivo está em [public/samples/ORIGEM.md](public/samples/ORIGEM.md).

A exportação em MP3 usa [`wasm-media-encoders`](https://github.com/arseneyr/wasm-media-encoders) (MIT), que embute o codificador LAME, distribuído sob LGPL. Ele é carregado como módulo separado, só quando se exporta MP3.
