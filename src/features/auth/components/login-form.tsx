import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { login } from '@/api/auth'
import { UnavailableLink } from '@/components/layout/unavailable-link'
import type { AuthResponse, LoginRequest } from '@/contracts'
import { mapAuthError, validateLogin, type FieldErrors, type LoginField, type LoginValues } from '../form-validation'
import { FormAlert, SubmitButton } from './auth-form-parts'
import { AuthTextField, PasswordField } from './form-fields'

const FIELDS: readonly LoginField[] = ['email', 'password']

interface LoginFormProps {
  /** Called with the API response; the caller stores the session and navigates. */
  onSuccess: (response: AuthResponse) => void
  /** Shown above the form, e.g. "Sua sessão expirou". */
  notice?: string
}

/**
 * Figma "Login": e-mail, password (show/hide), "Esqueceu a senha?"
 * (unavailable), Entrar. Validated with `loginRequestSchema` before sending;
 * `INVALID_CREDENTIALS` stays a form error (never a session redirect).
 */
export function LoginForm({ onSuccess, notice }: LoginFormProps) {
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors<LoginField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const inFlight = useRef(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const refs = { email: emailRef, password: passwordRef }

  // `gcTime: 0` + `reset()` on success: the variables hold the plaintext password,
  // so they must not linger in the MutationCache (the session manager also clears it).
  const mutation = useMutation({ mutationFn: (body: LoginRequest) => login(body), retry: false, gcTime: 0 })

  function focusFirst(fieldErrors: FieldErrors<LoginField>) {
    const first = FIELDS.find((field) => fieldErrors[field])
    if (first) refs[first].current?.focus()
  }

  function update(field: LoginField, value: string) {
    const next = { ...values, [field]: value }
    setValues(next)
    if (submitted) {
      const result = validateLogin(next)
      setErrors(result.ok ? {} : result.errors)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    setFormError(null)
    const result = validateLogin(values)
    if (!result.ok) {
      setErrors(result.errors)
      focusFirst(result.errors)
      return
    }
    setErrors({})
    inFlight.current = true
    mutation.mutate(result.data, {
      onSuccess: (response) => {
        mutation.reset()
        onSuccess(response)
      },
      onError: (error) => {
        const mapped = mapAuthError(error, FIELDS)
        setErrors(mapped.fieldErrors)
        setFormError(mapped.formError)
        focusFirst(mapped.fieldErrors)
      },
      onSettled: () => {
        inFlight.current = false
      },
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Entrar" className="flex flex-col gap-3">
      {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <AuthTextField
        ref={emailRef}
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="contato@email.com"
        value={values.email}
        error={errors.email}
        onChange={(event) => update('email', event.target.value)}
      />
      <PasswordField
        ref={passwordRef}
        label="Senha"
        toggleLabel="Mostrar senha"
        name="password"
        autoComplete="current-password"
        placeholder="Senha"
        value={values.password}
        error={errors.password}
        onChange={(event) => update('password', event.target.value)}
      />
      <div className="-mt-0.5 flex justify-end">
        <UnavailableLink className="rounded-sm text-[0.8125rem] tracking-[0.02em] text-brand outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Esqueceu a senha?
        </UnavailableLink>
      </div>
      <div className="mt-6 md:mt-3">
        <SubmitButton pending={mutation.isPending}>Entrar</SubmitButton>
      </div>
    </form>
  )
}
