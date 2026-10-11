import { Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'

/** Friendly 404 rendered inside the app shell for unknown /app/* paths. */
export default function NotFound() {
  const navigate = useNavigate()
  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          <Compass size={24} />
        </div>
        <h1 className="text-xl font-extrabold tracking-tight text-ink-900">Page not found</h1>
        <p className="max-w-sm text-sm leading-relaxed text-ink-500">
          That section doesn’t exist or may have moved. Head back to your dashboard to continue.
        </p>
        <Button className="mt-2" onClick={() => navigate('/app')}>
          Go to dashboard
        </Button>
      </div>
    </Card>
  )
}
