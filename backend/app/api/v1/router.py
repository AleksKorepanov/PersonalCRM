from fastapi import APIRouter

from app.api.v1 import me, workspaces, organizations, contacts, interactions, introductions, reminders, strategy, projects, rbac, audit

router = APIRouter(prefix="/api/v1")

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
