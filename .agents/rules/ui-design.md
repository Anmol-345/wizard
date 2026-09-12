# Web Application UI Design Guidelines

When generating or editing user interfaces in this project, **always** follow these design principles to ensure a clean, modern, and premium aesthetic.

## Core Aesthetic
- **No Gradients or Ambient Glows**: Avoid heavy radial background gradients, glowing borders, or `bg-gradient-to-r` text unless explicitly requested.
- **Glassmorphism (Subtle)**: Use subtle transparency and blurring (e.g. `bg-zinc-950/50 backdrop-blur`) instead of heavy opacity layers.
- **High Contrast**: Ensure text is readable with clear visual hierarchy (`text-zinc-900 dark:text-zinc-50` for primary, `text-zinc-500 dark:text-zinc-400` for secondary).

## Tailwind Preferences (Shadcn-like)
- Use standard `rounded-md` or `rounded-xl` for cards and buttons.
- Use `border border-zinc-200 dark:border-zinc-800` for clear component boundaries.
- **Light / Dark Mode**: Always include support for both light and dark modes using Tailwind's `dark:` variant.
  - Light mode baseline: `bg-white` or `bg-zinc-50`, `border-zinc-200`
  - Dark mode baseline: `dark:bg-zinc-950`, `dark:border-zinc-800`

## Components
- **Inputs**: `<input className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300" />`
- **Buttons**: `<button className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 shadow transition-colors hover:bg-zinc-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90" />`
