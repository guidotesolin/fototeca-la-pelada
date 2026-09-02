'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The one client component in the panel, and it earns it: a bare
 * `<input type="file">` shows nothing but a grey button and a filename, and the
 * whole point of choosing this file is seeing which photograph it is.
 *
 * It degrades. The input is a real file input sitting invisibly over its own
 * label, not a button that scripts one open, so with JavaScript off the label
 * still opens the picker and the form still submits -- the preview and the
 * "Quitar" button are simply not there. `opacity-0` rather than `sr-only` on
 * purpose: a `required` control that is clipped to a pixel cannot be focused,
 * and a browser refuses to submit a form it cannot show the error on.
 */
export function FilePicker({ name, accept }: { name: string; accept: string }) {
  const input = useRef<HTMLInputElement>(null)
  const preview = useRef<string | null>(null)
  const [chosen, setChosen] = useState<{ file: File; url: string } | null>(null)

  /**
   * The preview URL is made where the choice is made -- in the event -- rather
   * than in an effect that reacts to it. An object URL holds the whole file in
   * memory until it is revoked, so the previous one goes as the next one arrives,
   * and the last one goes when the screen does.
   */
  function choose(file: File | null) {
    if (preview.current) URL.revokeObjectURL(preview.current)
    preview.current = file ? URL.createObjectURL(file) : null
    setChosen(file && preview.current ? { file, url: preview.current } : null)
  }

  useEffect(
    () => () => {
      if (preview.current) URL.revokeObjectURL(preview.current)
    },
    [],
  )

  function clear() {
    // The input itself, not only the preview: the form must not carry a file the
    // screen says was removed.
    if (input.current) input.current.value = ''
    choose(null)
  }

  return (
    <div className="grid gap-3">
      <label className="border-rule bg-surface hover:border-accent focus-within:outline-focus t-label relative inline-flex h-10 w-fit cursor-pointer items-center justify-center border px-4 focus-within:outline-2 focus-within:outline-offset-2">
        <input
          ref={input}
          type="file"
          name={name}
          accept={accept}
          required
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        {chosen ? 'Cambiar archivo' : 'Elegir archivo'}
      </label>

      {chosen && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={chosen.url} alt="" className="mount h-24 w-24 shrink-0 object-cover" />
          <div className="min-w-0">
            <span className="t-meta block truncate">{chosen.file.name}</span>
            <span className="t-meta block">
              {Math.round(chosen.file.size / 1024).toLocaleString('es-AR')} KB
            </span>
            <button
              type="button"
              onClick={clear}
              className="t-credit link text-muted hover:text-text focus-visible:outline-focus mt-1 cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
