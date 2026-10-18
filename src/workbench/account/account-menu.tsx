import { ChevronDownIcon, LogInIcon, UserIcon } from "lucide-react";
import { useState } from "react";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { m } from "@/paraglide/messages";
import type { Viewer } from "@/server/access";

import { Key } from "../ui/key";
import { useAccount, useWorkbench } from "../workbench-provider";
import { LoginDialog } from "./login-dialog";

/** How a viewer is named in the toolbar. */
export function viewerLabel(viewer: Viewer): string {
  return viewer.kind === "group"
    ? m.account_group({ number: viewer.group })
    : viewer.username;
}

/** Log in, or who is logged in with a menu to log out. */
export function AccountMenu() {
  const { account } = useWorkbench();
  const { viewer, known } = useAccount();
  const [loginOpen, setLoginOpen] = useState(false);

  // Don't flash "Log in" before the session check answers.
  if (!known) return null;

  if (!viewer)
    return (
      <>
        <Key tone="flat" onClick={() => setLoginOpen(true)}>
          <LogInIcon aria-hidden />
          {m.account_log_in()}
        </Key>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );

  return (
    <Menu>
      <MenuTrigger render={<Key tone="flat" />}>
        <UserIcon aria-hidden />
        {viewerLabel(viewer)}
        <ChevronDownIcon aria-hidden />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>
            {m.account_logged_in_as({ name: viewer.name })}
          </MenuGroupLabel>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem onClick={() => void account.signOut()}>
          {m.account_log_out()}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
