# Project Conventions

## Monorepo Structure

```
/
├── infrastructure/     # Terraform project (AWS resources)
├── projects/
│   └── shop/          # React frontend (shadcn/ui + Vite) — flat structure, no nested apps/packages
│       ├── src/
│       │   ├── components/ui/   # shadcn/ui components
│       │   ├── components/layout/  # layout components
│       │   ├── config/          # app configuration
│       │   ├── features/        # feature modules
│       │   ├── lib/             # utilities
│       │   ├── providers/       # React context providers
│       │   └── styles/          # global CSS
│       ├── components.json      # shadcn/ui config
│       ├── vite.config.ts
│       └── package.json
└── .kiro/             # Spec and steering files
```

## Shop Project Tech Stack

- **Language**: TypeScript (strict mode)
- **Framework**: React 19+
- **Build tool**: Vite
- **Component library**: shadcn/ui (Radix primitives)
- **Auth SDK**: AWS Amplify or AWS Cognito SDK
- **Styling**: Tailwind CSS (via shadcn/ui)

## Code Quality

- No `console.log` in production code — use a proper logging utility or remove before commit
- All components must be accessible (proper ARIA attributes, keyboard navigation)
- Prefer named exports over default exports for better refactoring support
- File naming: kebab-case for files (e.g., `login-screen.tsx`), PascalCase for components

## Error Handling

- Never swallow errors silently — always log or display them appropriately
- Use error boundaries for React component trees
- Authentication errors must provide user-friendly messages without leaking internals
