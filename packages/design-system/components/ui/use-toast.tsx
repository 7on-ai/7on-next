'use client'

import { toast as sonner } from 'sonner'

/**
 * Global toast wrapper for consistent UI across the app.
 * Built on top of `sonner` (https://sonner.emilkowal.ski/)
 * Example:
 *   toast.success("Connected successfully!")
 *   toast.error("Something went wrong.")
 *   toast.info("Loading data...")
 */

export const toast = {
  success: (message: string, description?: string) =>
    sonner.success(message, {
      description,
      duration: 3000,
    }),

  error: (message: string, description?: string) =>
    sonner.error(message, {
      description,
      duration: 4000,
    }),

  info: (message: string, description?: string) =>
    sonner(message, {
      description,
      duration: 2500,
    }),

  warning: (message: string, description?: string) =>
    sonner.warning
      ? sonner.warning(message, { description, duration: 3000 })
      : sonner(message, { description, duration: 3000 }),

  custom: (message: string, options?: Parameters<typeof sonner>[1]) =>
    sonner(message, options),
}
