
'use client'

import { useEffect, useState } from 'react'

export default function SecurityGuard() {
  const [warning, setWarning] = useState(false)

  useEffect(() => {
    // Détection des raccourcis DevTools
    const detectShortcut = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()

      const blocked =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (e.ctrlKey && key === 'u') ||
        (e.metaKey && e.altKey && key === 'i')

      if (blocked) {
        e.preventDefault()
        e.stopPropagation()
        setWarning(true)
      }
    }

    // Bloquer le clic droit
    const blockRightClick = (e: MouseEvent) => {
      e.preventDefault()
      setWarning(true)
    }

    // Détection approximative de DevTools
    const detectDevTools = () => {
      const threshold = 160

      const widthDiff =
        window.outerWidth - window.innerWidth > threshold

      const heightDiff =
        window.outerHeight - window.innerHeight > threshold

      if (widthDiff || heightDiff) {
        setWarning(true)
      }
    }

    // Bloquer les raccourcis
    document.addEventListener('keydown', detectShortcut, true)

    // Bloquer le menu clic droit
    document.addEventListener('contextmenu', blockRightClick)

    // Surveiller le changement de dimensions
    window.addEventListener('resize', detectDevTools)

    return () => {
      document.removeEventListener('keydown', detectShortcut, true)
      document.removeEventListener('contextmenu', blockRightClick)
      window.removeEventListener('resize', detectDevTools)
    }
  }, [])

  if (!warning) return null

  return (
    <div className="security-overlay">
      <div className="security-popup">
        <div className="security-icon">🛡️</div>

        <h2>Accès de sécurité détecté</h2>

        <p>
          Une action liée aux outils de développement
          ou à l'inspection de la plateforme a été détectée.
        </p>

        <p>
          Pour des raisons de sécurité, merci de respecter
          les règles d'utilisation de cette plateforme.
        </p>

        <button
          type="button"
          className="security-button"
          onClick={() => setWarning(false)}
        >
          Compris
        </button>
      </div>
    </div>
  )
}
