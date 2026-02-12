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
  private healthChecked = false

  constructor(request: APIRequestContext) {
    this.request = request
    this.baseUrl = process.env.PLAYWRIGHT_API_URL || 'http://localhost:8000'
  }

  private async ensureBackendReady() {
    if (this.healthChecked) return
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const res = await this.request.get(`${this.baseUrl}/health`)
        if (res.ok()) {
          this.healthChecked = true
          return
        }
      } catch {
        // ignore and retry
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    throw new Error('Backend health check failed')
  }

  async getWorkspaceId(role: Role = 'owner') {
    const cached = this.workspaceCache.get(role)
    if (cached) return cached
    await this.ensureBackendReady()
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

  async listReminders(role: Role = 'owner') {
    return this.apiRequest<{ data: Array<{ id: string; contact_id?: string | null }> }>(role, 'GET', '/api/v1/reminders')
  }

  async importCalendar(events: Array<{ summary: string; start: string; attendees: string[] }>, role: Role = 'owner') {
    const workspaceId = await this.getWorkspaceId(role)
    const url = new URL('/api/v1/calendar/import', this.baseUrl)
    url.searchParams.set('workspace_id', workspaceId)
    const payload = JSON.stringify({ events })
    const res = await this.request.post(url.toString(), {
      headers: { 'X-Debug-Role': role },
      multipart: {
        file: {
          name: 'events.json',
          mimeType: 'application/json',
          buffer: Buffer.from(payload, 'utf-8'),
        },
      },
    })
    const text = await res.text()
    if (!res.ok()) {
      throw new Error(`API POST /api/v1/calendar/import failed: ${res.status()} ${text}`)
    }
    return text ? JSON.parse(text) : null
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
