import type { ReactNode } from "react"
import { NavLink } from "react-router"
import { navigationItems } from "@/config/navigation"

export function NavigationMenu(): ReactNode {
  return (
    <ul className="flex flex-col gap-1" role="list">
      {navigationItems.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`
            }
            aria-current={undefined}
          >
            {({ isActive }) => (
              <>
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
                {isActive && <span className="sr-only">(current page)</span>}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
