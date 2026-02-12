from fastapi import APIRouter, Depends

from app.api.v1 import me, workspaces, organizations, contacts, interactions, introductions, reminders, strategy, projects, rbac, audit, search, assistant_messages, calendar, email_import
from app.core.deps import set_request_context

router = APIRouter(prefix="/api/v1", dependencies=[Depends(set_request_context)])

router.include_router(me.router, tags=["me"])
router.include_router(workspaces.router, tags=["workspaces"])
router.include_router(rbac.router, tags=["rbac"])
router.include_router(organizations.router, tags=["organizations"])
router.include_router(contacts.router, tags=["contacts"])
router.include_router(interactions.router, tags=["interactions"])
router.include_router(introductions.router, tags=["introductions"])
router.include_router(reminders.router, tags=["reminders"])
router.include_router(strategy.router, tags=["strategy"])
router.include_router(projects.router, tags=["projects"])
router.include_router(audit.router, tags=["audit"])
router.include_router(search.router, tags=["search"])
router.include_router(assistant_messages.router, tags=["assistant"])
router.include_router(calendar.router, tags=["calendar"])
router.include_router(email_import.router, tags=["email"])