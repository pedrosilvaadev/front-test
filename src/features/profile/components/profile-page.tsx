import { useQuery } from '@tanstack/react-query'
import { ImageIcon } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AVATAR_MIME_TYPES, type Profile } from '@/contracts'
import { AuthedPending } from '@/features/auth/components/authed-states'
import { useDocumentTitle, useSession, useSessionManager } from '@/features/auth/use-session'
import { genericErrorMessage } from '../account-errors'
import {
  avatarDataUrlError,
  avatarFileError,
  AVATAR_MESSAGES,
  hasPasswordInput,
  passwordServerErrors,
  profileServerErrors,
  profileValues,
  readFileAsDataUrl,
  validatePassword,
  validateProfile,
  type Errors,
  type PasswordField,
  type PasswordValues,
  type ProfileField,
  type ProfileValues,
} from '../profile-form'
import { profileQueryOptions, useProfileMutations } from '../profile-queries'
import { accountInputClass, errorProps, primaryButtonClass } from '../account-styles'
import { EnsInput, Field, PasswordInput } from './account-fields'
import { AccountShell } from './account-shell'
import { AccountError, AccountLoading } from './account-states'

/**
 * Figma "Perfil do colecionador" (P3-02): profile data, avatar (immediate
 * upload with preview and type/size validation), password change and logout.
 * "Salvar" saves the profile and, when any password field is filled, changes
 * the password too. Saved names show in the header at once (session patch).
 */
export function ProfilePage() {
  useDocumentTitle('Perfil do colecionador')
  const session = useSession()
  if (session.status !== 'authenticated') return <AuthedPending />
  return (
    <AccountShell section="profile" testId="profile-summary">
      <ProfileLoader userId={session.user.id} />
    </AccountShell>
  )
}

function ProfileLoader({ userId }: { userId: string }) {
  const manager = useSessionManager()
  const query = useQuery(profileQueryOptions(userId, manager))
  if (query.data) return <ProfileForm key={userId} profile={query.data} />
  if (query.isError) return <AccountError onRetry={() => void query.refetch()} retrying={query.isFetching} />
  return <AccountLoading label="Carregando perfil…" />
}

const EMPTY_PASSWORD: PasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' }

