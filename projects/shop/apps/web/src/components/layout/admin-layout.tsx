import type { ReactNode } from "react"
import { useState } from "react"
import { Outlet } from "react-router"
import { Menu, X } from "lucide-react"
import { ProfileMenu } from "./profile-menu"
import { NavigationMenu } from "@/components/layout/navigation-menu"

export function AdminLayout(): ReactNode {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSidebarOpen(false)
          }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-background transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Sidebar navigation"
      >
        <div className="flex h-full flex-col">
          {/* Sidebar header */}
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <span className="text-sm font-semibold">Shop Admin</span>
            <button
              type="button"
              className="rounded-md p-1 hover:bg-accent lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation menu */}
          <nav
            className="flex-1 overflow-y-auto p-4"
            aria-label="Main navigation"
          >
            <NavigationMenu />
          </nav>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-4">
          {/* Mobile menu toggle */}
          <button
            type="button"
            className="rounded-md p-1 hover:bg-accent lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          <ProfileMenu />
        </header>

        {/* Content outlet */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
