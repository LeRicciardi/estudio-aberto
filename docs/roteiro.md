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

## Feito nesta rodada

| Ferramenta | Por quê |
|---|---|
| O beat abre espaço quando a voz entra (corte em 3 kHz e leve queda de volume, calculados a partir da gravação) | Técnica central para voz sobre beat pronto |
| Diagnóstico da mix: mede equilíbrio, mascaramento, voz abafada, sibilância, dinâmica, mono e volume; explica e corrige | Mixagem assistida para quem não tem formação técnica |
| Escuta em mono e em "caixa de celular" | Erros de master mais citados; público ouve em celular e paredão |
| Página Letra: uma linha por compasso, sílabas aproximadas, letra acompanhando a música ao gravar | Pedido antigo em vários fóruns; nenhum concorrente prende a letra ao compasso |
| Versões do projeto guardadas no navegador | Fraqueza declarada do BandLab; serve também de registro com data |
| Exportação com nome no padrão de DJ: versão, BPM, tom e Camelot; acapella e instrumental | Faz a faixa entrar em montagens e sets |

## Próximas prioridades

### 1. Captação (o que mais muda o resultado)
- **Guia de captação antes de gravar:** teste de ruído da sala e de eco (por palma), aviso de nível enquanto canta. Hoje o aviso só vem depois do take.
- **Redução de ruído leve.** Começar por gate espectral próprio; DeepFilterNet (MIT/Apache, cerca de 16 MB) como opção baixada sob demanda.
- **Importar áudio do WhatsApp** (voz de MC, vinheta), inclusive no formato comprimido dele, e receber arquivos pelo "compartilhar" do celular.
- **Regravar em laço:** repetir um trecho e empilhar um take por volta.

### 2. Voz e mix
- **Nivelamento automático por frase** antes do compressor (hoje só há ganho do take inteiro).
- **Duas compressões em série** e compressão paralela nos timbres.
- **Harmonias e dobras automáticas na escala**, reaproveitando o tune.
- **Eco só no fim da frase** (automação da mandada de delay).
- **Canal de adlibs e dobras** com ajuste próprio.
- **Preset que mede o take** (grave, sibilância, dinâmica) em vez de valores fixos, e aviso quando o beat está fora da afinação padrão.

### 3. Criação de beat
- **Padrões de 2, 4 e 8 compassos**, tercinas e 1/32.
- **Volume, lado e altura por nota**, com rampa nos rolos de chimbal.
- **Sampler:** fatiar um loop por transiente ou grade, tocar as fatias, inverter, mudar a altura.
- **808 abaixando sob o bumbo** e limitador suave (soft clipper) no master.
- **Viradas e efeitos de transição** (crash invertido, subida, silêncio antes do refrão) e mudo por trecho no arranjo.
- **Modelos de estrutura por gênero** para tirar a música do loop.
- **Ajudante de acordes** a partir dos graus da escala.
- **Para o funk:** distorção e clipping controláveis, gerador de "tuin", troca de andamento entre 130, 150 e 170 sem perder o grave.

### 4. Entrega e lançamento
- **Tags no arquivo** (BPM, tom, capa, créditos, ISRC) e WAV de 24 bits.
- **Intro e saída automáticas de 8 ou 16 compassos** a partir do beat sem voz, e versão limpa.
- **Pacote em .zip** com música, acapella, instrumental e faixas separadas, todas começando no compasso 1.
- **Checklist de lançamento:** volume, pico, silêncio nas pontas, capa quadrada de 3000 px, créditos do beatmaker, ISRC, cadastro em associação do ECAD.
- **Ficha da licença do beat** (tipo, limite de streams, validade, crédito).
- **Vídeo vertical curto** com forma de onda e letra, para Reels, TikTok e Canvas.
- **Página de vinhetas** (gravar, tratar, exportar seca e com efeito).

### 5. Base
- **Teclado MIDI** no computador.
- **Biblioteca de sons maior**, só com licença de domínio público verificada.
- **Mudar tom e andamento de um beat importado** (`signalsmith-stretch`, MIT).
- **Desempenho em celular de entrada**, que ainda não foi medido.

## Decisões tomadas

- **Separação de voz e instrumentos por IA fica de fora por enquanto.** É o recurso mais comum nos concorrentes, mas o autor do Demucs afirma que os pesos do modelo não são cobertos pela licença MIT ([issue](https://github.com/facebookresearch/demucs/issues/327)), e o modelo pesa de 80 a 170 MB.
- **Geração de música por IA fica de fora.** Modelos grandes, sem licença aberta.
- **Colaboração em tempo real fica para depois.** As peças sem servidor ainda são imaturas; a troca segue pelo arquivo de projeto.
- **Tutorial de abertura não será feito.** Em teste com 70 pessoas, quem leu o tutorial não se saiu melhor e achou a tarefa mais difícil ([NN/g](https://www.nngroup.com/articles/mobile-tutorials/)). A ajuda fica junto de cada controle.

## Sem evidência

Não encontramos fonte para: preço e pirataria de programas no Brasil, avaliações brasileiras de aplicativos, equipamento usado por artistas de Roraima, Amazonas e Pará, e como artistas pedem e recebem opinião sobre uma música. A conversa direta com artistas da cena continua sendo a fonte que falta.
