# Ollama Local Chat (Django + React + PostgreSQL)

Web chat local contra un modelo de **Ollama** usando su API HTTP, con backend **Django/DRF**, frontend **React (Vite)** y persistencia en **PostgreSQL**.

## Requisitos
- Ollama instalado
- Node.js 18+
- Python 3.11+ (recomendado)
- Docker (solo para levantar PostgreSQL fácilmente)

## 1) Levantar Ollama + descargar el modelo
En una terminal:

```bash
# descarga el modelo (una vez)
ollama pull huihui_ai/deepseek-r1-abliterated:14b

# asegúrate de que el servidor de Ollama esté corriendo
ollama serve
```

Nota: `ollama run huihui_ai/deepseek-r1-abliterated:14b` también descarga el modelo, pero abre el modo interactivo en consola.
Para la WebUI, lo importante es que la API esté disponible en `http://localhost:11434`.

## 2) Levantar PostgreSQL (Docker)
Desde la carpeta raíz del proyecto:

```bash
docker compose -f docker-compose.db.yml up -d
```

Esto crea:
- Host: `localhost`
- Puerto: `5432`
- DB: `ollama_chat`
- Usuario: `ollama`
- Password: `ollama`

## 3) Backend (Django)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # en Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env

python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

API base: `http://localhost:8000/api/`

### Variables importantes (backend/.env)
- `OLLAMA_MODEL` (por defecto: `huihui_ai/deepseek-r1-abliterated:14b`)
- `OLLAMA_BASE_URL` (por defecto: `http://localhost:11434`)

## 4) Frontend (React)
En otra terminal:

```bash
cd frontend
npm install

cp .env.example .env
npm run dev
```

Abrir: `http://localhost:5173`

## Endpoints principales
- `GET  /api/sessions/`
- `POST /api/sessions/` (crea sesión)
- `GET  /api/sessions/<uuid:session_id>/messages/`
- `POST /api/sessions/<uuid:session_id>/chat/` (envía mensaje)
  - Query opcional `?stream=1` para respuesta en streaming (SSE)

## Notas Docker (opcional)
Este repo incluye solo `docker-compose.db.yml` para la BD.
Si quieres dockerizar backend/frontend, ajusta `OLLAMA_BASE_URL` a `http://host.docker.internal:11434` (o agrega `extra_hosts` en Linux).

