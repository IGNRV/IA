import json
import os
import requests
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import ChatSession, ChatMessage
from .serializers import ChatSessionSerializer, ChatMessageSerializer

def _ollama_cfg():
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "huihui_ai/deepseek-r1-abliterated:14b")
    timeout = int(os.getenv("OLLAMA_TIMEOUT", "120"))
    max_hist = int(os.getenv("OLLAMA_MAX_HISTORY_MESSAGES", "20"))
    system_prompt = os.getenv("OLLAMA_SYSTEM_PROMPT", "").strip()
    return base_url, model, timeout, max_hist, system_prompt

def _build_messages_from_db(session: ChatSession):
    _, _, _, max_hist, env_system_prompt = _ollama_cfg()
    msgs = []

    parts = []
    if env_system_prompt:
        parts.append(env_system_prompt.strip())

    custom = (session.custom_instructions or "").strip()
    if custom:
        parts.append("Instrucciones personalizadas:\n" + custom)

    if parts:
        msgs.append({"role": "system", "content": "\n\n".join(parts)})

    history = list(session.messages.order_by("-created_at")[:max_hist])
    history.reverse()
    for m in history:
        msgs.append({"role": m.role, "content": m.content})
    return msgs

def _ollama_chat(messages, stream: bool):
    base_url, model, timeout, _, _ = _ollama_cfg()
    url = f"{base_url}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": bool(stream),
    }
    # Ollama devuelve JSONL cuando stream=true
    return requests.post(url, json=payload, stream=stream, timeout=timeout)

class HealthView(APIView):
    def get(self, request):
        base_url, model, timeout, *_ = _ollama_cfg()
        return Response({"status": "ok", "ollama_base_url": base_url, "model": model, "timeout": timeout})

class SessionListCreateView(APIView):
    def get(self, request):
        sessions = ChatSession.objects.all()
        return Response(ChatSessionSerializer(sessions, many=True).data)

    def post(self, request):
        title = (request.data.get("title") or "").strip()
        custom_instructions = (request.data.get("custom_instructions") or "").strip()
        s = ChatSession.objects.create(title=title, custom_instructions=custom_instructions)
        return Response(ChatSessionSerializer(s).data, status=status.HTTP_201_CREATED)

class SessionDetailView(APIView):
    def get(self, request, session_id):
        try:
            s = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"detail": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ChatSessionSerializer(s).data)

    def patch(self, request, session_id):
        try:
            s = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"detail": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

        if "title" in request.data:
            s.title = (request.data.get("title") or "").strip()

        if "custom_instructions" in request.data:
            s.custom_instructions = (request.data.get("custom_instructions") or "").strip()

        s.save()
        return Response(ChatSessionSerializer(s).data)

    def delete(self, request, session_id):
        try:
            s = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"detail": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        s.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class SessionMessagesView(APIView):
    def get(self, request, session_id):
        try:
            s = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"detail": "Session not found"}, status=status.HTTP_404_NOT_FOUND)
        msgs = s.messages.all()
        return Response(ChatMessageSerializer(msgs, many=True).data)

class ChatView(APIView):
    def post(self, request, session_id):
        content = (request.data.get("content") or "").strip()
        if not content:
            return Response({"detail": "content is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            s = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"detail": "Session not found"}, status=status.HTTP_404_NOT_FOUND)

        # guarda mensaje usuario
        ChatMessage.objects.create(session=s, role=ChatMessage.ROLE_USER, content=content)

        # auto-título si está vacío
        if not s.title:
            s.title = (content[:60]).strip()
            s.save(update_fields=["title"])

        stream = request.query_params.get("stream") in ("1", "true", "yes")
        messages = _build_messages_from_db(s)

        if stream:
            def event_stream():
                full = []
                try:
                    r = _ollama_chat(messages, stream=True)
                    r.raise_for_status()
                    for line in r.iter_lines(decode_unicode=True):
                        if not line:
                            continue
                        obj = json.loads(line)
                        delta = (obj.get("message") or {}).get("content") or ""
                        if delta:
                            full.append(delta)
                            yield f"data: {json.dumps({'delta': delta})}\n\n"
                        if obj.get("done"):
                            break
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                finally:
                    assistant_text = "".join(full).strip()
                    if assistant_text:
                        ChatMessage.objects.create(session=s, role=ChatMessage.ROLE_ASSISTANT, content=assistant_text)
                    yield "data: [DONE]\n\n"

            resp = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
            resp["Cache-Control"] = "no-cache"
            return resp

        # no streaming: stream=false
        try:
            r = _ollama_chat(messages, stream=False)
            r.raise_for_status()
            data = r.json()
            assistant_text = ((data.get("message") or {}).get("content") or "").strip()
        except Exception as e:
            return Response({"detail": "Ollama error", "error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        ChatMessage.objects.create(session=s, role=ChatMessage.ROLE_ASSISTANT, content=assistant_text)
        return Response({"assistant": assistant_text})