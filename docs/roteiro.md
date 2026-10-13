# Roteiro: o que falta para um trabalho de ponta

Consolidação de seis pesquisas feitas em outubro de 2026, cada uma com um escopo exclusivo: técnica profissional de voz, mix e master; o que os concorrentes têm e o que usuários pedem; a cena brasileira; DJs; beatmakers; composição e lançamento.

**Limites comuns a todas:** threads do Reddit, comentários de YouTube e avaliações de lojas de aplicativos quase não foram alcançados. A "voz do usuário" vem de fóruns (Image-Line, Steinberg, KVR, Gearspace, MPC-Forums), centrais de ajuda e reportagens. Vários guias de técnica são blogs de quem vende presets. A ordem de prioridade abaixo é julgamento nosso, não vem das fontes.

## O que as pesquisas mostraram

- **A captação decide o resultado.** Sala com eco e gravação estourada não têm conserto depois ([SOS](https://www.soundonsound.com/sound-advice/q-how-do-set-acoustic-treatment-recording-vocals), [LANDR](https://blog.landr.com/recording-vocals-mistakes/)).
- **A voz sobre beat de duas faixas é a dor mais repetida.** A técnica dos engenheiros é fazer o beat ceder espaço quando a voz entra ([Sage Audio](https://www.sageaudio.com/articles/how-to-mix-vocals-into-a-beat)).
- **Ferramentas que analisam a mix ficam fora do estúdio e não corrigem.** Um diagnóstico que explica e corrige é o diferencial mais claro ([MPC-Forums](https://www.mpc-forums.com/viewtopic.php?p=1187055)).
- **No Brasil, o estúdio é o celular e o quarto.** DJ Arana fez um álbum inteiro no celular; MCs gravam em armário com microfone de celular; produtores de BH usam o celular por não ter computador nem monitores ([Billboard Brasil](https://billboard.com.br/dj-arana-mobile-album-celular-musica-eletronica/), [The Quietus](https://thequietus.com/?p=261423), [Crack Magazine](https://crackmagazine.net/article/profiles/deeper-and-deeper-funk-mineiro/2)).
- **Falta técnica de mixagem, não vontade.** Produtores relatam ter levado anos para aprender a equilibrar os elementos ([Crack Magazine](https://crackmagazine.net/article/profiles/deeper-and-deeper-funk-mineiro/2)).
- **O concorrente de celular cobra e não guarda cópia local.** O BandLab passou recursos antes gratuitos para o plano pago e depende de internet para salvar ([Trustpilot](https://www.trustpilot.com/review/www.bandlab.com?page=4), [BandLab](https://help.bandlab.com/hc/en-us/articles/115002945193-Saving-Issues)).
- **Quem escreve usa "uma linha, um compasso"**, e pede a letra na tela ao gravar ([Rap Analysis](https://rapanalysis.com/?p=24), [Steinberg](https://forums.steinberg.net/t/please-add-lyrics-track-to-cubase/887547)).
- **DJs querem acapella e instrumental oficiais, BPM e tom no arquivo.** A separação por IA vaza e soa robótica ([Digital DJ Pool](https://digitaldjpool.com/blog/dj-edits-explained/), [Crossfader](https://wearecrossfader.co.uk/blog/where-do-djs-get-acapellas/)).
- **Beatmakers travam no loop que nunca vira música** e dependem de sample fatiado, padrões de mais de um compasso e controle fino de chimbal ([MPC-Forums](https://www.mpc-forums.com/viewtopic.php?p=1468951), [Attack](https://www.attackmagazine.com/technique/beat-dissected/uk-drill/)).

## Já implementado

| Frente | Ferramenta |
|---|---|
| Captação | Teste do lugar de gravação (ruído de fundo e eco, por uma palma); aviso de voz estourada ou baixa; medição do atraso do aparelho; trazer voz já gravada (WhatsApp, gravador do celular) como take |
| Limpeza | Redução de ruído, gate, nivelamento por frase, de-esser |
| Voz | "Ajustar ao meu take" (mede a gravação e regula equalizador, compressor e limpeza); papéis de principal, dobra e adlib; compressão dupla e paralela; harmonia automática na escala; eco só no fim da frase; exportar take como vinheta (seca e com efeito) |
| Mix | O beat abre espaço quando a voz entra; diagnóstico que mede, explica e corrige; escuta em mono e em caixa de celular |
| Beat | Padrões de 1, 2 ou 4 compassos; rolos em crescendo; acordes pelos graus da escala; 808 que abaixa a cada bumbo; "estourar o beat" (clipping controlado); instrumento "tuin"; velocidade do beat importado |
| Arranjo | Nome, mudos (bateria, 808, melodia) e virada (subida, prato ao contrário, silêncio) por trecho; estrutura de música pronta (intro, versos, refrões, final) |
| Master | Limitador suave (soft clipper), além de cola, equalizador, largura e volume final |
| Letra | Uma linha por compasso, sílabas aproximadas, letra acompanhando a música ao gravar |
| Lançar | Dados da música e ficha da licença do beat; conferência do áudio (pico, volume, silêncio, duração) e da capa; pacote .zip com WAV (16 ou 24 bits), MP3 com BPM e tom gravados no arquivo, acapella, instrumental, versão para DJ com intro e saída, faixas separadas desde o compasso 1, ficha e letra |
| Base | Versões do projeto; teclado MIDI (tocar e escrever na grade) |

## Os onze itens da rodada seguinte

| Item | Situação |
|---|---|
| Regravar em laço | Feito: o trecho de 2, 4 ou 8 compassos se repete e cada volta vira um take |
| Sampler | Feito: loop importado, corte por ataques ou em grade, 4 a 16 fatias, altura, invertido; a grade dispara as fatias |
| Volume, lado e altura por nota; balanço por som | Feito em parte: volume, lado, balanço e altura **por som**, e três volumes **por nota** (forte, normal, fraco). Volume contínuo e lado por nota não foram feitos |
| Andamento sem mudar o tom | Feito, com algoritmo próprio (WSOLA). Soa bem entre 75% e 135% |
| Vídeo vertical | Feito: 15 ou 30 s com título, artista, barras de som e a letra da vez. Sai em MP4 onde o navegador grava MP4, senão em WebM |
| Receber pelo "compartilhar" do celular | Feito: com o aplicativo instalado, o áudio compartilhado vira take (ou beat, se for longo) |
| Versão limpa e versões em outros andamentos | Feito: trechos da voz silenciados por tempo informado; versão em 130, 150 ou 170 BPM para beat criado aqui |
| Redução de ruído por rede neural | **Não feito.** O pacote candidato (RNNoise em WebAssembly) não declara licença no registro, e o DeepFilterNet pede uma biblioteca de execução de vários megabytes. Segue a redução de ruído própria, por subtração espectral |
| Aviso de beat fora da afinação padrão | Feito: mede os cents de desvio e o tune passa a acompanhar o beat |
| Biblioteca de sons maior | Feito em parte: mais seis percussões em domínio público (cowbell, agogô, chocalho, pandeiro, clave, cabasa). Não há 808 nem bateria eletrônica com licença verificável |
| Colaboração em tempo real | **Não feito em tempo real.** Feito o caminho sem servidor: enviar o projeto pelo "compartilhar" e juntar as vozes do arquivo de um parceiro, sem perder as próprias |

## Rodada do nível profissional

Duas pesquisas (áudio e processamento; fluxo de trabalho, confiabilidade e validação) e uma leitura dos manuais públicos do FL Studio, do FL Studio Mobile e da página do OneKnob Louder. Dos manuais só se tirou o comportamento descrito para o usuário; faixas, desenho e código são nossos.

| Achado | Situação |
|---|---|
| Teto medido em pico real (dBTP), não em pico de sample | Feito: o limitador reconstrói a onda entre os samples (4x) |
| Dither ao reduzir para 16 bits; MP3 em 320 kbps | Feito |
| Distorção sem aliasing; filtro de subgrave no master | Feito: saturador com sobreamostragem 4x; passa-altas em 20 Hz |
| Reverb com pré-atraso, primeiras reflexões e agudos que somem antes | Feito |
| Gravação que não se perde se a aba fechar | Feito: cada pedaço gravado vai para um cofre no aparelho e é oferecido de volta ao abrir |
| Tela que não apaga gravando; armazenamento persistente; aviso de espaço cheio; versões automáticas | Feito |
| Pré-escuta antes do ponto ao regravar | Feito |
| "Copiar diagnóstico" para relatar problema | Feito |
| Pedaleira: cada efeito da voz como um pedal com chave de pé (FL Hardcore) | Feito, com desenho próprio; liga e desliga cada efeito sem perder o ajuste |
| Chorus | Feito, no pedal de dobra |
| Equalizador com pontos arrastáveis sobre a curva (Parametric EQ 2) | Feito |
| Um botão grande de volume final (OneKnob Louder) | Feito, ligado ao alvo em LUFS |
| Analisador de espectro ao vivo (FL Mobile) | Feito, no Master |
| Compressor multibanda de 3 faixas | Feito: cruzamentos em 150 Hz e 4 kHz, um botão só |
| Automação de volume desenhada na linha do tempo | Feito para o beat e para cada voz; outros parâmetros ainda não |
| Solo por canal e cores por canal no mixer | Feito |
| Sintetizador simples (onda, oitava, desafinação, filtro, envelope) | Feito, como instrumento "meu" |
| Arpejo dos acordes | Feito: sobe pelas notas do acorde a cada meio tempo |
| Teclado na tela | Feito, preso à escala |
| Presets próprios da cadeia de voz | Feito, guardados no navegador |

### Ainda falta para o nível profissional

- **Compressor próprio em AudioWorklet.** O compressor do navegador aplica ganho de compensação sozinho e não tem entrada lateral nem antecipação. É a maior diferença de som para um programa profissional.
- **Limitador com visor rolante** (entrada, saída e redução), como o do FL.
- **Mandadas e retornos** (um reverb só para várias vozes) e entrada lateral escolhida por canal.
- **Automação de outros parâmetros** (filtro, reverb, lado) e curvas além da reta.
- **Edição livre do áudio**: corte em qualquer ponto, inverter, normalizar, tirar cliques.
- **Equalizador**: filtros de 24 dB por oitava, monitor por centro e lados, correção da deformação perto do agudo máximo.
- **Medidores**: faixa de volume (LRA), correlação estéreo, vetorscópio.
- **Qualidade do tune**: marcas de período e formantes melhores; redução de ruído MMSE.
- **Grade**: deslocamento fino e repetição por nota; dedilhado; cortar notas; marcadores com ação.
- **Testes automáticos de ponta a ponta** no navegador e matriz de aparelhos reais.
- **Tradução** e auditoria de acessibilidade.

## Bibliotecas, plugins e extensões

Levantamento do que FL Studio, FL Studio Mobile, BandLab, Soundtrap, Amped Studio, Audiotool e GarageBand entregam, e do que um estúdio MIT em site estático pode fornecer. Fontes: páginas oficiais, manuais e repositórios; licenças lidas na origem.

**O que eles têm e nós não podemos copiar:** bibliotecas de milhões de loops (FL Cloud, BandLab Sounds), plugins VST/AU (precisam de programa instalado), separação de voz por IA, distribuição para as plataformas. Tudo isso depende de servidor, contrato ou código fechado.

| O que oferecer | Situação | Licença e peso |
|---|---|---|
| Exportar as notas em MIDI (.mid) | Feito: bateria, 808 e melodia em trilhas separadas | Código próprio |
| Presets de voz por arquivo, para trocar entre pessoas | Feito: só campos de som conhecidos são aceitos | Código próprio |
| Samples do usuário (bateria, 808, sampler) | Já existia | — |
| Importar MIDI para a grade | A fazer | Código próprio |
| Kits de bateria e modelos de gênero por arquivo | A fazer | Código próprio |
| Efeito de meia velocidade e parada de fita (o uso mais citado do Gross Beat) | A fazer | Código próprio |
| Mais sons CC0 (VCSL, VSCO-2 CE, gratuitos da Karoryfer), baixados sob demanda | A fazer: recorte de 5 a 15 MB | CC0 confirmado |
| Progressões de acordes prontas | A fazer | free-midi-chords, MIT |
| Importar SoundFont do usuário (SF2/SF3) | Depois | spessasynth, Apache-2.0; não embutir bancos de 30 a 140 MB |
| Reverb por convolução com salas reais | Depois, opcional | Voxengo IM Reverbs só pode ser redistribuído inteiro e com o aviso (6,9 MB) |
| Efeitos escritos em Faust, compilados no build | Depois | Só funções MIT, STK ou LGPL com exceção |
| Plugins Web Audio Modules (WAM2) | Depois, e só de uma lista auditada copiada para o repositório | SDK MIT; a licença de cada um dos 58 plugins do catálogo não está declarada |
| Busca no Freesound | Depois | Exige chave; só com a chave do próprio usuário e filtro CC0 |

**Não entra:**

- Carregar plugin ou script de um endereço qualquer: o código rodaria com acesso aos projetos e ao microfone.
- Kits de 808 "de domínio público" sem dedicação formal (smpldsnds, tidal-drum-machines), 99Sounds (proíbe redistribuir), SampleSwap, EchoThief. O 808 continua sintetizado ou com sample do usuário.
- WebAudioFont (GPL-3), código gerado pelo RNBO (GPL-3 ou proprietária), Csound em WebAssembly (precisa de cabeçalhos que o GitHub Pages não permite).

## O que as pesquisas trouxeram e ainda não entrou

- **Comparar com uma música de referência**, com o volume igualado.
- **Equalização do beat separando centro e lados** (mid-side) e equalizador dinâmico contra aspereza.
- **Tirar eco de sala** de uma gravação (de-reverb).
- **Efeito de meia velocidade e parada de fita** (half-time, tape stop).
- **Volume contínuo, lado e altura por nota**, probabilidade e humanização; dedilhado.
- **Áudio para notas** (cantarolar a melodia ou o 808).
- **Rimas e sílabas poéticas em português**; histórico de versões de cada verso.
- **Comentários com marcação de tempo** para receber opinião sobre a música.
- **Etiquetas em WAV e AIFF** e cabeçalho que alinhe o MP3 ao primeiro tempo em todos os programas de DJ.
- **Desafios e lições curtas** dentro do estúdio.
- **Acessibilidade para leitor de tela**, que não foi auditada.
- **Medição de desempenho em celular de entrada.**

Ficam de fora por decisão: separação de voz e instrumentos por IA, geração de música por IA e colaboração em tempo real (ver abaixo).

## O que não foi verificado

- Nada foi ouvido por uma pessoa: todos os testes são medições. Timbres, tune, harmonia, sampler, esticamento e redução de ruído precisam do ouvido de quem usa.
- Gravação com microfone real, celular de entrada e iPhone continuam sem teste. A gravação em laço foi testada com microfone simulado.
- O teclado MIDI foi escrito sem um controlador ligado para testar.
- O cofre de gravação, a tela sempre ligada e a pré-escuta passam na verificação de tipos, mas não foram exercitados com uma queda real da aba nem em celular.
- Os presets de voz usam a caixa de texto do navegador para o nome e não foram testados no aplicativo instalado.
- O recebimento pelo "compartilhar" foi testado enviando o arquivo ao service worker no computador, não a partir de um celular com o aplicativo instalado.
- Os limiares do diagnóstico, do "ajustar ao meu take", do teste de ambiente e da detecção de afinação foram calibrados com sinais sintéticos.

## Decisões tomadas

- **Separação de voz e instrumentos por IA fica de fora por enquanto.** É o recurso mais comum nos concorrentes, mas o autor do Demucs afirma que os pesos do modelo não são cobertos pela licença MIT ([issue](https://github.com/facebookresearch/demucs/issues/327)), e o modelo pesa de 80 a 170 MB.
- **Geração de música por IA fica de fora.** Modelos grandes, sem licença aberta.
- **Colaboração em tempo real fica para depois.** As peças sem servidor ainda são imaturas; a troca segue pelo arquivo de projeto.
- **Tutorial de abertura não será feito.** Em teste com 70 pessoas, quem leu o tutorial não se saiu melhor e achou a tarefa mais difícil ([NN/g](https://www.nngroup.com/articles/mobile-tutorials/)). A ajuda fica junto de cada controle.

## Sem evidência

Não encontramos fonte para: preço e pirataria de programas no Brasil, avaliações brasileiras de aplicativos, equipamento usado por artistas de Roraima, Amazonas e Pará, e como artistas pedem e recebem opinião sobre uma música. A conversa direta com artistas da cena continua sendo a fonte que falta.
