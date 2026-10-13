# Pesquisa: dores, referências e decisões técnicas

Levantamento feito em outubro de 2026 a partir de documentação pública, páginas de suporte e fóruns. Nada aqui vem de engenharia reversa de software fechado. Cada item indica se foi verificado na fonte ou se é inferência nossa.

**Limites do levantamento:** o FL Studio não foi aberto (não estava instalado na máquina usada); threads completas do Reddit, comentários de YouTube e fóruns brasileiros não foram alcançados; boa parte dos tutoriais de gênero é blog de fornecedor.

## Dores de quem usa as plataformas atuais

| Dor | Fonte | O que o Estúdio Aberto faz |
|---|---|---|
| Voz sai fora do tempo no celular; Bluetooth piora e a latência varia (110 a 200 ms relatados) | [Ajuda BandLab](https://help.bandlab.com/hc/en-us/articles/115002959414-Fixing-Latency) | Medição de atraso por estalos, ajuste manual e aviso sobre Bluetooth |
| No navegador, cerca de 30 ms de ida e volta no melhor caso | [W3C](https://w3.org/2021/03/media-production-workshop/talks/ulf-hammarqvist-audio-latency.html), [Soundtrap](https://support.soundtrap.com/hc/en-us/articles/26663690434066-Latency) | Grava seco, sem monitorar com efeito |
| Efeitos em tempo real (AutoPitch) aumentam a latência | [Ajuda BandLab](https://help.bandlab.com/hc/en-us/articles/115002959414-Fixing-Latency) | Tune aplicado depois da gravação |
| Gravar voz no FL é confuso (vários destinos, gravação "some") | [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=8634884) | Um botão; o take aparece na lista |
| Auto-Tune custa US$ 30/mês | [Antares](https://www.antarestech.com/blog/autotune-evolves-new-pricing-structure) | Tune próprio e gratuito |
| Projeto de versão nova não abre na antiga; .flp não leva os samples | [Image-Line](https://support.image-line.com/action/knowledgebase?ans=515) | Arquivo único com projeto e áudio |
| Exportação soa diferente da reprodução | [Image-Line](https://support.image-line.com/action/knowledgebase?ans=582) | A mesma mesa toca e exporta |
| Voz fica "em cima" do beat de 2 faixas | [Produce Like A Pro](https://producelikeapro.com/blog/simple-tips-for-mixing-hip-hop/) | "Abrir espaço no beat para a voz" |
| No Voloco, WAV e mais de uma camada de voz são pagos; BandLab não guarda cópia local | [Voloco](https://help.voloco.com/hc/en-us/articles/38616447976215), [BandLab](https://help.bandlab.com/hc/en-us/articles/115002945193-Saving-Issues) | WAV, takes ilimitados e salvamento local |

Não confirmado: preço do FL em reais e pirataria no Brasil; queixas de gravação de voz no GarageBand.

## Qualidades a igualar

| Qualidade | Produto | Situação aqui |
|---|---|---|
| Piano roll de "pintura" e slides de 808 | FL Studio | Grade de notas na escala e linha "Deslizar" |
| Step sequencer rápido | FL Studio | Grade de 16 passos com rolos e notas fracas |
| Padrões + playlist | FL Studio | Padrões e arranjo |
| Presets vocais que soam bem de saída | Voloco, BandLab | Nove timbres por gênero, explicados |
| Masterização por presets | BandLab | Três acabamentos + limitador + medidor LUFS |
| Comping de takes (escolher os melhores trechos) | Logic | Montagem por trechos de 1, 2 ou 4 compassos |
| Colaboração em nuvem | BandLab | **Falta** (hoje: arquivo de projeto) |
| Warping de áudio | Ableton | **Falta** |

## Convenções por gênero

| Gênero | BPM | Padrão | Confiança |
|---|---|---|---|
| Boombap | 85–95 | Caixa nos passos 5 e 13; bumbo em 1, 7 e 11; swing | Boa ([NI](https://blog.native-instruments.com/what-is-boom-bap/)) |
| Trap | 130–160 | Palma no passo 9; chimbal em colcheias com rolos; 808 com o bumbo | Boa ([NI](https://blog.native-instruments.com/how-to-make-a-trap-beat/)) |
| Plug | 115–150 (fontes divergem) | Bateria esparsa, sinos, 808 macio | Média ([Splice](https://splice.com/blog/what-is-pluggnb/)) |
| Drill | 138–146 | Dois compassos: chimbal em 1, 4, 7, 9, 12, 15; caixa no 9 e depois no 13 | Boa ([NI](https://blog.native-instruments.com/drill/)) |
| Hard / rage | 150–170 | 808 distorcido, sintetizador serra | Fonte única |
| Funk | ~130 (tamborzão) ou 150 | Não há transcrição confiável | **Baixa** |
| Mandelão, bruxaria | 130–150 | Idem | **Baixa** |

Os modelos de funk, mandelão e bruxaria são aproximações e aparecem marcados assim na tela. Precisam ser transcritos de ouvido por quem é da cena.

## Quem é o público

Hipótese "artista independente brasileiro grava no BandLab pelo Android": **nem confirmada nem refutada**. Evidência indireta:

- Na classe DE, 87% acessam a internet só pelo celular e 10% dos lares têm computador ([TIC Domicílios 2025](https://convergenciadigital.com.br/mercado/tic-domicilios-desigualdade-no-acesso-a-internet-cai-mas-lacunas-entre-as-classes-e-gritante/)).
- Aparelhos de entrada mais vendidos têm 4 GB de RAM ([Tecnoblog](https://tecnoblog.net/noticias/moto-g04-e-moto-g24-sao-anunciados-veja-os-precos-no-brasil/)).
- O Brasil é o 3º país em tráfego do bandlab.com ([Semrush](https://pt.semrush.com/website/bandlab.com/overview)).

Antes de fixar o alvo, vale perguntar diretamente a artistas da cena como eles gravam hoje.

## Exportação

- WAV estéreo de 16 bits e 44,1 kHz atende CD Baby, Ditto e TuneCore ([CD Baby](https://support.cdbaby.com/hc/pt-br/articles/204498645-Envio-de-%C3%A1udio), [Ditto](https://support.dittomusic.com/en/articles/4283815-what-format-does-my-audio-need-to-be-in), [TuneCore](https://support.tunecore.com/hc/en-us/articles/115006499327)). DistroKid e ONErpm só foram vistos em fontes de terceiros.
- Spotify normaliza para -14 LUFS e pede pico real de até -1 dB ([Spotify](https://support.spotify.com/artists/article/loudness-normalization/)).
- MP3 para compartilhar é inferência nossa sobre o público, sem fonte.

## Compatibilidade: riscos conhecidos

| Risco | Fonte | Mitigação |
|---|---|---|
| iPhone degrada o áudio e manda o som para o auricular ao abrir o microfone | [WebKit 311451](https://bugs.webkit.org/show_bug.cgi?id=311451), [295889](https://bugs.webkit.org/show_bug.cgi?id=295889) | Microfone só fica aberto durante a gravação. **Não testado em iPhone** |
| Bluetooth muda a taxa de amostragem e distorce | [WebKit 231422](https://bugs.webkit.org/show_bug.cgi?id=231422) | Aviso na tela; a taxa é guardada com cada take |
| Bloco de áudio diferente de 128 amostras no iPhone | [WebKit 251091](https://bugs.webkit.org/show_bug.cgi?id=251091) | A captura não assume tamanho de bloco |
| Safari apaga dados após 7 dias sem uso | [Search Engine Land](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519) | Pedido de armazenamento persistente, arquivo de projeto e instalação como aplicativo (PWA) |
| Memória na exportação em aparelho fraco | [WebKit 198964](https://bugs.webkit.org/show_bug.cgi?id=198964) | **Falta** exportar em segmentos |
| Temporizadores lentos com a aba em segundo plano | [Chromium](https://blog.chromium.org/2017/03/reducing-power-consumption-for.html) | Agendamento no relógio do áudio. Falta mover o temporizador para um Worker |

## Bibliotecas e licença

- **Adotada:** `wasm-media-encoders` (MIT) para MP3.
- **Escrito por nós:** sequenciador, síntese, tune (YIN + TD-PSOLA), limitador, medidor LUFS (BS.1770), medição de atraso.
- **Candidatas:** `signalsmith-stretch` (MIT) para afinação e esticamento de maior qualidade; RNNoise (BSD/MIT) para reduzir ruído; `@tonejs/midi` (MIT) para exportar MIDI.
- **Evitadas:** ffmpeg.wasm (31 MB), Essentia.js (AGPL), Rubber Band (GPL), Tone.js (redundante), importação de .flp (formato fechado, sem documentação oficial).
- **Licença do projeto:** MIT. Nenhuma dependência exige copyleft para o projeto. O codificador LAME, embutido na biblioteca de MP3, é LGPL e fica em módulo separado. GPL teria liberado o Rubber Band, ao custo de impedir reuso em produtos fechados.
- Web DAWs abertos existentes (openDAW, GridSound) são AGPL: servem de referência de leitura, mas o código não pode ser copiado para um projeto MIT.
