---
inclusion: fileMatch
fileMatchPattern: "projects/**/*.{ts,tsx,js,jsx}"
---

# TypeScript Standards

## Language

- All frontend code MUST be written in TypeScript (`.ts` / `.tsx` files)
- JavaScript files (`.js` / `.jsx`) are NOT permitted in application source code
- Use strict TypeScript configuration (`"strict": true` in tsconfig.json)
- Avoid `any` type — use `unknown` with type guards when the type is genuinely uncertain
- Prefer interfaces for object shapes and type aliases for unions/intersections

## Type Safety

- All function parameters and return types MUST be explicitly typed (no implicit `any`)
- Use discriminated unions for state management (e.g., loading/success/error states)
- Prefer `as const` assertions over enum where appropriate
- Use generic constraints to maintain type safety in reusable components

## React Specifics

- Use `React.FC` or explicit return types for components
- Props interfaces MUST be defined and exported for reusable components
- Use `React.ReactNode` for children props, not `React.ReactElement`
- Event handlers should use the correct React synthetic event types
