import { KeyRound, ShieldCheck, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Badge, Button, Card, EmptyState, PageHeader } from '../components/ui'
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
          {error && (
            <p className="m-4 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
              {error}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/70 text-[10px] uppercase tracking-[0.08em] text-ink-500">
                  <th className="px-5 py-3 font-bold">Account</th>
                  <th className="px-3 py-3 font-bold">Username</th>
                  <th className="px-3 py-3 font-bold">Role</th>
                  <th className="px-3 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {users?.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-ink-50/60">
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-bold text-ink-900">{u.displayName}</p>
                      <p className="text-[11px] text-ink-400">
                        since {new Date(u.createdAt).toLocaleDateString('en-IN')}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] text-ink-600">{u.username}</td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as UserRole)}
                        className="inp"
                        aria-label={`Role for ${u.displayName}`}
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_DISPLAY[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {pendingDelete === u.id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Button size="sm" variant="danger" onClick={() => removeUser(u)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setPendingDelete(u.id)}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {users && users.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState icon={<UsersIcon size={20} />} title="No accounts yet" hint="Create the first account on the right." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
