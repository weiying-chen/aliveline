import type { ReactNode } from 'react'

type AccordionItemProps = {
  title: string
  isOpen: boolean
  onToggle: () => void
  panelId: string
  children: ReactNode
}

export function AccordionItem({ title, isOpen, onToggle, panelId, children }: AccordionItemProps) {
  return (
    <div className="message" data-state={isOpen ? 'open' : 'closed'}>
      <button
        type="button"
        className="messageHeader"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="messageTitle">{title}</span>
      </button>
      <div
        id={panelId}
        className="messagePanel"
        data-state={isOpen ? 'open' : 'closed'}
        aria-hidden={!isOpen}
      >
        <div className="messagePanelInner">{children}</div>
      </div>
    </div>
  )
}
