import { defineConfig, type Plugin } from 'vite';

/**
 * Grava a lista dos arquivos gerados no build. O service worker lê essa lista
 * para guardar tudo no aparelho e o aplicativo abrir sem internet.
 */
function listaParaOffline(): Plugin {
  return {
    name: 'lista-para-offline',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'arquivos.json', source: JSON.stringify(['./', ...Object.keys(bundle)]) });
    },
  };
}

export default defineConfig({
  // Caminhos relativos: o site funciona em qualquer pasta (GitHub Pages, por exemplo).
  base: './',
  plugins: [listaParaOffline()],
});