function ProfileForm({ profile }: { profile: Profile }) {
  const baseId = useId()
  const fieldId = (name: string) => `${baseId}-${name}`
  const { update, password } = useProfileMutations(profile.userId)
  const [values, setValues] = useState<ProfileValues>(() => profileValues(profile))
  const [passwords, setPasswords] = useState<PasswordValues>(EMPTY_PASSWORD)
  const [errors, setErrors] = useState<Errors<ProfileField>>({})
  const [passwordErrors, setPasswordErrors] = useState<Errors<PasswordField>>({})
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const saving = update.isPending || password.isPending

  function focusFirstInvalid() {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  function setField<K extends ProfileField>(field: K, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function setPassword<K extends PasswordField>(field: K, value: string) {
    setPasswords((current) => ({ ...current, [field]: value }))
    if (passwordErrors[field]) setPasswordErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setStatus(null)
    const profileResult = validateProfile(values)
    const wantsPassword = hasPasswordInput(passwords)
    const passwordResult = wantsPassword ? validatePassword(passwords) : null
    setErrors(profileResult.ok ? {} : profileResult.errors)
    setPasswordErrors(passwordResult && !passwordResult.ok ? passwordResult.errors : {})
    if (!profileResult.ok || (passwordResult && !passwordResult.ok)) {
      setStatus({ tone: 'error', message: 'Corrija os campos destacados.' })
      focusFirstInvalid()
      return
    }
    try {
      await update.mutateAsync(profileResult.data)
    } catch (error) {
      const mapped = profileServerErrors(error)
      if (mapped) setErrors(mapped)
      setStatus({ tone: 'error', message: mapped ? 'Corrija os campos destacados.' : genericErrorMessage(error) })
      focusFirstInvalid()
      return
    }
    if (!passwordResult) {
      setStatus({ tone: 'success', message: 'Perfil salvo.' })
      return
    }
    try {
      await password.mutateAsync(passwordResult.data)
      setPasswords(EMPTY_PASSWORD)
      setStatus({ tone: 'success', message: 'Perfil salvo e senha alterada.' })
    } catch (error) {
      const mapped = passwordServerErrors(error)
      if (mapped) setPasswordErrors(mapped)
      setStatus({
        tone: 'error',
        message: mapped ? 'Perfil salvo, mas a senha não foi alterada. Corrija os campos destacados.' : genericErrorMessage(error),
      })
      focusFirstInvalid()
    }
  }

  const text = (field: ProfileField) => ({
    ...errorProps(fieldId(field), errors[field]),
    name: field,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement>) => setField(field, event.target.value),
    className: accountInputClass,
  })

  return (
    <section aria-labelledby={fieldId('title')} className="flex min-w-0 flex-col gap-6">
      <h1 id={fieldId('title')} className="text-[0.9375rem] font-bold tracking-[0.04em] text-foreground md:text-base">
        Perfil do colecionador
      </h1>
      <form ref={formRef} noValidate onSubmit={(event) => void handleSubmit(event)} className="flex min-w-0 flex-col gap-6">
        <div className="grid min-w-0 gap-x-7 gap-y-6 md:grid-cols-2">
          <Field id={fieldId('displayName')} label="Nome de exibição" required error={errors.displayName}>
            <input {...text('displayName')} autoComplete="nickname" />
          </Field>
          <Field id={fieldId('username')} label="Nome de usuário" required error={errors.username}>
            <input {...text('username')} autoComplete="username" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field id={fieldId('email')} label="E-mail" required error={errors.email}>
            <input {...text('email')} type="email" inputMode="email" autoComplete="email" />
          </Field>
          <Field id={fieldId('ens')} label="Nome ENS" error={errors.ens}>
            <EnsInput
              id={fieldId('ens')}
              error={errors.ens}
              name="ens"
              placeholder="seu-nome"
              value={values.ens}
              onChange={(event) => setField('ens', event.target.value)}
            />
          </Field>
          <Field id={fieldId('walletNickname')} label="Apelido da carteira" required error={errors.walletNickname}>
            <input {...text('walletNickname')} autoComplete="off" />
          </Field>
          <AvatarField profile={profile} />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-6 md:max-w-[calc(50%-0.875rem)]">
          <legend className="mb-4 text-[0.9375rem] font-bold tracking-[0.04em] text-foreground md:text-base">Alterar senha</legend>
          <Field id={fieldId('currentPassword')} label="Senha atual" error={passwordErrors.currentPassword}>
            <PasswordInput
              id={fieldId('currentPassword')}
              error={passwordErrors.currentPassword}
              toggleLabel="Mostrar senha atual"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) => setPassword('currentPassword', event.target.value)}
            />
          </Field>
          <Field id={fieldId('newPassword')} label="Nova senha" error={passwordErrors.newPassword}>
            <PasswordInput
              id={fieldId('newPassword')}
              error={passwordErrors.newPassword}
              toggleLabel="Mostrar nova senha"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(event) => setPassword('newPassword', event.target.value)}
            />
          </Field>
          <Field id={fieldId('confirmPassword')} label="Confirmar nova senha" error={passwordErrors.confirmPassword}>
            <PasswordInput
              id={fieldId('confirmPassword')}
              error={passwordErrors.confirmPassword}
              toggleLabel="Mostrar confirmação da nova senha"
              autoComplete="new-password"
              value={passwords.confirmPassword}
              onChange={(event) => setPassword('confirmPassword', event.target.value)}
            />
          </Field>
        </fieldset>

        <div className="flex flex-col items-start gap-3">
          <button type="submit" className={primaryButtonClass} disabled={saving} aria-busy={saving || undefined}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <p
            role={status?.tone === 'error' ? 'alert' : 'status'}
            data-testid="profile-status"
            className={status?.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-brand'}
          >
            {status?.message ?? ''}
          </p>
        </div>
      </form>
    </section>
  )
}

function AvatarField({ profile }: { profile: Profile }) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const { avatar } = useProfileMutations(profile.userId)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const src = preview ?? profile.avatarUrl

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    const fileError = avatarFileError(file)
    if (fileError) {
      setError(fileError)
      return
    }
    let dataUrl: string
    try {
      dataUrl = await readFileAsDataUrl(file)
    } catch {
      setError(AVATAR_MESSAGES.read)
      return
    }
    const urlError = avatarDataUrlError(dataUrl)
    if (urlError) {
      setError(urlError)
      return
    }
    setPreview(dataUrl)
    avatar.mutate(
      { dataUrl },
      {
        onError: (cause) => setError(profileServerErrors(cause) ? AVATAR_MESSAGES.type : genericErrorMessage(cause)),
        onSettled: () => setPreview(null),
      },
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-labelledby={`${inputId}-label`}>
      <span id={`${inputId}-label`} className="text-[0.9375rem] tracking-[0.04em] text-foreground">
        Avatar
      </span>
      <div className="flex flex-wrap items-center gap-6">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-accent bg-card text-brand">
          {src ? (
            <img src={src} alt="Avatar atual" data-testid="profile-avatar" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5" aria-hidden="true" />
          )}
        </span>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-label="Escolher imagem do avatar"
          onChange={(event) => {
            void onFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className={primaryButtonClass}
          disabled={avatar.isPending}
          aria-busy={avatar.isPending || undefined}
          onClick={() => fileRef.current?.click()}
        >
          Alterar
        </button>
        <button
          type="button"
          className="rounded-sm text-[0.8125rem] tracking-[0.04em] text-foreground outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          disabled={avatar.isPending || !profile.avatarUrl}
          onClick={() => {
            setError(null)
            avatar.mutate(null, { onError: (cause) => setError(genericErrorMessage(cause)) })
          }}
        >
          Remover
        </button>
      </div>
      <p role="alert" className="text-xs text-destructive" data-testid="avatar-error">
        {error ?? ''}
      </p>
    </div>
  )
}
