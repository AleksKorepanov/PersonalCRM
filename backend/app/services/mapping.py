from __future__ import annotations

# OpenAPI <-> DB enum mapping (contracts diverge in naming)

INTRO_TO_DB = {
    "requested": "requested",
    "approved_a": "approved_a",
    "approved_b": "approved_b",
    "sent": "sent",
    "met": "met",
    "completed": "closed_success",
    "canceled": "cancelled",
}

INTRO_FROM_DB = {
    "requested": "requested",
    "approved_a": "approved_a",
    "approved_b": "approved_b",
    "sent": "sent",
    "met": "met",
    "closed_success": "completed",
    "closed_no_fit": "completed",
    "cancelled": "canceled",
}

REMINDER_TYPE_TO_DB = {
    "follow_up": "followup",
    "birthday": "birthday",
    "anniversary": "anniversary",
    "task": "custom",
    "custom": "custom",
}

REMINDER_TYPE_FROM_DB = {
    "followup": "follow_up",
    "touchpoint": "follow_up",
    "birthday": "birthday",
    "anniversary": "anniversary",
    "project": "task",
    "custom": "custom",
}

REMINDER_STATUS_TO_DB = {
    "open": "open",
    "done": "done",
    "canceled": "cancelled",
}

REMINDER_STATUS_FROM_DB = {
    "open": "open",
    "done": "done",
    "cancelled": "canceled",
    "snoozed": "open",
}

PROJECT_STATUS_TO_DB = {
    "idea": "idea",
    "active": "active",
    "on_hold": "paused",
    "completed": "done",
    "canceled": "cancelled",
}

PROJECT_STATUS_FROM_DB = {
    "idea": "idea",
    "active": "active",
    "paused": "on_hold",
    "done": "completed",
    "cancelled": "canceled",
}
