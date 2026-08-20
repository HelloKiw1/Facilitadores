# Kiwi PDF

Ferramentas de PDF executadas inteiramente no navegador, prontas para publicação no GitHub Pages. Os documentos não são enviados para APIs, servidores ou serviços de terceiros.

## Ferramentas

- Juntar vários PDFs, com reordenação.
- Dividir por seleção de páginas ou gerar um PDF por página.
- Comprimir PDF em três níveis.
- Converter DOCX, XLSX e PPTX para PDF.
- Converter cada página de PDF em JPG.
- Criar PDF a partir de JPG, PNG e WebP.

## Desenvolvimento

Requer Node.js 22 ou mais recente.

```bash
npm install
npm run dev
```

Para gerar os arquivos estáticos:

```bash
npm run build
```

O resultado fica em `dist/`. Não há CDN nem conexão externa durante o uso da página.

## Publicação

O workflow `.github/workflows/pdf-pages.yml` compila e publica a aplicação em `/Facilitadores/pdf/`. No GitHub, abra **Settings → Pages** e selecione **GitHub Actions** como origem. Depois, execute o workflow **Publicar Kiwi PDF** ou envie uma alteração para `main`/`master`.

## Limitações conhecidas

- DOCX, XLSX e PPTX são interpretados pelo navegador, não pelo Microsoft Office. Recursos avançados como macros, animações, gráficos complexos e fontes não instaladas podem ser simplificados.
- A compressão rasteriza as páginas; o texto deixa de ser selecionável. Se o resultado ficar maior, o arquivo original é preservado.
- Arquivos muito grandes dependem da memória disponível no dispositivo.

As bibliotecas são empacotadas na compilação. O `npm audit` foi executado sem vulnerabilidades conhecidas nas dependências de produção.
