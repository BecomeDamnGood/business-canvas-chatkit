#!/usr/bin/env bash
set -euo pipefail

echo "STARTING_BACKEND"
echo "Python: $(python --version)"
echo "Working dir: $(pwd)"
echo "PORT env: ${PORT:-8000}"
echo "OPENAI_API_KEY set: $([ -n "${OPENAI_API_KEY:-}" ] && echo YES || echo NO)"

echo "IMPORT_TEST_BEGIN"
python -c "import fastapi; import uvicorn; import openai; import chatkit; print('IMPORT_OK')"
echo "IMPORT_TEST_END"

PORT_TO_USE="${PORT:-8000}"

echo "STARTING_UVICORN on 0.0.0.0:${PORT_TO_USE}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT_TO_USE}" --log-level info
