import type { APIRequestContext } from '@playwright/test'

type Role = 'owner' | 'assistant'

type ContactPayload = {
  display_name: string
  visibility?: 'shared' | 'limited' | 'private'
  tie_strength?: 'close' | 'medium' | 'weak'
  tags?: string[]
  emails?: string[]
  phones?: string[]
  shared_notes?: string | null
  private_notes?: string | null
}

type InteractionPayload = {
  type: string
  occurred_at: string
  summary?: string
  next_action?: string
}

type ReminderPayload = {
  contact_id: string
  title?: string
  due_at: string
  type?: string
}

type IntroductionPayload = {
  requester_contact_id: string
  introducer_contact_id: string
  target_contact_id: string
  ask: string
  benefit_for_requester?: string
  benefit_for_target?: string
  status?: string
}

export class ApiHelper {
  private request: APIRequestContext
  private workspaceCache = new Map<Role, string>()
  private createdContacts: string[] = []
  private baseUrl: string

  constructor(request: APIRequestContext) {
    this.request = request
    this.baseUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8000'
  }

  async getWorkspaceId(role: Role = 'owner') {
    const cached = this.workspaceCache.get(role)
    if (cached) return cached
    const res = await this.request.get(`${this.baseUrl}/api/v1/me`, {
      headers: { 'X-Debug-Role': role },
    })
    if (!res.ok()) {
      throw new Error(`Failed to fetch /me for role ${role}: ${res.status()}`)
    }
    const data = await res.json()
    const workspaceId = data.workspaces?.[0]?.workspace?.id
    if (!workspaceId) {
      throw new Error(`No workspace id for role ${role}`)
    }
    this.workspaceCache.set(role, workspaceId)
    return workspaceId
  }

  private async apiRequest<T>(
    role: Role,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const workspaceId = await this.getWorkspaceId(role)
    const url = new URL(path, this.baseUrl)
    url.searchParams.set('workspace_id', workspaceId)
    const res = await this.request.fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Role': role,
      },
      data: body ?? undefined,
    })
    const text = await res.text()
    const payload = text ? JSON.parse(text) : null
    if (!res.ok()) {
      throw new Error(`API ${method} ${path} failed: ${res.status()} ${text}`)
    }
    return payload as T
  }

  async createContact(payload: ContactPayload, role: Role = 'owner') {
    const body = {
      visibility: payload.visibility || 'shared',
      tie_strength: payload.tie_strength || 'medium',
      emails: payload.emails || [],
      phones: payload.phones || [],
      tags: payload.tags || [],
      ...payload,
    }
    const data = await this.apiRequest<{ id: string }>(role, 'POST', '/api/v1/contacts', body)
    this.createdContacts.push(data.id)
    return data
  }

  async deleteContact(contactId: string, role: Role = 'owner') {
    await this.apiRequest(role, 'DELETE', `/api/v1/contacts/${contactId}`)
  }

  async createInteraction(contactId: string, payload: InteractionPayload, role: Role = 'owner') {
    return this.apiRequest(role, 'POST', `/api/v1/contacts/${contactId}/interactions`, payload)
  }

  async createReminder(payload: ReminderPayload, role: Role = 'owner') {
    const body = { ...payload, type: payload.type || 'follow_up' }
    return this.apiRequest(role, 'POST', '/api/v1/reminders', body)
  }

  async createIntroduction(payload: IntroductionPayload, role: Role = 'owner') {
    return this.apiRequest(role, 'POST', '/api/v1/introductions', payload)
  }

  async cleanup() {
    for (const id of this.createdContacts) {
      try {
        await this.deleteContact(id, 'owner')
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
