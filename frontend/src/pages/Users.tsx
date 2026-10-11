import { Box, Typography } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid-pro'
import { KeyRound, ShieldCheck, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AppDataGrid } from '../components/AppDataGrid'
import { Badge, Button, Card, PageHeader } from '../components/ui'
import * as api from '../services/api'
import type { AuthUser } from '../services/api'
import { ROLE_DISPLAY } from '../services/rbacService'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../store/AppStore'
import type { UserRole } from '../types/triage'

const FACILITY_ROLE_OPTIONS: UserRole[] = ['patient', 'nurse', 'doctor', 'facility-admin']

/** Admin-only account management: create staff, change roles, remove users. */
export default function UsersPage() {
  const { pushToast } = useApp()
  const { isSystemAdmin } = useAuth()
  const roleOptions = isSystemAdmin ? (['patient', 'nurse', 'doctor', 'system-admin', 'facility-admin'] as UserRole[]) : FACILITY_ROLE_OPTIONS
  const [users, setUsers] = useState<AuthUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'nurse' as UserRole })
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    api
      .listUsers()
      .then((r) => {
        setUsers(r.users)
        setError(null)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load users.'))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createUser = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const { user } = await api.createUser({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        password: form.password,
        role: form.role,
      })
      pushToast('success', `Created ${user.username} as ${ROLE_DISPLAY[user.role]}`)
      setForm({ username: '', displayName: '', password: '', role: 'nurse' })
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not create the user.')
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (user: AuthUser, role: UserRole) => {
    if (role === user.role) return
    try {
      await api.updateUserRole(user.id, role)
      pushToast('success', `${user.displayName} is now ${ROLE_DISPLAY[role]}`)
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not change the role.')
    }
  }

  const removeUser = async (user: AuthUser) => {
    try {
      await api.deleteUser(user.id)
      pushToast('success', `Deleted ${user.username}`)
      setPendingDelete(null)
      refresh()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not delete the user.')
    }
  }

  const columns: GridColDef<AuthUser>[] = [
    {
      field: 'displayName',
      headerName: 'Account',
      flex: 1,
      minWidth: 200,
      renderCell: (p) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {p.row.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            since {new Date(p.row.createdAt).toLocaleDateString('en-IN')}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'username',
      headerName: 'Username',
      width: 180,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
          {p.row.username}
        </Typography>
      ),
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 220,
      renderCell: (p) => (
        <select
          value={p.row.role}
          onChange={(e) => changeRole(p.row, e.target.value as UserRole)}
          className="inp"
          aria-label={`Role for ${p.row.displayName}`}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {ROLE_DISPLAY[r]}
            </option>
          ))}
        </select>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 130,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) =>
        pendingDelete === p.row.id ? (
          <span className="inline-flex items-center gap-1.5">
            <Button size="sm" variant="danger" onClick={() => removeUser(p.row)}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(p.row.id)}>
            <Trash2 size={13} />
          </Button>
        ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        subtitle="Every action in the app is attributed to a signed-in account. Roles decide what each account can see and do — patients can only ever reach their own records."
        icon={<UsersIcon size={18} />}
        action={
          <Badge className="bg-lime-50 text-lime-700 ring-lime-200" icon={<ShieldCheck size={12} />}>
            Admin only
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Accounts" subtitle={`${users ? users.length : 0} account(s) on this facility`} pad={false}>
          <AppDataGrid<AuthUser>
            rows={users ?? []}
            columns={columns}
            ariaLabel="Accounts"
            storageKey="users"
            loading={!users && !error}
            error={error}
            onRetry={refresh}
            getRowId={(u) => u.id}
            rowHeight={58}
            quickFilterPlaceholder="Search accounts…"
            emptyTitle="No accounts yet"
            emptyBody="Create the first account on the right."
          />
        </Card>

        <Card title="Create account" subtitle="Staff accounts you set up here can sign in immediately.">
          <form onSubmit={createUser} className="space-y-3.5">
            <Field label="Username">
              <input
                className="inp"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="3–32 chars: a–z 0–9 . _ -"
                required
              />
            </Field>
            <Field label="Full name">
              <input
                className="inp"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="e.g. Dr. P. Nair"
                required
              />
            </Field>
            <Field label="Password" hint="Minimum 8 characters with a letter and a digit.">
              <input
                className="inp"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
            <Field label="Role">
              <select
                className="inp"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_DISPLAY[r]}
                  </option>
                ))}
              </select>
            </Field>

            <Button type="submit" disabled={busy} className="w-full">
              <UserPlus size={14} /> {busy ? 'Creating…' : 'Create account'}
            </Button>

            <p className="flex items-start gap-1.5 text-[11px] text-ink-400">
              <KeyRound size={12} className="mt-0.5 shrink-0" />
              Passwords are salted and hashed server-side (scrypt). No account can be given prescribing
              power — the app has no prescribing flow at all.
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </div>
  )
}
