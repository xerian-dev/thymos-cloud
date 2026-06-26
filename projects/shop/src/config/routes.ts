import { createElement } from "react"
import { createBrowserRouter, Navigate } from "react-router"
import { AuthGuard } from "@/components/auth-guard"
import { AdminLayout } from "@/components/layout/admin-layout"
import { LoginScreen } from "@/features/auth/login-screen"
import { InventoryPage } from "@/features/inventory/inventory-page"
import { HelpPage } from "@/features/help/help-page"

/**
 * Application route configuration.
 * Public routes: /login
 * Protected routes (require auth): /inventory, /help
 * Default redirect: / → /inventory
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginScreen,
  },
  {
    Component: AuthGuard,
    children: [
      {
        Component: AdminLayout,
        children: [
          {
            index: true,
            element: createElement(Navigate, {
              to: "/inventory",
              replace: true,
            }),
          },
          {
            path: "inventory",
            Component: InventoryPage,
          },
          {
            path: "help",
            Component: HelpPage,
          },
        ],
      },
    ],
  },
])
