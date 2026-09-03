import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { currentAdmin, signIn } from '@/lib/auth'

/**
 * The way in, and the only page under `/admin` that an anonymous request is
 * meant to reach. It is also where a rejection lands: `pages.error` points here,
 * so an account that is not on the allowlist gets a sentence in Spanish instead
 * of Auth.js's English error screen.
 */

/**
 * What can arrive in `?error=`. Auth.js only forwards a code to the browser if
 * it is in its own client-safe set (`clientErrors` in `@auth/core/errors`);
 * everything else it reports as `Configuration`. Of that set, three can reach
 * this configuration -- there is no credentials provider, no adapter and no
 * email provider, so the account-linking, credentials and verification codes
 * cannot happen here and are not answered.
 *
 * The distinction the table exists to keep is between the three kinds of "no":
 * you are not on the list, something went wrong on the way, and the deployment
 * is broken. Only the last is the maintainer's problem, and only it says so --
 * telling somebody who pressed Cancel that the server is misconfigured sends
 * them looking for help they do not need.
 */
const MESSAGES: Record<string, string> = {
  AccessDenied: 'Esa cuenta no tiene acceso al panel.',
  // Not a rejection: the allowlist could not be read. Kept apart from
  // AccessDenied on purpose -- see the `signIn` callback in `src/lib/auth.ts`.
  Unavailable: 'No pudimos verificar tu acceso. Probá de nuevo en unos segundos.',
  // Google did not come back with an account. Cancelling on its account chooser
  // is the ordinary way to get here, and it is not an error worth alarming over.
  OAuthCallbackError: 'No se completó el ingreso con Google. Probá de nuevo.',
  // The form outlived its token, which is what an abandoned tab looks like.
  MissingCSRF: 'La página estuvo abierta demasiado tiempo. Recargala y probá de nuevo.',
  Configuration:
    'El servidor no está bien configurado (faltan AUTH_SECRET, AUTH_GOOGLE_ID o ' +
    'AUTH_GOOGLE_SECRET, o no coinciden con el cliente de Google).',
}

/** An unrecognised code is not evidence of a broken deployment, so it does not claim to be one. */
const UNKNOWN = 'No se pudo completar el ingreso. Probá de nuevo.'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default async function SignIn(props: PageProps<'/admin/signin'>) {
  // Already in: no reason to show a sign-in button to someone who is signed in.
  if (await currentAdmin()) redirect('/admin')

  const { error } = await props.searchParams
  const message = typeof error === 'string' ? (MESSAGES[error] ?? UNKNOWN) : null

  return (
    <div className="mx-auto max-w-md py-10 text-center sm:py-20">
      <h1 className="t-section mx-auto">Panel</h1>
      <p className="t-intro text-muted mt-4">
        Fototeca La Pelada. Entrá con la cuenta de Google que tenga acceso al archivo.
      </p>

      {message && (
        <p role="alert" className="bg-surface border-rule t-credit mt-8 border p-4">
          {message}
        </p>
      )}

      {/* A POST through a server action: the button is not a link, so nothing
          starts a sign-in by being prefetched or crawled. */}
      <form
        className="mt-8"
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/admin' })
        }}
      >
        <button
          type="submit"
          className="border-rule text-text hover:border-accent hover:text-accent focus-visible:outline-focus flex min-h-11 w-full cursor-pointer items-center justify-center gap-3 border px-5 font-sans text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <GoogleMark />
          Entrar con Google
        </button>
      </form>
    </div>
  )
}

/** Google's four-colour G, at the one size it is used. Their brand, so their colours. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
