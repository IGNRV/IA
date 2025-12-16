from rest_framework import serializers
from .models import ChatSession, ChatMessage

class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "created_at"]

class ChatSessionSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ["id", "title", "custom_instructions", "created_at", "last_message"]

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg:
            return None
        return {"role": msg.role, "content": msg.content, "created_at": msg.created_at}