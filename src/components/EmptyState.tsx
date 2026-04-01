interface EmptyStateProps {
  title: string
  description?: string
}

export function EmptyState({ title }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
    </div>
  )
}
