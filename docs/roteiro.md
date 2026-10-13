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

## O que ainda falta

Em ordem de valor para o artista:

1. **Regravar em laço**, empilhando um take por volta.
2. **Sampler**: fatiar um loop por transiente ou grade, tocar as fatias, inverter, mudar a altura. É a base do boombap e do "loop primeiro" do trap.
3. **Volume, lado e altura por nota**, e balanço (swing) diferente para cada som.
4. **Mudar o andamento de um beat importado sem mudar o tom** (hoje a velocidade muda os dois). Candidata: `signalsmith-stretch`, MIT.
5. **Vídeo vertical curto** com forma de onda e letra, para Reels, TikTok e Canvas.
6. **Receber áudio pelo "compartilhar" do celular** direto no aplicativo instalado.
7. **Versão limpa** (silenciar palavras marcadas) e versões em vários andamentos para DJs de funk.
8. **Redução de ruído por rede neural** (DeepFilterNet), baixada sob demanda, para gravações muito ruins.
9. **Aviso de beat fora da afinação padrão**, que faz o tune puxar para notas erradas.
10. **Biblioteca de sons maior**, só com licença de domínio público verificada.
11. **Colaboração em tempo real.**

## O que não foi verificado

- Nada foi ouvido por uma pessoa: todos os testes são medições. Timbres, tune, harmonia e redução de ruído precisam do ouvido de quem usa.
- Gravação com microfone real, celular de entrada e iPhone continuam sem teste.
- O teclado MIDI foi escrito sem um controlador ligado para testar.
- Os limiares do diagnóstico, do "ajustar ao meu take" e do teste de ambiente foram calibrados com sinais sintéticos.

## Decisões tomadas

- **Separação de voz e instrumentos por IA fica de fora por enquanto.** É o recurso mais comum nos concorrentes, mas o autor do Demucs afirma que os pesos do modelo não são cobertos pela licença MIT ([issue](https://github.com/facebookresearch/demucs/issues/327)), e o modelo pesa de 80 a 170 MB.
- **Geração de música por IA fica de fora.** Modelos grandes, sem licença aberta.
- **Colaboração em tempo real fica para depois.** As peças sem servidor ainda são imaturas; a troca segue pelo arquivo de projeto.
- **Tutorial de abertura não será feito.** Em teste com 70 pessoas, quem leu o tutorial não se saiu melhor e achou a tarefa mais difícil ([NN/g](https://www.nngroup.com/articles/mobile-tutorials/)). A ajuda fica junto de cada controle.

## Sem evidência

Não encontramos fonte para: preço e pirataria de programas no Brasil, avaliações brasileiras de aplicativos, equipamento usado por artistas de Roraima, Amazonas e Pará, e como artistas pedem e recebem opinião sobre uma música. A conversa direta com artistas da cena continua sendo a fonte que falta.
