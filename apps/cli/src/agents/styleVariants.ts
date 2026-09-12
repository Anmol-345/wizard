// Style variants for the frontend generation system prompt.
// Each variant has a name, token block, and a concrete reference StatCard component.
// The runner picks one at invocation time (random or via --style flag).

export interface StyleVariant {
  name: string;
  tokens: string;
  reference: string;
}

const SLATE_PRO_TOKENS = `\
Background:      bg-slate-50 (light) — single solid color, no gradient
Surface:         bg-white border border-slate-200 rounded-lg shadow-sm
Text primary:    text-slate-900
Text secondary:  text-slate-500
Accent:          bg-blue-600 / text-blue-600 — ONE accent, solid fill, no glow, no gradient
Divider:         border-slate-100
Typography:      label = text-xs font-medium text-slate-500
                  value = text-2xl font-semibold text-slate-900 tabular-nums
Radius:          rounded-lg, 1px borders
Mood:            Linear/Vercel dashboard. Restrained, high information density, zero decoration.`;

const SLATE_PRO_REF = `\
\`\`\`tsx
// REFERENCE — imitate this structure exactly
import { motion } from "framer-motion";

function StatCard({ label, value, isLoading }: { label: string; value: string; isLoading: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm"
    >
      <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
      {isLoading ? (
        <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      )}
    </motion.div>
  );
}
// Primary action button:
// <motion.button whileTap={{ scale: 0.97 }} transition={{ ease: "easeOut" }} className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
\`\`\``;

const IVORY_EDITORIAL_TOKENS = `\
Background:      bg-[#FAFAF8] — warm off-white, solid
Surface:         bg-white border border-neutral-200 rounded-md
Text primary:    text-neutral-950
Text secondary:  text-neutral-400
Accent:          bg-amber-700 / text-amber-700 — used ONLY on the single primary CTA
Typography:      label = text-[11px] uppercase tracking-widest text-neutral-400
                  value = text-3xl font-medium text-neutral-950 tabular-nums
Radius:          rounded-md, generous whitespace (p-8, gap-8)
Mood:            Editorial / print-inspired. Almost monochrome. One warm accent, used sparingly.`;

const IVORY_EDITORIAL_REF = `\
\`\`\`tsx
// REFERENCE — imitate this structure exactly
import { motion } from "framer-motion";

function StatCard({ label, value, isLoading }: { label: string; value: string; isLoading: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="bg-white border border-neutral-200 rounded-md p-8"
    >
      <p className="text-[11px] uppercase tracking-widest text-neutral-400 mb-3">{label}</p>
      {isLoading ? (
        <div className="h-9 w-24 bg-neutral-100 rounded animate-pulse" />
      ) : (
        <p className="text-3xl font-medium text-neutral-950 tabular-nums">{value}</p>
      )}
    </motion.div>
  );
}
// Primary action button:
// <motion.button whileTap={{ scale: 0.97 }} transition={{ ease: "easeOut" }} className="inline-flex h-10 items-center justify-center rounded-md bg-amber-700 px-6 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
\`\`\``;

const GRAPHITE_MONO_TOKENS = `\
Background:      bg-[#101113] — solid charcoal, not pure black
Surface:         bg-[#18191c] border border-white/[0.08] rounded-lg
Text primary:    text-neutral-100
Text secondary:  text-neutral-500
Accent:          bg-sky-500 / text-sky-400 — solid fill, no glow/shadow effects
Typography:      label = font-mono text-[11px] uppercase tracking-wide text-neutral-500
                  value = font-mono text-2xl text-neutral-100 tabular-nums
Radius:          rounded-lg, 1px borders, no glow shadows anywhere
Mood:            Professional dark-mode dev tool (think GitHub dark, not CLI hacker aesthetic).`;

const GRAPHITE_MONO_REF = `\
\`\`\`tsx
// REFERENCE — imitate this structure exactly
import { motion } from "framer-motion";

function StatCard({ label, value, isLoading }: { label: string; value: string; isLoading: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-[#18191c] border border-white/[0.08] rounded-lg p-5"
    >
      <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-500 mb-2">{label}</p>
      {isLoading ? (
        <div className="h-7 w-20 bg-neutral-800 rounded animate-pulse" />
      ) : (
        <p className="font-mono text-2xl text-neutral-100 tabular-nums">{value}</p>
      )}
    </motion.div>
  );
}
// Primary action button:
// <motion.button whileTap={{ scale: 0.97 }} transition={{ ease: "easeOut" }} className="inline-flex h-9 items-center justify-center rounded-lg bg-sky-500 px-4 font-mono text-sm text-neutral-50 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
\`\`\``;

const NORDIC_CLEAN_TOKENS = `\
Background:      bg-[#F5F6F8] — solid cool gray
Surface:         bg-white border border-[#E4E7EC] rounded-xl
Text primary:    text-[#1A1D23]
Text secondary:  text-[#6B7280]
Accent:          bg-teal-700 / text-teal-700 — single accent, flat fill
Typography:      label = text-xs font-medium text-[#6B7280]
                  value = text-2xl font-semibold text-[#1A1D23] tabular-nums
Radius:          rounded-xl, no shadows except a single subtle shadow-sm on hover
Mood:            Quiet, confident, restrained. Feels designed, not templated.`;

const NORDIC_CLEAN_REF = `\
\`\`\`tsx
// REFERENCE — imitate this structure exactly
import { motion } from "framer-motion";

function StatCard({ label, value, isLoading }: { label: string; value: string; isLoading: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white border border-[#E4E7EC] rounded-xl p-6 hover:shadow-sm transition-shadow"
    >
      <p className="text-xs font-medium text-[#6B7280] mb-2">{label}</p>
      {isLoading ? (
        <div className="h-8 w-20 bg-[#F5F6F8] rounded-lg animate-pulse" />
      ) : (
        <p className="text-2xl font-semibold text-[#1A1D23] tabular-nums">{value}</p>
      )}
    </motion.div>
  );
}
// Primary action button:
// <motion.button whileTap={{ scale: 0.97 }} transition={{ ease: "easeOut" }} className="inline-flex h-10 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
\`\`\``;

export const STYLES: Record<string, StyleVariant> = {
  "slate-pro": {
    name: "Slate Pro",
    tokens: SLATE_PRO_TOKENS,
    reference: SLATE_PRO_REF,
  },
  "ivory-editorial": {
    name: "Ivory Editorial",
    tokens: IVORY_EDITORIAL_TOKENS,
    reference: IVORY_EDITORIAL_REF,
  },
  "graphite-mono": {
    name: "Graphite Mono",
    tokens: GRAPHITE_MONO_TOKENS,
    reference: GRAPHITE_MONO_REF,
  },
  "nordic-clean": {
    name: "Nordic Clean",
    tokens: NORDIC_CLEAN_TOKENS,
    reference: NORDIC_CLEAN_REF,
  },
};

export function buildSystemPrompt(baseTemplate: string, styleKey?: string): string {
  const keys = Object.keys(STYLES);
  const resolvedKey = styleKey && STYLES[styleKey]
    ? styleKey
    : keys[Math.floor(Math.random() * keys.length)];

  const style = STYLES[resolvedKey];

  return baseTemplate
    .replace("{{STYLE_NAME}}", style.name)
    .replace("{{STYLE_BLOCK}}", `${style.tokens}\n\n${style.reference}`);
}
