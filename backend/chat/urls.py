from django.urls import path
from .views import HealthView, SessionListCreateView, SessionDetailView, SessionMessagesView, ChatView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("sessions/", SessionListCreateView.as_view(), name="sessions"),
    path("sessions/<uuid:session_id>/", SessionDetailView.as_view(), name="session-detail"),
    path("sessions/<uuid:session_id>/messages/", SessionMessagesView.as_view(), name="session-messages"),
    path("sessions/<uuid:session_id>/chat/", ChatView.as_view(), name="chat"),
]