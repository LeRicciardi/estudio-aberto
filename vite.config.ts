import { readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Grava a lista dos arquivos gerados no build. O service worker lê essa lista
 * para guardar tudo no aparelho e o aplicativo abrir sem internet.
 */
function listaParaOffline(): Plugin {
  return {
    name: 'lista-para-offline',
    generateBundle(_, bundle) {
      const samples = readdirSync('public/samples').filter((f) => f.endsWith('.wav')).map((f) => `samples/${f}`);
      this.emitFile({ type: 'asset', fileName: 'arquivos.json', source: JSON.stringify(['./', ...Object.keys(bundle), ...samples]) });
    },
  };
}

export default defineConfig({
  // Caminhos relativos: o site funciona em qualquer pasta (GitHub Pages, por exemplo).
  base: './',
  plugins: [listaParaOffline()],
});
