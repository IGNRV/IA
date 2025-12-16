from django.contrib import admin
from .models import ChatSession, ChatMessage

@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "created_at")
    search_fields = ("id", "title")
    ordering = ("-created_at",)

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "role", "created_at")
    search_fields = ("content",)
    list_filter = ("role", "created_at")
    ordering = ("-created_at",)
