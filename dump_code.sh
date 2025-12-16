#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Uso: $0 <directorio_raiz> <salida.txt> [--exclude-dir NOMBRE]... [--exclude-file NOMBRE]..."
  exit 1
fi

ROOT_DIR="$1"
OUT_FILE="$2"
shift 2

# Excluidos por defecto (puedes agregar más con flags)
EXCLUDE_DIRS=(".git" "__pycache__")
EXCLUDE_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --exclude-dir)
      EXCLUDE_DIRS+=("$2"); shift 2;;
    --exclude-file)
      EXCLUDE_FILES+=("$2"); shift 2;;
    *)
      echo "Argumento desconocido: $1"
      exit 1;;
  esac
done

ROOT_DIR="$(realpath "$ROOT_DIR")"
OUT_FILE="$(realpath -m "$OUT_FILE")"

# Prepara el comando find con prune (sin eval)
FIND_ARGS=("$ROOT_DIR" "(")
for d in "${EXCLUDE_DIRS[@]}"; do
  FIND_ARGS+=(-type d -name "$d" -o)
done
unset 'FIND_ARGS[${#FIND_ARGS[@]}-1]' 2>/dev/null || true
FIND_ARGS+=(")" -prune -o -type f -print0)

# Limpia salida
: > "$OUT_FILE"

# Recorre archivos
while IFS= read -r -d '' f; do
  # Evita incluir el archivo de salida si queda dentro del ROOT
  if [[ "$(realpath -m "$f")" == "$OUT_FILE" ]]; then
    continue
  fi

  base="$(basename "$f")"

  # Excluye por nombre exacto de archivo
  skip=0
  for ef in "${EXCLUDE_FILES[@]}"; do
    if [[ "$base" == "$ef" ]]; then
      skip=1
      break
    fi
  done
  [[ $skip -eq 1 ]] && continue

  # Evita binarios (file suele venir en Ubuntu)
  if command -v file >/dev/null 2>&1; then
    mime="$(file -b --mime "$f" || true)"
    if [[ "$mime" == *"charset=binary"* ]]; then
      continue
    fi
  fi

  rel="${f#"$ROOT_DIR"/}"

  {
    echo "FILE: $rel"
    cat "$f"
    echo -e "\n"
  } >> "$OUT_FILE"

done < <(find "${FIND_ARGS[@]}")

# Si el usuario está haciendo dump del backend/frontend "como proyecto", también generar el combinado.
# (Solo si el script se invoca de forma normal; evita bucles si se llama a sí mismo con --no-combine)
if [[ "${DUMP_CODE_NO_COMBINE:-0}" != "1" ]]; then
  FRONTEND_DIR="/home/z99sys/Documentos/proyectos/chatIa/frontend"
  BACKEND_DIR="/home/z99sys/Documentos/proyectos/chatIa/backend"

  FRONTEND_OUT="frontend_code.txt"
  BACKEND_OUT="backend_code.txt"
  ALL_OUT="chatIa_all_code.txt"

  DUMP_CODE_NO_COMBINE=1 ./dump_code.sh "$FRONTEND_DIR" "$FRONTEND_OUT" \
    --exclude-dir node_modules \
    --exclude-file .env \
    --exclude-file .env.example \
    --exclude-file package-lock.json \
    --exclude-file package.json

  DUMP_CODE_NO_COMBINE=1 ./dump_code.sh "$BACKEND_DIR" "$BACKEND_OUT" \
    --exclude-dir .venv \
    --exclude-file .env \
    --exclude-file .env.example

  cat "$FRONTEND_OUT" "$BACKEND_OUT" > "$ALL_OUT"

  rm -f "$FRONTEND_OUT" "$BACKEND_OUT"
fi

echo "OK -> $OUT_FILE"
