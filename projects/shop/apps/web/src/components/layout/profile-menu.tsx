import type { ReactNode } from "react"
import { LogOut, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { useAuth } from "../../providers/auth-provider"

function getDisplayName(user: { email: string; name?: string }): string {
  if (user.name && user.name.trim().length > 0) {
    return user.name.trim()
  }
  return user.email
}

export function ProfileMenu(): ReactNode {
  const { state, signOut } = useAuth()
  const user = state.user

  if (!user) {
    return null
  }

  const displayName = getDisplayName(user)

  const handleLogout = (): void => {
    void signOut()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          aria-label="Open profile menu"
        >
          <User className="size-4" aria-hidden="true" />
          <span className="max-w-[150px] truncate">{displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Roles</DropdownMenuLabel>
        <DropdownMenuGroup>
          {user.groups.length > 0 ? (
            user.groups.map((group) => (
              <DropdownMenuItem key={group} disabled>
                {group}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No roles assigned</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="size-4" aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
