import { useState } from 'react'
import { clearApprovalsPosts } from './api'

export function Tools() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClear = async () => {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const { deletedCount, failedCount } = await clearApprovalsPosts()
      if (deletedCount === 0 && failedCount === 0) {
        setResult('No messages to delete.')
      } else if (failedCount > 0) {
        setResult(
          `Deleted ${deletedCount} of ${deletedCount + failedCount} messages (${failedCount} failed).`
        )
      } else {
        setResult(`Deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'}.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear #approvals posts')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section>
      <h2>Tools</h2>
      <ul className="tools-list">
        <li className="tool-item">
          <div>
            <strong>Clear #approvals bot posts</strong>
            <p>Deletes every message this bot has posted to #approvals. This cannot be undone.</p>
          </div>
          <button type="button" onClick={handleClear} disabled={running}>
            {running ? 'Clearing…' : 'Clear #approvals bot posts'}
          </button>
        </li>
      </ul>

      {result && <p className="tool-result">{result}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
