export type MeResponse = {
  user: {
    id: string
    email: string
    display_name?: string | null
  }
  workspaces: Array<{
    workspace: {
      id: string
      name: string
      created_at: string
    }
    membership: {
      workspace_id: string
      user_id: string
      email?: string | null
      display_name?: string | null
      membership_role: string
      is_active: boolean
      created_at: string
    }
  }>
}

export type Contact = {
  id: string
  workspace_id: string
  visibility: 'private' | 'shared' | 'limited'
  display_name: string
  emails: string[]
  phones: string[]
  messengers?: Record<string, string>
  tags: string[]
  tie_strength: 'close' | 'medium' | 'weak'
  created_at: string
  updated_at: string
  company?: string | null
  company_name?: string | null
  organization?: { name: string } | null
  job_title?: string | null
  industries?: string[]
  competencies?: string[]
  met_context?: string | null
  shared_notes?: string | null
  private_notes?: string | null
}

export type Interaction = {
  id: string
  contact_id: string
  type: string
  occurred_at: string
  summary?: string | null
  outcome?: string | null
  created_at: string
}

export type Reminder = {
  id: string
  contact_id?: string | null
  type: string
  status: string
  title?: string | null
  due_at: string
}

export type Introduction = {
  id: string
  workspace_id: string
  status: string
  requester_contact_id: string
  introducer_contact_id: string
  target_contact_id: string
  ask: string
  benefit_for_requester?: string | null
  benefit_for_target?: string | null
  consent_requester: boolean
  consent_target: boolean
  sent_at?: string | null
  met_at?: string | null
  outcome?: string | null
  created_at: string
  updated_at: string
}

export type AuditEvent = {
  id: string
  workspace_id: string
  actor_user_id?: string | null
  action_key: string
  entity_type: string
  entity_id?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  created_at: string
}

export type AssistantMessageCreate = {
  target_type: 'contact' | 'reminder' | 'introduction'
  target_id: string
  task: string
  reason?: string | null
  due_at?: string | null
}

export type ApiRequestOptions = {
  method?: string
  body?: Record<string, unknown> | FormData
  params?: Record<string, string | number | undefined>
}

export type ImportReport = {
  imported: number
  skipped: number
  errors: Array<{ line: number; message: string }>
}

export type DuplicateGroup = {
  reason: 'email' | 'phone' | 'name'
  primary_contact: Contact
  candidates: Contact[]
}

export type SearchProjectResult = {
  id: string
  name: string
  status?: string | null
}

export type SearchIntroductionResult = {
  id: string
  status: string
  requester_contact_id: string
  introducer_contact_id: string
  target_contact_id: string
  requester_name?: string | null
  introducer_name?: string | null
  target_name?: string | null
  created_at: string
}

export type SearchResults = {
  contacts: Contact[]
  projects: SearchProjectResult[]
  introductions: SearchIntroductionResult[]
}
