#!/bin/sh
# Publica o site no GitHub Pages: gera o build e envia a pasta dist para o
# ramo gh-pages do repositório. Uso: npm run publicar
set -e
npm run build
touch dist/.nojekyll
ORIGEM=$(git remote get-url origin)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Publica o site"
git push -q -f "$ORIGEM" gh-pages
rm -rf .git
echo "Publicado no ramo gh-pages."
