import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  /** Shows the confirm button in red, for actions that delete something. */
  danger?: boolean
  /** Keeps the confirm button disabled until the user types exactly this text. */
  typeToConfirm?: string
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

interface ConfirmState {
  request: ConfirmRequest | null
  settle: (confirmed: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  settle: (confirmed) => {
    get().request?.resolve(confirmed)
    set({ request: null })
  }
}))

/** In-app replacement for window.confirm. Resolves to true when the user confirms. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  // A second request cancels the one still open.
  useConfirmStore.getState().request?.resolve(false)
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...options, resolve } }))
}
