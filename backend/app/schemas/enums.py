from enum import Enum


class Visibility(str, Enum):
    private = "private"
    shared = "shared"
    limited = "limited"


class TieStrength(str, Enum):
    close = "close"
    medium = "medium"
    weak = "weak"


class InteractionType(str, Enum):
    meeting = "meeting"
    call = "call"
    message = "message"
    event = "event"
    intro = "intro"
    help_given = "help_given"
    help_received = "help_received"
    note = "note"


class InteractionChannel(str, Enum):
    in_person = "in_person"
    phone = "phone"
    video = "video"
    email = "email"
    telegram = "telegram"
    whatsapp = "whatsapp"
    other = "other"


class IntroductionStatus(str, Enum):
    requested = "requested"
    approved_a = "approved_a"
    approved_b = "approved_b"
    sent = "sent"
    met = "met"
    completed = "completed"
    canceled = "canceled"


class ReminderType(str, Enum):
    follow_up = "follow_up"
    birthday = "birthday"
    anniversary = "anniversary"
    task = "task"
    custom = "custom"


class ReminderStatus(str, Enum):
    open = "open"
    done = "done"
    canceled = "canceled"


class ProjectStatus(str, Enum):
    idea = "idea"
    active = "active"
    on_hold = "on_hold"
    completed = "completed"
    canceled = "canceled"
