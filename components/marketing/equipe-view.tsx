'use client'

import type { User, Role } from '@/lib/storage'

interface EquipeViewProps {
  user: User
  team: User[]
  roles: Role[]
}

export function EquipeView({ user, team, roles }: EquipeViewProps) {
  const roleById = new Map(roles.map((role) => [role.id, role]))
  return (
    <section className="workspace-section">
      <div className="workspace-panel">
        <div className="workspace-panel-header">
          <h2>Équipe</h2>
          <span>{team.length} membre{team.length > 1 ? 's' : ''}</span>
        </div>
        <div className="team-grid">
          {team.map((m) => {
            const role = roleById.get(m.role_id)
            return (
              <article key={m.id} className="team-card">
                <span className="team-avatar" aria-hidden="true">
                  {m.prenom.charAt(0).toUpperCase()}{m.nom.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {m.prenom} {m.nom}
                    {m.id === user.id && <span className="team-you">vous</span>}
                  </strong>
                  <span className="team-email">{m.email}</span>
                  <span className="team-role">{role?.nom ?? '—'}</span>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}