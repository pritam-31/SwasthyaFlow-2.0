import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { FloatingPanel } from './FloatingPanel'

function Host({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <MemoryRouter>
      <button ref={ref} type="button">
        Open
      </button>
      <FloatingPanel open anchorRef={ref} onClose={onClose} ariaLabel="Test menu">
        <button type="button" data-menu-item>
          First
        </button>
        <button type="button" data-menu-item>
          Second
        </button>
      </FloatingPanel>
    </MemoryRouter>
  )
}

function ClosedHost({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <MemoryRouter>
      <button ref={ref} type="button">
        Open
      </button>
      <FloatingPanel open={false} anchorRef={ref} onClose={onClose} ariaLabel="Closed menu">
        <span>hidden</span>
      </FloatingPanel>
    </MemoryRouter>
  )
}

describe('FloatingPanel', () => {
  it('renders into the document (portal) while open', () => {
    render(<Host onClose={() => undefined} />)
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First' })).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    const { unmount } = render(<ClosedHost onClose={() => undefined} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    unmount()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when a pointer-down lands outside the panel and anchor', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the pointer-down stays inside the panel', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Second' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus to the first item when it opens', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    // Focus is moved on a short delay after mount.
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus())
  })
})