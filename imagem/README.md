# Kiwi Imagem

Editor estático de imagens para GitHub Pages.

## Recursos

- Remoção automática de fundo com a API oficial remove.bg.
- Remoção manual com pincéis para apagar e restaurar.
- Modo misto: recorte automático seguido de acabamento manual.
- Aumento de resolução e nitidez processados localmente.
- Compressão para JPG, PNG ou WebP, com controle de qualidade e dimensão.
- Comparação entre imagem original e resultado.

## Privacidade

O modo manual, a melhoria e a compressão são executados inteiramente no navegador. No modo automático ou misto, a imagem é enviada diretamente à API oficial remove.bg após o usuário informar sua própria chave. A chave fica somente na memória da aba e nunca é gravada no repositório ou no armazenamento do navegador.

## Publicação

O workflow do repositório copia esta pasta para `/imagem/` no GitHub Pages. Depois da publicação, o endereço esperado é:

`https://hellokiw1.github.io/Facilitadores/imagem/`
