// Roda o tune fora da thread da tela, para a interface não travar enquanto
// um take longo é afinado.

import { afinar, type OpcoesTune } from './tune.ts';

interface Pedido {
  id: number;
  amostras: Float32Array;
  taxa: number;
  opcoes: OpcoesTune;
}

self.onmessage = (e: MessageEvent<Pedido>) => {
  const { id, amostras, taxa, opcoes } = e.data;
  const saida = afinar(amostras, taxa, opcoes);
  (self as unknown as Worker).postMessage({ id, saida }, [saida.buffer]);
};
