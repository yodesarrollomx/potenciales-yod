#!/usr/bin/env bash
# Rama de datos del grafo (`grafo-datos`): estado en vivo, registro y el aviso de borrador.
# La rama principal está protegida, así que lo que cambia cada hora no se escribe ahí.
#   traer            deja la rama en $RUNNER_TEMP/grafo-datos (la crea vacía la primera vez)
#   guardar <texto>  confirma y sube lo que cambió; si otro flujo subió antes, se pone encima y reintenta
# Dos flujos pueden escribir a la vez. El registro sólo crece por el final, así que sus líneas se unen
# (merge=union); en lo demás gana lo que este flujo acaba de calcular.
set -euo pipefail
RAMA=grafo-datos
D="${RUNNER_TEMP:-/tmp}/grafo-datos"
YO=(-c user.name='yod-grafo' -c user.email='yod-grafo@users.noreply.github.com')
case "${1:-}" in
  traer)
    git worktree remove --force "$D" 2>/dev/null || rm -rf "$D"
    git worktree prune
    if git ls-remote --exit-code --heads origin "$RAMA" >/dev/null 2>&1; then
      git fetch --quiet --depth 1 origin "$RAMA"
      git worktree add --quiet --force -B "$RAMA" "$D" FETCH_HEAD
    else
      git worktree add --quiet --orphan -b "$RAMA" "$D"
      # shellcheck disable=SC2016  # las comillas invertidas son del texto, no una orden
      printf '%s\n' '# Datos vivos del grafo de YOD OS' '' \
        'Esta rama la escriben los flujos «Grafo · estado» y «Grafo · rehacer» de este repositorio.' \
        'No se edita a mano. `estado.json`: errores abiertos. `registro.jsonl`: qué apareció, qué se resolvió' \
        'y cada grafo rehecho, aprobado o descartado. `borrador.json`: el borrador en revisión, si hay.' > "$D/README.md"
      printf '{}\n' > "$D/borrador.json"
    fi
    [ -f "$D/.gitattributes" ] || printf 'registro.jsonl merge=union\n' > "$D/.gitattributes"
    ;;
  guardar)
    cd "$D"
    git add -A
    if git diff --cached --quiet; then echo 'rama de datos: sin cambios'; exit 0; fi
    git "${YO[@]}" commit --quiet -m "${2:-Grafo: datos}"
    for intento in 1 2 3 4; do
      if git push --quiet origin "HEAD:$RAMA" 2>/dev/null; then echo 'rama de datos: guardada'; exit 0; fi
      # Otro flujo subió antes: traer lo suyo y poner lo nuestro encima.
      git fetch --quiet --depth 50 origin "$RAMA" || true
      git "${YO[@]}" rebase --quiet -X theirs FETCH_HEAD 2>/dev/null || { git rebase --abort 2>/dev/null || true; }
      sleep $((intento * 3))
    done
    echo 'rama de datos: no se pudo subir' >&2; exit 1
    ;;
  *) echo 'uso: grafo-rama-datos.sh traer | guardar <texto>' >&2; exit 2 ;;
esac
