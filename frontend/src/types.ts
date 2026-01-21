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
  tags: string[]
  tie_strength: 'close' | 'medium' | 'weak'
  created_at: string
  updated_at: string
}

export type Interaction = {
  id: string
  contact_id: string
  type: string
  occurred_at: string
  summary?: string | null
  created_at: string
}

export type Reminder = {
  id: string
  type: string
  status: string
  title?: string | null
  due_at: string
}

export type ApiRequestOptions = {
  method?: string
  body?: Record<string, unknown>
  params?: Record<string, string | number | undefined>
}

export type ImportContact = {
  display_name: string
  emails: string[]
  phones: string[]
}
