/**
 * data.js
 * -----------------------------------------------------------------------
 * Single source of truth for the Control Panel.
 * Add a new portal, document, or quick action by editing the arrays below.
 * Nothing else in the codebase needs to change for routine additions.
 * -----------------------------------------------------------------------
 */

// Category defines the accent color + label used across portal cards.
// Edit COLORS to retheme; edit CATEGORIES to relabel a grouping.
const CATEGORIES = {
  core:      { label: "Core",      color: "var(--cat-core)"      },
  knowledge: { label: "Knowledge", color: "var(--cat-knowledge)" },
  build:     { label: "Build",     color: "var(--cat-build)"     },
  prep:      { label: "Prep",      color: "var(--cat-prep)"      },
  ops:       { label: "Ops",       color: "var(--cat-ops)"       },
  personal:  { label: "Personal",  color: "var(--cat-personal)"  },
};

// path: folder the portal lives in, relative to this file (e.g. "titan/index.html").
// Adjust these if your folder names differ from the slug.
const PORTALS = [
  {
    id: "home",
    name: "Home",
    path: "index.html",
    category: "core",
    description: "This control panel.",
    icon: "home",
    shortcut: "H",
  },
  {
    id: "docs",
    name: "Docs",
    path: "docs/index.html",
    category: "knowledge",
    description: "Strategy, architecture, whitepapers, research, notes, roadmaps.",
    icon: "docs",
    shortcut: "D",
  },
  {
    id: "library",
    name: "Library",
    path: "library/index.html",
    category: "knowledge",
    description: "Books, papers, references, and personal PDFs.",
    icon: "library",
    shortcut: "L",
  },
  {
    id: "titan",
    name: "TITAN",
    path: "titan/index.html",
    category: "build",
    description: "Primary build system.",
    icon: "titan",
    shortcut: "T",
  },
  {
    id: "pretitan",
    name: "Pre-TITAN",
    path: "pretitan/index.html",
    category: "build",
    description: "Staging ground before promotion to TITAN.",
    icon: "pretitan",
    shortcut: "P",
  },
  {
    id: "interview",
    name: "Interview",
    path: "interview/index.html",
    category: "prep",
    description: "Interview prep and practice.",
    icon: "interview",
    shortcut: "I",
  },
  {
    id: "evaluator",
    name: "Evaluator",
    path: "evaluator/index.html",
    category: "build",
    description: "Scoring and evaluation harness.",
    icon: "evaluator",
    shortcut: "E",
  },
  {
    id: "meridian",
    name: "Meridian",
    path: "meridian/index.html",
    category: "ops",
    description: "Operations and tracking.",
    icon: "meridian",
    shortcut: "M",
  },
  {
    id: "boss",
    name: "Boss",
    path: "boss/index.html",
    category: "ops",
    description: "Admin and oversight tools.",
    icon: "boss",
    shortcut: "B",
  },
  {
    id: "music",
    name: "Music",
    path: "music/index.html",
    category: "personal",
    description: "Personal music tools and player.",
    icon: "music",
    shortcut: "U",
  },
];

// Library filters shown as quick chips inside the "open a document" flow.
const LIBRARY_FILTERS = ["My Documents", "Books", "Research Papers", "Reference"];

// Curated fallback shown in "Recent Documents" before you've opened anything
// yourself. Real usage overrides this automatically via localStorage.
// href should point at a real PDF or doc page relative to this file.
const DEFAULT_DOCUMENTS = [
  {
    id: "doc-roadmap",
    title: "2026 Roadmap",
    source: "Docs · Roadmaps",
    href: "docs/index.html",
    kind: "note",
  },
  {
    id: "doc-titan-arch",
    title: "TITAN Architecture Notes",
    source: "Docs · Architecture",
    href: "docs/index.html",
    kind: "note",
  },
  {
    id: "doc-whitepaper",
    title: "Evaluator Whitepaper",
    source: "Library · My Documents",
    href: "library/index.html",
    kind: "pdf",
  },
];

// Quick Actions rendered as buttons under the greeting.
// action: "navigate" jumps to a portal, "palette" opens the command palette.
const QUICK_ACTIONS = [
  { id: "qa-search",   label: "Find anything",  hint: "⌘K", action: "palette" },
  { id: "qa-library",  label: "Open Library",   hint: "L",  action: "navigate", target: "library" },
  { id: "qa-docs",     label: "New note",       hint: "D",  action: "navigate", target: "docs" },
  { id: "qa-titan",    label: "Go to TITAN",    hint: "T",  action: "navigate", target: "titan" },
];
