import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { register } from '@/api/auth'
import type { AuthResponse, RegisterRequest } from '@/contracts'
import {
  mapAuthError,
  validateRegister,
  type FieldErrors,
  type RegisterField,
  type RegisterValues,
} from '../form-validation'
import { FormAlert, SubmitButton } from './auth-form-parts'
import { AuthTextField, PasswordField } from './form-fields'

const FIELDS: readonly RegisterField[] = ['username', 'email', 'password', 'confirmPassword']

interface RegisterFormProps {
  onSuccess: (response: AuthResponse) => void
}

/**
 * Figma "Cadastro": username, e-mail, password and confirmation (both with
 * show/hide). Validated with `registerFormSchema`; the confirmation is never
 * sent. `EMAIL_TAKEN`/`USERNAME_TAKEN` and server field errors map to fields.
 */
export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [values, setValues] = useState<RegisterValues>({ username: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const inFlight = useRef(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const refs = { username: usernameRef, email: emailRef, password: passwordRef, confirmPassword: confirmRef }

  // `gcTime: 0` + `reset()` on success: the variables hold the plaintext password,
  // so they must not linger in the MutationCache (the session manager also clears it).
  const mutation = useMutation({ mutationFn: (body: RegisterRequest) => register(body), retry: false, gcTime: 0 })

  function focusFirst(fieldErrors: FieldErrors<RegisterField>) {
    const first = FIELDS.find((field) => fieldErrors[field])
    if (first) refs[first].current?.focus()
  }

  function update(field: RegisterField, value: string) {
    const next = { ...values, [field]: value }
    setValues(next)
    if (submitted) {
      const result = validateRegister(next)
      setErrors(result.ok ? {} : result.errors)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    setFormError(null)
    const result = validateRegister(values)
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
    <form noValidate onSubmit={handleSubmit} aria-label="Criar conta" className="flex flex-col gap-3">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <AuthTextField
        ref={usernameRef}
        label="Nome de usuário"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="Nome de usuário"
        value={values.username}
        error={errors.username}
        onChange={(event) => update('username', event.target.value)}
      />
      <AuthTextField
        ref={emailRef}
        label="E-mail"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="Digite seu e-mail"
        value={values.email}
        error={errors.email}
        onChange={(event) => update('email', event.target.value)}
      />
      <PasswordField
        ref={passwordRef}
        label="Senha"
        toggleLabel="Mostrar senha"
        name="password"
        autoComplete="new-password"
        placeholder="Senha"
        value={values.password}
        error={errors.password}
        onChange={(event) => update('password', event.target.value)}
      />
      <PasswordField
        ref={confirmRef}
        label="Confirmar senha"
        toggleLabel="Mostrar confirmação de senha"
        name="confirmPassword"
        autoComplete="new-password"
        placeholder="Confirmar senha"
        value={values.confirmPassword}
        error={errors.confirmPassword}
        onChange={(event) => update('confirmPassword', event.target.value)}
      />
      <div className="mt-6 md:mt-3">
        <SubmitButton pending={mutation.isPending}>
          <span className="md:hidden">Criar perfil</span>
          <span className="hidden md:inline">Criar conta</span>
        </SubmitButton>
      </div>
    </form>
  )
}
