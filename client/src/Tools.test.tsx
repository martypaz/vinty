import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Tools } from './Tools'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the one tool with its button', () => {
    render(<Tools />)

    expect(screen.getByRole('button', { name: 'Clear #approvals bot posts' })).toBeInTheDocument()
    expect(screen.getByText(/deletes every message this bot has posted/i)).toBeInTheDocument()
  })

  it('shows a loading state and disables the button while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear #approvals bot posts' }))

    const button = await screen.findByRole('button', { name: 'Clearing…' })
    expect(button).toBeDisabled()

    resolveFetch(jsonResponse({ deletedCount: 0, failedCount: 0, errors: [] }))
    await waitFor(() => expect(screen.getByText('No messages to delete.')).toBeInTheDocument())
  })

  it('shows the deleted count on success, with correct singular/plural wording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ deletedCount: 5, failedCount: 0, errors: [] }))
    )

    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear #approvals bot posts' }))

    expect(await screen.findByText('Deleted 5 messages.')).toBeInTheDocument()
  })

  it('uses singular wording for exactly one deleted message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ deletedCount: 1, failedCount: 0, errors: [] }))
    )

    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear #approvals bot posts' }))

    expect(await screen.findByText('Deleted 1 message.')).toBeInTheDocument()
  })

  it('shows a partial-failure result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ deletedCount: 3, failedCount: 2, errors: ['x', 'y'] }))
    )

    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear #approvals bot posts' }))

    expect(await screen.findByText('Deleted 3 of 5 messages (2 failed).')).toBeInTheDocument()
  })

  it('shows "No messages to delete." when there is nothing to delete', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ deletedCount: 0, failedCount: 0, errors: [] }))
    )

    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear #approvals bot posts' }))

    expect(await screen.findByText('No messages to delete.')).toBeInTheDocument()
  })

  it('shows an inline error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500)))

    render(<Tools />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear #approvals bot posts' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})
