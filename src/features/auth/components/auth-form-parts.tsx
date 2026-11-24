import { Loader2 } from 'lucide-react'
import type * as React from 'react'
import { FacebookIcon } from '@/components/layout/social-icons'
import { Button } from '@/components/ui/button'
import { UnavailableButton } from '@/features/nft-detail/components/unavailable-button'
import { cn } from '@/lib/utils'

/** Primary submit: disabled with a spinner while the request is in flight (no double submit). */
export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="h-[3.75rem] w-full rounded-[0.625rem] text-base font-bold tracking-[0.04em] disabled:opacity-80 md:h-11 md:rounded-[0.125rem] md:text-[0.9375rem]"
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </Button>
  )
}

/** Form-level message announced to assistive technology. */
export function FormAlert({ children, tone = 'error' }: { children: React.ReactNode; tone?: 'error' | 'info' }) {
  return (
    <p
      role="alert"
      className={cn(
        'rounded-sm border px-3 py-2 text-sm',
        tone === 'error' ? 'border-destructive/60 text-destructive' : 'border-border-accent text-brand',
      )}
    >
      {children}
    </p>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  )
}

const socialClass =
  'flex h-10 w-full items-center justify-center gap-2.5 rounded-[0.125rem] border border-border text-[0.8125rem] tracking-[0.02em] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:rounded-sm'

/**
 * "Ou continue com" + Google/Facebook. Social sign-in is not part of this
 * release: both buttons use the unavailable pattern (no request, no fake success).
 */
export function SocialSignIn() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-foreground md:-mx-[5rem]" role="presentation">
        <span className="h-px flex-1 bg-border" />
        <span>Ou continue com</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <UnavailableButton className={socialClass}>
        <GoogleIcon />
        Continuar com Google
      </UnavailableButton>
      <UnavailableButton className={socialClass}>
        <FacebookIcon className="text-[#3b5998]" />
        Continuar com Facebook
      </UnavailableButton>
    </div>
  )
}
